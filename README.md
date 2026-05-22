# ag-agentmemory

[English](README.md) | [Tiếng Việt](README.vi.md)

Automation layer for [AgentMemory](https://github.com/rohitg00/agentmemory) on macOS — bridges Antigravity CLI, Codex CLI, and Claude Code to a local AgentMemory server without requiring any API key.

LLM calls are routed through the logged-in `agy` CLI. Embeddings run locally.

## How It Works

```
Claude Code / Codex / Antigravity
        │
        ▼
  AgentMemory Server (port 3111)
        │  openai provider → OPENAI_BASE_URL
        ▼
  agy-proxy  (port 3129, OpenAI-compatible)
        │  spawns per request
        ▼
  agy-clean-wrapper.sh
        │  snapshots brain/ & conversations/ before call
        │  cleans up new entries after call (lsof-safe for concurrent calls)
        ▼
  agy CLI  (~/.local/bin/agy)
```

`~/.agentmemory/.env` is the single source of truth for configuration:

```env
EMBEDDING_PROVIDER=local
BM25_WEIGHT=0.4
VECTOR_WEIGHT=0.6
AGENTMEMORY_URL=http://localhost:3111
AGENTMEMORY_AUTO_COMPRESS=true
CONSOLIDATION_ENABLED=true
GRAPH_EXTRACTION_ENABLED=true
AGENTMEMORY_DROP_STALE_INDEX=false
OPENAI_BASE_URL=http://127.0.0.1:3129
OPENAI_MODEL=agy-cli
```

## Quick Start

```bash
bash setup.sh
```

Single client:

```bash
bash setup.sh --client antigravity
bash setup.sh --client codex
bash setup.sh --client claude
```

Skip upstream sync:

```bash
bash setup.sh --skip-upstream
```

## LaunchAgent — Autostart on Login

Registers two persistent background services via macOS LaunchAgents. Both restart automatically on crash.

```bash
bash set-run.sh
```

| Service | Port | Log |
|---|---|---|
| `com.agentmemory.agy-proxy` | 3129 | `~/.agentmemory/agy-proxy.log` |
| `com.agentmemory.server` | 3111 / 3113 | `~/.agentmemory/server.log` |

All paths in `set-run.sh` are resolved dynamically — no hardcoded usernames or prefixes.

```bash
# Check status
launchctl list | grep agentmemory

# View logs
tail -f ~/.agentmemory/agy-proxy.log
tail -f ~/.agentmemory/server.log
```

## agy-clean-wrapper.sh

Wraps each `agy` invocation to prevent data accumulation in `~/.gemini/antigravity-cli/`:

- Snapshots `brain/` and `conversations/` before the call
- Deletes only entries created during this call after it completes
- Uses `lsof` to avoid removing entries still open by concurrent agy calls
- Handles `SIGTERM` / `SIGINT` via `trap` — cleanup runs even on proxy timeout

`AGY_REAL_BIN` overrides the agy binary path (default: `~/.local/bin/agy`).

## Upstream Snapshot

Each setup run clones or pulls upstream AgentMemory into `.agentmemory-upstream/`, then syncs it to `agentmemory/` (no git metadata). If network fails but `agentmemory/` exists, setup continues with the cached snapshot.

## Clients

**Claude Code** — installs upstream plugin and connects AgentMemory hooks.

**Codex CLI** — writes MCP fallback config to `~/.codex/config.toml`, installs upstream plugin, runs `agentmemory connect codex --with-hooks --force`.

**Antigravity** — no upstream plugin exists; setup configures manually:
- MCP config: `~/.gemini/antigravity/mcp_config.json`
- Instructions: `~/.gemini/GEMINI.md` (sentinel block prevents overwrite)
- Skills: `~/.gemini/antigravity/skills/`

## AgentMemory Server

```bash
# Health check
curl -fsSL http://localhost:3111/agentmemory/health

# Viewer UI
open http://localhost:3113
```

Before restarting, `setup.sh` backs up runtime state to `~/.agentmemory/backups/setup-<timestamp>/`.

## CLI

After `npm run build`:

```bash
node dist/cli.js setup --profile local --client all
node dist/cli.js setup --profile agy-local --agy-bin ~/.local/bin/agy
node dist/cli.js agy-proxy --host 127.0.0.1 --port 3129
node dist/cli.js verify
node dist/cli.js status
```

## Custom Overlay

Place files under `custom/instructions/` or `custom/skills/` to override any default template. Setup copies defaults first, then applies your overlay. Re-running `setup.sh` reapplies it.

## Patches & Known Fixes

Local fixes applied on top of upstream — see [`docs/`](docs/) for details.

| File | Issue | Fix |
|---|---|---|
| `agentmemory/plugin/scripts/stop.mjs` | Missing `async: true` caused Stop hook to block 3+ min, silently failing summarization on Codex and Claude Code | Add `async: true` to summarize request body; reduce timeout to 5s |

When upstream overwrites these files, rebuild with `cd agentmemory && npm run build` — the source (`src/hooks/stop.ts`) already contains the correct logic.

## Constraints

- Requires a logged-in `agy` CLI
- Each LLM call spawns a new CLI process — slower than direct API calls
- Embeddings are local only
- Does not fork or patch AgentMemory upstream source
- Does not require an API key
