# Stop Hook — Lỗi Blocking và Cách Fix

## Vấn đề

`stop.mjs` (hook chạy khi session kết thúc) gọi endpoint `/agentmemory/summarize` để trigger tóm tắt session. Endpoint này mặc định chạy **đồng bộ** và block cho đến khi LLM hoàn thành — có thể mất 3+ phút qua agy-proxy.

Hệ quả:
- **Codex**: Stop hook block 3+ phút, vượt AbortSignal 120s → hook fail im lặng, summarization không xảy ra
- **Claude Code** (phiên bản đã patch thủ công): dùng fire-and-forget + `process.exit(0)` → process thoát trước khi HTTP request kịp gửi đến server → summarization cũng không xảy ra

## Root Cause

Build output (`plugin/scripts/stop.mjs`) không có `async: true` trong request body vì plugin được build **trước** khi source `stop.ts` được cập nhật thêm flag này.

Server (`src/triggers/api.ts`, hàm `api::summarize`) đã hỗ trợ `async: true` từ trước:

```typescript
// src/triggers/api.ts ~line 603
const isAsync = !!(req.body as Record<string, unknown>)?.async;
if (isAsync) {
  sdk.trigger({ function_id: "mem::summarize", payload: { sessionId } }).catch(...);
  return { status_code: 202, body: { status: "summarize_triggered_in_background" } };
}
// nếu không có async: true → chạy đồng bộ, block đến khi LLM xong
```

## Cách Fix

**File cần sửa**: `agentmemory/plugin/scripts/stop.mjs` (và file cache nếu cần — xem bên dưới)

Thay đoạn fetch cũ:

```javascript
// SAI — không có async:true, block 3+ phút
fetch(`${REST_URL}/agentmemory/summarize`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sessionId }),
    signal: AbortSignal.timeout(12e4)
}).catch(() => {});
// ...
main().then(() => process.exit(0));
```

Bằng đoạn đúng (khớp với `src/hooks/stop.ts`):

```javascript
// ĐÚNG — async:true → server respond 202 ngay, xử lý ngầm
try {
    await fetch(`${REST_URL}/agentmemory/summarize`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId, async: true }),
        signal: AbortSignal.timeout(5000)
    });
} catch {}
// ...
main(); // không cần process.exit(0)
```

## Cách Rebuild Đúng

Sau khi upstream ghi đè, rebuild để tạo lại từ source:

```bash
cd /path/to/ag-agentmemory/agentmemory
npm run build
```

Build sẽ compile `src/hooks/stop.ts` → `plugin/scripts/stop.mjs` và `dist/hooks/stop.mjs`.

Source `src/hooks/stop.ts` đã có đúng logic (`async: true`, timeout 5s) nên sau rebuild không cần sửa tay nữa.

## File Cache Claude Code

Claude Code plugin cache tại `~/.claude/plugins/cache/agentmemory/agentmemory/<version>/scripts/stop.mjs` **không** được ghi đè khi rebuild. Nếu bị lỗi tương tự ở Claude Code hooks, sửa thủ công file đó theo cùng pattern trên.

## Kiểm Tra Nhanh

```bash
# Xác nhận stop.mjs đã có async:true
grep "async" agentmemory/plugin/scripts/stop.mjs
# → phải thấy: async: true

# Xác nhận timeout đúng (5000 hoặc 5e3, không phải 12e4)
grep "AbortSignal" agentmemory/plugin/scripts/stop.mjs
# → phải thấy: AbortSignal.timeout(5e3) hoặc AbortSignal.timeout(5000)

# Xác nhận không có process.exit
grep "process.exit" agentmemory/plugin/scripts/stop.mjs
# → không có output = đúng
```

## Tóm Tắt Nguyên Tắc

| Pattern | Kết quả |
|---|---|
| `fetch(url)` không await + `process.exit(0)` | Request chưa kịp gửi đã bị kill |
| `await fetch(url)` không có `async: true` | Block 3+ phút đến khi LLM xong |
| `await fetch(url, { body: { async: true } })` + timeout 5s | Server respond 202 ngay, xử lý ngầm ✅ |
