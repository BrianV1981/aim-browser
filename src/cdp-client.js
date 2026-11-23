import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { checkLayoutHealth } from './site-maps.js';
import { appendTabTelemetry, readLeases, readTabTelemetry } from './tab-leases.js';

export function resolveDefaultDownloadDir(customDir) {
  const raw = String(customDir || process.env.AIM_BROWSER_DOWNLOAD_DIR || '').trim();
  return raw ? path.resolve(raw) : path.join(os.homedir(), 'Downloads', 'aim-browser');
}

export class AimBrowser {
  constructor(options = {}) {
    this.options = {
      // Connection defaults. Headed lifecycle is owned by src/daemon/start.sh
      // (persistent Chromium). This flag is reserved for future attach modes.
      headless: false,
      port: 9222,
      host: '127.0.0.1',
      fetchImpl: globalThis.fetch ? globalThis.fetch.bind(globalThis) : null,
      WebSocketImpl: WebSocket,
      stealFocus: true,
      lease: null,
      actor: null,
      session: null,
      downloadDir: null,
      autoConfigureDownloads: false,
      enableTelemetry: false,
      stateDir: null,
      onHudEvent: null,
      ...options,
    };
    this.connected = false;
    this.targetId = null;
    this.ws = null;
    this._messageId = 0;
    this._pendingCommands = new Map();
    this._eventListeners = new Map();
    
    this._executionContexts = new Map();
    this._activeContextId = null;
    this._networkRequests = new Map();
    this._telemetryListenersInstalled = false;
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

  async _httpText(pathUrl, init) {
    const url = `http://${this.options.host}:${this.options.port}${pathUrl}`;
    const res = await this.options.fetchImpl(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    if (typeof res.text === 'function') {
      return await res.text();
    }
    if (typeof res.json === 'function') {
      const data = await res.json();
      return typeof data === 'string' ? data : JSON.stringify(data);
    }
    return '';
  }

  async closeTab(id) {
    return await this._httpText(`/json/close/${id}`);
  }

  async _withBrowserSession(fn) {
    const temp = new AimBrowser({
      ...this.options,
      autoConfigureDownloads: false,
      enableTelemetry: false,
    });
    await temp.connect();
    try {
      return await fn(temp);
    } finally {
      await temp.close().catch(() => {});
    }
  }

  async openEphemeralTab(url = 'about:blank') {
    return await this._withBrowserSession(async (bSession) => {
      const ctxRes = await bSession.send('Target.createBrowserContext', { disposeOnDetach: false }, 10000);
      const browserContextId = ctxRes?.browserContextId;
      if (!browserContextId) throw new Error('Failed to create ephemeral browserContextId');
      const targetRes = await bSession.send('Target.createTarget', { url, browserContextId }, 10000);
      const targetId = targetRes?.targetId;
      if (!targetId) throw new Error('Failed to create target in ephemeral browserContext');
      return { id: targetId, url, title: '', browserContextId, ephemeral: true };
    });
  }

  async disposeEphemeralContext(browserContextId) {
    if (!browserContextId) return false;
    return await this._withBrowserSession(async (bSession) => {
      await bSession.send('Target.disposeBrowserContext', { browserContextId }, 10000);
      return true;
    });
  }

  _installTelemetryListeners() {
    if (this._telemetryListenersInstalled) return;
    this._telemetryListenersInstalled = true;
    const stateDir = this.options.stateDir || undefined;

    this.on('Runtime.consoleAPICalled', (params) => {
      if (!this.targetId || params?.type !== 'error') return;
      const text = (params.args || [])
        .map((a) => a?.value ?? a?.description ?? '')
        .filter(Boolean)
        .join(' ')
        .slice(0, 300);
      if (!text) return;
      appendTabTelemetry(
        this.targetId,
        { consoleErrors: [{ ts: Date.now(), source: 'console.error', text }] },
        stateDir
      );
    });

    this.on('Runtime.exceptionThrown', (params) => {
      if (!this.targetId) return;
      const details = params?.exceptionDetails || {};
      const text = String(
        details.exception?.description || details.text || 'Uncaught exception'
      ).slice(0, 300);
      appendTabTelemetry(
        this.targetId,
        {
          consoleErrors: [
            {
              ts: Date.now(),
              source: 'exception',
              text,
              url: details.url || '',
            },
          ],
        },
        stateDir
      );
    });

    this.on('Network.requestWillBeSent', (params) => {
      if (params?.requestId && params?.request) {
        this._networkRequests.set(params.requestId, {
          method: params.request.method || 'GET',
          url: params.request.url || '',
        });
        if (this._networkRequests.size > 200) {
          const firstKey = this._networkRequests.keys().next().value;
          this._networkRequests.delete(firstKey);
        }
      }
    });

    this.on('Network.responseReceived', (params) => {
      if (!this.targetId) return;
      const status = Number(params?.response?.status || 0);
      if (status < 400) return;
      const reqMeta = this._networkRequests.get(params?.requestId) || {};
      appendTabTelemetry(
        this.targetId,
        {
          failedRequests: [
            {
              ts: Date.now(),
              method: reqMeta.method || 'GET',
              url: String(params?.response?.url || reqMeta.url || '').slice(0, 240),
              status,
              statusText: String(params?.response?.statusText || '').slice(0, 80),
            },
          ],
        },
        stateDir
      );
    });

    this.on('Network.loadingFailed', (params) => {
      if (!this.targetId || params?.canceled) return;
      const reqMeta = this._networkRequests.get(params?.requestId) || {};
      appendTabTelemetry(
        this.targetId,
        {
          failedRequests: [
            {
              ts: Date.now(),
              method: reqMeta.method || 'GET',
              url: String(reqMeta.url || '').slice(0, 240),
              status: 0,
              errorText: String(params?.errorText || 'Network loading failed').slice(0, 120),
            },
          ],
        },
        stateDir
      );
    });

    this.on('Page.javascriptDialogOpening', (params) => {
      if (!this.targetId) return;
      appendTabTelemetry(
        this.targetId,
        {
          activeDialog: {
            type: params?.type || 'alert',
            message: String(params?.message || '').slice(0, 240),
            defaultPrompt: String(params?.defaultPrompt || '').slice(0, 120),
            ts: Date.now(),
          },
        },
        stateDir
      );
    });

    this.on('Page.javascriptDialogClosed', () => {
      if (!this.targetId) return;
      appendTabTelemetry(this.targetId, { activeDialog: null }, stateDir);
    });

    this.on('Target.targetCreated', (params) => {
      if (!this.targetId) return;
      const info = params?.targetInfo;
      if (info?.type === 'page' && info.openerId === this.targetId) {
        appendTabTelemetry(
          this.targetId,
          {
            childPopups: [
              {
                id: info.targetId,
                url: info.url || '',
                title: info.title || '',
                openerId: info.openerId,
                ts: Date.now(),
              },
            ],
          },
          stateDir
        );
      }
    });
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
      this.targetId = targetId;
    } else {
      const data = await this._httpJson('/json/version');
      wsUrl = data.webSocketDebuggerUrl;
      this.targetId = null;
    }

    if (!wsUrl) throw new Error('No webSocketDebuggerUrl found in metadata');

    this.ws = new WebSocketImpl(wsUrl);
    this.ws.on('message', (data) => this._handleMessage(data));
    if (this.options.enableTelemetry && targetId) {
      this._installTelemetryListeners();
    }

    return new Promise((resolve, reject) => {
      this.ws.on('open', async () => {
        this.connected = true;
        await this.send('Runtime.enable').catch(() => {});
        if (this.options.enableTelemetry && targetId) {
          await this.send('Page.enable', {}, 1500).catch(() => {});
          await this.send('Network.enable', {}, 1500).catch(() => {});
          await this.send('Target.setDiscoverTargets', { discover: true }, 1500).catch(() => {});
        }
        if (this.options.autoConfigureDownloads) {
          const dlDir = resolveDefaultDownloadDir(this.options.downloadDir);
          try {
            fs.mkdirSync(dlDir, { recursive: true });
          } catch {}
          await this.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir }, 1500).catch(() => {});
          await this.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir }, 1500).catch(() => {});
        }
        resolve();
      });
      this.ws.on('error', (err) => reject(err));
    });
  }

  _handleMessage(data) {
    const message = JSON.parse(data.toString());
    
    if (message.method === 'Runtime.executionContextCreated') {
      const ctx = message.params.context;
      if (ctx.auxData && ctx.auxData.frameId) {
        this._executionContexts.set(ctx.auxData.frameId, ctx.id);
      }
    } else if (message.method === 'Runtime.executionContextDestroyed') {
      for (const [frameId, ctxId] of this._executionContexts.entries()) {
        if (ctxId === message.params.executionContextId) this._executionContexts.delete(frameId);
      }
    } else if (message.method === 'Runtime.executionContextsCleared') {
      this._executionContexts.clear();
    }

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

  async useFrame(identifier) {
    if (identifier === 'main' || identifier === null || identifier === undefined) {
      this._activeContextId = null;
      return;
    }
    
    await this.send('Page.enable');
    const { frameTree } = await this.send('Page.getFrameTree');
    const frames = [];
    const traverse = (node) => {
      frames.push(node.frame);
      if (node.childFrames) node.childFrames.forEach(traverse);
    };
    traverse(frameTree);
    
    let frame;
    if (/^\d+$/.test(identifier)) {
      frame = frames[parseInt(identifier, 10)];
    } else {
      frame = frames.find(f => f.id === identifier || (f.name && f.name === identifier) || (f.url || '').includes(identifier));
    }
    
    if (!frame) throw new Error(`Frame ${identifier} not found`);
    
    const ctxId = this._executionContexts.get(frame.id);
    if (!ctxId) {
      throw new Error(`Execution context not ready for frame ${identifier}. Try waiting or evaluating logic first.`);
    }
    this._activeContextId = ctxId;
  }

  async evaluate(expression, returnByValue = true) {
    await this.send('Runtime.enable');
    const params = {
      expression,
      returnByValue,
      awaitPromise: true
    };
    if (this._activeContextId) params.contextId = this._activeContextId;

    const res = await this.send('Runtime.evaluate', params);
    if (res.exceptionDetails) throw new Error(`Evaluation failed: ${res.exceptionDetails.exception.description}`);
    return returnByValue ? res.result?.value : res.result;
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

  async _getElementCenter(expression) {
    const js = `(async () => {
      const el = await (${expression});
      if (!el) throw new Error('Could not find element object');
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`;
    return await this.evaluate(js, true);
  }

  async _maybeBringToFront() {
    if (this.options.stealFocus === false) return;
    await this.send('Page.bringToFront').catch(() => {});
  }

  _emitHud(action, label = '', x = null, y = null) {
    if (typeof this.options.onHudEvent !== 'function') return;
    try {
      this.options.onHudEvent({
        targetId: this.targetId || '',
        lease: this.options.lease || '',
        actor: this.options.actor || this.options.session || this.options.lease || 'agent',
        session: this.options.session || '',
        action,
        label,
        x,
        y,
      });
    } catch {
      /* never fail browser actuation on HUD telemetry */
    }
  }

  async click(selector) {
    const expr = `document.querySelector(${JSON.stringify(selector)})`;
    const center = await this._getElementCenter(expr);
    await this.tap(center.x, center.y, selector);
  }

  async tap(x, y, label = '') {
    this._emitHud('click', label || `(${x}, ${y})`, x, y);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }, 15000).catch(() => {});
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async tapElementIndex(index) {
    await this._maybeBringToFront();
    const center = await this._getElementCenter(`(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const selector = 'a,button,input,select,textarea,[role="button"],[onclick],[tabindex],[role="textbox"],[contenteditable="true"],[contenteditable=""],div[aria-label],div[role="textbox"],div[data-testid^="tweetTextarea_"]';
      const els = Array.from(document.querySelectorAll(selector)).filter(isVisible);
      return els[${index}];
    })()`);
    await this.tap(center.x, center.y, `element[${index}]`);
  }

  async typeText(index, text) {
    await this._maybeBringToFront();
    const center = await this._getElementCenter(`(() => {
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
      if (!el || !isTypeable(el)) throw new Error('Element not typeable');
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
      return el;
    })()`);
    this._emitHud('type', `element[${index}]`, center.x, center.y);
    await this.send('Input.insertText', { text });
  }

  async textbox(text) {
    await this._maybeBringToFront();
    const center = await this._getElementCenter(`(() => {
      const el = document.querySelector('div[data-testid="tweetTextarea_0"]') ||
                 document.querySelector('div[data-testid^="tweetTextarea_"]') ||
                 document.querySelector('div[role="textbox"][contenteditable="true"]') ||
                 document.querySelector('div[role="textbox"][contenteditable=""]');
      if (!el) throw new Error('no textbox found');
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.focus();
      el.textContent = '';
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return el;
    })()`);
  }

  async keyType(text) {
    await this._maybeBringToFront();
    for (const ch of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'char', text: ch });
    }
  }

  async keyPress(keyInfo) {
    await this._maybeBringToFront();
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

  async handleDialog({ accept = true, promptText } = {}) {
    await this.send('Page.enable', {}, 3000).catch(() => {});
    const params = { accept: Boolean(accept) };
    if (promptText !== undefined) params.promptText = String(promptText);
    await this.send('Page.handleJavaScriptDialog', params, 5000);
    if (this.targetId) {
      appendTabTelemetry(this.targetId, { activeDialog: null }, this.options.stateDir || undefined);
    }
  }

  async getSnapshot(opts = {}) {
    const stateDir = opts.stateDir || this.options.stateDir || undefined;
    const pageMeta = await this.evaluate(`(() => ({
      url: location.href,
      title: document.title || '',
    }))()`).catch(() => ({ url: '', title: '' }));
    const elements = await this.getElements().catch(() => []);
    const layout = await checkLayoutHealth(this).catch(() => null);
    const telemetry = readTabTelemetry(this.targetId, stateDir);
    const allTabs = await this.getTargets().catch(() => []);
    const liveIds = new Set(allTabs.map((t) => t.id));
    const openerPopups = allTabs
      .filter((t) => this.targetId && t.openerId === this.targetId)
      .map((t) => ({ id: t.id, url: t.url || '', title: t.title || '', openerId: t.openerId }));
    const mergedPopups = new Map();
    for (const p of [...telemetry.childPopups.filter((x) => liveIds.has(x.id)), ...openerPopups]) {
      if (p?.id) mergedPopups.set(p.id, p);
    }

    const leases = readLeases(stateDir);
    const leaseKey = this.options.lease || '';
    const leaseEntry = leaseKey && leases[leaseKey] ? leases[leaseKey] : null;

    return {
      url: pageMeta.url || '',
      title: pageMeta.title || '',
      targetId: this.targetId || '',
      lease: leaseKey,
      session: this.options.session || leaseEntry?.session || '',
      ephemeral: Boolean(leaseEntry?.ephemeral || leaseEntry?.browserContextId),
      waitingForHuman: leaseEntry?.waitingForHuman || null,
      elements,
      layout,
      consoleErrors: telemetry.consoleErrors,
      failedRequests: telemetry.failedRequests,
      activeDialog: telemetry.activeDialog,
      childPopups: Array.from(mergedPopups.values()),
    };
  }

  async screenshot({ format = 'png', fullpage = false } = {}) {
    await this._maybeBringToFront();
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
    await this._maybeBringToFront();
    await this.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }).catch(() => null);
    await this.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }).catch(() => null);
  }

  async uploadFile(selector, base64Data) {
    await this._maybeBringToFront();
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
    await this._maybeBringToFront();
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
    // Do not bringToFront when minimizing — that would pop the window back up.
    if (options?.windowState !== 'minimized') {
      await this.send('Page.bringToFront').catch(() => {});
    }
    const win = await this.send('Browser.getWindowForTarget').catch(() => null);
    const windowId = win?.windowId;
    if (windowId === undefined) throw new Error('Could not get windowId');
    await this.send('Browser.setWindowBounds', { windowId, bounds: options });
  }

  /**
   * Un-minimize and focus the browser window so Operator can watch agent work.
   * Safe no-op if the target has no window id.
   * @param {{ maximize?: boolean }} [opts]
   */
  async showWindow(opts = {}) {
    await this.send('Page.bringToFront').catch(() => {});
    const win = await this.send('Browser.getWindowForTarget').catch(() => null);
    const windowId = win?.windowId;
    if (windowId === undefined) return false;
    // normal first (clears minimized), optional maximize
    await this.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal' },
    }).catch(() => {});
    if (opts.maximize) {
      await this.send('Browser.setWindowBounds', {
        windowId,
        bounds: { windowState: 'maximized' },
      }).catch(() => {});
    }
    await this.send('Page.bringToFront').catch(() => {});
    return true;
  }

  /**
   * Minimize the browser window (CDP). Chrome often un-minimizes when a new tab
   * opens via Target.createTarget /json/new — call this again after navigation.
   * Does not bring the window to front first.
   */
  async minimizeWindow() {
    const win = await this.send('Browser.getWindowForTarget').catch(() => null);
    const windowId = win?.windowId;
    if (windowId === undefined) return false;
    await this.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'minimized' },
    }).catch(() => {});
    return true;
  }



  async blockMedia() {
    await this.send('Fetch.enable', {
      patterns: [
        { resourceType: 'Image', requestStage: 'Request' },
        { resourceType: 'Media', requestStage: 'Request' },
        { resourceType: 'Font', requestStage: 'Request' },
        { resourceType: 'Stylesheet', requestStage: 'Request' }
      ]
    });
    this.on('Fetch.requestPaused', async (params) => {
      await this.send('Fetch.failRequest', {
        requestId: params.requestId,
        errorReason: 'BlockedByClient'
      }).catch(() => {});
    });
  }

  async spyNetwork(pattern, callback) {
    await this.send('Network.enable');
    const regex = new RegExp(pattern);
    this.on('Network.responseReceived', async (params) => {
      if (regex.test(params.response.url)) {
        try {
          const res = await this.send('Network.getResponseBody', { requestId: params.requestId });
          callback(params.response.url, res.body);
        } catch (e) {}
      }
    });
  }

  async autoScroll(options = {}) {
    const { timeoutMs = 30000, delayMs = 600, distance = 1000 } = options;
    const deadline = Date.now() + timeoutMs;
    let lastHeight = 0;

    while (Date.now() < deadline) {
      const currentHeight = await this.evaluate('document.body.scrollHeight');
      await this.evaluate(`window.scrollBy(0, ${distance})`);
      await new Promise(r => setTimeout(r, delayMs));

      if (currentHeight === lastHeight) {
        await new Promise(r => setTimeout(r, delayMs * 2));
        const newHeight = await this.evaluate('document.body.scrollHeight');
        if (newHeight === lastHeight) break;
      }
      lastHeight = currentHeight;
    }
  }

  /**
   * Attempt a PerimeterX / HUMAN "Press & Hold" style captcha solve via native mouse events.
   * @param {{ preHoldMs?: number, holdMs?: number, afterMs?: number }} [options]
   *   Timing overrides (defaults match production human-entropy holds).
   */
  async solvePerimeterX(options = {}) {
    const preHoldMs = options.preHoldMs ?? 500;
    const holdMs = options.holdMs ?? 10000;
    const afterMs = options.afterMs ?? 8000;

    await this._maybeBringToFront();
    const pxCoords = await this.evaluate(`(() => {
      const pxContainer = document.querySelector('#px-captcha');
      if (pxContainer) {
         const r = pxContainer.getBoundingClientRect();
         return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }
      const allDivs = document.querySelectorAll('div, button, p');
      for (const el of allDivs) {
        if (el.innerText && el.innerText.includes('Press & Hold')) {
          const r = el.getBoundingClientRect();
          if (r.width > 10 && r.height > 10) {
             return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
          }
        }
      }
      return null;
    })()`);

    if (pxCoords) {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pxCoords.x, y: pxCoords.y, button: 'none' });
      await new Promise(r => setTimeout(r, preHoldMs));
      await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pxCoords.x, y: pxCoords.y, button: 'left', clickCount: 1 });
      await new Promise(r => setTimeout(r, holdMs));
      await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pxCoords.x, y: pxCoords.y, button: 'left', clickCount: 1 });
      await new Promise(r => setTimeout(r, afterMs));
      return true;
    }
    return false;
  }
}