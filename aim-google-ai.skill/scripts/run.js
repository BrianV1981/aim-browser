#!/usr/bin/env node
/**
 * aim-google-ai — Google Search AI Mode (udm=50) via aim-browser CDP.
 *
 * Usage:
 *   node aim-google-ai.skill/scripts/run.js "query text"
 *   node aim-google-ai.skill/scripts/run.js --query "..." [--visible] [--no-start] [--stop-after]
 *   node aim-google-ai.skill/scripts/run.js --screenshot /tmp/out.png "query"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AimBrowser, startDaemon, stopDaemon, checkDaemon } from '../../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    query: '',
    visible: false,
    noStart: false,
    stopAfter: false,
    timeoutMs: 90000,
    screenshot: null,
    port: Number(process.env.CDP_PORT || 9222),
    host: process.env.CDP_ADDR || '127.0.0.1',
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query') opts.query = argv[++i] || '';
    else if (a === '--visible' || a === '--start-visible') opts.visible = true;
    else if (a === '--no-start') opts.noStart = true;
    else if (a === '--stop-after') opts.stopAfter = true;
    else if (a === '--timeout-ms') opts.timeoutMs = parseInt(argv[++i], 10) || opts.timeoutMs;
    else if (a === '--screenshot') opts.screenshot = argv[++i] || null;
    else if (a === '--port') opts.port = parseInt(argv[++i], 10) || opts.port;
    else if (a === '--host') opts.host = argv[++i] || opts.host;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!a.startsWith('-')) rest.push(a);
    else console.warn(`[aim-google-ai] unknown flag: ${a}`);
  }
  if (!opts.query && rest.length) opts.query = rest.join(' ');
  return opts;
}

function buildAiModeUrl(query) {
  const q = encodeURIComponent(query);
  // udm=50 = Google Search AI Mode (conversational AI results)
  return `https://www.google.com/search?q=${q}&udm=50&hl=en`;
}

async function ensureDaemon(opts) {
  try {
    checkDaemon();
    return;
  } catch {
    /* not up */
  }
  if (opts.noStart) {
    throw new Error('CDP daemon not running and --no-start was set. Run aim-browser --start first.');
  }
  console.error('[aim-google-ai] Starting aim-browser daemon…');
  startDaemon({ visible: opts.visible, minimized: !opts.visible });
  // Brief settle for CDP listener
  for (let i = 0; i < 25; i++) {
    try {
      checkDaemon();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  checkDaemon();
}

async function dismissConsent(browser) {
  try {
    await browser.evaluate(`(() => {
      const btns = [...document.querySelectorAll('button, input[type=submit], div[role=button]')];
      const b = btns.find(el => /accept all|i agree|^accept$|alle akzeptieren/i.test((el.innerText || el.value || '').trim()));
      if (b) { b.click(); return true; }
      return false;
    })()`);
    await new Promise((r) => setTimeout(r, 1200));
  } catch {
    /* ignore */
  }
}

/**
 * Wait until AI Mode has produced substantial answer text (or timeout).
 */
async function waitForAiAnswer(browser, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastLen = 0;
  let stable = 0;

  while (Date.now() < deadline) {
    const status = await browser.evaluate(`(() => {
      const body = document.body ? document.body.innerText : '';
      const thinking = /thinking a little longer|searching…|searching\\.\\.\\./i.test(body);
      // Prefer main content regions; fall back to body length
      const candidates = [
        ...document.querySelectorAll('[data-container-id], [data-attrid], main, #main, #center_col, [role=main]')
      ];
      let best = '';
      for (const el of candidates) {
        const t = (el.innerText || '').trim();
        if (t.length > best.length) best = t;
      }
      if (best.length < 200) best = body.trim();
      return { thinking, len: best.length, sample: best.slice(0, 120) };
    })()`);

    if (!status.thinking && status.len > 400) {
      if (status.len === lastLen) stable += 1;
      else stable = 0;
      lastLen = status.len;
      // two consecutive stable polls ≈ finished streaming
      if (stable >= 2) return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  // timeout: still return whatever we have
}

async function extractAiMode(browser) {
  return await browser.evaluate(`(() => {
    const bodyText = (document.body && document.body.innerText) || '';

    // Collect outbound source-like links (skip google internal)
    const sources = [];
    const seen = new Set();
    document.querySelectorAll('a[href^="http"]').forEach(a => {
      try {
        const u = new URL(a.href);
        if (u.hostname.includes('google.')) return;
        if (u.hostname.includes('gstatic.com')) return;
        if (u.hostname.includes('youtube.com') && u.pathname === '/watch') {
          /* allow */
        }
        const key = u.origin + u.pathname;
        if (seen.has(key)) return;
        seen.add(key);
        const title = (a.innerText || a.getAttribute('aria-label') || u.hostname).trim().replace(/\\s+/g, ' ');
        if (!title || title.length < 2) return;
        sources.push({ title: title.slice(0, 200), url: a.href });
      } catch (_) {}
    });

    // Heuristic: drop chrome UI lines; keep answer-ish block
    const lines = bodyText.split('\\n').map(l => l.trim()).filter(Boolean);
    const skip = /^(skip to|accessibility|sign in|ai mode|all$|videos|news|images|maps|shopping|more|tools|settings|privacy|terms)/i;
    const cleaned = lines.filter(l => !skip.test(l) && l.length > 1);

    // Prefer chunk after "AI Mode" or first long paragraph cluster
    let answer = cleaned.join('\\n');
    const aiIdx = cleaned.findIndex(l => /^ai mode$/i.test(l));
    if (aiIdx >= 0) answer = cleaned.slice(aiIdx + 1).join('\\n');

    // Truncate noise footer
    answer = answer
      .replace(/People also ask[\\s\\S]*$/i, '')
      .replace(/Related searches[\\s\\S]*$/i, '')
      .replace(/Footer links[\\s\\S]*$/i, '')
      .trim();

    return {
      title: document.title || '',
      url: location.href || '',
      answer,
      sources: sources.slice(0, 20),
      rawLength: bodyText.length,
    };
  })()`);
}

function printMarkdown(data, query) {
  console.log(`# Google AI Mode\n`);
  console.log(`**Query:** ${query}\n`);
  console.log(`**URL:** ${data.url}\n`);
  console.log(`## Answer\n`);
  console.log(data.answer || '_(empty — DOM may have changed or answer still loading)_');
  console.log(`\n## Sources\n`);
  if (!data.sources?.length) console.log('_No external sources extracted._');
  else data.sources.forEach((s, i) => console.log(`${i + 1}. [${s.title}](${s.url})`));
  console.log(`\n---JSON---`);
  console.log(JSON.stringify({ query, ...data }, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.query) {
    console.log(`Usage: node aim-google-ai.skill/scripts/run.js "query"
  --query <text>       Search query
  --visible            Show browser window (default minimized)
  --no-start           Do not start daemon if down
  --stop-after         Stop daemon when finished
  --timeout-ms <n>     Wait for AI answer (default 90000)
  --screenshot <path>  Save PNG proof
  --port / --host      CDP endpoint (default 127.0.0.1:9222)`);
    process.exit(opts.help ? 0 : 1);
  }

  // Align check.sh with custom port
  process.env.CDP_PORT = String(opts.port);
  process.env.CDP_ADDR = opts.host === 'localhost' ? '127.0.0.1' : opts.host;

  await ensureDaemon(opts);

  const browser = new AimBrowser({ port: opts.port, host: opts.host });
  try {
    await browser.connect();
    const url = buildAiModeUrl(opts.query);
    console.error(`[aim-google-ai] Opening AI Mode: ${url}`);
    const tab = await browser.openTab(url);
    await browser.connect(tab.id);
    await browser.waitReady(Math.min(opts.timeoutMs, 45000));
    await dismissConsent(browser);
    if (opts.visible) {
      await browser.showWindow().catch(() => {});
    }

    console.error('[aim-google-ai] Waiting for AI Mode answer…');
    await waitForAiAnswer(browser, opts.timeoutMs);

    const data = await extractAiMode(browser);

    if (opts.screenshot) {
      const b64 = await browser.screenshot({ format: 'png' });
      fs.mkdirSync(path.dirname(path.resolve(opts.screenshot)), { recursive: true });
      fs.writeFileSync(opts.screenshot, Buffer.from(b64, 'base64'));
      console.error(`[aim-google-ai] Screenshot: ${opts.screenshot}`);
      data.screenshot = opts.screenshot;
    }

    printMarkdown(data, opts.query);
    await browser.close();
  } catch (e) {
    console.error(`[aim-google-ai] Fatal: ${e.message}`);
    try { await browser.close(); } catch { /* */ }
    process.exit(1);
  } finally {
    if (opts.stopAfter) {
      try { stopDaemon(); } catch { /* */ }
    }
  }
}

main();
