# Setup.sh Agy Upstream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repo instruction override: do not create branches, worktrees, or commits unless the user explicitly asks.

**Goal:** Viet lai `setup.sh` de setup agy-local proxy va ba client Antigravity, Codex CLI, Claude Code theo public upstream AgentMemory workflow.

**Architecture:** Replace `setup.sh` with a focused Bash entrypoint. The script owns agy proxy build/start, `.env` patching, Antigravity MCP/rule/skills copy, and orchestration of public upstream commands for Codex/Claude/AgentMemory server startup.

**Tech Stack:** Bash, Node.js/npm, existing `dist/cli.js agy-proxy`, upstream `agentmemory`, `codex`, `claude`, `curl`, macOS-compatible `sed`/`cp`.

---

## File Structure

- Modify: `setup.sh`
  - Replace the current script completely.
  - Responsibilities: argument parsing, prereq checks, env upsert, proxy startup, Antigravity setup, upstream Codex/Claude connect, upstream AgentMemory start, verification.
- Read only: `docs/superpowers/specs/2026-05-21-setup-sh-agy-upstream-design.md`
  - Source of requirements.
- Read only: `custom/instructions/AGENTMEMORY.md`
  - Preferred Antigravity rule source.
- Read only: `custom/skills/`
  - Preferred Antigravity skills source.
- Read only fallback: `src/templates/instructions/AGENTMEMORY.md`
  - Fallback Antigravity rule source.
- Read only fallback: `src/templates/skills/`
  - Fallback Antigravity skills source.

## Task 1: Replace setup.sh Skeleton And Argument Parser

**Files:**
- Modify: `setup.sh`

- [ ] **Step 1: Replace file header, defaults, logging helpers, and usage**

Use `apply_patch` to replace the top-level script with this structure before adding later functions:

```bash
#!/usr/bin/env bash
# ag-agentmemory setup script
# Owns agy-local proxy setup and delegates AgentMemory/Codex/Claude wiring to upstream CLIs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTMEMORY_ENV="${HOME}/.agentmemory/.env"
AGENTMEMORY_DIR="${HOME}/.agentmemory"
AGY_BIN="${HOME}/.local/bin/agy"
AGY_PORT=3129
CLIENT="all"
DROP_STALE_INDEX=false
CLEAR_DATA=false
SKIP_CONNECT=false
SKIP_DOCTOR=false
TRANSFORMERS_CACHE="${HOME}/.cache/xenova-transformers"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}▶ $*${NC}"; }

usage() {
  cat <<'USAGE'
Usage: bash setup.sh [options]

Options:
  --client <all|antigravity|codex|claude-code>
  --agy-bin <path>
  --port <number>
  --drop-stale-index
  --clear-data
  --skip-connect
  --skip-doctor
  -h, --help
USAGE
}
```

- [ ] **Step 2: Add strict argument parser**

Add this parser after `usage()`:

```bash
while [[ $# -gt 0 ]]; do
  case "$1" in
    --client=*) CLIENT="${1#*=}"; shift ;;
    --client) [[ $# -ge 2 ]] || err "--client requires a value"; CLIENT="$2"; shift 2 ;;
    --agy-bin=*) AGY_BIN="${1#*=}"; shift ;;
    --agy-bin) [[ $# -ge 2 ]] || err "--agy-bin requires a value"; AGY_BIN="$2"; shift 2 ;;
    --port=*) AGY_PORT="${1#*=}"; shift ;;
    --port) [[ $# -ge 2 ]] || err "--port requires a value"; AGY_PORT="$2"; shift 2 ;;
    --drop-stale-index) DROP_STALE_INDEX=true; shift ;;
    --clear-data) CLEAR_DATA=true; shift ;;
    --skip-connect) SKIP_CONNECT=true; shift ;;
    --skip-doctor) SKIP_DOCTOR=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unsupported argument: $1" ;;
  esac
done

case "$CLIENT" in
  all|antigravity|codex|claude-code) ;;
  *) err "--client must be one of: all, antigravity, codex, claude-code" ;;
esac

case "$AGY_PORT" in
  ''|*[!0-9]*) err "--port must be a number" ;;
esac
```

- [ ] **Step 3: Run syntax check**

Run:

```bash
rtk bash -n setup.sh
```

Expected: exit code 0 and no output.

## Task 2: Add Shared Utilities, Backup, And Env Patch

**Files:**
- Modify: `setup.sh`

- [ ] **Step 1: Add command and env helpers**

Add these helpers after argument parsing:

