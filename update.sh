#!/usr/bin/env bash
# update.sh — upgrade @agentmemory/agentmemory to the latest npm version,
# then restart the agentmemory LaunchAgent so the new binary takes effect.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}▶ $*${NC}"; }

FORCE_REINSTALL="false"
RESTART_DAEMON="true"
TARGET_VERSION="latest"

usage() {
  cat <<'USAGE'
Usage: bash update.sh [options]

  --version <ver>     Install a specific version (default: latest)
  --force              Reinstall even if already at the target version
  --no-restart         Do not restart the agentmemory LaunchAgent
  -h, --help           Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version=*) TARGET_VERSION="${1#*=}"; shift ;;
    --version) [[ $# -ge 2 ]] || err "--version requires a value"; TARGET_VERSION="$2"; shift 2 ;;
    --force) FORCE_REINSTALL="true"; shift ;;
    --no-restart) RESTART_DAEMON="false"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown argument: $1" ;;
  esac
done

command -v npm  >/dev/null 2>&1 || err "npm not found in PATH"
command -v node >/dev/null 2>&1 || err "node not found in PATH"

step "Resolve versions"
LATEST="$(npm view "@agentmemory/agentmemory@${TARGET_VERSION}" version 2>/dev/null || echo '')"
[[ -n "$LATEST" ]] || err "Unable to resolve @agentmemory/agentmemory@${TARGET_VERSION} from npm"

CURRENT="$(npm ls -g --depth=0 --json 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(j.dependencies?.['@agentmemory/agentmemory']?.version||'')}catch{}})" \
  || true)"

info "Installed : ${CURRENT:-<none>}"
info "Target    : ${LATEST}"

if [[ "$FORCE_REINSTALL" != "true" && "$CURRENT" == "$LATEST" ]]; then
  ok "@agentmemory/agentmemory already at ${LATEST} — nothing to do (use --force to reinstall)"
  exit 0
fi

step "Install @agentmemory/agentmemory@${LATEST}"
NPM_PREFIX="$(npm config get prefix 2>/dev/null || echo '')"
PKG_DIR="${NPM_PREFIX}/lib/node_modules/@agentmemory"

# This script NEVER runs sudo. Running npm with sudo leaves root-owned files in
# the global prefix that break every later non-sudo run (and poison ~/.claude,
# ~/.codex, etc.). If the prefix already has root-owned files from a past
# `sudo npm i`, fail with a one-time reclaim command for YOU to run — we refuse
# to deepen the mess by sudo-ing again.
if [[ -n "$NPM_PREFIX" && -e "$PKG_DIR" ]] \
   && find "$PKG_DIR" ! -user "$(id -un)" -print -quit 2>/dev/null | grep -q .; then
  err "${PKG_DIR} has root-owned files from an earlier 'sudo npm install'.
       Reclaim ownership ONCE, then re-run this script (no sudo needed after):
           sudo chown -R $(id -un):$(id -gn) \"${PKG_DIR}\""
fi

if ! npm install -g "@agentmemory/agentmemory@${LATEST}"; then
  err "npm install failed. If it was a permission (EACCES) error, your npm prefix
       (${NPM_PREFIX}) is not user-writable. Either reclaim it ONCE:
           sudo chown -R $(id -un):$(id -gn) \"${NPM_PREFIX}/lib/node_modules\" \"${NPM_PREFIX}/bin\"
       or point npm at a user-owned prefix:  npm config set prefix ~/.npm-global"
fi

ok "Installed @agentmemory/agentmemory@${LATEST}"

if [[ "$RESTART_DAEMON" != "true" ]]; then
  warn "--no-restart: skipping LaunchAgent restart"
  exit 0
fi

case "$(uname -s)" in
  Darwin)
    LABEL="com.agentmemory"
    PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
    if [[ -f "$PLIST" ]] && command -v launchctl >/dev/null 2>&1; then
      step "Restart LaunchAgent ${LABEL}"
      launchctl unload "$PLIST" 2>/dev/null || true
      pkill -f "node.*agentmemory" 2>/dev/null || true
      launchctl load "$PLIST"
      info "Waiting for agentmemory on :3111..."
      for _ in {1..15}; do
        if node -e "fetch('http://localhost:3111/agentmemory/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
          ok "agentmemory healthy after upgrade"
          exit 0
        fi
        sleep 1
      done
      warn "agentmemory did not respond within 15s — check ~/.ag-agentmemmory-proxy/agentmemory.log"
    else
      warn "LaunchAgent ${PLIST} not found — run setup.sh first if you want auto-start"
    fi
    ;;
  Linux|*)
    warn "Auto-restart only implemented for macOS LaunchAgent. Restart agentmemory manually."
    ;;
esac
