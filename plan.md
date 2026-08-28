# gameStarterKit 当前代码审阅与改进计划

> 审阅日期：2026-08-28
>
> 代码基线：分支 `new`，HEAD `8e07c3b`（P0/P1 核心收口以及 P2-01/P2-02/P2-03 已完成）。该提交包含说明站
> 由 Next/Vite 改写为原生静态站，以及 `docs/EXTRAFEATURES.md` §3.1 的同步修正状态（见 P1-09 复核备注）
>
> 基线之后的改动（复核结束后仍在推进，未纳入本轮逐条复核）：
> `b2fb873` 落库了说明站相关修正（重新引入 og.png + §3.1 文档追平原生静态站），P1-09 中登记的
> `apps/website/README.md` 反引号转义与 `docs/EXTRAFEATURES.md` §3.1 陈旧描述两处即由它修复；此后分支继续
> 推进（卡片布局与部署脚本、本地启动步骤文案、SSH 主机指纹登记等）。
> **说明站移除正在进行中**：`project.metadata.json` 的 `packages.website`、`docs/inventory.json` 的
> `project-extras` 条目，以及 init/verify 工具链、元数据测试与 README/EXTRAFEATURES/PROJECT/
> THIRD_PARTY_NOTICES 的相关登记已在工作树中删除，但 `apps/website/` 目录本身此刻仍有 15 个文件在版本
> 控制内、且有未提交改动——⚠ 该项落库前不要把「说明站已迁出本仓」写成既成事实。移除完成后需整体复跑
> §3 并更新本表（`project-extras` 删除后 `verify:inventory` 的能力条目数由 14 变为 13）
>
> 文档状态：`plan.md` 已纳入 Git，本文件是核心改进优先级的唯一真相
>
> 评估范围：开发期游戏基础框架的正确性、可测试性、可替换性和本地开发体验
>
> 复核记录（过程记录，非代码证据；代码侧结论一律以各条目内的 file:line 为准）：
> 第一轮（2026-08-28，实施方自查，落库于 `a54b791`）逐条核对「完成声明 vs 代码」约 60 条并重跑 §3 基线。
> 第二轮（2026-08-28，本轮，基线 `8e07c3b`）按子系统分 8 组并行复核、每组配一名独立怀疑者做对抗式验证，
> 共 92 条裁决：45 条完成声明经独立复核成立、47 条需要回填（含 10 条 plan.md 未登记的代码缺陷）。
> 两轮结论一致的部分不重复记录；本轮新增的差异统一写进各条目的「复核备注」。
> 真实 Creator 预览和完整 smoke 仍不纳入 Node/本地栈测试的通过声明。

## 1. 计划边界

本计划只给核心框架排优先级。托管、真实支付、渠道、GM、运行辅助、冷档、多区拓扑、Unity、配表和
项目特定业务样例的现状统一记录在 [docs/EXTRAFEATURES.md](docs/EXTRAFEATURES.md)。额外功能不构成
核心完成门槛；但已经进入默认入口的可选代码仍必须可停止、可隔离，不能破坏核心构建和本地调试。

P0 表示继续扩展核心玩法前应先修复的确定性问题；P1 表示把现有 Demo 接缝收敛为可复用框架；P2 表示
在正确性稳定后再做的增强。`✅` 表示当前基线已完成并有测试/门禁证据，`◐` 表示核心接缝已完成但保留
明确限制，`⏳` 表示尚未承诺完成。本文同时保留原审阅证据，避免把 Demo 的边界误写成线上能力。

## 2. 总体结论

项目已经具备有价值的框架骨架：shared 单源、两级源码镜像、第三方锁定、客户端 Logic 纯净守门、
GameRoom ownership、Lobby RPC 登记、外部身份 HTTP 边界，以及 lock/fence/UoW/outbox 等服务端原语。
现有本地单元测试整体稳定。

截至当前分支，P0/P1 的核心收口和 P2-01/P2-02/P2-03 已完成。基线复核时 P1-08 暴露的客户端 ES2017
闸门缺口已由 `d96186b` 修复；其余剩余风险集中在明确未承诺的扩展边界：relayer
仍在持锁事务内等待外部 I/O，archive 表缺少完整区隔离与容量方案，坏 stream entry 的处置和热档
schema 迁移仍待补齐，Game HTTP request schema 尚未直接由 shared validator 生成，match evidence 也
不足以重放完整输入序列。以上限制不影响本轮已完成的核心验收，但不能把
当前 Demo 描述成通用生产框架。

## 3. 本轮验证基线

| 验证项 | 结果 | 实际覆盖与限制 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 含 `verify:webplatform-contract` 契约镜像一致、shared/server/client 三段 `tsc`、`verify:sync` 两段镜像一致且入库 `.meta` 齐全；客户端阶段使用 `apps/client/tsconfig.test.json`，以最小 cc/FairyGUI 桩严格覆盖 `src/**/*.ts`、`test/**/*.ts`，包括 Main/View/装配件与测试 |
| `npm --workspace @game/server run test` | 160/160 通过 | 服务端单元测试；不等于真实外部服务或 Creator 集成已验证 |
| `npm run test:client` | 161/161 通过 | 客户端无头行为测试、运行时 wire/生命周期测试、vendor lock integrity 和客户端 strict include 守门 |
| `npm run test:fgui` | 37/37 通过 | FGUI codegen、registry 与结构契约专项测试 |
| `npm run verify:core` | 通过 | 项目元数据、typecheck、同步、bitECS/vendor/FGUI/inventory/perf 和 client tests 聚合门禁 |
| `npm run verify:all` | 通过 | `verify:core` 加客户端与服务端单元测试 |
| `npm run verify:ecs` | 12/12 通过 | bitECS 哈希及“实际 TypeScript 文件集合 = 锁定集合”均校验 |
| `npm run verify:vendor` | 3/3 通过 | vendored runtime 的内容锁、实际文件集合和本地 WebPlatform tarball integrity 均有测试 |
| `npm run verify:perf` | 2/2 cases 通过 | 固定 seed/input 的 checksum、渲染命令数、snapshot 估算和 sink checksum；计时/heap 不作门禁 |
| `npm run test:faults` / `npm run test:faults:int` | 2 组 98 例 / 4 组 118 例通过 | `test:faults` 跑 unit 两组（server-boundaries 56 例、client-transitions 42 例；共 7 个 fault point）；`test:faults:int` 是其超集，额外跑 Redis/MySQL 集成两组（storage-effects 8 例、character-ready 12 例；共 13 个 fault point）。故障覆盖点必须实际执行并 fail-closed |
| `npm run config:excel-to-json:check` | 通过 | 读取并校验 3 条 item，warnings 0；不会比较缺失或陈旧的生成 JSON |
| client tests 严格编译探针 | 通过 | `apps/client/tsconfig.test.json` 纳入 Main、全部 View、`pages.ts`/ViewMgr 与客户端 tests；Node 桩只证明 TypeScript/API 形状，真实 Creator 类型与资源仍需编辑器验证 |
| 全仓 Markdown 内部链接与锚点 | 通过 | 机检 41 个 `.md` 的全部相对链接与 `#` 锚点，0 处失效 |

