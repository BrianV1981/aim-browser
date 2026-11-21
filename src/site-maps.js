import fs from 'node:fs';
import path from 'node:path';
import { resolveStateDir } from './tab-leases.js';

const HEAL_SCORE_THRESHOLD = 40;

/**
 * Normalize a URL or host string into a safe per-origin/domain key (e.g. "localhost_5173" or "sunbiz.org").
 * @param {string} urlOrDomain
 * @returns {string}
 */
export function normalizeDomainKey(urlOrDomain) {
  const raw = String(urlOrDomain || '').trim();
  if (!raw) throw new Error('urlOrDomain is required');
  let hostPort = raw;
  try {
    const parsed = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    hostPort = parsed.port ? `${parsed.hostname}_${parsed.port}` : parsed.hostname;
  } catch {
    hostPort = raw.replace(/^https?:\/\//i, '').split('/')[0];
  }
  const clean = hostPort.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9._-]/g, '_');
  if (!clean) throw new Error(`Invalid domain key from "${urlOrDomain}"`);
  return clean;
}

export function resolveMapsDir(mapsDir) {
  const dir = mapsDir || process.env.AIM_BROWSER_MAPS_DIR || path.join(resolveStateDir(), 'maps');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function domainToMapPath(urlOrDomain, mapsDir) {
  return path.join(resolveMapsDir(mapsDir), `${normalizeDomainKey(urlOrDomain)}.json`);
}

export function loadSiteMap(urlOrDomain, mapsDir) {
  const domain = normalizeDomainKey(urlOrDomain);
  const filePath = domainToMapPath(domain, mapsDir);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      domain,
      version: 1,
      updatedAt: parsed.updatedAt || 0,
      routes: parsed.routes || {},
      loginHold: parsed.loginHold || null,
      landmarks: parsed.landmarks || {},
      ...parsed,
    };
  } catch {
    return {
      domain,
      version: 1,
      updatedAt: 0,
      routes: {},
      loginHold: null,
      landmarks: {},
    };
  }
}

export function saveSiteMap(urlOrDomain, mapData, mapsDir) {
  const domain = normalizeDomainKey(urlOrDomain);
  const filePath = domainToMapPath(domain, mapsDir);
  const payload = {
    ...mapData,
    domain,
    version: 1,
    updatedAt: Date.now(),
    landmarks: mapData?.landmarks || {},
  };
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, filePath);
  return payload;
}

/**
 * Score a live interactive element candidate against a saved multi-anchor landmark fingerprint.
 * Pure deterministic function (<1ms, 0 LLM tokens).
 *
 * @param {object} saved
 * @param {object} candidate
 * @returns {number}
 */
export function scoreAnchorMatch(saved, candidate) {
  if (!saved || !candidate) return 0;
  let score = 0;
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  if (saved.dataTestId && candidate.dataTestId && saved.dataTestId === candidate.dataTestId) {
    score += 55;
  }
  if (saved.name && candidate.name && saved.name === candidate.name) {
    score += 35;
  }
  if (saved.ariaLabel && candidate.ariaLabel) {
    if (norm(saved.ariaLabel) === norm(candidate.ariaLabel)) score += 40;
    else if (norm(candidate.ariaLabel).includes(norm(saved.ariaLabel))) score += 20;
  }
  if (saved.placeholder && candidate.placeholder && norm(saved.placeholder) === norm(candidate.placeholder)) {
    score += 30;
  }
  if (saved.text && candidate.text) {
    const sText = norm(saved.text);
    const cText = norm(candidate.text);
    if (sText && sText === cText) score += 35;
    else if (sText.length >= 3 && (cText.includes(sText) || sText.includes(cText))) score += 18;
  }
  if (saved.tag && candidate.tag && norm(saved.tag) === norm(candidate.tag)) {
    score += 12;
  }
  if (saved.role && candidate.role && norm(saved.role) === norm(candidate.role)) {
    score += 12;
  }
  if (Boolean(saved.typeable) === Boolean(candidate.typeable)) {
    score += 6;
  }
  if (saved.nearHeading && candidate.nearHeading && norm(saved.nearHeading) === norm(candidate.nearHeading)) {
    score += 15;
  }
  return score;
}

