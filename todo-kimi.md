# TODO-KIMI —— 2026-08-19 代码深扫新发现（待分诊）

> 来源：2026-08-19 AI 辅助代码深扫（todo.md 登记项之外的新发现）。
> 本文档是**临时登记处**：条目确认后应迁入 [todo.md](todo.md)（剩余项唯一登记处），迁完即删本文件。
> 每条含 文件:行号 入手点；标注「存疑」的需先复核再排期。

## 客户端（apps/client/src）

### 高

- **join 建连全程无超时，join 黑洞 = 永久软锁**
  `net/RoomClient.ts:214` / `net/WebSocketClient.ts:156` / `Main.ts:159` 三处 doJoin/enterBattle 均无 deadline。
  SDK 侧实证：`@colyseus/sdk` 的 matchmake HTTP 从不设 `xhr.timeout`（`ontimeout` 死代码），
  `consumeSeatReservation` 只等 onJoin/onError 两信号。服务端/LB 接受连接但永不响应时：
  `enterBattle` 永不返回 → `inBattle=true` 锁死重入 →「进入游戏」按钮永久失效；
  大厅 `joining` 悬挂连带 `leave()`/重试/`authInvalid` 链（`pages.ts:62`）全卡死，只能杀进程。
  **要做**：双侧 doJoin 加 ~15s deadline，超时走既有失败回滚。

- **session 复合事件无串行化：双弹窗 + 同视图重复 setup 叠事件**
  `view/pages.ts:60-101` / `net/session.ts:85`。战斗中被踢时 `authInvalid` 与 `battleLost` 几乎同时到达，
  各自 `openConfirm` + 各开一次登录页；`ViewMgr.open("Login")` 去重使两次拿到**同一 LoginView 实例**，
  `setup()` 重放导致 `btn_login.onClick` 叠加（cc `node.on` 不去重）→ 按钮双倍触发贯穿视图存活期
  （下游幂等兜底，是噪声非雪崩；AreaList/Notice 同理被放大）。
  另：`notifyBattleLost` 缺 `notifyAuthInvalid` 那样的 `isLoggedIn()` 闸——已登出后迟到的 battleLost
  会在登录页上弹「战斗已结束」。
  **要做**：session 事件串行化出口（随 D2 最省，可先行小修）；battleLost 补 `isLoggedIn()` 闸。

### 中

- **onDrop 即刻拒全部在途 RPC，与 SDK 发送队列语义冲突（存疑，取决于服务端幂等覆盖）**
  `net/WebSocketClient.ts:198-201` vs SDK `Room.ts:283-284`：连接未开时 `room.send` 不丢不错，
  进 `enqueuedMessages`（上限 10，FIFO 挤最旧），重连成功即刻补发。onDrop 判 CONN_LOST 的信封
  重连后**仍在服务端执行**：幂等写接口若调用方没复用同一 `clientReqId` =
  「客户端报失败 + 服务端已落账」状态撕裂。
- **完全没有 onShow/onHide（切后台）处理**：全 src 无 `onShow/onHide/EVENT_SHOW`。
  微信后台定时器冻结、ws 随时被系统回收；回前台只能等 SDK 重连退避（15 次 × 最长 5s ≈ 分钟级）
  才弹「连接断开」。另 SDK 默认 `reconnection.minUptime=5000`：进房 5 秒内掉线**不重连直接 onLeave**——
  弱网下「进战斗秒掉」无重连机会。与 token 持久化同属「真实用户每天必踩」，建议提级进 D2 验收。
- **`onEnter` 后半段无兜底：登录成功后开 Home 失败 = 黑屏活会话**
  `view/pages.ts:209-211`：`h.close()` 后 `await openHome(...)` 抛错（FGUI 包未发布/扩展未挂）时
  会话已建、大厅已连、屏幕无 UI，错误逃逸成 unhandled rejection。
  同类：`pages.ts:144` `wireSessionEvents(() => { void openLogin(...) })` 把 rejection 直接 void 掉。
- **公告按钮失败静默**：`pages.ts:213,254-261` `view.onNotice = () => { void openNotice(); }`
  无 catch，用户点击零反馈（对比隔壁 `openAreaList` 有 catch + openConfirm，明显漏写）。

