import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import {
  actOnLandmark,
  loadSiteMap,
  normalizeDomainKey,
  recordLandmark,
  resolveMappedLandmark,
  saveSiteMap,
  scoreAnchorMatch,
} from '../src/site-maps.js';

describe('Deterministic Self-Healing Site Maps & 5% Vision Hook (aim-browser#11)', () => {
  let mapsDir;

  beforeEach(() => {
    mapsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-browser-maps-'));
  });

  afterEach(() => {
    fs.rmSync(mapsDir, { recursive: true, force: true });
  });

  it('normalizes URLs and localhost ports into collision-free domain keys', () => {
    expect(normalizeDomainKey('https://www.Sunbiz.org/Inquiry/CorporationSearch')).toBe('sunbiz.org');
    expect(normalizeDomainKey('http://localhost:5173/settings')).toBe('localhost_5173');
  });

  it('resolves Tier 0 immediately when the saved CSS selector still matches', async () => {
    saveSiteMap('https://portal.example.com/search', {
      landmarks: {
        searchBtn: {
          css: '#submit-search',
          tag: 'button',
          role: 'button',
          text: 'Search Official Records',
        },
      },
    }, mapsDir);

    const mockBrowser = {
      evaluate: jest.fn(async (expr) => {
        if (expr.includes('location.href')) return 'https://portal.example.com/search';
        if (expr.includes('#submit-search')) {
          return { tag: 'button', text: 'Search Official Records', x: 640, y: 210 };
        }
        return null;
      }),
    };

    const res = await resolveMappedLandmark(mockBrowser, 'searchBtn', { mapsDir });
    expect(res.resolved).toBe(true);
    expect(res.tier).toBe(0);
    expect(res.healed).toBe(false);
    expect(res.x).toBe(640);
    expect(res.y).toBe(210);
  });

  it('self-heals broken CSS selectors in Tier 1 via multi-anchor scoring with zero LLM calls', async () => {
    saveSiteMap('https://clerk.example.gov', {
      landmarks: {
        runQuery: {
          css: '#legacy-btn-v1',
          tag: 'button',
          role: 'button',
          ariaLabel: 'Search Official Records',
          text: 'Search Official Records',
          nearHeading: 'Official Records Inquiry',
          typeable: false,
        },
      },
    }, mapsDir);

    const redesignedElements = [
      {
        index: 0,
        css: 'input[name="partyName"]',
        tag: 'input',
        role: 'textbox',
        name: 'partyName',
        ariaLabel: 'Party Name',
        placeholder: 'Last, First',
        dataTestId: '',
        text: '',
        nearHeading: 'Official Records Inquiry',
        typeable: true,
        x: 310,
        y: 180,
      },
      {
        index: 1,
        css: '[data-testid="clerk-search-v2"]',
        tag: 'button',
        role: 'button',
        name: '',
        ariaLabel: 'Search Official Records',
        placeholder: '',
        dataTestId: 'clerk-search-v2',
        text: 'Search Official Records',
        nearHeading: 'Official Records Inquiry',
        typeable: false,
        x: 580,
        y: 180,
      },
    ];

    const mockBrowser = {
      evaluate: jest.fn(async (expr) => {
        if (expr === 'location.href') return 'https://clerk.example.gov/search';
        if (expr.includes('#legacy-btn-v1')) return null; // Old CSS broke!
        return redesignedElements; // inspectInteractiveElements
      }),
    };

    const res = await resolveMappedLandmark(mockBrowser, 'runQuery', { mapsDir });
    expect(res.resolved).toBe(true);
    expect(res.tier).toBe(1);
    expect(res.healed).toBe(true);
    expect(res.previousCss).toBe('#legacy-btn-v1');
    expect(res.css).toBe('[data-testid="clerk-search-v2"]');
    expect(res.x).toBe(580);

    // Persisted healed selector onto disk for future Tier 0 runs
    const updatedMap = loadSiteMap('https://clerk.example.gov', mapsDir);
    expect(updatedMap.landmarks.runQuery.css).toBe('[data-testid="clerk-search-v2"]');
    expect(updatedMap.landmarks.runQuery.healCount).toBe(1);
  });

  it('auto-dismisses obscuring cookie/modal overlays detected via elementFromPoint before clicking', async () => {
    saveSiteMap('https://app.example.com', {
      landmarks: {
        saveBtn: { css: '#save-btn', tag: 'button', text: 'Save' },
      },
    }, mapsDir);

    const tapped = [];
    const mockBrowser = {
      evaluate: jest.fn(async (expr) => {
        if (expr === 'location.href') return 'https://app.example.com';
        if (expr.includes('elementFromPoint')) {
          return {
            obstructed: true,
            isModalOverlay: true,
            hitTag: 'div',
            dismissCandidate: { text: 'Accept Cookies', x: 500, y: 520 },
          };
        }
        return { tag: 'button', text: 'Save', x: 720, y: 340 };
      }),
      tap: jest.fn(async (x, y) => {
        tapped.push([x, y]);
      }),
    };

    const out = await actOnLandmark(mockBrowser, 'saveBtn', { mapsDir });
    expect(out.dismissedOverlay).toBe(true);
    expect(tapped).toEqual([
      [500, 520], // Dismissed modal first
      [720, 340], // Clicked target second
    ]);
  });

  it('supports Tier 2 textResolver and preserves Tier 3 visionFallback hook for 5% <canvas> surfaces', async () => {
    saveSiteMap('https://gis.example.gov', {
      landmarks: {
        parcelPolygon: {
          css: '#missing-dom-node',
          tag: 'canvas',
          text: 'Parcel 12-34-56',
        },
      },
    }, mapsDir);

    const visionFallback = jest.fn(async ({ domain, landmarkKey, screenshotBase64 }) => {
      expect(domain).toBe('gis.example.gov');
      expect(landmarkKey).toBe('parcelPolygon');
      expect(screenshotBase64).toBe('FAKE_PNG_B64');
      return { x: 444, y: 333, css: 'canvas#gis-surface' };
    });

    const mockBrowser = {
      evaluate: jest.fn(async (expr) => {
        if (expr === 'location.href') return 'https://gis.example.gov/map';
        if (expr.includes('#missing-dom-node')) return null;
        return []; // Pure canvas — 0 DOM interactive elements matching
      }),
      getAccessibilityTree: jest.fn(async () => ''),
      screenshot: jest.fn(async () => 'FAKE_PNG_B64'),
    };

    const res = await resolveMappedLandmark(mockBrowser, 'parcelPolygon', {
      mapsDir,
      visionFallback,
    });
    expect(res.resolved).toBe(true);
    expect(res.tier).toBe(3);
    expect(res.x).toBe(444);
    expect(res.y).toBe(333);
    expect(visionFallback).toHaveBeenCalledTimes(1);
  });

  it('records a landmark fingerprint by element index and scores anchors deterministically', async () => {
    const mockBrowser = {
      evaluate: jest.fn(async (expr) => {
        if (expr === 'location.href') return 'http://localhost:5173/login';
        return [
          {
            index: 0,
            css: 'input[name="email"]',
            tag: 'input',
            type: 'email',
            role: 'textbox',
            name: 'email',
            ariaLabel: 'Email Address',
            placeholder: 'you@company.com',
            dataTestId: 'login-email',
            text: '',
            nearHeading: 'Sign In',
            typeable: true,
            x: 200,
            y: 150,
            width: 240,
            height: 36,
          },
        ];
      }),
    };

    const rec = await recordLandmark(mockBrowser, 'emailInput', 0, { mapsDir });
    expect(rec.domain).toBe('localhost_5173');
    expect(rec.landmark.dataTestId).toBe('login-email');
    expect(scoreAnchorMatch(rec.landmark, { dataTestId: 'login-email', tag: 'input', typeable: true })).toBeGreaterThanOrEqual(60);
  });
});