```bash
has_client() {
  [[ "$CLIENT" == "all" || "$CLIENT" == "$1" ]]
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || err "$1 not found"
}

upsert_env() {
  local key="$1" value="$2" file="$3"
  mkdir -p "$(dirname "$file")"
  if [[ -f "$file" ]] && grep -qE "^#?[[:space:]]*${key}[[:space:]]*=" "$file"; then
    sed -i '' "s|^#*[[:space:]]*${key}[[:space:]]*=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}
```

- [ ] **Step 2: Add backup and clear-data functions**

Add:

```bash
backup_data() {
  step "Backup AgentMemory data"
  local ts backup_dir copied=false
  ts="$(date -u +"%Y%m%dT%H%M%SZ")"
  backup_dir="${AGENTMEMORY_DIR}/backups/setup-${ts}"
  mkdir -p "$backup_dir"

  if [[ -f "$AGENTMEMORY_ENV" ]]; then cp "$AGENTMEMORY_ENV" "${backup_dir}/env"; copied=true; fi
  if [[ -f "${AGENTMEMORY_DIR}/standalone.json" ]]; then cp "${AGENTMEMORY_DIR}/standalone.json" "$backup_dir/"; copied=true; fi
  if [[ -d "${SCRIPT_DIR}/data" ]]; then cp -R "${SCRIPT_DIR}/data" "${backup_dir}/data"; copied=true; fi

  [[ "$copied" == "true" ]] && ok "Backup: ${backup_dir}" || { rmdir "$backup_dir" 2>/dev/null || true; warn "No AgentMemory data found to backup"; }
}

clear_data() {
  backup_data
  step "Clear AgentMemory runtime data"
  agentmemory stop --force >/dev/null 2>&1 || true
  if [[ -d "${SCRIPT_DIR}/data" ]]; then rm -rf "${SCRIPT_DIR}/data"; ok "Removed ${SCRIPT_DIR}/data"; fi
  for f in standalone.json engine-state.json server.log engine.log agy-proxy.log; do
    if [[ -e "${AGENTMEMORY_DIR}/${f}" ]]; then rm -f "${AGENTMEMORY_DIR}/${f}"; ok "Removed ${AGENTMEMORY_DIR}/${f}"; fi
  done
}
```

- [ ] **Step 3: Add AgentMemory env patch function**

Add:

```bash
patch_agentmemory_env() {
  step "Patch ~/.agentmemory/.env for agy-local"
  mkdir -p "$AGENTMEMORY_DIR" "$TRANSFORMERS_CACHE"

  upsert_env "AGENTMEMORY_URL" "http://localhost:3111" "$AGENTMEMORY_ENV"
  upsert_env "EMBEDDING_PROVIDER" "local" "$AGENTMEMORY_ENV"
  upsert_env "TRANSFORMERS_CACHE" "$TRANSFORMERS_CACHE" "$AGENTMEMORY_ENV"
  upsert_env "OPENAI_API_KEY" "dummy" "$AGENTMEMORY_ENV"
  upsert_env "OPENAI_MODEL" "agy-cli" "$AGENTMEMORY_ENV"
  upsert_env "OPENAI_BASE_URL" "http://127.0.0.1:${AGY_PORT}" "$AGENTMEMORY_ENV"
  upsert_env "OPENAI_API_KEY_FOR_LLM" "true" "$AGENTMEMORY_ENV"
  upsert_env "AGENTMEMORY_AUTO_COMPRESS" "true" "$AGENTMEMORY_ENV"
  upsert_env "CONSOLIDATION_ENABLED" "true" "$AGENTMEMORY_ENV"
  upsert_env "GRAPH_EXTRACTION_ENABLED" "true" "$AGENTMEMORY_ENV"
  upsert_env "AGENTMEMORY_INJECT_CONTEXT" "true" "$AGENTMEMORY_ENV"
  upsert_env "AGENTMEMORY_DROP_STALE_INDEX" "false" "$AGENTMEMORY_ENV"
  upsert_env "AGY_CLI_BIN" "$AGY_BIN" "$AGENTMEMORY_ENV"
  upsert_env "AGY_CLI_TIMEOUT_MS" "120000" "$AGENTMEMORY_ENV"
  upsert_env "AGY_CLI_SANDBOX" "false" "$AGENTMEMORY_ENV"
  upsert_env "AGY_PROXY_PORT" "$AGY_PORT" "$AGENTMEMORY_ENV"

  ok "Updated $AGENTMEMORY_ENV"
}
```

- [ ] **Step 4: Run syntax check**

Run:

```bash
rtk bash -n setup.sh
```

Expected: exit code 0 and no output.

## Task 3: Add Build And Agy Proxy Startup

**Files:**
- Modify: `setup.sh`

