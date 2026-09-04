# gameStarterKit

本项目正式名称为 gono，诠释为 Go Non-blocking。
是一套通过单源契约、确定性生成、精确运行时校验、非阻塞生命周期和可执行验证矩阵，让游戏功能能够安全前进、独立扩展、低冲突协作的 TypeScript 开发底座。

基于 **Cocos Creator 3.8.8 + Colyseus 0.17 + TypeScript** 的游戏开发期 monorepo 骨架。
仓库提供客户端、服务端和共享层的代码组织、契约同步、示例玩法、本地调试与本地测试基础。

账号与选服示例通过 HTTP 消费独立 `gono-webplatform` 的开发契约。本仓只使用精确锁定的
`@gono/webplatform-contract`，不包含该服务的业务源码。

深入说明见：

- [技术总览](docs/OVERVIEW.md)
- [项目初始化与元数据](docs/PROJECT.md)
- [客户端开发](docs/CLIENT.md)
- [服务端开发](docs/SERVER.md)
- [外部身份服务开发边界](docs/WEBPLATFORM.md)
- [额外功能说明](docs/EXTRAFEATURES.md)
- [《Underground Idle》玩法策划案（未实现）](docs/undergroundIdle/README.md)
- [非侵入式框架改造方案（框架侧阶段 0-9 已实施，两玩法未实现）](docs/Non-intrusive.md)
- [《Snake Off》首版策划与来源台账](docs/snakeoff/README.md)
- [Snake 竖版新版无尽 V2 与养成专项阶段任务（待实施）](docs/s/README.md)
- [Godogen 对照吸收计划（未实现的额外能力）](todo-godogen.md)
- [当前开发收口计划](plan-v5.md)
- [上一轮收口计划（历史归档）](plan-v4.md)

## 目录

```text
apps/
├── client/     纯 TypeScript 游戏代码，源码唯一真相
├── Cocos/      Cocos Creator 工程壳，代码由 sync:client 写入 assets/src
├── Unity/      Unity 方向的研究占位，不是可用客户端
├── server/     Colyseus 服务端开发工程
├── shared/     双端共享协议、公式与常量
└── art/        FairyGUI 编辑器工程
docs/           当前开发架构说明
scripts/        同步、校验、依赖抓取与协议指纹脚本，及其锁文件基线（bitecs/vendor/protocol/fgui）与保护路径规则（protected-paths.json）
tools/          FairyGUI codegen 与 Excel 配表转换工具
vendor/         精确锁定的外部身份契约 tarball（`@gono/webplatform-contract`，由 package.json 以 file: 引用）
```

`apps/client/src/shared/` 和 `apps/Cocos/assets/src/` 是生成镜像，不是源码入口。
WebPlatform 不属于本 monorepo；旧提交中的 `apps/WebPlatform` 仅用于历史追溯。

## 本地开发

安装与同步：

```bash
npm install
npm run sync:shared
```

从本 Starter 派生新项目时，先运行 `npm run init:project -- --help` 查看幂等初始化参数；项目身份、包名、
生成区和第三方来源统一登记在 [project.metadata.json](project.metadata.json)，不要在各端复制项目名常量。

Colyseus、FairyGUI 和 bitECS 的锁定版本及运行时文件已随仓库入库；首次打开或日常开发不需要执行依赖抓取命令。

启动服务端本地依赖与开发进程（一条命令）：

```bash
npm run dev
```

`npm run dev` 依次完成：本地栈（Redis 6401/6402 + MySQL 3316）→ 建库与 schema（幂等）
→ 连通性自检 → watch 模式服务端；任一阶段失败即停。栈与库已就绪、只想快速重启时用
`npm run dev:server-only` 跳过串链。