### 低

- `Main.ts:284` 每 5s 一条 RTT console 日志，真机有开销；常规路径日志收进 debug 开关。
- `chat()`/`castSkill()`（`RoomClient.ts:327-335`）缺 `dropping` 闸（`move`/`ping` 有）——
  重连窗口里的过期指令会延迟补发。
- `closeSlot` 的 `await slot.ready`（`RoomClient.ts:277`）无超时：join 悬挂则 closing promise
  永不落定，泄漏挂起的 SDK room 半成品（调用方 fire-and-forget，是泄漏不是卡死）。
- `LoginLogic.attempt`（`logic/page/LoginLogic.ts:63-69`）吞掉全部错误细节，线上只剩
  「登录失败，请重试」，HttpError 的 status/code 无从排查。
- `initPortal` fail-fast 故障形态是纯黑屏（`Main.ts:107` + `core/http.ts:63-66`），
  意图正确（⛔ 回退）但屏上无任何提示。
- `Main.ts:305-308` `$(player).onChange` 解绑器被丢弃（存疑）：房间长寿 + 高 churn 下缓慢内存增长，
  demo 规模无害。
- `FguiView.ts:23-24` 找不到 Canvas 只 console.error，随后 `GRoot.inst` 抛**字符串**（非 Error），
  下游 `e instanceof Error` 判断落空。防御缺口。
- `core/http.ts:8` 模块初始 baseUrl 硬编码 localhost：区服目录加载失败（areaLoadFailed）时
  公告仍可点，打到初始 baseUrl 而非所选区（存疑，运行时寻址语义，与「发布期硬校验」相邻但不同）。
- `WebSocketClient.ts:136-138` join 误导性报错（存疑）：房间刚死后重 join 撞
  「换号必须先 leave()」，实际原因是连接已死。开发者体验问题。

## 服务端（apps/server/src）

### 中

- **`onBeforeShutdown` 是单槽 setter，第二次注册静默覆盖第一次**
  `index.ts:35-36`；`@colyseus/core` Server.cjs:257 实证为单字段赋值非数组。
  `stopCharacterRepairWorker` 被 `closeWebPlatformClient` 静默丢弃：SIGTERM 时 repair worker
  不停调度、在途不等收尾。数据有 durable 兜底不丢，但机制失效是静默的。
  **要做**：合并为单一注册函数内顺序调用；E1 停机项顺带处理。
- **Waiting 期技能自杀的死亡状态残留进正式对局**
  `rooms/GameRoom.ts:201-209`：开局转换只清 `deathOrder`/`departedNames`，不重置 hp/alive。
  后果三连：带尸体进对局不可动；`maybeSettle` 数 alive≤1 提前收局；预死者从结算证据链
  participants **永久消失**（matchId 落库即永久事实）。fork 者会原样继承。
  **要做**：开局转换时重置所有玩家 hp/alive。
- **HTTP 侧无大包闸（ws 有 maxPayload 64KB，HTTP 无等价物）**
  `@colyseus/core` router 调 better-call `getRequest` 不传 bodySizeLimit；chunked 编码时永不截断。
  `/matchmake/*`、`/admin/kick`、`/pay/wx-notify`（校验都在 body 全量缓存之后）= 未鉴权内存 DoS 面。
  与 D4 同属对外部署前收口。
- **outbox `applied:{uid}` 裁剪名存实亡，I5 前提落空**
  `core/infra/outbox.ts:179` + `core/match/relayer.ts:57`：trimApplied 唯一触发点是 relayer
  每成功 relay 一行的 1% 概率顺路；购买主流程（purchase 同步成功 + markOutboxDone）**不经 relayer**，
  健康系统里 trim 机会趋近于零。durable noeviction 实例、无 TTL，随购买/领附件无界缓涨。
- **relayerTick 在 RC 事务内做网络 IO**
  `core/match/relayer.ts:34-71`：FOR UPDATE 行锁 + 租约行锁被 Redis apply / ensureLive（含
  WebPlatform HTTP）放大到秒级；替补实例 `tryAcquireLease` 阻塞撞 1205；批内单行失败整批回滚
  放大重放量。**要做**：锁外 apply + 短事务批量标 done。
