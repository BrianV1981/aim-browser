import { jest } from '@jest/globals';
import { AimBrowser } from '../src/cdp-client.js';

describe('AimBrowser Core Engine', () => {
  let mockFetch;
  let mockWsInstance;
  let MockWebSocket;
  let mockWebSocketUrl;
  let messageHandler;
  /** @type {AimBrowser[]} */
  const openBrowsers = [];

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

  afterEach(async () => {
    while (openBrowsers.length) {
      const b = openBrowsers.pop();
      try {
        await b.close();
      } catch {
        /* ignore */
      }
    }
  });

  function makeBrowser(opts = {}) {
    const browser = new AimBrowser({
      fetchImpl: mockFetch,
      WebSocketImpl: MockWebSocket,
      ...opts,
    });
    openBrowsers.push(browser);
    return browser;
  }

  it('should initialize with default options', () => {
    const browser = new AimBrowser();
    expect(browser.options.headless).toBe(false);
    expect(browser.options.host).toBe('127.0.0.1');
    expect(browser.options.port).toBe(9222);
  });

  it('should connect to the browser via CDP', async () => {
    const browser = makeBrowser();
    await browser.connect();
    expect(browser.connected).toBe(true);
  });

  it('should get targets and open tabs', async () => {
    const browser = makeBrowser();
    const targets = await browser.getTargets();
    expect(targets.length).toBe(1);
    expect(targets[0].id).toBe('tab1');

    const newTab = await browser.openTab('https://example.com');
    expect(newTab.id).toBe('newTab');
  });

  it('should evaluate javascript on the page', async () => {
    const browser = makeBrowser();
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
    const browser = makeBrowser();
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method } = JSON.parse(payload);
      let result = {};
      if (method === 'Runtime.evaluate') result = { result: { value: { x: 10, y: 10 } } };
      setTimeout(() => messageHandler(JSON.stringify({ id, result })), 1);
    });

    await browser.click('#btn');

    const calls = mockWsInstance.send.mock.calls.map(c => JSON.parse(c[0]).method);
    expect(calls).toContain('Input.dispatchMouseEvent');
  });

  it('should capture a screenshot', async () => {
    const browser = makeBrowser();
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
    const browser = makeBrowser();
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id } = JSON.parse(payload);
      setTimeout(() => messageHandler(JSON.stringify({ id, result: {} })), 1);
    });

    await browser.blockMedia();

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
    const browser = makeBrowser();
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
    const browser = makeBrowser();
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
    const browser = makeBrowser();
    await browser.connect();

    let height = 1000;
    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method, params } = JSON.parse(payload);
      if (method === 'Runtime.evaluate' && params.expression.includes('scrollHeight')) {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: { result: { value: height } } })), 1);
      } else if (method === 'Runtime.evaluate' && params.expression.includes('scrollBy')) {
        height += 500;
        setTimeout(() => messageHandler(JSON.stringify({ id, result: { result: { value: undefined } } })), 1);
      } else {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: {} })), 1);
      }
    });

    await browser.autoScroll({ timeoutMs: 50, delayMs: 5, distance: 500 });

    const calls = mockWsInstance.send.mock.calls.map(c => JSON.parse(c[0]).method);
    expect(calls).toContain('Runtime.evaluate');
  });

  it('should attempt to solve PerimeterX if present', async () => {
    const browser = makeBrowser();
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method } = JSON.parse(payload);
      if (method === 'Runtime.evaluate') {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: { result: { value: { x: 500, y: 500 } } } })), 1);
      } else {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: {} })), 1);
      }
    });

    // Use accelerated timings so unit tests do not sleep 18s of production holds.
    const solved = await browser.solvePerimeterX({
      preHoldMs: 1,
      holdMs: 1,
      afterMs: 1,
    });
    expect(solved).toBe(true);

    const calls = mockWsInstance.send.mock.calls.map(c => JSON.parse(c[0]).method);
    expect(calls).toContain('Input.dispatchMouseEvent');
  });

  it('should return false when PerimeterX UI is absent', async () => {
    const browser = makeBrowser();
    await browser.connect();

    mockWsInstance.send.mockImplementation((payload) => {
      const { id, method } = JSON.parse(payload);
      if (method === 'Runtime.evaluate') {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: { result: { value: null } } })), 1);
      } else {
        setTimeout(() => messageHandler(JSON.stringify({ id, result: {} })), 1);
      }
    });

    const solved = await browser.solvePerimeterX({ preHoldMs: 1, holdMs: 1, afterMs: 1 });
    expect(solved).toBe(false);
  });
});
