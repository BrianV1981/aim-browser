#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import repl from 'node:repl';
import { AimBrowser, startDaemon, stopDaemon, checkDaemon } from '../../src/index.js';

const STATE_FILE = path.join(os.homedir(), '.cache', 'aim-browser', 'state.json');

async function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { currentTab: null };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node run.js [flags]');
    process.exit(1);
  }

  const browser = new AimBrowser();
  let state = await readState();
  let connected = false;

  // Watch mode only if Operator explicitly asked (never default).
  const watchMode = args.includes('--start-visible')
    || args.includes('--show')
    || args.includes('--visible')
    || process.env.AIM_BROWSER_START_MINIMIZED === '0';

  const ensureConnection = async () => {
    if (connected) return;
    const tabs = await browser.getTargets();
    if (tabs.length === 0) throw new Error('No open tabs found');
    let targetId = null;
    
    if (Number.isInteger(state.currentTab) && state.currentTab >= 0 && state.currentTab < tabs.length) {
      targetId = tabs[state.currentTab].id;
    } else {
      state.currentTab = 0;
      targetId = tabs[0].id;
      writeState(state);
    }
    await browser.connect(targetId);
    connected = true;
    if (!watchMode) {
      await browser.minimizeWindow().catch(() => {});
    }
  };

  /** Chrome un-minimizes on /json/new and many navigations — re-assert unless watch mode. */
  const keepOffDesk = async () => {
    if (watchMode || !connected) return;
    await browser.minimizeWindow().catch(() => {});
  };

  try {
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      
      if (arg === '--start' || arg === '--start-minimized' || arg === '--start-visible') {
        // Default --start = minimized (don't steal Operator desktop).
        // --start-visible = watch mode; --start-minimized = explicit same as default.
        const visible = arg === '--start-visible';
        const minimized = !visible;
        console.log(`[Action] Starting headed browser daemon (${minimized ? 'minimized — stays off your desk' : 'VISIBLE watch mode'})...`);
        startDaemon({ minimized, visible });
        if (visible) {
          try {
            await browser.connect();
            connected = true;
            const shown = await browser.showWindow({ maximize: false });
            console.log(shown
              ? '[Success] Browser window shown (watch mode).'
              : '[Warn] Daemon up but could not set window bounds yet.');
          } catch (e) {
            console.warn(`[Warn] Daemon started; showWindow deferred: ${e.message}`);
          }
        }
      }
      else if (arg === '--show' || arg === '--visible') {
        await ensureConnection();
        const shown = await browser.showWindow({ maximize: false });
        console.log(shown
          ? '[Success] Browser brought to front (watch mode).'
          : '[Warn] Could not show window.');
      }
      else if (arg === '--stop') {
        console.log(`[Action] Stopping browser daemon...`);
        stopDaemon();
      }
      else if (arg === '--check') {
        console.log(`[Action] Checking browser daemon status...`);
        checkDaemon();
      }
      else if (arg === '--list' || arg === '--tabs') {
        const tabs = await browser.getTargets();
        const out = tabs.map((t, idx) => ({
          index: idx,
          current: idx === state.currentTab,
          id: t.id,
          title: t.title,
          url: t.url
        }));
        out.forEach(t => console.log(`${t.current ? '*' : ' '} [${t.index}] ${t.title || '(untitled)'} :: ${t.url}`));
      }
      else if (arg === '--use') {
        const idx = parseInt(args[++i], 10);
        const tabs = await browser.getTargets();
        if (idx < 0 || idx >= tabs.length) throw new Error(`Tab index ${idx} out of range`);
        state.currentTab = idx;
        writeState(state);
        console.log(`[Success] Using tab [${idx}]`);
        if (connected) { await browser.close(); connected = false; }
      }
      else if (arg === '--frame') {
        const frameId = args[++i];
        await ensureConnection();
        await browser.useFrame(frameId);
        console.log(`[Success] Now using frame: ${frameId}`);
      }
      else if (arg === '--scroll-to-bottom') {
        await ensureConnection();
        console.log(`[Action] Auto-scrolling to bottom...`);
        await browser.autoScroll();
        console.log(`[Success] Reached bottom of page.`);
      }
      else if (arg === '--solve-px') {
        await ensureConnection();
        console.log(`[Action] Attempting to solve PerimeterX / DataDome captcha...`);
        const solved = await browser.solvePerimeterX();
        if (solved) {
          console.log(`[Success] Captcha sequence dispatched. Proceeding.`);
        } else {
          console.log(`[Result] No captcha found on page.`);
        }
      }
      else if (arg === '--open') {
        const url = args[++i];
        console.log(`[Action] Opening ${url}...`);
        // openTab via HTTP; Chrome usually un-minimizes — re-minimize after connect
        if (connected) { await browser.close(); connected = false; }
        const created = await browser.openTab(url);
        const tabs = await browser.getTargets();
        state.currentTab = tabs.findIndex(t => t.id === created.id);
        if (state.currentTab === -1) state.currentTab = 0;
        writeState(state);
        await ensureConnection();
        await keepOffDesk();
        console.log(`[Success] Opened [${state.currentTab}] ${url}`);
      }
      else if (arg === '--close') {
        let idx = parseInt(args[i+1], 10);
        if (!Number.isInteger(idx)) idx = state.currentTab || 0;
        else i++;
        const tabs = await browser.getTargets();
        if (idx < 0 || idx >= tabs.length) throw new Error(`Tab index ${idx} out of range`);
        await browser.closeTab(tabs[idx].id);
        console.log(`[Success] Closed tab [${idx}]`);
        if (connected) { await browser.close(); connected = false; }
      }
      else if (arg === '--url') {
        const url = args[++i];
        console.log(`[Action] Navigating to ${url}...`);
        await ensureConnection();
        await browser.send('Page.enable');
        await browser.send('Page.navigate', { url });
        await browser.waitReady(45000).catch(() => {});
        await keepOffDesk();
        console.log('[Success] Navigation complete.');
      }
      else if (arg === '--elements') {
        await ensureConnection();
        console.log(`[Action] Finding elements...`);
        const els = await browser.getElements();
        els.forEach(e => console.log(`[${e.index}] ${e.tag}${e.typeable ? ' (typeable)' : ''} @(${e.x},${e.y}) ${e.text}`));
      }
      else if (arg === '--click') {
        const target = args[++i];
        await ensureConnection();
        console.log(`[Action] Clicking ${target}...`);
        if (target.startsWith('#') || target.startsWith('.')) {
          await browser.click(target);
        } else {
          await browser.tapElementIndex(parseInt(target, 10));
        }
        console.log(`[Success] Click dispatched.`);
      }
      else if (arg === '--tap') {
        const idx = parseInt(args[++i], 10);
        await ensureConnection();
        console.log(`[Action] Tapping element [${idx}]...`);
        await browser.tapElementIndex(idx);
        console.log(`[Success] Tap dispatched.`);
      }
      else if (arg === '--type') {
        const idx = parseInt(args[++i], 10);
        const text = args[++i];
        await ensureConnection();
        console.log(`[Action] Typing into element [${idx}]...`);
        await browser.typeText(idx, text);
        console.log(`[Success] Typed text.`);
      }
      else if (arg === '--textbox') {
        const text = args[++i];
        await ensureConnection();
        console.log(`[Action] Typing into textbox...`);
        await browser.textbox(text);
        console.log(`[Success] Typed into textbox.`);
      }
      else if (arg === '--keytype') {
        const text = args[++i];
        await ensureConnection();
        console.log(`[Action] Keytyping...`);
        await browser.keyType(text);
        console.log(`[Success] Keytyped.`);
      }
      else if (arg === '--keypress') {
        const key = args[++i].toLowerCase();
        await ensureConnection();
        console.log(`[Action] Keypress ${key}...`);
        const keyMap = {
          enter: { code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
          tab: { code: 'Tab', key: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
          backspace: { code: 'Backspace', key: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 },
          escape: { code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
        };
        if (!keyMap[key]) throw new Error(`keypress supports: enter, tab, backspace, escape`);
        await browser.keyPress(keyMap[key]);
      }
      else if (arg === '--keycombo') {
        const combo = args[++i].toLowerCase();
        await ensureConnection();
        if (combo !== 'ctrl+enter') throw new Error(`keycombo supports: ctrl+enter`);
        await browser.keyPress({ code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 2 });
      }
      else if (arg === '--tapxy') {
        const x = parseInt(args[++i], 10);
        const y = parseInt(args[++i], 10);
        await ensureConnection();
        await browser.tap(x, y);
      }
      else if (arg === '--taptestid') {
        const testid = args[++i];
        await ensureConnection();
        const info = await browser.evaluate(`(() => {
          const el = document.querySelector('[data-testid="${testid}"]');
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`);
        if (!info) throw new Error(`no element with data-testid=${testid}`);
        await browser.tap(info.x, info.y);
      }
      else if (arg === '--dlpath') {
        const dir = args[++i];
        await ensureConnection();
        await fs.promises.mkdir(dir, { recursive: true });
        await browser.setDownloadPath(dir);
        console.log(`[Success] Download path set to ${dir}`);
      }
      else if (arg === '--upload') {
        const css = args[++i];
        const filePath = args[++i];
        await ensureConnection();
        const buf = fs.readFileSync(filePath);
        await browser.uploadFile(css, buf.toString('base64'));
        console.log(`[Success] Uploaded file to ${css}`);
      }
      else if (arg === '--imgsave') {
        const outPath = args[++i];
        await ensureConnection();
        const res = await browser.saveImage(outPath);
        if (!res?.ok) throw new Error(res?.reason || 'imgsave failed');
        const buf = Buffer.from(res.b64, 'base64');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buf);
        console.log(`[Success] Saved image to ${outPath}`);
      }
      else if (arg === '--block-media') {
        await ensureConnection();
        await browser.blockMedia();
        console.log(`[Success] Media blocking enabled.`);
      }
      else if (arg === '--spy') {
        const pattern = args[++i];
        await ensureConnection();
        await browser.spyNetwork(pattern, (url, body) => {
          console.log(`\n--- SPY: ${url} ---\n${body}\n--- END SPY ---\n`);
        });
        console.log(`[Success] Spying on network requests matching: ${pattern}`);
      }
      else if (arg === '--wait-ready') {
        await ensureConnection();
        await browser.waitReady();
        console.log(`[Success] Wait ready complete.`);
      }
      else if (arg === '--wait-selector') {
        const css = args[++i];
        await ensureConnection();
        const deadline = Date.now() + 45000;
        while (Date.now() < deadline) {
          const ok = await browser.evaluate(`(() => !!document.querySelector(${JSON.stringify(css)}))()`);
          if (ok) break;
          await new Promise(r => setTimeout(r, 250));
        }
        console.log(`[Success] Selector ${css} found.`);
      }
      else if (arg === '--interactive' || arg === '--repl') {
        await ensureConnection();
        console.log(`[Success] Entering interactive REPL mode. The 'browser' object is available.`);
        const replServer = repl.start({ prompt: 'aim-browser> ' });
        replServer.context.browser = browser;
        
        await new Promise(resolve => {
          replServer.on('exit', resolve);
        });
        console.log(`[Success] Exiting REPL mode.`);
      }
      else if (arg === '--wait') {
        const ms = parseInt(args[++i], 10);
        console.log(`[Action] Waiting for ${ms}ms...`);
        await new Promise(r => setTimeout(r, ms));
      }
      else if (arg === '--eval') {
        const expression = args[++i];
        await ensureConnection();
        const res = await browser.evaluate(expression);
        console.log(`[Result]`, res);
      }
      else if (arg === '--content') {
        await ensureConnection();
        const text = await browser.evaluate(`(document.body?.innerText || '').trim()`);
        console.log(text);
      }
      else if (arg === '--content-ax') {
        await ensureConnection();
        const text = await browser.getAccessibilityTree();
        console.log(text);
      }
      else if (arg === '--html') {
        await ensureConnection();
        const html = await browser.evaluate('document.documentElement.outerHTML');
        console.log('\n--- HTML BEGIN ---\n' + html + '\n--- HTML END ---\n');
      }
      else if (arg === '--screenshot') {
        const outPath = args[++i];
        let fullpage = false;
        if (args[i+1] === '--fullpage') {
          fullpage = true;
          i++;
        }
        await ensureConnection();
        console.log(`[Action] Capturing screenshot...`);
        const base64Data = await browser.screenshot({ fullpage });
        fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
        console.log(`[Success] Saved screenshot to ${outPath}`);
      }
      else if (arg === '--resize') {
        const w = parseInt(args[++i], 10);
        const h = parseInt(args[++i], 10);
        await ensureConnection();
        await browser.setWindowBounds({ width: w, height: h });
      }
      else if (arg === '--maximize') {
        await ensureConnection();
        await browser.setWindowBounds({ windowState: 'maximized' });
      }
      else if (arg === '--minimize') {
        await ensureConnection();
        await browser.setWindowBounds({ windowState: 'minimized' });
      }
      else {
        console.warn(`[Warning] Unknown argument: ${arg}`);
      }
      
      i++;
    }
    
    if (connected) await browser.close();
    
  } catch (error) {
    console.error(`[Fatal] ${error.message}`);
    process.exit(1);
  }
}

main();