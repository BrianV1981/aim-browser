import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';

const CDP_PORT = process.env.CDP_PORT || '9222';
const CDP_ADDR = process.env.CDP_ADDR || '127.0.0.1';
const CDP_PROFILE_DIR = process.env.CDP_PROFILE_DIR || path.join(os.homedir(), '.cache', 'aim-browser-profile');
const PID_FILE = path.join(CDP_PROFILE_DIR, '.aim-browser-cdp.pid');

export function getBrowserBin() {
  if (process.env.BROWSER_BIN) return process.env.BROWSER_BIN;
  
  let candidates = [];
  if (process.platform === 'win32') {
    candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
  } else {
    candidates = [
      'chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable', 'chrome'
    ];
  }
  
  for (const c of candidates) {
    if (process.platform === 'win32') {
      if (fs.existsSync(c)) return c;
    } else {
      try {
        execSync(`command -v ${c}`, { stdio: 'ignore' });
        return c;
      } catch (e) {}
    }
  }
  throw new Error("[aim-browser] No Chromium/Chrome binary found. Install one or set BROWSER_BIN.");
}

export async function checkDaemonAsync() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${CDP_ADDR}:${CDP_PORT}/json/version`, { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Non-200 status: ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.webSocketDebuggerUrl) {
            resolve(parsed);
          } else {
            reject(new Error('No webSocketDebuggerUrl found in response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { 
      req.destroy(); 
      reject(new Error('Timeout')); 
    });
  });
}

export async function startDaemonAsync(opts = {}) {
  try {
    await checkDaemonAsync();
    console.error(`[aim-browser] CDP already listening on ${CDP_ADDR}:${CDP_PORT}`);
    return;
  } catch (e) {
    // Expected to fail if not running
  }

  const bin = getBrowserBin();
  
  let minimized = true;
  if (opts.visible === true) minimized = false;
  else if (opts.minimized === false) minimized = false;
  else if (opts.minimized === true) minimized = true;
  else if (process.env.AIM_BROWSER_START_MINIMIZED === '0') minimized = false;
  else if (process.env.AIM_BROWSER_START_MINIMIZED === '1') minimized = true;

  console.error(`[aim-browser] Starting ${minimized ? 'minimized' : 'visible'}...`);

  const args = [
    '--disable-dev-shm-usage',
    `--remote-debugging-address=${CDP_ADDR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${CDP_PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ];
  if (minimized) {
    args.push(process.platform === 'win32' ? '--window-state=minimized' : '--start-minimized');
  }

  if (!fs.existsSync(CDP_PROFILE_DIR)) {
    fs.mkdirSync(CDP_PROFILE_DIR, { recursive: true });
  }

  const child = spawn(bin, args, {
    detached: true,
    stdio: 'ignore'
  });
  
  child.unref(); 
  
  if (child.pid) {
    fs.writeFileSync(PID_FILE, child.pid.toString());
  }
  
  for (let i = 0; i < 20; i++) {
    try {
      await checkDaemonAsync();
      console.error(`[aim-browser] CDP listening on ${CDP_ADDR}:${CDP_PORT} (pid: ${child.pid})`);
      return;
    } catch (e) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error(`[aim-browser] CDP did not start on ${CDP_ADDR}:${CDP_PORT}`);
}

export async function stopDaemonAsync() {
  if (fs.existsSync(PID_FILE)) {
    const pidStr = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(pidStr, 10);
    if (!isNaN(pid)) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
        } else {
          process.kill(pid, 9);
        }
      } catch (e) {}
    }
    fs.unlinkSync(PID_FILE);
  }
  try {
    await checkDaemonAsync();
    console.error(`[aim-browser] WARNING: Something is still listening on ${CDP_PORT} after stop attempt.`);
  } catch(e) {
    console.error(`[aim-browser] Chromium CDP stopped (no listener on ${CDP_PORT}).`);
  }
}
