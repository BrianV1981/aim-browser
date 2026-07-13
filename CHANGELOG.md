# Changelog

All notable changes to this project are documented in this file.  
Version tracking narrative: see `VERSION.md`.

## [1.1.1] — 2026-07-12

### Changed
- **Visible browser by default:** `AIM_BROWSER_START_MINIMIZED` defaults to `0` (was `1`).
- `startDaemon({ minimized })` passes env into daemon scripts.
- Skill flags: `--start` shows window; `--start-minimized` for cron; `--show` / `--visible` un-minimizes + bringToFront.
- Engine: `showWindow({ maximize })` helper via CDP window bounds.

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
