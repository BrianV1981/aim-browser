import WebSocket from 'ws';

export class AimBrowser {
  constructor(options = {}) {
    this.options = {
      headless: true,
      port: 9222,
      host: '127.0.0.1',
      fetchImpl: globalThis.fetch ? globalThis.fetch.bind(globalThis) : null,
      WebSocketImpl: WebSocket,
      ...options,
    };
    this.connected = false;
    this.ws = null;
    this._messageId = 0;
    this._pendingCommands = new Map();
    this._eventListeners = new Map();
  }

  async _httpJson(path, init) {
    const url = `http://${this.options.host}:${this.options.port}${path}`;
    const res = await this.options.fetchImpl(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  }

  async getTargets() {
    const list = await this._httpJson('/json/list');
    return list.filter(t => t.type === 'page');
  }

  async openTab(url) {
    try {
      return await this._httpJson(`/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    } catch (e) {
      return await this._httpJson(`/json/new?${encodeURIComponent(url)}`);
    }
  }

  async closeTab(id) {
    return await this._httpJson(`/json/close/${id}`);
  }

  async connect(targetId) {
    const { fetchImpl, WebSocketImpl } = this.options;
    if (!fetchImpl) throw new Error('No fetch implementation available');

    let wsUrl;
    if (targetId) {
      const tabs = await this.getTargets();
      const tab = tabs.find(t => t.id === targetId);
      if (!tab) throw new Error(`Tab ${targetId} not found`);
      wsUrl = tab.webSocketDebuggerUrl;
    } else {
      const data = await this._httpJson('/json/version');
      wsUrl = data.webSocketDebuggerUrl;
    }

    if (!wsUrl) throw new Error('No webSocketDebuggerUrl found in metadata');

    this.ws = new WebSocketImpl(wsUrl);
    this.ws.on('message', (data) => this._handleMessage(data));

    return new Promise((resolve, reject) => {
      this.ws.on('open', () => {
        this.connected = true;
        resolve();
      });
      this.ws.on('error', (err) => reject(err));
    });
  }

  _handleMessage(data) {
    const message = JSON.parse(data.toString());
    
    if (message.id && this._pendingCommands.has(message.id)) {
      const { resolve, reject } = this._pendingCommands.get(message.id);
      this._pendingCommands.delete(message.id);
      
      if (message.error) reject(new Error(`CDP Error: ${message.error.message}`));
      else resolve(message.result);
    } else if (message.method && this._eventListeners.has(message.method)) {
      const listeners = this._eventListeners.get(message.method);
      listeners.forEach(cb => cb(message.params));
    }
  }

  on(method, callback) {
    if (!this._eventListeners.has(method)) this._eventListeners.set(method, []);
    this._eventListeners.get(method).push(callback);
  }

  async send(method, params = {}, timeoutMs = 45000) {
    if (!this.connected || !this.ws) throw new Error('Not connected. Call connect() first.');
    const id = ++this._messageId;
    const payload = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      let timer;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this._pendingCommands.delete(id);
          reject(new Error(`Timeout waiting for ${method} (${timeoutMs}ms)`));
        }, timeoutMs);
        timer.unref?.();
      }
      this._pendingCommands.set(id, {
        resolve: (res) => { clearTimeout(timer); resolve(res); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });
      this.ws.send(payload, (err) => {
        if (err) {
          clearTimeout(timer);
          this._pendingCommands.delete(id);
          reject(err);
        }
      });
    });
  }

  async close() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }

  async evaluate(expression) {
    await this.send('Runtime.enable');
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) throw new Error(`Evaluation failed: ${res.exceptionDetails.exception.description}`);
    return res.result?.value;
  }

  async waitReady(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.evaluate('document.readyState');
      if (state === 'complete') return;
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`Timeout waiting for document.readyState=complete (${timeoutMs}ms)`);
  }

  async querySelector(selector) {
    await this.send('DOM.enable');
    const doc = await this.send('DOM.getDocument', { depth: 1 });
    const node = await this.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
    return node.nodeId !== 0 ? node.nodeId : null;
  }

  async click(selector) {
    const nodeId = await this.querySelector(selector);
    if (!nodeId) throw new Error(`Node not found for selector: ${selector}`);
    const { model } = await this.send('DOM.getBoxModel', { nodeId });
    const w = model.content[2] - model.content[0];
    const h = model.content[5] - model.content[1];
    const x = model.content[0] + w / 2;
    const y = model.content[1] + h / 2;
    await this.tap(x, y);
  }

  async tap(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }, 15000).catch(() => {});
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async tapElementIndex(index) {
    await this.send('Page.bringToFront').catch(() => {});
    const info = await this.evaluate(`(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const selector = 'a,button,input,select,textarea,[role="button"],[onclick],[tabindex],[role="textbox"],[contenteditable="true"],[contenteditable=""],div[aria-label],div[role="textbox"],div[data-testid^="tweetTextarea_"]';
      const els = Array.from(document.querySelectorAll(selector)).filter(isVisible);
      const el = els[${index}];
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!info) throw new Error(`element index ${index} not found`);
    await this.tap(info.x, info.y);
  }

  async typeText(index, text) {
    await this.send('Page.bringToFront').catch(() => {});
    const ok = await this.evaluate(`(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const isTypeable = (node) => {
        const tag = node.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return true;
        if (node.getAttribute('contenteditable') === 'true' || node.getAttribute('contenteditable') === '') return true;
        if (node.getAttribute('role') === 'textbox') return true;
        const dt = node.getAttribute('data-testid') || '';
        if (dt.startsWith('tweetTextarea_')) return true;
        return false;
      };
      const selector = 'a,button,input,select,textarea,[role="button"],[onclick],[tabindex],[role="textbox"],[contenteditable="true"],[contenteditable=""],div[aria-label],div[role="textbox"],div[data-testid^="tweetTextarea_"]';
      const els = Array.from(document.querySelectorAll(selector)).filter(isVisible);
      const el = els[${index}];
      if (!el || !isTypeable(el)) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.focus();
      if ('value' in el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.textContent = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    })()`);
    if (!ok) throw new Error(`typeable element index ${index} not found`);
    await this.send('Input.insertText', { text });
  }

  async textbox(text) {
    await this.send('Page.bringToFront').catch(() => {});
    const res = await this.evaluate(`((text) => {
      const el = document.querySelector('div[data-testid="tweetTextarea_0"]') ||
                 document.querySelector('div[data-testid^="tweetTextarea_"]') ||
                 document.querySelector('div[role="textbox"][contenteditable="true"]') ||
                 document.querySelector('div[role="textbox"][contenteditable=""]');
      if (!el) return { ok: false, reason: 'no textbox found' };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.focus();
      el.textContent = '';
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true, value: (el.innerText || el.textContent || '').trim().slice(0, 120) };
    })(${JSON.stringify(text)})`);
    if (!res?.ok) throw new Error(res?.reason || 'textbox failed');
  }

  async keyType(text) {
    await this.send('Page.bringToFront').catch(() => {});
    for (const ch of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'char', text: ch });
    }
  }

  async keyPress(keyInfo) {
    await this.send('Page.bringToFront').catch(() => {});
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyInfo });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyInfo });
  }

  async getElements() {
    return await this.evaluate(`(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const isTypeable = (el) => {
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return true;
        if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') return true;
        if (el.getAttribute('role') === 'textbox') return true;
        const dt = el.getAttribute('data-testid') || '';
        if (dt.startsWith('tweetTextarea_')) return true;
        return false;
      };
      const selector = 'a,button,input,select,textarea,[role="button"],[onclick],[tabindex],[role="textbox"],[contenteditable="true"],[contenteditable=""],div[aria-label],div[role="textbox"],div[data-testid^="tweetTextarea_"]';
      const els = Array.from(document.querySelectorAll(selector)).filter(isVisible).slice(0, 300);
      return els.map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
          index: i,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          dataTestId: el.getAttribute('data-testid') || '',
          typeable: isTypeable(el),
          text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 120),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2)
        };
      });
    })()`);
  }

  async screenshot({ format = 'png', fullpage = false } = {}) {
    await this.send('Page.bringToFront').catch(() => {});
    await this.waitReady(45000).catch(() => {});
    await new Promise(r => setTimeout(r, 800));

    if (fullpage) {
      const metrics = await this.send('Page.getLayoutMetrics', {}, 30000);
      const w = Math.max(1, Math.ceil(metrics.contentSize?.width || 1366));
      const h = Math.max(1, Math.ceil(metrics.contentSize?.height || 768));
      await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, 30000);
    }
    const cap = await this.send('Page.captureScreenshot', { format, fromSurface: true }, 90000);
    if (fullpage) await this.send('Emulation.clearDeviceMetricsOverride', {}, 15000);
    return cap.data;
  }

  async getAccessibilityTree() {
    await this.send('Accessibility.enable').catch(() => {});
    const tree = await this.send('Accessibility.getFullAXTree').catch(() => null);
    const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
    const lines = [];
    for (const n of nodes) {
      const name = n?.name?.value;
      if (typeof name === 'string' && name.trim()) lines.push(name.trim());
      if (lines.length >= 1200) break;
    }
    return lines.join('\n').trim();
  }

  async setDownloadPath(dir) {
    await this.send('Page.bringToFront').catch(() => {});
    await this.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }).catch(() => null);
    await this.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }).catch(() => null);
  }

  async uploadFile(selector, base64Data) {
    await this.send('Page.bringToFront').catch(() => {});
    const ok = await this.evaluate(`(() => {
      const css = ${JSON.stringify(selector)};
      const b64 = ${JSON.stringify(base64Data)};
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const el = document.querySelector(css);
      if (!el) return 'no element';
      if (el.tagName.toLowerCase() !== 'input' || el.type !== 'file') return 'not file input';
      const file = new File([bytes], 'upload.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()`);
    if (ok !== 'ok') throw new Error(`upload failed: ${ok}`);
  }

  async saveImage(outPath) {
    await this.send('Page.bringToFront').catch(() => {});
    return await this.evaluate(`(async () => {
      const pickImg = () => {
        const imgs = Array.from(document.querySelectorAll('img'));
        imgs.sort((a,b) => (b.naturalWidth*b.naturalHeight) - (a.naturalWidth*a.naturalHeight));
        return imgs[0];
      };
      const img = pickImg();
      if (!img) return { ok: false, reason: 'no img found' };
      const src = img.currentSrc || img.src || '';
      if (!src) return { ok: false, reason: 'img has no src' };
      if (src.startsWith('data:image/')) {
        const b64 = src.split(',')[1] || '';
        return { ok: true, type: 'data', b64 };
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { ok: false, reason: 'no canvas ctx' };
      ctx.drawImage(img, 0, 0);
      const b64 = (canvas.toDataURL('image/png').split(',')[1] || '');
      return { ok: true, type: 'canvas', b64 };
    })()`);
  }

  async setWindowBounds(options) {
    await this.send('Page.bringToFront').catch(() => {});
    const win = await this.send('Browser.getWindowForTarget').catch(() => null);
    const windowId = win?.windowId;
    if (windowId === undefined) throw new Error('Could not get windowId');
    await this.send('Browser.setWindowBounds', { windowId, bounds: options });
  }
}