本轮（2026-08-28）已在 HEAD `8e07c3b` 上全量重跑上表全部命令，结果与表中一致；其中在本地 Redis/MySQL
上复跑的是 `npm --workspace @game/server run test:int`（97/97）与 `npm run test:faults:int`（4 组、13 个
声明的 fault point 全部实测执行）。端到端 `smoke` 仍需要外部 WebPlatform 与运行中的游戏服，未把它写成
已通过证据。

在 `7ece9ab` + 上述未提交在制品的工作树上另做过一次抽查：`typecheck`、`verify:core`、`verify:all`、
`test:int`（97/97）、服务端 160/160、`test:client`（连跑 5 次均 161/161）、`test:fgui`（37/37）均通过；
说明站自身用例已由 3 例增至 5 例。抽查期间曾出现一次 `test:client` 2 例失败与 `verify:core` 失败，
复跑不复现——原因是当时 `project.metadata.json`、`docs/inventory.json` 等文件正被并行编辑，属对移动
工作树取样，不是产品侧 flaky。⚠ 因此 §3 表格仍以 `8e07c3b` 为准；说明站摘除完成后需整体复跑并更新
本表（`project-extras` 一旦从 `docs/inventory.json` 删除，`verify:inventory` 的能力条目数会由 14 变为 13）。

复核备注：`test:fgui` 的 37 个 codegen/registry 用例是独立基线行，不被 `verify:core` 或 `verify:all` 任何
一条聚合命令包含，需单独执行；`verify:all`（`package.json:43`）在 `verify:core` 已含 `test:client` 的前提
下会重复运行一次 `test:client`。

## 4. 已具备且应保留的设计

1. `apps/shared` 作为协议、错误码、公式和外部契约生成物的零依赖真源。
2. `shared → client → Cocos` 的按字节同步、孤儿检查、删除保护和 `.meta` 管理。
3. bitECS、Colyseus UMD、FairyGUI runtime 的版本与内容锁定机制。
4. Logic 禁止依赖 `cc`/`fairygui-cc`，客户端禁止导入服务端 Colyseus 的守门测试。
5. `RoomClient` 的 slot/ownership、完整 join-options key 和旧 room 回调身份守卫。
6. `ViewMgr` 已有 registry、动态 import、onlyOne 在途合流、close-during-load 取消和 handle 身份/交互计数基础。
7. Lobby RPC 的文件路由登记、pending 配对、幂等 request ID 和稳定错误码方向。
8. 服务端 strict auth、区号复核、session 栅栏和外部 WebPlatform Internal 响应校验。
9. per-user 串行、lock/fence、UoW、ledger/outbox/applied marker 等一致性原语。
10. Redis durable/cache/coord 语义分层、路由校验、Lua SHA 与 `NOSCRIPT` 恢复。

后续维护应沿用这些接缝和登记点；新增能力不得建立第二套网络、协议、镜像或页面入口。明确未承诺的
扩展边界见第 2 节和 `docs/EXTRAFEATURES.md`。

## 5. P0：核心正确性

### P0-01 收口客户端会话、连接、导航与输入竞态 ✅

状态：已完成。`SessionTransition`、join deadline/cancel、slot ownership、统一回登录清理和掉线输入
reconcile 已落地；客户端 session/transport 测试覆盖重复导航、迟到 room、旧 bearer 与 desired stop。

复核备注：登录整段 flow 锁（一个 session、一次 Lobby join）由 `test/pageLogic.test.ts` 的「Login：完整
flow 锁覆盖 HTTP 之后的 continuation」与「Login：进度回调 + 登录幂等」覆盖；`view/pages.ts` 的 flight
合流（`:122-169` `reopenLoginAfterTransition`、`:334-370` `ensureLoginFlight`、`:378-383` `openLogin`）与
「一次最终导航」（`enterInFlight` `:410`/`:417-419`、`openHome` `:497`）目前只有 `test/loginFlight.test.ts`
的源码正则守门——`pages.ts` 绑定 Cocos/FairyGUI，无头 runner 无法导入——没有行为用例，需在 Creator 侧
人工验证。`Main.handleGameplayStartFailure` 自身也无用例，它只是对已测 `returnToLogin` 的调用。

复核备注（已收口）：`WebSocketClient.forgetImplicitOwners` 按 slot 身份回收隐式 ownership，并覆盖 join
失败/迟到、room 绑定失败、物理 `onLeave`、`closeSlot` 以及 `leave()` 的空 slot 提前返回路径。
`webSocketClient.test.ts` 三条专项用例直接验证重复「掉线→重登」不累积闭包、旧 room 迟到回调不清新代，
以及主动 leave 后迟到 join 只释放旧物理 room、不回填记录；客户端与 Cocos 镜像保持一致。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

- `LoginLogic.inflight` 只包住 dev-login HTTP；`setSession → Lobby join → GetInfo → 导航` 位于锁外。
- `RoomClient` 与 `WebSocketClient` 的 `joinOrCreate` 均没有 deadline/cancel，`leave()` 还会先等待在途 join。
- `WebSocketClient.doJoin` 没有冻结本次 `client/endpoint`：join(A) 等待期间 `init(B)`，物理 A 可被记录为 B，
  后续请求错误复用 A；该交错已用探针复现。
- `WebSocketClient.leaving` 是跨 room 的布尔值，leave timeout 成功后也不清 timer。
- authInvalid、battleLost、connLost 和 `Main.abortBattle` 是四套 detached 回登录路径，可能重复弹窗、清理和导航。
- 回登录路径不清会话，下一次登录请求会带上一次会话的 Bearer：`core/http.ts:109-111` 只要模块级 token 非空
  就无条件设 `Authorization`，而 `Main.abortBattle`（`Main.ts:226-237`）与 pages 的 onConnLost 处置
  （`view/pages.ts:86-101`）只 `leave()` + 重开登录页、不 `clearSession()`；于是 `doLogin → devLogin →
  portalRequest(POST, DevLogin)` 携带旧凭证，与 `core/http.ts:95-98` 自身注释「登录时本地尚无 token」矛盾。
