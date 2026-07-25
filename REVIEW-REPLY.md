# 关于这批评审的回复

> 草稿，未入库跟踪（`REVIEW-REPLY.md` 在仓库根，发完可删）。v2 · 2026-07-25

## 0. 先说结论

39 条逐条开代码核过，**没有一条判成「不成立」**。唯一一条我们初判不成立的（登录页叠在仍在跑的战斗上），复核后自己推翻了——你没看错，只是触发路径是 `onConnLost`，不是 authInvalid/battleLost 那两条。

分布：**已决策 4 / 已成文待办 16 / 真没做 19 / 不成立 0**。将近一半是我们确实没做、且仓库里找不到任何登记的缺口。

有三条直接打在我们刚提交的修复批次上，**全部成立**。这三条**已经改完**（commit `0281661`），每条各配了变异测试：

| 你的点 | 复核结果 | 处置 |
|---|---|---|
| `login_diverged` 的 reason 撑爆 `VARCHAR(64)` | 成立，且比你说的更糟：实测 `sql_mode` 含 `STRICT_TRANS_TABLES`，直接抛 `ER_DATA_TOO_LONG(1406)`，不是截断而是**整行写不进**，还被我们自己的 `.catch()` 吞掉。<br>⚠ **顺藤还摸出一处更严重的**：`banUser(uid, reason)` 的 reason 来自**运营输入**，而末尾 `await auditLogin(...)` **无 catch** ⇒ 超长理由让 banUser 整个抛错，但 `account.ban()` 与踢人**已经执行完了** ⇒ GM 工具报「封号失败」，实际人已被封，运营会据此误判/重试/升级 | 已修：列加宽到 255 **且**两处 `auditLogin` 写入侧集中钳制。双保险的理由是 split 下账号库**没有自己的 bootstrap**，那边可能仍是旧列宽，只有写入侧钳得住；钳制 ⛔ 不切断代理对（半个 emoji 是非法 utf8mb4，MySQL 照样拒） |
| `npm run sync:shared -- --force` 的 `--force` 落到了 sync-client | 成立。npm 展开后是 `node sync-shared.mjs && node sync-client.mjs --force`。**那句提示恰恰是我们上一轮为了修「文案指向死路」而加的**，结果又造了一条死路 | 已修：改用 `SYNC_FORCE=1`（环境变量对链条里每个脚本都生效）。实证顺序：删 9/23 → 熔断；旧写法 `-- --force` → **仍被拦住**（正证明它到不了）；`SYNC_FORCE=1` → 真放行 |
| 熔断 `&&` 与注释的「或」不符 | 成立。注释写「≥20 个**或** ≥30%」，代码是 `&&`。shared 只有 23 个源文件，删 9 个 = 39% 超比例但不够 20 个 ⇒ 不熔断。**我们之前的人工实证移了 21 个文件，两个阈值都过了，没探到边界** | 已修：判据抽成两脚本共用模块 + 改回「或」+ 按你要求补表驱动边界回归（钉住 9/23 这个洞与两闸各自上下沿） |

验证：typecheck 三端 + verify:sync / int 115 / 服务端单测 28 / 客户端 79。

---

## 1. 已决策（刻意选的，有记录）

