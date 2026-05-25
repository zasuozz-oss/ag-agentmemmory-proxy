# ag-agentmemmory-proxy

[README](README.md) | [Tiếng Việt](README.vi.md)

`ag-agentmemmory-proxy` cung cấp một proxy cục bộ tương thích OpenAI cho `agy-cli`. Proxy chạy trên máy local, nhận request dạng OpenAI chat completions, rồi chuyển prompt sang `agy` CLI đã đăng nhập.

Nguồn AgentMemory upstream: https://github.com/rohitg00/agentmemory

## Tổng Quan Setup

Thứ tự setup khuyến dùng:

1. Cài và chạy AgentMemory upstream.
2. Cấu hình Claude Code.
3. Cấu hình Codex CLI.
4. Chạy proxy của repo này.
5. Trỏ AgentMemory upstream về endpoint proxy nếu muốn dùng `agy-cli` làm LLM provider.

## 1. Setup AgentMemory Upstream

Cài AgentMemory CLI một lần:

```bash
npm install -g @agentmemory/agentmemory
```

Hoặc chạy bằng `npx`:

```bash
npx -y @agentmemory/agentmemory@latest
```

Chạy memory server trong một terminal riêng:

```bash
agentmemory
```

Kiểm tra server:

```bash
curl -fsSL http://localhost:3111/agentmemory/health
```

Viewer upstream:

```text
http://localhost:3113
```

Lệnh hữu ích:

```bash
agentmemory doctor
agentmemory stop
agentmemory remove
```

## 2. Setup Claude Code

Trong Claude Code, cài AgentMemory plugin:

```text
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory
```

Plugin sẽ wire MCP server, hooks, và skills của AgentMemory cho Claude Code. Sau khi cài xong, restart Claude Code nếu tool hoặc plugin chưa hiển thị ngay.

Kiểm tra:

```bash
curl -fsSL http://localhost:3111/agentmemory/health
agentmemory doctor
```

Nếu muốn wire hook/MCP bằng AgentMemory CLI:

```bash
agentmemory connect claude-code --with-hooks
```

Chạy lại command này sau mỗi lần upgrade AgentMemory nếu hook path thay đổi.

## 3. Setup Codex CLI

Cài AgentMemory plugin cho Codex CLI:

```bash
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Plugin sẽ đăng ký MCP server, lifecycle hooks, và skills của AgentMemory cho Codex CLI.

Kiểm tra:

```bash
curl -fsSL http://localhost:3111/agentmemory/health
agentmemory doctor
```

Nếu dùng Codex Desktop hoặc môi trường cần mirror hook vào user-scope:

```bash
agentmemory connect codex --with-hooks
```

Nếu chỉ cần MCP fallback cho Codex:

```bash
codex mcp add agentmemory -- npx -y @agentmemory/mcp
```

## 4. Setup Proxy

Proxy expose endpoint OpenAI-compatible ở `127.0.0.1:3129` và gọi `agy-clean-wrapper.sh` cho mỗi request.

```bash
bash setup.sh
```

Script sẽ:

- chạy `npm install` và `npm run build`
- ghi config proxy vào `~/.ag-agentmemmory-proxy/proxy.env`
- start hoặc reuse `agy-proxy`
- kiểm tra `http://127.0.0.1:3129/health`

Nếu đã build sẵn:

```bash
bash setup.sh --skip-build
```

Tùy chọn:

```bash
bash setup.sh --agy-bin /path/to/agy-clean-wrapper.sh
bash setup.sh --host 127.0.0.1 --port 3129
bash setup.sh --timeout-ms 120000
bash setup.sh --sandbox
```

## 5. Trỏ AgentMemory Về Proxy

Sau khi proxy chạy, cấu hình provider OpenAI-compatible của AgentMemory upstream trỏ về endpoint local:

```env
OPENAI_BASE_URL=http://127.0.0.1:3129
OPENAI_MODEL=agy-cli
```

Restart AgentMemory sau khi cập nhật config:

```bash
agentmemory stop
agentmemory
```

## CLI Proxy

```bash
npm run build
node dist/cli.js setup
node dist/cli.js agy-proxy --host 127.0.0.1 --port 3129
node dist/cli.js status
node dist/cli.js verify
```

`setup` có thể nhận các option:

```bash
node dist/cli.js setup --host 127.0.0.1 --port 3129
node dist/cli.js setup --agy-bin ./agy-clean-wrapper.sh --timeout-ms 120000
node dist/cli.js setup --sandbox
```

## Config Proxy

Setup ghi các file proxy tại:

```text
~/.ag-agentmemmory-proxy/proxy.env
~/.ag-agentmemmory-proxy/agy-proxy.log
```

Ví dụ `proxy.env`:

```env
AGY_PROXY_HOST=127.0.0.1
AGY_PROXY_PORT=3129
AGY_CLI_BIN=/path/to/ag-agentmemmory-proxy/agy-clean-wrapper.sh
AGY_CLI_TIMEOUT_MS=120000
AGY_CLI_SANDBOX=false
```

## LaunchAgent

Để chạy proxy khi login trên macOS:

```bash
bash set-run.sh
```

Log:

```text
~/.ag-agentmemmory-proxy/agy-proxy.log
```

## Health Check

```bash
curl -fsSL http://127.0.0.1:3129/health
```

Kết quả hợp lệ:

```json
{"ok":true,"service":"agy-proxy"}
```
