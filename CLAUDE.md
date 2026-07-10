# game 微信小游戏 monorepo — 项目知识库

> 本文件供所有开发者（及 AI 助手）快速上手，记录不写进代码就会丢失的决策与踩坑。
> 目录结构与架构决策详见 [README.md](README.md)，客户端上手步骤见 [apps/client/README.md](apps/client/README.md)。

## 技术栈与版本（2026-07 定版）

- 客户端：Cocos Creator **3.8.8**（微信小游戏），Oops Framework 的 ECS 库（仅此一个模块）
- 服务端：Colyseus **0.17**（Node >= 22，tsx 直跑 TS，当前全部为模拟接口/假数据）
- 客户端网络 SDK：**@colyseus/sdk 0.17.43** 的 UMD 包（assets 内插件方式，全局 `Colyseus`）
- 双端共享：`apps/shared`（零依赖纯 TS）

## 常用命令

```bash
npm install                  # 根目录，安装 shared + server（client 不在 workspaces 内）
npm run dev:server           # 启动服务端 http://localhost:2568（端口见 server/.env.development）
npm run sync:shared          # 改完 apps/shared/src 后必须执行（同步到客户端 assets）
npm run typecheck            # shared + server 类型检查
npm run verify:ecs           # 校验 ECS 库 8 个文件与上游字节一致
npm --workspace @game/server run smoke   # 端到端冒烟测试（12 项，需服务端已启动）
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
- 第一次打开客户端工程的一次性步骤（colyseus.js 设为插件等）见 [apps/client/README.md](apps/client/README.md)。

## 服务端现状（全部为假数据，替换时逐个删掉 mock）

- HTTP mock：`src/mock/routes.ts`（login/profile/rank/health，内存态，重启即失）
- 房间 `game`：`src/rooms/GameRoom.ts`（移动积分 20fps、技能结算用 shared 共享公式、聊天、心跳）
- 冒烟测试 `test/smoke.ts` 覆盖以上全部链路，改服务端后先跑它