- 掉线时 `Main.sendDir` 在记录 desired state 前返回；断线期间松手后重连不会发送 stop，服务端可延续旧方向。

**已实施**

1. 建立单一 `SessionTransition`，完整覆盖登录、setSession、Lobby、character ready、首页导航与失败回滚。
2. join 固化 client、endpoint、完整 options 和 generation，增加统一 deadline、取消和迟到结果释放。
3. Lobby 连接也使用 per-slot ownership；leave 的 timer 必须在先完成分支清理，主动离开状态按精确 room 归属。
4. 所有失效事件进入一个可等待、幂等的 `returnToLogin(reason)` 队列，不再使用散落 IIFE；该出口统一
   `clearSession()`（`net/session.ts:127`，进入 transition 即清态），与 authInvalid 路径
   （`net/session.ts:193-195`，先清态再广播）对齐，使回登录页后不残留旧 Bearer。
5. 输入保存 desired direction + monotonic seq/lease；断线仍更新 desired，恢复后先 reconcile 并重放或发送 stop。

**验收（已通过）**

- join(A) 期间 init(B) 不会错记或复用物理 A；黑洞 join 到期后没有无主连接。
- 任一 await 边界重复点击只产生一个 session、一个 Lobby 和一次最终导航。
- 三类失效事件同时到达只执行一次清理，所有 Promise rejection 都被观察。
- 移动中断线并松手，重连后的第一条有效输入为 stop 或更新后的 desired state。

### P0-02 修复 GameRoom 的运行时边界和状态转换 ✅

状态：已完成。`GameRoom` 的 C2S/S2C runtime validator、phase gate、awaited start lock、全量 reset、
fixed-step clock 和双向身份索引均已落地；`game-room.test.ts` 覆盖故障与确定性 fixture。

复核备注（已收口）：默认播种用 `Date.now()` 与进程内单调序列组合；专项测试冻结同一毫秒连续构造 8 个
真实 `GameRoom`，断言 seed 逐一推进、互不重复，并把输出 seed 重新注入构造器验证可精确回放。不同等待历史
的对照测试则在一侧额外执行 observer join/ping/leave，随后比较相同 seed 下的完整正式模拟快照，并继续执行
move 与消费随机数的技能帧，钉住 admission/match RNG 隔离（展示昵称不属于正式模拟快照）。

复核备注（已收口）：消息预算测试直接验证同一 session 前 60 条均为正常 Pong、第 61 条只返回受控
`BadRequest`、另一 session 不受影响且下一秒窗口恢复。accepted input evidence 使用生产上限
`MAX_ACCEPTED_INPUTS = 16_384`；测试覆写为 1 后断言第二条输入既不增长 evidence，也不产生玩法副作用并
返回 `BadRequest`，因此长期房间不会再无界增长该数组。玩法本身是否增加对局时长上限仍是规则设计决策，
不属于本条内存有界性缺陷。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

- C2S handler 直接把 wire value 当成 TypeScript 类型；NaN/Infinity、错类型、未知字段和超长内容没有统一拒绝。
- Move 在非 Playing 阶段也能改变方向，update 在 Waiting/Settle 仍推进；Waiting 明确允许技能伤害和死亡。
- 开始比赛只清部分记录，没有统一重置 hp/alive/dir/cooldown/tick；Waiting 历史会进入正式局。
- `lock()` 在 phase 已切 Playing 后 detached 执行，失败只记录日志。
- Waiting 玩家离开时删除 state，却没有同步清 `sessionUserId`；同用户可能无法重新加入仍存活的房间。
- seed 使用 `Date.now() >>> 0`，Waiting join 已消费 RNG，模拟又依赖 wall clock/dt，无法稳定重放。

**已实施**

1. 为每个 C2S 建立 exact runtime schema、finite/range/length 校验和每客户端消息预算。
2. 由 phase 明确消息白名单；只有 Playing 接受模拟输入并推进玩法状态。
3. 单一 `startMatch()` 初始化所有状态、fixed-step clock、seed/RNG、死亡序和输入序列。
4. 等待 room lock 成功后再公开 Playing；失败回滚或关闭房间，只有一个可测试终态。
5. 玩家加入/离开同步维护所有双向索引；seed、clock 和 accepted input 可在测试中注入。

**验收（已通过）**

- 畸形 C2S 不进入玩法逻辑，也不会把 NaN 写入 Schema state。
- Waiting/Settle 输入不改变正式模拟；任意等待历史后开局状态完全一致。
- lock 失败、Waiting 离开再加入和同毫秒建房均有确定结果。
- 相同 seed、初始状态、fixed-step 与 accepted inputs 得到相同输出。

### P0-03 保证 asset effect 原子性与区级数据隔离 ✅

状态：已完成。effect 入口先做 shared/runtime validate，Lua 采用 validate-then-apply，保留字段和跨区
`server_id` 谓词均有守门测试；非法批次不会留下 Redis、applied 或 durable 业务结果。

复核备注（已收口）：`effect-atomic.test.ts` 直接执行同 op-id、不同 canonical effect 的两次 `purchaseTx`，
断言稳定冲突且 ledger/outbox 仍各只有原始一行；同文件还分别向 `sendMail` 传非法附件、构造历史坏附件后
执行 `claimMailAttach`，断言 mail/read/claimed、outbox、Redis effect/applied 均不产生半状态。

复核备注（已收口）：shared 为每个 `setField` allowlist 字段登记 text/integer/flag 值域，
`wire-contract.test.ts` 直接覆盖数字垃圾、越界整数、非规范开关和超长文本，Lua 仍保留同规则的 durable
防御。`trimApplied` 通过单个 `TRIM_APPLIED` Lua 同时删除 ZSET marker 与 payload hash 字段；经济集成用例
断言 pending 时二者均保留、done 后二者同时清除，不再产生无法枚举的孤儿绑定。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

- `APPLY_EFFECT` 在循环中立即 `HINCRBY/HSET`，applied marker 最后才写；Lua 后续运行时错误不会回滚前面的写。
- unknown kind 被静默跳过，`setField` 可写任意字段，effect 没有版本化运行时 schema。
- 如果非法 effect 已先写入 MySQL ledger/outbox，之后仅让 Redis 失败也不能撤销 durable intent。
- `outbox.readBack(uid,sId,opId)` 查询缺 `server_id` 条件，可把另一区的 operation 结果与本区余额拼接。

**已实施**

1. 在写 ledger/outbox 前使用 shared 零依赖 validator 检查 schemaVersion、exact keys、kind、整数范围、
   数量上限与字段 allowlist。
