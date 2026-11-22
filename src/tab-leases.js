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

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
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
  const liveTargets = await browser.getTargets();
  const leases = syncLeasesWithTargets(liveTargets, stateDir);

  const effectiveLease = rawName === 'new' ? `tab-${Date.now().toString(36)}` : rawName;
  const session =
    opts.session !== undefined ? String(opts.session || '').trim() : detectCallerSession(opts);
  const actor = opts.actor || session || effectiveLease;

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

  const createdTab = await browser.openTab(url);
  if (!createdTab?.id) {
    throw new Error(`Failed to open new CDP tab for lease "${effectiveLease}"`);
  }
  leases[effectiveLease] = {
    lease: effectiveLease,
    targetId: createdTab.id,
    actor,
    session,
    url: createdTab.url || url,
    title: createdTab.title || '',
    updatedAt: Date.now(),
  };
  writeLeases(leases, stateDir);
  return { created: true, lease: effectiveLease, targetId: createdTab.id, session, target: createdTab };
}

/**
 * Release a named tab lease and optionally close its underlying CDP tab.
 * @param {import('./cdp-client.js').AimBrowser} browser
 * @param {string} leaseName
 * @param {{ closeTab?: boolean, stateDir?: string }} [opts]
 */
export async function releaseTabLease(browser, leaseName, opts = {}) {
  const stateDir = resolveStateDir(opts.stateDir);
  const leases = readLeases(stateDir);
  const entry = leases[leaseName];
  if (!entry) return { released: false, closed: false };

  let closed = false;
  if (opts.closeTab && browser && entry.targetId) {
    await browser.closeTab(entry.targetId).catch(() => {});
    closed = true;
  }
  delete leases[leaseName];
  writeLeases(leases, stateDir);
  return { released: true, closed, targetId: entry.targetId };
}

/**
 * Emit a lightweight cursor/action HUD event for live viewport overlays (aim-connect#240).
 * @param {{ targetId?: string, lease?: string, actor?: string, action: string, label?: string, x?: number, y?: number }} event
 * @param {string} [stateDir]
 */
export function emitHudEvent(event, stateDir) {
  const dir = resolveStateDir(stateDir);
  const file = path.join(dir, 'hud.json');
  let prevSeq = 0;
  try {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    prevSeq = Number(prev?.seq || 0);
  } catch {
    /* first event */
  }
  const payload = {
    seq: prevSeq + 1,
    ts: Date.now(),
    targetId: event.targetId || '',
    lease: event.lease || '',
    actor: event.actor || event.session || event.lease || 'agent',
    session: event.session || '',
    action: event.action || 'act',
    label: String(event.label || '').slice(0, 120),
    x: typeof event.x === 'number' ? Math.round(event.x) : null,
    y: typeof event.y === 'number' ? Math.round(event.y) : null,
  };
  writeJsonAtomic(file, payload);
  return payload;
}

/**
 * Read the most recent cursor/action HUD event if available.
 * @param {string} [stateDir]
 */
export function readHudEvent(stateDir) {
  const file = path.join(resolveStateDir(stateDir), 'hud.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