| 你的点 | 我方结论 | 依据 |
|---|---|---|
| `stream:kick` 是否已是跨组协调层 | **不是，且是刻意的**。门户刻意不持 coord、不广播，跨组送达保证有意识地移交给 GM 工具逐节点遍历 | `docs/WEBPLATFORM.md` §5 决策记录、`docs/HANDOFF-M12.md` §8.3、`docs/SERVER.md` 09·G7b |
| 建议跨组共享协调层 + 版本广播 | 这套 M12d 中段真建过，后来刻意砍掉四项（token_epoch fence / maxEpoch 快检 / revocation outbox / 周期回权威）。**但那份决策只论证了封号撤销不需要 epoch，没论证跨组顶号也不需要——不能拿它驳回你**，见 Q3 | `docs/HANDOFF-M12.md` §9 决策记录 |
| 生产禁用支付端点或返 501 | 方向一致、实现不同：项目统一用 fail-closed 共享密钥（未配 secret 即拒），`pay/wxNotify`、`admin/kick` 都是这个范式。且下单端点压根不存在，无面可禁 | `http/pay/wxNotify.ts:17`、`http/admin/kick.ts:10` |
| db-bootstrap 未为旧经济表补 server_id | 事实无误，但 U3 拍过：当前定案 greenfield，bootstrap 只保证新库正确，存量 backfill 刻意不进幂等脚本；§3.2 已把六张表 ALTER 逐条写好备用。**前提是真 greenfield**，见 Q1 | `docs/DUAL_MODE.md:540`（U3 定案）、§3.2 |

---

## 2. 已成文待办（没做，但已登记）

| 你的点 | 登记位置 | 档位 |
|---|---|---|
| WebPlatform 六个端点无鉴权 | **W1**，`docs/WEBPLATFORM.md` §4；源码 `WebPlatform/src/index.ts`、`platform/httpAccount.ts` 都有指回 W1 的注释 | 上线前必做。你说的 `0.0.0.0` 属实；「伪造 char_registry ⇒ 首进区 USER_DATA_LOST」的因果链我们复核也成立，**且是永久毒态** |
| tsx 在 devDependencies | `todo.md` E1 首条 | 首次真实部署前 |
| 缺 build/dist、Dockerfile、编排 | `todo.md` E1 | 同上。⚠ E1 列的四进程**不含 WebPlatform**，是登记缺口，我们补 |
| 缺两物理组测试拓扑 | `docs/DUAL_MODE.md` §5.4 / §6.3 | M14 起（driver/presence 仍是注释态，无法先行） |
| 无 SIGTERM drain | `todo.md` E1 | ⚠ 一处修正：网关不是裸奔，Colyseus 默认注册 SIGTERM→房间收尾；真正空白的是 **WebPlatform / relayer / freezeWorker 三个入口** |
| 无 readiness | `todo.md` E1 | ⚠ 小修正：WebPlatform 的 `/healthz` 已带 `SELECT 1`，缺的是游戏服侧与统一语义 |
| 无真实监控告警 | `todo.md` E3 | 无保留，全部成立 |
| 微信正式入口不存在 | `CLAUDE.md` 现状段、`docs/SERVER.md`、`docs/OVERVIEW.md` | ⚠ **范围要收窄**：缺的只有客户端「调 `wx.login` 拿 code」这一处接线。服务端 `/account/wx-login`、门户 code2session 全链、客户端 `wxLogin(code)` 封装、shared `ApiPath` 都已就绪并装配。**登记最弱的一档，无编号，我们补一个** |
| 支付回调仍是共享密钥、非 APIv3 验签 | 只有代码注释，**docs 账本没收** | 上线前必做，成文强度不够，补进账本 |
| 退款未做 | `core/economy/purchases.ts` 注释（等口径拍板：T+1 账单 vs 主动查单） | 非纯工程派活 |
| 客户端生命周期未成状态机 | `todo.md` D2（app/session/scene/room 四层） | ⚠ **但你点到的三处泄漏是可独立小修的正确性 bug，我们不拿 D2 挡掉，本迭代改** |
| 建角无重试/outbox | `docs/DUAL_MODE.md` §2.6 明写 must-succeed 仍然要求，当前 best-effort 是过渡态 | U6。你说的「注册完成前调依赖角色的 RPC」为真，但影响轻：拿到 `user:null` + 10s 负缓存，不污染真档 |
| 多区冷档未完成 | `docs/DUAL_MODE.md`、`docs/HANDOFF-M12.md` 均写死「⛔ 补齐前不开多区+freeze」 | ⚠ **你多提的那半句是真缺口**，见 §3 |
| U6 发奖无基础 | `docs/HANDOFF-M12.md` U6 | ⚠ **有一处比 U6 更急**：§4.1 明文要求「GameRoom.onCreate 读 options.sId 设房级区上下文」，而 `rooms/GameRoom.ts` 把 options 整个丢弃——规格与代码漂移，且进度表把 M11 标成已落地。建议把「房级 sId + MatchEvidence 带 sId」从 U6 拆出来单排 |
| GM 只是规格 / split 审计写错库 | GM：`docs/GM-TOOL-SPEC.md`（节点发现/重试/告警/巡检都是规格硬性要求，运营侧实现是**刻意分工**）；审计：**W2** | 均标上线前必做。**我方倾向把 GM 工具当上线阻断**——§8.1 那条「不自动收敛」是刻意接受的代价，但前提是工具真的存在 |

