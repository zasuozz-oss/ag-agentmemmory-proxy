# Thiet ke viet lai setup.sh cho agy-local va upstream AgentMemory

## Muc tieu

`setup.sh` moi se thay the hoan toan noi dung hien tai. Script nay la entrypoint mot lenh de cau hinh `ag-agentmemory` cho ba nen tang can ho tro:

- Antigravity MCP
- Codex CLI
- Claude Code

Script phai tap trung vao phan custom cua repo nay: build va chay `agy-proxy`, patch `~/.agentmemory/.env` de AgentMemory dung proxy do, copy rule/skills cho Antigravity, va sau do goi cac lenh public cua upstream AgentMemory nhu nguoi dung binh thuong. Script khong tu patch runtime noi bo cua upstream, khong tu chay `dist/index.mjs`, khong tu start `iii`, va khong wire cac nen tang ngoai ba target tren.

## Nguyen tac

- Dung upstream AgentMemory theo public CLI: `agentmemory init`, `agentmemory connect ...`, `agentmemory doctor`, `agentmemory status`, va `agentmemory` de start server.
- Khong dung `agentmemory connect --all`, vi upstream `--all` co the wire cac nen tang ngoai pham vi nhu Cursor, Gemini CLI, OpenClaw, Hermes, pi, OpenHuman.
- Khong tu sua `~/.codex/config.toml`, `~/.claude/settings.json`, `~/.claude.json`, hoac hook files cho Codex/Claude, tru khi do la fallback duoc thiet ke rieng sau nay.
- Khong xoa config nguoi dung. Moi thay doi phai idempotent va co pham vi ro rang.
- `custom/` la nguon nguoi dung chinh sua. Script uu tien `custom` truoc, roi moi fallback ve template repo hoac upstream plugin.

## Luong chay mac dinh

1. Kiem tra prerequisites:
   - `node`
   - `npm`
   - `agentmemory`
   - `agy`

2. Build proxy:
   - chay `npm install`
   - chay `npm run build`
   - fail som neu build loi

3. Khoi tao AgentMemory:
   - chay `agentmemory init`
   - neu `.env` da ton tai thi chap nhan ket qua upstream va tiep tuc

4. Patch `~/.agentmemory/.env` cho agy-local:
   - `AGENTMEMORY_URL=http://localhost:3111`
   - `EMBEDDING_PROVIDER=local`
   - `TRANSFORMERS_CACHE=~/.cache/xenova-transformers`
   - `OPENAI_API_KEY=dummy`
   - `OPENAI_MODEL=agy-cli`
   - `OPENAI_BASE_URL=http://127.0.0.1:<port>`
   - `OPENAI_API_KEY_FOR_LLM=true`
   - `AGENTMEMORY_AUTO_COMPRESS=true`
   - `CONSOLIDATION_ENABLED=true`
   - `GRAPH_EXTRACTION_ENABLED=true`
   - `AGENTMEMORY_INJECT_CONTEXT=true`
   - `AGENTMEMORY_DROP_STALE_INDEX=false` trong cau hinh binh thuong
   - `AGY_CLI_BIN=<path>`
   - `AGY_CLI_TIMEOUT_MS=120000`
   - `AGY_CLI_SANDBOX=false`
   - `AGY_PROXY_PORT=<port>`

5. Start hoac reuse `agy-proxy`:
   - neu `GET http://127.0.0.1:<port>/health` thanh cong thi reuse process hien co
   - neu chua co, start `node dist/cli.js agy-proxy --host 127.0.0.1 --port <port>` o background
   - ghi log vao `~/.agentmemory/agy-proxy.log`
   - fail neu proxy khong healthy sau timeout

6. Setup clients:
   - mac dinh `--client all`, trong repo nay co nghia la `antigravity,codex,claude-code`
   - khong setup nen tang nao khac

7. Start AgentMemory bang upstream CLI:
   - chay `agentmemory` o background voi env da patch
   - ghi log vao `~/.agentmemory/server.log`
   - khong tu start `iii`
   - khong goi truc tiep package internal path

8. Verify:
   - proxy health OK
   - AgentMemory health OK
   - client setup OK theo target da chon
   - in summary ro rang

## Client targets

### Antigravity

Antigravity khong co target native trong upstream AgentMemory, nen script tu setup ba phan:

- MCP config: merge `mcpServers.agentmemory` vao `~/.gemini/antigravity/mcp_config.json`
- Rule: upsert block AgentMemory vao `~/.gemini/GEMINI.md` bang sentinel:
  - `<!-- AGENTMEMORY_RULES_START -->`
  - `<!-- AGENTMEMORY_RULES_END -->`
- Skills: copy skills vao `~/.gemini/antigravity/skills/`

