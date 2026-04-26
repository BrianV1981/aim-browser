#!/usr/bin/env node

import fs from 'node:fs';
import { AimBrowser } from '../../src/index.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node run.js [--url <url>] [--wait <ms>] [--click <selector>] [--eval "<script>"] [--html] [--screenshot <path>]');
    process.exit(1);
  }

  const browser = new AimBrowser();

  try {
    // Attempt connection
    await browser.connect();
    
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      
      if (arg === '--url') {
        const url = args[++i];
        console.log(`[Action] Navigating to ${url}...`);
        await browser.send('Page.enable');
        await browser.send('Page.navigate', { url });
        
        // Wait for page load event or 8-second timeout
        await new Promise((resolve) => {
          browser.on('Page.loadEventFired', resolve);
          setTimeout(resolve, 8000); 
        });
        console.log('[Success] Navigation complete.');
      }
      else if (arg === '--wait') {
        const ms = parseInt(args[++i], 10);
        console.log(`[Action] Waiting for ${ms}ms...`);
        await new Promise(r => setTimeout(r, ms));
      }
      else if (arg === '--click') {
        const selector = args[++i];
        console.log(`[Action] Clicking selector: ${selector}`);
        await browser.click(selector);
        console.log(`[Success] Click dispatched.`);
      }
      else if (arg === '--eval') {
        const expression = args[++i];
        console.log(`[Action] Evaluating JavaScript...`);
        const res = await browser.evaluate(expression);
        console.log(`[Result]`, res);
      }
      else if (arg === '--html') {
        console.log(`[Action] Extracting DOM HTML...`);
        const html = await browser.evaluate('document.documentElement.outerHTML');
        console.log('\n--- HTML BEGIN ---\n' + html + '\n--- HTML END ---\n');
      }
      else if (arg === '--screenshot') {
        const outPath = args[++i];
        console.log(`[Action] Capturing screenshot...`);
        const base64Data = await browser.screenshot();
        fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
        console.log(`[Success] Saved screenshot to ${outPath}`);
      }
      else {
        console.warn(`[Warning] Unknown argument: ${arg}`);
      }
      
      i++;
    }
    
    // Cleanly close WebSocket
    await browser.close();
    
  } catch (error) {
    console.error(`[Fatal] ${error.message}`);
    if (error.message.includes('fetch')) {
      console.error('\nHint: Ensure Chromium is running with --remote-debugging-port=9222');
      console.error('Example: google-chrome --remote-debugging-port=9222 --remote-allow-origins="*"');
    }
    process.exit(1);
  }
}

main();
