# Update AgentMemory + Patch Proxy — Runbook cho Agent

Hướng dẫn cập nhật `@agentmemory/agentmemory` lên bản mới nhất rồi **re-apply
shim `triggerVoid`** (gọi tắt là "proxy patch"). Làm theo đúng thứ tự.

## Khi nào cần chạy

- Người dùng yêu cầu "update agentmemory" / "update bản mới nhất".
- Log daemon `~/.ag-agentmemmory-proxy/agentmemory.log` xuất hiện
  `sdk.triggerVoid is not a function` (thường trên `event::session::stopped`,
  `mem::slot-reflect`, `mem::graph-extract`).

## Vì sao phải patch sau mỗi lần update

`@agentmemory/agentmemory` gọi `sdk.triggerVoid(...)`, nhưng `iii-sdk` (dep của
nó) đã **bỏ** hàm này từ lâu (xác nhận lại ở iii-sdk 0.11.2 đi kèm agentmemory
0.9.27). Ta vá bằng cách chèn lại shim vào `iii-sdk/dist`. Vì file đó nằm trong
**global `node_modules`**, patch **không sống sót** qua `npm i -g` → phải
re-apply sau **mỗi** lần update. `setup.sh`/`update.sh` hiện **chưa** bake sẵn
bước này.

---

## TL;DR — copy-paste cả block

```bash
cd "$(dirname "$0")" 2>/dev/null; cd /Users/zasuo/AI-Tool/ag-agentmemory

# 1) Cài bản mới nhất, CHƯA restart (tránh cửa sổ daemon chạy thiếu shim)
bash update.sh --no-restart

# 2) Re-inject shim triggerVoid vào CẢ index.mjs + index.cjs (idempotent)
PREFIX="$(npm config get prefix)"
SDK="$PREFIX/lib/node_modules/@agentmemory/agentmemory/node_modules/iii-sdk/dist"
node -e '
const fs=require("fs"); const dir=process.argv[1];
for (const name of ["index.mjs","index.cjs"]) {
  const f=dir+"/"+name; let s=fs.readFileSync(f,"utf8");
  if (s.includes("triggerVoid")) { console.log(name,"-> already patched, skip"); continue; }
  const anchor=/^([ \t]*)this\.listFunctions = async/m; const m=s.match(anchor);
  if (!m) { console.error(name,"-> ANCHOR NOT FOUND"); process.exit(2); }
  const shim=m[1]+"this.triggerVoid = (function_id, payload) => this.trigger({ function_id, payload, action: { type: \"void\" } }); // ag-proxy shim: re-add after @agentmemory update (iii-sdk dropped triggerVoid)\n";
  fs.writeFileSync(f, s.replace(anchor,(full)=>shim+full)); console.log(name,"-> shim injected");
}' "$SDK"

# 3) Syntax check (bắt buộc — đừng restart nếu fail)
node --check "$SDK/index.cjs" && echo "cjs OK"
node -e "import('file://$SDK/index.mjs').then(()=>console.log('mjs OK')).catch(e=>{console.error('mjs ERR',e.message);process.exit(1)})"

# 4) Restart daemon
launchctl kickstart -k "gui/$(id -u)/com.agentmemory"
```

---

## Chi tiết shim

Chèn **một dòng** này ngay **trước** `this.listFunctions = async () => {` trong
cả `index.mjs` và `index.cjs`:

```js
this.triggerVoid = (function_id, payload) => this.trigger({ function_id, payload, action: { type: "void" } });
```

Một shim phủ cả 12 call-site vì chúng dùng chung một worker object.

File cần vá (đường dẫn suy ra từ npm prefix, đừng hard-code `/opt/homebrew`):

```
$(npm config get prefix)/lib/node_modules/@agentmemory/agentmemory/node_modules/iii-sdk/dist/index.mjs
$(npm config get prefix)/lib/node_modules/@agentmemory/agentmemory/node_modules/iii-sdk/dist/index.cjs
```

---

## Verify (pass cả 4 mới coi là xong)

```bash
LOG="$HOME/.ag-agentmemmory-proxy/agentmemory.log"; BEFORE=$(wc -l < "$LOG" 2>/dev/null || echo 0)

# 1) Health daemon
node -e "fetch('http://localhost:3111/agentmemory/health').then(r=>r.json()).then(j=>console.log('daemon',j.version,j.status))"

# 2) 0 lỗi triggerVoid trong log mới
tail -n +$((BEFORE+1)) "$LOG" | grep -iE "triggervoid|is not a function" && echo ">>> CÒN LỖI" || echo "0 lỗi triggerVoid OK"

# 3) MCP end-to-end (memory tool trả kết quả, không crash)
#    -> gọi memory_recall / memory_smart_search trong client.

# 4) Product dùng proxy: counter mem::compress tăng & KHÔNG sinh fail mới
m(){ curl -s localhost:3111/agentmemory/health | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s),x=(j.functionMetrics||[]).find(f=>f.functionId==='mem::compress');console.log('ok='+x.successCount+' fail='+x.failureCount)})"; }
m   # TRƯỚC -> ép 1 op LLM qua product (compress file .md / memory_save dài) -> m lại; ok tăng, fail không tăng
```

---

## Troubleshooting

- **`ANCHOR NOT FOUND`**: upstream đổi cấu trúc. Mở `index.mjs`, tìm khối
  `this.trigger = async (...) => { ... };` rồi chèn shim ngay sau nó / trước
  `this.listFunctions`.
- **`triggerVoid` đã có sẵn**: bản iii-sdk mới có thể đã khôi phục hàm này →
  script tự `skip`, không cần làm gì.
- **`npm install failed (EACCES)`**: prefix không thuộc user. Xem hướng dẫn
  reclaim trong `update.sh` (không bao giờ chạy `sudo npm`).
- **Daemon không healthy trong ~15s**: `tail ~/.ag-agentmemmory-proxy/agentmemory.log`.

## Muốn khỏi vá tay lần sau

Bake bước 2–4 thành post-install trong `update.sh` (sau dòng `ok "Installed ..."`)
để patch tự chạy mỗi lần update.