Nguon copy:

- rule uu tien `custom/instructions/AGENTMEMORY.md`
- neu thieu thi fallback `src/templates/instructions/AGENTMEMORY.md`
- skills uu tien `custom/skills/*`
- neu thieu thi fallback `src/templates/skills/*`

### Codex CLI

Codex dung upstream plugin/connect lam nguon chinh:

- `codex plugin marketplace add rohitg00/agentmemory`
- `codex plugin install agentmemory`
- `agentmemory connect codex --with-hooks --force`

Script chi verify ket qua. Script khong tu patch `~/.codex/config.toml` hoac `~/.codex/hooks.json` trong luong mac dinh. Neu upstream connect loi, script bao loi va in lenh can chay thu cong thay vi im lang bo qua.

### Claude Code

Claude Code dung upstream plugin/connect lam nguon chinh:

- `claude plugin marketplace add rohitg00/agentmemory`
- `claude plugin install agentmemory@agentmemory`
- fallback `claude plugin install agentmemory` neu ten package tren khong duoc chap nhan
- `agentmemory connect claude-code`

Script chi verify ket qua. Script khong tu patch `~/.claude/settings.json`, `~/.claude.json`, hoac hook config trong luong mac dinh. Neu upstream connect loi, script bao loi va in lenh can chay thu cong.

## Custom overlay

`custom/` la noi nguoi dung chinh sua truoc khi setup:

- `custom/instructions/AGENTMEMORY.md`
- `custom/skills/*`
- `custom/hooks/*`
- `custom/plugin/*`

Trong scope nay, `custom/instructions` va `custom/skills` duoc dung cho Antigravity. `custom/hooks` va `custom/plugin` duoc giu de tham khao hoac lam fallback sau nay, nhung khong thay the upstream plugin/connect cho Codex va Claude trong luong mac dinh.

## CLI flags

Script moi ho tro cac flag sau:

- `--client <all|antigravity|codex|claude-code>`: target can setup, mac dinh `all`
- `--agy-bin <path>` hoac `--agy-bin=<path>`: path toi `agy`, mac dinh `~/.local/bin/agy`
- `--port <number>` hoac `--port=<number>`: port proxy, mac dinh `3129`
- `--drop-stale-index`: set `AGENTMEMORY_DROP_STALE_INDEX=true` cho lan start AgentMemory hien tai, khong ghi vinh vien vao `.env`
- `--clear-data`: backup roi xoa runtime data AgentMemory truoc khi start
- `--skip-connect`: bo qua setup clients, chi setup env/proxy/server
- `--skip-doctor`: bo qua `agentmemory doctor --all`

Unknown flags phai lam script fail voi thong bao ro rang. Khong duoc im lang bo qua nhu script hien tai.

## Xu ly stale vector index

Mac dinh script khong tu drop stale index vi day la hanh dong co the mat persisted vector index.

Neu AgentMemory health fail va `~/.agentmemory/server.log` co `wrong dimension`, script dung lai va huong dan:

```bash
bash setup.sh --drop-stale-index
```

Khi co `--drop-stale-index`, script chi set `AGENTMEMORY_DROP_STALE_INDEX=true` trong env cua process `agentmemory` cho lan start do. Gia tri trong `.env` van giu `false`.

## Clear data

`--clear-data` la hanh dong explicit. Truoc khi xoa, script backup vao:

```text
~/.agentmemory/backups/setup-<timestamp>/
```

Backup gom:

- `~/.agentmemory/.env`
- `~/.agentmemory/standalone.json`
- repo-local `data/` neu ton tai

Sau backup, script co the xoa runtime files lien quan nhu:

- repo-local `data/`
- `~/.agentmemory/standalone.json`
- `~/.agentmemory/engine-state.json`
- `~/.agentmemory/server.log`
- `~/.agentmemory/engine.log`
- `~/.agentmemory/agy-proxy.log`

## Verification

Setup thanh cong khi:

- `http://127.0.0.1:<port>/health` tra OK cho `agy-proxy`
- `http://localhost:3111/agentmemory/health` tra OK cho AgentMemory
- Antigravity target co MCP config, rule sentinel block, va skills trong folder target
- Codex target chay thanh cong upstream plugin/connect commands
- Claude Code target chay thanh cong upstream plugin/connect commands
- `agentmemory status` khong bao loi nghiem trong

## Ngoai pham vi

- Khong refactor TypeScript CLI trong buoc nay tru khi can thiet cho `setup.sh`
- Khong setup Cursor, Gemini CLI, OpenClaw, Hermes, pi, OpenHuman
- Khong sua upstream package trong `agentmemory/`
- Khong tu ghi hook Codex/Claude trong luong mac dinh
- Khong commit tu dong
