---
tags: [security]
---
Never introduce command injection, XSS, or SQL injection. Validate all external input at system boundaries. Never commit files that look like secrets (.env, credentials.json). Warn if the user explicitly asks to commit one anyway.
