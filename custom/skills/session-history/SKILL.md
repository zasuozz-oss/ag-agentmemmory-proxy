---
name: session-history
description: Show recent sessions for this project. Use when user asks "what did we do last time", "session history", or "past sessions".
user-invocable: true
---

Call `memory_sessions` with `limit: 20`. Present in reverse chronological order:
- Session ID (8 chars), project, start time, status
- Key highlights per session (type + title) for sessions with observations
- Observation count and summary/title if available
Do NOT fabricate sessions.
