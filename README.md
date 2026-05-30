# ag-agentmemmory-proxy

[English](README.md) · [Tiếng Việt](README.vi.md)

> Production installer that wires [AgentMemory](https://github.com/rohitg00/agentmemory) into **Claude Code**, **Codex CLI**, and **Antigravity**, and runs a local **OpenAI-compatible proxy** backed by the authenticated `agy` CLI — so AgentMemory works across all three agents with **zero API keys**.

---

## Table of Contents

- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Uninstall](#uninstall)
- [Overview](#overview)
- [Architecture](#architecture)
- [What Gets Installed](#what-gets-installed)
- [Project Layout](#project-layout)

---

## Quick Start

```bash
# 1. Install the AgentMemory CLI (one-time, requires sudo)
sudo npm install -g @agentmemory/agentmemory

# 2. Run the installer (no sudo)
bash setup.sh
```

Then restart Claude Code, Codex, Antigravity, and open a new terminal.

> First time opening the Codex TUI: accept all 6 agentmemory hook prompts when asked.

---

## CLI Reference

```bash
bash setup.sh [options]
```

**Client wiring**

| Flag                                              | Default | Description                                  |
| ------------------------------------------------- | ------- | -------------------------------------------- |
| `--client <all\|claude-code\|codex\|antigravity>` | `all`   | Limit installation to a single client        |
| `--force`                                         | off     | Re-wire even if already installed            |
| `--skip-env`                                      | off     | Do not modify shell profiles                 |

**Proxy / daemon**

| Flag                          | Default                  | Description                                     |
| ----------------------------- | ------------------------ | ----------------------------------------------- |
| `--skip-proxy`                | off                      | Skip building / starting the agy proxy + daemon |
| `--skip-build`                | off                      | Skip `npm install && npm run build`             |
| `--agy-bin <path>`            | `./agy-clean-wrapper.sh` | Path to the `agy` wrapper or binary             |
| `--host <host>`               | `127.0.0.1`              | Proxy bind host                                 |
| `--port <number>`             | `3129`                   | Proxy bind port                                 |
| `--timeout-ms <number>`       | `120000`                 | `agy` CLI timeout in milliseconds               |
| `--sandbox`                   | off                      | Pass `--sandbox` to the `agy` CLI               |
| `--agentmemory-bin <path>`    | auto-detect              | Override the `agentmemory` binary path          |
| `--skip-agentmemory-startup`  | off                      | Do not register the daemon as a startup task    |
| `-h`, `--help`                |                          | Show usage                                      |

The proxy phase is idempotent — re-running `bash setup.sh` is safe and skips work if the proxy is already healthy.

---

## Verification

```bash
# Proxy health
curl -fsSL http://127.0.0.1:3129/health

# AgentMemory daemon health
curl -fsSL http://localhost:3111/agentmemory/health

# CLI status
agentmemory status
agentmemory doctor
```

Dashboard: open `http://localhost:3113` in a browser.

Live logs:

```bash
tail -f ~/.ag-agentmemmory-proxy/agy-proxy.log         # proxy
tail -f ~/.ag-agentmemmory-proxy/agentmemory.log       # daemon (macOS/Windows startup task)
```

---

## Troubleshooting

| Symptom                                                          | Fix                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| MCP tools not visible in Claude Code / Codex / Antigravity       | Restart the client. New shell must have `AGENTMEMORY_URL` exported (re-open terminal).              |
| Codex shows hook trust prompts but tools still missing           | Accept **all 6** hooks in the TUI, then restart Codex.                                              |
| `agy-cli` proxy returns 502 / hangs                              | `agy login` (token may have expired). Then `bash setup.sh --skip-build`.                            |
| `agentmemory doctor` reports daemon not running                  | macOS: `launchctl load ~/Library/LaunchAgents/com.agentmemory.plist`. Windows: `schtasks /Run /TN AgentMemory`. |
| Port already in use (`:3111`, `:3129`, `:3113`)                  | Stop the conflicting process or change `--port` for the proxy.                                      |
| `GEMINI.md` rules block missing                                  | Re-run `bash setup.sh --client antigravity --force`.                                                |

---

## Uninstall

```bash
# Stop services
agentmemory stop 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.agentmemory.plist 2>/dev/null || true   # macOS
schtasks /Delete /TN AgentMemory /F 2>/dev/null || true                              # Windows

# Remove data and config
rm -rf ~/.agentmemory ~/.ag-agentmemmory-proxy
rm -f  ~/Library/LaunchAgents/com.agentmemory.plist

# Uninstall the CLI
sudo npm uninstall -g @agentmemory/agentmemory
```

Then remove the `agentmemory` entries (and the `<!-- AGENTMEMORY_RULES_START/END -->` block) from:

- `~/.claude/settings.json`
- `~/.claude.json`
- `~/.codex/config.toml`
- `~/.gemini/antigravity/mcp_config.json`
- `~/.gemini/GEMINI.md`
- `~/.zshrc` / `~/.bashrc` / `~/.bash_profile`

---

## Overview

AgentMemory is a persistent memory daemon for AI coding agents. Wiring it manually across multiple tools is tedious and error-prone — each client has a different config format (JSON / TOML / skill files), different hook system, and different startup model.

`ag-agentmemmory-proxy` automates the entire setup in one command:

- Connects AgentMemory as an **MCP server** in Claude Code, Codex, and Antigravity.
- Installs **hooks** so the daemon auto-starts with each session.
- Drops **8 user-invocable skills** (`/recall`, `/remember`, `/forget`, …) into Antigravity.
- Spins up a local **`agy-cli` OpenAI-compatible proxy** on `:3129`, letting AgentMemory call the logged-in Antigravity CLI as its LLM provider — no `OPENAI_API_KEY` needed.
- Registers the daemon as a **startup service** (LaunchAgent on macOS, Task Scheduler on Windows) so it survives reboots.

Supported on **macOS** and **Windows** (Git Bash / MSYS2).

**Other prerequisites** (besides the `agentmemory` CLI in Quick Start): `node` ≥ 18, `npm`, `agy` CLI logged in (`agy login`), plus `claude` and/or `codex` CLI for the clients you target.

---

## Architecture

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Claude Code  │   │  Codex CLI   │   │ Antigravity  │
│  (MCP+hooks) │   │   (MCP)      │   │ (MCP+skills) │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │ stdio MCP        │ stdio MCP        │ stdio MCP
       └──────────────────┼──────────────────┘
                          ▼
                ┌─────────────────────┐
                │  AgentMemory daemon │   :3111   (LaunchAgent / Task Scheduler)
                │     + Dashboard     │   :3113
                └──────────┬──────────┘
                           │ OpenAI-compatible HTTP
                           ▼
                ┌─────────────────────┐
                │   agy-cli proxy     │   :3129   (Node background process)
                └──────────┬──────────┘
                           │ exec
                           ▼
                ┌─────────────────────┐
                │  agy CLI (logged-in)│
                └─────────────────────┘
```

---

## What Gets Installed

### Runtime services

| Service                | Address                                | Auto-start                                  |
| ---------------------- | -------------------------------------- | ------------------------------------------- |
| AgentMemory daemon     | `http://localhost:3111`                | LaunchAgent (macOS) / Task Scheduler (Win)  |
| AgentMemory dashboard  | `http://localhost:3113`                | Served by the daemon                        |
| `agy-cli` proxy        | `http://127.0.0.1:3129`                | Background Node process spawned by setup    |

### Per-client wiring

| Client       | MCP config                                  | Hooks / extras                                                                  |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Claude Code  | `~/.claude.json` (via `agentmemory connect`)| `SessionStart` + `Stop` hooks merged into `~/.claude/settings.json`             |
| Codex CLI    | `~/.codex/config.toml`                      | 6 hooks (manual trust in TUI)                                                   |
| Antigravity  | `~/.gemini/antigravity/mcp_config.json`     | 8 skills in `~/.gemini/antigravity/skills/` + rules block in `~/.gemini/GEMINI.md` |

### Antigravity skills

| Skill              | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `/recall`          | Search past observations across sessions                 |
| `/remember`        | Save an insight, decision, or learning                   |
| `/forget`          | Delete specific observations or sessions                 |
| `/handoff`         | Resume the most recent session for the current project   |
| `/recap`           | Summarize recent sessions over a time window             |
| `/session-history` | List recent sessions for this project                    |
| `/commit-context`  | Trace a file/function back to the session that wrote it  |
| `/commit-history`  | List recent git commits linked to agent sessions         |

### Shell environment

`AGENTMEMORY_URL=http://localhost:3111` is written to:
- `~/.agentmemory/.env` (read by the MCP shim)
- `~/.zshrc`, `~/.bashrc`, `~/.bash_profile` (whichever exist)

### Proxy phase (inside `setup.sh`)

1. Build `dist/cli.js` (`npm install && npm run build`).
2. Write proxy config to `~/.ag-agentmemmory-proxy/proxy.env`.
3. Spawn the proxy in the background; logs → `~/.ag-agentmemmory-proxy/agy-proxy.log`.
4. Register the agentmemory daemon as a startup service and wait for `:3111` to become healthy.

---

## Project Layout

```
ag-agentmemmory-proxy/
├── setup.sh                # All-in-one: client wiring + agy proxy + daemon startup
├── agy-clean-wrapper.sh    # Sanitizing wrapper around the agy CLI
├── src/                    # agy-cli proxy source (TypeScript)
└── dist/                   # Build output (cli.js, used by setup.sh)
```

Upstream: <https://github.com/rohitg00/agentmemory>
