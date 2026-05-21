# AgentMemory

Use AgentMemory for durable project memory across sessions.

## Rules

- Use `memory_smart_search` or `memory_recall` when past decisions, bugs, preferences, or architecture may matter.
- Use `memory_save` for durable facts, decisions, preferences, workflow notes, and bug discoveries that will matter in future sessions.
- Use `memory_lesson_save` for reusable lessons.
- Do not save secrets, API keys, tokens, passwords, or private credentials.
- Keep saved memories concise and include relevant file paths when useful.

## Embeddings

This setup uses local embeddings and enables hook-driven LLM automation through the local Antigravity CLI proxy:

```env
EMBEDDING_PROVIDER=local
AGENTMEMORY_AUTO_COMPRESS=true
CONSOLIDATION_ENABLED=true
GRAPH_EXTRACTION_ENABLED=true
OPENAI_BASE_URL=http://127.0.0.1:3129
OPENAI_MODEL=agy-cli
```

API keys are optional because AgentMemory calls the local proxy, which forwards to the logged-in `agy` CLI.
Keep `AGENTMEMORY_DROP_STALE_INDEX=false` during normal setup so reruns do not discard persisted indexes. Enable it only as a temporary recovery switch when AgentMemory refuses to start because an old vector index has incompatible dimensions.

## Useful Tools

| Task | Tool |
|------|------|
| Search prior context | `memory_smart_search` |
| Save durable memory | `memory_save` |
| Save reusable lesson | `memory_lesson_save` |
| List recent sessions | `memory_sessions` |
| Diagnose memory state | `memory_diagnose` |
