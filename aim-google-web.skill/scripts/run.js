#!/usr/bin/env node
/**
 * aim-google-web — Classic / web-only Google SERP (udm=14).
 */
import {
  parseSkillArgs, openSession, endSession, saveScreenshot,
  printJsonBlock, commonHelpFlags, cacheGet, cacheSet, sleep,
} from '../../src/skill-utils.js';

const LABEL = 'aim-google-web';

function buildUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=14&hl=en`;
}

const EXTRACT_JS = `(() => {
  const results = [];
  const seen = new Set();
  // Organic-ish anchors in main
  const root = document.querySelector('#search') || document.querySelector('#rso') || document.body;
  root.querySelectorAll('a[href^="http"]').forEach(a => {
    try {
      const u = new URL(a.href);
      if (u.hostname.includes('google.')) return;
      if (u.hostname.includes('gstatic.com')) return;
      if (u.hostname.includes('youtube.com') && !u.searchParams.get('v') && u.pathname === '/') return;
      const title = (a.innerText || '').trim().replace(/\\s+/g, ' ');
      if (title.length < 5 || title.length > 200) return;
      // skip nav crumbs
      if (/^(cached|similar|translate)/i.test(title)) return;
      const key = u.origin + u.pathname;
      if (seen.has(key)) return;
      seen.add(key);
      let snippet = '';
      const parent = a.closest('div');
      if (parent) {
        const t = (parent.innerText || '').trim();
        if (t.length > title.length + 10) snippet = t.slice(title.length, title.length + 280).trim();
      }
      results.push({ rank: results.length + 1, title, url: a.href, snippet });
    } catch (_) {}
  });
  return {
    title: document.title || '',
    url: location.href || '',
    results: results.slice(0, 15),
    rawLength: (document.body?.innerText || '').length,
  };
})()`;

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2));
  const query = opts.raw.query || opts.rest.join(' ');
  if (opts.help || !query) {
    console.log(`Usage: node aim-google-web.skill/scripts/run.js "query"
  --query <text>
${commonHelpFlags()}`);
    process.exit(opts.help ? 0 : 1);
  }

  const cacheParts = { query, mode: 'udm14' };
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
    ({ browser, keepOffDesk } = await openSession(opts, buildUrl(query), LABEL));
    await sleep(2000);
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
  console.log(`# Google Web (udm=14)\n`);
  console.log(`**Query:** ${query}\n`);
  console.log(`**URL:** ${data.url || ''}\n`);
  if (data.cached) console.log(`**Cached:** yes\n`);
  console.log(`## Results\n`);
  if (!data.results?.length) console.log('_No organic results extracted (DOM may have changed)._');
  else data.results.forEach((r) => {
    console.log(`${r.rank}. **[${r.title}](${r.url})**`);
    if (r.snippet) console.log(`   ${r.snippet}`);
  });
  printJsonBlock({ skill: LABEL, query, ...data });
}

main();
