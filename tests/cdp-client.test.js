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
    mockFetch = jest.fn().mockImplementation((url) => {
      if (url.includes('/json/version')) {
        return Promise.resolve({ ok: true, json: async () => ({ webSocketDebuggerUrl: mockWebSocketUrl }) });
      }
      if (url.includes('/json/list')) {
        return Promise.resolve({ ok: true, json: async () => ([{ type: 'page', id: 'tab1', webSocketDebuggerUrl: mockWebSocketUrl }]) });
      }
      if (url.includes('/json/new')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'newTab' }) });
      }
      if (url.includes('/json/close')) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    
    mockWsInstance = {
      on: jest.fn((event, cb) => {
        if (event === 'open') setTimeout(cb, 5);
        if (event === 'message') messageHandler = cb;
      }),
      send: jest.fn((payload, cb) => {
        const { id, method } = JSON.parse(payload);
        if (method === 'Runtime.enable') {
          setTimeout(() => messageHandler(JSON.stringify({ id, result: {} })), 1);
        }
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

  it('should get targets and open tabs', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    const targets = await browser.getTargets();
    expect(targets.length).toBe(1);
    expect(targets[0].id).toBe('tab1');
    
    const newTab = await browser.openTab('https://example.com');
    expect(newTab.id).toBe('newTab');
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
      const { id, method, params } = JSON.parse(payload);
      let result = {};
      if (method === 'Runtime.evaluate') result = { result: { objectId: 'obj1' } };
      else if (method === 'DOM.requestNode') result = { nodeId: 2 };
      else if (method === 'DOM.getBoxModel') result = { model: { content: [0, 0, 10, 0, 10, 10, 0, 10] } };
      
      setTimeout(() => messageHandler(JSON.stringify({ id, result })), 1);
    });

    await browser.click('#btn');
    
    const calls = mockWsInstance.send.mock.calls.map(c => JSON.parse(c[0]).method);
    expect(calls).toContain('Input.dispatchMouseEvent');
  });

  it('should capture a screenshot', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method } = JSON.parse(payload);
      let result = {};
      if (method === 'Page.captureScreenshot') result = { data: 'base64data' };
      if (method === 'Runtime.evaluate') result = { result: { value: 'complete' } };
      setTimeout(() => messageHandler(JSON.stringify({ id, result })), 1);
    });

    const data = await browser.screenshot();
    expect(data).toBe('base64data');
  });

  it('should configure media blocking', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method } = JSON.parse(payload);
      setTimeout(() => messageHandler(JSON.stringify({ id, result: {} })), 1);
    });

    await browser.blockMedia();
    
    // Simulate an incoming fetch request that should be paused and failed
    setTimeout(() => {
      messageHandler(JSON.stringify({
        method: 'Fetch.requestPaused',
        params: { requestId: 'req1' }
      }));
    }, 10);

    await new Promise(r => setTimeout(r, 20));

    const calls = mockWsInstance.send.mock.calls.map(c => JSON.parse(c[0]).method);
    expect(calls).toContain('Fetch.enable');
    expect(calls).toContain('Fetch.failRequest');
  });

  it('should set up network spying', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method } = JSON.parse(payload);
      if (method === 'Network.getResponseBody') {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: { body: '{"spy":"data"}' } })), 1);
      } else {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: {} })), 1);
      }
    });

    const spyCb = jest.fn();
    await browser.spyNetwork('.*api.*', spyCb);

    // Simulate an incoming response event
    setTimeout(() => {
      messageHandler(JSON.stringify({
        method: 'Network.responseReceived',
        params: { requestId: 'req2', response: { url: 'https://example.com/api/data' } }
      }));
    }, 10);

    await new Promise(r => setTimeout(r, 20));
    expect(spyCb).toHaveBeenCalledWith('https://example.com/api/data', '{"spy":"data"}');
  });

  it('should resolve frame contexts', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method } = JSON.parse(payload);
      if (method === 'Page.getFrameTree') {
        setTimeout(() => messageHandler(JSON.stringify({ 
          id, result: { frameTree: { frame: { id: 'main' }, childFrames: [{ frame: { id: 'f1', name: 'iframe1' } }] } } 
        })), 1);
      } else {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: {} })), 1);
      }
    });

    // Simulate an execution context for the iframe
    setTimeout(() => {
      messageHandler(JSON.stringify({
        method: 'Runtime.executionContextCreated',
        params: { context: { id: 42, auxData: { frameId: 'f1' } } }
      }));
    }, 5);

    await new Promise(r => setTimeout(r, 10));

    await browser.useFrame('iframe1');
    expect(browser._activeContextId).toBe(42);
    
    await browser.useFrame('main');
    expect(browser._activeContextId).toBe(null);
  });

  it('should autoScroll', async () => {
    const browser = new AimBrowser({ fetchImpl: mockFetch, WebSocketImpl: MockWebSocket });
    await browser.connect();

    let height = 1000;
    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method, params } = JSON.parse(payload);
      if (method === 'Runtime.evaluate' && params.expression.includes('scrollHeight')) {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: { result: { value: height } } })), 1);
      } else if (method === 'Runtime.evaluate' && params.expression.includes('scrollBy')) {
        height += 500; // Simulate page growing
        setTimeout(() => messageHandler(JSON.stringify({ id, result: { result: { value: undefined } } })), 1);
      } else {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: {} })), 1);
      }
    });

    // Limit the timeout/delays heavily for the test
    await browser.autoScroll({ timeoutMs: 50, delayMs: 5, distance: 500 });
    
    // As long as it doesn't throw and iterates, we're good
    const calls = mockWsInstance.send.mock.calls.map(c => JSON.parse(c[0]).method);
    expect(calls).toContain('Runtime.evaluate');
  });
});