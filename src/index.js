import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
export { AimBrowser } from './cdp-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function runDaemonScript(scriptName) {
  const scriptPath = join(__dirname, 'daemon', scriptName);
  const res = spawnSync(scriptPath, { stdio: 'inherit' });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${scriptName} exited with status ${res.status}`);
}

export function startDaemon() {
  runDaemonScript('start.sh');
}

export function stopDaemon() {
  runDaemonScript('stop.sh');
}

export function checkDaemon() {
  runDaemonScript('check.sh');
}
