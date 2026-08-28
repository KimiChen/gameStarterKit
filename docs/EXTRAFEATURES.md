# 额外功能与参考实现

## 1. 文档定位

gameStarterKit 的核心定位是**开发期游戏基础框架**：客户端、服务端、shared 契约，以及本地开发、
调试和验证所需的工程能力。仓库里同时保留了一些项目特定样例、实验模块和外部平台适配。

本文件是这些额外内容的唯一总索引。它们：

- 不属于核心框架的交付、稳定性或长期维护承诺；
- 不构成核心架构、优先级、验收标准或后续演进的强制约束；
- 不保证覆盖完整业务流程、目标环境、安全要求或法规要求；
- 可以由采用方自行启用、补齐、替换、隔离或移除；
- 即使代码已在默认入口中装配，也只表示当前 Demo 会执行它，不表示它已经成为核心能力。

额外功能仍须遵守源码真相、生成镜像、类型检查和安全边界。可选代码不能破坏核心本地开发流程，
但“把某项额外功能做完整”不是核心框架的完成条件。

## 2. 状态说明

下文使用四种状态，避免把“仓库里有文件”误读成“能力已经完成”。

| 状态 | 含义 |
| --- | --- |
| 默认接入 | 当前 `dev`/客户端入口会装配；仍可能只服务于 Demo 或本地诊断 |
| 显式启用 | 需要单独命令、配置或开关；默认流程不会执行 |
| 参考代码 | 有局部实现或契约，但缺少完整调用链 |
| 未实现 | 只属于额外功能类别，仓库当前没有可用实现 |

## 3. 当前仓库中的额外内容

### 3.1 项目说明站（本地 checkout 保留）

状态：**独立 Sites checkout；不属于本仓受控源码**。

`apps/website/` 物理目录按约定保留，里面是新设计站点的本地 checkout/构建工作区，方便继续在
Sites 项目中开发和预览。该目录由根 `.gitignore` 忽略，本仓不跟踪其中的页面源码、托管元数据、独立
package、构建/预览/部署脚本或构建产物，也不把它恢复为 gitlink 或未登记的 submodule；因此不会被
`gameStarterKit` 的 workspace、能力清单或核心验证命令当作本仓能力。

站点的域名、托管、发布和后续维护由独立 Sites 项目负责；本节只说明本地目录的保留约定，不能据此推导
本仓提供站点交付或线上可用性。需要提交框架代码时，应明确避开该目录，避免把新设计站点内容混入本仓。
### 3.2 GM、账号管理与强制下线参考

状态：**参考代码；部分默认接入**。

现有接缝包括：

- 锁定的外部 WebPlatform 契约生成物暴露账号 `ban` / `revoke` 路径和类型；这只表示外部契约中有
  这些 operation，不表示本仓实现了账号管理服务；
- `apps/server/src/http/admin/kick.ts` 注册 `POST /admin/kick`；未配置 `ADMIN_API_SECRET` 时
  fail-closed，配置后也只操作当前节点由 `websocket/push.ts` 登记的 Lobby 在线连接；
- `apps/server/src/core/auth/kickBus.ts` 的组内 kick consumer 随默认服务端进程启动，属于
  best-effort 唤醒/踢线样例；
- `apps/server/test/smoke.ts` 可以在显式配置后覆盖部分账号操作与 kick 接缝。

当前生成契约和游戏端点可用于做局部联调参考：

| 接缝 | 当前请求/响应摘要 |
| --- | --- |
| WebPlatform ban/revoke | `POST /v1/admin/accounts/{userId}/ban|revoke`；body 为 `{operationId, reason}`，结果为 `{accountExists, status}` |
| 当前游戏节点 kick | `POST /admin/kick`；`x-admin-secret`；body 为 `{uid, reason?}`，结果为 `{kicked}` |

外部 Admin 的实际鉴权、幂等和错误语义仍以锁定契约及外部服务实现为准，不能从这张摘要表推导完整 SOP。

必须注意：当前 `/admin/kick` **没有登记或关闭 GameRoom 连接**，房间内消息也不会因此自动再次校验
账号状态，所以它不能被描述成“全节点、全房间、立即强制下线”的完成能力。仓库也没有 GM Web/CLI、
审批、操作者权限、节点发现、逐节点送达证明或完整审计编排。旧版两步 SOP 不再代表当前代码能力；
本节是这组额外功能参考的唯一文档入口。

