import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * Auto-detect the calling agent's owning tmux session or repository name so
 * aim-connect can color-match leased browser tabs to Fleet Sidebar sessions (#13).
 * @param {{ session?: string, env?: NodeJS.ProcessEnv, cwd?: string, execFn?: typeof execFileSync }} [opts]
 * @returns {string}
 */
export function detectCallerSession(opts = {}) {
  const env = opts.env || process.env;
  const explicit = String(
    opts.session ?? env.AIM_BROWSER_SESSION ?? env.AIM_SESSION ?? ''
  ).trim();
  if (explicit) return explicit.slice(0, 64);

  const execFn = opts.execFn || execFileSync;
  if (env.TMUX_PANE || env.TMUX) {
    try {
      const tmuxArgs = ['display-message', '-p'];
      if (env.TMUX_PANE) tmuxArgs.push('-t', String(env.TMUX_PANE));
      tmuxArgs.push('#S');
      const out = String(
        execFn('tmux', tmuxArgs, {
          timeout: 400,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }) || ''
      ).trim();
      if (out) return out.slice(0, 64);
    } catch {
      /* fall back to git/cwd inspection */
    }
  }

  let rawCwd = String(opts.cwd || process.cwd() || '').trim();
  if (!rawCwd) return '';
  const normalized = rawCwd.replace(/\\/g, '/').replace(/\/workspace\/issue-[^/]+.*$/i, '');
  let cur = path.resolve(normalized);
  for (let depth = 0; depth < 6; depth++) {
    try {
      const gitMarker = path.join(cur, '.git');
      if (fs.existsSync(gitMarker)) {
        return path.basename(cur).slice(0, 64);
      }
    } catch {
      /* ignore */
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return '';
}

/**
 * Resolve state directory for multi-tab targetId leases and live HUD overlays.
 * @param {string} [customDir]
 * @returns {string}
 */
export function resolveStateDir(customDir) {
  const dir = customDir || process.env.AIM_BROWSER_STATE_DIR || path.join(os.homedir(), '.cache', 'aim-browser');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const LEASE_LOCK_STALE_MS = 10000;
const HUD_BY_TARGET_TTL_MS = 60000;
const MAX_TELEMETRY_ITEMS = 25;

function sanitizeTargetIdForFile(targetId) {
  return String(targetId || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128) || 'unknown';
}

export function resolveTelemetryPath(targetId, stateDir) {
  const dir = path.join(resolveStateDir(stateDir), 'telemetry');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${sanitizeTargetIdForFile(targetId)}.json`);
}

export function readTabTelemetry(targetId, stateDir) {
  if (!targetId) {
    return { consoleErrors: [], failedRequests: [], activeDialog: null, childPopups: [], updatedAt: 0 };
  }
  const file = resolveTelemetryPath(targetId, stateDir);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      consoleErrors: Array.isArray(parsed?.consoleErrors) ? parsed.consoleErrors : [],
      failedRequests: Array.isArray(parsed?.failedRequests) ? parsed.failedRequests : [],
      activeDialog: parsed?.activeDialog && typeof parsed.activeDialog === 'object' ? parsed.activeDialog : null,
      childPopups: Array.isArray(parsed?.childPopups) ? parsed.childPopups : [],
      updatedAt: Number(parsed?.updatedAt || 0),
    };
  } catch {
    return { consoleErrors: [], failedRequests: [], activeDialog: null, childPopups: [], updatedAt: 0 };
  }
}

export function appendTabTelemetry(targetId, delta = {}, stateDir) {
  if (!targetId) return null;
  return withLeasesLockSync(stateDir, () => {
    const current = readTabTelemetry(targetId, stateDir);
    const consoleErrors = [...current.consoleErrors, ...(delta.consoleErrors || [])].slice(-MAX_TELEMETRY_ITEMS);
    const failedRequests = [...current.failedRequests, ...(delta.failedRequests || [])].slice(-MAX_TELEMETRY_ITEMS);
    const existingPopups = new Map(current.childPopups.map((p) => [p.id, p]));
    for (const pop of delta.childPopups || []) {
      if (pop?.id) existingPopups.set(pop.id, pop);
    }
    const childPopups = Array.from(existingPopups.values()).slice(-MAX_TELEMETRY_ITEMS);
    const activeDialog = delta.activeDialog !== undefined ? delta.activeDialog : current.activeDialog;
    const next = {
      targetId,
      consoleErrors,
      failedRequests,
      activeDialog,
      childPopups,
      updatedAt: Date.now(),
    };
    writeJsonAtomic(resolveTelemetryPath(targetId, stateDir), next);
    return next;
  });
}

export function clearTabTelemetry(targetId, stateDir) {
  if (!targetId) return;
  try {
    fs.unlinkSync(resolveTelemetryPath(targetId, stateDir));
  } catch {}
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function isStaleLockFile(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const meta = JSON.parse(raw);
    const age = Date.now() - Number(meta?.ts || 0);
    if (age > LEASE_LOCK_STALE_MS) return true;
    if (meta?.pid && !isPidAlive(Number(meta.pid))) return true;
    return false;
  } catch {
    try {
      const st = fs.statSync(lockPath);
      return Date.now() - st.mtimeMs > LEASE_LOCK_STALE_MS;
    } catch {
      return false;
    }
  }
}

function tryAcquireLockFd(lockPath) {
  try {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
    return fd;
  } catch (err) {
    if (err?.code === 'EEXIST' && isStaleLockFile(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {}
      try {
        const fd = fs.openSync(lockPath, 'wx', 0o600);
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
        return fd;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function releaseLockFd(fd, lockPath) {
  try {
    if (typeof fd === 'number') fs.closeSync(fd);
  } catch {}
  try {
    fs.unlinkSync(lockPath);
  } catch {}
}

/**
 * Serialize synchronous state mutations under a stale-PID-safe `.leases.lock`.
 * @template T
 * @param {string | undefined} stateDir
 * @param {() => T} fn
 * @returns {T}
 */
export function withLeasesLockSync(stateDir, fn) {
  const dir = resolveStateDir(stateDir);
  const lockPath = path.join(dir, '.leases.lock');
  const deadline = Date.now() + 5000;
  let fd = null;
  while (Date.now() < deadline) {
    fd = tryAcquireLockFd(lockPath);
    if (fd !== null) break;
  }
  try {
    return fn();
  } finally {
    if (fd !== null) releaseLockFd(fd, lockPath);
  }
}

/**
 * Serialize async lease acquisition/release under `.leases.lock` so parallel subagents never clobber `leases.json`.
 * @template T
 * @param {string | undefined} stateDir
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withLeasesLock(stateDir, fn) {
  const dir = resolveStateDir(stateDir);
  const lockPath = path.join(dir, '.leases.lock');
  const deadline = Date.now() + 5000;
  let fd = null;
  while (Date.now() < deadline) {
    fd = tryAcquireLockFd(lockPath);
    if (fd !== null) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  try {
    return await fn();
  } finally {
    if (fd !== null) releaseLockFd(fd, lockPath);
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read active tab leases ({ [leaseName]: { lease, targetId, actor, url, title, updatedAt } }).
 * @param {string} [stateDir]
 */
export function readLeases(stateDir) {
  const file = path.join(resolveStateDir(stateDir), 'leases.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Persist tab leases atomically.
 * @param {Record<string, object>} leases
 * @param {string} [stateDir]
 */
export function writeLeases(leases, stateDir) {
  const file = path.join(resolveStateDir(stateDir), 'leases.json');
  writeJsonAtomic(file, leases || {});
}

/**
 * Prune dead targetId leases against live CDP /json/list targets and enrich url/title.
 * @param {Array<{id: string, url?: string, title?: string}>} liveTargets
 * @param {string} [stateDir]
 */
export function syncLeasesWithTargets(liveTargets, stateDir) {
  return withLeasesLockSync(stateDir, () => _syncLeasesWithTargetsUnlocked(liveTargets, stateDir));
}

function _syncLeasesWithTargetsUnlocked(liveTargets, stateDir) {
  const byId = new Map((liveTargets || []).map((t) => [t.id, t]));
  const current = readLeases(stateDir);
  const synced = {};
  let changed = false;

  for (const [lease, info] of Object.entries(current)) {
    const live = info?.targetId ? byId.get(info.targetId) : null;
    if (!live) {
      changed = true;
      continue;
    }
    const nextUrl = live.url ?? info.url ?? '';
    const nextTitle = live.title ?? info.title ?? '';
    if (nextUrl !== info.url || nextTitle !== info.title) changed = true;
    synced[lease] = {
      ...info,
      lease,
      targetId: live.id,
      url: nextUrl,
      title: nextTitle,
    };
  }

  if (changed) writeLeases(synced, stateDir);
  return synced;
}

/**
 * Acquire or reuse an isolated CDP tab targetId for an Operator or concurrent subagent.
 *
 * - `--tab subagent-1` reuses `subagent-1`'s pinned tab if still open, or opens a dedicated new tab.
 * - `--tab new` always opens a fresh tab with a generated lease id.
 * - Never steals or overwrites another subagent's leased tab.
 *
 * @param {import('./cdp-client.js').AimBrowser} browser
 * @param {string} leaseName
 * @param {{ url?: string, actor?: string, createIfMissing?: boolean, stateDir?: string }} [opts]
 */
export async function acquireTabLease(browser, leaseName, opts = {}) {
  const rawName = String(leaseName || '').trim();
  if (!rawName) throw new Error('leaseName is required for acquireTabLease');

  const url = opts.url || 'about:blank';
  const createIfMissing = opts.createIfMissing !== false;
  const stateDir = resolveStateDir(opts.stateDir);
  const effectiveLease = rawName === 'new' ? `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}` : rawName;
  const session =
    opts.session !== undefined ? String(opts.session || '').trim() : detectCallerSession(opts);
  const actor = opts.actor || session || effectiveLease;

  return await withLeasesLock(stateDir, async () => {
    const liveTargets = await browser.getTargets();
    const leases = _syncLeasesWithTargetsUnlocked(liveTargets, stateDir);

    if (rawName !== 'new' && leases[effectiveLease]) {
      const existingId = leases[effectiveLease].targetId;
      const target = liveTargets.find((t) => t.id === existingId);
      if (target) {
        leases[effectiveLease] = {
          ...leases[effectiveLease],
          actor,
          session: session || leases[effectiveLease].session || '',
          url: target.url || leases[effectiveLease].url || url,
          title: target.title || leases[effectiveLease].title || '',
          updatedAt: Date.now(),
        };
        writeLeases(leases, stateDir);
        return {
          created: false,
          lease: effectiveLease,
          targetId: target.id,
          session: leases[effectiveLease].session,
          target,
        };
      }
    }

    // Also allow attaching directly by exact CDP targetId if passed
    const directTarget = liveTargets.find((t) => t.id === rawName);
    if (directTarget) {
      leases[effectiveLease] = {
        lease: effectiveLease,
        targetId: directTarget.id,
        actor,
        session,
        url: directTarget.url || url,
        title: directTarget.title || '',
        updatedAt: Date.now(),
      };
      writeLeases(leases, stateDir);
      return {
        created: false,
        lease: effectiveLease,
        targetId: directTarget.id,
        session,
        target: directTarget,
      };
    }

    if (!createIfMissing) {
      throw new Error(`No active tab lease found for "${effectiveLease}"`);
    }

    const useEphemeral = opts.ephemeral === true;
    const createdTab =
      useEphemeral && typeof browser.openEphemeralTab === 'function'
        ? await browser.openEphemeralTab(url)
        : await browser.openTab(url);
    if (!createdTab?.id) {
      throw new Error(`Failed to open new CDP tab for lease "${effectiveLease}"`);
    }
    const freshLeases = readLeases(stateDir);
    freshLeases[effectiveLease] = {
      lease: effectiveLease,
      targetId: createdTab.id,
      actor,
      session,
      url: createdTab.url || url,
      title: createdTab.title || '',
      ephemeral: Boolean(useEphemeral || createdTab.ephemeral),
      browserContextId: createdTab.browserContextId || '',
      waitingForHuman: null,
      updatedAt: Date.now(),
    };
    writeLeases(freshLeases, stateDir);
    return {
      created: true,
      lease: effectiveLease,
      targetId: createdTab.id,
      session,
      ephemeral: freshLeases[effectiveLease].ephemeral,
      browserContextId: freshLeases[effectiveLease].browserContextId,
      target: createdTab,
    };
  });
}

/**
 * Mark a named lease as waiting for human Operator intervention (2FA / login / CAPTCHA) for aim-connect#275.
 * @param {string} leaseName
 * @param {string} reason
 * @param {{ stateDir?: string, emitHud?: boolean }} [opts]
 */
export function requestHumanHandoff(leaseName, reason, opts = {}) {
  const cleanLease = String(leaseName || '').trim();
  if (!cleanLease) throw new Error('leaseName is required for requestHumanHandoff');
  const cleanReason = String(reason || 'Human login or 2FA required').trim().slice(0, 240);
  const stateDir = resolveStateDir(opts.stateDir);

  const updatedEntry = withLeasesLockSync(stateDir, () => {
    const leases = readLeases(stateDir);
    if (!leases[cleanLease]) {
      throw new Error(`No active tab lease found for "${cleanLease}"`);
    }
    leases[cleanLease] = {
      ...leases[cleanLease],
      waitingForHuman: {
        reason: cleanReason,
        requestedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    writeLeases(leases, stateDir);
    return leases[cleanLease];
  });

  if (opts.emitHud !== false) {
    emitHudEvent(
      {
        targetId: updatedEntry.targetId,
        lease: cleanLease,
        actor: updatedEntry.actor,
        session: updatedEntry.session,
        action: 'waiting-human',
        label: cleanReason,
      },
      stateDir
    );
  }
  return updatedEntry;
}

/**
 * Clear `waitingForHuman` on a named lease once Operator login/2FA handoff completes.
 * @param {string} leaseName
 * @param {{ stateDir?: string }} [opts]
 */
export function clearHumanHandoff(leaseName, opts = {}) {
  const cleanLease = String(leaseName || '').trim();
  if (!cleanLease) throw new Error('leaseName is required for clearHumanHandoff');
  const stateDir = resolveStateDir(opts.stateDir);

  return withLeasesLockSync(stateDir, () => {
    const leases = readLeases(stateDir);
    if (!leases[cleanLease]) return null;
    leases[cleanLease] = {
      ...leases[cleanLease],
      waitingForHuman: null,
      updatedAt: Date.now(),
    };
    writeLeases(leases, stateDir);
    return leases[cleanLease];
  });
}

/**
 * Release a named tab lease and optionally close its underlying CDP tab (or dispose its ephemeral context).
 * @param {import('./cdp-client.js').AimBrowser} browser
 * @param {string} leaseName
 * @param {{ closeTab?: boolean, stateDir?: string }} [opts]
 */
export async function releaseTabLease(browser, leaseName, opts = {}) {
  const stateDir = resolveStateDir(opts.stateDir);
  return await withLeasesLock(stateDir, async () => {
    const leases = readLeases(stateDir);
    const entry = leases[leaseName];
    if (!entry) return { released: false, closed: false };

    let closed = false;
    if (opts.closeTab && browser) {
      if (entry.browserContextId && typeof browser.disposeEphemeralContext === 'function') {
        const disposed = await browser.disposeEphemeralContext(entry.browserContextId).catch(() => false);
        if (!disposed && entry.targetId) {
          await browser.closeTab(entry.targetId).catch(() => {});
        }
        closed = true;
      } else if (entry.targetId) {
        await browser.closeTab(entry.targetId).catch(() => {});
        closed = true;
      }
    }
    if (entry.targetId) {
      clearTabTelemetry(entry.targetId, stateDir);
    }
    const latest = readLeases(stateDir);
    delete latest[leaseName];
    writeLeases(latest, stateDir);
    return { released: true, closed, targetId: entry.targetId, browserContextId: entry.browserContextId || '' };
  });
}

/**
 * Emit a lightweight cursor/action HUD event for live viewport overlays (aim-connect#240 / #274).
 * Persists per-target state (`byTarget[targetId]`) alongside backward-compatible top-level fields.
 * @param {{ targetId?: string, lease?: string, actor?: string, session?: string, action: string, label?: string, x?: number, y?: number }} event
 * @param {string} [stateDir]
 */
export function emitHudEvent(event, stateDir) {
  return withLeasesLockSync(stateDir, () => {
    const dir = resolveStateDir(stateDir);
    const file = path.join(dir, 'hud.json');
    let prevSeq = 0;
    let prevByTarget = {};
    const now = Date.now();
    try {
      const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
      prevSeq = Number(prev?.seq || 0);
      if (prev?.byTarget && typeof prev.byTarget === 'object') {
        for (const [tid, item] of Object.entries(prev.byTarget)) {
          if (item && typeof item === 'object' && now - Number(item.ts || 0) <= HUD_BY_TARGET_TTL_MS) {
            prevByTarget[tid] = item;
          }
        }
      }
    } catch {
      /* first event */
    }
    const baseEvent = {
      seq: prevSeq + 1,
      ts: now,
      targetId: event.targetId || '',
      lease: event.lease || '',
      actor: event.actor || event.session || event.lease || 'agent',
      session: event.session || '',
      action: event.action || 'act',
      label: String(event.label || '').slice(0, 120),
      x: typeof event.x === 'number' ? Math.round(event.x) : null,
      y: typeof event.y === 'number' ? Math.round(event.y) : null,
    };
    const byTarget = { ...prevByTarget };
    if (baseEvent.targetId) {
      byTarget[baseEvent.targetId] = baseEvent;
    }
    const payload = {
      ...baseEvent,
      byTarget,
    };
    writeJsonAtomic(file, payload);
    return payload;
  });
}

/**
 * Read the most recent cursor/action HUD event (or a specific targetId's HUD event) if available.
 * @param {string} [stateDir]
 * @param {string} [targetId]
 */
export function readHudEvent(stateDir, targetId) {
  const file = path.join(resolveStateDir(stateDir), 'hud.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    if (targetId) {
      if (parsed.byTarget && parsed.byTarget[targetId]) return parsed.byTarget[targetId];
      return parsed.targetId === targetId ? parsed : null;
    }
    return parsed;
  } catch {
    return null;
  }
}
