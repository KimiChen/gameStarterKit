# game 开发期 monorepo — AI 助手指令

> 本文件是 AI 助手与开发者的速查入口。改代码前按需阅读：
>
> - [docs/OVERVIEW.md](docs/OVERVIEW.md)：整体设计、单源契约与标准开发动线
> - [docs/SERVER.md](docs/SERVER.md)：服务端目录、RPC、数据一致性与开发约束
> - [docs/CLIENT.md](docs/CLIENT.md)：客户端目录、View/Logic、FGUI 与本地预览
> - [docs/UNIFLEX-UI.md](docs/UNIFLEX-UI.md)：实现 UniFlex 界面时必读（切图作者态、预览路由登记、AOT）
> - [docs/WEBPLATFORM.md](docs/WEBPLATFORM.md)：外部身份服务的开发契约边界
> - [docs/EXTRAS.md](docs/EXTRAS.md)：可选额外功能、现有实现与非承诺说明
> - [docs/undergroundIdle/README.md](docs/undergroundIdle/README.md)：未实现的玩法策划案与扩展草案
> - [docs/Non-intrusive.md](docs/Non-intrusive.md)：非侵入式框架改造方案（plugin 与实时 Room 玩法；框架侧阶段 0-9 已实施，阶段 10 的 snake 与阶段 11 的默认入口切换已落地、undergroundIdle 未实现；编辑器/真机待办见 EXTRAS §5.2）
> - [docs/PLUGIN.md](docs/PLUGIN.md)：插件机制设计基线（「插件只能消费不能定义」判据、构建期装载；§5 包格式与 `plugin -- pack/install/uninstall/check/test/changed` 命令、§6 宿主 placement 已实施，插件目录 `apps/plugins/<id>/`（§5.5，阶段 1：plugin.json / README / gameplay 单源都在插件目录内），首个真实插件样本 `apps/plugins/redeem` 见 [apps/plugins/redeem/README.md](apps/plugins/redeem/README.md)，开放项见 EXTRAS §5.2）
> - [docs/PLUGIN-REVIEW.md](docs/PLUGIN-REVIEW.md)：PLUGIN.md 的审阅记录（2026-09-05；经验证的问题清单与推荐实现方案，实施状态登记在 EXTRAS §5.2）
> - [docs/PLUGIN-REGISTRY.md](docs/PLUGIN-REGISTRY.md)：插件分享平台 plugin.gono.games 设计提案（2026-09-05；§1 机制余留问题清单与七条前置修复、§2-4 制品布局/自建服务/CLI/锁 source/plugin-api 门面；实施状态只在其 §7 回写，⛔ 不进 plan-v5）
> - [docs/KIT.md](docs/KIT.md)：kit（地基层）设计提案（2026-09-06；可分发但须 gono 团队审核；§2 划线、§3 kit.json、§4 kit-api 与 requires.kits、§6 审核线；实施状态只在其 §9 回写，⛔ 不进 plan-v5）
> - [docs/MMO.md](docs/MMO.md)：MMO 整合设计基线（2026-09-09；v1.1 / v1.2 2026-09-19：按 MMO-REVIEW M01–M20 修订、按 MMO-PLAN §7 细化与 D27 进程形态拍板（lobby / game / world 三进程，dev 缺省合体）；Nakama 定形、AzerothCore 定实；框架阶段 MF0–MF11（MF5 / MF7 各分 a / b：a = GameRoom 路径 / kit worker 通用半边，slg 2b 与 lvr 只等 a 半边）→ `mmo` kit MK0–MK4 → 内容插件 MG0–MG2；MF0 / MF1 / MF3 / MF6a / MF7a / MF9 / MF2 / MF5a / MF4 已于 2026-09-19 退出、MF5b / MF7b / MF6b / MF8 / MF10 / MF11 已于 2026-09-20 退出（波 1–6 全部退出 = 框架段完成，tag `mmo-framework-v1`；MF5a 退出 ⇒ slg 2b 可开工；`mmo` kit MK0 骨架已于 2026-09-20 退出（tag `mk0-exit`）、MK1 世界闭环 B1–B6 同日交付并于同日退出（tag `mk1-exit`；kill criterion 取 §11.2 v1 明示例外「热点互见 ≤ 50 人」，§12 MK1 行）、MK2 模拟闭环 B1–B3 已于 2026-09-20 退出（combat / ai / inventory 掉落半边三面，tag `mk2-exit`，§12 MK2 行）、MK3 资产闭环 B1–B3 同日交付（inventory 物品半边 / 角色保存定稿 / 长跑基准台）并于 2026-09-22 退出（24 h 长跑 stable，tag `mk3-exit`，§12 MK3 行）、MK4 编排与验收 B1–B6 已于 2026-09-22 退出（orchestration 面 / 贡献点装载 / 卸载・升级闸 / 说明书 / 容量证据 / 冻结，tag `mmo-kit-v1-frozen` 含 mmo.lock；场景 B 50 人整窗 tick p99 回归已拍板接受为 v1 已知回归、优化留 v1.x，§12 MK4 行）⇒ `mmo` kit v1 冻结、MK0–MK4 全部退出；MG0 内容插件样本 1 `mmodemo` 已于 2026-09-22 退出（B1–B3，§12 MG0 行；kit 反馈修复 0.1.26 后 tag 重打）；MG1 已于 2026-09-22 退出（B1 竖屏操作模型 + Creator 预览证据 `mmoWorld` 场景、kit 0.1.27 含 orchestration 面 v2 且 tag 重打；B2 可选域页面 `mmodemo.bossBoard`、mmodemo 0.2.0；§12 MG1 行），下一阶段 MG2；矩阵 `npm run verify:mmo-fixture-matrix`、kit 干净树链路 `npm run verify:kit-clean-install -- --kit mmo`）、§11.2 数字已冻结；实施状态只在其 §12 回写，⛔ 不进 plan-v5）
> - [docs/MMO-REVIEW.md](docs/MMO-REVIEW.md)：MMO.md 的开门审阅记录（2026-09-19；M01–M20 问题清单 + 阶段重排建议，已于同日全部采纳进 MMO.md v1.1，M01 取「草案不入库、正文自包含」；⛔ 审阅记录不是设计真源，结论以 MMO.md 为准）
> - [docs/MMO-PLAN.md](docs/MMO-PLAN.md)：MMO 实施施工单（2026-09-19；按 MMO.md v1.1 把 MF0–MF11 / MK0–MK4 / MG0–MG2 拆成 `MFx-Bn` 批次：文件落点、机检退出、命令；进程拆分为独立轨道 PS（PS0 四项已拍板 = MMO.md D27）；批次勾选只在其 §9，阶段级完成仍回写 MMO.md §12；⛔ 不是设计真源、不进 plan-v5）
> - [tools/creator-preview/README.md](tools/creator-preview/README.md)：Creator 预览证据生成器（CDP 驱动真实引擎预览重放登录 → 首屏 → 设置 → 插件入口，落盘截图 + report.json；⛔ 不进 verify:core）
> - [apps/plugins/snake/README.md](apps/plugins/snake/README.md)：Snake 玩法唯一文档（素材授权台账、冻结数值、拍板记录、真引擎缺陷台账）
> - [apps/kits/README.md](apps/kits/README.md)：kit 目录说明；首个样本 kit `arena` 见 [apps/kits/arena/README.md](apps/kits/arena/README.md)，建在其上的样本插件见 [apps/plugins/arenaShop/README.md](apps/plugins/arenaShop/README.md)
> - [apps/kits/slg/README.md](apps/kits/slg/README.md)：SLG 大地图机制样例（阶段 1 / 2a 已验收：worldmap/march 面、SQL 地块/行军与原创 1500×1500 地图页（三战标准图格数，225 万格）；2b 等 MMO MF5，离线 worker 等 MF7）；冻结规则与审阅见 [slg.md](slg.md)
> - [lvr.md](lvr.md)：用本框架 1:1 复刻 Last Voyage: Rising（4X SLG）的实施规划（2026-09-18；规划 v1 未开工，⛔ 未实施任何 LVR 能力；2026-09-19 前提表补首发平台 = 微信小游戏 / WebGL1（docs/3d.md SD10）。独立 `lvr` kit、SQL 权威 + 视图房、M0 两个 spike 是排期的门；实施状态只在其 §11 回写，⛔ 不进 plan-v5）
> - [lvr-3d.md](lvr-3d.md)：`lvr` kit 的 3D 场景管线需求（2026-09-18；需求 v1 未开工。2026-09-19 框架侧内容已提升为 docs/3d.md，同日 v1.1 按 Cyberpunk 校正为 lvr 消费方口径、v1.2 随 SD12 改 bundles 落点并加 HUD overlay、v1.3 新增 R0 登记 SD10 首发小游戏 / WebGL1 消费方；2026-09-22 v1.5 同步原始输入分流、蒙皮合批、资产引用与真机验收（R1–R8 消费框架件，只留内容 / shader / 特效 / 数值 / 授权台账；A0 并入 SC0，A1–A5 ← SC1–SC4）；lvr 接入状态只在其 §8 回写）
> - [docs/3d.md](docs/3d.md)：框架级 3D 舞台与资产管线设计提案（2026-09-19；v1.1 对照 Cocos Cyberpunk 校正，v1.2 / v1.3 审阅修订，2026-09-22 v1.5 补齐原始输入分流、蒙皮合批、同步 retainer、UUID 依赖、帧时 / 真机缓存验收（3D-13–3D-45、3D-47）；由 lvr-3d.md 审阅提升：Stage3D 相机 / 层位 / 场景全局租约、`AppPorts.stage3d`、AssetLease、`logic/scene3d` 纯数学（lodBands 落 shared）、EntityPool / SkinnedUnits / Vfx / quality 画质分档、cc 类型桩 3D 面、`verify:assets3d` 与 `tools/art3d`；阶段 SC0–SC5，消费方 lvr / mmo kit / slg 2b；SD9–SD12 已于 2026-09-19 拍板（mmo 世界视图 2D 首版 + 3D-ready、小游戏为首版目标且首发消费方 = lvr、引擎内置新管线、每包一个 bundle）；实施状态只在其 §10 回写，⛔ 不进 plan-v5）
> - [docs/3D-ASSETS.md](docs/3D-ASSETS.md)：3D 素材使用方式、规范与原则（2026-09-19 初稿、2026-09-22 规范 v1.5；补蒙皮骨骼贴图约束、UUID 依赖闭合与真机缓存验收；对照 Cocos Cyberpunk 官方演示实测：十条原则、对照表、目录与命名、模型 / 材质 / 贴图 / 光照 / 场景组织与 LOD / 动画 / 特效 / 物理 / 画质分档 / 加载释放 / 入库流程与 `verify:assets3d` 机检 / 授权（⛔ Cyberpunk 素材不得进仓）；数字候选 §15，SC0 后冻结）
> - [docs/3D-PLAN.md](docs/3D-PLAN.md)：3D 实施施工单（2026-09-19 初稿、2026-09-22 v1.5；含 3D-13–3D-45、3D-47 五轮审阅记录与 L01–L09，六项新增问题已落入施工与验收要求、未实施；SC0–SC5 拆成 `SCx-Bn` 批次：文件落点、机检退出、命令；消费方 lvr A0–A5 / mmo（SD9）/ slg 接法；批次勾选只在其 §8，阶段级完成仍回写 3d.md §10；⛔ 不是设计真源、不进 plan-v5）
> - [todo-godogen.md](todo-godogen.md)：未实现的外部项目对照吸收计划，不构成核心能力承诺
> - [docs/plan-v5.md](docs/plan-v5.md)：当前实施状态、验收基线与开放项去向的唯一真相（未实现开放项登记在 EXTRAS §5.2，有意保留边界在 §5.3）
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
npm run test:changed
npm run test:fgui
npm run test:vendor
npm run test:uniflex-ui-contract
npm run test:faults
npm run test:faults:int
npm run codegen:fgui -- <Pkg> <Comp>
npm run build:uniflex-ui
npm run import:uniflex-ui -- /path/to/project-package
npm run ui:import-psd -- --file artwork.psd --name Backpack --out .cache/psd/job-001
npm run ui:export-psd -- --url <url> --out <dir>
npm run ui:export-fgui -- --screen prompt --out .cache/fgui/prompt
npm run ui:export-fgui -- --screens prompt,small-popup,confirm --out .cache/fgui/popups
npm run ui:export-fgui -- --all --out .cache/fgui/catalog
npm run ui:preview-fgui -- --out .cache/fgui/prompt
npm run ui:verify-fgui-dom -- --out .cache/fgui/catalog
npm run ui:roundtrip -- --screen prompt --out .cache/psd/roundtrip-001
npm run ui:art-export -- --screen backpack
npm run ui:art-import -- --changed
npm run ui:art-sync
npm run ui:art-check
npm run ui:capture-cocos-golden
npm run ui:check-source
npm run ui:render-source
npm run ui:verify
npm run ui:approve-web
npm run check:uniflex-ui
npm run typecheck:uniflex-ui
npm run dev:uniflex-web
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
npm run verify:mmo-fixture-matrix
npm run verify:kit-clean-install -- --kit <id>
npm run verify:project
npm run verify:core
npm run verify:all
npm run fetch:fgui
npm run fetch:colyseus
npm run fetch:uniflex
npm run fetch:fairygui-dom
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

