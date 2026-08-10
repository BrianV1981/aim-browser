# Vessel dual compatibility (Grok + AGY)

**Rule:** Improve Grok CLI packaging without stripping AGY / Antigravity install paths or docs.

## Skill install

Source trees live as `aim-*.skill/` in this repo.  
**Host-facing folder name** (after `install-skills.sh`) is the skill id — **no `.skill` suffix**:

| Source | Installed as |
|--------|----------------|
| `aim-google-ai.skill/` | `aim-google-ai/` |
| `aim-browser.skill/` | `aim-browser/` |

```bash
# From package root
npm run install-skills -- "${HOME}/.grok/skills" --mode symlink
npm run install-skills -- "${HOME}/.gemini/antigravity-cli/skills" --mode symlink
npm run install-skills -- /path/to/project/.grok/skills --mode symlink
npm run install-skills -- /path/to/project/.gemini/skills --mode symlink
```

| Vessel | Typical skills path |
|--------|---------------------|
| **Grok** | `~/.grok/skills/` or `<project>/.grok/skills/` |
| **AGY** | `~/.gemini/antigravity-cli/skills/` or `<project>/.gemini/skills/` |
| **OpenCode** | `<project>/.opencode/skills/` |

## Package root / engine imports

Thin skill CLIs import `../../src/…` relative to the monorepo layout. Always:

1. Run `npm run <skill>` from the **aim-browser package root**, or  
2. Set **`AIM_BROWSER_ROOT`** to that root (absolute or `~`-expandable path resolved by the shell).

Helpers: `resolvePackageRoot()` / `isAimBrowserPackageRoot()` in `src/skill-utils.js`.

## Path hygiene

- **Forbidden** in skills/docs/scripts: machine-local absolute homes (`/home/<user>/…`, `/Users/<user>/…`) and operator usernames.  
- **Allowed:** `$HOME`, `~`, `$AIM_BROWSER_ROOT`, `/path/to/aim-browser`, relative repo paths.

## Dual vessel playbooks

- Document **both** Grok and AGY install roots when editing README/skills.  
- Do not replace AGY paths with Grok-only paths (or the reverse).  
- Prefer host-neutral CLI instructions (`npm run …` from package root).

## Tests

```bash
npm test
# includes tests/portability.test.js (install naming, paths, dual docs)
```
