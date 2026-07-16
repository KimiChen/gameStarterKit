# game 微信小游戏 monorepo — 项目知识库

> 本文件供所有开发者（及 AI 助手）快速上手，记录不写进代码就会丢失的决策与踩坑。
> 目录结构与架构决策详见 [README.md](README.md)，客户端上手步骤见 [apps/client/README.md](apps/client/README.md)。

## 技术栈与版本（2026-07 定版）

- 客户端：Cocos Creator **3.8.8**（微信小游戏），Oops Framework 的 ECS 库（仅此一个模块）
- 客户端 UI：**FairyGUI**（fairygui-cc 1.2.x，Creator 扩展方式挂载 `db://fairygui-cc/fairygui.mjs`）；
  公司标准组件库 Original(+A) 在 `apps/art/fairygui`（FairyGUI 编辑器工程）
- 服务端：Colyseus **0.17**（Node >= 22，tsx 直跑 TS）+ 公司服务端框架
  （双 Redis + MySQL 8；玩法接口仍有 mock 共存，见 docs/server/）
- 客户端网络 SDK：**@colyseus/sdk 0.17.43** 的 UMD 包（assets 内插件方式，全局 `Colyseus`）
- 双端共享：`apps/shared`（零依赖纯 TS）

## 常用命令

```bash
npm install                  # 根目录，安装 shared + server（client 不在 workspaces 内）
npm run dev:server           # 启动服务端 http://localhost:2568（端口见 server/.env.development）
npm run sync:shared          # 改完 apps/shared/src 后必须执行（同步到客户端 assets）
npm run typecheck            # shared + server 类型检查
npm run verify:ecs           # 校验 ECS 库 8 个文件与上游字节一致
npm run fetch:fgui           # 拉取 fairygui-cc 运行时（每台机一次；扩展外壳入库、运行时不入库）
npm run test:fgui            # FairyGUI 结构契约 + presenter 无头测试
npm --workspace @game/server run smoke   # mock 链路冒烟（12 项，需服务端已启动）
# —— 服务端框架（需本地栈）——
npm --workspace @game/server run stack           # 起 redis-durable(6401)+redis-cache(6402)+MySQL(3316)
npm --workspace @game/server run db:bootstrap    # 建 game 库 + 全量 DDL + 预置行
npm --workspace @game/server run smoke:framework # 框架连通性冒烟（M1）
npm --workspace @game/server run test            # 单测
npm --workspace @game/server run test:int        # 集成测试（真实 Redis+MySQL，零 mock）
```

## 铁律（违反会出隐蔽问题）

1. **`apps/client/assets/script/lib/ecs/` 的 8 个 .ts 禁止修改**（要求与上游字节一致）。
   升级流程：从 dgflash/oops-plugin-framework 整体替换 → 更新 `scripts/ecs.sha256` 和该目录 README 的 commit/哈希。当前基线：commit `46bcb58`。
2. **`apps/client/assets/script/shared/` 禁止手改** —— 它是 `sync:shared` 的生成物。改共享代码一律去 `apps/shared/src`，改完重新同步。生成物连同 `.meta` 一起提交。
3. **全仓库相对导入一律不带扩展名**（Cocos 编译器要求 .ts 导入省略后缀）。服务端因此用 `moduleResolution: Bundler` + tsx，而不是 Colyseus 官方模板的 NodeNext——不要"顺手"改回去。
4. **shared 包零依赖**：只用 TS 语言与 ES 标准库；禁止 npm 包 / Node API / cc / wx / DOM；禁止 `const enum`（Cocos 按 isolatedModules 单文件转译）；lib 钉在 ES2017（客户端下限）。
5. **客户端只能用 `@colyseus/sdk`（全局 `Colyseus`），禁止 import 服务端包** `colyseus`/`@colyseus/core`（内含 ws 等 Node 依赖，小游戏构建必炸）。
6. **消息名/协议类型/公式一律 import 自 shared**，不允许手写字符串或复制公式。服务端 Schema 字段增删时，必须同步改 `shared/src/protocol/state.ts` 的镜像接口。
7. **双端 Colyseus 版本 major.minor 必须一致**（当前 0.17.x）。升级 SDK：`curl -L https://unpkg.com/@colyseus/sdk@<版本>/dist/colyseus.js -o apps/client/assets/script/lib/colyseus/colyseus.js`，同时升服务端依赖。
8. **服务端框架写路径必须对照 `docs/server/09-dev-constraints.md` 的规则写**（⛔ 禁 HGETALL/INSERT IGNORE/ZINCRBY/无 fence 写档等，代码注释里的 `09·XX` 即规则编号）。新增常量/key/错误码先进 07 再进 `infra/config.ts`/`infra/keys.ts`，禁止散落。
9. **FairyGUI 三层模型**：绑定层（`game/ui/fgui/`，依赖 fairygui-cc，Creator 侧验证）只做「取组件+搬数据」；行为归纯 presenter（无头单测）；代码依赖的命名元素必须登记进 `fguiContracts.ts`（`npm run test:fgui` 对设计师 XML 把关）。跨包用公司库组件前先 `FguiView.ensurePackages(["ui/Original"])`；共享库包全程常驻、⛔ 不许 removePackage。
10. **FairyGUI 入口只走动态 import**（桥模式：业务层只调注入回调，`import("…/fgui/XxxView")` 只关进回调体内）：fairygui 不得进任何常规脚本的静态依赖图——扩展没挂时会连锁炸掉整个 root 脚本。

