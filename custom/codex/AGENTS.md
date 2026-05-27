# AgentMemory

Use AgentMemory for durable project memory across sessions.

## Rules

- Use `memory_smart_search` or `memory_recall` when past decisions, bugs, preferences, or architecture may matter.
- Use `memory_save` for durable facts, decisions, preferences, workflow notes, and bug discoveries.
- Use `memory_lesson_save` for reusable lessons.
- Do not save secrets, API keys, tokens, passwords, or private credentials.
- Keep saved memories concise and include relevant file paths when useful.