`npm run dev` 在非生产环境默认 `AUTH_PROVIDER=dev`：游戏服进程内提供开发登录与选服
（`/v1/sessions/dev`、`/v1/areas`，会话与角色登记落本地 Redis/MySQL），**无需另行启动
WebPlatform**。要联调真实外部身份服务时，另行启动与当前契约匹配的 `gono-webplatform`
本地开发服务并设 `AUTH_PROVIDER=webplatform`。默认开发约定通常为：

- Public HTTP：`http://127.0.0.1:2570`
- Internal HTTP：`http://127.0.0.1:2571`

客户端预览：

1. 用 Cocos Dashboard 3.8.8 打开 `apps/Cocos`。
2. 等待首次资源导入完成。
3. dev 动线下 `Main.portalUrl` 留空即可（自动跟随 PORT，portal 即游戏服自身）；
   联调外部服务时在场景 `Main` 组件中设置 WebPlatform Public origin。
4. 在编辑器中预览，使用开发会话进入 Lobby 和 Snake Off 示例房间（默认玩法；ballMove 为可选入口）。

这里的启动脚本、开发会话与调试页面只用于本地开发和代码验证。

## 常用开发命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 一条命令启动完整开发环境：本地栈（stack）→ 建库（db:bootstrap）→ 连通性自检（smoke:framework）→ watch 模式服务端 |
| `npm run dev:server-only` | 跳过串链只起 watch 模式服务端（栈与库已就绪时的快速重启逃生口） |
| `npm run start:server` | 非 watch 方式启动服务端，等价于 `@game/server` 的 `start` |
| `npm run dev:client` | 启动时先按锁定契约重生成 `apps/shared/src/generated/webplatform`、再全量同步一次 shared，然后常驻监听 shared/client 改动并同步到 Cocos 工程；需先 `npm install`（契约刷新读 `node_modules/@gono/webplatform-contract`，缺失则在起 watcher 前退出） |
| `npm run init:project -- <参数>` | 幂等写入项目身份元数据并同步生成投影；用 `--help` 查看必填身份参数和 dry-run 选项 |
| `npm run sync:webplatform-contract` | 刷新外部身份服务契约生成物并级联同步 |
| `npm run verify:webplatform-contract` | 本地校验契约版本、hash 与生成物 |
| `npm run sync:shared` | shared → client → Cocos |
| `npm run sync:client` | client → Cocos |
| `npm run sync:shared:watch` / `npm run sync:client:watch` | 单侧常驻 watcher；`dev:client` 是两者的组合入口 |
| `npm run typecheck` | 外部契约校验、shared/server/client 两套类型检查及镜像校验（含 ES2017 下限） |
| `npm run typecheck:client` | 客户端 Node 无头 strict 类型检查（完整 src/test，ES2022 桩） |
| `npm run typecheck:client:legacy` | 客户端 Creator 兼容 legacy 类型检查（ES2017 下限） |
| `npm run perf:client` | 在 Node 无头环境运行 ballMove ECS/快照分配/Graphics 命令性能基线（默认 100/500 entity）；用 `npm run --silent perf:client -- --json --output <file>` 保存纯 JSON 结果 |
| `npm run verify:project` | 校验项目元数据、生成区和第三方来源登记 |
| `npm run verify:sync` | 检查镜像漂移、孤儿，以及入库 `.meta` 的缺失、内容与 uuid 唯一性 |
| `npm run verify:vendor` | 校验锁定的第三方运行时内容、文件集合和本地契约 tarball 完整性 |
| `npm run verify:fgui` | 校验 FairyGUI 设计源、导出物和 View AUTO 区块 manifest |
| `npm run verify:inventory` | 校验能力清单、默认入口、文档和验证命令登记 |
| `npm run test:inventory` | 在临时 checkout fixture 中验证能力清单漂移会被拒绝 |
| `npm run test:launcher-matrix` | 逐条比对启动器判定与真实 bash/node 的行为，背离即失败 |
| `npm run test:npm-reference-matrix` | 逐条比对 npm 引用判定与真实 npm 的行为，背离即失败 |
| `npm run test:aggregate-chain-matrix` | 比对 verify-toolchain 的聚合链声明与真实 npm 执行序列 |
| `npm run test:sync-mirror-matrix` | 比对 sync --check 判定与真实同步对镜像树的效果 |
| `npm run test:toolchain-runtime-matrix` | 比对工具链声明与真实运行时 / 实际安装的依赖版本 |
| `npm run verify:perf` | 校验固定输入下的客户端性能基线结构和 checksum |
| `npm run test:client` | 客户端全部无头行为测试（Node/tsx） |
| `npm run test:vendor` | 运行第三方运行时内容锁专项反例测试 |
| `npm run test:fgui` | FGUI codegen、结构契约与 registry 专项测试 |
| `npm run test:faults` / `npm run test:faults:int` | 运行核心 fault-matrix；前者默认不连接本地栈，后者使用本地 Redis/MySQL |
| `npm run codegen:fgui -- <Pkg> <Comp>` | 生成或更新 View 的 AUTO 区块 |
| `npm run verify:ecs` | 校验锁定的 bitECS 文件 |
| `npm run fetch:fgui` / `npm run fetch:colyseus` | 维护团队显式升级锁定客户端依赖并重钉内容锁；普通开发不运行 |
| `npm run config:excel-to-json` / `npm run config:excel-to-json:check` | 写出 Excel 示例配表双端 JSON，或只读校验源表与入库生成物；均属额外功能 |
| `npm --workspace @game/server run test` | 服务端单元测试 |
| `npm --workspace @game/server run smoke:framework` | 已启动并初始化的本地 Redis/MySQL 连通性检查 |
| `npm --workspace @game/server run smoke` | 需要外部 WebPlatform 与运行中游戏服的完整开发链路冒烟；GM kick 分支可选 |
| `npm --workspace @game/server run test:int` | 使用本地 Redis/MySQL 的集成测试 |
| `npm run verify:core` | 校验工具链图、项目元数据、类型、bitECS/vendor/FGUI/inventory/perf，并运行专项与客户端测试 |
| `npm run verify:all` | `verify:core` 加服务端单元测试 |

