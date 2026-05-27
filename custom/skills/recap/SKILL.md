---
name: recap
description: Summarize recent agent sessions for the current project. Use when user asks "recap", "what have we been doing", "this week", "today".
argument-hint: "[last N | today | this week]"
user-invocable: true
---

The user wants a recap. Time window args: $ARGUMENTS

Parse $ARGUMENTS: "today" = current date, "this week" = last 7 days, "last N" / bare number = N sessions, empty = last 10.
Call `memory_sessions`, filter by cwd and time window, sort by startedAt descending.
Group by date. For each session: id (8 chars), title, observation count, status.
Use `memory_recall` (limit 3) for highlights (importance >= 7).
End with totals: "N sessions across M days, K observations."
