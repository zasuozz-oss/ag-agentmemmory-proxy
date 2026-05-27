---
name: recall
description: Search agentmemory for past observations, sessions, and learnings about a topic. Use when the user says "recall", "remember", "what did we do", or needs context from past sessions.
argument-hint: "[search query]"
user-invocable: true
---

The user wants to recall past context about: $ARGUMENTS

Use `memory_smart_search` with the query as the `query` argument and `limit: 10`.
Present results grouped by session — type, title, narrative. Highlight importance >= 7.
If no results, suggest 2-3 alternative search terms. Do NOT fabricate observations.
