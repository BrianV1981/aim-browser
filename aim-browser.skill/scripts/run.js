#!/usr/bin/env node

import { AimBrowser } from '../../src/index.js';

async function main() {
  const args = process.argv.slice(2);
  const urlArgIndex = args.indexOf('--url');
  
  if (urlArgIndex === -1 || !args[urlArgIndex + 1]) {
    console.error('Usage: node run.js --url <url>');
    process.exit(1);
  }
  
  const url = args[urlArgIndex + 1];
  const browser = new AimBrowser();

  try {
    console.log(`Connecting to browser CDP...`);
    await browser.connect();
    
    console.log(`Navigating to ${url}...`);
    await browser.send('Page.enable');
    await browser.send('Page.navigate', { url });
    
    // Listen for the load event
    await new Promise((resolve) => {
      browser.on('Page.loadEventFired', resolve);
      // Fallback timeout in case the event is missed
      setTimeout(resolve, 5000); 
    });

    console.log('Page loaded.');
    
    // Clean exit
    await browser.close();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    // If connection fails, it might be because Chromium isn't running on port 9222.
    if (error.message.includes('fetch')) {
      console.error('\nHint: Ensure Chrome/Chromium is running with --remote-debugging-port=9222');
    }
    process.exit(1);
  }
}

main();
