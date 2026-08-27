# 技术总览

> 本文只描述 gameStarterKit 在**开发阶段**提供的代码结构、契约和本地验证方式；完整范围见
> [根 README](../README.md#项目边界)，非核心参考实现见
> [额外功能与参考实现](EXTRAFEATURES.md)。

## 1. 定位

gameStarterKit 是客户端、服务端和 shared 共同演进的 TypeScript 游戏开发骨架：

- Cocos Creator 工程负责编辑器、场景和资源。
- `apps/client` 负责客户端游戏代码。
- `apps/server` 负责 Colyseus 房间、RPC 和示例数据逻辑。
- `apps/shared` 负责两端共同使用的协议、错误码、公式和常量。
- `apps/art` 负责 FairyGUI 设计源。
- 外部身份服务只通过锁定的 HTTP 契约参与本地示例链路。

当前 `ballMove` 是演示玩法，不是通用玩法实现。框架的可复用部分是目录边界、同步工具、契约、
网络接缝、视图组织和服务端一致性原语。

## 2. 目录与源码真相

| 路径 | 角色 | 修改方式 |
| --- | --- | --- |
| `apps/shared/src` | shared 源码真相 | 直接修改后运行 `sync:shared` |
| `apps/client/src` | 客户端源码真相 | 直接修改后运行 `sync:client` |
| `apps/client/src/shared` | shared 的客户端镜像 | 禁止手改 |
| `apps/Cocos/assets/src` | client 的 Cocos 镜像 | 禁止手改 |
| `apps/Cocos/assets/resources` | Cocos 本地资源 | 由编辑器或资源工具生成 |
| `apps/art/fairygui` | FairyGUI 设计源 | 在 FairyGUI 编辑器中修改并导出 |
| `apps/server/src` | 服务端源码 | 按目录登记点扩展 |

两级同步链：

```text
apps/shared/src
  → apps/client/src/shared
  → apps/Cocos/assets/src/shared

apps/client/src
  → apps/Cocos/assets/src
```

同步脚本检查漂移、孤儿、`.meta` 和异常大批删除。镜像存在的目的，是让纯 TypeScript 代码可无头
验证，同时让 Cocos 工程持有稳定 UUID。

## 3. 设计原则

### 3.1 单一真源

- 消息名、请求/响应类型、状态镜像、错误码和公式进入 shared。
- 服务端与客户端从 shared import，不复制字符串或接口。
- 外部身份 HTTP 类型来自锁定的 `@gono/webplatform-contract` 生成物。
- Colyseus state 字段改变时，同步更新 shared state 镜像与协议指纹。

### 3.2 约束可执行

| 约束 | 本地检查 |
| --- | --- |
| shared/client/Cocos 镜像一致 | `npm run verify:sync` |
| shared 零依赖与客户端 Logic 纯净 | `npm run typecheck`、相关单测 |
| bitECS 源码保持锁定 | `npm run verify:ecs` |
| FGUI 直接命名元素、registry、codegen 与客户端无头行为 | `npm run test:fgui` |
| 服务端路由、协议与一致性规则 | `npm --workspace @game/server run test` |
| 外部身份契约版本与生成物一致 | `npm run verify:webplatform-contract` |

这些命令是本地开发验证入口，不表示所有真实边界都已覆盖。特别是客户端 `Main.ts` 与 `view/` 下 9 个
文件（页面 View 及 ViewMgr/FguiView 等装配件）不在当前严格类型检查内，FGUI 测试也不验证 Creator 中的
完整 View 生命周期或设计源到已导出 `.bin` 的新鲜度；已知缺口见 [plan.md](../plan.md)。

### 3.3 视图与行为分离

客户端分成：

- `view/`：允许依赖 `cc` 和 `fairygui-cc`，只做节点绑定、事件转发和数据搬运。
- `logic/`：不依赖引擎/UI，承载页面行为和玩法规则，便于无头测试。
- `net/`：房间、RPC 和 HTTP 的传输适配。
- `core/`：HTTP 底座、生成的本地开发配置和宿主环境兼容桥。
- `view/ViewMgr.ts`：页面加载、分层、缓存和交互输入生命周期。

新增页面通过 `defineView + viewRegistry + ViewMgr.open` 接入，不向通用入口堆静态 import。

### 3.4 数据正确性优先

服务端代码以这些不变量为目标：

- MySQL 与 Redis 的权威边界明确。
- 同一用户写入串行化，并使用 lock/fence 防止过期持有者提交。
- 可重试写入使用稳定幂等 ID。
- 跨存储修改使用 outbox/补偿接缝，避免裸双写。
- Redis key 与 MySQL 查询显式携带区上下文。
- 大规模同步计算不放在网关 handler 中。

这些是开发实现应保持的不变量，不是对当前所有路径已经完成证明的声明。现有 effect 原子性、跨区回读、
后台生命周期等确定缺口及其验收标准统一记录在 [plan.md](../plan.md)。

## 4. 标准开发动线

### 4.1 双端功能

```text
1. 在 apps/shared/src 定义协议、错误码或公式
2. npm run sync:shared
3. 在 apps/server/src/websocket 或 http 增加 endpoint
4. 更新服务端登记点、key/config 与测试
5. 在 apps/client/src/logic 增加行为
6. 需要页面时通过 codegen 创建 View 并登记 viewRegistry
7. npm run sync:client
8. 运行本地类型检查和相关测试
```

### 4.2 FairyGUI 页面

```text
FairyGUI 编辑设计源
  → 导出 .bin 与图集到 Cocos resources
  → codegen View AUTO 区块
  → 编写 Logic 和手写绑定区
  → 本地契约测试与 Creator 预览
```

### 4.3 外部身份契约

```text
更新精确锁定的契约依赖
  → npm run sync:webplatform-contract
  → 检查生成物 diff
  → 更新本仓 HTTP 消费代码和本地测试
```

外部契约的生成和服务实现不属于本仓。

## 5. Colyseus 0.17 约定

- 客户端使用 `@colyseus/sdk` UMD 全局 `Colyseus`，不得 import 服务端包。
- 服务端使用 Colyseus 0.17 与 `moduleResolution: Bundler`。
- 两端 Colyseus major.minor 保持一致。
- Room 用于状态同步；Lobby websocket endpoint 用于显式 RPC。
- 客户端连接复用必须同时核对 endpoint、区号、token 和完整 join options。
- 相对 import 不带 `.ts` / `.js` 扩展名。

`@colyseus/sdk` 是通用游戏网络库。

## 6. 开发边界速查

1. bitECS 锁定目录不修改。
2. shared/client/Cocos 生成镜像不手改。
3. shared 不依赖 Node、DOM、引擎或宿主平台对象。
4. 消息、类型、公式和错误码来自 shared。
5. View/Logic 保持分层。
6. FairyGUI 只通过动态 import 进入页面打开链。
7. 服务端写路径遵守 lock/fence/idempotency/outbox 约束。
8. 外部身份服务只通过 HTTP 契约消费，不导入业务源码。

## 7. 当前状态

- 本仓包含用于本地验证的 Lobby、GameRoom、ballMove、技能结算、页面和数据读写示例。
- 本地开发账号通过外部服务的 dev session 契约创建。
- Unity 目录只是研究占位。
- 所有演示 endpoint、配置和页面只用于开发与验证。
- 核心改进状态以 [plan.md](../plan.md) 为准；可选模块的准确状态见
  [额外功能与参考实现](EXTRAFEATURES.md)。
- 完整项目边界以根 README 为准。
