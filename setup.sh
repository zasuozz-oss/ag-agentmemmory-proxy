#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${HOME}/.ag-agentmemmory-proxy"
PROXY_ENV="${CONFIG_DIR}/proxy.env"
AGY_BIN="${SCRIPT_DIR}/agy-clean-wrapper.sh"
AGY_HOST="127.0.0.1"
AGY_PORT="3129"
AGY_TIMEOUT_MS="120000"
AGY_SANDBOX="false"
SKIP_BUILD="false"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC} $*"; }
ok() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}==> $*${NC}"; }

usage() {
  cat <<'USAGE'
Usage: bash setup.sh [options]

Options:
  --agy-bin <path>       Path to agy wrapper or agy CLI binary
  --host <host>          Proxy host, default 127.0.0.1
  --port <number>        Proxy port, default 3129
  --timeout-ms <number>  agy CLI timeout, default 120000
  --sandbox              Pass --sandbox to agy CLI
  --skip-build           Do not run npm install/build
  -h, --help             Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agy-bin=*)
      AGY_BIN="${1#*=}"
      shift
      ;;
    --agy-bin)
      [[ $# -ge 2 ]] || err "--agy-bin requires a value"
      AGY_BIN="$2"
      shift 2
      ;;
    --host=*)
      AGY_HOST="${1#*=}"
      shift
      ;;
    --host)
      [[ $# -ge 2 ]] || err "--host requires a value"
      AGY_HOST="$2"
      shift 2
      ;;
    --port=*)
      AGY_PORT="${1#*=}"
      shift
      ;;
    --port)
      [[ $# -ge 2 ]] || err "--port requires a value"
      AGY_PORT="$2"
      shift 2
      ;;
    --timeout-ms=*)
      AGY_TIMEOUT_MS="${1#*=}"
      shift
      ;;
    --timeout-ms)
      [[ $# -ge 2 ]] || err "--timeout-ms requires a value"
      AGY_TIMEOUT_MS="$2"
      shift 2
      ;;
    --sandbox)
      AGY_SANDBOX="true"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      err "Unsupported argument: $1"
      ;;
  esac
done

case "$AGY_PORT" in
  ''|*[!0-9]*) err "--port must be a number" ;;
esac

case "$AGY_TIMEOUT_MS" in
  ''|*[!0-9]*) err "--timeout-ms must be a number" ;;
esac

require_command() {
  command -v "$1" >/dev/null 2>&1 || err "$1 not found"
}

write_proxy_env() {
  step "Write ag-agentmemmory-proxy proxy config"
  mkdir -p "$CONFIG_DIR"
  cat > "$PROXY_ENV" <<EOF
# Managed by ag-agentmemmory-proxy
AGY_PROXY_HOST=${AGY_HOST}
AGY_PROXY_PORT=${AGY_PORT}
AGY_CLI_BIN=${AGY_BIN}
AGY_CLI_TIMEOUT_MS=${AGY_TIMEOUT_MS}
AGY_CLI_SANDBOX=${AGY_SANDBOX}
EOF
  ok "Updated $PROXY_ENV"
}

build_proxy() {
  if [[ "$SKIP_BUILD" == "true" ]]; then
    warn "Skipping build"
    return 0
  fi

  step "Build agy proxy"
  cd "$SCRIPT_DIR"
  npm install
  npm run build
  ok "Built dist/cli.js"
}

proxy_healthy() {
  node -e "fetch('http://${AGY_HOST}:${AGY_PORT}/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
}

start_proxy() {
  step "Start agy OpenAI-compatible proxy"
  mkdir -p "$CONFIG_DIR"

  if proxy_healthy; then
    ok "Proxy already healthy: http://${AGY_HOST}:${AGY_PORT}"
    return 0
  fi

  export AGY_CLI_BIN="$AGY_BIN"
  export AGY_CLI_TIMEOUT_MS="$AGY_TIMEOUT_MS"
  export AGY_CLI_SANDBOX="$AGY_SANDBOX"

  local log_file="${CONFIG_DIR}/agy-proxy.log"
  local pid
  pid="$(node - "$log_file" "$SCRIPT_DIR/dist/cli.js" "$AGY_HOST" "$AGY_PORT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [logFile, cliPath, host, port] = process.argv.slice(2);
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const out = fs.openSync(logFile, 'a');
const child = spawn(process.execPath, [cliPath, 'agy-proxy', '--host', host, '--port', port], {
  detached: true,
  stdio: ['ignore', out, out],
  env: process.env,
});
child.unref();
console.log(child.pid);
NODE
)"
  info "Started proxy process ${pid}"

  for _ in {1..15}; do
    if proxy_healthy; then
      ok "Proxy healthy: http://${AGY_HOST}:${AGY_PORT}"
      return 0
    fi
    sleep 1
  done

  err "Proxy did not become healthy. Check ${log_file}"
}

main() {
  echo -e "${BOLD}ag-agentmemmory-proxy proxy setup${NC}"

  require_command node
  require_command npm
  [[ -x "$AGY_BIN" ]] || err "agy binary not executable: $AGY_BIN"

  build_proxy
  write_proxy_env
  start_proxy

  echo ""
  ok "Proxy setup complete"
  echo "  Config : ${PROXY_ENV}"
  echo "  Proxy  : http://${AGY_HOST}:${AGY_PORT}"
  echo "  Log    : ${CONFIG_DIR}/agy-proxy.log"
}

main "$@"
