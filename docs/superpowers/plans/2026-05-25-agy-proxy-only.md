# Agy Proxy Only Implementation Plan

Trang thai: da trien khai.

## Muc Tieu

Thu gon `ag-agentmemmory-proxy` thanh wrapper chi quan ly local OpenAI-compatible proxy backed by `agy-cli`.

## Pham Vi Giu Lai

- `setup.sh` build proxy, ghi `~/.ag-agentmemmory-proxy/proxy.env`, va start/reuse `agy-proxy`.
- `src/cli.ts` giu cac command `setup`, `agy-proxy`, `verify`, va `status`.
- `src/setup/proxy-config.ts` la noi doc/ghi config rieng cua wrapper.
- `src/setup/verify.ts` chi check Node, proxy config, agy wrapper, va proxy health.
- `set-run.sh` chi dang ky LaunchAgent cho `agy-proxy`.
- README mo ta proxy-only scope va cach chay.

## Pham Vi Loai Bo

- Khong quan ly source goc AgentMemory.
- Khong ghi file env trong namespace AgentMemory.
- Khong start/dung server memory rieng.
- Khong cai hook/plugin cho client khac.
- Khong quan ly database memory.

## Verification

- `rtk npm test`
- `rtk bash -n setup.sh`
- `rtk bash -n set-run.sh`
- `rtk node dist/cli.js setup`
- `rtk node dist/cli.js status`
- scan code/docs de dam bao khong con command hoac config stale ngoai proxy.
