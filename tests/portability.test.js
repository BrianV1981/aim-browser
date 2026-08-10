/**
 * Portability + dual-vessel packaging guards (TDD for issue #9).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const HOME_ABS_RE = /\/home\/[A-Za-z0-9._-]+|\/Users\/[A-Za-z0-9._-]+/;
const USERNAME_RE = /\bkingb\b/i;
const SCAN_EXTS = new Set(['.md', '.js', '.sh', '.json', '.yml', '.yaml', '.txt']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (SCAN_EXTS.has(path.extname(ent.name))) out.push(p);
  }
  return out;
}

function isAllowedPathLine(line) {
  if (/\/home\/user\b|\/home\/YOU\b|\/Users\/you\b|\/home\/</i.test(line)) return true;
  if (/No machine-local|`\/home\/<user>/i.test(line)) return true;
  if (/\/path\/to\//.test(line)) return true;
  return false;
}

describe('portability (P0)', () => {
  it('product sources have no machine-local absolute homes or operator usernames', () => {
    const roots = ['README.md', 'SECURITY.md', 'CHANGELOG.md', 'docs', 'scripts', 'src']
      .map((r) => path.join(ROOT, r))
      .filter((p) => fs.existsSync(p));
    // all aim-*.skill trees
    for (const ent of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (ent.isDirectory() && ent.name.startsWith('aim-') && ent.name.endsWith('.skill')) {
        roots.push(path.join(ROOT, ent.name));
      }
    }

    const offenders = [];
    for (const root of roots) {
      const files = fs.statSync(root).isFile() ? [root] : walk(root);
      for (const file of files) {
        const rel = path.relative(ROOT, file);
        const text = fs.readFileSync(file, 'utf8');
        text.split(/\r?\n/).forEach((line, i) => {
          if (isAllowedPathLine(line)) return;
          if (HOME_ABS_RE.test(line) || USERNAME_RE.test(line)) {
            offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every aim-*.skill has SKILL.md frontmatter name matching stem without .skill', () => {
    const dirs = fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('aim-') && d.name.endsWith('.skill'));
    expect(dirs.length).toBeGreaterThanOrEqual(12);
    for (const d of dirs) {
      const skillMd = path.join(ROOT, d.name, 'SKILL.md');
      expect(fs.existsSync(skillMd)).toBe(true);
      const text = fs.readFileSync(skillMd, 'utf8');
      const m = text.match(/^---\n([\s\S]*?)\n---\n/);
      expect(m).toBeTruthy();
      const nameLine = m[1].match(/^name:\s*(.+)$/m);
      expect(nameLine).toBeTruthy();
      const name = nameLine[1].trim().replace(/^["']|["']$/g, '');
      const expected = d.name.replace(/\.skill$/, '');
      expect(name).toBe(expected);
    }
  });
});

describe('install-skills.sh (P0)', () => {
  it('installs dest folders without .skill suffix', () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-skills-'));
    try {
      const script = path.join(ROOT, 'scripts', 'install-skills.sh');
      const res = spawnSync('bash', [script, dest, '--mode', 'copy'], {
        encoding: 'utf8',
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toMatch(/Installed \d+ skills/);
      const kids = fs.readdirSync(dest);
      expect(kids.some((k) => k.endsWith('.skill'))).toBe(false);
      expect(kids).toContain('aim-google-ai');
      expect(kids).toContain('aim-browser');
      expect(fs.existsSync(path.join(dest, 'aim-google-ai', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'aim-browser', 'SKILL.md'))).toBe(true);
      // must not install under .skill name
      expect(fs.existsSync(path.join(dest, 'aim-google-ai.skill'))).toBe(false);
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });
});

describe('VESSEL_DUAL_COMPAT (P1)', () => {
  it('docs/VESSEL_DUAL_COMPAT.md exists and mentions Grok and AGY', () => {
    const p = path.join(ROOT, 'docs', 'VESSEL_DUAL_COMPAT.md');
    expect(fs.existsSync(p)).toBe(true);
    const text = fs.readFileSync(p, 'utf8');
    expect(text).toMatch(/Grok/i);
    expect(text).toMatch(/AGY|Antigravity|\.gemini/i);
    expect(text).toMatch(/AIM_BROWSER_ROOT|\.grok\/skills/i);
  });
});

describe('README dual install (P2)', () => {
  it('documents Grok and AGY skill install roots portably', () => {
    const text = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    expect(text).toMatch(/\.grok\/skills/);
    expect(text).toMatch(/\$HOME\/\.grok\/skills|~\/\.grok\/skills/);
    expect(text).toMatch(/antigravity-cli\/skills|\.gemini\/skills/);
    expect(text).not.toMatch(HOME_ABS_RE);
    expect(text).not.toMatch(USERNAME_RE);
  });
});
