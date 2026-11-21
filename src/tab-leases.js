import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
  const actor = opts.actor || effectiveLease;

  if (rawName !== 'new' && leases[effectiveLease]) {
    const existingId = leases[effectiveLease].targetId;
    const target = liveTargets.find((t) => t.id === existingId);
    if (target) {
      leases[effectiveLease] = {
        ...leases[effectiveLease],
        actor,
        url: target.url || leases[effectiveLease].url || url,
        title: target.title || leases[effectiveLease].title || '',
        updatedAt: Date.now(),
      };
      writeLeases(leases, stateDir);
      return { created: false, lease: effectiveLease, targetId: target.id, target };
    }
  }

  // Also allow attaching directly by exact CDP targetId if passed
  const directTarget = liveTargets.find((t) => t.id === rawName);
  if (directTarget) {
    leases[effectiveLease] = {
      lease: effectiveLease,
      targetId: directTarget.id,
      actor,
      url: directTarget.url || url,
      title: directTarget.title || '',
      updatedAt: Date.now(),
    };
    writeLeases(leases, stateDir);
    return { created: false, lease: effectiveLease, targetId: directTarget.id, target: directTarget };
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
    url: createdTab.url || url,
    title: createdTab.title || '',
    updatedAt: Date.now(),
  };
  writeLeases(leases, stateDir);
  return { created: true, lease: effectiveLease, targetId: createdTab.id, target: createdTab };
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
    actor: event.actor || event.lease || 'agent',
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