/**
 * Inspect visible interactive elements on the page with multi-anchor fingerprints in <5ms via CDP.
 * @param {import('./cdp-client.js').AimBrowser} browser
 */
export async function inspectInteractiveElements(browser) {
  return await browser.evaluate(`(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity || '1') > 0.02;
    };
    const isTypeable = (el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      const ce = el.getAttribute('contenteditable');
      if (ce === 'true' || ce === '') return true;
      return el.getAttribute('role') === 'textbox';
    };
    const buildSelector = (el) => {
      const dt = el.getAttribute('data-testid');
      if (dt) return '[data-testid=' + JSON.stringify(dt) + ']';
      if (el.id && !/[0-9a-f]{6,}|^:r/i.test(el.id)) return '#' + CSS.escape(el.id);
      const name = el.getAttribute('name');
      if (name) return el.tagName.toLowerCase() + '[name=' + JSON.stringify(name) + ']';
      const aria = el.getAttribute('aria-label');
      if (aria && aria.length <= 64) return el.tagName.toLowerCase() + '[aria-label=' + JSON.stringify(aria) + ']';
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 4 && cur !== document.body) {
        let seg = cur.tagName.toLowerCase();
        if (cur.id && !/[0-9a-f]{6,}|^:r/i.test(cur.id)) {
          parts.unshift('#' + CSS.escape(cur.id));
          break;
        }
        const parent = cur.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
          if (sameTag.length > 1) seg += ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')';
        }
        parts.unshift(seg);
        cur = parent;
      }
      return parts.join(' > ');
    };
    const findNearHeading = (el) => {
      const id = el.id;
      if (id) {
        const lbl = document.querySelector('label[for=' + JSON.stringify(id) + ']');
        if (lbl && lbl.innerText) return lbl.innerText.trim().slice(0, 80);
      }
      const parentLabel = el.closest('label');
      if (parentLabel && parentLabel.innerText) return parentLabel.innerText.trim().slice(0, 80);
      const section = el.closest('form, section, article, dialog, [role="dialog"], main') || document.body;
      const heading = section.querySelector('h1, h2, h3, h4, legend');
      return heading && heading.innerText ? heading.innerText.trim().slice(0, 80) : '';
    };
    const selector = 'a,button,input,select,textarea,[role="button"],[onclick],[tabindex],[role="textbox"],[contenteditable="true"],[contenteditable=""],div[aria-label]';
    const els = Array.from(document.querySelectorAll(selector)).filter(isVisible).slice(0, 300);
    return els.map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        css: buildSelector(el),
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '',
        name: el.getAttribute('name') || '',
        ariaLabel: (el.getAttribute('aria-label') || '').trim().slice(0, 120),
        placeholder: (el.getAttribute('placeholder') || '').trim().slice(0, 120),
        dataTestId: el.getAttribute('data-testid') || '',
        text: (el.innerText || el.value || '').trim().slice(0, 120),
        nearHeading: findNearHeading(el),
        typeable: isTypeable(el),
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    });
  })()`);
}

/**
 * Deterministic 1ms hit-test via document.elementFromPoint(x, y) to detect cookie/modal overlays.
 * @param {import('./cdp-client.js').AimBrowser} browser
 * @param {number} x
 * @param {number} y
 * @param {string} [expectedCss]
 */
