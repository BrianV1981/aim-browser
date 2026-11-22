import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import {
  acquireTabLease,
  detectCallerSession,
  emitHudEvent,
  readHudEvent,
  readLeases,
  releaseTabLease,
  syncLeasesWithTargets,
} from '../src/tab-leases.js';

describe('Multi-Tab targetId Leasing & HUD Overlay Events (aim-browser#11)', () => {
  let tmpDir;
  let liveTabs;
  let mockBrowser;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-browser-leases-'));
    liveTabs = [
      { id: 'target-operator', type: 'page', url: 'https://example.com', title: 'Operator Tab' },
    ];
    let counter = 0;
    mockBrowser = {
      getTargets: jest.fn(async () => [...liveTabs]),
      openTab: jest.fn(async (url) => {
        const created = { id: `target-sub-${++counter}`, type: 'page', url, title: `Sub ${counter}` };
        liveTabs.push(created);
        return created;
      }),
      closeTab: jest.fn(async (id) => {
        liveTabs = liveTabs.filter((t) => t.id !== id);
      }),
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isolates concurrent subagents onto distinct CDP targetIds without clobbering', async () => {
    const sub1 = await acquireTabLease(mockBrowser, 'subagent-1', {
      url: 'https://clerk.example.gov',
      stateDir: tmpDir,
    });
    const sub2 = await acquireTabLease(mockBrowser, 'subagent-2', {
      url: 'https://sunbiz.example.org',
      stateDir: tmpDir,
    });

    expect(sub1.created).toBe(true);
    expect(sub2.created).toBe(true);
    expect(sub1.targetId).not.toBe(sub2.targetId);
    expect(sub1.targetId).not.toBe('target-operator');

    // Subsequent calls with the same lease reuse the same tab without spawning duplicates
    const sub1Again = await acquireTabLease(mockBrowser, 'subagent-1', { stateDir: tmpDir });
    expect(sub1Again.created).toBe(false);
    expect(sub1Again.targetId).toBe(sub1.targetId);
    expect(mockBrowser.openTab).toHaveBeenCalledTimes(2);
  });

  it('prunes stale leases automatically when underlying Chromium tabs are closed', async () => {
    const sub1 = await acquireTabLease(mockBrowser, 'subagent-1', {
      url: 'https://a.example.com',
      stateDir: tmpDir,
    });
    expect(readLeases(tmpDir)['subagent-1'].targetId).toBe(sub1.targetId);

    // Simulate external tab close
    liveTabs = liveTabs.filter((t) => t.id !== sub1.targetId);
    const synced = syncLeasesWithTargets(liveTabs, tmpDir);
    expect(synced['subagent-1']).toBeUndefined();

    // Next acquire transparently opens a replacement tab
    const reopened = await acquireTabLease(mockBrowser, 'subagent-1', {
      url: 'https://a.example.com',
      stateDir: tmpDir,
    });
    expect(reopened.created).toBe(true);
    expect(reopened.targetId).not.toBe(sub1.targetId);
  });

  it('releases leases and optionally closes the leased tab', async () => {
    const sub1 = await acquireTabLease(mockBrowser, 'worker-alpha', { stateDir: tmpDir });
    const res = await releaseTabLease(mockBrowser, 'worker-alpha', { closeTab: true, stateDir: tmpDir });
    expect(res.released).toBe(true);
    expect(res.closed).toBe(true);
    expect(mockBrowser.closeTab).toHaveBeenCalledWith(sub1.targetId);
    expect(readLeases(tmpDir)['worker-alpha']).toBeUndefined();
  });

  it('emits monotonically sequenced cursor HUD events for live viewport overlays', () => {
    const ev1 = emitHudEvent(
      { targetId: 'target-sub-1', lease: 'subagent-1', actor: 'subagent-1', action: 'click', label: 'Search', x: 412.4, y: 188.7 },
      tmpDir
    );
    const ev2 = emitHudEvent(
      { targetId: 'target-sub-1', lease: 'subagent-1', actor: 'subagent-1', action: 'type', label: 'Parcel ID', x: 300, y: 120 },
      tmpDir
    );
    expect(ev1.seq).toBe(1);
    expect(ev1.x).toBe(412);
    expect(ev1.y).toBe(189);
    expect(ev2.seq).toBe(2);
    expect(readHudEvent(tmpDir)).toEqual(ev2);
  });

  it('auto-detects caller tmux session or git repo and persists session in leases and HUD (#13)', async () => {
    expect(
      detectCallerSession({ env: { AIM_BROWSER_SESSION: 'aim-connect' }, cwd: tmpDir })
    ).toBe('aim-connect');

    const mockExec = jest.fn(() => 'aim-alpha\n');
    expect(
      detectCallerSession({ env: { TMUX_PANE: '%4' }, execFn: mockExec, cwd: tmpDir })
    ).toBe('aim-alpha');
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      ['display-message', '-p', '-t', '%4', '#S'],
      expect.any(Object)
    );

    const fakeRepo = path.join(tmpDir, 'aim-sample-repo');
    const fakeWorktree = path.join(fakeRepo, 'workspace', 'issue-99', 'backend');
    fs.mkdirSync(path.join(fakeRepo, '.git'), { recursive: true });
    fs.mkdirSync(fakeWorktree, { recursive: true });
    expect(detectCallerSession({ env: {}, cwd: fakeWorktree })).toBe('aim-sample-repo');

    const leased = await acquireTabLease(mockBrowser, 'market-brief', {
      url: 'https://finance.yahoo.com',
      session: 'aim-connect',
      stateDir: tmpDir,
    });
    expect(leased.session).toBe('aim-connect');
    expect(readLeases(tmpDir)['market-brief'].session).toBe('aim-connect');

    const hud = emitHudEvent(
      { targetId: leased.targetId, lease: 'market-brief', session: 'aim-connect', action: 'click', label: 'Ticker', x: 100, y: 80 },
      tmpDir
    );
    expect(hud.session).toBe('aim-connect');
    expect(hud.actor).toBe('aim-connect');
  });
});
