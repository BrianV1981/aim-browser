# Version control tracking — aim-browser

This file is the **human-readable control log** for releases.  
Machine-readable single field: `VERSION` (and `package.json` → `version`). Keep all three in sync.

| Field | Location |
|-------|----------|
| Semver string | `VERSION` |
| npm package version | `package.json` |
| Narrative log | this file + `CHANGELOG.md` |

---

## Current

| Field | Value |
|-------|--------|
| **Version** | **1.3.1** |
| **Date** | 2026-07-14 |
| **Status** | Public-ready clean tree (skill suite + agent-first docs) |

---

## Lineage

| Version | Date | Notes |
|---------|------|--------|
| **1.3.1** | 2026-07-14 | Launch-ready docs hygiene; clean git history root. |
| **1.3.0** | 2026-07-13 | Full skill suite + skill-utils + cache + install-skills + agent README. |
| **1.1.3** | 2026-07-12 | Re-minimize after tab open; google-ai stop-after-session default. |
| **1.1.2** | 2026-07-12 | Operator-first: minimized by default; `--start-visible` watch mode; seamless headed docs. |
| **1.1.1** | 2026-07-12 | `showWindow()` + explicit minimize/visible flags. |
| **1.1.0** | 2026-07-12 | Professional packaging: exports, VERSION/CHANGELOG/LICENSE/SECURITY, CI, unit tests. |
| **1.0.0** | 2026-04 | Headed lifecycle daemon, skill CLI, CDP engine (scroll, iframe, network, REPL, optional PX hold helper). |

---

## Release checklist

1. Update `VERSION`, `package.json` version, `CHANGELOG.md`, and this file.  
2. `npm test` green.  
3. Tag: `git tag -a v1.3.1 -m "aim-browser v1.3.1"` after merge to `master`.

---

## Consumers

- A.I.M. agents via the skill suite (`aim-*.skill/`)  
- Production scripts via `import { AimBrowser, startDaemon } from 'aim-browser'`  
- Vessel skill installs via `scripts/install-skills.sh`