2. Lua 分为完整 validate pass 和 apply pass；禁止修改 uid/serverId/version/fence/applied 等保留字段。
3. unknown kind/version/field 返回稳定领域错误，失败时 Redis 字段和 applied marker 均不变化。
4. 所有区级 MySQL read/write predicate 带 `server_id`，并以跨区同 uid/op fixture 验证。

**验收（已通过）**

- “第一条合法、第二条非法”时 Redis、applied、ledger/outbox 都没有新增的业务结果。
- 相同 op-id 并发或重试只生效一次；同 ID 不同 payload 可判别冲突。
- s1 的 operation 不能从 s2 查询或影响响应。

### P0-04 明确 Lobby 首角色 ready 契约 ✅

状态：已完成。`LobbyRoom.onJoin` 等待有界的 `ensureCharacterReady` flight，初始化失败/超时拒绝本次
join；并发合流、超时语义与 admission 开关由 `apps/server/test/character-ready.test.ts` 覆盖（注入假
initializer，不触外部依赖）；空库首登与并发 join 由 `apps/server/test/int/lobby-zone.test.ts` 覆盖；登记
失败与 repair intent 由 `apps/server/test/int/character-repair.test.ts` 覆盖。
复核备注（已收口）：`character-ready.test.ts` 通过生产 `ensureCharacterWithDependencies` 接缝逐一挂起
`ensureLive`（Redis/MySQL archive 路径）、`createUser`（Redis 写入）与 `registerCharacterWithRepair`
（WebPlatform PUT + repair），直接断言每个慢阶段均有界拒绝 ready、不会越过未完成阶段，底层 flight 放行后
仍完整收敛。客户端 `pageLogic.test.ts` 直接覆盖 join/GetInfo 任一失败时清 session + leave、null profile
同样拒绝导航，以及成功取得具体角色后才保留会话。

已知限制：`ensureCharacter`（`apps/server/src/player/character.ts:35-45`）每次 join 都同步调用 WebPlatform
`registerCharacter`（PUT，`platform/webPlatformClient.ts:357-370`，无本地缓存/短路），登记失败即拒绝本次
join（`characterRepair.ts:154-173` 落 durable intent 后仍向上抛）；已有完整 `s{sId}_user` 热档的回访玩家
同样受影响，外部登记不可用时表现为全量 Lobby join 被拒。durable repair intent 只补齐登记，不解除该阻塞。
`apps/server/src/player/character.ts` 已明确记录任一阶段失败都会向上抛并拒绝本次 join，与生产行为一致。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

`LobbyRoom.onJoin` detached 启动 `ensureCharacter`；join 已成功时初始化可能仍在进行或已经失败。
shared 的 `GetInfo` 当前允许 `user: null`，因此代码与客户端需要共同决定：null 是合法 initializing 状态，
还是 Lobby ready 后必须有角色。现有测试大多预建角色或轮询，没有覆盖空库首次 join 后立即 GetInfo。

**已实施**

1. Lobby `onJoin` 以有界 `ensureCharacterReady` flight 作为 ready gate；依赖角色的 RPC 只在 gate 完成后可用。
2. `GetInfo` 的 nullable 结果不再表示未受控的初始化中间态；初始化失败/超时以稳定错误拒绝 join，客户端
   不会把 `null` 当作随机成功。
3. MySQL、Redis repair intent 和外部角色登记的迟到结果均被观察并收敛；ready 之后的在线工会索引仍明确
   标为 best-effort。

**验收（已通过）**

- 空库首登、并发重复 join、外部登记超时、Redis/MySQL 单点故障均有确定结果。
- 客户端不会进入“已登录但角色永久未就绪”的半状态。

### P0-05 统一本地默认进程的生命周期 ✅

状态：已完成。默认进程使用单一 `LifecycleRegistry` 和 shutdown aggregator，组件 dispose 可等待、幂等；
阻塞 consumer 与重复关闭有测试（`apps/server/test/lifecycle.test.ts`），启动半失败在 registry 层有测试
（`apps/server/test/fault-mutation.test.ts` 的 `lifecycle-startup-half-failure`），但进程入口
`apps/server/src/index.ts` 的顶层 catch 无运行时用例。

复核备注：`src/index.ts` 的 shutdown aggregator 装配（`index.ts:104-114`，全仓唯一一处
`app.onBeforeShutdown`）与停止顺序（`index.ts:54-68`、`:79-81`）不被任何测试导入（int 测试一律 boot
`src/app.config`），单一 `onBeforeShutdown` 目前靠静态审阅保证，无回归门禁。

已知缺口：`apps/server/src/core/infra/loopMonitor.ts` 的 `startInfraMonitors` 未做 `assertAdmissionOpen()`
与已关闭 registry 的显式 reset（对比 streamConsumer / characterRepair / matchConsumer），同进程重启
（`disposeAll()` 完成后再启动）时会被 registry 的终态迟到释放路径立即停掉（clearInterval + disable），此后
静默不运行且无告警；该文件目前无任何测试。生产入口只启动一次，影响限于嵌入式/测试重启。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

- `src/index.ts` 连续注册两次 `app.onBeforeShutdown`；当前 Colyseus 实现只有单回调槽，后一次覆盖前一次
  ——实际被覆盖丢失的是 `stopCharacterRepairWorker`，停服时 repair worker 没有停止入口。
- 默认启动 loop monitor、stream-depth timer、kick consumer、character repair；Lobby 创建还启动 mail wake。
  多个组件没有统一 stop handle，`StreamConsumer.stop()` 也不等待阻塞 read 完成。
- 因为这些额外样例进入默认进程，它们的残留 handle 会影响核心本地启停，即使其业务完整度不属于核心承诺。

**已实施**

1. 建立单一 lifecycle registry；每个默认组件返回幂等、可等待的 `dispose()`。
2. Colyseus 只注册一个 shutdown aggregator，按依赖顺序停止接收、timer/consumer/worker、外部 client、连接池。
3. 启动中途失败也执行已经登记的 cleanup；汇总错误但不跳过后续释放。

**验收（已通过）**

- 正常关闭、重复关闭和启动半失败时，每个资源恰好释放一次。
- XREAD（`lifecycle.test.ts`）与 repair worker（`int/character-repair.test.ts`）的连续 start/stop 有直接
  用例；存储入口有「停服后不复活新连接、显式 reset 后可重建」的用例（`lifecycle.test.ts:280`，断言的是
  `AdmissionClosedError` 而非 handle 计数）。loop monitor / stream depth alert 的 timer 与监听端口没有
  start/stop 残留用例，属已知测试缺口。

