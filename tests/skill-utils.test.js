import {
  cacheKey,
  cacheGet,
  cacheSet,
  cacheDir,
  parseSkillArgs,
  resolvePackageRoot,
  isAimBrowserPackageRoot,
} from '../src/skill-utils.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('skill-utils', () => {
  const tmp = path.join(os.tmpdir(), `aim-cache-test-${process.pid}`);

  beforeAll(() => {
    process.env.AIM_BROWSER_CACHE_DIR = tmp;
    fs.mkdirSync(tmp, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.AIM_BROWSER_CACHE_DIR;
  });

  it('parseSkillArgs defaults stopAfter true', () => {
    const o = parseSkillArgs(['hello', 'world']);
    expect(o.stopAfter).toBe(true);
    expect(o.rest).toEqual(['hello', 'world']);
  });

  it('parseSkillArgs keep-open and screenshot', () => {
    const o = parseSkillArgs(['--keep-open', '--screenshot', '/tmp/x.png', 'q']);
    expect(o.stopAfter).toBe(false);
    expect(o.screenshot).toBe('/tmp/x.png');
    expect(o.rest).toEqual(['q']);
  });

  it('cacheKey is stable', () => {
    expect(cacheKey('s', { a: 1 })).toBe(cacheKey('s', { a: 1 }));
    expect(cacheKey('s', { a: 1 })).not.toBe(cacheKey('s', { a: 2 }));
  });

  it('cache set/get with TTL', () => {
    cacheSet('test-skill', { q: 'x' }, { answer: 'hi' });
    const hit = cacheGet('test-skill', { q: 'x' }, 60_000);
    expect(hit).toBeTruthy();
    expect(hit.answer).toBe('hi');
    expect(hit.cached).toBe(true);
    const miss = cacheGet('test-skill', { q: 'y' }, 60_000);
    expect(miss).toBeNull();
  });

  it('cacheGet expires', () => {
    const dir = cacheDir();
    const key = cacheKey('exp', { q: 1 });
    const file = path.join(dir, `exp-${key}.json`);
    fs.writeFileSync(file, JSON.stringify({
      cachedAt: Date.now() - 100_000,
      payload: { answer: 'old' },
    }));
    expect(cacheGet('exp', { q: 1 }, 1000)).toBeNull();
  });

  it('isAimBrowserPackageRoot accepts this repo', () => {
    expect(isAimBrowserPackageRoot(PKG_ROOT)).toBe(true);
    expect(isAimBrowserPackageRoot(os.tmpdir())).toBe(false);
  });

  it('resolvePackageRoot finds monorepo root', () => {
    const prev = process.env.AIM_BROWSER_ROOT;
    delete process.env.AIM_BROWSER_ROOT;
    try {
      expect(resolvePackageRoot(path.join(PKG_ROOT, 'src'))).toBe(PKG_ROOT);
      expect(resolvePackageRoot()).toBe(PKG_ROOT);
    } finally {
      if (prev !== undefined) process.env.AIM_BROWSER_ROOT = prev;
      else delete process.env.AIM_BROWSER_ROOT;
    }
  });

  it('resolvePackageRoot honors AIM_BROWSER_ROOT and rejects bad env', () => {
    const prev = process.env.AIM_BROWSER_ROOT;
    try {
      process.env.AIM_BROWSER_ROOT = PKG_ROOT;
      expect(resolvePackageRoot('/tmp')).toBe(PKG_ROOT);
      process.env.AIM_BROWSER_ROOT = os.tmpdir();
      expect(() => resolvePackageRoot()).toThrow(/AIM_BROWSER_ROOT/);
    } finally {
      if (prev !== undefined) process.env.AIM_BROWSER_ROOT = prev;
      else delete process.env.AIM_BROWSER_ROOT;
    }
  });
});
