#!/usr/bin/env node
import { startDaemonAsync } from '../index.js';
startDaemonAsync().catch(e => { console.error(e); process.exit(1); });