如果实际项目决定建设 GM 工具，可以把下面编排作为**非绑定目标参考**；采用前必须先补齐 GameRoom
覆盖、节点发现、权限和审计，不能直接把现有接缝拼接后宣称完成：

```text
① 写外部账号权威
   POST /v1/admin/accounts/{userId}/ban 或 /revoke
   body: { operationId, reason }

② 对权威在役节点清单逐节点直连
   POST {node}/admin/kick
   x-admin-secret: <该游戏节点使用的 ADMIN_API_SECRET>
   body: { uid, reason: "banned" | "revoked" }
```

当前游戏节点端点要求 `uid` 为 1–128 字符（与 shared/WebPlatform user-id 上限一致），`reason` 只允许
`banned`/`revoked` 且缺省为 `banned`。
命中 Lobby 在线表后，节点会先尽力推送 `auth.forceLogout{reason}`，再使用对应语义关闭码断开该连接；
关闭码只作为推送未送达时的兜底，不扩大在线表覆盖范围。

参考顺序是先写账号权威，再处理已建立连接；反序会留下被踢后立即重新登录的窗口。外部响应
`{accountExists, status}` 中，`status` 只在 `banned | revoked | not_found` 范围内。账号不存在应作为明确
业务结果展示。`operationId` 应由调用方持久生成；在超时或 5xx 造成结果不确定时，只有确认外部服务的
幂等语义后才能用同一 ID 有限重试，不能换新 ID 猜测第一次没有提交。401/403、409 或响应 shape 异常
应立即停下并记录。外部服务使用的鉴权与操作者身份仍由其实现定义，不应和游戏节点 secret 混为一套。

第二步不能通过只命中一个后端的普通负载均衡入口来证明“全节点完成”。采用方需要从自己负责的服务发现、
编排平台或受控静态清单取得**仍在承载玩家**的节点快照，逐节点设置短 timeout 和有限重试：

- `200 {kicked:true}` 表示现有 Lobby 在线表至少命中一条连接；
- `200 {kicked:false}` 只表示该节点的现有 Lobby 在线表没有命中，不是错误，也不能证明 GameRoom 已关闭；
- 400/401 属参数或配置错误，应停止而不是盲目重试；
- 仍在役但最终不可达的节点必须进入 `PARTIAL`，不能被解释为玩家不在线；
- 第一步已确认成功而第二步部分失败时，应保留原 operationId 和第一步结果，只补偿未确认节点。

工具侧若被采用，至少应记录 operator、userId、动作、reason、operationId/requestId、节点清单快照、
每节点耗时/HTTP/`kicked`/重试次数，以及 `OK | NOT_FOUND | PARTIAL | FAILED` 终态。建议对账号权威失败、
节点清单为空和节点送达不完整分别告警，并按“账号数 × 节点数”限制批量操作速率。最低验收样例应覆盖
在线、离线、不存在账号、重复 operationId、多节点仅单点命中、在役节点不可达、密钥错误、ban 后拒绝
重登、revoke 后允许重新登录；在 GameRoom 未纳入在线表之前，任何验收结果都只能说明 Lobby 接缝。

### 3.3 微信兼容与渠道登录接缝

状态：**兼容层默认接入；登录仅参考代码**。

- `apps/client/src/core/wechat-compat.ts` 由 `Main.ts` 导入并初始化；非小游戏环境下由运行时判断保持
  no-op，但它目前还没有插件化退出默认编译入口；
- `apps/client/src/net/http/account.ts` 导出 `wxLogin` HTTP wrapper，且有状态码测试；
- WebPlatform 生成契约包含 `WxLogin` 类型与路径。

当前主登录页面仍使用 `devLogin`。仓库没有完整编排 `wx.login`、用户授权或客户端真实支付，也没有发现
抖音登录、广告、分享等实现。生成契约暴露接口不等于客户端已经消费或支持该能力。

### 3.4 真实货币支付参考

状态：**显式启用 / 不完整参考代码**。

- `apps/server/src/http/pay/wxNotify.ts` 的通知路由始终登记，但 `PAY_ENABLED` 缺省关闭并返回
  `501 {error:"NOT_IMPLEMENTED"}`——该串不在 shared `RPC_ERR_CODES` 内，按 shared 错误码分支的客户端
  接不住它；开启后的鉴权用 `WXPAY_NOTIFY_SECRET` 头部共享密钥，该变量由端点直接读 `process.env`，
  仓库中只在 `.env.development` 以注释形式出现；
