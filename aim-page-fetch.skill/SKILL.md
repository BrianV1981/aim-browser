---
name: aim-page-fetch
description: >
  Open a URL in headed Chromium via aim-browser and extract main text, title, meta, and links.
  Use when the Operator wants page content without inventing text. Closes browser after session by default.
---

# aim-page-fetch

## Agent instructions

1. Run from **aim-browser repo root** after `npm install`.
2. Prefer this skill over guessing page contents.
3. Parse markdown then `---JSON---` for structured fields.
4. Default: **minimized** + **stop Chromium after run**. Use `--keep-open` only if chaining.

```bash
npm run page-fetch -- "https://example.com"
npm run page-fetch -- --screenshot /tmp/page.png --url "https://example.com"
```

## Output JSON keys

`title`, `url`, `canonical`, `description`, `meta`, `mainText`, `links[]`, `rawLength`, optional `screenshot`, optional `cached`.

## Reporting

```
SKILL: aim-page-fetch
URL: …
SCREENSHOT: …
```
