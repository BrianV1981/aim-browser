#!/usr/bin/env node
/**
 * aim-login-hold — Open URL, optionally show window, wait for Operator signal, then continue.
 * Does not steal passwords. Human logs in manually.
 */
import fs from 'node:fs';
import {
  parseSkillArgs, ensureDaemon, applyCdpEnv, endSession, saveScreenshot,
  printJsonBlock, commonHelpFlags, sleep, AimBrowser, dismissConsent,
} from '../../src/skill-utils.js';

const LABEL = 'aim-login-hold';

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2));
  // Default visible for human login unless --minimized
  if (!opts.raw.minimized) opts.visible = true;

  const url = opts.raw.url || opts.rest[0] || '';
  const readyFile = opts.raw['ready-file'] || '';
  const untilIncludes = opts.raw['until-url-includes'] || '';
  const maxWaitMs = parseInt(String(opts.raw['max-wait-ms'] || opts.timeoutMs || 300000), 10);

  if (opts.help || !url || (!readyFile && !untilIncludes)) {
    console.log(`Usage: node aim-login-hold.skill/scripts/run.js --url URL (--ready-file PATH | --until-url-includes STR)
  --url <url>
  --ready-file <path>          Continue when this file exists (Operator touches it)
  --until-url-includes <str>   Continue when location.href includes string
  --max-wait-ms <n>            Default 300000 (5m)
  --minimized                  Do not force visible (default: visible for login)
${commonHelpFlags()}`);
    process.exit(opts.help ? 0 : 1);
  }

  applyCdpEnv(opts);
  let browser;
  const keepOffDesk = async () => {
    if (opts.visible) return;
    await browser.minimizeWindow().catch(() => {});
  };

  try {
    await ensureDaemon(opts, LABEL);
    browser = new AimBrowser({ port: opts.port, host: opts.host });
    await browser.connect();
    console.error(`[${LABEL}] Opening for human login: ${url}`);
    const tab = await browser.openTab(url);
    await browser.connect(tab.id);
    await browser.waitReady(45000).catch(() => {});
    await dismissConsent(browser);
    if (opts.visible) await browser.showWindow().catch(() => {});

    console.error(`[${LABEL}] Waiting up to ${maxWaitMs}ms for Operator…`);
    if (readyFile) console.error(`[${LABEL}] Touch file when done: ${readyFile}`);
    if (untilIncludes) console.error(`[${LABEL}] Or navigate until URL includes: ${untilIncludes}`);

    const deadline = Date.now() + maxWaitMs;
    let ok = false;
    while (Date.now() < deadline) {
      if (readyFile && fs.existsSync(readyFile)) {
        ok = true;
        break;
      }
      if (untilIncludes) {
        const href = await browser.evaluate('location.href').catch(() => '');
        if (href.includes(untilIncludes)) {
          ok = true;
          break;
        }
      }
      await sleep(1000);
    }

    if (!ok) throw new Error('Login hold timed out without ready signal');

    const finalUrl = await browser.evaluate('location.href');
    const title = await browser.evaluate('document.title');
    let screenshot = null;
    if (opts.screenshot) {
      screenshot = await saveScreenshot(browser, opts.screenshot, keepOffDesk);
    }

    console.log(`# Login hold complete\n`);
    console.log(`**URL:** ${finalUrl}\n`);
    console.log(`**Title:** ${title}\n`);
    printJsonBlock({
      skill: LABEL,
      ok: true,
      url: finalUrl,
      title,
      readyFile: readyFile || null,
      untilIncludes: untilIncludes || null,
      screenshot,
      note: 'Operator completed human login/CAPTCHA; session cookies remain in profile until daemon stop',
    });
  } catch (e) {
    console.error(`[${LABEL}] Fatal: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await endSession(browser, keepOffDesk, opts, LABEL);
  }
}

main();
