import { jest } from '@jest/globals';
import { AimBrowser } from '../src/cdp-client.js';

describe('AimBrowser Core Engine', () => {
  it('should initialize with default options', () => {
    const browser = new AimBrowser();
    expect(browser.options.headless).toBe(true);
    expect(browser.options.port).toBe(9222);
  });

  it('should connect to the browser via CDP', async () => {
    const mockWebSocketUrl = 'ws://127.0.0.1:9222/devtools/browser/1234';
    
    // Mock fetch to return the debugger URL
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ webSocketDebuggerUrl: mockWebSocketUrl })
    });

    // Mock WebSocket class
    const mockWsInstance = {
      on: jest.fn((event, cb) => {
        if (event === 'open') setTimeout(cb, 10);
      }),
      send: jest.fn(),
      close: jest.fn()
    };
    const MockWebSocket = jest.fn(() => mockWsInstance);

    const browser = new AimBrowser({
      port: 9222,
      fetchImpl: mockFetch,
      WebSocketImpl: MockWebSocket
    });

    await browser.connect();

    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:9222/json/version');
    expect(MockWebSocket).toHaveBeenCalledWith(mockWebSocketUrl);
    expect(browser.ws).toBe(mockWsInstance);
    expect(browser.connected).toBe(true);
  });

  it('should throw an error if fetch fails', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' });
    const browser = new AimBrowser({ fetchImpl: mockFetch });
    
    await expect(browser.connect()).rejects.toThrow('Failed to fetch CDP metadata: Not Found');
  });
});