`test:changed` 是**内循环收窄跑法**：只有当整次改动都落在某些包的所有权推导集（+ 生成物/镜像）内，
才只跑那些包的测试 + 包机制测试 + 全部 `verify:*` 校验脚本 + typecheck / test:fgui / test:client；
只要有一条宿主路径就退回 `verify:all`。⚠ 判据是反的（⛔ 不是「插件目录变了就只跑插件」）——包测试直接
import 宿主，改宿主能把它们打红。⚠ 它是内循环便利，⛔ 不是审核闸：提交前与 CI 仍跑 `verify:all`。

`npm run typecheck` 的客户端阶段使用 `apps/client/tsconfig.test.json`，在 Node 侧最小 cc/FairyGUI 桩下
严格覆盖 `apps/client/src/**/*.ts`、`apps/client/test/**/*.ts`，包括 `Main.ts`、全部 View、装配件和测试。
`apps/client/tsconfig.json` 仍是 Creator 兼容 legacy 配置，使用本地 cc/FairyGUI 桩递归覆盖
`apps/client/src/**/*.ts`（含 Main、全部 View 与 gameplay）；`clientTypecheckConfig.test.ts` 守门文件集合，
防止新增目录静默逃逸。这不代表 CI 探针或 Creator 真实引擎验证的盲区。
仍必须结合 `npm run test:client`、`npm run test:fgui`、同步检查与 Creator 本地预览验证真实引擎和资源。

