/**
 * Shared helpers for aim-browser thin skills.
 * Lifecycle: ensure daemon → open → re-minimize → extract → screenshot → stop by default.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { AimBrowser, startDaemon, stopDaemon, checkDaemon } from './index.js';

export { AimBrowser, startDaemon, stopDaemon, checkDaemon };

/** @typedef {{
 *   visible: boolean,
 *   noStart: boolean,
 *   stopAfter: boolean,
 *   timeoutMs: number,
 *   screenshot: string|null,
 *   port: number,
 *   host: string,
 *   noCache: boolean,
 *   help: boolean,
 *   rest: string[],
 *   raw: Record<string, string|boolean|number>
 * }} SkillBaseOpts */

/**
 * Parse common skill CLI flags. Unknown flags go to opts.raw; positionals to rest.
 * @param {string[]} argv
 * @param {{ timeoutMs?: number, extraFlags?: string[] }} [defaults]
 * @returns {SkillBaseOpts}
 */
export function parseSkillArgs(argv, defaults = {}) {
  /** @type {SkillBaseOpts} */
  const opts = {
    visible: false,
    noStart: false,
    stopAfter: true,
    timeoutMs: defaults.timeoutMs ?? 90000,
    screenshot: null,
    port: Number(process.env.CDP_PORT || 9222),
    host: process.env.CDP_ADDR || '127.0.0.1',
    noCache: false,
    help: false,
    rest: [],
    raw: {},
  };
  const extra = new Set(defaults.extraFlags || []);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--visible' || a === '--start-visible') opts.visible = true;
    else if (a === '--no-start') opts.noStart = true;
    else if (a === '--stop-after') opts.stopAfter = true;
    else if (a === '--keep-open' || a === '--no-stop') opts.stopAfter = false;
    else if (a === '--no-cache' || a === '--refresh') opts.noCache = true;
    else if (a === '--timeout-ms') opts.timeoutMs = parseInt(argv[++i], 10) || opts.timeoutMs;
    else if (a === '--screenshot') opts.screenshot = argv[++i] || null;
    else if (a === '--port') opts.port = parseInt(argv[++i], 10) || opts.port;
    else if (a === '--host') opts.host = argv[++i] || opts.host;
    else if (a.startsWith('--') && extra.has(a.slice(2))) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        opts.raw[key] = argv[++i];
      } else {
        opts.raw[key] = true;
      }
    } else if (a.startsWith('--') && argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) {
      // generic --key value for skill-specific flags
      opts.raw[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) {
      opts.raw[a.slice(2)] = true;
    } else {
      opts.rest.push(a);
    }
  }
  return opts;
}

export function applyCdpEnv(opts) {
  process.env.CDP_PORT = String(opts.port);
  process.env.CDP_ADDR = opts.host === 'localhost' ? '127.0.0.1' : opts.host;
}

