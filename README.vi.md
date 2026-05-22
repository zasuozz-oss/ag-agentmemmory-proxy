# ag-agentmemory

[English](README.md) | [Tiếng Việt](README.vi.md)

Lớp tự động hóa cho [AgentMemory](https://github.com/rohitg00/agentmemory) trên macOS — kết nối Antigravity CLI, Codex CLI và Claude Code với AgentMemory server cục bộ mà không cần API key.

LLM call được định tuyến qua `agy` CLI đã đăng nhập. Embeddings chạy cục bộ.

## Cách Hoạt Động

```
Claude Code / Codex / Antigravity
        │
        ▼
  AgentMemory Server (port 3111)
        │  openai provider → OPENAI_BASE_URL
        ▼
  agy-proxy  (port 3129, OpenAI-compatible)
        │  spawn mỗi request
        ▼
  agy-clean-wrapper.sh
        │  snapshot brain/ & conversations/ trước call
        │  xóa entries mới sau call (dùng lsof để an toàn khi có concurrent calls)
        ▼
  agy CLI  (~/.local/bin/agy)
```

`~/.agentmemory/.env` là nguồn cấu hình duy nhất:

```env
EMBEDDING_PROVIDER=local
BM25_WEIGHT=0.4
VECTOR_WEIGHT=0.6
AGENTMEMORY_URL=http://localhost:3111
AGENTMEMORY_AUTO_COMPRESS=true
CONSOLIDATION_ENABLED=true
GRAPH_EXTRACTION_ENABLED=true
AGENTMEMORY_DROP_STALE_INDEX=false
OPENAI_BASE_URL=http://127.0.0.1:3129
OPENAI_MODEL=agy-cli
```

## Cài Nhanh

```bash
bash setup.sh
```

Chỉ một client:

```bash
bash setup.sh --client antigravity
bash setup.sh --client codex
bash setup.sh --client claude
```

Bỏ qua sync upstream:

```bash
bash setup.sh --skip-upstream
```

## LaunchAgent — Tự Động Khởi Động

Đăng ký hai dịch vụ nền liên tục qua macOS LaunchAgents. Cả hai tự động restart khi crash.

```bash
bash set-run.sh
```

| Dịch vụ | Port | Log |
|---|---|---|
| `com.agentmemory.agy-proxy` | 3129 | `~/.agentmemory/agy-proxy.log` |
| `com.agentmemory.server` | 3111 / 3113 | `~/.agentmemory/server.log` |

Tất cả path trong `set-run.sh` được resolve động — không có hardcode username hay prefix.

```bash
# Kiểm tra trạng thái
launchctl list | grep agentmemory

# Xem log
tail -f ~/.agentmemory/agy-proxy.log
tail -f ~/.agentmemory/server.log
```

## agy-clean-wrapper.sh

Bọc mỗi lần gọi `agy` để ngăn tích lũy dữ liệu trong `~/.gemini/antigravity-cli/`:

- Snapshot `brain/` và `conversations/` trước call
- Chỉ xóa các entries được tạo trong call này sau khi hoàn thành
- Dùng `lsof` để tránh xóa nhầm entries của concurrent agy calls khác
- Xử lý `SIGTERM` / `SIGINT` qua `trap` — cleanup vẫn chạy kể cả khi proxy timeout

`AGY_REAL_BIN` override đường dẫn agy binary (mặc định: `~/.local/bin/agy`).

## Upstream Snapshot

Mỗi lần setup chạy, script clone hoặc pull upstream AgentMemory vào `.agentmemory-upstream/`, sau đó sync sang `agentmemory/` (không có git metadata). Nếu network lỗi nhưng `agentmemory/` đã tồn tại, setup tiếp tục với snapshot cũ.

## Clients

**Claude Code** — cài upstream plugin và connect AgentMemory hooks.

**Codex CLI** — ghi MCP fallback config vào `~/.codex/config.toml`, cài upstream plugin, chạy `agentmemory connect codex --with-hooks --force`.

**Antigravity** — không có upstream plugin; setup cấu hình thủ công:
- MCP config: `~/.gemini/antigravity/mcp_config.json`
- Instructions: `~/.gemini/GEMINI.md` (sentinel block ngăn ghi đè)
- Skills: `~/.gemini/antigravity/skills/`

## AgentMemory Server

```bash
# Health check
curl -fsSL http://localhost:3111/agentmemory/health

# Viewer UI
open http://localhost:3113
```

Trước khi restart, `setup.sh` backup runtime state vào `~/.agentmemory/backups/setup-<timestamp>/`.

## CLI

Sau khi `npm run build`:

```bash
node dist/cli.js setup --profile local --client all
node dist/cli.js setup --profile agy-local --agy-bin ~/.local/bin/agy
node dist/cli.js agy-proxy --host 127.0.0.1 --port 3129
node dist/cli.js verify
node dist/cli.js status
```

## Custom Overlay

Đặt file vào `custom/instructions/` hoặc `custom/skills/` để ghi đè bất kỳ template mặc định nào. Setup copy defaults trước rồi áp overlay của bạn lên. Chạy lại `setup.sh` sẽ áp dụng lại.

## Patches & Known Fixes

Các fix cục bộ áp dụng lên trên upstream — xem [`docs/`](docs/) để biết chi tiết.

| File | Vấn đề | Fix |
|---|---|---|
| `agentmemory/plugin/scripts/stop.mjs` | Thiếu `async: true` khiến Stop hook block 3+ phút, summarization fail im lặng trên Codex và Claude Code | Thêm `async: true` vào request body; giảm timeout xuống 5s |

Khi upstream ghi đè các file này, rebuild bằng `cd agentmemory && npm run build` — source (`src/hooks/stop.ts`) đã có logic đúng sẵn.

## Giới Hạn

- Yêu cầu `agy` CLI đã đăng nhập
- Mỗi LLM call spawn một tiến trình CLI mới — chậm hơn gọi API trực tiếp
- Embeddings chỉ chạy cục bộ
- Không fork hoặc patch source AgentMemory upstream
- Không cần API key