export async function checkElementOcclusion(browser, x, y, expectedCss = '') {
  return await browser.evaluate(`(() => {
    const px = ${Number(x)};
    const py = ${Number(y)};
    const css = ${JSON.stringify(expectedCss || '')};
    const topEl = document.elementFromPoint(px, py);
    if (!topEl) return { obstructed: false, reason: 'out-of-viewport', dismissCandidate: null };

    let expectedEl = null;
    if (css) {
      try { expectedEl = document.querySelector(css); } catch {}
    }
    const dialog = topEl.closest('dialog, [role="dialog"], [aria-modal="true"], [id*="cookie" i], [class*="modal" i], [class*="consent" i]');
    const obstructed = expectedEl
      ? (topEl !== expectedEl && !expectedEl.contains(topEl) && !topEl.contains(expectedEl))
      : Boolean(dialog);

    if (!obstructed) {
      return { obstructed: false, hitTag: topEl.tagName.toLowerCase(), dismissCandidate: null };
    }

    const container = dialog || topEl.parentElement || document.body;
    const buttons = Array.from(container.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a'));
    const dismissBtn = buttons.find((b) => /accept|agree|got it|close|dismiss|continue|ok|×|^x$/i.test((b.innerText || b.value || b.getAttribute('aria-label') || '').trim()));
    let dismissCandidate = null;
    if (dismissBtn) {
      const r = dismissBtn.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) {
        dismissCandidate = {
          text: (dismissBtn.innerText || dismissBtn.getAttribute('aria-label') || 'dismiss').trim().slice(0, 60),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
        };
      }
    }
    return {
      obstructed: true,
      isModalOverlay: Boolean(dialog),
      hitTag: topEl.tagName.toLowerCase(),
      hitText: (topEl.innerText || '').trim().slice(0, 80),
      dismissCandidate,
    };
  })()`);
}

/**
 * Deterministic layout & mobile horizontal overflow check (0 vision tokens).
 * @param {import('./cdp-client.js').AimBrowser} browser
 */
export async function checkLayoutHealth(browser) {
  return await browser.evaluate(`(() => {
    const doc = document.documentElement;
    const vw = window.innerWidth || doc.clientWidth || 0;
    const vh = window.innerHeight || doc.clientHeight || 0;
    const sw = Math.max(doc.scrollWidth || 0, document.body?.scrollWidth || 0);
    const els = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'));
    const offscreen = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue;
      if (r.right > vw + 4 || r.left < -4) {
        offscreen.push({
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
        if (offscreen.length >= 20) break;
      }
    }
    return {
      horizontalOverflow: sw > vw + 2,
      viewportWidth: vw,
      viewportHeight: vh,
      scrollWidth: sw,
      offscreenCount: offscreen.length,
      offscreen,
    };
  })()`);
}

/**
 * Record an interactive element into maps/<domain>.json by CSS selector or element index.
 * @param {import('./cdp-client.js').AimBrowser} browser
 * @param {string} landmarkKey
 * @param {string|number} selectorOrIndex
 * @param {{ urlOrDomain?: string, mapsDir?: string }} [opts]
 */
