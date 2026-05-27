---
name: commit-history
description: List recent git commits linked to agent sessions. Use when user asks "show agent commits" or wants commits with session context.
argument-hint: "[branch=... repo=... limit=...]"
user-invocable: true
---

Parse $ARGUMENTS for optional branch=, repo=, limit= tokens. Defaults: no filter, limit 100.
Call `memory_commits` with parsed filters, or fall back to HTTP:
GET $AGENTMEMORY_URL/agentmemory/commits with URL-encoded query params.
Render reverse-chronological: short SHA, branch, timestamp, commit message, linked session id(s).
If empty, tell the user and suggest dropping filters. Do not invent commits.