## Colyseus 0.17 与旧资料的差异（网上教程大多是 0.16 的，别照抄）

- 服务端入口是 `defineServer({ rooms, express })` + `defineRoom(RoomClass)`；
  `initializeGameServer`/`initializeExpress`/`gameServer.define()` 是 0.16 API，已废弃
- Room 状态用类属性 `state = new MyState()`（不再是 `Room<State>` 泛型 + `setState`）；创建后禁止整体重赋值
- 消息处理用 `messages = { [C2S.Xxx]: (client, msg) => {} }` 属性
- `onLeave(client, code)` 第二参是数字关闭码（不是 0.16 的 consented 布尔），用 `code === CloseCode.CONSENTED` 判断
- 客户端包已从 colyseus.js 更名为 `@colyseus/sdk`（colyseus.js 止步 0.16.22，仓库已归档，与 0.17 服务端不兼容）
- schema v4 仍用传统 `@type` 装饰器：服务端 tsconfig 必须 `experimentalDecorators: true` 且
  **`useDefineForClassFields: false`**（否则装饰字段静默失效，状态不同步且无报错）

## 微信小游戏踩坑实录（均已实机验证并修复，改动前先读这段）

兼容补丁集中在 `apps/client/assets/script/net/wechat-compat.ts`（上游依据 colyseus/colyseus#945）：

1. **SDK 在插件求值阶段就捕获了 `globalThis.WebSocket`**（插件脚本先于一切项目脚本执行），
   事后替换全局 WebSocket 对 SDK 无效。构造签名修复必须打在 **`wx.connectSocket` 层**
   （清洗 protocols，否则 SDK 的 Node 签名 options 对象会被适配层当子协议传给 wx，握手静默失败）。
2. **微信开发者工具把全局 `WebSocket` 设为只读**，严格模式下直接赋值抛 TypeError 并炸掉整个启动。
   所有全局写入必须走 `setGlobal()` 容错，且关键补丁（send 原型转换）要排在可能失败的操作之前。
3. 微信环境缺 fetch/Headers/URL/URLSearchParams/TextEncoder/Blob，补丁已提供；
   **不要用 npm 的 url-polyfill**（依赖 DOM，小游戏里报 `a.checkValidity is not a function`）。
4. `WebSocket.prototype.send` 补丁里的 `data.slice().buffer` 的 `slice()` 不能省——
   Uint8Array 可能是带 byteOffset 的视图，直接取 `.buffer` 会发错数据。
5. 开发者工具报 `webapi_getwxaasyncsecinfo:fail -80002`（SystemError/WAGame.js）是**工具自身噪音**
   （测试 appid 导致的后台查询失败），与游戏代码无关，忽略即可。
6. 连 localhost 需关闭开发者工具的合法域名校验。该开关存在**构建产物**的
   `project.private.config.json` 里，重新构建会被重置——已用 Cocos 构建模板固化：
   `apps/client/build-templates/wechatgame/project.private.config.json`（urlCheck: false）
   每次构建自动拷入。真机要求 wss/https 且域名过白名单。

## 已知环境注意事项

