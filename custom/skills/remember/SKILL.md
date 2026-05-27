---
name: remember
description: Explicitly save an insight, decision, or learning to agentmemory long-term storage. Use when the user says "remember this", "save this", or wants to preserve knowledge for future sessions.
argument-hint: "[what to remember]"
user-invocable: true
---

The user wants to save this to long-term memory: $ARGUMENTS

1. Extract the core insight, decision, or fact.
2. Extract 2-5 searchable `concepts` (lowercased keyword phrases).
3. Extract any relevant `files` (absolute or repo-relative paths).
4. Call `memory_save` with `content`, `concepts`, and `files`.
5. Confirm to the user and show the concepts tagged.
