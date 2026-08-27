# 区上下文开发规则索引

> 文件名和以下编号为兼容源码注释中的历史锚点而保留。本文只记录当前代码仍依赖的区上下文正确性规则；
> 多区拓扑、Redis 路由与冷档属于额外参考，不代表项目提供线上伸缩或运行体系，见
> [EXTRAFEATURES §3.6](EXTRAFEATURES.md#36-多区分片扩展与冷档参考)。
> 注：源码注释中仍出现的 §3.2（每区独立经济总述）、§3.7（充值落区）、§5.3（区前缀命名）三个历史编号
> 未在本文保留，其内容分别并入 §3.3、§3.3 与 §3.5；按这三个编号跳转找不到对应小节属预期，不是文档缺页。

## 2.3 会话事件

账号和会话状态的权威在外部 WebPlatform。游戏服 strict join 回源验证，Lobby 消息只校验本地
`sess:{uid}:s{sId}` cache；会话变化后需要让客户端重新读取权威状态。

组 sess 缓存写入携带 `issuedAtMs` 单调栅栏（written/unchanged/stale 三态 Lua），迟到的旧登录结果不会
覆写新会话；踢人广播携带 exceptHash 与 issuedAt，消费侧回读 sess 后丢弃陈旧或指向自己的事件。

`stream:kick` 只是组内 best-effort 的本地开发接缝：每节点从启动后的新条目开始读，没有 outbox 或送达
确认；在线表也只登记 Lobby 连接，不包含 GameRoom。不能把它描述为全节点、全房间立即下线能力。相关
额外功能边界见 [EXTRAFEATURES §3.2](EXTRAFEATURES.md#32-gm账号管理与强制下线参考)。

## 2.6 角色存在性

账号、角色目录与玩法档案分属不同真源：外部服务只记录 `(userId, serverId)` 是否已有角色，本仓 Redis/
MySQL 保存该区的玩法数据。完整边界见 [SERVER §3](SERVER.md#3-数据边界) 和
[WEBPLATFORM §2](WEBPLATFORM.md#2-数据所有权)。

## 2.7 角色登记接缝

本地建档后，只能通过外部 Internal HTTP 契约幂等登记角色，不能直写账号库。建档顺序是先写本地玩法
档案、再登记外部角色行——反序会留下“登记存在但档案缺失”的不可自愈状态。Lobby 的 `ensureCharacter`
是 detached 调用；HTTP 失败时会尝试留下 durable repair intent，若 Redis 也失败则以 `AggregateError` 暴露，
最终都由 detached 调用方记录。因此一次 join 成功不等于登记已经完成。
适配器边界见 [WEBPLATFORM §6](WEBPLATFORM.md#6-服务端边界)。

## 3.3 MySQL 区谓词

当前 `user_currency`、`currency_ledger`、`mail` 与 `match_results` 的按区读写谓词携带 `server_id`；
`gameplay_outbox` 的创建路径会写入 `server_id`，但 `readBack` 仍只按 `op_id + user_id` 查询，这是
[核心计划 P0-03](../plan.md) 已登记的隔离缺口。`match_index` 是全局 match ID 去重闸，
`singleton_lease` 是全局任务租约，二者刻意不带区。

`user_archive` 与 `user_snapshot_readonly` 当前也没有 `server_id`，但这不是可复用先例：前者正因区隔离
未闭环而默认禁用，后者没有运行时读写方。规则索引见 [SERVER §12 DB](SERVER.md#db--mysql)。

## 3.4 幂等 ID

按区操作的 `op_id` 派生输入包含用户、区号、业务域和稳定 `clientReqId`。调用方重试必须复用同一个
`clientReqId`；换区或换业务域必须派生不同 ID。当前通用 RPC 幂等缓存尚未绑定 payload hash，已知缺口
见 [SERVER §4](SERVER.md#4-lobby-rpc) 与 [SERVER §12 I](SERVER.md#i--幂等)。

## 3.5 区上下文

`core/infra/keys.ts` 通过 `AsyncLocalStorage` 的 `zoneCtx` 构造 per-zone Redis 前缀：

- Lobby 每条 RPC 在已认证 `auth.sId` 的 `zoneCtx.run` 中执行。
- 无请求上下文的领域 worker 必须从权威数据行恢复 `sId` 后再访问 per-zone key。
- `GROUP_ZONES` 非空时，缺少上下文的 per-zone key 构造会 fail-fast；为空时回退 s0。
- `sess` 使用全局项目前缀但把 `sId` 作为显式键分量；`active:lru` 目前仍是全局前缀，是 archive 的
  已知未闭环点。

业务代码不能手拼 key。分类和例外见 [SERVER §3](SERVER.md#3-数据边界) 与
[SERVER §12 R](SERVER.md#r--redis)。

## 3.6 无请求上下文的数据处理

只有记录本身携带合法 `server_id` 的后台路径才能据此重建上下文。当前 outbox relayer 从 intent 行恢复
区号，match consumer 从已校验 evidence 恢复区号。不能把这条规则泛化成“所有 worker 自动知道区号”。

可选支付参考 `core/economy/purchases.ts` 的回调是同类路径的第三例：`purchases` 带 `server_id`，下单时
写入当前区，支付回调没有请求上下文，按订单行的 `server_id` 重建区上下文再落对区钱包与缓存。它默认
关闭（`PAY_ENABLED`），但区列语义与其余经济表一致。

freeze worker 没有完整的区枚举和 `zoneCtx`，archive 表也缺 `server_id`；因此它是本规则的已知反例，
保持默认关闭。

## 4.1 GameRoom 区隔离

`app.config.ts` 用 `filterBy(["sId"])` 隔离常规 `joinOrCreate`；`GameRoom.onAuth` 规范化并校验区号，
`onJoin` 再比较认证区和房级 `sId`，兜住 `joinById`。房间把该值作为常量写入 match evidence。

这只保证当前 Demo 的房间内不静默混区，不代表本项目提供多区拓扑或容量能力。GameRoom 的其他限制见
[SERVER §5](SERVER.md#5-gameroom)。

## 4.2 协调数据

durable 与 cache 是两个物理 Redis，分别通过 `clientFor*` 和 `cacheClient` 使用。coord/kick 通过
`coordClient` 和独立 key 表达不同语义，但本地默认 `REDIS_COORD_URL` 等于 durable URL，`clientOf` 会
复用同一个连接对象；只有显式配置不同 URL 才会物理分开。

因此正确约束是“语义、accessor 和 key 不互相替代”，不是“任何环境都存在不同实例和不同 client”。

## 4.3 进房校验

客户端传入的 `sId` 只是请求参数。LobbyRoom/GameRoom 都先做 `0..65535` 整数校验，再按
`GROUP_ZONES` 复核本进程承载范围，并用同一区号向 WebPlatform strict verify。真区服配置下缺 `sId`
也会拒绝；`GROUP_ZONES` 为空时表示承载全部，缺省按 s0 兼容。

## 4.5 Stream consumer

当前有两类不同语义：

- mailwake/kick 走通用 `startStreamConsumer`：每节点独立 `XREAD` 游标，初始值 `$`，只看启动后的新条目，
  单条按顺序 await，并按时间窗 best-effort trim；没有历史补读或 ack。
- match settle 走 Redis consumer group：处理本 consumer 的 PEL、`XAUTOCLAIM` 接管死 consumer，再读新
  条目；落 MySQL 后 ACK，并在 PEL 为空时按安全位点 trim。当前坏 shape 会记日志后 ACK 丢弃，是已知
  缺口。
- match 流本身是 legacy+v2 双流转制：v2 把完整 legacy key 编入 hash-tag 同槽双读，强制
  `schemaVersion=2` 并交叉校验顶层与 payload 字段。

不要把“每节点独立游标”写成所有 stream 的共同规则，也不要把其中任一种描述为外部送达保证。

## 5.1 配置登记

- `core/infra/config.ts`：`GROUP_ZONES`、Redis URL、超时和跨模块常量的主要登记点。
- `core/infra/keys.ts`：项目/区前缀、hash-tag 与 key 分类的运行时真源。
- `sql/schema.sql`：`server_id` 列、索引与全局表例外的 DDL 真源。

新增按区数据时，要同时检查入口上下文、Redis key、MySQL predicate/unique key、幂等派生、后台重放与
跨区测试，不能只增加一个 `server_id` 字段。

## Archive

freeze/thaw 仍是实验模块。thaw 接缝已经被部分 player/UoW 路径调用，但 freeze 默认硬关闭；启用需要
额外的 unsafe s0-only escape hatch；任何会下发 `sId >= 1` 的目录都不满足该假设。archive 表无区号、
active LRU 全局化、worker 缺区上下文的问题未解决。

准确状态见 [SERVER §9](SERVER.md#9-实验性冷档模块) 和
[EXTRAFEATURES §3.6](EXTRAFEATURES.md#36-多区分片扩展与冷档参考)。
