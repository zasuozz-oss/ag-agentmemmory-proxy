#!/usr/bin/env bash
#
# install-agy.sh — Pin the Antigravity CLI (agy) to a known-good version.
#
# Why this exists:
#   agy 1.0.3 print-mode (`agy -p`) cannot complete OAuth login and returns an
#   empty response, which breaks the agy proxy + agentmemory compression. agy
#   1.0.0 logs in correctly. Google's CLI self-updates in the background, so a
#   plain install gets silently bumped back to 1.0.3. This script:
#     1. Installs agy 1.0.0 straight onto the machine (Windows / macOS / Linux).
#     2. Vendors the installer into a local folder so re-installs keep working
#        even if Google deletes the build from its public bucket.
#   It no longer locks the self-updater (chflags/ACL/shell-rc) — agy is free to
#   auto-update; install_binary() still clears any lock left by older installs.
#
# Usage:
#   bash install-agy.sh [options]
#     --force            Reinstall even if agy 1.0.0 is already present.
#     --from-vendor      Offline only: install from the vendor cache, never hit
#                        the network (fails if the cache is empty/invalid).
#     --refresh-vendor   Force a fresh download into the vendor cache.
#     --dir <path>       Override the install directory (default per-OS).
#     --vendor-dir <p>   Override the vendor cache directory.
#     -h, --help         Show this help.
#
# Windows note: run under Git Bash / MSYS2 (same shell the rest of this repo
# uses). `setx`, `attrib`, `taskkill`, `cygpath` come from the Windows host.

set -euo pipefail

# ---------------------------------------------------------------------------
# Pinned release. agy 1.0.0, build 4606827523080192 — the exact build verified
# to log in correctly. Hashes are embedded so verification still works even if
# Google removes the per-build manifest.json from the bucket.
# ---------------------------------------------------------------------------
VERSION="1.0.0"
BUILD_ID="4606827523080192"
GCS_BASE="https://storage.googleapis.com/antigravity-public/antigravity-cli/${VERSION}-${BUILD_ID}"
# Self-hosted mirror of the pinned binaries (GitHub Release assets). Tried before
# the Google bucket so installs keep working even if Google pulls the build.
GH_RELEASE_BASE="https://github.com/zasuozz-oss/ag-agentmemmory-proxy/releases/download/agy-${VERSION}"

# platform-dir | asset filename | sha512
PLATFORM_TABLE="
windows-x64|cli_windows_x64.exe|2d545dcc3420fd639a548228ab8065e2a840258719d68b96a7369dda1a78403041e986602fd41ada5e60c272905d25d77032d105bd66fbbf9d15daef4e03637f
windows-arm|cli_windows_arm64.exe|12924a963e97617b3f4d14ccfb7c6588dc9839c4f4d3546545aeaa3d085deec19343b74c94cfe7f699e5b466e46fc162352fcf4958c63cc349459a2e63f713a8
darwin-x64|cli_mac_x64.tar.gz|f85ad1f9dba8d02d736e346f78a29c30ae4253dd8a60de123604b453e1ccf9eb0bba9b3a6fa2907c3fc4f91f1d8f7fb11e0660553b186a486fbe56b4573ac7f7
darwin-arm|cli_mac_arm64.tar.gz|15b98233e6089cc5231b19ccb4f6aedda30d5a04005080189a309c645f883b3fb0c3c69f7ad196b8d4d3d04d2d01a6ce888cdfc0c851d92d7276d51b704803a1
linux-x64|cli_linux_x64.tar.gz|d269bbcfe2a98204b50f30f27a8d85ee0e77b8746b4b6bd55c2cedb329cc8184b259eb52ae57a7d08b760351e2ac8a568dbb9d844832e6dcb2529726105fc8f2
linux-arm|cli_linux_arm64.tar.gz|0f36364021e7607acc47f6d148e71005f25761c43f29c728b165716cadf3788aa3a35d921f39efe7ce2859d77da1156ad69f3a613410585376d0dff1da903268
"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
FORCE=false
FROM_VENDOR=false
REFRESH_VENDOR=false
INSTALL_DIR_OVERRIDE=""
VENDOR_DIR_OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=true ;;
    --from-vendor) FROM_VENDOR=true ;;
    --refresh-vendor) REFRESH_VENDOR=true ;;
    --dir) INSTALL_DIR_OVERRIDE="${2:-}"; shift ;;
    --vendor-dir) VENDOR_DIR_OVERRIDE="${2:-}"; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