---

## 3. 真没做（无任何登记）

### 建议现在就认领

| 你的点 | 复核结果 |
|---|---|
| **split 两步无 fence，旧 token 覆盖新 token** | 成立，按上线阻断排。`platform/httpAccount.ts` 的 `remoteVerify` → `writeGroupSess` 两个 await 之间可任意交错。**终态比你说的还差一点**：`session.ts` 见 hash 变化就踢、判别位是本次 newHash ⇒ 迟到的旧写不仅覆盖缓存，还会**反手踢掉合法的新登录端**；快路径零回源 ⇒ 旧 token 一路放行到 sess TTL 3d。<br>⚠ 另：我们代码注释里写的「split 天然无此竞态」是**错的**，见 §5 |
| **多区邮件与公会未按 sId 隔离** | 成立，同意 P0 定级。不只 list：`markRead` / `claimAttach` 全无 server_id 谓词；`push.ts` 的 `guildOf`/`guildOnline` 无区维度而公会 Redis 键是 per-zone ⇒ 同 gid 跨区塌进同一内存索引。<br>⚠ **措辞更精确一点**：claimAttach 会读到并领取他区邮件，但奖励仍靠行内 server_id 落对区——串的是**可见性与领取权限**，不是把钱发错区 |
| **Lobby 单独死亡 → 登录页，GameRoom 仍在跑** | 成立。`Main.ts` 只订 authInvalid/battleLost，**没订 connLost**；`pages.ts` 的 connLost 处理完全不碰战斗态；`closeLobby()` 只关面板从不 leave ⇒ 战斗全程大厅 WS 活着、会独立死；`inBattle` 恒真 ⇒ 继续渲染战斗、重进被幂等早退吞掉，玩家彻底卡死 |
| **登录页叠在仍在跑的战斗上** | 成立（我们初判不成立，自查后推翻）。触发路径是 connLost：重连耗尽 → `notifyConnLost` → 唯一订阅者是 pages → 登录页画在还在跑、还在渲染、**还接触摸事件**的战斗之上。authInvalid/battleLost 两条确已被上一批修复覆盖，但那次 commit 自述范围就不含 connLost |
| **GameRoom 进房失败后没退掉仍活着的 Lobby** | 成立，**且没被我们上一批修复覆盖**。`Main.abortBattle` 只 leave 战斗房就 openLogin——那批修复自陈盘点了三条路径，abortBattle 不在其列。后果确定复现：第二次点才进，且旧连接会被新登录当顶号踢，玩家先看到一条误导的「账号已在其他设备登录」。**修法一行**，但我们打算把「回登录页」收敛成单一出口，否则下次加路径还会漏 |
| **大厅连 `getBaseUrl()`、战斗连所选 `wsUrl`** | 成立，客户端侧零登记。<br>⚠ **唯一澄清**：今天打不出来（目录还是 demo 静态表、所有区同 wsUrl；单组下 GROUP_ZONES 通常为空即放行），但 W4 或 M16 任一落地就是必现事故 |
| **`GROUP_ZONES` 非空时应强制 `FREEZE_ENABLED=0` 并在加载期拒绝** | **这半句是真缺口**。「⛔ 补齐前不开多区+freeze」目前只是散文，两个 env 解析完全独立、无任何组合断言，`config-guard.test.ts` 也无此用例 ⇒ 现在能正常启动。半小时的事，与 `keys.ts` 的 zoneCtx fail-fast 同范式，单开一条 |
| **CI 只初始化一个库，证不了目标部署形态** | 成立，与「split 集成测试同进程」合并成一条。⚠ **要区分**：现有集成测试对 in-process 形态有效，失效的只是 **split 形态的推论**，别读成「集成测试没用」 |

