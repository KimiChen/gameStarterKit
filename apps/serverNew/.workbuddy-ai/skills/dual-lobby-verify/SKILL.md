---
name: dual-lobby-verify
description: Run the real two-channel joint verification for the gameKit monorepo — fork both the legacy apps/server (Colyseus) and the new apps/serverNew (native WebSocket Lobby) and drive both from the client's own transport modules in one process. Covers default/explicit/invalid transport config, channel switching, drop, reconnect, dual-channel coexistence and GameRoom regression. Use when a task touches the Lobby protocol, the client transport layer (WebSocketClient / NativeLobbyTransport / LobbyTransportHub), or P7 joint verification in apps/serverNew/humanDocs/协议模块调整.md.
description_zh: "gameKit 双链联合验证：同一客户端进程真连旧 apps/server 与新 apps/serverNew"
description_en: "Fork both old and new servers and drive both Lobby channels from the real client modules"
agent_created: true
---

# gameKit 双链联合验证（旧 Colyseus + 新原生 Lobby）

工作区：`/Users/kk/26/gameKit`（`apps/client` + `apps/server` + `apps/serverNew`）。

## 一条命令

```bash
cd /Users/kk/26/gameKit
env CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run verify:dual-lobby
```

脚本：`apps/client/scripts/verify/dual-lobby-transport.mts`（根 `package.json` 转交 `apps/server` 的 tsx 跑，
与 `test:client` 同一模式）。它自己 fork **两个**服务进程并用随机空闲端口，退出时回收。
全绿输出形如 `共 9 项，通过 9，失败 0` + `未处理拒绝/未捕获异常：0`；退出码 0。

## 前置：旧 dev-stack 必须已启动（**不需要 Docker**）

```bash
cd /Users/kk/26/gameKit/apps/server
env CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run stack      # 本机 redis-server 6401/6402 + mysqld 3316
env CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run db:bootstrap
# 收工：npm run stack:stop
```

- 栈没起时脚本会立刻报「前置不成立：旧 durable Redis (127.0.0.1:6401) 不可达」并给出该命令。
- 旧服务的 token 走**非生产缺省** `AUTH_PROVIDER=dev` 的 `POST /v1/sessions/dev`（body `{devKey, serverId}`，
  `serverId` 用 0 —— dev 目录把整服暴露成 sId 0），无需 WebPlatform。
- 新服务的 WebPlatform 身份服务用进程内桩，路径从 `generated/lobby-contract/protocol/http` 的
  `WebPlatformHttpContractMap` 读，⛔ 不手写字符串。

## 它覆盖什么（9 个场景）

默认旧配置 / 旧通道幂等写 + 领域推送 / 旧通道断线 / 旧通道重连 / 显式新配置 / 非法配置 /
有连接时拒绝切换 / 双通道共存 / GameRoom 回归。

## 三个实测陷阱（改这个脚本前必读）

1. **旧通道自动重连有 SDK `min uptime` 门槛（默认 5000ms）**：房间存活不足门槛就硬断，SDK 直接拒绝
   重连（日志 `Room has not been up for long enough for automatic reconnection`）。测重连必须先等够。
2. **`room.connection.close()` 到 `dropped` 事件有约 6ms 传播窗口**：此时 `state === "ready"` 仍为真，
   `waitFor` 会在断线事件到达前就返回，紧接着发的 RPC 撞在断线处理器上被判 `CONN_LOST`。
   正确断言是「**先等它离开 ready，再等它回来**」。且 `RpcError(code, msg = "")` 的 message 是空串 ——
   失败明细必须带 `name` + 调用栈 + 状态迁移时序，否则等于没有诊断。
3. **场景之间必须把两条链都归零**：`WebSocketClient` 是单例、`configure` 又要求「切换前先释放当前连接」。
   任一场景中途失败没走完 `leave()`，后续场景会全部变成同一条「必须先释放当前连接」的假失败。

## 其他要点

- 旧通道的 SDK 是**仓内 UMD**：`apps/client/src/lib/colyseus/colyseus.js`（`colyseus.js@0.17.43`）。
  用 `new Function("module","exports",src)(mod, mod.exports)` 挂到 `globalThis.Colyseus` 即可
  （客户端在**调用期**取全局，不是 import 期）。⛔ 不要为此替换实现。
- 双通道**共存**不是**切换**：先把 hub 钉到新通道（此刻空闲），再绕过 hub 直接持有旧单例。
  反过来先连旧单例会让 hub 正确拒绝「有连接时切换」，那时失败的是场景设计而不是产品行为。
- `apps/client/scripts/**` **不在任何 tsconfig 的 include 内**（不参与 `typecheck:client`），
  写这类脚本没有类型保护，靠运行时断言兜底。
- 改完协议/传输层后配套跑：`cd apps/serverNew/server && pnpm check`、`pnpm test`，
  以及 `pnpm verify:native-lobby-live`（新链的服务端侧真实进程自检）。

## 变异验证（证明断言承重）

两个已验证有效的变异点：

- `apps/client/src/net/LobbyTransportHub.ts` `configure()` 里的
  `if (this.current.getConnectionState().state !== "idle") throw ...` → 目标场景 + 共存场景变红。
- 同文件 `connect()` native 分支的 `transport.init(this.config.endpoint)` 改成
  `transport.init(server.gameWsUrl)` → **恰好**依赖显式端点的 3 个场景变红，其余保持绿。

⛔ 还原用 Edit 逐字改回 + `grep` 核对：`LobbyTransportHub.ts` / `lobbyTransportConfig.ts`
**未被 git 跟踪**，`git diff` 不能作为还原证据。
