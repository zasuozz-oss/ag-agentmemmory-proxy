---
name: commit-context
description: Trace a file, function, or line back to the agent session that produced its current commit.
argument-hint: "[file, function, or line]"
user-invocable: true
---

The user wants commit context for: $ARGUMENTS

Run `git blame` or `git log -L` on the target to get the commit SHA.
Look up the linked session via `memory_commit_lookup` with `sha: "<full-sha>"` if available,
or fall back to HTTP: GET $AGENTMEMORY_URL/agentmemory/session/by-commit?sha=<sha>.
Present: commit SHA, branch, author, message, linked session(s), key observations (importance >= 7).
Do not fabricate intent. Say plainly if no session is linked.
