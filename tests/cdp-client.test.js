import { jest } from '@jest/globals';
import { AimBrowser } from '../src/cdp-client.js';

describe('AimBrowser Core Engine', () => {
  let mockFetch;
  let mockWsInstance;
  let MockWebSocket;
  let mockWebSocketUrl;
  let messageHandler;

  beforeEach(() => {
    mockWebSocketUrl = 'ws://127.0.0.1:9222/devtools/browser/1234';
    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ webSocketDebuggerUrl: mockWebSocketUrl })
    });
    mockWsInstance = {
      on: jest.fn((event, cb) => {
        if (event === 'open') setTimeout(cb, 5);
        if (event === 'message') messageHandler = cb;
      }),
      send: jest.fn((payload, cb) => {
        if (cb) cb();
      }),
      close: jest.fn()
    };
    MockWebSocket = jest.fn(() => mockWsInstance);
  });

  it('should initialize with default options', () => {
    const browser = new AimBrowser();
    expect(browser.options.headless).toBe(true);
  });

  it('should connect to the browser via CDP', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    await browser.connect();
    expect(browser.connected).toBe(true);
  });

  it('should evaluate javascript on the page', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method } = JSON.parse(payload);
      let result = {};
      if (method === 'Runtime.evaluate') result = { result: { value: 'Test Title' } };
      setTimeout(() => messageHandler(JSON.stringify({ id, result })), 1);
    });

    const result = await browser.evaluate('document.title');
    expect(result).toBe('Test Title');
  });

  it('should click an element based on selector', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method } = JSON.parse(payload);
      let result = {};
      if (method === 'DOM.getDocument') result = { root: { nodeId: 1 } };
      else if (method === 'DOM.querySelector') result = { nodeId: 2 };
      else if (method === 'DOM.getBoxModel') result = { model: { content: [0, 0, 10, 0, 10, 10, 0, 10] } };
      
      setTimeout(() => messageHandler(JSON.stringify({ id, result })), 1);
    });

    await browser.click('#btn');
    
    expect(mockWsInstance.send).toHaveBeenCalledTimes(6);
    const calls = mockWsInstance.send.mock.calls.map(c => JSON.parse(c[0]).method);
    expect(calls).toEqual([
      'DOM.enable', 'DOM.getDocument', 'DOM.querySelector', 
      'DOM.getBoxModel', 'Input.dispatchMouseEvent', 'Input.dispatchMouseEvent'
    ]);
  });

  it('should capture a screenshot', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id } = JSON.parse(payload);
      setTimeout(() => messageHandler(JSON.stringify({ id, result: { data: 'base64data' } })), 1);
    });

    const data = await browser.screenshot();
    expect(data).toBe('base64data');
  });
});
