# AgentMemory

Durable, cross-session project memory. A PostToolUse hook captures your work
automatically (dedup + secret-stripping + LLM compression), so you do NOT need
to log routine actions. Your job is to *retrieve* relevant memory before acting,
and to *save* the high-value insights the hook cannot infer on its own.

## Retrieve first

- At the start of a session or a new task — and whenever past decisions, bugs,
  conventions, preferences, or architecture might matter — search before acting.
- Use `memory_smart_search` (hybrid BM25 + vector + graph) for conceptual
  queries; use `memory_recall` for quick keyword or file-path lookups. Pass a
  focused `query` and `limit: 10`.
- Use `memory_sessions` to resume prior work ("where were we", "handoff");
  match by the current working directory.
- Act only on what the tools actually return — never fabricate past
  observations. If nothing comes back, say so and suggest 2-3 alternative
  search terms.

## Save what matters

- Use `memory_save` for durable facts: decisions, architecture, preferences,
  workflow notes, and bug root-causes/fixes. Skip routine edits the hook
  already captures.
- Always include `concepts` — 2-5 specific lowercased keyword phrases
  (`"jwt-refresh-rotation"` beats `"auth"`) — and `files` (absolute or
  repo-relative paths) so the memory is retrievable later.
- Keep each entry concise and self-contained; preserve the key phrasing.
- Use `memory_lesson_save` for reusable, generalizable lessons (gotchas or
  patterns that apply beyond the immediate task).

## Privacy

- Never save secrets, API keys, tokens, passwords, or private credentials. The
  pipeline strips obvious secrets, but do not rely on it.