- [ ] **Step 1: Add build function**

Add:

```bash
build_proxy() {
  step "Build agy-proxy"
  cd "$SCRIPT_DIR"
  npm install
  npm run build
  ok "Built dist/cli.js"
}
```

- [ ] **Step 2: Add proxy health and startup function**

Add:

```bash
proxy_healthy() {
  curl -fsSL "http://127.0.0.1:${AGY_PORT}/health" >/dev/null 2>&1
}

start_agy_proxy() {
  step "Start agy OpenAI-compatible proxy"
  local log_file="${AGENTMEMORY_DIR}/agy-proxy.log"
  mkdir -p "$AGENTMEMORY_DIR"

  if proxy_healthy; then
    ok "agy proxy already healthy: http://127.0.0.1:${AGY_PORT}"
    return 0
  fi

  node - "$log_file" "$SCRIPT_DIR/dist/cli.js" "$AGY_PORT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const [logFile, cliPath, port] = process.argv.slice(2);
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const out = fs.openSync(logFile, 'a');
const child = spawn(process.execPath, [cliPath, 'agy-proxy', '--host', '127.0.0.1', '--port', port], {
  detached: true,
  stdio: ['ignore', out, out],
  env: process.env,
});
child.unref();
console.log(child.pid);
NODE

  for _ in {1..15}; do
    if proxy_healthy; then
      ok "agy proxy healthy: http://127.0.0.1:${AGY_PORT}"
      return 0
    fi
    sleep 1
  done

  err "agy proxy did not become healthy. Check ${log_file}"
}
```

- [ ] **Step 3: Run syntax and build checks**

Run:

```bash
rtk bash -n setup.sh
rtk npm run build
```

Expected: `bash -n` succeeds; `npm run build` prints `> tsc` and exits 0.

## Task 4: Add Antigravity MCP, Rule, And Skills Install

**Files:**
- Modify: `setup.sh`

- [ ] **Step 1: Add template path resolver and directory copy helper**

Add:

```bash
resolve_rule_source() {
  if [[ -f "${SCRIPT_DIR}/custom/instructions/AGENTMEMORY.md" ]]; then
    echo "${SCRIPT_DIR}/custom/instructions/AGENTMEMORY.md"
  else
    echo "${SCRIPT_DIR}/src/templates/instructions/AGENTMEMORY.md"
  fi
}

resolve_skills_source() {
  if [[ -d "${SCRIPT_DIR}/custom/skills" ]] && find "${SCRIPT_DIR}/custom/skills" -mindepth 1 -type d | grep -q .; then
    echo "${SCRIPT_DIR}/custom/skills"
  else
    echo "${SCRIPT_DIR}/src/templates/skills"
  fi
}

copy_dir_contents() {
  local src="$1" dest="$2"
  mkdir -p "$dest"
  cp -R "${src}/." "$dest/"
}
```

- [ ] **Step 2: Add Antigravity MCP installer**

Add:

```bash
install_antigravity_mcp() {
  step "Install Antigravity MCP config"
  local target="${HOME}/.gemini/antigravity/mcp_config.json"
  mkdir -p "$(dirname "$target")"
  node - "$target" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const target = process.argv[2];
let config = {};
try { config = JSON.parse(fs.readFileSync(target, 'utf8')); } catch {}
config.mcpServers = config.mcpServers && typeof config.mcpServers === 'object' ? config.mcpServers : {};
config.mcpServers.agentmemory = {
  command: 'npx',
  args: ['-y', '@agentmemory/mcp'],
  env: {
    AGENTMEMORY_URL: 'http://localhost:3111',
    EMBEDDING_PROVIDER: 'local',
  },
};
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
NODE
  ok "Updated $target"
}
```

- [ ] **Step 3: Add Antigravity rule installer**

Add:

```bash
install_antigravity_rule() {
  step "Install Antigravity AgentMemory rules"
  local source target
  source="$(resolve_rule_source)"
  target="${HOME}/.gemini/GEMINI.md"
  mkdir -p "$(dirname "$target")"
  node - "$source" "$target" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [source, target] = process.argv.slice(2);
const start = '<!-- AGENTMEMORY_RULES_START -->';
const end = '<!-- AGENTMEMORY_RULES_END -->';
const content = fs.readFileSync(source, 'utf8').trim();
const block = `${start}\n${content}\n${end}`;
let current = '';
try { current = fs.readFileSync(target, 'utf8'); } catch {}
const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`);
const next = current.includes(start) && current.includes(end)
  ? current.replace(re, block)
  : `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}\n`;
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, next);
NODE
  ok "Updated $target from $source"
}
```

- [ ] **Step 4: Add Antigravity skills installer**

Add:

```bash
install_antigravity_skills() {
  step "Install Antigravity AgentMemory skills"
  local source target
  source="$(resolve_skills_source)"
  target="${HOME}/.gemini/antigravity/skills"
  copy_dir_contents "$source" "$target"
  ok "Copied skills from $source to $target"
}

