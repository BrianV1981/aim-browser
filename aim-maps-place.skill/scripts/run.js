#!/usr/bin/env node
/**
 * aim-maps-place — Google Maps place search → name, address, rating (best-effort).
 */
import {
  parseSkillArgs, openSession, endSession, saveScreenshot,
  printJsonBlock, commonHelpFlags, cacheGet, cacheSet, sleep,
} from '../../src/skill-utils.js';

const LABEL = 'aim-maps-place';

function buildUrl(query, url) {
  if (url) return url;
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

const EXTRACT_JS = `(() => {
  const body = document.body?.innerText || '';
  const title = document.title || '';
  // Common Maps place header
  const name =
    document.querySelector('h1')?.innerText?.trim() ||
    document.querySelector('[data-attrid="title"]')?.innerText?.trim() ||
    title.split(' - ')[0] || '';
  let address = '';
  let phone = '';
  let website = '';
  let rating = '';
  let reviewCount = '';
  let hours = '';
  // buttons / data items
  document.querySelectorAll('button[data-item-id], button[aria-label], a[data-item-id]').forEach(el => {
    const label = (el.getAttribute('aria-label') || el.innerText || '').trim();
    const id = el.getAttribute('data-item-id') || '';
    if (/address|坐:0x/i.test(id) || /^\\d+ .*/.test(label)) {
      if (!address && label.length > 8) address = label.replace(/^Address:\\s*/i, '');
    }
    if (/phone|tel:/i.test(id) || /\\+?\\d[\\d\\s().-]{7,}/.test(label)) {
      if (!phone) phone = label.replace(/^Phone:\\s*/i, '');
    }
    if (/authority|website/i.test(id) && el.href) website = el.href;
  });
  const rateEl = document.querySelector('div[role="img"][aria-label*="star"], span[aria-label*="star"]');
  if (rateEl) {
    const al = rateEl.getAttribute('aria-label') || '';
    const m = al.match(/([0-9.]+)\\s*star/i);
    if (m) rating = m[1];
    const rm = al.match(/([0-9,]+)\\s*review/i);
    if (rm) reviewCount = rm[1];
  }
  // fallback scan body lines
  const lines = body.split('\\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 80)) {
    if (!address && /\\d+ .+,.+/.test(line) && line.length < 120) address = line;
    if (!hours && /^(open|closed|hours)/i.test(line)) hours = line;
  }
  return {
    name,
    address,
    phone,
    website,
    rating,
    reviewCount,
    hours,
    mapsUrl: location.href,
    title,
    rawLength: body.length,
  };
})()`;

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2));
  const query = opts.raw.query || opts.rest.join(' ');
  const urlIn = opts.raw.url || '';
  if (opts.help || (!query && !urlIn)) {
    console.log(`Usage: node aim-maps-place.skill/scripts/run.js "place query"
  --query <text>
  --url <maps-url>
${commonHelpFlags()}`);
    process.exit(opts.help ? 0 : 1);
  }

  const url = buildUrl(query, urlIn);
  const cacheParts = { query, url: urlIn };
  if (!opts.noCache) {
    const hit = cacheGet(LABEL, cacheParts);
    if (hit) {
      console.error(`[${LABEL}] Cache hit`);
      printResult(hit, query);
      return;
    }
  }

  let browser, keepOffDesk;
  try {
    ({ browser, keepOffDesk } = await openSession(opts, url, LABEL));
    await sleep(4000);
    let data = await browser.evaluate(EXTRACT_JS);
    if (opts.screenshot) {
      data.screenshot = await saveScreenshot(browser, opts.screenshot, keepOffDesk);
    }
    cacheSet(LABEL, cacheParts, data);
    printResult(data, query);
  } catch (e) {
    console.error(`[${LABEL}] Fatal: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await endSession(browser, keepOffDesk, opts, LABEL);
  }
}

function printResult(data, query) {
  console.log(`# Maps place\n`);
  if (query) console.log(`**Query:** ${query}\n`);
  console.log(`**Name:** ${data.name || '—'}\n`);
  console.log(`**Address:** ${data.address || '—'}\n`);
  console.log(`**Rating:** ${data.rating || '—'} ${data.reviewCount ? `(${data.reviewCount})` : ''}\n`);
  console.log(`**Phone:** ${data.phone || '—'}\n`);
  console.log(`**Website:** ${data.website || '—'}\n`);
  console.log(`**Maps URL:** ${data.mapsUrl || ''}\n`);
  if (data.cached) console.log(`**Cached:** yes\n`);
  printJsonBlock({ skill: LABEL, query, ...data });
}

main();