### 其余

- **支付下单端点根本不存在** —— 成立且无登记，最该认领并进账本。`purchases.ts` 实现了但没装配任何端点，全仓 grep 无调用方 ⇒ 客户端物理上拉不起支付。反过来也说明你担心的「看起来存在但不安全」在下单侧不存在。
- **支付对账未做** —— 成立且无登记。发币侧幂等三重闸是有的（状态 CAS + `uk_wx_txn` + ledger 幂等）⇒ 缺的是**事后核对与差异发现**，不是重放会多发币。
- **选服结果应含 HTTP/WS/Portal 三类端点** —— 这半零登记（`IAreaServer` 只有 wsUrl，W4 也只承诺 wsUrl），真缺口，建议随 W4 定契约；coordinator 那半已在 D2 目标里。
- **`exceptHash` 不是单调栅栏，积压事件可能误踢赢家** —— 机制层面成立。⚠ 两点保留只影响定级：触发窗很窄（流游标从 `$` 起、重启不重放，要出事得消费循环卡顿超过「下一次登录 + registerOnline」）；后果是赢家被踢一次、重登即恢复，无数据损坏。

---

## 4. 你的方案，我们的表态

**直接采纳**

- **sessionVersion / 单调量 CAS** —— 方向采纳。但**不必一步到位**：先把 `writeGroupSess` 改成单条 Lua，只在 oldHash 仍等于 verify 时刻读到的值时才覆盖，即可止血。做完整 CAS 需要扩 `/verify` 契约（当前响应没有任何单调量可比），见 Q2。
- **endpoint + sId 纳入连接复用判据** —— 采纳，成本低，顺带兜住选服连错组。
- **统一 session coordinator** —— 采纳，已在 D2 目标里；「选服结果含三类端点」这半要先定契约，随 W4 一起。
- **客户端状态机** —— 采纳但拆两段：三处泄漏本迭代小修，四层分层留 D2。
- **建角 outbox + 有限重试** —— 采纳，已排 U6。
- **端点鉴权** —— W1 静态密钥止血 + **绑定地址收内网**同批做。
- **`/ban`·`/revoke` 加限流与审计主体** —— 采纳；审计主体与 `reason` 列宽**一起改表**。⚠ 列宽这半我们已经先改了（见 §0），你那条催出了一个更严重的 `banUser` 问题，感谢。
- **`PAY_ENABLED` 返 501** —— 虽判「已决策」，但你要的是「明确告知未上线」，而 fail-closed 返的是 401（不区分「没鉴权」和「功能未上线」）。加个开关不亏，当小改动接受。

**有不同意见 / 要先拍板**

- **跨组共享协调层 + 版本广播** —— 这套我们刻意砍过，但砍的理由**全部建立在「有 GM 兜底」上，而顶号明确不在 GM 流程内**（`docs/GM-TOOL-SPEC.md:202` 白纸黑字写着顶号「系统自动完成、不需要 GM 工具介入」——多组下这句是**假承诺**）。所以 M16 前只有二选一：重开这个决策，或把「跨组顶号不收敛、旧端最长 3d」写进已接受边界并同步改掉那句。要人拍板。
- **HMAC / nonce / mTLS** —— 认可方向，但这是对 W1 方案的**实质升级**（W1 范式本身不防重放），不是同一件事。倾向另开条目、与 W1 分批。
- **「Lobby ready 前等建角完成」** —— 既没采纳也没否决过，代价是阻断连接，放 U6 一并评估。

