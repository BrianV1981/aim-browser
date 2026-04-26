import WebSocket from 'ws';

export class AimBrowser {
  constructor(options = {}) {
    this.options = {
      headless: true,
      port: 9222,
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

  async connect() {
    const { port, fetchImpl, WebSocketImpl } = this.options;
    if (!fetchImpl) throw new Error('No fetch implementation available');

    const metadataUrl = `http://127.0.0.1:${port}/json/version`;
    
    try {
      const response = await fetchImpl(metadataUrl);
      if (!response.ok) throw new Error(`Failed to fetch CDP metadata: ${response.statusText}`);
      
      const data = await response.json();
      const wsUrl = data.webSocketDebuggerUrl;
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
    } catch (error) {
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  _handleMessage(data) {
    const message = JSON.parse(data.toString());
    
    if (message.id && this._pendingCommands.has(message.id)) {
      const { resolve, reject } = this._pendingCommands.get(message.id);
      this._pendingCommands.delete(message.id);
      
      if (message.error) {
        reject(new Error(`CDP Error: ${message.error.message}`));
      } else {
        resolve(message.result);
      }
    } else if (message.method) {
      if (this._eventListeners.has(message.method)) {
        const listeners = this._eventListeners.get(message.method);
        listeners.forEach(callback => callback(message.params));
      }
    }
  }

  on(method, callback) {
    if (!this._eventListeners.has(method)) {
      this._eventListeners.set(method, []);
    }
    this._eventListeners.get(method).push(callback);
  }

  async send(method, params = {}) {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected. Call connect() first.');
    }
    const id = ++this._messageId;
    const payload = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this._pendingCommands.set(id, { resolve, reject });
      this.ws.send(payload, (err) => {
        if (err) {
          this._pendingCommands.delete(id);
          reject(err);
        }
      });
    });
  }

  // --- High Level Capabilities ---

  async evaluate(expression) {
    await this.send('Runtime.enable');
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Evaluation failed: ${res.exceptionDetails.exception.description}`);
    }
    return res.result.value;
  }

  async querySelector(selector) {
    await this.send('DOM.enable');
    const doc = await this.send('DOM.getDocument', { depth: 1 });
    const node = await this.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector
    });
    return node.nodeId !== 0 ? node.nodeId : null;
  }

  async click(selector) {
    const nodeId = await this.querySelector(selector);
    if (!nodeId) throw new Error(`Node not found for selector: ${selector}`);
    
    const { model } = await this.send('DOM.getBoxModel', { nodeId });
    // model.content is [x1,y1, x2,y2, x3,y3, x4,y4] representing the quad
    const width = model.content[2] - model.content[0];
    const height = model.content[5] - model.content[1];
    const x = model.content[0] + width / 2;
    const y = model.content[1] + height / 2;
    
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    // Small delay between press and release
    await new Promise(r => setTimeout(r, 50)); 
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async screenshot(format = 'png') {
    const res = await this.send('Page.captureScreenshot', { format });
    return res.data;
  }

  async close() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}