## 6. P1：稳定框架接缝

### P1-01 拆分 App/Session/Scene/Room/Gameplay 生命周期 ✅

状态：已完成当前 Demo 所需的可替换接缝。`Main` 已收缩为 shell；服务端/客户端玩法分别通过
`GameMode` catalog、`GameplayRegistry` catalog 和精确 room capability 装配；重复 ECS entity 会被幂等清理。

复核缺口已收口：shared 提供 canonical `GameplayModeId` 与 validator，Game join 强制显式 `mode` 并按
`sId + mode` 隔离撮合；服务端只在 `onCreate` 验证后实例化对应 mode，等待型 lifecycle hook 可观察，开局
回滚与 dispose 均 exactly-once 清理。客户端 registration 同时拥有 factory/joiner，`RoomController` 在所有
接管、拒绝、取消和失败路径等待同一个 dispose Promise，畸形 capability 也会释放可用的 leave ownership。

`idle` 已通过服务端 `modes/catalog.ts`、客户端 `gameplay/catalog.ts` 和真实 `GameRoomTransport` 接入生产装配，
同区同 mode 可合流、不同 mode 必隔离；它不依赖 `ballMove` factory，也不会写入 ballMove casual evidence。
因此新增玩法只需增加 shared mode id、双端 mode/plugin 模块、room adapter 与各自 catalog 登记，不需要修改
`Main`、`RoomClient`、`RoomController` 或通用 `GameRoom` transport。`GameECS.addPlayer` 对重复 collection key
幂等，`clear()` 不遗留 bitECS entity。

保留边界：共享的 `GameRoomState`、Waiting/Playing/Settle 相位、两人开局与部分 reset/settle 仍以 ballMove
Demo 为基线；`idle` 只是无 presentation 的最小 multi-mode 证明，不代表已交付完整第二玩法 UI 或通用多玩法
状态模型。接入不同房间状态/结算语义的玩法仍需先扩展相应 shared Schema 与 mode 契约。

### P1-02 补齐 View、Logic 和异步页面生命周期 ✅

状态：已完成 Node 可测试边界。View lifecycle hook、AbortSignal/generation、open 失败回滚、交互租约和
迟到异步结果均已收口；真实 Creator 引擎行为仍需编辑器预览。
复核缺口已收口：`pageLogic.test.ts` 与 `guildLogic.test.ts` 恢复并扩展逻辑层生命周期用例，直接覆盖 stop 后
迟到结果零回调、AreaList 世代/快照/恶意响应隔离、LoginNotice 迟到响应，以及旧 Guild pull 不阻塞新世代。
`viewLifecycle.test.ts` 通过最小 cc/FairyGUI 运行时桩动态加载真实 `FguiView`、`ViewMgr` 和具体 View，覆盖
cacheable 页面 mount/onOpen/setup/render 四段打开失败回滚、输入租约计数与恢复、具体 View 的
`closeLifecycle → logic.stop`、重复 setup 100 次不叠监听、进度归一化和占位控件置灰。事件层 `observeAsync`
与页面组合层 `observePageAction` 的 rejection 都有 `unhandledRejection` 实证，并守住 Login 两个真实导航
调用点；未被读取的 `handleContexts`/`setContext` 死接缝已删除。

已实施的生命周期边界：

1. `onCreate/onOpen/onClose/dispose`，永久接线只能执行一次。
2. 每次打开持有 AbortSignal/generation；Area/Notice HTTP、Guild pull 等迟到结果在 close/stop 后不得回调。
3. 场景/root generation 变化时取消旧 pending load；mount/setup/render 失败统一回滚并释放交互租约，
   多实例 Confirm 也不会留下已挂载孤儿。
4. Login/Home/AreaList/Notice 的重复 `setup()` 不得追加相同监听。
5. `LoginView.setProgress` 更新 ratio；未参与行为的 Login 控件在契约中保持为明确的展示/占位字段。
6. 事件入口必须观察 async 错误，不留下 `void openLogin(...)` 的 unhandled rejection。

**完成标准**：同一 View 重复 `setup()` 100 次后一次事件只触发一次 action；关闭后 deferred 完成产生 0 次
UI/Logic 回调。真实 Creator 输入与资源行为仍由编辑器预览确认。

### P1-03 建立完整 wire runtime contract ✅

状态：已完成当前核心 endpoint/transport 覆盖。HTTP、Lobby RPC、Game C2S/S2C 和 WebPlatform Public
response 均有 runtime validator 与 malformed/extra-key 测试；未来新增 endpoint 仍须登记 contract map。

当前实现由 `GameHttpContractMap`、shared zero-dependency validators、Lobby/Game transport validators 和
WebPlatform consumer facade 共同守住 method/path/request/response、exact keys、枚举、finite number 与
安全 origin；服务端 route 与客户端 wrapper 的核心 endpoint 从 contract key 派生。仍保留的边界是 Game
HTTP request schema 由 endpoint options 维护，但 `composeRequestSchema` 已在本地 schema 前后各夹一次
shared validator，并有 route/shared 接受集合漂移用例。Game C2S 生产 schema 已包装 shared
`validateC2SPayload`；`game-room-wire-contract.test.ts` 同时锁定 shared validator、服务端 schema、真实
`room.messages` handler 的消息集合、接受域、归一化结果和非法请求错误，单个字段上界漂移也会失败。
复核备注：WebPlatform consumer map 还登记了仓内未调用的 Livez/Readyz 两个契约，属 consumer 子集而非
生成全集，当前无实际暴露面。

**完成标准**：畸形 2xx/RPC/S2C、未知字段和非法 endpoint 在状态写入或连接前失败；HTTP path/method、HTTP
request 域、Lobby RPC request shape、Game C2S 和 Schema wire 投影的任一侧漂移均使本地测试失败。真实
`GameRoomState`/`PlayerState` 实例会直接进入 shared validator；测试还锁定 `state.toJSON()` 的顶层与玩家
精确字段集合、内部字段不外泄，并断言序列化投影和实例得到相同的 shared 校验结果。因此 Schema 字段改名、
删除、新增或误暴露不再只到客户端运行期才被发现。

### P1-04 渐进推进 schema-first 协议 ✅

状态：已完成第一阶段 schema-first 收口：shared exact validators、RPC/HTTP contract map、Colyseus state
镜像和协议 fingerprint 已接入；更广泛的自动生成 state/schema 仍属于后续演进，不作为当前能力承诺。

