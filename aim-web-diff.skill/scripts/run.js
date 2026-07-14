#!/usr/bin/env node
/**
 * aim-web-diff — Snapshot page mainText twice or vs baseline → diff.
 * Exit: 0 no change, 2 changed, 1 error
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  parseSkillArgs, openSession, endSession, saveScreenshot,
  printJsonBlock, commonHelpFlags, EXTRACT_MAIN_JS, sleep,
} from '../../src/skill-utils.js';

const LABEL = 'aim-web-diff';

function lineDiff(a, b) {
  const al = a.split('\n');
  const bl = b.split('\n');
  const as = new Set(al);
  const bs = new Set(bl);
  const removed = al.filter((l) => !bs.has(l)).slice(0, 40);
  const added = bl.filter((l) => !as.has(l)).slice(0, 40);
  return { removed, added, changed: removed.length > 0 || added.length > 0 };
}

async function fetchMain(opts, url, label) {
  const { browser, keepOffDesk } = await openSession(opts, url, label);
  try {
    await sleep(1000);
    const data = await browser.evaluate(EXTRACT_MAIN_JS);
    return { data, browser, keepOffDesk };
  } catch (e) {
    await endSession(browser, keepOffDesk, { ...opts, stopAfter: false }, label);
    throw e;
  }
}

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2));
  const url = opts.raw.url || opts.rest[0] || '';
  const baselinePath = opts.raw.baseline || '';
  const intervalMs = parseInt(String(opts.raw['interval-ms'] || '0'), 10) || 0;
  const saveBaseline = opts.raw['save-baseline'] || baselinePath || '';

  if (opts.help || !url) {
    console.log(`Usage: node aim-web-diff.skill/scripts/run.js --url URL [options]
  --url <url>
  --baseline <path.json>   Compare to previous snapshot file
  --save-baseline <path>   Write current snapshot JSON
  --interval-ms <n>        Two captures in one process (wait between)
${commonHelpFlags()}

Exit codes: 0 = no change, 2 = changed, 1 = error`);
    process.exit(opts.help ? 0 : 1);
  }

  // For dual capture we keep daemon for second shot
  const keepOpenOpts = { ...opts, stopAfter: false };
  let browser, keepOffDesk;
  let exitCode = 0;

  try {
    let beforeText = '';
    let afterText = '';
    let beforeMeta = null;
    let afterMeta = null;

    if (baselinePath && fs.existsSync(baselinePath)) {
      const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      beforeText = base.mainText || '';
      beforeMeta = base;
      ({ browser, keepOffDesk } = await openSession(keepOpenOpts, url, LABEL));
      await sleep(1000);
      afterMeta = await browser.evaluate(EXTRACT_MAIN_JS);
      afterText = afterMeta.mainText || '';
    } else if (intervalMs > 0) {
      ({ browser, keepOffDesk } = await openSession(keepOpenOpts, url, LABEL));
      await sleep(800);
      beforeMeta = await browser.evaluate(EXTRACT_MAIN_JS);
      beforeText = beforeMeta.mainText || '';
      console.error(`[${LABEL}] Waiting ${intervalMs}ms for second snapshot…`);
      await sleep(intervalMs);
      await browser.evaluate('location.reload()').catch(() => {});
      await browser.waitReady(30000).catch(() => {});
      await sleep(800);
      afterMeta = await browser.evaluate(EXTRACT_MAIN_JS);
      afterText = afterMeta.mainText || '';
    } else {
      // Single capture: establish baseline only
      ({ browser, keepOffDesk } = await openSession(keepOpenOpts, url, LABEL));
      await sleep(800);
      afterMeta = await browser.evaluate(EXTRACT_MAIN_JS);
      afterText = afterMeta.mainText || '';
      beforeText = afterText;
      beforeMeta = afterMeta;
      console.error(`[${LABEL}] Single capture — use --baseline or --interval-ms for real diff`);
    }

    if (opts.screenshot) {
      afterMeta.screenshot = await saveScreenshot(browser, opts.screenshot, keepOffDesk);
    }

    if (saveBaseline) {
      const abs = path.resolve(saveBaseline);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, JSON.stringify(afterMeta, null, 2));
      console.error(`[${LABEL}] Saved baseline: ${abs}`);
    }

    const diff = lineDiff(beforeText, afterText);
    exitCode = diff.changed ? 2 : 0;

    console.log(`# Web diff\n`);
    console.log(`**URL:** ${url}\n`);
    console.log(`**Changed:** ${diff.changed}\n`);
    console.log(`## Removed (sample)\n`);
    if (!diff.removed.length) console.log('_none_');
    else diff.removed.forEach((l) => console.log(`- ${l.slice(0, 200)}`));
    console.log(`\n## Added (sample)\n`);
    if (!diff.added.length) console.log('_none_');
    else diff.added.forEach((l) => console.log(`+ ${l.slice(0, 200)}`));
    printJsonBlock({
      skill: LABEL,
      url,
      changed: diff.changed,
      removed: diff.removed,
      added: diff.added,
      beforeLength: beforeText.length,
      afterLength: afterText.length,
      screenshot: afterMeta?.screenshot || null,
    });
  } catch (e) {
    console.error(`[${LABEL}] Fatal: ${e.message}`);
    exitCode = 1;
  } finally {
    // Always honor original stopAfter for cleanup
    await endSession(browser, keepOffDesk, opts, LABEL);
    process.exit(exitCode);
  }
}

main();
