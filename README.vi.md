# ag-agentmemory

[English](README.md) | [Tiếng Việt](README.vi.md)

Repo gốc AgentMemory: https://github.com/rohitg00/agentmemory

Automation setup AgentMemory cho Antigravity, Codex CLI và Claude Code.

Setup giữ `~/.agentmemory/.env` làm nguồn cấu hình chính, dùng local embedding model và bật automation qua proxy Antigravity CLI đã đăng nhập. API key là tùy chọn.

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

Setup mặc định dùng cơ chế proxy qua Antigravity CLI đã đăng nhập, không cần API key:

```bash
bash setup.sh
```

Chỉ setup một client:

```bash
bash setup.sh --client antigravity
```

Bỏ qua sync upstream nếu muốn chạy nhanh:

```bash
bash setup.sh --skip-upstream
```

## Agy Local Proxy

`setup.sh` không patch AgentMemory upstream. Script start một OpenAI-compatible proxy local tại `http://127.0.0.1:3129`, rồi cấu hình AgentMemory dùng provider `openai` sẵn có để gọi proxy này. Proxy chuyển request sang `agy --print-timeout 120s -p "<prompt>"`.

Yêu cầu và giới hạn:

- Cần `agy` CLI đã đăng nhập, mặc định tại `~/.local/bin/agy`.
- Mỗi LLM call spawn CLI nên chậm hơn API trực tiếp.
- Embeddings vẫn là local.
- Hooks và automation dùng LLM được bật mặc định.

## Upstream Snapshot

Mỗi lần setup, script sẽ clone hoặc pull upstream AgentMemory vào cache:

```text
.agentmemory-upstream/
```

Sau đó sync sang working copy không có git metadata:

```text
agentmemory/
```

Thư mục `agentmemory/` giữ snapshot local để vẫn đọc được docs, plugin, hooks và scripts nếu upstream GitHub bị xoá hoặc mạng lỗi. Nếu pull/clone lỗi nhưng `agentmemory/` đã tồn tại, setup vẫn tiếp tục dùng snapshot cũ.

## AgentMemory Server

Sau setup, chạy server:

```bash
npx -y @agentmemory/agentmemory@latest
```

Viewer:

```text
http://localhost:3113
```

Health:

```bash
curl -fsSL http://localhost:3111/agentmemory/health
```

Trước khi `setup.sh` restart AgentMemory, script sẽ backup runtime state vào:

```text
~/.agentmemory/backups/setup-<timestamp>/
```

Backup gồm thư mục `data/` local nếu có, `~/.agentmemory/standalone.json`, và file env hiện tại.

## Antigravity

Antigravity chưa có upstream plugin AgentMemory, nên repo này tự setup:

- MCP: `~/.gemini/antigravity/mcp_config.json`
- Instructions: `~/.gemini/GEMINI.md`
- Skills: `~/.gemini/antigravity/skills/`

Setup dùng sentinel block để không xóa nội dung cũ trong `GEMINI.md`.

## Codex CLI

Setup ghi MCP fallback trong:

```text
~/.codex/config.toml
```

Setup cũng cố gắng cài upstream AgentMemory plugin và chạy `agentmemory connect codex --with-hooks --force`.

## Claude Code

Setup cố gắng cài upstream Claude Code plugin và connect AgentMemory hooks khi có sẵn CLI `claude` và `agentmemory`.

## CLI

Sau khi build:

```bash
node dist/cli.js setup --profile local --client all
node dist/cli.js setup --profile agy-local --agy-bin ~/.local/bin/agy
node dist/cli.js agy-proxy --host 127.0.0.1 --port 3129
node dist/cli.js verify
node dist/cli.js status
```

## Custom Overlay

Ghi đè templates bằng cách đặt file tương ứng trong:

```text
custom/instructions/
custom/skills/
```

Setup copy template mặc định trước, sau đó overlay custom.

Antigravity instructions được ghi vào `~/.gemini/GEMINI.md` bằng block:

```text
<!-- AGENTMEMORY_RULES_START -->
...
<!-- AGENTMEMORY_RULES_END -->
```

Chạy lại `setup.sh` sẽ cập nhật lại block này và copy lại skills vào `~/.gemini/antigravity/skills/`.

## Không Làm

- Không fork AgentMemory upstream.
- Không yêu cầu API key cho embeddings.
