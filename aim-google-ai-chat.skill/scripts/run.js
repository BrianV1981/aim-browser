#!/usr/bin/env node
/**
 * aim-google-ai-chat — Multi-turn Google AI Mode (udm=50).
 * Initial query via URL; follow-ups typed into page input when found.
 */
import fs from 'node:fs';
import {
  parseSkillArgs, openSession, endSession, saveScreenshot,
  printJsonBlock, commonHelpFlags, sleep, dismissConsent,
} from '../../src/skill-utils.js';

const LABEL = 'aim-google-ai-chat';

function buildAiModeUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=50&hl=en`;
}

async function waitForAiAnswer(browser, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastLen = 0;
  let stable = 0;
  while (Date.now() < deadline) {
    const status = await browser.evaluate(`(() => {
      const body = document.body ? document.body.innerText : '';
      const thinking = /thinking a little longer|searching…|searching\\.\\.\\./i.test(body);
      return { thinking, len: body.trim().length };
    })()`);
    if (!status.thinking && status.len > 400) {
      if (status.len === lastLen) stable += 1;
      else stable = 0;
      lastLen = status.len;
      if (stable >= 2) return;
    }
    await sleep(1500);
  }
}

async function extractAnswer(browser) {
  return browser.evaluate(`(() => {
    const bodyText = (document.body && document.body.innerText) || '';
    const sources = [];
    const seen = new Set();
    document.querySelectorAll('a[href^="http"]').forEach(a => {
      try {
        const u = new URL(a.href);
        if (u.hostname.includes('google.') || u.hostname.includes('gstatic.com')) return;
        const key = u.origin + u.pathname;
        if (seen.has(key)) return;
        seen.add(key);
        const title = (a.innerText || u.hostname).trim().replace(/\\s+/g, ' ').slice(0, 200);
        if (title.length >= 2) sources.push({ title, url: a.href });
      } catch (_) {}
    });
    return {
      title: document.title || '',
      url: location.href || '',
      answer: bodyText.trim().slice(0, 12000),
      sources: sources.slice(0, 15),
      rawLength: bodyText.length,
    };
  })()`);
}

async function sendFollowUp(browser, text) {
  // Try common AI Mode / search chat inputs
  const ok = await browser.evaluate(`(() => {
    const candidates = [
      ...document.querySelectorAll('textarea, input[type=text], div[contenteditable="true"], div[role="textbox"]')
    ];
    const el = candidates.find(e => {
      const r = e.getBoundingClientRect();
      return r.width > 80 && r.height > 20 && r.bottom > 0;
    });
    if (!el) return false;
    el.focus();
    if ('value' in el) {
      el.value = ${JSON.stringify('')};
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.textContent = '';
    }
    return true;
  })()`);
  if (!ok) return false;
  await browser.send('Input.insertText', { text }).catch(async () => {
    await browser.keyType(text);
  });
  await sleep(300);
  await browser.keyPress({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  return true;
}

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2), {
    extraFlags: ['follow-up', 'turns'],
  });
  // support repeated --follow-up via manual argv scan
  const followUps = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--follow-up' && argv[i + 1]) followUps.push(argv[++i]);
  }
  if (opts.raw.turns) {
    try {
      const arr = JSON.parse(fs.readFileSync(opts.raw.turns, 'utf8'));
      if (Array.isArray(arr)) followUps.push(...arr.map(String));
    } catch (e) {
      console.error(`[${LABEL}] --turns file error: ${e.message}`);
      process.exit(1);
    }
  }

  const query = opts.raw.query || opts.rest.join(' ');
  if (opts.help || !query) {
    console.log(`Usage: node aim-google-ai-chat.skill/scripts/run.js "initial query"
  --follow-up "…"     Repeatable follow-up turns
  --turns <file.json> JSON array of follow-up strings
${commonHelpFlags()}`);
    process.exit(opts.help ? 0 : 1);
  }

  let browser, keepOffDesk;
  const transcript = [];
  try {
    ({ browser, keepOffDesk } = await openSession(opts, buildAiModeUrl(query), LABEL));
    console.error(`[${LABEL}] Waiting for initial answer…`);
    await waitForAiAnswer(browser, opts.timeoutMs);
    let data = await extractAnswer(browser);
    transcript.push({ role: 'user', text: query });
    transcript.push({ role: 'assistant', text: data.answer, sources: data.sources });

    for (const fu of followUps) {
      console.error(`[${LABEL}] Follow-up: ${fu}`);
      await keepOffDesk();
      const sent = await sendFollowUp(browser, fu);
      if (!sent) {
        console.error(`[${LABEL}] Could not find chat input for follow-up`);
        transcript.push({ role: 'system', text: 'follow-up input not found' });
        break;
      }
      await waitForAiAnswer(browser, opts.timeoutMs);
      data = await extractAnswer(browser);
      transcript.push({ role: 'user', text: fu });
      transcript.push({ role: 'assistant', text: data.answer, sources: data.sources });
      await keepOffDesk();
    }

    if (opts.screenshot) {
      data.screenshot = await saveScreenshot(browser, opts.screenshot, keepOffDesk);
    }

    console.log(`# Google AI Mode chat\n`);
    console.log(`**Turns:** ${transcript.filter((t) => t.role === 'user').length}\n`);
    console.log(`**URL:** ${data.url || ''}\n`);
    console.log(`## Transcript\n`);
    for (const t of transcript) {
      console.log(`### ${t.role}\n`);
      console.log((t.text || '').slice(0, 4000));
      console.log('');
    }
    printJsonBlock({
      skill: LABEL,
      query,
      followUps,
      transcript,
      final: data,
    });
  } catch (e) {
    console.error(`[${LABEL}] Fatal: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await endSession(browser, keepOffDesk, opts, LABEL);
  }
}

main();
