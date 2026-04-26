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
      // Event handling
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

    this._messageId += 1;
    const id = this._messageId;
    
    const payload = JSON.stringify({
      id,
      method,
      params
    });

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

  async close() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}