info() { printf '  \033[36m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '  \033[33m! %s\033[0m\n' "$*"; }
err()  { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Platform detection -> PLAT_DIR / ASSET / SHA512 / IS_TARGZ / OSKIND
# ---------------------------------------------------------------------------
detect_platform() {
  local s m os arch
  s="$(uname -s)"; m="$(uname -m)"
  case "$s" in
    MINGW*|MSYS*|CYGWIN*) os="windows"; OSKIND="windows" ;;
    Darwin) os="darwin"; OSKIND="unix" ;;
    Linux)  os="linux";  OSKIND="unix" ;;
    *) err "Unsupported OS: $s (need Windows/macOS/Linux)" ;;
  esac
  case "$m" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm" ;;
    *) err "Unsupported arch: $m" ;;
  esac
  PLAT_DIR="${os}-${arch}"

  local row
  row="$(printf '%s\n' "$PLATFORM_TABLE" | grep "^${PLAT_DIR}|" || true)"
  [ -n "$row" ] || err "No pinned asset for platform: $PLAT_DIR"
  ASSET="$(printf '%s' "$row" | cut -d'|' -f2)"
  SHA512="$(printf '%s' "$row" | cut -d'|' -f3)"
  case "$ASSET" in *.tar.gz) IS_TARGZ=true ;; *) IS_TARGZ=false ;; esac

  # Install destination (matches the official installers' conventions).
  if [ -n "$INSTALL_DIR_OVERRIDE" ]; then
    INSTALL_DIR="$INSTALL_DIR_OVERRIDE"
  elif [ "$OSKIND" = "windows" ]; then
    INSTALL_DIR="${LOCALAPPDATA:-$HOME/AppData/Local}/agy/bin"
  else
    INSTALL_DIR="$HOME/.local/bin"
  fi
  if [ "$OSKIND" = "windows" ]; then
    INSTALL_PATH="$INSTALL_DIR/agy.exe"
  else
    INSTALL_PATH="$INSTALL_DIR/agy"
  fi

  if [ -n "$VENDOR_DIR_OVERRIDE" ]; then
    VENDOR_DIR="$VENDOR_DIR_OVERRIDE"
  else
    VENDOR_DIR="$SCRIPT_DIR/vendor/agy/${VERSION}-${BUILD_ID}/${PLAT_DIR}"
  fi
  VENDOR_PAYLOAD="$VENDOR_DIR/$ASSET"
}

sha512_of() {
  if command -v sha512sum >/dev/null 2>&1; then sha512sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 512 "$1" | cut -d' ' -f1
  else err "Need sha512sum or shasum to verify the download"; fi
}

verify_sha() { # file -> 0 if matches SHA512
  [ -f "$1" ] || return 1
  [ "$(sha512_of "$1")" = "$SHA512" ]
}

download() { # url dst
  if command -v curl >/dev/null 2>&1; then curl -fSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$1"
  else err "Need curl or wget to download"; fi
}

# ---------------------------------------------------------------------------
# Acquire the payload into the vendor cache (Google-independent once cached).
# ---------------------------------------------------------------------------
acquire_payload() {
  mkdir -p "$VENDOR_DIR"

  if [ "$REFRESH_VENDOR" = false ] && verify_sha "$VENDOR_PAYLOAD"; then
    ok "Using vendored installer: $VENDOR_PAYLOAD"
    return 0
  fi

  if [ "$FROM_VENDOR" = true ]; then
    err "--from-vendor set but no valid cached payload at $VENDOR_PAYLOAD"
  fi

  # Try mirrors in order: our GitHub Release first (we control it), then the
  # original Google bucket. Verify the checksum after each; on mismatch, discard
  # and fall through to the next source.
  local src got=false
  for src in "$GH_RELEASE_BASE/$ASSET" "$GCS_BASE/$PLAT_DIR/$ASSET"; do
    info "Downloading $ASSET ($PLAT_DIR) from: $src"
    if download "$src" "$VENDOR_PAYLOAD" 2>/dev/null && verify_sha "$VENDOR_PAYLOAD"; then
      got=true; break
    fi
    warn "Source failed or checksum mismatch — trying next mirror"
    rm -f "$VENDOR_PAYLOAD" 2>/dev/null || true
  done
  [ "$got" = true ] \
    || err "All mirrors failed. If you have a cached copy elsewhere, drop it at: $VENDOR_PAYLOAD and re-run with --from-vendor"
  ok "Downloaded + checksum verified → vendored at $VENDOR_PAYLOAD"

  # Cache the manifest next to the payload for provenance.
  printf '{\n  "version": "%s",\n  "buildId": "%s",\n  "asset": "%s",\n  "sha512": "%s",\n  "url": "%s"\n}\n' \
    "$VERSION" "$BUILD_ID" "$ASSET" "$SHA512" "$GCS_BASE/$PLAT_DIR/$ASSET" > "$VENDOR_DIR/manifest.json"
}

# ---------------------------------------------------------------------------
# Stop any running agy (and the local proxy on :3129) so the binary isn't locked.
# ---------------------------------------------------------------------------
stop_running() {
  if [ "$OSKIND" = "windows" ]; then
    taskkill.exe //F //IM agy.exe >/dev/null 2>&1 || true
    local p
    p="$(netstat -ano 2>/dev/null | grep -i LISTENING | grep ':3129 ' | awk '{print $NF}' | head -1 || true)"
    [ -n "$p" ] && taskkill.exe //F //PID "$p" //T >/dev/null 2>&1 || true
  else
    pkill -f "bin/agy" >/dev/null 2>&1 || true
  fi
}

