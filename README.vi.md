# ag-agentmemory

[English](README.md) · [Tiếng Việt](README.vi.md)

> Trình cài đặt production wire [AgentMemory](https://github.com/rohitg00/agentmemory) vào **Claude Code**, **Codex CLI** và **Antigravity**, đồng thời chạy một **proxy local tương thích OpenAI** dùng `agy` CLI đã đăng nhập làm backend — AgentMemory hoạt động trên cả 3 agent mà **không cần API key**.

---

## Mục lục

- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Kiểm tra](#kiểm-tra)
- [Troubleshooting](#troubleshooting)
- [Gỡ cài đặt](#gỡ-cài-đặt)
- [Tổng quan](#tổng-quan)
- [Kiến trúc](#kiến-trúc)
- [Cài đặt gồm những gì](#cài-đặt-gồm-những-gì)
- [Cấu trúc dự án](#cấu-trúc-dự-án)

---

## Quick Start

```bash
# 1. Cài AgentMemory CLI (chạy 1 lần, cần sudo)
sudo npm install -g @agentmemory/agentmemory

# 2. Chạy installer (không cần sudo)
bash setup.sh
```

Sau đó restart Claude Code, Codex, Antigravity và mở terminal mới.

> Lần đầu mở Codex TUI: accept đủ 6 hook agentmemory khi được hỏi.

---

## CLI Reference

```bash
bash setup.sh [options]
```

**Client wiring**

| Flag                                              | Mặc định | Mô tả                            |
| ------------------------------------------------- | -------- | -------------------------------- |
| `--client <all\|claude-code\|codex\|antigravity>` | `all`    | Giới hạn cài cho 1 client        |
| `--force`                                         | off      | Re-wire dù đã cài                |
| `--skip-env`                                      | off      | Không sửa shell profile          |

**Proxy / daemon**

| Flag                          | Mặc định                 | Mô tả                                            |
| ----------------------------- | ------------------------ | ------------------------------------------------ |
| `--skip-proxy`                | off                      | Bỏ qua build/start proxy + daemon                |
| `--skip-build`                | off                      | Bỏ qua `npm install && npm run build`            |
| `--agy-bin <path>`            | `./agy-clean-wrapper.sh` | Đường dẫn wrapper hoặc binary `agy`              |
| `--host <host>`               | `127.0.0.1`              | Host bind cho proxy                              |
| `--port <number>`             | `3129`                   | Port bind cho proxy                              |
| `--timeout-ms <number>`       | `120000`                 | Timeout `agy` CLI (ms)                           |
| `--sandbox`                   | off                      | Truyền `--sandbox` cho `agy` CLI                 |
| `--agentmemory-bin <path>`    | auto-detect              | Override đường dẫn binary `agentmemory`          |
| `--skip-agentmemory-startup`  | off                      | Không đăng ký daemon thành startup task          |
| `-h`, `--help`                |                          | Hiển thị help                                    |

Phase proxy idempotent — chạy lại `bash setup.sh` an toàn, skip phần đã healthy.

---

## Kiểm tra

```bash
# Proxy health
curl -fsSL http://127.0.0.1:3129/health

# AgentMemory daemon health
curl -fsSL http://localhost:3111/agentmemory/health

# CLI status
agentmemory status
agentmemory doctor
```

Dashboard: mở `http://localhost:3113` trên trình duyệt.

Xem log live:

```bash
tail -f ~/.ag-agentmemmory-proxy/agy-proxy.log         # proxy
tail -f ~/.ag-agentmemmory-proxy/agentmemory.log       # daemon (startup task mac/win)
```

---

## Troubleshooting

| Triệu chứng                                                       | Cách fix                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| MCP tool không hiển thị trong Claude Code / Codex / Antigravity   | Restart client. Shell mới phải có `AGENTMEMORY_URL` (mở terminal mới).                              |
| Codex hiện trust prompt nhưng tool vẫn thiếu                      | Accept **đủ 6** hook trong TUI, sau đó restart Codex.                                               |
| `agy-cli` proxy trả 502 / hang                                    | `agy login` (token có thể hết hạn). Rồi `bash setup.sh --skip-build`.                               |
| `agentmemory doctor` báo daemon chưa chạy                         | macOS: `launchctl load ~/Library/LaunchAgents/com.agentmemory.plist`. Windows: `schtasks /Run /TN AgentMemory`. |
| Port đang bị chiếm (`:3111`, `:3129`, `:3113`)                    | Kill process xung đột hoặc đổi `--port` cho proxy.                                                  |
| Block rules trong `GEMINI.md` bị thiếu                            | Chạy lại `bash setup.sh --client antigravity --force`.                                              |

---

## Gỡ cài đặt

```bash
# Stop services
agentmemory stop 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.agentmemory.plist 2>/dev/null || true   # macOS
schtasks /Delete /TN AgentMemory /F 2>/dev/null || true                              # Windows

# Xoá data và config
rm -rf ~/.agentmemory ~/.ag-agentmemmory-proxy
rm -f  ~/Library/LaunchAgents/com.agentmemory.plist

# Gỡ CLI
sudo npm uninstall -g @agentmemory/agentmemory
```

Sau đó xoá các entry `agentmemory` (và block `<!-- AGENTMEMORY_RULES_START/END -->`) trong:

- `~/.claude/settings.json`
- `~/.claude.json`
- `~/.codex/config.toml`
- `~/.gemini/antigravity/mcp_config.json`
- `~/.gemini/GEMINI.md`
- `~/.zshrc` / `~/.bashrc` / `~/.bash_profile`

---

## Tổng quan

AgentMemory là daemon memory bền vững cho các AI coding agent. Wire thủ công trên nhiều tool rất tốn công và dễ sai — mỗi client có format config khác nhau (JSON / TOML / skill file), hệ thống hook khác, mô hình startup khác.

`ag-agentmemory` tự động hóa toàn bộ setup trong một lệnh:

- Kết nối AgentMemory thành **MCP server** trong Claude Code, Codex và Antigravity.
- Cài **hooks** để daemon tự khởi động cùng session.
- Drop **8 skill user-invocable** (`/recall`, `/remember`, `/forget`, …) vào Antigravity.
- Khởi động proxy local **`agy-cli` tương thích OpenAI** trên `:3129`, cho phép AgentMemory gọi Antigravity CLI đã đăng nhập làm LLM provider — không cần `OPENAI_API_KEY`.
- Đăng ký daemon thành **startup service** (LaunchAgent trên macOS, Task Scheduler trên Windows) để sống sót qua reboot.

Hỗ trợ **macOS** và **Windows** (Git Bash / MSYS2).

**Các yêu cầu khác** (ngoài `agentmemory` CLI ở Quick Start): `node` ≥ 18, `npm`, `agy` CLI đã đăng nhập (`agy login`), thêm `claude` và/hoặc `codex` CLI cho client tương ứng.

---

## Kiến trúc

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Claude Code  │   │  Codex CLI   │   │ Antigravity  │
│  (MCP+hooks) │   │   (MCP)      │   │ (MCP+skills) │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │ stdio MCP        │ stdio MCP        │ stdio MCP
       └──────────────────┼──────────────────┘
                          ▼
                ┌─────────────────────┐
                │  AgentMemory daemon │   :3111   (LaunchAgent / Task Scheduler)
                │     + Dashboard     │   :3113
                └──────────┬──────────┘
                           │ HTTP tương thích OpenAI
                           ▼
                ┌─────────────────────┐
                │   agy-cli proxy     │   :3129   (Node background process)
                └──────────┬──────────┘
                           │ exec
                           ▼
                ┌─────────────────────┐
                │  agy CLI (logged-in)│
                └─────────────────────┘
```

---

## Cài đặt gồm những gì

### Runtime services

| Service                | Address                                | Auto-start                                  |
| ---------------------- | -------------------------------------- | ------------------------------------------- |
| AgentMemory daemon     | `http://localhost:3111`                | LaunchAgent (macOS) / Task Scheduler (Win)  |
| AgentMemory dashboard  | `http://localhost:3113`                | Phục vụ bởi daemon                          |
| `agy-cli` proxy        | `http://127.0.0.1:3129`                | Node background process do setup spawn      |

### Wire theo từng client

| Client       | MCP config                                  | Hooks / extras                                                                  |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Claude Code  | `~/.claude.json` (qua `agentmemory connect`)| Hook `SessionStart` + `Stop` merge vào `~/.claude/settings.json`                |
| Codex CLI    | `~/.codex/config.toml`                      | 6 hook (trust thủ công trong TUI)                                               |
| Antigravity  | `~/.gemini/antigravity/mcp_config.json`     | 8 skill trong `~/.gemini/antigravity/skills/` + block rules trong `~/.gemini/GEMINI.md` |

### Antigravity skills

| Skill              | Mục đích                                                  |
| ------------------ | --------------------------------------------------------- |
| `/recall`          | Tìm observation cũ trong các session                      |
| `/remember`        | Lưu insight, decision, hoặc learning                      |
| `/forget`          | Xoá observation hoặc session cụ thể                       |
| `/handoff`         | Resume session gần nhất cho project hiện tại              |
| `/recap`           | Tóm tắt các session gần đây theo khung thời gian          |
| `/session-history` | Liệt kê session gần đây của project                       |
| `/commit-context`  | Trace file/function về session đã viết ra nó              |
| `/commit-history`  | Liệt kê git commit gần đây liên kết với agent session     |

### Shell environment

`AGENTMEMORY_URL=http://localhost:3111` được ghi vào:
- `~/.agentmemory/.env` (MCP shim đọc)
- `~/.zshrc`, `~/.bashrc`, `~/.bash_profile` (file nào có sẵn)

### Phase proxy (bên trong `setup.sh`)

1. Build `dist/cli.js` (`npm install && npm run build`).
2. Ghi config proxy vào `~/.ag-agentmemmory-proxy/proxy.env`.
3. Spawn proxy background; log → `~/.ag-agentmemmory-proxy/agy-proxy.log`.
4. Đăng ký daemon agentmemory thành startup service và chờ `:3111` healthy.

---

## Cấu trúc dự án

```
ag-agentmemory/
├── setup.sh                # All-in-one: client wiring + agy proxy + startup daemon
├── agy-clean-wrapper.sh    # Wrapper sanitize cho agy CLI
├── src/                    # Source agy-cli proxy (TypeScript)
└── dist/                   # Build output (cli.js, dùng bởi setup.sh)
```

Upstream: <https://github.com/rohitg00/agentmemory>