install_antigravity() {
  install_antigravity_mcp
  install_antigravity_rule
  install_antigravity_skills
}
```

- [ ] **Step 5: Run syntax check**

Run:

```bash
rtk bash -n setup.sh
```

Expected: exit code 0 and no output.

## Task 5: Add Upstream Codex And Claude Connect

**Files:**
- Modify: `setup.sh`

- [ ] **Step 1: Add command runner helpers**

Add:

```bash
run_optional() {
  local label="$1"; shift
  info "$label: $*"
  if "$@"; then
    ok "$label"
    return 0
  fi
  warn "$label failed"
  return 1
}

run_required() {
  local label="$1"; shift
  info "$label: $*"
  "$@" || err "$label failed: $*"
  ok "$label"
}
```

- [ ] **Step 2: Add Codex setup function**

Add:

```bash
install_codex() {
  step "Install Codex AgentMemory plugin and hooks"
  require_command codex
  run_optional "Codex marketplace add" codex plugin marketplace add rohitg00/agentmemory || true
  run_optional "Codex plugin install" codex plugin install agentmemory || true
  run_required "Codex upstream connect" agentmemory connect codex --with-hooks --force
}
```

- [ ] **Step 3: Add Claude Code setup function**

Add:

```bash
install_claude_code() {
  step "Install Claude Code AgentMemory plugin and hooks"
  require_command claude
  run_optional "Claude marketplace add" claude plugin marketplace add rohitg00/agentmemory || true
  if ! run_optional "Claude plugin install agentmemory@agentmemory" claude plugin install agentmemory@agentmemory; then
    run_optional "Claude plugin install agentmemory" claude plugin install agentmemory || true
  fi
  run_required "Claude Code upstream connect" agentmemory connect claude-code
}
```

- [ ] **Step 4: Add client dispatcher**

Add:

```bash
setup_clients() {
  if [[ "$SKIP_CONNECT" == "true" ]]; then
    warn "Skipping client setup because --skip-connect was provided"
    return 0
  fi

  has_client antigravity && install_antigravity
  has_client codex && install_codex
  has_client claude-code && install_claude_code
}
```

- [ ] **Step 5: Run syntax check**

Run:

```bash
rtk bash -n setup.sh
```

Expected: exit code 0 and no output.

## Task 6: Add AgentMemory Server Startup And Verification

**Files:**
- Modify: `setup.sh`

- [ ] **Step 1: Add AgentMemory health helpers**

Add:

```bash
agentmemory_healthy() {
  curl -fsSL "http://localhost:3111/agentmemory/health" >/dev/null 2>&1
}

start_agentmemory_server() {
  step "Start AgentMemory with upstream CLI"
  local log_file="${AGENTMEMORY_DIR}/server.log"
  mkdir -p "$AGENTMEMORY_DIR"

  if agentmemory_healthy; then
    ok "AgentMemory already healthy: http://localhost:3111"
    return 0
  fi

  local drop_value="false"
  [[ "$DROP_STALE_INDEX" == "true" ]] && drop_value="true"

  node - "$log_file" "$drop_value" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const [logFile, dropValue] = process.argv.slice(2);
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const out = fs.openSync(logFile, 'a');
const env = {
  ...process.env,
  AGENTMEMORY_DROP_STALE_INDEX: dropValue,
};
const child = spawn('agentmemory', [], {
  detached: true,
  stdio: ['ignore', out, out],
  env,
});
child.unref();
console.log(child.pid);
NODE

  for _ in {1..45}; do
    if agentmemory_healthy; then
      ok "AgentMemory healthy: http://localhost:3111"
      return 0
    fi
    sleep 1
  done

  if [[ -f "$log_file" ]] && grep -q "wrong dimension" "$log_file"; then
    err "AgentMemory has stale vector dimensions. Re-run: bash setup.sh --drop-stale-index"
  fi

  err "AgentMemory did not become healthy. Check ${log_file}"
}
```

- [ ] **Step 2: Add doctor and verification function**

Add:

```bash
run_doctor() {
  if [[ "$SKIP_DOCTOR" == "true" ]]; then
    warn "Skipping agentmemory doctor because --skip-doctor was provided"
    return 0
  fi
  step "Run upstream AgentMemory doctor"
  agentmemory doctor --all || warn "agentmemory doctor reported issues"
}

