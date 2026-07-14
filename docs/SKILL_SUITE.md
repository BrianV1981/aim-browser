# aim-browser skill suite

**Name:** aim-browser **skill suite** (engine + thin one-verb skills).  
**Epic:** https://github.com/BrianV1981/aim-browser/issues/7  
**Agent entrypoint:** repo root `README.md` (agent playbook).

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

Shared: `src/skill-utils.js` (lifecycle, cache, extract).  
Install into hosts: `scripts/install-skills.sh`.  
Reporting: `docs/AGENT_REPORTING.md`.
