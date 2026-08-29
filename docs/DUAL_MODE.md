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
覆写新会话；顶号踢人广播携带 `exceptHash`、`issuedAt` 和 `sId`，消费侧严格校验字段并回读对应区的
sess，丢弃陈旧或指向自己的事件。封号/撤销事件缺省 `sId`，保持账号级踢人语义；显式损坏字段不会降级
成账号级操作。

`stream:kick` 只是组内 best-effort 的本地开发接缝：每节点从启动后的新条目开始读，没有 outbox 或送达
确认；在线表也只登记 Lobby 连接，不包含 GameRoom。不能把它描述为全节点、全房间立即下线能力。相关
额外功能边界见 [EXTRAFEATURES §3.2](EXTRAFEATURES.md#32-gm账号管理与强制下线参考)。

## 2.6 角色存在性

账号、角色目录与玩法档案分属不同真源：外部服务只记录 `(userId, serverId)` 是否已有角色，本仓 Redis/
MySQL 保存该区的玩法数据。完整边界见 [SERVER §3](SERVER.md#3-数据边界) 和
[WEBPLATFORM §2](WEBPLATFORM.md#2-数据所有权)。

## 2.7 角色登记接缝

本地建档后，只能通过外部 Internal HTTP 契约幂等登记角色，不能直写账号库。建档顺序是先写本地玩法
档案、再登记外部角色行——反序会留下“登记存在但档案缺失”的不可自愈状态。Lobby `onJoin` 会等待
`ensureCharacterReady(uid,sId)` 的有界 flight；初始化失败或超时会拒绝本次 join，不会公开一个未 ready 的
seat。底层 flight 的迟到结果仍会被观察，并由 repair/下一次 join 收敛；ready 后的在线工会索引仍是
best-effort。适配器边界见 [WEBPLATFORM §6](WEBPLATFORM.md#6-服务端边界)。

## 3.3 MySQL 区谓词

当前 `user_currency`、`currency_ledger`、`mail`、`match_results` 与 `gameplay_outbox` 的按区读写谓词均携带
`server_id`；`readBack`、邮件领取和后台重放都会按区回读/更新。`match_index` 是全局 match ID 去重闸，
`singleton_lease` 是全局任务租约，二者刻意不带区。

`user_archive` 与 `user_snapshot_readonly` 使用复合身份 `(user_id,server_id)`；前者的 freeze/thaw、
janitor 与容量 ledger 都按区操作，后者仍没有运行时读写方。`archive_zone_usage` 仅是按区派生统计，
冷档权威仍只有 `user_archive`。规则索引见 [SERVER §12 DB](SERVER.md#db--mysql)。

## 3.4 幂等 ID

按区操作的 `op_id` 派生输入包含用户、区号、业务域和稳定 `clientReqId`。调用方重试必须复用同一个
`clientReqId`；换区或换业务域必须派生不同 ID。asset effect 的 `applied` marker 另有同槽 payload
绑定：同一 ID 携带不同 effect 会稳定报冲突；不应与仍按 ID 去重的通用 RPC 占位混淆。

## 3.5 区上下文

`core/infra/keys.ts` 通过 `AsyncLocalStorage` 的 `zoneCtx` 构造 per-zone Redis 前缀：

- Lobby 每条 RPC 在已认证 `auth.sId` 的 `zoneCtx.run` 中执行。
- 无请求上下文的领域 worker 必须从权威数据行恢复 `sId` 后再访问 per-zone key。
- `GROUP_ZONES` 非空时，缺少上下文的 per-zone key 构造会 fail-fast；为空时回退 s0。
- `sess` 使用全局项目前缀但把 `sId` 作为显式键分量；`active:lru` 使用 `P()` 分区，s0 保持 legacy
  物理 key，s1+ 使用区前缀。

业务代码不能手拼 key。分类和例外见 [SERVER §3](SERVER.md#3-数据边界) 与
[SERVER §12 R](SERVER.md#r--redis)。

## 3.6 无请求上下文的数据处理

只有记录本身携带合法 `server_id` 的后台路径才能据此重建上下文。当前 outbox relayer 从 intent 行恢复
区号，match consumer 从已校验 evidence 恢复区号。不能把这条规则泛化成“所有 worker 自动知道区号”。

可选支付参考 `core/economy/purchases.ts` 的回调是同类路径的第三例：`purchases` 带 `server_id`，下单时
写入当前区，支付回调没有请求上下文，按订单行的 `server_id` 重建区上下文再落对区钱包与缓存。它默认
关闭（`PAY_ENABLED`），但区列语义与其余经济表一致。

freeze worker 不从 `GROUP_ZONES` 猜后台范围；启用时必须显式配置唯一的 `ARCHIVE_ZONES`，并在每区
`zoneCtx` 中扫描该区 LRU、读写复合身份冷档。它仍是默认关闭的实验模块，而不是多区拓扑能力。

## 4.1 GameRoom 区隔离

`app.config.ts` 用 `filterBy(["sId", "mode"])` 隔离常规 `joinOrCreate`；`GameRoom.onAuth` 规范化并校验区号
与玩法，`onJoin` 再比较认证值和房级 `sId`/`mode`，兜住 `joinById`。房间把区号写入 match evidence。

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
  条目；落 MySQL 后 ACK，并在 PEL 为空时按安全位点 trim。坏 shape/version/replay 先与原始 fields 一起
  原子写入同槽 quarantine，成功后才 ACK 来源 PEL。
- match 流处于 legacy/v2 排空、v3 持续生产的三流迁移期：三者同槽物理隔离，生产只写 v3；v2 按冻结
  shape 校验，v3 在生产和消费两侧 validate + replay。三条来源流分别维护 PEL、claim、safe trim 与深度探针。

不要把“每节点独立游标”写成所有 stream 的共同规则，也不要把其中任一种描述为外部送达保证。

## 5.1 配置登记

- `core/infra/config.ts`：`GROUP_ZONES`、Redis URL、超时和跨模块常量的主要登记点。
- `core/infra/keys.ts`：项目/区前缀、hash-tag 与 key 分类的运行时真源。
- `sql/schema.sql`：`server_id` 列、索引与全局表例外的 DDL 真源。

新增按区数据时，要同时检查入口上下文、Redis key、MySQL predicate/unique key、幂等派生、后台重放与
跨区测试，不能只增加一个 `server_id` 字段。

## Archive

freeze/thaw 仍是实验模块。thaw 接缝已经被部分 player/UoW 路径调用，freeze 默认关闭；启用要求明确的
`ARCHIVE_ZONES`。冷档身份、LRU、worker、janitor 游标和容量 ledger 已按区隔离；跨全部区/桶的扫描预算
包含空探测，Redis 水位无法证明或每区行/字节投影超限时均保留热档。

旧版全局 LRU 条目没有区号，不能自动归属。存量部署须用权威每区用户清单有界读取
`user.lastActiveAt` 后重建各区索引；仓库不提供把旧全局成员直接拆区的安全捷径。`active:lru` score
还可能被 `ZADD XX GT` 提升为 skip/error 的调度退避边界，不能取代真实活跃来源 `user.lastActiveAt`。
容量 ledger 使用
`JSON_STORAGE_SIZE` 做 admission 记账，但不等同于物理磁盘容量，也不提供备份、分片迁移或为腾空间
自动删除冷档权威。热档只读原子接受当前 N 与 N-1，普通及后台写在各自锁/无 fence apply 前完成对账；
freeze 迁移后才取快照，thaw 与热档共用连续 migration registry 和深校验器。当前 v1→v2 会补缺失的
`characterRegistrationCheckedAt="0"`、保留合法旧值并 bump `ver`，畸形/future/WRONGTYPE 均 fail-closed。

准确状态见 [SERVER §9](SERVER.md#9-实验性冷档模块) 和
[EXTRAFEATURES §3.6](EXTRAFEATURES.md#36-多区分片扩展与冷档参考)。