shared exact validators、RPC/HTTP contract map、Colyseus state mirror、fixtures 与 fingerprint 已接入，
并收紧 phase、RPC reply 判别和错误码映射。`protocol-fingerprint.mjs` 现只接受唯一顶层 export、忽略
注释并对重复声明报错；反例测试已覆盖“注释旧版本、声明新版本”。更广泛的自动生成 state/schema 仍是
后续演进，不属于当前核心承诺。

### P1-05 补齐 FairyGUI 结构和资源闭包 ✅

状态：已完成当前页面集合。递归/list-item/manual 契约、包依赖闭包、导出物 manifest/hash、deadline/cancel
和失败回滚均有 codegen/FGUI 门禁；编辑器中的 `autoClearItems` 等行为仍需人工预览。

当前 codegen 已递归记录嵌套/list-item/manual binding、relation、controller 和 `ui://` 引用；四个 AUTO
区仍由单源生成。required/shared package 缺失或超时会返回可重试错误，View open 贯通 deadline/generation，
`verify:fgui` 维护 XML、`.bin`、图集和生成绑定的 manifest/hash。

复核备注（已收口）：`141d13d` 已把 `scripts/fgui-manifest.mjs` 的纯校验辅助函数直接纳入
`scripts/fgui-manifest.test.mjs`，并由 `npm run test:fgui` 执行。反例逐项覆盖 source/export 哈希不符、
记录缺失或多余、路径越界、导出物多重归属、manifest 结构非法、重复 package name/id、非法 `ui://`
引用和 package.xml 伪声明；另保留对真实仓库资源闭包的只读正例。

**完成标准**：设计源变更未重新导出、嵌套字段改名、加载中关闭或 required 包缺失都被本地检查稳定捕获。

### P1-06 收紧服务端配置、任务和存储防腐层 ✅

状态：已完成计划内边界。数字 parser、compute admission、dispatcher timer、strict request、Redis route
URL、freeze keyset 和坏值校验已落地；relayer 事务边界、archive 隔离和热档迁移仍列为明确限制。
复核备注（已收口）：`03515e2` 已补生产接缝测试。`compute-pool.test.ts` 用独立进程和最小容量稳定触发
running + queued 饱和；`dispatcher-idem.test.ts` 直接执行 deadline helper，覆盖成功/超时两支的 timer
`unref/clear`，`config-guard.test.ts` 另锁定 `IDEM_PENDING_MS > HANDLER_TIMEOUT_MS`。freeze janitor 测试覆盖
`(frozen_at,user_id)` 游标跨调用续扫、失败行不推进及短页/空页重置；`batch ≤ 0` 继续按兼容语义钳到 1，
并由测试钉死。

1. 完整数字 parser 拒绝尾随垃圾、指数写法、NaN/Infinity 和非安全整数；负值与上下界由调用方传入的
   min/max 选项拒绝（parser 本身不内置非负约束，`numbers.ts:16`/`:36` 的正则显式允许前导 `-`），当前 65
   处调用点全部显式传 min。
2. compute pool 有总队列容量、admission policy 和稳定 overload 错误；周期任务不进入请求池。
3. dispatcher 成功路径清理/unref timeout，pending lease 与执行窗口保持明确边界；timeout 仍不取消 handler，
   迟到副作用由数据层幂等收敛。
4. Redis/MySQL 数字读取统一做 finite/integer/range/schema 校验，坏值不会进入领域和协议。
5. 需要 exact 的 Zod 边界使用 strict 语义；unknown message 先经过有界 per-principal 限流。
6. redis-route 在装载期校验每个 durable/cache URL 和 bucket 覆盖，错误配置 fail-fast，不回退到 ioredis
   默认地址。`redis-route.test.ts` 通过临时 YAML 和真实 `REDIS_ROUTE_FILE` loader 覆盖解析、排序、每条
   durable/cache URL、buckets 常量、range 合法性、桶无缝覆盖 `[0,BUCKETS)` 与缺文件 fallback。
7. freeze janitor 已收口为有界 keyset 扫描：`core/archive/freezeWorker.ts` 每轮把 `batch` 作为总扫描
   预算，按 `(frozen_at,user_id)` 游标跨调用续扫。正常冷档行经无锁 EXISTS 预筛 `continue` 不删行，
   但不会长期占据排序前段，后面的陈旧残留行与 PITR 后的 ARCHIVE_NEWER 行可在后续轮次被扫描；游标
   只保存在 worker 进程内，重启后从头开始仍保持幂等安全。显式非法 `batch` 与损坏的 `frozen_at` 在
   边界拒绝，失败行不会推进游标。⚠ freeze worker 默认硬关闭（`FREEZE_ENABLED`），默认配置下不触发，
   且 archive 的区隔离/容量方案仍不属于当前核心承诺。

### P1-07 收敛区目录和跨端确定性语义 ✅

状态：已完成当前目录/玩法接缝。目录快照、HTTP/WS 双端点、fixed-step seed/input 和 reconnect reconcile
均有单源实现与测试；目录 hash 不承担 join 准入语义。

- `openAreaList` 刷新成功后通过 `setServerList` 原子替换 `AreaListLogic` 与 `serverSession` 共享的目录快照，
  同时保留仍存在的当前区；失败保持完整旧快照。列表、hash 和 selection 不再由三个分步模块变量拼接。
- 页面 HTTP consumer 与房间 joiner 分别消费 `gameHttpUrl`、`gameWsUrl`；目录响应中的 `hash` 不进入 join
  options，因而不会暗示不存在的陈旧目录准入语义。
- shared `logic/time.ts` 使用显式 UTC/configured offset 计算自然日，并有跨时区 golden tests。
- `GameRoom` 的 transport 重连只做 desired input 对账（`net/RoomClient.ts:720-725`、`:865-879`，用例见
  `test/roomClientOwnership.test.ts` 的「掉线输入 reconcile」），不当作业务恢复；大厅连接最终死亡统一走
  `notifyConnLost` → `returnToLogin` 后整段重新登录来重建 session 与角色快照，目前没有独立的 session/角色
  快照对账层；大厅房也未注册 `onReconnect`，`net/WebSocketClient.ts:205` 的 `slot.dropping` 当前无消费方。

复核备注（已收口）：两个 `gameWsUrl` 消费点（`view/pages.ts` 的大厅 join、
`net/rooms/BallMoveRoom.ts` 的战斗 join）分别由 `pageLogic.test.ts` 直接执行生产
`joinSelectedServerLobby` helper、`roomClientOwnership.test.ts` 直接执行 `createBallMoveRoomJoiner`，均断言
明确 WS endpoint；页面 HTTP consumer 的 `gameHttpUrl` 仍在 `openAreaList` 选服接线中直接传给 `initHttp`。
公告存储日期已改用 shared `naturalDayIndex`（UTC+8），`pageLogic.test.ts` 直接执行生产纯函数并钉住跨自然日
边界；无生产调用方的 `clearServerList()` 公共写入点已删除，测试用合法空目录响应复位状态。

