#!/usr/bin/env node
/**
 * aim-screenshot-url — Open URL → PNG (viewport or full page).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  parseSkillArgs, openSession, endSession, printJsonBlock, commonHelpFlags,
} from '../../src/skill-utils.js';

const LABEL = 'aim-screenshot-url';

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2));
  const url = opts.raw.url || opts.rest[0] || '';
  const out = opts.screenshot || opts.raw.out || `/tmp/aim-screenshot-${Date.now()}.png`;
  const fullpage = Boolean(opts.raw['full-page'] || opts.raw.fullpage);

  if (opts.help || !url) {
    console.log(`Usage: node aim-screenshot-url.skill/scripts/run.js <url>
  --url <url>
  --out <path>         Output PNG (alias: --screenshot)
  --full-page          Full-page capture when supported
${commonHelpFlags()}`);
    process.exit(opts.help ? 0 : 1);
  }

  opts.screenshot = out;
  let browser, keepOffDesk;
  try {
    ({ browser, keepOffDesk } = await openSession(opts, url, LABEL));
    await new Promise((r) => setTimeout(r, 1000));
    const b64 = await browser.screenshot({ format: 'png', fullpage });
    const abs = path.resolve(out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const buf = Buffer.from(b64, 'base64');
    fs.writeFileSync(abs, buf);
    console.error(`[${LABEL}] Wrote ${abs} (${buf.length} bytes)`);

    const title = await browser.evaluate('document.title').catch(() => '');
    const finalUrl = await browser.evaluate('location.href').catch(() => url);

    console.log(`# Screenshot\n`);
    console.log(`**URL:** ${finalUrl}\n`);
    console.log(`**Title:** ${title}\n`);
    console.log(`**File:** ${abs}\n`);
    console.log(`**Bytes:** ${buf.length}\n`);
    console.log(`**Full page:** ${fullpage}\n`);
    printJsonBlock({
      skill: LABEL,
      url: finalUrl,
      title,
      screenshot: abs,
      bytes: buf.length,
      fullpage,
    });
  } catch (e) {
    console.error(`[${LABEL}] Fatal: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await endSession(browser, keepOffDesk, opts, LABEL);
  }
}

main();
