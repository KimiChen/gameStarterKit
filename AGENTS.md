# game 开发期 monorepo — AI 助手指令

> 本文件是 AI 助手与开发者的速查入口。改代码前按需阅读：
>
> - [docs/OVERVIEW.md](docs/OVERVIEW.md)：整体设计、单源契约与标准开发动线
> - [docs/SERVER.md](docs/SERVER.md)：服务端目录、RPC、数据一致性与开发约束
> - [docs/CLIENT.md](docs/CLIENT.md)：客户端目录、View/Logic、FGUI 与本地预览
> - [docs/WEBPLATFORM.md](docs/WEBPLATFORM.md)：外部身份服务的开发契约边界
>
> 每个源码目录另有就近 README。根上手页见 [README.md](README.md)。

## 技术栈

- 客户端：Cocos Creator 3.8.8 + FairyGUI 1.2.2 + bitECS 0.4。
- 代码布局：`apps/client` 是纯 TypeScript 源码真相；`apps/Cocos` 是编辑器工程壳；
  `apps/Unity` 仅为研究占位。
- 服务端：Colyseus 0.17 + Node.js 22+ + TypeScript + 本地 Redis/MySQL。
- 外部身份示例：本仓只消费精确锁定的 `@gono/webplatform-contract`，不包含其业务源码。
- 客户端网络：`@colyseus/sdk` 0.17.43 UMD，是通用网络客户端库。
- 双端共享：`apps/shared`，零依赖纯 TypeScript。

## 常用本地命令

```bash
npm install
npm run sync:webplatform-contract
npm run verify:webplatform-contract
npm run fetch:fgui
npm run fetch:colyseus
npm run sync:shared
npm run sync:client
npm run dev:client
npm run dev
npm run typecheck
npm run verify:sync
npm run test:fgui
npm run codegen:fgui -- <Pkg> <Comp>
npm run verify:ecs
npm --workspace @game/server run test
npm --workspace @game/server run smoke
npm --workspace @game/server run stack
npm --workspace @game/server run test:int
```

上述命令仅用于本地开发、调试和验证。

## 铁律

1. **`apps/client/src/lib/bitecs/` 的 12 个 TypeScript 文件禁改。**
   它们由 `npm run verify:ecs` 按字节校验。
2. **生成镜像禁手改。**
   - `apps/client/src/shared/` 来自 `apps/shared/src`。
   - `apps/Cocos/assets/src/` 来自 `apps/client/src`，包括随目录提交的 `.meta`。
   - 修改真源后使用 `sync:shared` / `sync:client`。
3. **相对导入不带扩展名**，以兼容 Cocos 编译链。
4. **shared 零依赖**：只使用 TypeScript 与 ES 标准库；禁 npm 包、Node API、`cc`、DOM
   及宿主环境全局对象；禁 `const enum`；lib 钉 ES2017。
5. 客户端只使用 `@colyseus/sdk`，不得 import 服务端 `colyseus` / `@colyseus/core`。
6. **消息名、协议类型、错误码和公式从 shared 导入**，不要手写或复制。
7. 双端 Colyseus 版本保持 major.minor 一致。
8. 服务端写路径继续遵守 [docs/SERVER.md](docs/SERVER.md) 的锁、fence、幂等、outbox、Redis
   与 MySQL 约束；新增常量、key、错误码先更新契约表和登记点。
9. **客户端 View/Logic 分离**：`view/` 负责引擎与 FGUI 绑定；`logic/` 禁止导入
   `cc` / `fairygui-cc`。
10. **FairyGUI 只走动态 import**：通过 `ViewMgr.open` 与 viewRegistry 打开，避免进入普通脚本
    的静态依赖图。
11. 网关 handler 不执行大规模同步计算；开发期预算和本地诊断规则见 SERVER 文档，重计算放到
    `core/compute/tasks/`。
12. **外部身份服务只走 HTTP 契约边界**：本仓不得依赖其业务源码、账号数据库或进程内替代实现。

## 标准开发动线

```text
shared 契约
  → npm run sync:shared
  → 服务端 websocket/http endpoint
  → 客户端 Logic + View + viewRegistry
  → npm run sync:client
  → 本地类型检查与测试
```

`net/`、dispatcher/loader 和 `Main.ts` 属于框架接缝，新增普通功能时优先通过登记点扩展。

外部身份契约变更时，本仓只更新精确锁定的契约依赖并运行
`npm run sync:webplatform-contract`；契约的生成、渠道身份实现和外部服务交付不属于本仓。

## 当前范围

- 当前玩法是 `ballMove` + 技能结算 Demo。
- 本地账号示例只使用外部服务提供的开发会话契约。
- 本仓是开发期基础框架，详细范围见根 [README.md](README.md#项目边界)。