### P1-08 闭合本地验证与依赖锁 ✅

状态：已完成。客户端完整无头 strict 探针与 ES2017 legacy 探针均可独立通过，后者已进入根 `typecheck`
以及上层 `verify:core` / `verify:all` 聚合链。失效的 loadtest、Excel 产物链和真实 Creator 预览仍按
额外/人工验证边界处理。

1. 独立 client-test tsconfig（Node 22 lib + 最小 cc/FGUI stubs）已纳入 Main/View/tests，旧字段已修复。
2. `test:fgui` 已拆成准确的 `test:client` 与 FGUI 专项命令，并提供分层 `verify:core`/`verify:all`。
   `verify:core` 同时执行 manifest 正向检查与 `test:fgui` 反例/registry 契约；`verify:all` 只继承一次
   `verify:core` 再追加服务端单元测试，不再重复执行客户端测试。
3. root 显式拥有 `tsx/tsc` 等脚本依赖，不依赖 server workspace 偶然 hoist；推荐 Node 22.x 约束已写入
   工具链与文档。无第三方依赖的 `verify-toolchain.mjs` 作为 `verify:core` 首闸，检查 `.node-version`、根与
   server engines、`@types/node`/`tsx`/`typescript` 直接声明、lockfile 投影及解析版本；并精确锁定
   `typecheck`、`verify:sync`、`verify:core`、`verify:all` 的命令集合/顺序和三类负向测试入口。
   `toolchainContract.test.ts` 会逐项删除聚合命令、漂移依赖/lock 声明、弱化测试入口或删除自身，确保
   verifier 不会因脚本或反例测试被移除而自举放行。
4. bitECS/vendor lock 现在校验实际文件集合与应锁集合相等；vendored WebPlatform tgz integrity 也有
   `vendorLock.test.ts` 覆盖。`.gitattributes` 已为 `apps/Cocos/extensions/**`、`apps/art/fairygui/assets/**`
   等机检域钉 `eol=lf`，避免字节锁在不同平台误报。
5. `dev-stack.sh` 通过 PID、实例标识、启动时间、二进制、端口和数据目录确认所有权；
   `apps/server/tools/smoke.ts`（`smoke:framework`）使用本次运行唯一脚本验证 `NOSCRIPT`（`:51-61` 的
   nonce），不对共享 Redis 执行无条件 `SCRIPT FLUSH`（全仓无任何 `SCRIPT FLUSH` 调用）；端到端的
   `apps/server/test/smoke.ts`（`smoke`）不触碰 SCRIPT 缓存。
6. 失效的 loadtest 与未闭合的 Excel 生成链继续归额外功能；它们不进入 `verify:core` 的核心门禁。
7. `d96186b` 已补齐 legacy `cc-stub.d.ts` 中 BallMoveView 使用的 `Color`、`EventTouch`、`Graphics`、
   `Input`、`UITransform`、`input` 与 `Vec3.set`，`npm run typecheck:client:legacy` 可独立通过；根
   `typecheck` 明确串行执行完整 ES2022 无头探针和 ES2017 legacy 探针，因此 `verify:core` / `verify:all`
   也会守住客户端运行时下限。`clientTypecheckConfig.test.ts` 注入 `Object.fromEntries` 与
   `Promise.allSettled` 反例，断言 legacy 配置拒绝它们，并守门根聚合命令不得移除 legacy 探针。
8. `apps/client/tsconfig.json`、`cc-stub.d.ts`、根/客户端/Cocos README 与 CLIENT/OVERVIEW 文档均已区分
   `typecheck:client`（完整源码与测试、ES2022 桩）和 `typecheck:client:legacy`（可离线源码、ES2017 下限），
   并明确根 `typecheck` 同时运行两者。

### P1-09 建立能力—代码—测试—文档清单 ✅

状态：已完成。`docs/inventory.json` 登记能力、默认入口、真源、wire/runtime 边界、验证命令和权威文档，
`verify:inventory` 会检查路径、命令、链接、默认模块与能力归类。

每个核心能力必须能定位到活跃入口、真源、运行时边界和测试；每个默认活跃模块也必须在 OVERVIEW/就近
README 标明。`plan.md` 是核心优先级真相，`docs/EXTRAFEATURES.md` 是额外能力真相，不再维护第二套路线图。

本轮已同步修正 AGENTS/CLAUDE、CLIENT/SERVER/WEBPLATFORM、第三方依赖域、说明站能力文案和失效链接，
并把能力归类、默认入口、真源、wire/runtime 边界、验证命令和权威文档固化到 `docs/inventory.json`。
`verify:inventory` 会检查默认活跃模块未漏记、命令/链接存在、两份助手指令口径一致以及核心计划与
额外功能没有重新分叉。根 `LICENSE`、项目身份和第三方来源登记均由项目元数据契约统一校验。

复核备注（已收口）：`scripts/verify-inventory.test.mjs` 在隔离 checkout 中提供 12 个正反例，覆盖漏记
workspace main、`app.config.ts` 组合根、Creator scene 压缩 UUID 对应的 `Main.ts`、命令消失、文档链接
失效/越界、AGENTS/CLAUDE 分叉或共同删除关键条款，以及 verifier 参数边界；fixture 会纳入未忽略的未跟踪
文件，避免反例测试首次入库前发生自举假红。

清单语义也已纠正：核心资产 effect 指向真实 purchase 入口；独立 relayer 单列为 extra，并校验 workspace
launch 命令确实启动登记入口。已迁出的说明站不再作为笼统 `project-extras` 能力根。默认入口从 workspace
main 的直接静态组合 import 与默认 scene 脚本 UUID 独立发现，不再依赖清单自报 `sceneClass`。

AGENTS/CLAUDE 现在除空白外全文一致，并另锁定镜像、shared、View/Logic、FGUI、外部身份和 inventory
命令等必要条款；缺少就近 README 的现状仍如实写明，但不再误指向已完成的 P1-09。README 命令表已补
vendor、inventory 反例和 perf 门禁。保留边界：组合根发现不声称构建完整 TypeScript import graph，scene
发现不扫描动态 prefab，Markdown 检查守住登记链接与锚点而不是通用语法解析。

## 7. P2：正确性稳定后的增强

### P2-01 建立可重复的性能基线 ✅

