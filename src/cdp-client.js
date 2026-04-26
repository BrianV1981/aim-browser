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
  }

  async connect() {
    const { port, fetchImpl, WebSocketImpl } = this.options;
    
    if (!fetchImpl) {
      throw new Error('No fetch implementation available');
    }

    const metadataUrl = `http://127.0.0.1:${port}/json/version`;
    
    try {
      const response = await fetchImpl(metadataUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch CDP metadata: ${response.statusText}`);
      }
      
      const data = await response.json();
      const wsUrl = data.webSocketDebuggerUrl;
      
      if (!wsUrl) {
        throw new Error('No webSocketDebuggerUrl found in metadata');
      }

      this.ws = new WebSocketImpl(wsUrl);
      
      return new Promise((resolve, reject) => {
        this.ws.on('open', () => {
          this.connected = true;
          resolve();
        });
        this.ws.on('error', (err) => {
          reject(err);
        });
      });
    } catch (error) {
      throw new Error(`Connection failed: ${error.message}`);
    }
  }
}
