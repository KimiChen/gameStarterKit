# gameStarterKit

微信小游戏 monorepo 骨架：**Cocos Creator 3.8.8 客户端 + Colyseus 0.17 服务端 + 零依赖双端共享层**。
一套仓库同时给客户端、服务端、共享协议提供类型安全的开发流水线。

> 这是「程序员必读」的最短上手页。设计意图与深入细节见 [`docs/`](docs/) 三篇：
> [技术总览](docs/OVERVIEW.md) · [客户端](docs/CLIENT.md) · [服务端](docs/SERVER.md)。

---

## 目录一览

```
apps/
├── client/     Cocos Creator 工程（不在 npm workspaces；代码在 assets/src/）
├── server/     Colyseus 0.17 服务端（tsx 直跑 TS）
├── shared/     双端共享层（零依赖纯 TS：协议/公式/常量）—— sync 到客户端
└── art/        FairyGUI 编辑器工程（设计师产 UI 包）
docs/           技术总览 / 客户端 / 服务端 三篇
tools/          codegen / excel 导表 / 体积报告等
```

---

## 30 秒跑起来（纯 mock，不需要数据库）

```bash
npm install            # 安装 shared + server 依赖（client 不在 workspaces）
npm run sync:shared    # 把 apps/shared/src 同步进客户端 assets（首次必跑）
npm run dev:server     # 启动服务端 http://localhost:2568
```

然后打开客户端预览：

1. 用 **Cocos Dashboard 3.8.8** 打开 **`apps/client`** 目录，等首次导入完成；
2. 编辑器里点 **预览** —— 控制台应输出 mock 登录成功 + 进房日志，**按住屏幕可拖动小圆点**。

服务端起来后还带三个网页入口：`/` Playground 调试台、`/monitor` 房间监控、`/mock/*` HTTP 假数据接口。

> 首次打开客户端还有几步一次性配置（fairygui 运行时、colyseus 插件、场景挂 Main）——
> 见 [docs/CLIENT.md · 首次打开](docs/CLIENT.md#首次打开一次性配置)。服务端跑真实玩法链路（登录/排行/工会/充值）
> 需本地 Redis + MySQL，见 [docs/SERVER.md · 本地开发栈](docs/SERVER.md#本地开发栈)。

---

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev:server` | 启动服务端（tsx watch，热重载，端口 2568） |
| `npm run sync:shared` | 改完 `apps/shared/src` 后**必须**执行（同步到客户端；生成物入库） |
| `npm run typecheck` | 三端类型检查（shared + server + client） |
| `npm run test:fgui` | FairyGUI 结构契约 + 客户端无头单测 |
| `npm run codegen:fgui -- <Pkg> <Comp>` | 从 FairyGUI 组件生成/幂等重写 `view/XxxView.ts` |
| `npm run report:size` | 微信构建体积报告（4MB 主包水位） |
| `npm run verify:ecs` | 校验 ECS 库 8 个文件与上游字节一致 |
| `npm --workspace @game/server run test` | 服务端单测 |
| `npm --workspace @game/server run smoke` | mock 链路冒烟（需 dev:server 已启动） |
| `npm --workspace @game/server run stack` | 起本地 Redis×2 + MySQL（真实玩法链路用） |
| `npm --workspace @game/server run test:int` | 集成测试（真实 Redis+MySQL；**跑前先停 dev:server**） |

---

## 三条最容易踩的红线（详见各文档）

1. **`apps/client/assets/src/shared/` 与 `lib/ecs/` 是生成物/字节锁区，禁手改**——改共享代码去
   `apps/shared/src` 再 `npm run sync:shared`；ECS 库要与上游逐字节一致。
2. **消息名/协议类型/公式一律 `import` 自 shared**，不手写字符串、不复制公式（双端单源）。
3. **相对导入不带扩展名**（Cocos 编译器要求）——全仓统一，别"顺手"加 `.ts`/`.js`。

新功能标准动线、目录职责、服务端写路径铁律（`09·XX`）、FairyGUI 工作流等，分别见
[技术总览](docs/OVERVIEW.md) / [客户端](docs/CLIENT.md) / [服务端](docs/SERVER.md)。

---

## 技术栈定版（2026-07）

- 客户端：Cocos Creator **3.8.8**（微信小游戏）+ FairyGUI（fairygui-cc 1.2.2）+ Oops ECS 库（字节锁）
- 服务端：Colyseus **0.17**（Node ≥ 22，tsx 直跑 TS）+ 公司服务端框架（双 Redis + MySQL 8）
- 客户端网络：`@colyseus/sdk` 0.17.43 UMD 插件（全局 `Colyseus`）
- 共享层：`apps/shared`（零依赖纯 TS，`npm run sync:shared` 复制进客户端）
