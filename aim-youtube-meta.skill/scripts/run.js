#!/usr/bin/env node
/**
 * aim-youtube-meta — YouTube watch page metadata (no transcript v1).
 */
import {
  parseSkillArgs, openSession, endSession, saveScreenshot,
  printJsonBlock, commonHelpFlags, cacheGet, cacheSet, sleep,
} from '../../src/skill-utils.js';

const LABEL = 'aim-youtube-meta';

function resolveUrl(input) {
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) return input;
  // bare video id
  if (/^[\w-]{11}$/.test(input)) return `https://www.youtube.com/watch?v=${input}`;
  return `https://www.youtube.com/watch?v=${input}`;
}

const EXTRACT_JS = `(() => {
  const meta = {};
  document.querySelectorAll('meta[name], meta[property], meta[itemprop]').forEach(m => {
    const k = m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('itemprop');
    const v = m.getAttribute('content');
    if (k && v) meta[k] = v;
  });
  let videoId = '';
  try { videoId = new URL(location.href).searchParams.get('v') || ''; } catch (_) {}
  const title =
    meta['og:title'] ||
    meta['twitter:title'] ||
    document.querySelector('h1')?.innerText?.trim() ||
    document.title || '';
  const channel =
    meta['og:video:tag'] ||
    document.querySelector('#channel-name a, ytd-channel-name a, #owner #text a')?.innerText?.trim() ||
    meta['author'] || '';
  const channelUrl = document.querySelector('#channel-name a, ytd-channel-name a, #owner #text a')?.href || '';
  const description =
    meta['og:description'] ||
    meta['description'] ||
    document.querySelector('#description-inline-expander, #description')?.innerText?.trim()?.slice(0, 4000) || '';
  const publishedAt = meta['datePublished'] || meta['uploadDate'] || '';
  // try ytInitialPlayerResponse
  let duration = '', viewCount = '';
  try {
    const scripts = [...document.scripts].map(s => s.textContent || '');
    for (const t of scripts) {
      if (!t.includes('ytInitialPlayerResponse')) continue;
      const m = t.match(/ytInitialPlayerResponse\\s*=\\s*(\\{.+?\\});/s);
      if (!m) continue;
      const j = JSON.parse(m[1]);
      videoId = videoId || j?.videoDetails?.videoId || '';
      duration = j?.videoDetails?.lengthSeconds || '';
      viewCount = j?.videoDetails?.viewCount || '';
      break;
    }
  } catch (_) {}
  return {
    videoId,
    title: title.replace(/ - YouTube$/, ''),
    channel,
    channelUrl,
    description: description.slice(0, 4000),
    publishedAt,
    duration,
    viewCount,
    url: location.href,
    pageTitle: document.title || '',
  };
})()`;

async function main() {
  const opts = parseSkillArgs(process.argv.slice(2));
  const input = opts.raw.url || opts.raw.id || opts.rest[0] || '';
  const url = resolveUrl(input);
  if (opts.help || !url) {
    console.log(`Usage: node aim-youtube-meta.skill/scripts/run.js <url|videoId>
  --url <watch-url>
  --id <videoId>
${commonHelpFlags()}`);
    process.exit(opts.help ? 0 : 1);
  }

  const cacheParts = { url };
  if (!opts.noCache) {
    const hit = cacheGet(LABEL, cacheParts);
    if (hit) {
      console.error(`[${LABEL}] Cache hit`);
      printResult(hit);
      return;
    }
  }

  let browser, keepOffDesk;
  try {
    ({ browser, keepOffDesk } = await openSession(opts, url, LABEL));
    await sleep(3000);
    let data = await browser.evaluate(EXTRACT_JS);
    if (opts.screenshot) {
      data.screenshot = await saveScreenshot(browser, opts.screenshot, keepOffDesk);
    }
    // age gate / login soft signal
    if (!data.title && data.pageTitle) data.note = 'Sparse meta — possible age-gate or consent wall';
    cacheSet(LABEL, cacheParts, data);
    printResult(data);
  } catch (e) {
    console.error(`[${LABEL}] Fatal: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await endSession(browser, keepOffDesk, opts, LABEL);
  }
}

function printResult(data) {
  console.log(`# YouTube meta\n`);
  console.log(`**URL:** ${data.url || ''}\n`);
  console.log(`**Video ID:** ${data.videoId || '—'}\n`);
  console.log(`**Title:** ${data.title || '—'}\n`);
  console.log(`**Channel:** ${data.channel || '—'}\n`);
  if (data.duration) console.log(`**Duration (s):** ${data.duration}\n`);
  if (data.viewCount) console.log(`**Views:** ${data.viewCount}\n`);
  if (data.note) console.log(`**Note:** ${data.note}\n`);
  if (data.cached) console.log(`**Cached:** yes\n`);
  console.log(`## Description\n`);
  console.log(data.description || '_(empty)_');
  printJsonBlock({ skill: LABEL, ...data });
}

main();
