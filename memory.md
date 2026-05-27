# AgentMemory — Session Memo (pre-reset)

Ghi lại các thay đổi đã làm trong phiên 2026-05-27 và checklist cần verify sau khi reset máy.

## Tóm tắt vấn đề đã gặp

1. **MCP `agentmemory` báo `✗ Failed to connect`** trong `claude mcp list` và Codex.
   - Root cause: lệnh `npx -y @agentmemory/mcp` thất bại trên npm 11.9.0 + node 25 vì transitive dep `onnx-proto@4.0.4 → protobufjs@6.11.6` ném `TypeError: Invalid Version: ""` (xem `~/.npm/_logs/2026-05-27T02_04_02_866Z-debug-0.log:213-215`).
   - Fix: trỏ MCP config thẳng vào binary global `@agentmemory/agentmemory@0.9.21` (đã cài qua npm -g) — `agentmemory mcp` (alias của shim).

2. **Sessions hiển thị 10 active dù chỉ có 1 phiên đang chạy.**
   - Root cause: setup chỉ đăng ký 6 hooks (SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/PreCompact/Stop). **Thiếu hook `SessionEnd`** — đây là hook duy nhất gọi `POST /agentmemory/session/end` (xem `dist/hooks/session-end.mjs:31`). `Stop` hook chỉ gọi `/agentmemory/summarize`, không đổi status. Hậu quả: mọi phiên đều treo `status: active`.

3. **76 sessions cùng timestamp 9:03:59 AM.**
   - Root cause: kết quả của 1 lần chạy `agentmemory import-jsonl ~/.claude/projects` (tag `jsonl-import`). Parser ở `dist/src-D5arboxc.mjs:13076-13083` fallback `startedAt: firstTs || nowIso` khi entry đầu của file JSONL không có `.timestamp` (vd `custom-title`, `ai-title`) → toàn bộ ăn thời điểm import.
   - Đây là bug upstream của parser, không patch được nếu không sửa package.

## Thay đổi đã commit / sẵn sàng commit

### Files đã sửa

| File | Nội dung sửa |
|------|-------------|
| `~/.claude.json:559-568` | MCP `agentmemory.command` đổi `npx` → `/opt/homebrew/bin/agentmemory`, `args` = `["mcp"]` |
| `~/.codex/config.toml:9-11` | Tương tự cho Codex |
| `~/.claude/settings.json:121` | Thêm hook block `SessionEnd` → `plugin/scripts/session-end.mjs` |
| `/Users/zasuo/AI-Tool/ag-agentmemory/setup.sh` | (1) Sanitizer Claude rewrite `npx @agentmemory/mcp` → binary global; (2) Sanitizer Codex tương tự cho TOML; (3) Antigravity `upsert_json_mcp` dùng binary; (4) Hook config thêm `SessionEnd: session-end` |

### Sessions cleanup đã chạy

- Đã đóng 10 orphan active sessions qua `POST /agentmemory/session/end`. Counter cuối: `completed: 76, active: 0` (trước khi wipe).

### DB đã wipe trước reset

```
rm -rf ~/data                  # state_store.db + stream_store (~12MB)
rm -rf ~/.agentmemory/backups
```

Đã `agentmemory stop --force` và `kill` viewer (port 3113) trước khi xoá. Ports 3111/3112/3113 đều free.

**Còn lại** (cần xoá thêm nếu muốn sạch tuyệt đối, hoặc giữ lại config):
- `~/.agentmemory/.env` (config providers — KHÔNG có secret)
- `~/.agentmemory/preferences.json` (firstRunAt, splash skip)
- `~/.agentmemory/standalone.json` (`{}`)

## Checklist verify sau khi reset máy

### Cài lại

```bash
npm i -g @agentmemory/agentmemory       # cung cấp binary `agentmemory`
cd /Users/zasuo/AI-Tool/ag-agentmemory
bash setup.sh                            # wire Claude / Codex / Antigravity + start agy proxy
```

### Smoke test bắt buộc

1. **MCP connect** (cả 2 client):
   ```bash
   claude mcp list | grep agentmemory      # phải: ✓ Connected
   ```
   Codex: mở TUI, accept trust 6 hooks, kiểm tra status panel.

2. **Hooks đầy đủ** — `~/.claude/settings.json` phải có 7 hook events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop, **SessionEnd**.

3. **Engine + ports**:
   ```bash
   agentmemory status                      # health ok, Sessions 0, Observations 0
   lsof -iTCP -sTCP:LISTEN -P | grep -E '3111|3112|3113|3129'
   # 3111: iii REST · 3112: iii stream · 3113: viewer · 3129: agy proxy
   ```

4. **Session lifecycle** — quan trọng để verify fix #2:
   - Mở phiên Claude Code mới, làm vài thao tác, đóng client.
   - `curl http://localhost:3111/agentmemory/replay/sessions | jq '.sessions[]|{id,status}' | head`
   - **Yêu cầu**: phiên vừa đóng phải `status: completed` (không còn active sau khi đóng client).

5. **Observation persistence** — verify fix #1 thật sự bypass npx:
   - Sau khi làm việc 1 lúc trong phiên mới: `agentmemory status` → `Observations > 0`, `Memories > 0`, `Graph: N nodes`.
   - Nếu vẫn 0 sau ≥10 prompt + tool calls → kiểm tra log: `agentmemory --verbose` và `agentmemory doctor --all`.

6. **KHÔNG chạy `agentmemory import-jsonl`** trừ khi thực sự muốn (sẽ tạo lại 76 sessions cùng timestamp do bug parser).

### Nếu fail

- MCP fail: kiểm tra `which agentmemory` đúng path đã cấu hình trong `.claude.json` / `config.toml`. Nếu khác (do brew vs npm), update path tương ứng.
- Session vẫn `active` sau khi đóng: check `~/.claude/settings.json` có block `SessionEnd` không. Nếu mất → chạy lại `bash setup.sh --force`.
- npx vẫn được dùng (nghĩa là setup không sanitize được): kiểm tra `grep "command" ~/.claude.json` quanh khối `agentmemory`.
