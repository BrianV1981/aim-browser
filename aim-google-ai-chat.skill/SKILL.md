---
name: aim-google-ai-chat
description: >
  Multi-turn Google AI Mode via aim-browser. Initial query opens udm=50; --follow-up sends additional turns.
  DOM for chat input is unstable — use --screenshot. Stop-after-session default.
---

# aim-google-ai-chat

```bash
npm run google-ai-chat -- "name three primary colors" --follow-up "which is brightest"
npm run google-ai-chat -- --turns /tmp/turns.json "initial query"
```

Single-shot without follow-ups: prefer **aim-google-ai**.