客户端的无头 strict 探针由 `apps/client/tsconfig.test.json` 提供，覆盖 `apps/client/src/**/*.ts`、
`apps/client/test/**/*.ts`，包括 `Main.ts`、所有 View、`pages.ts` 和 ViewMgr；Node 侧使用最小
`cc`/FairyGUI 声明桩。`apps/client/tsconfig.json` 是 Creator 兼容的 legacy 配置，使用本地桩递归覆盖
全部 `src/**/*.ts`（含 Main/View/gameplay），并以 ES2017 lib 守住运行时下限；Creator 编辑器预览仍负责
真实引擎、资源导入和页面交互验证。`npm run typecheck:client` 会运行完整无头探针，
`npm run typecheck:client:legacy` 会检查完整客户端源码；根 `npm run typecheck` 会依次运行两者。
`npm run test:client` 运行全部客户端测试，`npm run test:fgui` 只运行
FGUI 专项测试。

同步脚本带大规模清理熔断：单轮需要清理的孤儿文件达到 20 个、或达到源文件数的 30% 时，`sync:shared` /
`sync:client` 会直接失败而不删除镜像（防切分支中间态连同入库 `.meta` 一起被删）；只读的 `verify:sync` 不受此闸影响。
确认无误后用环境变量放行：`SYNC_FORCE=1 npm run sync:shared`。不要用 `-- --force`：npm 会把它追加到复合命令末尾，
只到得了链条里最后一个脚本。放行会连同入库的 `.meta` 一起删除，Creator 重开将重铸 uuid。

