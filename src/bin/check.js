#!/usr/bin/env node
import { checkDaemonAsync } from '../index.js';
checkDaemonAsync().then(() => console.log("[aim-browser] OK")).catch(e => { console.error("[aim-browser] FAIL:", e.message); process.exit(1); });
