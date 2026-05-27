---
name: handoff
description: Resume the most recent agent session for the current project. Use when user says "where were we", "resume", "handoff", or starts with no fresh context.
argument-hint: "[optional cwd override]"
user-invocable: true
---

The user wants to resume work. Optional cwd override: $ARGUMENTS

1. Call `memory_sessions` and find the most recent session matching the current working directory.
2. If the session ended on an unanswered question, surface that first.
3. Summarize the session: title, key files, key decisions, errors.
4. Use `memory_recall` (limit 10) for supporting observations.
5. End with a "next step?" pointer. Do not invent observations.
