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
| **Version** | **1.1.0** |
| **Git tip (at release)** | branch `chore/professional-cleanup` → merge to `master` |
| **Preservation freeze** | `preserve/main-pre-professional-cleanup-20260712` @ `9ac967c` |
| **Date** | 2026-07-12 |
| **Status** | Professional cleanup (packaging, docs, tests, CI) |

---

## Lineage

| Version | Date | Notes |
|---------|------|--------|
| **1.1.0** | 2026-07-12 | Professional packaging: correct exports, VERSION/CHANGELOG/LICENSE/SECURITY, headed-daemon skill alignment, green unit tests, GitHub Actions CI. |
| **1.0.0** | 2026-04 | Feature parity with clawgle lineage: headed lifecycle daemon, skill CLI, CDP engine (scroll, iframe, network, REPL, PerimeterX hold). Frozen at `preserve/main-pre-professional-cleanup-20260712`. |

---

## Preservation branches

When making large cleanups, pin `main` first:

```bash
git branch preserve/main-pre-<reason>-YYYYMMDD
git push -u origin preserve/main-pre-<reason>-YYYYMMDD
```

Do not delete preservation branches without Operator approval.

---

## Release checklist

1. Update `VERSION`, `package.json` version, `CHANGELOG.md`, and this file.  
2. `npm test` green.  
3. Tag: `git tag -a v1.1.0 -m "aim-browser v1.1.0"` (after merge to `master`).  
4. Note preservation branch if this was a breaking restructure.

---

## Consumers

- A.I.M. agents via `aim-browser.skill`  
- Production cron scripts via `import { AimBrowser, startDaemon } from 'aim-browser'`  
- Lead / clawgle-style protected-site workflows (private repo)
