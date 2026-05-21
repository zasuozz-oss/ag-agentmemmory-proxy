# ag-agentmemory

[English](README.md) | [Tiếng Việt](README.vi.md)

Upstream AgentMemory repo: https://github.com/rohitg00/agentmemory

Automation setup for AgentMemory across Antigravity, Codex CLI, and Claude Code.

Setup keeps `~/.agentmemory/.env` as the source of truth, uses the local embedding model, and enables AgentMemory automation through the logged-in Antigravity CLI proxy. API keys are optional.

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

## Quick Install

Default setup uses the logged-in Antigravity CLI through a local proxy, no API key required:

```bash
bash setup.sh
```

To set up a single client only:

```bash
bash setup.sh --client antigravity
```

To skip the upstream sync for faster execution:

```bash
bash setup.sh --skip-upstream
```

## Agy Local Proxy

`setup.sh` does not patch upstream AgentMemory. It starts a local OpenAI-compatible proxy at `http://127.0.0.1:3129`, then configures AgentMemory's existing `openai` provider to call that proxy. The proxy forwards requests to `agy --print-timeout 120s -p "<prompt>"`.

Requirements and limits:

- Requires a logged-in `agy` CLI, defaulting to `~/.local/bin/agy`.
- Each LLM call spawns CLI work, so it is slower than direct API calls.
- Embeddings remain local.
- Hooks and LLM-backed automation are enabled by default.

## Upstream Snapshot

Each time setup is executed, the script will clone or pull the upstream AgentMemory into the cache:

```text
.agentmemory-upstream/
```

Then, it syncs it to the working copy without git metadata:

```text
agentmemory/
```

The `agentmemory/` directory keeps a local snapshot so that you can still read docs, plugins, hooks, and scripts even if the upstream GitHub repository is deleted or if there is a network issue. If pulling/cloning fails but `agentmemory/` already exists, the setup will proceed using the old snapshot.

## AgentMemory Server

After the setup is complete, run the server:

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

Before `setup.sh` restarts AgentMemory, it backs up runtime state into:

```text
~/.agentmemory/backups/setup-<timestamp>/
```

The backup includes the local `data/` directory when present, `~/.agentmemory/standalone.json`, and the current env file.

## Antigravity

Since Antigravity does not have an upstream AgentMemory plugin yet, this repository sets it up manually:

- MCP: `~/.gemini/antigravity/mcp_config.json`
- Instructions: `~/.gemini/GEMINI.md`
- Skills: `~/.gemini/antigravity/skills/`

The setup uses a sentinel block to avoid overwriting existing content in `GEMINI.md`.

## Codex CLI

Setup writes the MCP fallback configuration in:

```text
~/.codex/config.toml
```

Setup also attempts to install the upstream AgentMemory plugin and run `agentmemory connect codex --with-hooks --force`.

## Claude Code

Setup attempts to install the upstream Claude Code plugin and connect AgentMemory hooks when `claude` and `agentmemory` CLIs are available.

## CLI

After building:

```bash
node dist/cli.js setup --profile local --client all
node dist/cli.js setup --profile agy-local --agy-bin ~/.local/bin/agy
node dist/cli.js agy-proxy --host 127.0.0.1 --port 3129
node dist/cli.js verify
node dist/cli.js status
```

## Custom Overlay

You can override templates by placing the corresponding files in:

```text
custom/instructions/
custom/skills/
```

The setup copies the default templates first, and then overlays your custom templates.

Antigravity instructions are written into `~/.gemini/GEMINI.md` using the following block:

```text
<!-- AGENTMEMORY_RULES_START -->
...
<!-- AGENTMEMORY_RULES_END -->
```

Running `setup.sh` again will update this block and copy active skills to `~/.gemini/antigravity/skills/`.

## What We Do Not Do

- Do not fork the AgentMemory upstream repository.
- Do not require an API key for embeddings.
