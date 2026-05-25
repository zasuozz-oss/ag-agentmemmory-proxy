#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.ag-agentmemmory-proxy"
PROXY_ENV="$CONFIG_DIR/proxy.env"

AGY_PROXY_LABEL="com.ag-agentmemmory-proxy.agy-proxy"
AGY_PROXY_PLIST="$HOME/Library/LaunchAgents/${AGY_PROXY_LABEL}.plist"

NODE_BIN="$(command -v node 2>/dev/null || echo "/opt/homebrew/bin/node")"
AGY_PROXY_SCRIPT="${SCRIPT_DIR}/dist/cli.js"
WRAPPER="${SCRIPT_DIR}/agy-clean-wrapper.sh"
LOG_DIR="$CONFIG_DIR"
AGY_PROXY_LOG="$LOG_DIR/agy-proxy.log"

AGY_PROXY_HOST="127.0.0.1"
AGY_PROXY_PORT="3129"
AGY_CLI_BIN="$WRAPPER"
AGY_CLI_TIMEOUT_MS="120000"
AGY_CLI_SANDBOX="false"

if [[ -f "$PROXY_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$PROXY_ENV"
  set +a
fi

mkdir -p "$LOG_DIR"

write_agy_proxy_plist() {
  cat > "$AGY_PROXY_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${AGY_PROXY_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${AGY_PROXY_SCRIPT}</string>
    <string>agy-proxy</string>
    <string>--host</string>
    <string>${AGY_PROXY_HOST}</string>
    <string>--port</string>
    <string>${AGY_PROXY_PORT}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${HOME}/.local/bin</string>
    <key>AGY_CLI_BIN</key><string>${AGY_CLI_BIN}</string>
    <key>AGY_CLI_TIMEOUT_MS</key><string>${AGY_CLI_TIMEOUT_MS}</string>
    <key>AGY_CLI_SANDBOX</key><string>${AGY_CLI_SANDBOX}</string>
  </dict>
  <key>WorkingDirectory</key><string>${SCRIPT_DIR}</string>
  <key>StandardOutPath</key><string>${AGY_PROXY_LOG}</string>
  <key>StandardErrorPath</key><string>${AGY_PROXY_LOG}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
</dict>
</plist>
PLIST
  echo "  [ok] wrote $AGY_PROXY_PLIST"
}

stop_service() {
  local label="$1"
  if launchctl list | grep -q "$label" 2>/dev/null; then
    launchctl stop "$label" 2>/dev/null || true
    launchctl unload "$HOME/Library/LaunchAgents/${label}.plist" 2>/dev/null || true
    echo "  [ok] stopped $label"
  fi
}

start_service() {
  local plist="$1"
  local label="$2"
  launchctl load "$plist"
  launchctl start "$label"
  echo "  [ok] started $label"
}

wait_for_proxy() {
  local retries=30
  echo -n "  Waiting for agy-proxy"
  for _ in $(seq 1 "$retries"); do
    if node -e "fetch('http://${AGY_PROXY_HOST}:${AGY_PROXY_PORT}/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
      echo " ready"
      return 0
    fi
    echo -n "."
    sleep 1
  done
  echo " timeout; check $AGY_PROXY_LOG"
  return 1
}

[[ -f "$AGY_PROXY_SCRIPT" ]] || { echo "[ERROR] dist/cli.js not found; run 'npm run build' first"; exit 1; }
[[ -x "$AGY_CLI_BIN" ]] || { echo "[ERROR] agy binary not executable: $AGY_CLI_BIN"; exit 1; }

echo ""
echo "=== ag-agentmemmory-proxy proxy LaunchAgent ==="
echo "  SCRIPT_DIR : ${SCRIPT_DIR}"
echo "  NODE_BIN   : ${NODE_BIN}"
echo "  AGY_BIN    : ${AGY_CLI_BIN}"
echo "  PROXY      : http://${AGY_PROXY_HOST}:${AGY_PROXY_PORT}"
echo ""

echo "[1/3] Writing LaunchAgent plist..."
write_agy_proxy_plist

echo ""
echo "[2/3] Restarting proxy service..."
stop_service "$AGY_PROXY_LABEL"
sleep 1
start_service "$AGY_PROXY_PLIST" "$AGY_PROXY_LABEL"

echo ""
echo "[3/3] Verifying..."
wait_for_proxy

echo ""
echo "=== Done ==="
echo "  agy-proxy : http://${AGY_PROXY_HOST}:${AGY_PROXY_PORT}"
echo "  log       : $AGY_PROXY_LOG"
echo ""
