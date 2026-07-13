# Contributing to aim-browser

## Branches

| Branch | Purpose |
|--------|---------|
| `master` | Integration line |
| `preserve/*` | Frozen snapshots before large cleanups — **do not delete** without Operator approval |
| `chore/*` / `fix/*` / `feat/*` | Work branches |

## Workflow

1. Branch from current `master` (after `git pull`).  
2. Prefer TDD for engine changes: update `tests/cdp-client.test.js` first.  
3. Run `npm test` and keep it green.  
4. Surgical commits; never commit `node_modules`, profile caches, or `.env`.  
5. Open a PR into `master` when possible (private repo).

## Version bumps

Update **all** of: `VERSION`, `package.json` → `version`, `VERSION.md`, `CHANGELOG.md`.

## Architecture notes

- **Engine** (`src/`) is for production/cron scripts.  
- **Daemon** (`src/daemon/`) owns headed Chromium lifecycle.  
- **Skill** (`aim-browser.skill/`) is the agent exploration CLI.  

Do not reintroduce headless-as-default docs unless the daemon architecture changes.