`fetch:colyseus`、`fetch:fgui` 和 `fetch:uniflex` 仍保留为框架维护团队显式升级锁定依赖时使用的工具，不是首次打开或普通开发步骤。这里的“手动更新”是维护团队人工决定版本、调整版本与完整性哈希、运行并审核脚本；脚本负责可重复的下载、校验和镜像更新。bitECS 没有自动更新命令；其 12 个锁定源文件和 `scripts/bitecs.sha256` 由维护团队按上游版本手动维护，并在更新后运行 `npm run verify:ecs`。普通开发者直接使用仓库已入库的版本。

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
     玩法单源的三个发现根——宿主自有 `apps/shared/schema/gameplays/<id>/`、插件自带
     `apps/plugins/<id>/gameplay/`（如 snake、tally）、kit 自带 `apps/kits/<kitId>/gameplays/<modeId>/`
     （manifest.json + state.json）——与各玩法手写的
     `apps/shared/src/gameplays/<id>/wire.ts`，用
     `npm --workspace @game/server run codegen:gameplays` 刷新。⚠ `gameplays/` 下的
     `defineGameplayWire.ts` 与 `<id>/wire.ts` 是手写真源（不是生成物），其余
     （catalog.generated.ts / index.ts / generated/）禁手改；服务端 `modes/catalog.ts` 是生成物的稳定
     façade（登记全集按 manifest.wireExposed 发现 `modes/<id>/index.ts`），⛔ 不再逐玩法手写。
   - `apps/shared/src/protocol/lobbyRpc/registry.generated.ts`、`apps/client/src/generated/`
     （views/fguiContracts/plugins）、`docs/plugins.generated.md` 与
     `apps/server/test/lobbyRpcVectors/index.generated.ts` 来自
     `apps/plugins/<id>/plugin.json` 与 `apps/kits/<id>/kit.json`（kit 另产出 `apps/shared/src/kits/catalog.generated.ts`、
     `apps/server/src/kits/catalog.generated.ts` 与每 kit 一份的 `apps/{shared,server,client}/src/kits/<id>/contributions.generated.ts`（MMO MF9 贡献点），见 docs/KIT.md）+ 宿主 placement `apps/plugins/host.json`（默认玩法与首屏入口顺序，
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

