---
name: aim-screenshot-url
description: >
  Open a URL in headed Chromium and save a PNG screenshot. Use for proof artifacts and audits.
  Minimized by default; stops Chromium after the session.
---

# aim-screenshot-url

```bash
npm run screenshot-url -- "https://example.com"
npm run screenshot-url -- --out /tmp/proof.png --url "https://example.com"
npm run screenshot-url -- --full-page "https://example.com"
```

## Agent notes

- Always report the absolute `screenshot` path from JSON.
- Do not claim visual content without reading the PNG or pairing with page-fetch.
