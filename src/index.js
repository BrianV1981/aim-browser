import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
export { AimBrowser } from './cdp-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @param {string} scriptName
 * @param {NodeJS.ProcessEnv} [extraEnv]
 */
export function runDaemonScript(scriptName, extraEnv = {}) {
  const scriptPath = join(__dirname, 'daemon', scriptName);
  const res = spawnSync(scriptPath, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${scriptName} exited with status ${res.status}`);
}

/**
 * Boot headed Chromium CDP daemon.
 * @param {{ minimized?: boolean, visible?: boolean }} [opts]
 *   Default: minimized (does not cover Operator desktop).
 *   visible: true → watch mode (or AIM_BROWSER_START_MINIMIZED=0).
 */
export function startDaemon(opts = {}) {
  let minimized = true;
  if (opts.visible === true) minimized = false;
  else if (opts.minimized === false) minimized = false;
  else if (opts.minimized === true) minimized = true;
  else if (process.env.AIM_BROWSER_START_MINIMIZED === '0') minimized = false;
  else if (process.env.AIM_BROWSER_START_MINIMIZED === '1') minimized = true;

  runDaemonScript('start.sh', {
    AIM_BROWSER_START_MINIMIZED: minimized ? '1' : '0',
  });
}


export function stopDaemon() {
  runDaemonScript('stop.sh');
}

export function checkDaemon() {
  runDaemonScript('check.sh');
}

