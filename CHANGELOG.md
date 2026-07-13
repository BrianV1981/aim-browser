# Changelog

All notable changes to this project are documented in this file.  
Version tracking narrative: see `VERSION.md`.

## [1.1.2] — 2026-07-12

### Changed
- **Operator-first window policy:** default start is **minimized** again (agent work must not cover the desk).
- Skill: `--start` = minimized; **`--start-visible`** = watch mode; `--show` still peeks mid-run.
- Docs: `docs/SEAMLESS_HEADED.md` — Xvfb / virtual display / VM options for seamless headed (real Chrome, zero popup on `:0`).

## [1.1.1] — 2026-07-12

### Changed
- `startDaemon({ minimized, visible })` env pass-through; `showWindow()` CDP helper.
- Skill flags for explicit minimize/visible control.

## [1.1.0] — 2026-07-12

### Added
- `VERSION` + `VERSION.md` control tracking (semver + preservation branch log).
- `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`.
- GitHub Actions CI (`npm ci` + `npm test`).
- `package.json` `exports`, `files`, daemon/skill npm scripts, engines, repository metadata.
- `solvePerimeterX({ preHoldMs, holdMs, afterMs })` timing overrides for tests/production control.
- Unit test for PerimeterX-absent path; test teardown closes browsers.

### Fixed
- Package entrypoint (`main` pointed at missing root `index.js`; now `src/index.js`).
- PerimeterX unit test timeout (was sleeping full 18s production holds under 5s Jest limit).
- Default constructor `headless` flag aligned with headed-daemon architecture (`false`).

### Changed
- Skill (`aim-browser.skill/SKILL.md`) rewritten for **headed lifecycle daemon** (not headless).
- README professional structure: install paths, multi-CLI skill notes, security profile warnings, A.I.M. vessel links.

### Preservation
- Pre-cleanup freeze: branch `preserve/main-pre-professional-cleanup-20260712` @ `9ac967c`.

## [1.0.0] — 2026-04

### Added
- Headed Chromium CDP lifecycle daemon (`start` / `stop` / `check`).
- `AimBrowser` pure-Node CDP client (tabs, evaluate, input, AX tree, screenshots, scroll, iframes, Fetch media block, network spy, PerimeterX hold, REPL).
- Agent skill CLI (`aim-browser.skill/scripts/run.js`).
- Feature parity work with legacy clawgle lineage (issues #1–#6).
