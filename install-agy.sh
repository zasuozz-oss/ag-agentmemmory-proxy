#!/usr/bin/env bash
#
# install-agy.sh — make sure the Antigravity CLI (agy) is present, unlocked, and
# on the latest build. It pins NOTHING.
#
# Why no pin anymore:
#   An older agy was pinned to one build and its self-updater was locked. The
#   server later rejected that build, which surfaced as an endless re-login
#   prompt (and broke the agy proxy + agentmemory compression). The fix was to
#   let agy auto-update again. So this script no longer downloads or pins a
#   specific version — agy self-updates in the background to the latest
#   server-supported build on its own. This script just:
#     1. Finds agy (or tells you how to install it by hand if it's missing).
#     2. Clears any immutable/ACL lock left by older pinned installs.
#     3. Reports the version and reminds you to log in + verify print mode.
#
# Usage:
#   bash install-agy.sh [--dir <path>]
#     --dir <path>   Where agy lives (default: $HOME/.local/bin, or
#                    %LOCALAPPDATA%\agy\bin on Windows). Falls back to PATH.
#     -h, --help     Show this help.
#
# Windows note: run under Git Bash / MSYS2.

set -euo pipefail

INSTALL_DIR_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) INSTALL_DIR_OVERRIDE="${2:-}"; shift ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (run with --help)" >&2; exit 1 ;;
  esac
  shift
done

info() { printf '  \033[36m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '  \033[33m! %s\033[0m\n' "$*"; }
err()  { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) OSKIND="windows" ;;
  Darwin|Linux) OSKIND="unix" ;;
  *) err "Unsupported OS: $(uname -s)" ;;
esac

# Where agy is / should be.
if [ -n "$INSTALL_DIR_OVERRIDE" ]; then
  INSTALL_DIR="$INSTALL_DIR_OVERRIDE"
elif [ "$OSKIND" = "windows" ]; then
  INSTALL_DIR="${LOCALAPPDATA:-$HOME/AppData/Local}/agy/bin"
else
  INSTALL_DIR="$HOME/.local/bin"
fi
if [ "$OSKIND" = "windows" ]; then AGY_BIN="$INSTALL_DIR/agy.exe"; else AGY_BIN="$INSTALL_DIR/agy"; fi
# Fall back to PATH if not at the conventional location.
if [ ! -x "$AGY_BIN" ] && command -v agy >/dev/null 2>&1; then
  AGY_BIN="$(command -v agy)"
fi

# Clear any immutable/ACL lock left by older pinned installs so agy can update
# itself and so login works.
unlock() {
  [ -e "$AGY_BIN" ] || return 0
  if [ "$OSKIND" = "windows" ]; then
    attrib.exe -R "$(cygpath -w "$AGY_BIN" 2>/dev/null || echo "$AGY_BIN")" >/dev/null 2>&1 || true
  else
    chflags nouchg "$AGY_BIN" 2>/dev/null || true   # macOS immutable flag
    chmod u+w "$AGY_BIN" 2>/dev/null || true
  fi
}

# Bounded `agy --version` (print mode can hang if not logged in; --version can't,
# but stay defensive).
agy_version() {
  if command -v node >/dev/null 2>&1; then
    node -e '
      const {spawn}=require("child_process");
      const c=spawn(process.argv[1],["--version"],{stdio:["ignore","pipe","ignore"]});
      let o=""; c.stdout.on("data",d=>o+=d);
      const t=setTimeout(()=>{try{c.kill()}catch{};process.exit(0)},15000);
      c.on("close",()=>{clearTimeout(t);process.stdout.write(o.trim())});
      c.on("error",()=>{clearTimeout(t);process.exit(0)});
    ' "$AGY_BIN" 2>/dev/null || true
  else
    "$AGY_BIN" --version 2>/dev/null | head -1 | tr -d '[:space:]' || true
  fi
}

main() {
  printf '\n\033[1mEnsure agy (latest, self-updating)\033[0m\n'

  if [ ! -x "$AGY_BIN" ]; then
    warn "agy not found (looked in $INSTALL_DIR and PATH)."
    cat <<EOF

  Install the Antigravity CLI by hand, then re-run this script:
    • Get it from the official Antigravity app/website (it ships the 'agy' CLI).
    • Put 'agy' on your PATH — e.g. $INSTALL_DIR — or run: agy install
    • Log in once (opens OAuth in the browser):   agy -i "hello"

  agy keeps itself up to date automatically — there is no version to pin.
EOF
    err "agy is required; install it manually (see above)."
  fi

  info "Found agy: $AGY_BIN"
  unlock
  ok "Cleared any leftover update-lock"

  v="$(agy_version)"
  info "Version: ${v:-<unknown>}  (agy auto-updates to the latest supported build)"

  printf '\n\033[1mDone.\033[0m If needed:\n'
  printf '    • Force latest now:   "%s" update\n' "$AGY_BIN"
  printf '    • Log in:             "%s" -i "hello"\n' "$AGY_BIN"
  printf '    • Verify print mode:  "%s" -p "Reply with exactly: OK"   (must return text, not empty)\n\n' "$AGY_BIN"
}

main "$@"