- **`getBalance` 硬依赖 cache 实例可用性**
  `core/economy/currency.ts:18-32`：cache 挂掉时 ioredis 离线队列使命令**挂起而非报错**，
  余额读拖到超时变 INTERNAL（真源 MySQL 活着）；`purchaseTx` 提交后 `invalidateBalanceCache`
  失败会把已成交购买向客户端报错。**要做**：cache 操作 `.catch` 降级回源。

### 低

- `core/infra/config.ts:45-53` `envInt/envFloat` 不防 NaN：`RPC_RATE_CAPACITY=abc` → NaN 进
  tokenBucket Lua → 每条 RPC 抛错变 INTERNAL。配置笔误从「启动即拒」退化成「运行期全灭」。
- `core/infra/config.ts:18-28` 根 `.env.development` 不看 NODE_ENV 一律加载且已入库：
  生产从源码树部署时漏配 env 会被 dev 值静默回填（WEBPLATFORM_SERVICE_SECRET 有生产闸，
  PORT/PROJECT_ID/REDIS_* 没有）。
- `websocket/LobbyRoom.ts:56` 无 Authorization 头时 token=undefined 直达 verify 内部
  `.length` 抛 TypeError → 客户端收 INTERNAL 而非 AUTH_REQUIRED（GameRoom.onAuth 有显式检查）。
- DB5 未接线：`mysql.ts:72` `retryOnContention` 只有压测工具在用；purchase / claimMailAttach /
  handleWxPayNotify / relayerTick 遇 1213/1205 直接 INTERNAL（靠幂等重试收敛，规则文本与实现脱节）。
- `freezeWorker.ts` sweepOnce/janitorSweep 长轮内连续 skip 不续租：连续 skip 超 LEASE_TTL_S(15s)
  → 租约被顶替 → 健康 worker 下一次真 freeze 时守卫 0 行自杀重启（存疑：需 750+ 连续 skip，
  触发窗窄；写路径有守卫兜底不双写）。
- `db-bootstrap.ts:165-172` `mail.attach_effect` 吞 1060 不校验 shape，与同文件 match_results
  迁移的 INFORMATION_SCHEMA 严格校验自相矛盾。
- `rooms/GameRoom.ts` 结算后房间不自拆：phase=Settle 后只要有客户端赖着连接，simulation interval
  永远空转（20fps 持续 patch 死局）。
- `websocket/guild/join.ts` 幂等缓存（60s）过期后重试重跑 handler：档写入幂等，但
  `emitGuildEvent("memberJoin")` 会双发。
- `http/admin/kick.ts` 节点侧零日志：踢人命中/未命中都无审计痕迹。
- `rooms/GameRoom.ts:66` `matchSeed = Date.now()>>>0`：同毫秒创建的房间共享种子（存疑，demo 路径，
  证据链已记录种子可重放）。
- `websocket/rpc.ts:55-93` rpc-budget 探针链对永不 settle 的 handler 永久存活（4ms setTimeout 链），
  每卡死请求 ≈ 250 次/秒定时器唤醒。
- E1 停机挂载清单补充：`startKickConsumer`/`startMailWakeLoop`（各持一条 duplicate 阻塞连接）、
  `startStreamDepthAlert`、`startInfraMonitors` 均未注册停机钩子。
- 死代码：`core/infra/outbox.ts:98` `bumpAttempts` 无调用方；`net/session.ts:84` 的 `connId`
  只写不读。

## 深扫总评（留档）

- 客户端：时序防御密度远高于常见 demo；剩余风险收敛为两个原子短板——**「等可能永远不来的信号」
  缺统一超时纪律**（join 黑洞的共同根）、**多事件并发到达无串行化出口**。两者宜在 D2 落地前先行小修。
- 服务端：幂等/fence/冷档/outbox 正确性主干经得起推敲，无高危；剩余风险三类——生命周期钩子
  静默失效、边界防护不对称（ws 有大包闸 HTTP 没有、config 一半严格一半放行 NaN）、低频路径漂移。
  共同点是**文档宣称的保证比实现强**，建议以「机检或显式降级文档承诺」二选一收口。