实现 UniFlex 切图页（不是 FGUI）时改走 [docs/UNIFLEX-UI.md](docs/UNIFLEX-UI.md)，不要套上面的 shared / codegen 动线。

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
- 用户已要求：以后每次改动后，按改动范围先以 `git pull --rebase` 同步，再 `git add` 和 `git commit`；`git push` 必须等用户明确确认后执行。需要的 PrivateKey 路径和 Passphrase 在 .env 文件中
- 当前工作区采用直线历史：同步使用普通 rebase，不使用保留合并节点的 `--rebase-merges`；分支集成先 rebase 到目标分支，再使用 `git merge --ff-only` 快进，避免新增合并提交。
- 仅在当前仓库设置 `pull.rebase=true`、`branch.new.rebase=true`、`rebase.rebaseMerges=false`，不修改全局 Git 配置。同步或重放前先保护已有未提交文件，禁止混入其他任务的改动。
- 整段历史重写后、首次发布完成前，若远端仍指向旧历史，暂停自动 pull/rebase；先核对迁移记录中的远端 SHA，经用户明确确认后以绑定该 SHA 的 `--force-with-lease` 仅更新目标分支，再恢复日常同步。原阶段标签与其他分支不随历史整理移动。
- 提交只包含本轮相关文件，不要把无关生成物混进去。
- 生成物和依赖目录应保持 ignored，写入.gitignore
- 提交信息明确，例如：
  - `修复：调整窗口标题栏布局`
  - `文档：添加代理指南`
  - `新增：更新工作区路径`
- git pull、git push 的 PrivateKey 和 Passphrase 在 .env 文件中