verify_setup() {
  step "Verify setup"
  proxy_healthy || err "agy proxy health check failed"
  agentmemory_healthy || err "AgentMemory health check failed"
  agentmemory status || warn "agentmemory status reported issues"

  if has_client antigravity && [[ "$SKIP_CONNECT" != "true" ]]; then
    [[ -f "${HOME}/.gemini/antigravity/mcp_config.json" ]] || err "Antigravity MCP config missing"
    [[ -f "${HOME}/.gemini/GEMINI.md" ]] || err "Antigravity GEMINI.md missing"
    [[ -d "${HOME}/.gemini/antigravity/skills" ]] || err "Antigravity skills missing"
  fi

  ok "Verification complete"
}
```

- [ ] **Step 3: Run syntax check**

Run:

```bash
rtk bash -n setup.sh
```

Expected: exit code 0 and no output.

## Task 7: Add Main Flow And Final Summary

**Files:**
- Modify: `setup.sh`

- [ ] **Step 1: Add prerequisites function**

Add:

```bash
check_prerequisites() {
  step "Check prerequisites"
  require_command node
  require_command npm
  require_command curl
  require_command agentmemory
  [[ -x "$AGY_BIN" ]] || err "agy binary not executable: $AGY_BIN"
  node -e "process.exit(Number.parseInt(process.versions.node.split('.')[0], 10) >= 20 ? 0 : 1)" || err "Node.js >= 20 required"
  ok "Prerequisites available"
}
```

- [ ] **Step 2: Add main function**

Add at the end of `setup.sh`:

```bash
main() {
  echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║      ag-agentmemory Setup Script     ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"

  check_prerequisites
  build_proxy
  agentmemory init || warn "agentmemory init skipped or reported existing config"
  [[ "$CLEAR_DATA" == "true" ]] && clear_data
  patch_agentmemory_env
  start_agy_proxy
  setup_clients
  start_agentmemory_server
  run_doctor
  verify_setup

  echo ""
  echo -e "${GREEN}${BOLD}✓ Setup complete.${NC}"
  echo -e "  Client       : ${CLIENT}"
  echo -e "  Env          : ${AGENTMEMORY_ENV}"
  echo -e "  Agy proxy    : http://127.0.0.1:${AGY_PORT}"
  echo -e "  AgentMemory  : http://localhost:3111"
  echo -e "  Viewer       : http://localhost:3113"
}

main "$@"
```

- [ ] **Step 3: Run syntax check**

Run:

```bash
rtk bash -n setup.sh
```

Expected: exit code 0 and no output.

## Task 8: Verification Pass

**Files:**
- Verify: `setup.sh`

- [ ] **Step 1: Verify help path**

Run:

```bash
rtk bash setup.sh --help
```

Expected output includes:

```text
Usage: bash setup.sh [options]
--client <all|antigravity|codex|claude-code>
--skip-connect
```

- [ ] **Step 2: Verify unsupported flags fail**

Run:

```bash
rtk bash setup.sh --not-a-real-flag
```

Expected: non-zero exit and output includes:

```text
Unsupported argument: --not-a-real-flag
```

- [ ] **Step 3: Verify build still passes**

Run:

```bash
rtk npm run build
```

Expected output includes:

```text
> tsc
```

- [ ] **Step 4: Verify script syntax**

Run:

```bash
rtk bash -n setup.sh
```

Expected: exit code 0 and no output.

- [ ] **Step 5: Optional live setup smoke test**

Only run when ready to mutate local AgentMemory/Codex/Claude/Antigravity config:

```bash
rtk bash setup.sh --client antigravity --skip-doctor
```

Expected:

```text
[OK]   agy proxy healthy
[OK]   AgentMemory healthy
[OK]   Verification complete
```

If AgentMemory reports stale vector dimensions, re-run:

```bash
rtk bash setup.sh --client antigravity --skip-doctor --drop-stale-index
```

Expected: AgentMemory health becomes OK without writing `AGENTMEMORY_DROP_STALE_INDEX=true` permanently into `~/.agentmemory/.env`.

## Self-Review

- Spec coverage: The plan covers full `setup.sh` replacement, agy proxy build/start, `.env` patching, three-client setup, upstream AgentMemory startup, stale-index handling, clear-data backup, custom overlay, and verification.
- Placeholder scan: No open-ended implementation placeholders are left in the plan.
- Scope check: The plan only modifies `setup.sh`; custom files already copied from upstream are left available for user editing.
- Commit policy: No commit steps are included because repo instructions explicitly skip commits unless requested.
