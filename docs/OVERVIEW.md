# 技术总览

本项目的整体设计意图——把客户端、服务端、共享层放在一起看，说清「为什么这样搭」。
分端细节见 [CLIENT.md](CLIENT.md) 与 [SERVER.md](SERVER.md)；最短上手见根 [README.md](../README.md)。

---

## 1. 一句话定位

一个可以直接 fork 的**微信小游戏全栈骨架**：Cocos Creator 3.8.8 客户端 + Colyseus 0.17 服务端 +
零依赖双端共享层。骨架自带一套「类型安全 + 机检守门」的开发流水线——协议、公式、错误码单源，
新增功能有固定动线，约定尽量用机器（测试/启动校验/类型系统）而不是口头纪律来保证。

当前玩法是 **demo**（小球移动 + 技能结算），服务端框架是**生产级**（源自公司 Arthur 项目 M0–M9，
已停止回流、独立演进）。fork 后把 demo 换成真实玩法即可。

---

## 2. 五包（引擎壳与游戏代码分离，对标 sect）

| 包 | 是什么 | 运行/构建方式 |
|---|---|---|
| `apps/shared` | 双端共享层：协议类型、纯公式、常量 | **零依赖纯 TS**；`npm run sync:shared` 复制进客户端 |
| `apps/server` | Colyseus 0.17 服务端 | tsx 直跑 TS（Node ≥ 22），workspace 直接依赖 shared 源码 |
| `apps/client` | 纯 TS 游戏代码工程（源码唯一真相；logic/shared/bitecs 引擎无关，view/Main/net 绑 cc·fairygui·wx·Colyseus） | `npm run sync:client` 灌入 `apps/Cocos`；无头 typecheck/单测 |
| `apps/Cocos` | Cocos Creator 3.8.8 工程壳 | 编辑器构建；**不在 npm workspaces**（Cocos 要自己的目录结构） |
| `apps/Unity` | Unity 工程（骨架） | 待建，规划走 pyts 类路线消费 `apps/client` 的引擎无关子集 |
| `apps/art/fairygui` | FairyGUI 编辑器工程 | 设计师产 UI 包，发布 `.bin` 到 `Cocos/assets/resources/ui` |

**为什么共享代码用「复制同步」而不是 npm 包 / 符号链接 / import map：** 符号链接有 Cocos 编辑器
确认的资源刷新 bug、且会把 `.meta` 写进共享源码目录；import map 是实验特性，对 assets 外目标和
小游戏构建行为未文档化。复制同步后是普通项目脚本，**任何平台构建 100% 兼容**。服务端则通过
workspace 直接吃 `@game/shared` 源码，无需复制。

---

## 3. 贯穿全项目的设计原则

### 3.1 单一真源 + 双端契约

**消息名、协议类型、玩法公式、错误码，全部在 shared 定义一次，两端 import 使用。**⛔ 不手写协议
字符串、不复制公式。这是「铁律 6」的核心，避免的是双端协议悄悄漂移。

- **ws-RPC 契约**：`shared/protocol/lobbyRpc/`——路由名（`as const` 表）+ 每接口 Req/Res 接口 +
  计算键 Map（名字与类型物理绑定）。信封 `IRpcEnvelope`/`IRpcReply`、错误码 `RPC_ERR_CODES` 也在这里，
  服务端 `dispatcher`/`errors` **直接别名引用**（Arthur 停回流后单源合一，无镜像可漂移）。
- **房间协议**：`shared/protocol/messages.ts`（C2S/S2C 枚举 + payload 接口）、`state.ts`
  （`IGameRoomState` 纯接口，镜像服务端 Schema——保持 shared 零依赖，客户端靠反射握手解码）。
- **玩法公式**：`shared/logic/`（伤害/体力/随机数/时间——双端同源，服务端权威、客户端预表现同一套）。

### 3.2 机检优先于口头纪律

能让机器抓的约定，就不靠人自觉。全项目的守门机制：