**三处措辞纠正（不影响你的结论）**

1. split 那条不是「`c7ab375` 没修干净」——那次修的是另一条路径，你的窗口从来不在它射程内。
2. 「网关无任何 SIGTERM 处理」不准确，Colyseus 默认有；空白的是另外三个入口。
3. 登录页叠战斗的触发路径是 connLost，不是 authInvalid/battleLost。

---

## 5. 我们要跟着改的文档口径（自曝）

已经改掉的（commit `be26c1b`）：`core/auth/kickBus.ts` 与 `core/infra/redisRoute.ts` 的 coord 口径已改成「**本组** coord、扇出半径只到组内」；`DUAL_MODE`/`WEBPLATFORM` 的账号平面定位已收口。

**仍然在错、我们认领**：

| 位置 | 问题 |
|---|---|
| `platform/inProcessLogin.ts:52` | 「split 天然无此竞态」——**说错了**，正是你这条打中的地方，要收窄 |
| `core/infra/config.ts:161` | 「专用 HA 实例，唯一合法跨组通道」——过期口径，与已改的 kickBus/redisRoute 打架 |
| `docs/GM-TOOL-SPEC.md:202` | 顶号「系统自动完成，⛔ 不需要 GM 工具介入」——多物理组下是假承诺 |
| `docs/DUAL_MODE.md:18` + `docs/HANDOFF-M12.md:24` | 「split 全链 e2e 绿」——同进程同库，**过度声称** |
| `docs/DUAL_MODE.md:24` | 「经济按区隔离」——因邮件那条属**过度承诺** |
| `docs/DUAL_MODE.md:434` §4.1 vs `rooms/GameRoom.ts` | 规格漂移（见 §2 U6 那行） |

> `docs/DUAL_MODE.md:232` 也有一句「唯一合法跨组通道」，但它在 ⚑ 定案横幅**之下**，按本仓体例属**刻意保留的历史推导**，不算问题。

---

## 6. 回问

1. **（最急）这次上线是否 greenfield？** 若要接已有玩家数据的库，U3 前提当即作废，存量迁移要从「已决策」升成上线阻断。
2. **`/verify` 契约是否扩单调量？** 这决定 split 竞态的修法，且等于部分回滚我们砍掉 token_epoch 的决策。若只做轻量 Lua CAS 则不必扩契约——你更倾向哪种？
3. **跨物理组顶号：M16 前重开跨组协调层，还是明确写成刻意接受的边界？** ⚠ 注意：M14 一旦把 driver/presence 挂到 coord，coord 必须**每组独占**——同一个 env 不可能既每组独占又跨组共享，想让 `stream:kick` 跨组必须另开实例。
4. **鉴权分档：** W1 静态密钥 + 内网绑定先止血，HMAC/nonce/mTLS 另立条目——能接受吗？以及 W1 里悬着的「特权层是否独立密钥」请一并定。
5. **GM 工具由谁认领、什么排期？** 这是「服务端不做自动收敛」这条刻意边界的前提。另：精确的「已封仍在线」巡检依赖 presence（M15），当前只能用重跑第二步近似——这个依赖链你认可吗？
6. **支付上线时间点：** APIv3 验签、下单出口、对账是否同批？退款要先拍口径。
7. **portal 端点是否要 per-zone？** 账号平面已定案「一游戏一套 WebPlatform」，那 portal 更可能是全局单点、只有 http/ws 按组下发——契约形状要先拍再写。
8. **账号库拆库口径：** 哪些表归 WebPlatform 库、由谁提供建库脚本。这条不定，split 就没有可执行的部署路径。
