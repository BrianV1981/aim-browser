#!/usr/bin/env node
import { stopDaemonAsync } from '../index.js';
stopDaemonAsync().catch(e => { console.error(e); process.exit(1); });