状态：已完成当前开发期基线。`tools/client-perf-baseline.ts` 使用固定 seed、Float64 input tape 和
100/500 entity workload，记录 tick、self lookup，以及 snapshot 分配与 Graphics 命令路径的无头镜像估算；
结构投影写入 `docs/perf/client-ballMove-baseline.json`，`npm run verify:perf` 会重跑并比较 checksum、
命令数和估算值。计时分布、heap delta 与 Node/平台信息仅用于同机趋势观察，不构成 Cocos/GPU 性能阈值。

复核备注：渲染与快照两项是无头镜像探针（`tools/client-perf-baseline.ts:291-330` 的 `drawHeadless`、
`:276` 的 `snapshotPlayers`），与生产 `apps/client/src/view/rooms/ballMove/BallMoveView.ts:79-110` 的
`render` 之间没有任何一致性断言或 codegen 关联（`apps/client/test/` 无一处引用 `BallMoveView`）；
`verify:perf` 能锁定 ECS tick/self lookup 与输入 tape 的回归，但改动 `BallMoveView.render`（增删命令、改
血条几何）不会让门禁失败。

复核备注：`tools/client-perf-baseline.ts`（`:6`、`:273`、`:291`、`:309`）与 `docs/CLIENT.md` §8.1
（`:280`、`:282`）仍以 `Main.draw()` 指代渲染路径，该方法已不存在（`Main.ts` 全文 183 行无 draw/graphics
符号），实际实现是 `BallMoveView.render`，文案待改名。

### P2-02 风险加权的故障与变异测试 ✅

状态：已完成当前风险矩阵。`scripts/fault-matrix.config.json` 登记 2 个 unit 组
（`server-boundaries`、`client-transitions`）和 2 个 Redis/MySQL integration 组
（`storage-effects`、`character-ready`）；`test:faults` 与 `test:faults:int` 均要求每个 fault point 实际
执行并由 coverage 证明 fail-closed。它是定向故障/变异矩阵，不是自动源码 mutation 或全局覆盖率指标，
集成组需要本地 Redis/MySQL 与外部开发契约。

复核备注（已收口）：`fault-mutation.test.ts` 使用真实 Worker 分别触发 `error` 与 exit-only 死亡，直接断言
在途任务拒绝、尸体 reap、1 秒退避后只补一个健康 worker，并覆盖故障前已排队与故障后才入队两种时序。
待补位 timer 计入池容量，后到请求不能 eager spawn 绕过 backoff；队列非空时 timer 保活，排队任务先超时并
清空队列后恢复 unref。structured-clone 与任务级异常仍分别验证健康 worker 可复用、后续任务可继续完成。

### P2-03 Starter 初始化与项目元数据 ✅

状态：已完成当前 Starter 范围。幂等 `init:project`、项目身份/包名推导、生成区标识、根 MIT `LICENSE`
和第三方来源登记已落地并纳入 `verify:project`。Unity、托管、渠道与商业化不进入该命令的必选项。

复核备注（已收口）：`projectMetadata.test.ts` 现以相同参数连续运行两次真实 `init-project.mjs`，断言第二次
明确报告「已更新 0 个文件」，并递归比较第一次运行后的完整 fixture 文本快照，确保没有隐蔽改写或新增；
`docs/PROJECT.md` 的幂等承诺已进入客户端核心测试门禁。

## 8. 实施顺序与收口状态

```text
阶段 A：正确性止血（已完成）
  P0-01 客户端会话/连接
  P0-02 GameRoom 边界/状态
  P0-03 effect/区隔离
  P0-04 character ready
  P0-05 默认生命周期

阶段 B：稳定框架接缝（已完成当前核心范围）
  P1-01/P1-02 App、玩法与 View 生命周期
  P1-03/P1-04 wire contract 与 schema-first
  P1-05/P1-06 FGUI、配置、任务与存储防腐

阶段 C：开发体验收口（已完成当前核心范围）
  P1-07 区目录与确定性
  P1-08 验证与锁定
  P1-09 文档真相
  P2-01/P2-02/P2-03 已完成
```

依赖原则已按上述顺序执行：先修竞态和数据原子性，再抽象状态机/玩法接口；先定义生命周期，再做资源
释放；先让测试源码进入严格类型检查，再把聚合 verify 作为重构护栏。

## 9. 首批任务完成记录

1. 已增加 `WebSocketClient` join(A)→init(B) 回归测试，并冻结 join 身份。
2. 已为两类 join 增加 deadline/cancel，覆盖黑洞连接和迟到成功释放。
3. 已把登录至 Home 与三类失效事件收敛成单一 transition 测试。
4. 已覆盖掉线期间松手→重连 stop/desired replay。
5. 已给 GameRoom C2S 增加 exact validator、phase gate 和 Waiting→Playing 全量初始化。
6. 已重写 effect 为 validate-then-apply，并补 durable intent 与跨区 `readBack` 测试。
7. 已明确 Lobby ready 契约并覆盖空库首次 GetInfo、并发与超时。
8. 已建立 shutdown aggregator，为默认组件补可等待 dispose。
9. 已新增 client-test tsconfig，修复登录字段并把 Main/View 纳入最小类型桩。
10. 已修复 View 重复 setup、迟到 callback 和 GameECS duplicate-add 幽灵实体。

## 10. 统一完成定义

本轮核心条目按以下定义完成并已由对应测试/门禁核对：

1. 真源、生成镜像、登记表和就近文档一致，不手改生成目录。
2. 外部/wire 边界有 malformed、extra-key、NaN、timeout 和过大输入测试。
3. 竞态由 deferred promise/fake clock 稳定复现，并断言最终领域状态而非仅调用次数。
4. timer/listener/room/worker/request 都有明确 ownership、cancel 和 dispose 语义。
5. `typecheck`、client/server tests、sync/vendor/config checks 按变更范围通过。
6. 新增生成物能确定性重建，并能检查缺失、陈旧和集合漂移。
7. 若功能属于额外范围，不把其完整度升级为核心验收项；若进入默认入口，只验失败隔离和生命周期。

## 11. 当前目标形态

在当前基线，项目表现为一个边界清晰的开发期游戏框架：

- shared 同时描述静态类型和关键 wire runtime 边界；
- client shell、session、navigation、room、gameplay 与 View 生命周期可取消、可替换、可无头测试；
- GameRoom 和数据原语在坏输入、并发与故障测试下保持明确不变量；
- FGUI、镜像与锁定依赖能判断“是否来自当前真源”；
- 新增玩法主要扩展 GameMode/GameplayPlugin 和登记点，不修改通用接缝；
- 核心计划与额外功能各有唯一文档，不再互相制造隐含承诺。
