---
name: agentmemory-setup
description: Use when installing, verifying, or troubleshooting AgentMemory setup for Antigravity, Codex CLI, or Claude Code
---

# AgentMemory Setup

Use this for AgentMemory setup and verification.

## Expected Env Config

`~/.agentmemory/.env` should contain:

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

Hooks and LLM-backed automation are enabled by default through the local Antigravity CLI proxy. API keys are optional.

## Setup Modes

Use the default proxy setup when the user has a logged-in Antigravity CLI account but no API key:

```bash
bash setup.sh
```

This starts a local OpenAI-compatible proxy at `http://127.0.0.1:3129` and points AgentMemory's existing `openai` provider to it.

## Start Server

```bash
npx -y @agentmemory/agentmemory@latest
```

Viewer:

```text
http://localhost:3113
```

Health:

```bash
curl -fsSL http://localhost:3111/agentmemory/health
```

## Client Setup

- Antigravity: use custom MCP config and these skills.
- Codex CLI: keep MCP fallback and attempt upstream plugin install plus `agentmemory connect codex --with-hooks --force`.
- Claude Code: attempt upstream plugin install and `agentmemory connect claude-code` when the required CLIs are available.
