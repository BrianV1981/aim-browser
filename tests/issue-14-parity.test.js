import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import {
  AimBrowser,
  acquireTabLease,
  buildDaemonLaunchArgs,
  emitHudEvent,
  readHudEvent,
  readLeases,
  resolveDefaultDownloadDir,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('Issue #14: Headless Daemon Parity, stealFocus/closeTab/Download Guards & Locked Leases', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-browser-issue14-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults daemon launch args to --headless=new and supports explicit headed opt-in', () => {
    const def = buildDaemonLaunchArgs({ env: {}, platform: 'linux', profileDir: tmpDir });
    expect(def.useHeadless).toBe(true);
    expect(def.args).toContain('--headless=new');
    expect(def.args).toContain('--window-size=1280,800');
    expect(def.args).not.toContain('--start-minimized');

    const headedMin = buildDaemonLaunchArgs({
      headless: false,
      minimized: true,
      env: {},
      platform: 'linux',
      profileDir: tmpDir,
    });
    expect(headedMin.useHeadless).toBe(false);
    expect(headedMin.args).not.toContain('--headless=new');
    expect(headedMin.args).toContain('--start-minimized');

    const visible = buildDaemonLaunchArgs({
      visible: true,
      env: {},
      platform: 'win32',
      profileDir: tmpDir,
    });
    expect(visible.useHeadless).toBe(false);
    expect(visible.args).not.toContain('--headless=new');
    expect(visible.args).not.toContain('--window-state=minimized');
  });

  it('honors stealFocus: false on keyPress, keyType, screenshot, and setDownloadPath, and parses plain-text closeTab', async () => {
    let messageHandler;
    const dlDir = path.join(tmpDir, 'dl');
    const mockFetch = jest.fn(async (url) => {
      if (url.includes('/json/list')) {
        return {
          ok: true,
          json: async () => [{ id: 'tab-leased', type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/tab-leased' }],
        };
      }
      if (url.includes('/json/close/tab-leased')) {
        return {
          ok: true,
          text: async () => 'Target is closing',
          json: async () => {
            throw new SyntaxError('Unexpected token T in JSON at position 0');
          },
        };
      }
      return { ok: false, status: 404 };
    });

    const sentMethods = [];
    const mockWs = {
      on: jest.fn((ev, cb) => {
        if (ev === 'open') setTimeout(cb, 2);
        if (ev === 'message') messageHandler = cb;
      }),
      send: jest.fn((payload, cb) => {
        const parsed = JSON.parse(payload);
        sentMethods.push(parsed);
        let result = {};
        if (parsed.method === 'Runtime.evaluate') result = { result: { value: 'complete' } };
        if (parsed.method === 'Page.captureScreenshot') result = { data: 'cG5n' };
        setTimeout(() => messageHandler(JSON.stringify({ id: parsed.id, result })), 1);
        if (cb) cb();
      }),
      close: jest.fn(),
    };

    const browser = new AimBrowser({
      fetchImpl: mockFetch,
      WebSocketImpl: jest.fn(() => mockWs),
      stealFocus: false,
      lease: 'subagent-alpha',
      downloadDir: dlDir,
      autoConfigureDownloads: true,
    });

    await browser.connect('tab-leased');
    await browser.keyPress({ code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
    await browser.keyType('hi');
    await browser.setDownloadPath(dlDir);

    const methodNames = sentMethods.map((m) => m.method);
    expect(methodNames).not.toContain('Page.bringToFront');
    expect(methodNames).toContain('Page.setDownloadBehavior');
    expect(resolveDefaultDownloadDir(dlDir)).toBe(path.resolve(dlDir));

    const closeRes = await browser.closeTab('tab-leased');
    expect(closeRes).toBe('Target is closing');
    await browser.close();
  });

  it('serializes concurrent acquireTabLease calls under .leases.lock and tracks per-target HUD state', async () => {
    const liveTabs = [];
    let seq = 0;
    const slowBrowser = {
      getTargets: jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 15));
        return [...liveTabs];
      }),
      openTab: jest.fn(async (url) => {
        await new Promise((r) => setTimeout(r, 15));
        const tab = { id: `target-${++seq}`, type: 'page', url, title: `Tab ${seq}` };
        liveTabs.push(tab);
        return tab;
      }),
    };

    const [a, b, c] = await Promise.all([
      acquireTabLease(slowBrowser, 'worker-a', { url: 'https://a.test', stateDir: tmpDir }),
      acquireTabLease(slowBrowser, 'worker-b', { url: 'https://b.test', stateDir: tmpDir }),
      acquireTabLease(slowBrowser, 'worker-c', { url: 'https://c.test', stateDir: tmpDir }),
    ]);

    const saved = readLeases(tmpDir);
    expect(Object.keys(saved).sort()).toEqual(['worker-a', 'worker-b', 'worker-c']);
    expect(saved['worker-a'].targetId).toBe(a.targetId);
    expect(saved['worker-b'].targetId).toBe(b.targetId);
    expect(saved['worker-c'].targetId).toBe(c.targetId);

    emitHudEvent({ targetId: a.targetId, lease: 'worker-a', action: 'click', label: 'Btn A', x: 10, y: 20 }, tmpDir);
    emitHudEvent({ targetId: b.targetId, lease: 'worker-b', action: 'type', label: 'Input B', x: 80, y: 90 }, tmpDir);

    const hudA = readHudEvent(tmpDir, a.targetId);
    const hudB = readHudEvent(tmpDir, b.targetId);
    expect(hudA.lease).toBe('worker-a');
    expect(hudA.label).toBe('Btn A');
    expect(hudB.lease).toBe('worker-b');
    expect(hudB.label).toBe('Input B');
  });

  it('removes legacy --solve-px CLI flag from run.js to enforce human handoff rule', () => {
    const runJs = fs.readFileSync(path.join(ROOT, 'aim-browser.skill', 'scripts', 'run.js'), 'utf8');
    expect(runJs).not.toContain('--solve-px');
  });
});
