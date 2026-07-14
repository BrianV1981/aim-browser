#!/usr/bin/env node
/**
 * aim-google-news — Google News search headlines.
 */
import {
  parseSkillArgs, openSession, endSession, saveScreenshot,
  printJsonBlock, commonHelpFlags, cacheGet, cacheSet, sleep,
} from '../../src/skill-utils.js';

const LABEL = 'aim-google-news';

function buildUrl(query) {
  // tbm=nws = Google News vertical
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws&hl=en`;
}

const EXTRACT_JS = `(() => {
  const items = [];
  const seen = new Set();
  const root = document.querySelector('#search') || document.querySelector('#rso') || document.body;
  root.querySelectorAll('a[href^="http"]').forEach(a => {
    try {
      const u = new URL(a.href);
      if (u.hostname.includes('google.')) return;
      const title = (a.innerText || '').trim().replace(/\\s+/g, ' ');
      if (title.length < 12 || title.length > 220) return;
      if (seen.has(u.href)) return;
      seen.add(u.href);
      let source = '';
      let time = '';
      const block = a.closest('div');
      if (block) {
        const full = (block.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
        // often source and relative time near title
        for (const line of full) {
          if (line === title) continue;
          if (/ago|hour|min|yesterday|\\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(line) && line.length < 40) {
            time = line;
          } else if (line.length < 40 && !source) source = line;
        }
      }
      items.push({ title, url: a.href, source, time, snippet: '' });
    } catch (_) {}
  });
  return {
    title: document.title || '',
    url: location.href || '',
    headlines: items.slice(0, 20),
    rawLength: (document.body?.innerText || '').length,
  };
})()`;

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2));
  const query = opts.raw.query || opts.rest.join(' ');
  if (opts.help || !query) {
    console.log(`Usage: node aim-google-news.skill/scripts/run.js "query"
  --query <text>
${commonHelpFlags()}`);
    process.exit(opts.help ? 0 : 1);
  }

  const cacheParts = { query, mode: 'tbm=nws' };
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
    await sleep(2500);
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
  console.log(`# Google News\n`);
  console.log(`**Query:** ${query}\n`);
  console.log(`**URL:** ${data.url || ''}\n`);
  if (data.cached) console.log(`**Cached:** yes\n`);
  console.log(`## Headlines\n`);
  if (!data.headlines?.length) console.log('_No headlines extracted._');
  else data.headlines.forEach((h, i) => {
    const meta = [h.source, h.time].filter(Boolean).join(' · ');
    console.log(`${i + 1}. **[${h.title}](${h.url})**${meta ? ` — ${meta}` : ''}`);
  });
  printJsonBlock({ skill: LABEL, query, ...data });
}

main();
