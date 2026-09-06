# game 开发期 monorepo — AI 助手指令

> 本文件是 AI 助手与开发者的速查入口。改代码前按需阅读：
>
> - [docs/OVERVIEW.md](docs/OVERVIEW.md)：整体设计、单源契约与标准开发动线
> - [docs/SERVER.md](docs/SERVER.md)：服务端目录、RPC、数据一致性与开发约束
> - [docs/CLIENT.md](docs/CLIENT.md)：客户端目录、View/Logic、FGUI 与本地预览
> - [docs/WEBPLATFORM.md](docs/WEBPLATFORM.md)：外部身份服务的开发契约边界
> - [docs/EXTRAS.md](docs/EXTRAS.md)：可选额外功能、现有实现与非承诺说明
> - [docs/undergroundIdle/README.md](docs/undergroundIdle/README.md)：未实现的玩法策划案与扩展草案
> - [docs/Non-intrusive.md](docs/Non-intrusive.md)：非侵入式框架改造方案（plugin 与实时 Room 玩法；框架侧阶段 0-9 已实施，两玩法未实现，编辑器/真机待办见 plan-v5.md）
> - [docs/PLUGIN.md](docs/PLUGIN.md)：插件机制设计基线（「插件只能消费不能定义」判据、构建期装载；§5 包格式与 `plugin -- pack/install/uninstall/check` 命令、§6 宿主 placement 已实施，插件目录 `apps/plugins/<id>/`（§5.5，阶段 1：plugin.json / plugin.json / README / gameplay 单源都在插件目录内），首个真实插件样本 `apps/plugins/redeem` 见 [apps/plugins/redeem/README.md](apps/plugins/redeem/README.md)，开放项见 plan-v5 E 类）
> - [docs/PLUGIN-REVIEW.md](docs/PLUGIN-REVIEW.md)：PLUGIN.md 的审阅记录（2026-09-05；经验证的问题清单与推荐实现方案，实施状态登记在 plan-v5.md）
> - [docs/PLUGIN-REGISTRY.md](docs/PLUGIN-REGISTRY.md)：插件分享平台 plugin.gono.games 设计提案（2026-09-05；§1 机制余留问题清单与七条前置修复、§2-4 制品布局/自建服务/CLI/锁 source/plugin-api 门面；实施状态只在其 §7 回写，⛔ 不进 plan-v5）
> - [docs/KIT.md](docs/KIT.md)：kit（地基层）设计提案（2026-09-06；可分发但须 gono 团队审核；§2 划线、§3 kit.json、§4 kit-api 与 requires.kits、§6 审核线；实施状态只在其 §9 回写，⛔ 不进 plan-v5）
> - [tools/creator-preview/README.md](tools/creator-preview/README.md)：Creator 预览证据生成器（CDP 驱动真实引擎预览重放登录 → 首屏 → 设置 → 插件入口，落盘截图 + report.json；⛔ 不进 verify:core）
> - [apps/plugins/snake/README.md](apps/plugins/snake/README.md)：Snake 玩法唯一文档（素材授权台账、冻结数值、拍板记录、真引擎缺陷台账）
> - [todo-godogen.md](todo-godogen.md)：未实现的外部项目对照吸收计划，不构成核心能力承诺
> - [plan-v5.md](plan-v5.md)：当前开放问题、实施状态与验收证据的唯一真相
> - [plan-v4.md](plan-v4.md)：上一轮实施状态与验收证据的历史归档
> - [plan-v3.md](plan-v3.md)：更早的历史归档
> - [plan-v2.md](plan-v2.md)：更早的历史归档
>
> 多数源码目录另有就近 README，但尚未覆盖全部：`apps/shared`、`apps/server` 根、`apps/server/src/player/`
> 与 `core/` 下除 `compute/` 外的子目录目前没有；这些目录的约束分别见铁律 4/6 与
> [docs/SERVER.md](docs/SERVER.md)。根上手页见 [README.md](README.md)。

## 技术栈

- 客户端：Cocos Creator 3.8.8 + FairyGUI 1.2.2 + bitECS 0.4。
- 代码布局：`apps/client` 是纯 TypeScript 源码真相；`apps/Cocos` 是编辑器工程壳；
  `apps/Unity` 仅为研究占位。
- 服务端：Colyseus 0.17 + Node.js 22+ + TypeScript + 本地 Redis/MySQL。
- 外部身份示例：本仓只消费精确锁定的 `@gono/webplatform-contract`，不包含其业务源码。
- 客户端网络：`@colyseus/sdk` 0.17.43 UMD，是通用网络客户端库。
- 双端共享：`apps/shared`，零依赖纯 TypeScript。
- 涉及 Chrome 时优先连接已有的 `9222` 调试端口；仅在端口未开启时启动独立实例：

  ```bash
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir="$HOME/Desktop/chrome_profile"
  ```

