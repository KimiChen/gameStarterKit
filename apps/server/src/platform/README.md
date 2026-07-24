# platform/ — 账号 plane 接缝（业务侧看 WebPlatform 的那一面）

M12c（[docs/DUAL_MODE.md §2.7](../../../../docs/DUAL_MODE.md)）把身份/token/角色注册表抽成独立门户
`apps/WebPlatform`（MySQL-only 目录 + 身份权威 + 只读投影）。本目录是**业务侧的消费接缝**：
一切对「账号/身份/char_registry」的访问走 `AccountClient`，⛔ 不直连 `core/auth/*` 或手写
char_registry SQL。

- `accountClient.ts` — `AccountClient` 接口 + 当前实现。
  - **Step 1（当前）**：`inProcessAccount` 同进程实现，委托现有 `verifyBearer` / char_registry，
    **⛔ 零行为变化**——只是把调用点收敛到接缝上。
  - **Step 2**：`account` 换成指向 `apps/WebPlatform` 的 HTTP client，**本接口与全部调用点不变**。
