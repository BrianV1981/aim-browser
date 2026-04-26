#!/usr/bin/env node

import { AimBrowser } from '../../src/index.js';

async function main() {
  const browser = new AimBrowser();
  console.log('Skill wrapper instantiated AimBrowser.');
  console.log('Current options:', browser.options);
  // Add argument parsing and CDP wrapper logic here
}

main().catch(console.error);