- 开发端口固定 **2568**（`apps/server/.env.development`）：Colyseus 默认端口 2567 在部分开发机上被其他常驻服务占用。改端口时需同步：`.env.development`、场景里 Main 组件的 `serverUrl` 属性（**注意：@property 值序列化在 scene 文件里，改脚本默认值不影响已有场景节点**）、smoke.ts 默认地址。
- Cocos 的 `new Node()` 默认在 DEFAULT layer 且**不继承父节点 layer**，UI 相机（UI_2D）会剔除它——程序化创建的渲染节点必须手动设 `node.layer`，否则画面空白但无任何报错。
- ECS 的组/系统注册是模块级全局状态：RootSystem/系统实例要用单例（见 `GameECS.inst`），场景重载时重复 new 会累积泄漏 group 回调。
- 第一次打开客户端工程的一次性步骤（colyseus.js 设为插件、fetch:fgui、启用 fairygui-cc 扩展等）见 [apps/client/README.md](apps/client/README.md)。
- 本地栈脚本 `apps/server/tools/dev-stack.sh` 依赖 brew 的 `redis` 与 `mysql@8.4`；数据目录 `~/.game-dev`（`GAME_DEV_DATA` 可改）。端口 6401/6402/3316 与 Arthur 项目约定一致，两项目可共用同一套本地实例（库名不同：`game` vs `fable5`）。
- **跑 `test:int` 前先停 dev server**：settlement/gateway 集成测会 `boot(server)` 真实监听 2568，dev server 占着端口会 EADDRINUSE 且整个 test runner 卡住不退出。另外 `npm run dev:server` 是 tsx watch——只 kill 监听进程会被 watch 父进程拉活，要 kill 整棵 tsx watch 进程树。
- FairyGUI 编辑器工程 `apps/art/fairygui` 的 `.objs/` 是编辑器缓存（已 gitignore）；FGUI 只扫 `assets/` 直接子目录，公司库 Original 因此平铺在包级。
- **设计分辨率 750×1624 竖屏 + FIXED_WIDTH**（宽恒铺满、高随机型浮动 ≈1334~1730，全机型无黑边；Arthur 分辨率 P0/P1 拍板）。真源 `apps/client/assets/script/designSpec.ts`，与 `settings/v2/packages/project.json` 的 designResolution（fitWidth=true 烘焙值）、Main.ts 的 `setDesignResolutionSize` **三处必须一致**；⛔ 视图层禁写 640/1386、960×640 等旧稿魔法数。全屏 FGUI 页用 `FguiView.mountFullScreen()`（高浮动由 relation 吸收），贴顶 HUD 摆放加 `FguiView.safeTopInset()`。引入旧稿坐标系的 FGUI 包源时先迁 750 系再发布 bin（FGUI 编辑器等比迁移，参照 Arthur 668efaa ×75/64）。

## 服务端现状（框架真实 + 玩法 mock 共存，替换时逐个删掉 mock）

**公司框架（真实实现，同步自 Arthur M0–M9，规则文档 docs/server/01-10）：**
- `src/infra`：双 Redis 桶路由 / MySQL 池（⚠ 已关 CLIENT_FOUND_ROWS，恢复 changed 语义）/ Lua 注册
- `src/core`：withUserLock 两层锁 + fence、UnitOfWork、幂等占位；`src/gameplay/userStore`：档读路径（⛔ HGETALL）
- `src/auth` + `POST /account/wx-login`（routes/index.ts）：wx 登录、不透明 token、token_epoch 撤销
- `src/gateway`：LobbyRoom（房间 `lobby`）+ dispatcher 中间件链（鉴权→限流→zod→幂等）+ 邮件/唤醒推送。
  **ws-RPC 端点契约化**：每接口一文件 `gateway/handlers/<域>/<接口>.ts`（`defineRpc` 包装，gateway/rpc.ts），
  由 `handlers/loader.ts` 启动扫描注册——路由名必须 = `<域>.<文件名>` 且与 shared `ALL_LOBBY_RPC_TYPES`
  集合相等，否则拒绝启动（契约测试 test/lobby-rpc-contract.test.ts 在 CI 先兜住）。
  **新增接口三步**：① shared `protocol/lobbyRpc/<域>.ts` 加路由名 + Req/Res + Map 条目 → ② `npm run
  sync:shared` → ③ 建端点文件；⛔ 不改 dispatcher/LobbyRoom（框架件另有 ErrCode ⇔ RPC_ERR_CODES
  编译期互检，见 gateway/rpc.ts）。客户端走 `net/LobbyClient.ts`（rpc/rpcIdem/onPush，类型自 shared 推导；
  写接口一律 rpcIdem——clientReqId 生成一次、重试复用）
- `src/economy`：三阶段 outbox / 充值状态机 / relayer 单例；`src/rank`：ZSET 榜 + 赛季轮换；`src/archive`：冷档 freeze/thaw
- `src/gameplay/matchConsumer` + GameRoom 收局：M8a 证据链（一局一条 XADD → 幂等闸落库）；
  GameRoom 带框架 token 才绑账号，mock token/游客全程不碰 Redis
- 未移植的 Arthur 专属件：M4 存量迁移 ETL（tools/migrate）与 wxLogin 的存量账号绑定协议
  ——本项目无旧账号体系；需要时参考 Arthur 仓库
- 集成测试 `test/int/`（55 项，真实 Redis+MySQL 含故障注入）；改框架先跑
  `npm --workspace @game/server run test && npm --workspace @game/server run test:int`

**mock（内存假数据，重启即失，不依赖本地栈）：**
- HTTP mock：`src/mock/routes.ts`（login/profile/rank/health）
- 房间 `game` 玩法：移动积分 20fps、技能结算用 shared 共享公式、聊天、心跳
- 冒烟测试 `test/smoke.ts` 覆盖 mock 全链路（12 项），改服务端后先跑它
