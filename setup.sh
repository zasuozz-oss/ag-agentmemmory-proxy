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
  upsert_env "AGENTMEMORY_DROP_STALE_INDEX" "$DROP_STALE_INDEX" "$AGENTMEMORY_ENV"
  # Ghi wrapper path thay vì raw binary — wrapper bao gồm cleanup logic
  local wrapper="${SCRIPT_DIR}/agy-clean-wrapper.sh"
  upsert_env "AGY_CLI_BIN" "$wrapper" "$AGENTMEMORY_ENV"
  upsert_env "AGY_CLI_TIMEOUT_MS" "120000" "$AGENTMEMORY_ENV"
  upsert_env "AGY_CLI_SANDBOX" "false" "$AGENTMEMORY_ENV"
  upsert_env "AGY_PROXY_PORT" "$AGY_PORT" "$AGENTMEMORY_ENV"

  ok "Updated $AGENTMEMORY_ENV"
}

build_proxy() {
  step "Build agy-proxy"
  cd "$SCRIPT_DIR"
  npm install
  npm run build
  ok "Built dist/cli.js"
}

proxy_healthy() {
  curl -fsSL "http://127.0.0.1:${AGY_PORT}/health" >/dev/null 2>&1
}

start_agy_proxy() {
  step "Start agy OpenAI-compatible proxy"
  local log_file="${AGENTMEMORY_DIR}/agy-proxy.log"
  mkdir -p "$AGENTMEMORY_DIR"

  # Export wrapper vào shell env để proxy child process kế thừa qua process.env
  export AGY_CLI_BIN="${SCRIPT_DIR}/agy-clean-wrapper.sh"

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

install_codex() {
  step "Install Codex AgentMemory plugin and hooks"
  require_command codex
  run_optional "Codex marketplace add" codex plugin marketplace add rohitg00/agentmemory || true
  if codex plugin add --help >/dev/null 2>&1; then
    run_optional "Codex plugin add" codex plugin add agentmemory --marketplace agentmemory || true
  elif codex plugin install --help >/dev/null 2>&1; then
    run_optional "Codex plugin install" codex plugin install agentmemory || true
  else
    info "Codex plugin install command is not available; using upstream MCP connect"
  fi
  run_required "Codex upstream connect" agentmemory connect codex --with-hooks --force
}

install_claude_code() {
  step "Install Claude Code AgentMemory plugin and hooks"
  require_command claude
  run_optional "Claude marketplace add" claude plugin marketplace add rohitg00/agentmemory || true
  if ! run_optional "Claude plugin install agentmemory@agentmemory" claude plugin install agentmemory@agentmemory; then
    run_optional "Claude plugin install agentmemory" claude plugin install agentmemory || true
  fi
  run_required "Claude Code upstream connect" agentmemory connect claude-code
}

setup_clients() {
  if [[ "$SKIP_CONNECT" == "true" ]]; then
    warn "Skipping client setup because --skip-connect was provided"
    return 0
  fi

  if has_client antigravity; then install_antigravity; fi
  if has_client codex; then install_codex; fi
  if has_client claude-code; then install_claude_code; fi
}

agentmemory_healthy() {
  curl -fsSL "http://localhost:3111/agentmemory/health" >/dev/null 2>&1
}

stop_stale_agentmemory_workers() {
  local log_file="${AGENTMEMORY_DIR}/server.log"
  mkdir -p "$AGENTMEMORY_DIR"

  node - "$log_file" <<'NODE' || true
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const logFile = process.argv[2];
const currentPid = process.pid;
const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
if (ps.status !== 0) {
  process.exit(0);
}

const targets = [];
for (const line of ps.stdout.split('\n')) {
  const match = line.match(/^\s*(\d+)\s+(.+)$/);
  if (!match) continue;
  const pid = Number(match[1]);
  const command = match[2];
  if (!Number.isFinite(pid) || pid === currentPid) continue;
  const isAgentmemoryCli = /\bnode\s+.*\/bin\/agentmemory(?:\s|$)/.test(command);
  const isLegacyWorker = /\bnode\s+.*\/@agentmemory\/agentmemory\/dist\/index\.mjs(?:\s|$)/.test(command);
  if (isAgentmemoryCli || isLegacyWorker) {
    targets.push({ pid, command });
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

for (const target of targets) {
  try {
    fs.appendFileSync(logFile, `[setup] stopping stale AgentMemory worker pid=${target.pid} command=${target.command}\n`);
    process.kill(target.pid, 'SIGTERM');
  } catch {}
}

const deadline = Date.now() + 3000;
while (Date.now() < deadline && targets.some((target) => alive(target.pid))) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
}

for (const target of targets) {
  if (!alive(target.pid)) continue;
  try {
    fs.appendFileSync(logFile, `[setup] killing stale AgentMemory worker pid=${target.pid}\n`);
    process.kill(target.pid, 'SIGKILL');
  } catch {}
}
NODE
}

resolve_xenova_transformers_main() {
  local global_root transformers_main
  global_root="$(npm root -g 2>/dev/null || true)"
  transformers_main="${global_root}/@agentmemory/agentmemory/node_modules/@xenova/transformers/src/transformers.js"
  [[ -f "$transformers_main" ]] || return 1
  echo "$transformers_main"
}

install_xenova_cache_preload() {
  local transformers_main preload
  transformers_main="$(resolve_xenova_transformers_main)" || return 1
  preload="${AGENTMEMORY_DIR}/xenova-cache.mjs"
  mkdir -p "$AGENTMEMORY_DIR" "$TRANSFORMERS_CACHE"

  node - "$preload" "$transformers_main" <<'NODE'
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const [preload, transformersMain] = process.argv.slice(2);
const transformersUrl = pathToFileURL(transformersMain).href;
const content = `const cacheDir = process.env.TRANSFORMERS_CACHE || process.env.HOME + '/.cache/xenova-transformers';
const transformers = await import(${JSON.stringify(transformersUrl)});
if (transformers.env) {
  transformers.env.cacheDir = cacheDir;
  transformers.env.useBrowserCache = false;
  transformers.env.useFSCache = true;
}
`;
fs.writeFileSync(preload, content);
NODE

  echo "$preload"
}

disable_legacy_launchagent() {
  local plist="${HOME}/Library/LaunchAgents/com.agentmemory.server.plist"
  [[ -f "$plist" ]] || return 0
  grep -q "@agentmemory/agentmemory/dist/index.mjs" "$plist" || return 0

  step "Disable legacy AgentMemory LaunchAgent"
  local uid backup
  uid="$(id -u)"
  if command -v launchctl >/dev/null 2>&1; then
    launchctl bootout "gui/${uid}" "$plist" >/dev/null 2>&1 || true
  fi
  backup="${plist}.disabled-$(date -u +"%Y%m%dT%H%M%SZ")"
  mv "$plist" "$backup"
  ok "Moved legacy LaunchAgent to ${backup}"
}

start_agentmemory_server() {
  step "Start AgentMemory with upstream CLI"
  local log_file="${AGENTMEMORY_DIR}/server.log"
  mkdir -p "$AGENTMEMORY_DIR"

  disable_legacy_launchagent

  if agentmemory_healthy; then
    ok "AgentMemory already healthy: http://localhost:3111"
    return 0
  fi

  info "Stopping stale AgentMemory runtime with upstream CLI"
  agentmemory stop --force >/dev/null 2>&1 || true
  stop_stale_agentmemory_workers
  sleep 1

  local drop_value="false"
  [[ "$DROP_STALE_INDEX" == "true" ]] && drop_value="true"

  local xenova_preload=""
  if xenova_preload="$(install_xenova_cache_preload)"; then
    info "Using Xenova cache directory: ${TRANSFORMERS_CACHE}"
  else
    warn "Could not install Xenova cache preload; local embeddings may use the package cache"
  fi

  node - "$log_file" "$drop_value" "$TRANSFORMERS_CACHE" "${SCRIPT_DIR}/agy-clean-wrapper.sh" "$AGY_PORT" "$xenova_preload" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const [logFile, dropValue, transformersCache, agyBin, agyPort, xenovaPreload] = process.argv.slice(2);
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const out = fs.openSync(logFile, 'a');
const nodeOptions = [];
if (process.env.NODE_OPTIONS) nodeOptions.push(process.env.NODE_OPTIONS);
if (xenovaPreload) nodeOptions.push(`--import=${pathToFileURL(xenovaPreload).href}`);
const env = {
  ...process.env,
  AGENTMEMORY_DROP_STALE_INDEX: dropValue,
  TRANSFORMERS_CACHE: transformersCache,
  AGY_CLI_BIN: agyBin,
  AGY_PROXY_PORT: agyPort,
  OPENAI_BASE_URL: `http://127.0.0.1:${agyPort}`,
};
if (nodeOptions.length > 0) {
  env.NODE_OPTIONS = nodeOptions.join(' ');
}
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
      sleep 3
      agentmemory_healthy || break
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

check_prerequisites() {
  step "Check prerequisites"
  require_command node
  require_command npm
  require_command curl
  require_command agentmemory
  [[ -x "$AGY_BIN" ]] || err "agy binary not executable: $AGY_BIN"
  [[ -x "${SCRIPT_DIR}/agy-clean-wrapper.sh" ]] || err "agy wrapper not found or not executable: ${SCRIPT_DIR}/agy-clean-wrapper.sh"
  node -e "process.exit(Number.parseInt(process.versions.node.split('.')[0], 10) >= 20 ? 0 : 1)" || err "Node.js >= 20 required"
  ok "Prerequisites available"
}

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
