# game 微信小游戏 monorepo — AI 助手指令

> 本文件是 **AI 助手 / 开发者的速查指令**：铁律 + 常用命令 + 去哪找详情。
> 完整设计意图、目录导览、规则明细已收敛到三篇文档，改代码前按需读：
> - **[docs/OVERVIEW.md](docs/OVERVIEW.md)** —— 双端设计意图、单源契约、机检哲学、玩法概念去处
> - **[docs/SERVER.md](docs/SERVER.md)** —— 服务端目录/ws-RPC/outbox/冷档/广播/**61 条 `09·XX` 规则目录 + 07 契约表**
> - **[docs/CLIENT.md](docs/CLIENT.md)** —— 客户端目录/视图逻辑二分/viewRegistry/codegen/微信踩坑/首次打开
> 每个源码目录另有就近 README（`每个目录有 README` 约定）。根上手页见 [README.md](README.md)。

## 技术栈（2026-07 定版）

- 客户端：Cocos Creator **3.8.8**（微信小游戏）+ FairyGUI（fairygui-cc **1.2.2**）+ bitECS **0.4**（数据导向 ECS，字节锁）
- 布局：**引擎壳与游戏代码分离**（对标 sect）——`apps/client` 纯 TS 游戏代码（源码唯一真相）、
  `apps/Cocos` Creator 工程壳（`sync:client` 灌入 `assets/src`）、`apps/Unity` Unity 骨架
- 服务端：Colyseus **0.17**（Node ≥ 22，tsx 直跑 TS）+ 公司服务端框架（双 Redis + MySQL 8）
- 客户端网络：`@colyseus/sdk` 0.17.43 UMD 插件（全局 `Colyseus`）
- 双端共享：`apps/shared`（零依赖纯 TS，`npm run sync:shared` 复制进客户端）

## 常用命令

```bash
npm install                  # 装 shared + server（client/Cocos 不在 workspaces）
npm run fetch:fgui           # 升级 fairygui-cc 运行时（产物已入库,clone 即可用;升级后提交 diff）
npm run fetch:colyseus       # 升级 colyseus UMD 插件（产物已入库;同上）
npm run sync:shared          # 改完 apps/shared/src 后必须执行（→ apps/client/src/shared，并级联 sync:client）
npm run sync:client          # 改完 apps/client/src 后必须执行（→ apps/Cocos/assets/src）
npm run dev:client           # 双 watcher 常驻：shared→client→Cocos 保存即同步
npm run dev                  # 启动服务端 http://localhost:2568（tsx watch）
npm run typecheck            # 三端类型检查 + verify:sync（镜像新鲜度机检）
npm run verify:sync          # 只读校验两级镜像：漂移/孤儿/入库文件缺 .meta 即红
npm run test:fgui            # FairyGUI 结构契约 + 客户端无头单测
npm run codegen:fgui -- <Pkg> <Comp>   # 生成/幂等重写 view/XxxView.ts
npm run verify:ecs           # 校验 ECS 库（bitECS）12 文件字节锁定
npm --workspace @game/server run test        # 服务端单测
npm --workspace @game/server run smoke       # mock 冒烟（需 npm run dev 已起）
npm --workspace @game/server run stack       # 起本地 Redis×2 + MySQL
npm --workspace @game/server run test:int    # 集成测试（真实栈；跑前先停 npm run dev）
```

## 铁律（违反会出隐蔽问题，详见对应文档）

1. **`apps/client/src/lib/bitecs/` 12 个 .ts 禁改**（字节锁定，与上游偏差仅两处：各文件首行 ts-nocheck 注释 + Relation.ts 的 `./index` 自指导入改写，见 lib README；`verify:ecs`；基线 tag `0.4.0` commit `efacc63`）。
2. **`apps/client/src/shared/` 禁手改**——`sync:shared` 生成物；改 `apps/shared/src` 再同步。
   **`apps/Cocos/assets/src/` 整份禁手改**——`sync:client` 生成物，连 `.meta` 提交（uuid 稳定）。
   两级镜像由 `verify:sync` 机检（挂在 `typecheck` 尾部 + CI）：漂移/孤儿/入库文件缺 `.meta` 即红。
3. **相对导入不带扩展名**（Cocos 要求；服务端因此用 `moduleResolution: Bundler` + tsx，别改回 NodeNext）。
4. **shared 零依赖**：只用 TS 语言 + ES 标准库；禁 npm 包/Node API/cc/wx/DOM；禁 `const enum`；lib 钉 ES2017。
5. 客户端只用 `@colyseus/sdk`（全局 `Colyseus`），**禁 import 服务端包** `colyseus`/`@colyseus/core`。
6. **消息名/协议类型/公式一律 import 自 shared**，不手写不复制（Schema 字段增删同步改 `shared/protocol/state.ts` 镜像）。
7. 双端 Colyseus **版本 major.minor 一致**（当前 0.17.x）。
8. **服务端写路径对照 61 条规则**（[docs/SERVER.md §12](docs/SERVER.md#12-开发约束61-条规则目录)；代码注释 `09·XX` 即编号；⛔ 禁 HGETALL/INSERT IGNORE/ZINCRBY/无 fence 写档等）。新增常量/key/错误码先进 [§13 契约表](docs/SERVER.md#13-契约与配置redis-key--字段--错误码--常量) 再进 `core/infra/config.ts`/`keys.ts`（错误码另进 shared `RPC_ERR_CODES`）；登记点清单见 `apps/server/src/core/README.md`。
9. **客户端视图/逻辑二分**：视图 `view/`（依赖 cc/fairygui，只搬数据）、行为 `logic/`（⛔ 禁 import cc/fairygui，`logic-purity.test.ts` 机检）；FGUI 命名元素登记 `view/fguiContracts.ts`；跨包公司库在 viewRegistry `sharedPkgs` 声明。详见 [docs/CLIENT.md](docs/CLIENT.md)。
10. **FairyGUI 只走动态 import**（`ViewMgr.open`/`import("./view/XxxView")`）：fairygui 不进任何常规脚本的静态依赖图——扩展没挂时会连锁炸掉整个 root 脚本。
11. **网关进程禁重计算**（单线程：同步 CPU 卡一次 = 全服冻结）：handler 同步预算开发 20ms/生产 100ms（`[rpc-budget]` 探针告警）；全服/全会员/全榜级计算卸载到 `core/compute/tasks/`（worker 池）或独立进程；四类关键词：结算模拟/全量重算/批量发放/离线补算。详见 [docs/SERVER.md §11](docs/SERVER.md#11-事件循环防阻塞铁律-11)。

## 新功能标准动线

```
shared 契约 → npm run sync:shared → 服务端端点文件（websocket/http）→ 登记点（07/keys/config/错误码）
→ 客户端 view/XxxView.ts（codegen）+ logic/page/XxxLogic.ts + viewRegistry 登记（打开 = ViewMgr.open）
→ npm run sync:client（灌入 apps/Cocos/assets/src，Creator 侧验证）
```

net/、dispatcher/loader、Main.ts 永远不碰。分端细节见 docs/SERVER.md、docs/CLIENT.md。

## 现状

- 玩法是 demo（`ballMove` 小球移动 + 技能结算，纯 mock 可无栈跑）；服务端框架生产级（源自 Arthur M0–M9，
  **已停止回流、独立演进**）。Arthur 专属未移植件（M4 存量迁移、wxLogin 存量账号绑定）本项目 N/A。
- 验证基线（近期全绿）：typecheck 三端 + verify:sync / 服务端单测 15 / 客户端 test:fgui 59 / 集成测试 61 / mock 冒烟 13。