- `9222` 只允许本机开发调试，不得暴露到生产或外部网络。


## 常用本地命令

```bash
npm install
npm run sync:webplatform-contract
npm run verify:webplatform-contract
npm run sync:shared
npm run sync:shared:watch
npm run sync:client
npm run sync:client:watch
npm run dev:client
npm run dev
npm run dev:server-only
npm run start:server
npm run init:project -- --project-id <id> --name <name> --display-name <text> --scope <scope|none> --brand <text>
npm run typecheck
npm run typecheck:client
npm run typecheck:client:legacy
npm run verify:sync
npm run test:client
npm run test:fgui
npm run test:vendor
npm run test:faults
npm run test:faults:int
npm run codegen:fgui -- <Pkg> <Comp>
npm run perf:client
npm run verify:ecs
npm run verify:vendor
npm run verify:fgui
npm run verify:protected-paths
npm run verify:inventory
npm run test:inventory
npm run test:launcher-matrix
npm run test:npm-reference-matrix
npm run test:aggregate-chain-matrix
npm run test:sync-mirror-matrix
npm run test:toolchain-runtime-matrix
npm run verify:perf
npm run verify:project
npm run verify:core
npm run verify:all
npm run fetch:fgui
npm run fetch:colyseus
npm run config:excel-to-json
npm run config:excel-to-json:check
npm --workspace @game/server run test
npm --workspace @game/server run smoke:framework
npm --workspace @game/server run smoke
npm --workspace @game/server run stack
npm --workspace @game/server run db:bootstrap
npm --workspace @game/server run test:int
```

上述命令仅用于本地开发、调试和验证。

`stack` 启动本地 Redis/MySQL，`db:bootstrap` 建库并执行 `sql/schema.sql`（幂等）；`smoke:framework` 只检查
已启动并初始化的本地 Redis/MySQL；`smoke` 还要求外部 WebPlatform Public/Internal 与游戏服已经运行，
额外的 GM kick 分支仅在显式配置 secret 时执行。

`npm run typecheck` 的客户端阶段使用 `apps/client/tsconfig.test.json`，在 Node 侧最小 cc/FairyGUI 桩下
严格覆盖 `apps/client/src/**/*.ts`、`apps/client/test/**/*.ts`，包括 `Main.ts`、全部 View、装配件和测试。
`apps/client/tsconfig.json` 仍是 Creator 兼容 legacy 配置，使用本地 cc/FairyGUI 桩递归覆盖
`apps/client/src/**/*.ts`（含 Main、全部 View 与 gameplay）；`clientTypecheckConfig.test.ts` 守门文件集合，
防止新增目录静默逃逸。这不代表 CI 探针或 Creator 真实引擎验证的盲区。
仍必须结合 `npm run test:client`、`npm run test:fgui`、同步检查与 Creator 本地预览验证真实引擎和资源。

`fetch:colyseus` 和 `fetch:fgui` 仍保留为框架维护团队显式升级锁定依赖时使用的工具，不是首次打开或普通开发步骤。这里的“手动更新”是维护团队人工决定版本、调整版本与完整性哈希、运行并审核脚本；脚本负责可重复的下载、校验和镜像更新。bitECS 没有自动更新命令；其 12 个锁定源文件和 `scripts/bitecs.sha256` 由维护团队按上游版本手动维护，并在更新后运行 `npm run verify:ecs`。普通开发者直接使用仓库已入库的版本。

## 铁律

1. **`apps/client/src/lib/bitecs/` 的 12 个 TypeScript 文件禁改。**
   它们由 `npm run verify:ecs` 按字节校验。
