# Session Notes — 2026-05-25

## Vấn đề gốc

MCP `agentmemory` trả về `null` trên cả Claude Code và Codex trong khi dashboard
`http://localhost:3113` hiển thị data bình thường.

**Nguyên nhân xác nhận:** `AGENTMEMORY_URL` không được set trong môi trường shell.
Claude Code/Codex truyền empty string vào MCP plugin → MCP shim fallback sang
**standalone mode** (SQLite riêng, không liên quan daemon) → data khác dashboard.

---

## Những gì đã thay đổi

### `setup.sh`
- Thêm hàm `write_shell_env()` — ghi `AGENTMEMORY_URL=http://localhost:3111` vào:
  - `~/.agentmemory/.env`
  - `~/.zshrc` / `~/.bashrc` (nếu tồn tại), idempotent
- Thêm `AGENTMEMORY_URL` vào `EnvironmentVariables` của LaunchAgent plist
- Gọi `write_shell_env()` đầu tiên trong `main()`

### `README.md`
- Thêm **bước 1b** giải thích tại sao phải set `AGENTMEMORY_URL`
- Thêm **Troubleshooting section** với 3 tình huống:
  1. MCP null → standalone mode → fix: set env var
  2. Duplicate MCP warning → informational only, không cần xử lý
  3. Hooks not verified → chạy `claude --debug -p "x"` rồi `agentmemory doctor`

### Đã xoá để test lại từ đầu

| Thành phần | Đường dẫn |
|---|---|
| Claude Code plugin cache | `~/.claude/plugins/cache/agentmemory/` |
| Claude Code marketplace | `~/.claude/plugins/marketplaces/agentmemory/` |
| Claude Code settings | `enabledPlugins` + `extraKnownMarketplaces` trong `~/.claude/settings.json` |
| Claude Code registry | `agentmemory@agentmemory` trong `~/.claude/plugins/installed_plugins.json` |
| Codex plugin | `[plugins."agentmemory@agentmemory"]` trong `~/.codex/config.toml` |
| Codex marketplace | `[marketplaces.agentmemory]` trong `~/.codex/config.toml` |
| Codex 6 hooks | `[hooks.state."agentmemory@agentmemory:...]` (6 entries) |
| Codex MCP server | `[mcp_servers.agentmemory]` trong `~/.codex/config.toml` |
| iii-engine data | `~/data/state_store.db`, `~/data/stream_store/` |
| Runtime files | `~/.agentmemory/` logs, backups, engine-state, pid |

**Update:** `~/.agentmemory/` đã bị xoá hoàn toàn (kể cả `.env.save` và `preferences.json`).
Daemon sẽ tự tạo lại thư mục này khi khởi động lần đầu.

---

## Checklist trước khi restart

- [ ] Đảm bảo daemon đã stop: `agentmemory stop`
- [ ] LaunchAgent đã có `AGENTMEMORY_URL` trong plist (setup.sh tạo lại sau khi chạy)

---

## Thứ tự các bước sau khi restart

### Bước 1 — Set env var (quan trọng nhất, làm TRƯỚC mọi thứ)

```bash
echo 'export AGENTMEMORY_URL=http://localhost:3111' >> ~/.zshrc
source ~/.zshrc
echo $AGENTMEMORY_URL   # phải in ra: http://localhost:3111
```

### Bước 2 — Chạy setup.sh (build proxy + register LaunchAgent)

```bash
cd ~/AI-Tool/ag-agentmemory
bash setup.sh
```

Kết quả mong đợi:
- `write_shell_env` → "AGENTMEMORY_URL already set" (vì đã set ở bước 1)
- Build dist/cli.js thành công
- Proxy healthy tại `http://127.0.0.1:3129`
- LaunchAgent `com.agentmemory` registered
- agentmemory healthy tại `http://localhost:3111`

### Bước 3 — Init và verify daemon

`~/.agentmemory/` đã bị xoá hoàn toàn — daemon tự tạo lại khi start, nhưng cần init `.env`:

```bash
agentmemory init          # tạo lại ~/.agentmemory/.env từ template
agentmemory status
agentmemory doctor
```

Doctor phải pass ít nhất 2/10: Server reachable + Health status.
Các check khác (LLM key, hooks) sẽ fail cho đến khi cài plugin xong.

### Bước 4 — Cài plugin Claude Code

Chạy bên trong Claude Code:
```
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory
```

Restart Claude Code sau khi cài.

**Verify không còn duplicate warning:**
Sau khi restart, mở `/doctor` hoặc `/mcp` — không được có:
```
MCP server "agentmemory" skipped — same command/URL as already-configured
```
Nếu vẫn có: marketplace folder đang bị scan lại → kiểm tra xem `~/.claude/plugins/marketplaces/agentmemory/` có bị tạo lại không.

**Verify MCP tools hoạt động:**
Gọi tool `memory_sessions` hoặc `memory_recall` — phải trả về data từ daemon (không phải null).

### Bước 5 — Cài plugin Codex

```bash
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Mở Codex TUI (`codex`) và trust **tất cả 6 hooks** (Yes/Always):
- session_start
- user_prompt_submit
- pre_tool_use
- post_tool_use
- pre_compact
- stop

Verify:
```bash
grep "hooks.state.*agentmemory" ~/.codex/config.toml | wc -l
# phải trả về: 6
```

**Verify `AGENTMEMORY_URL` trong Codex MCP config:**
```bash
grep -A5 "mcp_servers.agentmemory" ~/.codex/config.toml
# phải có: AGENTMEMORY_URL = "http://localhost:3111"
```

Nếu Codex không tự thêm `AGENTMEMORY_URL` vào MCP env, thêm thủ công:
```toml
[mcp_servers.agentmemory.env]
AGENTMEMORY_URL = "http://localhost:3111"
```

### Bước 6 — Verify toàn hệ thống

```bash
agentmemory doctor
# Mục tiêu: ít nhất pass "Claude Code plugin hooks registered"
```

Dashboard: `http://localhost:3113`
- Sau vài interactions với Claude Code/Codex, sessions và observations phải tăng

---

## Điểm cần chú ý

1. **`AGENTMEMORY_URL` phải set TRƯỚC khi mở Claude Code/Codex** — nếu mở trước khi source `~/.zshrc`, plugin vẫn nhận empty string.

2. **LaunchAgent plist** tại `~/Library/LaunchAgents/com.agentmemory.plist` đã được update để include `AGENTMEMORY_URL` — file này chỉ được tạo khi chạy `bash setup.sh`.

3. **Daemon chạy ở noop mode** (không có LLM key) — observations vẫn được index bằng BM25, nhưng không có LLM summarization/compression. Đây là behavior bình thường, không phải lỗi.

4. **Data path:** iii-engine lưu data tại `~/data/` (không phải `~/.agentmemory/data/`). Nếu cần xoá data lại: `rm -rf ~/data/state_store.db ~/data/stream_store`.

5. **Duplicate plugin warning** nếu xuất hiện là informational — plugin từ cache được ưu tiên. Nhưng nếu warning này xuất hiện kèm MCP null thì cần kiểm tra lại marketplace folder có bị recreate không.