`npm run config:excel-to-json` 与 `npm run config:excel-to-json:check` 是 Excel 配表转换与生成物新鲜度校验，属额外功能，
见 [额外功能与参考实现](docs/EXTRAFEATURES.md#38-配表负载与-unity-实验) 与 [配表工具 README](tools/excel-config/README.md)。

### 框架维护团队的依赖更新

`npm run fetch:colyseus` 和 `npm run fetch:fgui` 仍保留为框架维护团队在需要显式升级锁定依赖时使用的工具，不属于首次打开或普通开发流程。这里的“维护团队手动更新”是人工决定版本、修改版本与完整性哈希、运行并审核脚本；脚本负责把下载、完整性校验和运行时镜像更新固化为可重复步骤。完成后应按维护流程复核同步结果并运行相关测试。

bitECS 没有自动抓取命令。其 `apps/client/src/lib/bitecs/` 下的 12 个锁定源文件由框架维护团队按上游版本手动更新，同时更新 `scripts/bitecs.sha256`，保留项目兼容性补丁并运行 `npm run verify:ecs`。普通开发者直接使用仓库已入库的依赖，并通过 `verify:ecs` 检查文件完整性。

## 开发红线

1. **不要手改生成区**：
   - `apps/shared/src/generated/webplatform` 由 `npm run sync:webplatform-contract` 从锁定契约包生成。
   - 改 `apps/shared/src` 后运行 `npm run sync:shared`。
   - 改 `apps/client/src` 后运行 `npm run sync:client`。
   - `apps/Cocos/assets/src` 整体由同步脚本生成。
2. **不要修改锁定的 bitECS 源码**：`apps/client/src/lib/bitecs/` 的 12 个 TypeScript 文件由
   `npm run verify:ecs` 校验。
3. **协议、消息名、错误码和公式从 shared 导入**，不要在两端复制。
4. **相对导入不带扩展名**，以兼容 Cocos 编译链。
5. **shared 保持零依赖**：不得使用 npm 包、Node API、DOM 或渠道平台全局对象。
6. **View 与 Logic 分离**：`logic/` 不导入 `cc` 或 `fairygui-cc`；View 只负责绑定和数据搬运。
7. **FairyGUI 只通过动态 import 进入 View 打开链**，避免进入普通脚本的静态依赖图。
8. **外部身份服务只走契约化 HTTP 边界**，本仓不得重新导入其业务源码或账号数据库实现。

新功能的推荐开发顺序：

```text
shared 契约
  → npm --workspace @game/server run codegen:features / codegen:gameplays（改 RPC 域 descriptor /
    feature 登记 / 玩法 manifest 时）
  → npm run sync:shared
  → node scripts/protocol-fingerprint.mjs --write（仅改动 protocol/ 时；--check 只读比对）
  → 服务端 endpoint
  → 客户端 Logic + View（.view.json sidecar）+ features/<id>/feature.json 登记
    （viewRegistry/fguiContracts/pages 是生成值的稳定 façade，不手改）
  → npm run sync:client
  → 本地类型检查与测试
```

## 技术栈

- 客户端：Cocos Creator 3.8.8、FairyGUI 1.2.2、bitECS 0.4。
- 服务端：Colyseus 0.17、Node.js 22+、TypeScript、Redis、MySQL 8。
- 客户端网络：`@colyseus/sdk` 0.17.43 UMD，是通用网络客户端库。
- 共享层：`apps/shared`，零依赖纯 TypeScript。

## 项目边界

本仓库定位为游戏项目的**开发期基础框架**，主要提供客户端、服务端和共享代码的工程骨架，以及
本地开发、调试与验证所需的示例实现。

仓库还可能包含部署运行、商业化、渠道接入和发行运营等额外功能或参考实现。它们不属于核心框架的能力、
稳定性或长期维护承诺，也不作为项目架构和后续演进的强制约束；是否采用及如何完善由实际项目决定。
具体分类、当前实现和使用原则见 [额外功能与参考实现](docs/EXTRAFEATURES.md)。

仓库中的本地启动脚本、调试页面、开发会话、测试命令，以及 `@colyseus/sdk`、FairyGUI、bitECS
等通用技术依赖，仍属于核心框架的本地开发和验证基础。