export async function ensureDaemon(opts, label = 'skill') {
  try {
    checkDaemon();
    return;
  } catch {
    /* down */
  }
  if (opts.noStart) {
    throw new Error('CDP daemon not running and --no-start was set. Run npm run daemon:start first.');
  }
  console.error(`[${label}] Starting aim-browser daemon…`);
  startDaemon({ visible: opts.visible, minimized: !opts.visible });
  for (let i = 0; i < 25; i++) {
    try {
      checkDaemon();
      return;
    } catch {
      await sleep(400);
    }
  }
  checkDaemon();
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function dismissConsent(browser) {
  try {
    await browser.evaluate(`(() => {
      const btns = [...document.querySelectorAll('button, input[type=submit], div[role=button]')];
      const b = btns.find(el => /accept all|i agree|^accept$|alle akzeptieren|reject all|got it/i.test((el.innerText || el.value || '').trim()));
      if (b) { b.click(); return true; }
      return false;
    })()`);
    await sleep(1000);
  } catch {
    /* ignore */
  }
}

/**
 * Open URL in new tab, connect, re-minimize, wait ready, dismiss consent.
 * @returns {Promise<{ browser: AimBrowser, keepOffDesk: () => Promise<void> }>}
 */
export async function openSession(opts, url, label = 'skill') {
  applyCdpEnv(opts);
  await ensureDaemon(opts, label);
  const browser = new AimBrowser({ port: opts.port, host: opts.host });
  const keepOffDesk = async () => {
    if (opts.visible) return;
    await browser.minimizeWindow().catch(() => {});
  };

  await browser.connect();
  await keepOffDesk();
  console.error(`[${label}] Opening: ${url}`);
  const tab = await browser.openTab(url);
  await browser.connect(tab.id);
  await keepOffDesk();
  await browser.waitReady(Math.min(opts.timeoutMs, 45000)).catch(() => {});
  await dismissConsent(browser);
  await keepOffDesk();
  if (opts.visible) await browser.showWindow().catch(() => {});
  return { browser, keepOffDesk };
}

export async function saveScreenshot(browser, screenshotPath, keepOffDesk) {
  if (!screenshotPath) return null;
  const b64 = await browser.screenshot({ format: 'png' });
  const abs = path.resolve(screenshotPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(b64, 'base64'));
  console.error(`[skill] Screenshot: ${abs}`);
  if (keepOffDesk) await keepOffDesk();
  return abs;
}

export async function endSession(browser, keepOffDesk, opts, label = 'skill') {
  try {
    if (keepOffDesk) await keepOffDesk();
    if (browser) await browser.close();
  } catch {
    /* */
  }
  if (opts.stopAfter) {
    console.error(`[${label}] Stopping daemon (close after session)…`);
    try {
      stopDaemon();
    } catch {
      /* */
    }
  } else {
    console.error(`[${label}] Leaving daemon running (--keep-open)`);
  }
}

export function printJsonBlock(obj) {
  console.log('\n---JSON---');
  console.log(JSON.stringify(obj, null, 2));
}

export function commonHelpFlags() {
  return `  --visible            Show browser window (default minimized)
  --no-start           Do not start daemon if down
  --keep-open          Leave Chromium running after session (default: stop/close)
  --stop-after         Stop daemon when finished (default)
  --timeout-ms <n>     Wait budget (ms)
  --screenshot <path>  Save PNG proof
  --no-cache           Bypass query cache where supported
  --port / --host      CDP endpoint (default 127.0.0.1:9222)`;
}

/* ── Query cache (C3) ─────────────────────────────────────────── */

export function cacheDir() {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return process.env.AIM_BROWSER_CACHE_DIR || path.join(base, 'aim-browser', 'query-cache');
}

export function cacheKey(skill, parts) {
  const h = crypto.createHash('sha256');
  h.update(skill);
  h.update('\0');
  h.update(JSON.stringify(parts));
  return h.digest('hex').slice(0, 32);
}

/**
 * @param {string} skill
 * @param {unknown} parts
 * @param {number} ttlMs
 * @returns {object|null}
 */
export function cacheGet(skill, parts, ttlMs = 20 * 60 * 1000) {
  try {
    const key = cacheKey(skill, parts);
    const file = path.join(cacheDir(), `${skill}-${key}.json`);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || !raw.cachedAt || Date.now() - raw.cachedAt > ttlMs) return null;
    return { ...raw.payload, cached: true, cachedAt: raw.cachedAt };
  } catch {
    return null;
  }
}

export function cacheSet(skill, parts, payload) {
  try {
    const dir = cacheDir();
    fs.mkdirSync(dir, { recursive: true });
    const key = cacheKey(skill, parts);
    const file = path.join(dir, `${skill}-${key}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({ cachedAt: Date.now(), skill, parts, payload }, null, 2),
    );
  } catch (e) {
    console.error(`[cache] write failed: ${e.message}`);
  }
}

/* ── Page text helpers (used by page-fetch / web-diff) ─────────── */

export const EXTRACT_MAIN_JS = `(() => {
  const meta = {};
  document.querySelectorAll('meta[name], meta[property]').forEach(m => {
    const k = m.getAttribute('name') || m.getAttribute('property');
    const v = m.getAttribute('content');
    if (k && v) meta[k] = v;
  });
  const canonical = document.querySelector('link[rel=canonical]')?.href || '';
  const candidates = [
    ...document.querySelectorAll('article, [role=main], main, #content, #main, .post-content, .article-body')
  ];
  let mainText = '';
  for (const el of candidates) {
    const t = (el.innerText || '').trim();
    if (t.length > mainText.length) mainText = t;
  }
  if (mainText.length < 200) mainText = (document.body?.innerText || '').trim();
  // strip very short chrome lines
  const lines = mainText.split('\\n').map(l => l.trim()).filter(l => l.length > 1);
  const skip = /^(skip to|sign in|log in|cookie|accept all|privacy|terms|subscribe|menu)$/i;
  mainText = lines.filter(l => !skip.test(l)).join('\\n').trim();
  const links = [];
  const seen = new Set();
  document.querySelectorAll('a[href^="http"]').forEach(a => {
    try {
      const u = new URL(a.href);
      if (seen.has(u.href)) return;
      seen.add(u.href);
      const title = (a.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 120);
      if (title.length >= 2) links.push({ title, url: a.href });
    } catch (_) {}
  });
  return {
    title: document.title || '',
    url: location.href || '',
    canonical,
    description: meta['description'] || meta['og:description'] || '',
    meta,
    mainText: mainText.slice(0, 50000),
    links: links.slice(0, 40),
    rawLength: (document.body?.innerText || '').length,
  };
})()`;
