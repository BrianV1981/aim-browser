import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import {
  AimBrowser,
  acquireTabLease,
  clearHumanHandoff,
  readLeases,
  readTabTelemetry,
  releaseTabLease,
  requestHumanHandoff,
} from '../src/index.js';

describe('Issue #15: v2 Agentic Snapshot Telemetry, --request-human Handoff & --ephemeral Contexts', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-browser-issue15-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('captures console errors, 4xx/5xx network responses, dialogs, and child popups in getSnapshot()', async () => {
    let messageHandler;
    const liveTargets = [
      { id: 'tab-spa', type: 'page', url: 'https://app.example.com', title: 'SPA', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/tab-spa' },
    ];
    const mockFetch = jest.fn(async (url) => {
      if (url.includes('/json/list')) {
        return { ok: true, json: async () => [...liveTargets] };
      }
      return { ok: false, status: 404 };
    });

    const mockWs = {
      on: jest.fn((ev, cb) => {
        if (ev === 'open') setTimeout(cb, 2);
        if (ev === 'message') messageHandler = cb;
      }),
      send: jest.fn((payload, cb) => {
        const { id, method, params } = JSON.parse(payload);
        let result = {};
        if (method === 'Runtime.evaluate') {
          if (params.expression.includes('location.href')) {
            result = { result: { value: { url: 'https://app.example.com/checkout', title: 'Checkout' } } };
          } else if (params.expression.includes('scrollWidth')) {
            result = {
              result: {
                value: {
                  ok: true,
                  viewportWidth: 1280,
                  viewportHeight: 800,
                  scrollWidth: 1280,
                  horizontalOverflow: false,
                  offscreenInteractiveCount: 0,
                  offscreenSamples: [],
                },
              },
            };
          } else {
            result = {
              result: {
                value: [{ index: 0, tag: 'button', role: '', dataTestId: 'pay', typeable: false, text: 'Pay Now', x: 240, y: 320 }],
              },
            };
          }
        }
        setTimeout(() => messageHandler(JSON.stringify({ id, result })), 1);
        if (cb) cb();
      }),
      close: jest.fn(),
    };

    const browser = new AimBrowser({
      fetchImpl: mockFetch,
      WebSocketImpl: jest.fn(() => mockWs),
      stealFocus: false,
      lease: 'checkout-bot',
      session: 'aim-connect',
      enableTelemetry: true,
      stateDir: tmpDir,
    });

    await acquireTabLease(
      { getTargets: async () => liveTargets, openTab: async () => liveTargets[0] },
      'checkout-bot',
      { stateDir: tmpDir, session: 'aim-connect' }
    );
    // Bind checkout-bot directly to tab-spa
    await acquireTabLease(
      { getTargets: async () => liveTargets, openTab: async () => liveTargets[0] },
      'tab-spa',
      { stateDir: tmpDir }
    );

    await browser.connect('tab-spa');

    // Emit runtime exception, 500 API failure, blocking confirm dialog, and OAuth child popup
    messageHandler(
      JSON.stringify({
        method: 'Runtime.exceptionThrown',
        params: { exceptionDetails: { text: 'TypeError: Cannot read properties of null', url: 'https://app.example.com/main.js' } },
      })
    );
    messageHandler(
      JSON.stringify({
        method: 'Network.requestWillBeSent',
        params: { requestId: 'req-500', request: { method: 'POST', url: 'https://app.example.com/api/pay' } },
      })
    );
    messageHandler(
      JSON.stringify({
        method: 'Network.responseReceived',
        params: { requestId: 'req-500', response: { url: 'https://app.example.com/api/pay', status: 500, statusText: 'Internal Server Error' } },
      })
    );
    messageHandler(
      JSON.stringify({
        method: 'Page.javascriptDialogOpening',
        params: { type: 'confirm', message: 'Retry payment?', defaultPrompt: '' },
      })
    );
    liveTargets.push({ id: 'popup-oauth', type: 'page', openerId: 'tab-spa', url: 'https://auth.example.com', title: 'OAuth' });
    messageHandler(
      JSON.stringify({
        method: 'Target.targetCreated',
        params: { targetInfo: { targetId: 'popup-oauth', type: 'page', openerId: 'tab-spa', url: 'https://auth.example.com', title: 'OAuth' } },
      })
    );

    const snap = await browser.getSnapshot({ stateDir: tmpDir });
    expect(snap.url).toBe('https://app.example.com/checkout');
    expect(snap.elements).toHaveLength(1);
    expect(snap.consoleErrors).toHaveLength(1);
    expect(snap.consoleErrors[0].text).toContain('TypeError');
    expect(snap.failedRequests).toHaveLength(1);
    expect(snap.failedRequests[0]).toMatchObject({ method: 'POST', status: 500, url: 'https://app.example.com/api/pay' });
    expect(snap.activeDialog).toMatchObject({ type: 'confirm', message: 'Retry payment?' });
    expect(snap.childPopups).toHaveLength(1);
    expect(snap.childPopups[0].id).toBe('popup-oauth');

    await browser.handleDialog({ accept: false });
    expect(readTabTelemetry('tab-spa', tmpDir).activeDialog).toBeNull();
    await browser.close();
  });

  it('persists and clears structured waitingForHuman state on leases (#15 / aim-connect#275)', async () => {
    const mockBrowser = {
      getTargets: async () => [],
      openTab: async (url) => ({ id: 'target-login', type: 'page', url, title: 'Sign In' }),
      closeTab: async () => 'Target is closing',
    };

    await acquireTabLease(mockBrowser, 'x-auth', { url: 'https://x.com/login', session: 'aim-connect', stateDir: tmpDir });
    const held = requestHumanHandoff('x-auth', 'Enter 6-digit authenticator code', { stateDir: tmpDir });
    expect(held.waitingForHuman).toMatchObject({ reason: 'Enter 6-digit authenticator code' });
    expect(typeof held.waitingForHuman.requestedAt).toBe('number');
    expect(readLeases(tmpDir)['x-auth'].waitingForHuman.reason).toBe('Enter 6-digit authenticator code');

    const cleared = clearHumanHandoff('x-auth', { stateDir: tmpDir });
    expect(cleared.waitingForHuman).toBeNull();
    expect(readLeases(tmpDir)['x-auth'].waitingForHuman).toBeNull();
  });

  it('creates and disposes cookie-isolated ephemeral browserContexts via --ephemeral', async () => {
    const cdpCalls = [];
    let msgHandler;
    const mockFetch = jest.fn(async (url) => {
      if (url.includes('/json/version')) {
        return { ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/root' }) };
      }
      if (url.includes('/json/list')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 404 };
    });

    const mockWs = {
      on: jest.fn((ev, cb) => {
        if (ev === 'open') setTimeout(cb, 2);
        if (ev === 'message') msgHandler = cb;
      }),
      send: jest.fn((payload, cb) => {
        const parsed = JSON.parse(payload);
        cdpCalls.push(parsed);
        let result = {};
        if (parsed.method === 'Target.createBrowserContext') result = { browserContextId: 'ctx-ephemeral-1' };
        if (parsed.method === 'Target.createTarget') result = { targetId: 'tab-ephemeral-1' };
        setTimeout(() => msgHandler(JSON.stringify({ id: parsed.id, result })), 1);
        if (cb) cb();
      }),
      close: jest.fn(),
    };

    const browser = new AimBrowser({
      fetchImpl: mockFetch,
      WebSocketImpl: jest.fn(() => mockWs),
      stealFocus: false,
    });

    const leased = await acquireTabLease(browser, 'research-sandbox', {
      url: 'https://untrusted.example.org',
      ephemeral: true,
      stateDir: tmpDir,
    });

    expect(leased.ephemeral).toBe(true);
    expect(leased.browserContextId).toBe('ctx-ephemeral-1');
    expect(leased.targetId).toBe('tab-ephemeral-1');
    expect(readLeases(tmpDir)['research-sandbox'].browserContextId).toBe('ctx-ephemeral-1');

    const released = await releaseTabLease(browser, 'research-sandbox', { closeTab: true, stateDir: tmpDir });
    expect(released.closed).toBe(true);
    expect(released.browserContextId).toBe('ctx-ephemeral-1');

    const methods = cdpCalls.map((c) => c.method);
    expect(methods).toContain('Target.createBrowserContext');
    expect(methods).toContain('Target.createTarget');
    expect(methods).toContain('Target.disposeBrowserContext');
  });
});