export async function recordLandmark(browser, landmarkKey, selectorOrIndex, opts = {}) {
  const currentUrl = opts.urlOrDomain || await browser.evaluate('location.href');
  const elements = await inspectInteractiveElements(browser);
  let match = null;

  if (typeof selectorOrIndex === 'number' || /^\d+$/.test(String(selectorOrIndex))) {
    const idx = Number(selectorOrIndex);
    match = elements.find((e) => e.index === idx) || null;
  } else {
    const targetCoords = await browser.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(String(selectorOrIndex))});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '',
        name: el.getAttribute('name') || '',
        ariaLabel: (el.getAttribute('aria-label') || '').trim().slice(0, 120),
        placeholder: (el.getAttribute('placeholder') || '').trim().slice(0, 120),
        dataTestId: el.getAttribute('data-testid') || '',
        text: (el.innerText || el.value || '').trim().slice(0, 120),
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
      };
    })()`);
    if (targetCoords) {
      match = elements.find((e) => Math.abs(e.x - targetCoords.x) <= 4 && Math.abs(e.y - targetCoords.y) <= 4)
        || { ...targetCoords, css: String(selectorOrIndex), nearHeading: '', typeable: ['input', 'textarea'].includes(targetCoords.tag) };
      match.css = String(selectorOrIndex);
    }
  }

  if (!match) {
    throw new Error(`Could not find visible element "${selectorOrIndex}" to record as "${landmarkKey}"`);
  }

  const mapData = loadSiteMap(currentUrl, opts.mapsDir);
  const { index: _ignoredIndex, width: _w, height: _h, x: _x, y: _y, ...fingerprint } = match;
  mapData.landmarks[landmarkKey] = {
    ...fingerprint,
    recordedAt: Date.now(),
    healCount: mapData.landmarks[landmarkKey]?.healCount || 0,
  };
  saveSiteMap(currentUrl, mapData, opts.mapsDir);
  return { domain: mapData.domain, landmarkKey, landmark: mapData.landmarks[landmarkKey], x: match.x, y: match.y };
}

/**
 * Resolve a mapped landmark through the 3-Tier Zero-VLM pipeline (+ optional Phase 3 visionFallback hook):
 *   - Tier 0: Fast saved CSS selector (<2ms, 0 tokens)
 *   - Tier 1: Multi-Anchor JS scoring + automatic map self-healing (<5ms, 0 tokens)
 *   - Tier 2: Compact text element list + AX tree (for existing CLI subagent or textResolver)
 *   - Tier 3: Optional pluggable `visionFallback` hook (preserved for the 5% <canvas>/GIS/div-soup edge cases)
 *
 * @param {import('./cdp-client.js').AimBrowser} browser
 * @param {string} landmarkKey
 * @param {{
 *   urlOrDomain?: string,
 *   mapsDir?: string,
 *   healThreshold?: number,
 *   textResolver?: (ctx: { landmarkKey: string, saved: object, elements: object[], axTree: string }) => Promise<number|null>,
 *   visionFallback?: (ctx: { domain: string, landmarkKey: string, saved: object, screenshotBase64: string, elements: object[] }) => Promise<{ x: number, y: number, css?: string }|null>
 * }} [opts]
 */
export async function resolveMappedLandmark(browser, landmarkKey, opts = {}) {
  const currentUrl = opts.urlOrDomain || await browser.evaluate('location.href');
  const mapData = loadSiteMap(currentUrl, opts.mapsDir);
  const saved = mapData.landmarks?.[landmarkKey];
  if (!saved) {
    throw new Error(`Landmark "${landmarkKey}" not found in site map for "${mapData.domain}"`);
  }

  // Tier 0: Direct CSS fast path (with basic tag sanity check)
  if (saved.css) {
    const fastHit = await browser.evaluate(`(() => {
      try {
        const el = document.querySelector(${JSON.stringify(saved.css)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (r.width <= 2 || r.height <= 2 || s.visibility === 'hidden' || s.display === 'none') return null;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const nr = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 120),
          x: Math.round(nr.left + nr.width / 2),
          y: Math.round(nr.top + nr.height / 2),
        };
      } catch {
        return null;
      }
    })()`);
    if (fastHit && (!saved.tag || fastHit.tag === saved.tag)) {
      return { resolved: true, tier: 0, healed: false, x: fastHit.x, y: fastHit.y, css: saved.css, element: fastHit };
    }
  }

  // Tier 1: Deterministic Multi-Anchor JS Self-Healing (<5ms, 0 LLM tokens)
  const candidates = await inspectInteractiveElements(browser);
  const threshold = opts.healThreshold ?? HEAL_SCORE_THRESHOLD;
  let best = null;
  let bestScore = -1;
  for (const cand of candidates) {
    const s = scoreAnchorMatch(saved, cand);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }

  const persistHealedCandidate = (cand) => {
    const prevCss = saved.css;
    const { index: _idx, width: _w, height: _h, x, y, ...fp } = cand;
    mapData.landmarks[landmarkKey] = {
      ...saved,
      ...fp,
      previousCss: prevCss,
      healedAt: Date.now(),
      healCount: Number(saved.healCount || 0) + 1,
    };
    saveSiteMap(currentUrl, mapData, opts.mapsDir);
    return { x, y, css: cand.css, prevCss };
  };

  if (best && bestScore >= threshold) {
    const healed = persistHealedCandidate(best);
    return {
      resolved: true,
      tier: 1,
      healed: true,
      score: bestScore,
      previousCss: healed.prevCss,
      css: healed.css,
      x: healed.x,
      y: healed.y,
      element: best,
    };
  }

  // Tier 2: Compact Text Element-Ref Snapshot (for existing CLI subagent or optional textResolver)
  const axTree = await browser.getAccessibilityTree().catch(() => '');
  if (typeof opts.textResolver === 'function') {
    const pickedIdx = await opts.textResolver({ landmarkKey, saved, elements: candidates, axTree });
    const picked = Number.isInteger(pickedIdx) ? candidates.find((c) => c.index === pickedIdx) : null;
    if (picked) {
      const healed = persistHealedCandidate(picked);
      return {
        resolved: true,
        tier: 2,
        healed: true,
        previousCss: healed.prevCss,
        css: healed.css,
        x: healed.x,
        y: healed.y,
        element: picked,
      };
    }
  }

  // Tier 3: Optional Phase 3 Vision Fallback Hook (never resident by default; for 5% <canvas>/GIS/div-soup)
  if (typeof opts.visionFallback === 'function') {
    const screenshotBase64 = await browser.screenshot({ format: 'png' });
    const visionHit = await opts.visionFallback({
      domain: mapData.domain,
      landmarkKey,
      saved,
      screenshotBase64,
      elements: candidates,
    });
    if (visionHit && typeof visionHit.x === 'number' && typeof visionHit.y === 'number') {
      if (visionHit.css) {
        mapData.landmarks[landmarkKey] = {
          ...saved,
          css: visionHit.css,
          healedAt: Date.now(),
          healCount: Number(saved.healCount || 0) + 1,
        };
        saveSiteMap(currentUrl, mapData, opts.mapsDir);
      }
      return {
        resolved: true,
        tier: 3,
        healed: Boolean(visionHit.css),
        css: visionHit.css || saved.css,
        x: Math.round(visionHit.x),
        y: Math.round(visionHit.y),
        element: visionHit,
      };
    }
  }

  return {
    resolved: false,
    tier: 2,
    healed: false,
    bestScore,
    elements: candidates,
    axTree,
  };
}

/**
 * Execute a click or type action against a mapped landmark, auto-dismissing blocking modals if found.
 * @param {import('./cdp-client.js').AimBrowser} browser
 * @param {string} landmarkKey
 * @param {{
 *   action?: 'click'|'type',
 *   value?: string,
 *   autoDismissOcclusion?: boolean,
 *   urlOrDomain?: string,
 *   mapsDir?: string,
 *   textResolver?: Function,
 *   visionFallback?: Function
 * }} [opts]
 */
export async function actOnLandmark(browser, landmarkKey, opts = {}) {
  const action = opts.action || 'click';
  const res = await resolveMappedLandmark(browser, landmarkKey, opts);
  if (!res.resolved) {
    const preview = (res.elements || [])
      .slice(0, 15)
      .map((e) => `[${e.index}] ${e.tag} "${e.text || e.ariaLabel || e.placeholder}"`)
      .join('; ');
    throw new Error(`Unresolved landmark "${landmarkKey}" (max anchor score=${res.bestScore}). Visible candidates: ${preview}`);
  }

  let dismissedOverlay = false;
  if (opts.autoDismissOcclusion !== false) {
    const occ = await checkElementOcclusion(browser, res.x, res.y, res.css).catch(() => null);
    if (occ?.obstructed && occ.dismissCandidate) {
      await browser.tap(occ.dismissCandidate.x, occ.dismissCandidate.y);
      dismissedOverlay = true;
    }
  }

  if (action === 'type') {
    await browser.tap(res.x, res.y);
    await browser.evaluate(`(() => {
      const el = document.activeElement;
      if (el && 'value' in el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`).catch(() => {});
    await browser.send('Input.insertText', { text: String(opts.value ?? '') });
  } else {
    await browser.tap(res.x, res.y);
  }

  return { ...res, action, dismissedOverlay };
}