- 当前配置对 `NODE_ENV=production` 与 `PAY_ENABLED=1` 组合直接 fail-fast；
- `core/economy/purchases.ts`、充值 SKU、`purchases` 表和集成测试展示了局部订单状态与发货样例；
- `createOrder` 只是内部函数，没有对外下单 endpoint。

现有通知只使用共享密钥，并非微信支付 APIv3 平台证书验签。仓库没有完整下单、主动查单、退款、
账单下载、对账、补单、风控或合规流程，因此不能用于真实收款。游戏内软货币商店、asset effect、ledger
和 outbox 是游戏数据一致性样例，与真实货币支付是两件事；前者存在不代表后者已经实现。

### 3.5 本地诊断、consumer 与后台处理样例

状态按入口区分：

| 组件 | 当前入口 | 准确边界 |
| --- | --- | --- |
| event-loop/MySQL pool monitor | 默认 `src/index.ts` | 控制台级本地诊断，不是监控告警体系 |
| match stream depth alert | 默认 `src/index.ts` | 本地日志提示；不会自动启动 settle consumer |
| kick consumer | 默认 `src/index.ts` | 组内 best-effort 样例，见 §3.2 |
| character repair worker | 默认 `src/index.ts` | 外部角色登记失败的本地补偿样例 |
| mail wake loop | 首次 LobbyRoom 创建时启动，进程内单例 | 只做“有变化后重新 pull”的唤醒样例 |
| outbox relayer | `npm --workspace @game/server run relayer` | 独立命令，不随 `dev` 启动；死信（status=2）无自动或人工处置入口，需自行接线 `replayDead` |
| match settle consumer | `npm --workspace @game/server run settle` | 独立命令，不随 `dev` 启动 |
| freeze worker | `npm --workspace @game/server run freeze-worker` | 默认硬关闭；当前实现明确标为 unsafe |
| Colyseus playground/monitor | 非 `production` 的 app config | 本地开发管理界面，不是外部管理后台 |

这些组件没有形成长期进程编排、指标采集或故障值守能力。默认进程现在通过单一 lifecycle registry 聚合
关闭，按逆序、可等待且幂等地释放资源；启动半失败和 Lobby 按需 mail wake 也走同一 cleanup 路径。仍存在
relayer 持事务等待外部 I/O、evidence 不足以确定性重放、坏 stream entry 会被 ACK 等已知问题；如果实际
项目选择采用，应继续完成隔离、故障测试和运维接线。它们的不完整不阻塞核心框架验收。

### 3.6 多区、分片、扩展与冷档参考

状态：**核心保留隔离正确性；拓扑与容量方案属于参考代码**。

`server_id`、`zoneCtx`、区前缀 key、入房 `sId` 复核属于当前示例数据正确性，不能因多区拓扑是额外功能
而绕过。额外部分包括：

- `docs/DUAL_MODE.md` 的多区/双形态历史规则索引；
- `redis-route.example.yaml` 和 Redis bucket routing；
- RedisPresence/RedisDriver 依赖与探针；默认 `app.config.ts` 并未启用它们；
- `core/archive` 的 freeze 路径和独立 worker（worker 内含每小时 janitor：锁内归档解析、陈旧行清理与
  PITR 后 ARCHIVE_NEWER 修复）。janitor 每轮以 `batch` 作为**总扫描预算**，按
  `(frozen_at,user_id)` keyset 游标跨轮续扫；正常冷档行会被无锁预筛跳过，但不会长期卡住后面的
  陈旧残留或 ARCHIVE_NEWER 行。游标只保存在 worker 进程内，重启后从头开始仍保持幂等安全。启用
  freeze 前仍需完成 archive 的区隔离与容量评估。

其中 `ensureLive`/thaw 已被当前角色读取和写入链引用，不能机械删除；但 freeze worker 默认关闭，且现有
guard 明确要求 unsafe escape hatch。仓库不承诺横向扩展、分片迁移、容量管理或冷数据存储方案。

### 3.7 玩法与业务域样例

状态：**默认 Demo / 参考代码**。