| 守门 | 抓什么 | 时机 |
|---|---|---|
| ws-RPC loader 启动校验 | 端点文件集合 ⇔ shared 路由全集 ⇔ 文件路径 三方相等 | 服务端启动即 throw |
| `lobby-rpc-contract.test.ts` | 同上 + idem 路由必带 clientReqId | CI |
| `logic-purity.test.ts` | 客户端 `logic/` 全目录禁 import cc/fairygui | CI |
| `viewRegistry.test.ts` | 页面文件 ⇔ 注册表 ⇔ 契约 ⇔ AUTO 区块 四重相等 | CI |
| `defineRpc` 类型胶水 | schema/handler 与 shared 契约不符不过编译；idem⇔clientReqId | typecheck |
| `verify:ecs` | ECS 库（bitECS）12 文件字节锁定 | 手动/CI |
| `verify:sync` | 两级镜像新鲜度：漂移/孤儿/入库文件缺 `.meta` | typecheck 尾部 + CI |
| `serverImportBan.test.ts` | 客户端 `src/` 全目录禁 import colyseus npm 包（铁律 5） | CI |
| `vendorLock.test.ts` | vendored 版本五方一致（fetch 钉版 ⇔ 产物 ⇔ lock ⇔ 双端 major.minor ⇔ 文档）+ 产物 sha256 内容锁（vendor.sha256） | CI |
| `[rpc-budget]` 探针 | handler 同步 CPU 超预算（铁律 11） | 运行时告警 |
| `docs/server/09` → `09·XX` | 服务端写路径 61 条规则（见 SERVER.md） | PR 审查 + 代码注释锚点 |

这套「约定即机检」的哲学贯穿两端：服务端 loader、客户端 viewRegistry、双端契约测试，都是同一个物种。

### 3.3 玩法概念的去处（两端对称）

一个玩法功能拆到哪，两端各有一张固定映射：

| 概念 | 服务端 | 客户端 |
|---|---|---|
| 公式（双端同源） | `shared/logic/` | `shared/logic/`（生成物） |
| 无状态单次请求-响应 | `websocket/<域>/<接口>.ts`（ws-RPC） | `net/WebSocketClient.ts` |
| 有状态实时玩法（Schema 同步） | `rooms/`（GameRoom + Schema） | `net/RoomClient.ts` + `logic/rooms/<玩法>/` |
| 真实 HTTP（仅 auth/支付/utility） | `http/<域>/<接口>.ts` | `net/http/<域>.ts` |
| 假数据（无栈调试） | `mock/api/<接口>.ts`（`/mock/` 前缀） | `net/mock/<接口>.ts` |
| 玩家数据 | `player/userStore` | — |
| UI 页面 | — | `view/XxxView.ts` + `logic/page/XxxLogic.ts` |

**端点层的分界判据**：都走 websocket，但**有 Schema 状态同步的实时玩法 → `rooms/`；无状态单次
请求-响应 → `websocket/`**（按「有无状态同步」分，不按协议分）。

### 3.4 目录语法两端同构

两端都遵循**「根层文件 = 入口与全局真源；子目录 = 层/域」**，且都区分「不可动区 / 少动区 / 日常区」：

- 服务端 `src/` 根 = `rooms/ websocket/ http/ mock/ player/ core/` 六目录 + 入口两文件；
- 客户端 `apps/client/src/` 根 = `view/ logic/ net/ core/ lib/ shared/` 六目录 + `Main.ts`/`designSpec.ts`
  （`sync:client` 灌入 `apps/Cocos/assets/src/` 后由 Creator 编译）；
- 两端的 `lib/`+`shared/`（客户端）、`core/`（两端）是"少动/不可动"区，其余是日常主战场。

---

## 4. 一个功能从零到通的标准动线

以「加一个 ws-RPC 接口」为例（最高频的一类）：

```
① shared/protocol/lobbyRpc/<域>.ts  加路由名 + Req/Res + Map 条目
② npm run sync:shared   生成物同步进客户端（已级联 sync:client，连 .meta 提交）
③ 服务端建端点文件 websocket/<域>/<接口>.ts（defineRpc 包装，loader 自动注册）
④ 登记点（若需）：docs 07 表 → core/infra/config·keys → shared RPC_ERR_CODES
⑤ 客户端调用 WebSocketClient.rpc(域Rpc.接口, payload)   —— 类型自动推导
```

