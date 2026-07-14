#!/usr/bin/env node
/**
 * aim-form-fill — Fill known form fields with strict allowlist.
 * Never submits unless --submit. Redacts password-like values in output.
 */
import fs from 'node:fs';
import {
  parseSkillArgs, openSession, endSession, saveScreenshot,
  printJsonBlock, commonHelpFlags, sleep,
} from '../../src/skill-utils.js';

const LABEL = 'aim-form-fill';

function loadFields(opts) {
  if (opts.raw.fields) {
    return JSON.parse(opts.raw.fields);
  }
  if (opts.raw['fields-file']) {
    return JSON.parse(fs.readFileSync(opts.raw['fields-file'], 'utf8'));
  }
  return null;
}

function hostAllowed(pageUrl, allowHost) {
  if (!allowHost) return false;
  try {
    const u = new URL(pageUrl);
    const allowed = String(allowHost).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    // Local fixtures: --allow-host file  or  file://
    if (u.protocol === 'file:' && allowed.some((a) => a === 'file' || a === 'file:')) return true;
    const h = u.hostname.toLowerCase();
    return allowed.some((a) => h === a || h.endsWith(`.${a}`));
  } catch {
    return false;
  }
}

function redact(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (/pass|secret|token|pwd/i.test(k) || /pass|secret|token/i.test(String(v))) {
      out[k] = '***REDACTED***';
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2));
  const url = opts.raw.url || opts.rest[0] || '';
  const allowHost = opts.raw['allow-host'] || '';
  const doSubmit = Boolean(opts.raw.submit);
  let fields;
  try {
    fields = loadFields(opts);
  } catch (e) {
    console.error(`[${LABEL}] Invalid fields JSON: ${e.message}`);
    process.exit(1);
  }

  if (opts.help || !url || !fields || !allowHost) {
    console.log(`Usage: node aim-form-fill.skill/scripts/run.js --url URL --allow-host example.com --fields '{"#q":"x"}'
  --url <url>
  --allow-host <host[,host]>   Required allowlist
  --fields <json>              Selector → value map (CSS selectors)
  --fields-file <path>         JSON file instead of --fields
  --submit                     Actually submit (default: fill only)
${commonHelpFlags()}`);
    process.exit(opts.help ? 0 : 1);
  }

  if (!hostAllowed(url, allowHost)) {
    // also check after navigation — precheck hostname of requested url
    try {
      if (!hostAllowed(url, allowHost)) {
        console.error(`[${LABEL}] Refused: host not in --allow-host (${allowHost})`);
        process.exit(1);
      }
    } catch {
      console.error(`[${LABEL}] Refused: invalid url`);
      process.exit(1);
    }
  }

  let browser, keepOffDesk;
  const actions = [];
  try {
    ({ browser, keepOffDesk } = await openSession(opts, url, LABEL));
    const finalUrl = await browser.evaluate('location.href');
    if (!hostAllowed(finalUrl, allowHost)) {
      throw new Error(`Navigated host not allowlisted: ${finalUrl}`);
    }

    for (const [selector, value] of Object.entries(fields)) {
      const safeVal = String(value);
      const filled = await browser.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, reason: 'not found' };
        el.focus();
        if ('value' in el) {
          el.value = ${JSON.stringify(safeVal)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.textContent = ${JSON.stringify(safeVal)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          return { ok: false, reason: 'not fillable' };
        }
        return { ok: true, tag: el.tagName.toLowerCase() };
      })()`);
      actions.push({ selector, ok: filled.ok, reason: filled.reason, tag: filled.tag });
      console.error(`[${LABEL}] fill ${selector}: ${filled.ok ? 'ok' : filled.reason}`);
    }

    if (doSubmit) {
      const submitted = await browser.evaluate(`(() => {
        const form = document.querySelector('form');
        if (form) { form.submit(); return 'form.submit'; }
        const btn = document.querySelector('button[type=submit], input[type=submit]');
        if (btn) { btn.click(); return 'click submit'; }
        return null;
      })()`);
      actions.push({ submit: submitted || 'no submit control found' });
      await sleep(1500);
    } else {
      actions.push({ submit: 'skipped (pass --submit to submit)' });
    }

    let screenshot = null;
    if (opts.screenshot) {
      screenshot = await saveScreenshot(browser, opts.screenshot, keepOffDesk);
    }

    const result = {
      skill: LABEL,
      url: finalUrl,
      allowHost,
      submitted: doSubmit,
      actions,
      fields: redact(fields),
      screenshot,
    };
    console.log(`# Form fill\n`);
    console.log(`**URL:** ${finalUrl}\n`);
    console.log(`**Submit:** ${doSubmit}\n`);
    console.log(`## Actions\n`);
    actions.forEach((a) => console.log(`- \`${JSON.stringify(a)}\``));
    printJsonBlock(result);
  } catch (e) {
    console.error(`[${LABEL}] Fatal: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await endSession(browser, keepOffDesk, opts, LABEL);
  }
}

main();
