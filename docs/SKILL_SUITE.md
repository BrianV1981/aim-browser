# aim-browser skill suite

Thin one-verb skills on the headed CDP engine. Agent overview: repo root `README.md`.

| Skill | npm script | Status |
|-------|------------|--------|
| aim-browser | `skill` | shipping |
| aim-google-ai | `google-ai` | shipping |
| aim-page-fetch | `page-fetch` | shipping |
| aim-google-web | `google-web` | shipping |
| aim-google-news | `google-news` | shipping |
| aim-screenshot-url | `screenshot-url` | shipping |
| aim-youtube-meta | `youtube-meta` | shipping |
| aim-google-ai-chat | `google-ai-chat` | shipping |
| aim-maps-place | `maps-place` | shipping |
| aim-form-fill | `form-fill` | shipping |
| aim-login-hold | `login-hold` | shipping |
| aim-web-diff | `web-diff` | shipping |

**Shared:** `src/skill-utils.js` (lifecycle, cache, extract, `resolvePackageRoot` / `AIM_BROWSER_ROOT`).  
**Install:** `npm run install-skills -- <vessel-skills-dir> --mode symlink` → dest folders without `.skill` suffix.  
**Dual vessel:** `docs/VESSEL_DUAL_COMPAT.md`  
**Reporting:** `docs/AGENT_REPORTING.md`

**Defaults (all thin skills unless noted):** minimized · re-minimize after tab open · stop Chromium after session.
