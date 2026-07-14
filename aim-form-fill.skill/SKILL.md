---
name: aim-form-fill
description: >
  Fill known form fields on an allowlisted host via aim-browser. Requires --allow-host and --fields.
  Never submits unless --submit. Redacts password-like values in output. Stop-after-session default.
---

# aim-form-fill

**Safety:** refuse without `--allow-host`. No default submit.

```bash
npm run form-fill -- \
  --url "https://example.com/form" \
  --allow-host example.com \
  --fields '{"#email":"agent@example.com","#q":"hello"}'

# Only when Operator asked to submit:
npm run form-fill -- --url "…" --allow-host example.com --fields '{…}' --submit
```

## Agent rules

- Never log raw passwords; JSON already redacts.
- Do not use on banking/password-manager pages without explicit Operator order.
- `file://` fixtures may be blocked by Chromium; serve local HTML over `http://127.0.0.1` and `--allow-host 127.0.0.1` (or use `--allow-host file` only when the browser can open file URLs).
