---
name: forget
description: Delete specific observations or sessions from agentmemory. Use when user says "forget this", "delete memory", or wants to remove specific data.
argument-hint: "[session ID, file path, or search term]"
user-invocable: true
---

The user wants to remove data from agentmemory: $ARGUMENTS

IMPORTANT: Always confirm with the user before deleting.
1. Search with `memory_smart_search`, query from user input, limit 20.
2. Show found items and ask for explicit confirmation.
3. Once confirmed, call `memory_governance_delete` with `memoryIds: [...]`.
4. Confirm deletion count back to the user.
