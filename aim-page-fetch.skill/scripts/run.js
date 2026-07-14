#!/usr/bin/env node
/**
 * aim-page-fetch — Open URL → main text + title + meta.
 */
import {
  parseSkillArgs, openSession, endSession, saveScreenshot,
  printJsonBlock, commonHelpFlags, EXTRACT_MAIN_JS, cacheGet, cacheSet,
} from '../../src/skill-utils.js';

const LABEL = 'aim-page-fetch';

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2));
  const url = opts.raw.url || opts.rest[0] || '';
  const maxChars = parseInt(String(opts.raw['max-chars'] || '50000'), 10) || 50000;

  if (opts.help || !url) {
    console.log(`Usage: node aim-page-fetch.skill/scripts/run.js <url>
  --url <url>          Target URL
  --max-chars <n>      Truncate mainText (default 50000)
${commonHelpFlags()}`);
    process.exit(opts.help ? 0 : 1);
  }

  const cacheParts = { url, maxChars };
  if (!opts.noCache) {
    const hit = cacheGet(LABEL, cacheParts);
    if (hit) {
      console.error(`[${LABEL}] Cache hit`);
      printResult(hit, url);
      return;
    }
  }

  let browser, keepOffDesk;
  try {
    ({ browser, keepOffDesk } = await openSession(opts, url, LABEL));
    await new Promise((r) => setTimeout(r, 800));
    let data = await browser.evaluate(EXTRACT_MAIN_JS);
    if (data.mainText && data.mainText.length > maxChars) {
      data.mainText = data.mainText.slice(0, maxChars);
    }
    if (opts.screenshot) {
      data.screenshot = await saveScreenshot(browser, opts.screenshot, keepOffDesk);
    }
    cacheSet(LABEL, cacheParts, data);
    printResult(data, url);
  } catch (e) {
    console.error(`[${LABEL}] Fatal: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await endSession(browser, keepOffDesk, opts, LABEL);
  }
}

function printResult(data, url) {
  console.log(`# Page fetch\n`);
  console.log(`**URL:** ${data.url || url}\n`);
  console.log(`**Title:** ${data.title || '_(none)_'}\n`);
  if (data.description) console.log(`**Description:** ${data.description}\n`);
  if (data.cached) console.log(`**Cached:** yes (at ${new Date(data.cachedAt).toISOString()})\n`);
  console.log(`## Main text\n`);
  console.log(data.mainText || '_(empty)_');
  if (data.links?.length) {
    console.log(`\n## Links (sample)\n`);
    data.links.slice(0, 15).forEach((l, i) => console.log(`${i + 1}. [${l.title}](${l.url})`));
  }
  printJsonBlock({ skill: LABEL, ...data });
}

main();