2. **生成镜像禁手改。**
   - `apps/shared/src/generated/webplatform/` 来自锁定的 `@gono/webplatform-contract`，用
     `sync:webplatform-contract` 刷新。
   - `apps/client/src/shared/` 来自 `apps/shared/src`。
   - `apps/Cocos/assets/src/` 来自 `apps/client/src`，包括随目录提交的 `.meta`。
   - 修改真源后使用 `sync:shared` / `sync:client`。
   - `apps/shared/src/gameplays/`、`apps/server/src/rooms/schema/GameRoomState.ts` 与
     `apps/server/src/rooms/schema/generated/`、`apps/client/src/gameplay/catalog.generated.ts`、
     `apps/server/src/rooms/modes/catalog.generated.ts` 来自
     `apps/shared/schema/gameplays/<id>/`（manifest.json + state.json）与各玩法手写的
     `apps/shared/src/gameplays/<id>/wire.ts`，用
     `npm --workspace @game/server run codegen:gameplays` 刷新。⚠ `gameplays/` 下的
     `defineGameplayWire.ts` 与 `<id>/wire.ts` 是手写真源（不是生成物），其余
     （catalog.generated.ts / index.ts / generated/）禁手改；服务端 `modes/catalog.ts` 是生成物的稳定
     façade（登记全集按 manifest.wireExposed 发现 `modes/<id>/index.ts`），⛔ 不再逐玩法手写。
   - `apps/shared/src/protocol/lobbyRpc/registry.generated.ts`、`apps/client/src/generated/`
     （views/fguiContracts/plugins）、`docs/plugins.generated.md` 与
     `apps/server/test/lobbyRpcVectors/index.generated.ts` 来自
     `apps/plugins/<id>/plugin.json` 与 `apps/kits/<id>/kit.json`（kit 另产出 `apps/shared/src/kits/catalog.generated.ts`、
     `apps/server/src/kits/catalog.generated.ts`，见 docs/KIT.md）+ 宿主 placement `apps/plugins/host.json`（默认玩法与首屏入口顺序，
     ⛔ plugin.json 无 slot/order）+ View 同目录 `.view.json` sidecar + FGUI XML + 各域
     RPC descriptor + 各域向量 sidecar `apps/server/test/lobbyRpcVectors/<域>.ts`，用
     `npm --workspace @game/server run codegen:plugins` 刷新。
     `lobbyRpc/index.ts`、`envelope.ts`、`push.ts`、客户端 `view/viewRegistry.ts`、
     `view/fguiContracts.ts`、`view/pages.ts` 是稳定 façade，普通 plugin 不手改
     （机检真源 `scripts/protected-paths.json`，随 `test:client` 无侵入矩阵校验）。
   - `apps/server/src/http/manifest.generated.ts` 来自 `apps/server/src/http/<domain>/<method>.ts`，
     用 `npm --workspace @game/server run codegen:http` 刷新。
   - `apps/shared/src/project.ts` 来自 `project.metadata.json`，用 `npm run init:project` 刷新。
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
12. **外部身份服务生产只走 HTTP 契约边界**：本仓不得依赖其业务源码、账号数据库或进程内替代实现。唯一例外是 `AUTH_PROVIDER=dev`（非生产缺省）：进程内开发身份提供者只为本地无外部服务开发，`AUTH_PROVIDER=dev` + `NODE_ENV=production` 启动期拒启。

## 标准开发动线

```text
shared 契约
  → npm --workspace @game/server run codegen:plugins / codegen:gameplays（改 Lobby RPC 域 descriptor
    / plugin 登记 / 玩法 manifest 时；生成物含 docs/plugins.generated.md 能力索引）
  → npm run sync:shared
  → node scripts/protocol-fingerprint.mjs --write（仅改动 protocol/ 时显式重钉；--check 只读比对，
    CI/审计用，⛔ 无隐式重钉形态）
  → 服务端 websocket/http endpoint
  → 客户端 Logic + View（.view.json sidecar）+ apps/plugins/<id>/plugin.json 登记
    （viewRegistry/fguiContracts/pages 是生成值的稳定 façade，⛔ 不手改）
  → npm run sync:client
  → 本地类型检查与测试
```

`net/`、dispatcher/loader 和 `Main.ts` 属于框架接缝，新增普通功能时优先通过登记点扩展。

外部身份契约变更时，本仓只更新精确锁定的契约依赖并运行
`npm run sync:webplatform-contract`；契约生成与外部服务交付不属于本仓。

## 当前范围

- 当前默认玩法是 `snake`（Snake Off 竖版贪吃蛇，drop-in 自由加入 + AI 填充 + 无尽个人 run，V2 无房级 deadline；
  实施状态见 [apps/plugins/snake/README.md](apps/plugins/snake/README.md)）；
  `ballMove` + 技能结算保留为可选入口与内部回归样例，`idle` 是最小第二 mode 证明。
- 本地账号示例只使用外部服务提供的开发会话契约。
- 本仓核心是开发期基础框架，详细范围见根 [README.md](README.md#项目边界)；仓库中的可选额外功能
  见 [docs/EXTRAS.md](docs/EXTRAS.md)，不构成核心能力承诺或项目约束。

## Git 约定

- 默认 git 是个私密 git，不会对外公开
- 用户已要求：以后每次改动后，按改动范围自己 先 `git pull`、`git add` 和 `git commit`，然后 `git push`，需要的 PrivateKey 路径 和 Passphrase 在 .env 文件中
- 提交只包含本轮相关文件，不要把无关生成物混进去。
- 生成物和依赖目录应保持 ignored，写入.gitignore
- 提交信息明确，例如：
  - `修复：调整窗口标题栏布局`
  - `文档：添加代理指南`
  - `新增：更新工作区路径`
- git pull、git push 的 PrivateKey 和 Passphrase 在 .env 文件中
