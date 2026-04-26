import { jest } from '@jest/globals';
import { AimBrowser } from '../src/cdp-client.js';

describe('AimBrowser Core Engine', () => {
  let mockFetch;
  let mockWsInstance;
  let MockWebSocket;
  let mockWebSocketUrl;

  beforeEach(() => {
    mockWebSocketUrl = 'ws://127.0.0.1:9222/devtools/browser/1234';
    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ webSocketDebuggerUrl: mockWebSocketUrl })
    });
    mockWsInstance = {
      on: jest.fn((event, cb) => {
        if (event === 'open') setTimeout(cb, 5);
      }),
      send: jest.fn(),
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

  it('should send a CDP command and await response', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    
    let messageHandler;
    mockWsInstance.on = jest.fn((event, cb) => {
      if (event === 'open') setTimeout(cb, 5);
      if (event === 'message') messageHandler = cb;
    });

    await browser.connect();

    const sendPromise = browser.send('Page.navigate', { url: 'https://example.com' });
    
    expect(mockWsInstance.send).toHaveBeenCalled();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    
    setTimeout(() => {
      messageHandler(JSON.stringify({ id: sentData.id, result: { frameId: '123' } }));
    }, 5);

    const result = await sendPromise;
    expect(result.frameId).toBe('123');
  });

  it('should handle CDP errors', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    
    let messageHandler;
    mockWsInstance.on = jest.fn((event, cb) => {
      if (event === 'open') setTimeout(cb, 5);
      if (event === 'message') messageHandler = cb;
    });

    await browser.connect();

    const sendPromise = browser.send('Page.navigate', { url: 'invalid' });
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    
    setTimeout(() => {
      messageHandler(JSON.stringify({ 
        id: sentData.id, 
        error: { message: 'Invalid URL' } 
      }));
    }, 5);

    await expect(sendPromise).rejects.toThrow('CDP Error: Invalid URL');
  });

  it('should allow listening to CDP events', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    
    let messageHandler;
    mockWsInstance.on = jest.fn((event, cb) => {
      if (event === 'open') setTimeout(cb, 5);
      if (event === 'message') messageHandler = cb;
    });

    await browser.connect();

    const eventSpy = jest.fn();
    browser.on('Page.loadEventFired', eventSpy);

    messageHandler(JSON.stringify({ 
      method: 'Page.loadEventFired',
      params: { timestamp: 12345 } 
    }));

    expect(eventSpy).toHaveBeenCalledWith({ timestamp: 12345 });
  });
});