# ---------------------------------------------------------------------------
# Install the pinned binary to INSTALL_PATH.
# ---------------------------------------------------------------------------
install_binary() {
  mkdir -p "$INSTALL_DIR"
  stop_running
  sleep 1

  # Clear a previous lock so we can overwrite. No backup of the old binary is
  # kept — the vendor cache already holds the pinned installer.
  if [ "$OSKIND" = "windows" ]; then
    # Re-enable inheritance on the bin dir; this restores write/create/delete so
    # the copy below (and any prior ACL lock from lock_updater) doesn't block us.
    MSYS_NO_PATHCONV=1 icacls.exe "$(cygpath -w "$INSTALL_DIR")" /reset >/dev/null 2>&1 || true
    [ -f "$INSTALL_PATH" ] \
      && attrib.exe -R "$(cygpath -w "$INSTALL_PATH" 2>/dev/null || echo "$INSTALL_PATH")" >/dev/null 2>&1 || true
  elif [ -f "$INSTALL_PATH" ]; then
    # Clear the immutable flag set by lock_updater (uchg blocks unlink/rename/write),
    # then restore owner-write so the cp below can overwrite the pinned binary.
    chflags nouchg "$INSTALL_PATH" 2>/dev/null || true
    chmod u+w "$INSTALL_PATH" 2>/dev/null || true
  fi

  if [ "$IS_TARGZ" = true ]; then
    local tmp; tmp="$(mktemp -d)"
    # The tarball contains a single binary named "antigravity".
    tar -xzf "$VENDOR_PAYLOAD" -C "$tmp" antigravity 2>/dev/null \
      || tar -xzf "$VENDOR_PAYLOAD" -C "$tmp" 2>/dev/null \
      || err "Failed to extract $VENDOR_PAYLOAD"
    local inner
    inner="$tmp/antigravity"; [ -f "$inner" ] || inner="$(find "$tmp" -maxdepth 2 -type f | head -1)"
    cp "$inner" "$INSTALL_PATH" || err "Failed to write $INSTALL_PATH"
    rm -rf "$tmp"
  else
    cp "$VENDOR_PAYLOAD" "$INSTALL_PATH" || err "Failed to write $INSTALL_PATH"
  fi

  [ "$OSKIND" = "windows" ] || chmod +x "$INSTALL_PATH"
  # Drop the self-updater's leftover backups (agy.exe.<id>.old, ~137M each).
  rm -f "$INSTALL_DIR"/agy.exe.*.old "$INSTALL_DIR"/agy.*.old 2>/dev/null || true
  ok "Installed agy $VERSION → $INSTALL_PATH"
}

# ---------------------------------------------------------------------------
# Verify the freshly-installed binary reports VERSION.
# ---------------------------------------------------------------------------
installed_version() {
  [ -x "$INSTALL_PATH" ] || { [ -f "$INSTALL_PATH" ] || return 1; }
  if command -v node >/dev/null 2>&1; then
    # Bounded run: agy --version is fast, but guard against any hang.
    node -e '
      const {spawn}=require("child_process");
      const c=spawn(process.argv[1],["--version"],{stdio:["ignore","pipe","ignore"]});
      let o="";c.stdout.on("data",d=>o+=d);
      const t=setTimeout(()=>{c.kill();process.exit(2)},15000);
      c.on("close",()=>{clearTimeout(t);process.stdout.write(o.trim())});
      c.on("error",()=>{clearTimeout(t);process.exit(3)});
    ' "$INSTALL_PATH" 2>/dev/null || true
  else
    "$INSTALL_PATH" --version 2>/dev/null | tr -d '[:space:]' || true
  fi
}

# ===========================================================================
main() {
  printf '\n\033[1mPin agy %s (build %s)\033[0m\n' "$VERSION" "$BUILD_ID"
  detect_platform
  info "Platform : $PLAT_DIR"
  info "Install  : $INSTALL_PATH"
  info "Vendor   : $VENDOR_DIR"

  acquire_payload

  local cur
  cur="$(installed_version)"
  if [ "$cur" = "$VERSION" ] && [ "$FORCE" = false ]; then
    ok "agy $VERSION already installed — skipping copy (use --force to reinstall)"
  else
    install_binary
  fi

  cur="$(installed_version)"
  if [ "$cur" = "$VERSION" ]; then
    ok "Verified: agy reports $cur"
  else
    warn "Version check returned '${cur:-<none>}' (expected $VERSION) — continuing"
  fi

  printf '\n\033[1mDone.\033[0m One manual step remains — log in once (interactive, needs a browser):\n'
  printf '    "%s" -i "test"\n' "$INSTALL_PATH"
  printf 'Then verify print mode returns text (not empty):\n'
  printf '    "%s" -p "Reply with exactly: OK"\n\n' "$INSTALL_PATH"
}

main "$@"