**net/、dispatcher/loader、Main.ts 永远不碰。** 详细分端动线见各自文档。

---

## 5. Colyseus 0.17 与旧资料的差异（网上教程大多是 0.16，别照抄）

- 服务端入口是 `defineServer({ rooms, express })` + `defineRoom(RoomClass)`；
  `initializeGameServer`/`initializeExpress`/`gameServer.define()` 是 0.16 API，已废弃。
- Room 状态用类属性 `state = new MyState()`（不再是 `Room<State>` 泛型 + `setState`）；创建后禁整体重赋值。
- 消息处理用 `messages = { [C2S.Xxx]: (client, msg) => {} }` 属性。
- `onLeave(client, code)` 第二参是数字关闭码（不是 0.16 的 consented 布尔），用 `code === CloseCode.CONSENTED` 判断。
- 客户端包已从 `colyseus.js` 更名为 `@colyseus/sdk`（colyseus.js 止步 0.16.22 已归档，与 0.17 服务端不兼容）。
- schema v4 仍用传统 `@type` 装饰器：服务端 tsconfig 必须 `experimentalDecorators: true` 且
  **`useDefineForClassFields: false`**（否则装饰字段静默失效，状态不同步且无报错）。
- 双端 Colyseus 版本 major.minor 必须一致（当前 0.17.x）。

---

## 6. 全仓库铁律速查（11 条）

违反会出隐蔽问题。分端细节在各文档，这里是索引：

1. `apps/client/src/lib/bitecs/` 12 个 .ts **禁改**（字节锁定，`verify:ecs`；偏差见 lib README）。
2. `apps/client/src/shared/` 是 `sync:shared` 生成物，**禁手改**（改 `apps/shared/src` 再同步；
   `apps/Cocos/assets/src/` 整份是 `sync:client` 生成物，连 `.meta` 提交）。
3. **相对导入不带扩展名**（Cocos 要求；服务端因此用 `moduleResolution: Bundler` + tsx）。
4. **shared 零依赖**：只用 TS 语言 + ES 标准库；禁 npm 包/Node API/cc/wx/DOM；禁 `const enum`；lib 钉 ES2017。
5. 客户端只用 `@colyseus/sdk`（全局 `Colyseus`），**禁 import 服务端包** `colyseus`/`@colyseus/core`。
6. **消息名/协议类型/公式一律 import 自 shared**，不手写不复制。
7. 双端 Colyseus **版本 major.minor 一致**。
8. 服务端写路径**对照 09 规则**（见 SERVER.md 的 61 条规则目录；代码注释 `09·XX` 即编号）；新增常量/key/错误码先进 07 表再进 `core/infra`。
9. **客户端视图/逻辑二分**：视图 `view/`（依赖 cc/fairygui）、行为 `logic/`（禁 cc/fairygui，`logic-purity` 机检）。
10. **FairyGUI 只走动态 import**（`ViewMgr.open`/`import("./view/XxxView")`），fairygui 不进任何常规脚本的静态依赖图。
11. **网关进程禁重计算**（单线程：同步 CPU 卡一次 = 全服冻结）；重计算卸载到 `core/compute/tasks/`（worker 池）或独立进程。

---

## 7. 现状与边界

- **玩法是 demo**：`ballMove`（小球移动）+ 技能结算，纯 mock 可无栈跑通；fork 后改名换真实玩法。
- **服务端框架是生产级**但部分能力**代码就绪、水位/里程碑未全启用**（如冷档冻结按内存水位启用）。
  排行榜演示已移除（M7 编号保留）。里程碑地图见 SERVER.md。
- **Arthur 专属未移植件**：M4 存量迁移 ETL、wxLogin 存量账号绑定协议——本项目无旧账号体系，N/A。
- **验证基线**（近期全绿）：typecheck 三端 + verify:sync / 服务端单测 13 / 客户端 test:fgui 54 / 集成测试 60 / mock 冒烟 13。