- `ballMove`、技能伤害与 GameRoom 是当前可运行的示例玩法；
- notice 展示页面，以及 mail/guild/shop/outbox 的 Logic、RPC、事件或领域接缝；
- Guild 当前只有 Logic/服务端样例，没有完整页面；部分页面控件也只是结构绑定。其事件流的 `INCR` 发号与
  `LPUSH` 入表非原子，读侧可能拿到「已发号未入表」的 `latestSeq` 并据此抬水位，从而永久跳过该条事件
  （见 [SERVER §10](SERVER.md#10-广播与事件)）；权威状态必须能靠全量刷新自愈。

这些内容用于说明如何扩展框架，不是通用玩法、完整经济、社交或运营系统。采用方可以替换或删除业务内容，
但保留的代码仍应通过对应本地测试。

### 3.8 配表、负载与 Unity 实验

状态：**参考代码 / 研究占位**。

- Excel 转换器能校验 `items.xlsx` 并生成双端 JSON，但当前 `--check` 只验证源表，预期输出未入库，
  也没有正式消费方；
- `apps/server/loadtest/bot.ts` 仍使用过期的入房参数，当前严格鉴权下不能视为可用工具；
- `apps/Unity` 只有说明和空目录占位，没有 Unity version、`Packages/manifest.json`、
  `ProjectSettings/ProjectVersion.txt`、C# 生成或测试闭环。

这些实验不进入核心验证命令，也不构成未来必须实现的路线图。

### 3.9 《Underground Idle》玩法策划案

状态：**未实现**。

`docs/undergroundIdle/` 是面向框架演示的 0.1 玩法方案草案，不是当前可运行的游戏模块。它没有对应的
客户端页面、服务端 endpoint、默认入口、workspace package 或验证命令，因此不会登记为
`docs/inventory.json` 的活跃能力，也不改变核心框架的完成定义。方案本身明确不构成线上运营、商业化或生产
部署承诺；真正实现时仍须按当前 shared 契约、Lobby WS-RPC、玩家档案、锁/fence、幂等和 View/Logic 约束
重新评审，不能把文档中的接口规划当成已交付协议。

策划案入口与文档分工如下：

| 文档 | 内容 |
| --- | --- |
| [`README.md`](undergroundIdle/README.md) | 方案摘要、阅读导航和首版取舍 |
| [`01-product-and-gameplay.md`](undergroundIdle/01-product-and-gameplay.md) | 产品定位、核心循环与功能范围 |
| [`02-economy-and-mine.md`](undergroundIdle/02-economy-and-mine.md) | 资源经济、生产链、离线结算与建筑 |
| [`03-workers-and-expeditions.md`](undergroundIdle/03-workers-and-expeditions.md) | 矿工、岗位、远征和新手流程 |
| [`04-client-and-rpc.md`](undergroundIdle/04-client-and-rpc.md) | 页面体验、客户端边界和 WS-RPC 规划 |
| [`05-data-and-server.md`](undergroundIdle/05-data-and-server.md) | 数据模型、服务端一致性和内容配置 |
| [`06-testing-and-roadmap.md`](undergroundIdle/06-testing-and-roadmap.md) | 指标、测试矩阵、阶段路线和完成定义 |
| [`07-art-direction.md`](undergroundIdle/07-art-direction.md) | 美术方向、界面结构、资产与验收标准 |

## 4. 明确不提供的能力

以下内容只作为额外功能分类，不代表仓库当前实现，也不构成未来承诺或项目约束：

- 生产部署、持续交付、线上伸缩、监控告警、备份恢复等生产运行体系；
- 充值、支付、订单、退款、对账等商业化能力；
- 微信、抖音等渠道的账号、登录、支付、广告、分享及 SDK/API 接入；
- 渠道打包、审核、灰度、热更新、合规、商店发行及运营能力。

当前仓库没有游戏服务的容器/编排清单、持续交付流水线或备份恢复方案；没有抖音 SDK；也没有渠道打包、
审核、灰度、热更新、合规检查和商店发行流程。上述缺失不是 `plan.md` 的核心阻塞项。

## 5. 原待办归并与非绑定候选

原独立待办同时混合了核心正确性问题和可选扩展方向。删除独立清单后，核心项以
[plan.md](../plan.md) 的最新代码审阅结论为准；额外项在本节保留。下面的映射用于证明原内容已有明确
去向，不构成第二份路线图，也不改变本文件的非承诺定位。

| 原编号 | 原内容摘要 | 归并结果 |
| --- | --- | --- |
| D1 | 客户端 app/session/scene/room 状态机、玩法 registry、统一回登录出口、可注入持久化、timeout/cancel | 核心：`plan.md` P0-01、P1-01 |
| D2 | Main/View 无头类型与生命周期测试、引擎 stub、FGUI 深层契约、测试源码严格类型检查 | 核心：P1-02、P1-05、P1-08 |
| D3 | join deadline、完整登录事务互斥、掉线输入 reconcile、session 事件串行化 | 核心：P0-01、P1-07 |
| D4 | FGUI 设计源到 `.bin`/`.meta`/codegen 的可检查流程、required/optional 语义、失败重试与资源释放 | 核心：P1-05 |
| D5 | Excel 纯转换、入库产物 freshness、双端 loader、shared schema/version/hash 与引用校验 | 额外：§3.8 与本节候选 |
| D6 | GameRoom C2S runtime schema、输入/HTTP 上限、统一 config parser 与稳定协议错误 | 核心：P0-02、P1-03、P1-06 |
| D7 | asset effect type/version、先验证后写入、范围/字段白名单及跨入口单源验证 | 核心：P0-03 |
| D8 | durable match intent、结算状态、坏消息隔离、relayer 短事务、退避与 marker 裁剪证明 | 额外：§3.5；不作为核心交付 |
| D9 | Game HTTP contract map、端点派生、WebPlatform runtime validator、UserId 与目录字段语义 | 核心：P1-03、P1-07 |
| D10 | schema-first 生成 TS、validator、contract map、Colyseus state、fixture 与 fingerprint | 核心：P1-04 |
| D11 | 服务端玩法模式接口、客户端 InputAction adapter、相同 seed/input 的确定性测试 | 核心：P0-02、P1-01、P1-07 |
| D12 | Audio/Localization/SafeArea、连接恢复 pull、ECS query/self-eid 与临时对象优化 | 前三项额外；连接正确性和性能分别进入 P0-01、P1-01、P2-01 |
| D13 | 幂等项目初始化、显式工具依赖、package inventory、文档同口径与漂移机检 | 核心：P1-08、P1-09、P2-03 |
| D14 | Unity 版本、最小工程、TS→C# 契约/公式与 ballMove 转换的限时 spike | 额外：§3.8 与本节候选 |
| ESLint | 只有现有严格类型和定制检查无法覆盖具体问题时才重新评估 | 额外：本节候选 |

### 5.1 非绑定候选清单

旧待办中不属于核心缺陷的候选方向在此统一保留，但不形成路线图承诺：

- 按玩法实际需要提供可注入的 Audio、Localization、SafeArea 和更多 Input adapter；
- 在 Excel 样例真正有双端消费方后，再补 deterministic generate、产物 freshness 和引用校验；
- 修复 loadtest 的身份准备与入房参数后，再决定是否保留为可用工具；
- 对 settle、relayer、freeze、GM、托管等额外链路，只在实际项目采用时补完整生命周期和故障测试；
- Unity 只允许先做限时可行性 spike，不因占位目录推导必须支持；
- ESLint 当前没有纳入根工具链；只有出现现有 TypeScript/定制检查无法覆盖的具体问题时再评估。

客户端状态机、GameRoom 输入、effect 原子性、角色 ready、默认进程生命周期、View 生命周期、wire schema
和本地验证闭环属于核心代码缺口，不在本节降级为可选项；它们已统一进入 [plan.md](../plan.md)。

## 6. 采用原则

1. 先确认额外模块的实际状态和默认入口，不根据文件名、生成契约或注释推断完成度。
2. 在独立配置和测试中启用；密钥、账号、真实数据和外部服务不得进入仓库。
3. 若额外模块会进入默认进程，必须提供幂等启动/停止和失败隔离，不能污染核心本地开发。
4. 若额外模块复用 shared、网络、lock/fence 或 outbox，它必须遵守这些核心不变量，但不能反向绑定核心架构。
5. 对目标环境的安全、兼容、业务与法规判断由采用方负责；本仓文档只陈述当前代码事实及明确标记的
   非绑定参考。

核心问题和实施优先级以 [plan.md](../plan.md) 为准；本文件中的成熟度说明不自动转化为计划任务。
