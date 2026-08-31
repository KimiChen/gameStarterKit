# gameStarterKit 产品/工程留白清单（plan-v4）

> **本文件不是当前计划的唯一真相。** `docs/inventory.json` 的 `routeOfTruth.corePlan` 仍指向
> [plan-v3.md](plan-v3.md)（其开放项已全部闭合，正文 34 条 `[已完成]`、0 条待补齐）。
> 本文件是从 plan-v3 的 78 条 `[不阻塞·有意保留]` 中挑出的 **5 条真正的产品/工程留白**，
> 查清事实后做成可排期清单。是否把真相指针迁到本文件，是需要单独拍板的决定。
>
> **口径**：每条给出「现状 / 可复现的失败形态 / 影响面 / 修复方案 / 代价」五项。
> 指向源码的 `file:line` 为**写入时快照**（HEAD `e58061d`），复核时应重新定位。
> 「今天没炸的原因」一项必须写实——这些条目此前之所以能挂 `[不阻塞]`，靠的是具体的兜底机制，
> 排期时要先确认那些机制还在。

## 优先级建议

| # | 条目 | 建议 | 理由 |
|---|---|---|---|
| 3 | ready marker 的熔断器放大 | **最先做** | 唯一一条今天就在放大故障面的；4.1 可独立落地、收益立竿见影 |
| 2 | `emitMatchEvidence` 吞两类失败 | 次之 | 证据静默丢失，且现有唯一用例对日志零断言；改动可控 |
| 1 | `match_results.payload` 三形状 | 接读取方之前必须做 | 今天零读取方所以零影响；一旦有读取方就是运行期事故 |
| 5 | FGUI 产物往返自检 | 可独立排期 | 纯新增、不动既有门禁；可行性已实证 |
| 4 | GameRoom shell 的玩法硬编码 | 接第三个玩法前做 | 是重构不是补丁，需分阶段 |

---

## 1. `match_results.payload` 混存 legacy / v2 / v3 三种形状

**现状**：列定义 `apps/server/sql/schema.sql:93-109` 只有 5 列，无版本列、无 CHECK。唯一写入点
`apps/server/src/core/match/matchConsumer.ts:571`，参数来自 `normalizeEntry`（`:362-368`），
该结构**本身不带版本**。三种形状：v3 = 16 字段（`matchEvidence.ts:384-388` 的 `EVIDENCE_KEYS`，
解码 `matchConsumer.ts:444-471`）、v2 = 8 字段（`matchConsumer.ts:114-116`，解码 `:431-442`）、
legacy = 任意 JSON object（解码 `:473-485`，**无 shape 校验**）。

**可复现的失败形态**（真 Redis + 真 MySQL 副本实测，两条 XADD → `consumeOnce()` → 回读）：

1. 任意 JSON object 都会落库，既不隔离也不告警——`{"hello":"world","nested":{...}}` 直接成行。
2. **比 plan-v3 登记的更严重**：legacy 行的**列值与 payload 可以互相矛盾**——实测得到
   `match_id` 列 = `m_repro_mode_…` 而 `payload.matchId` = `COMPLETELY_DIFFERENT`，
   `mode` 列 = 1 而 `payload.mode` = 99。v2（`:437` `V2_PAYLOAD_BINDING`）与 v3（`:457`）
   都挡住了这种发散，**只有 legacy 没挡**。所以对 legacy 行，连顶层两列都不能当可信索引。

**legacy/v2 行今天仍可新增**（不是只读的历史包袱），两条通道：consumer group 以起点 `"0"` 创建
（`matchConsumer.ts:343`），两条旧流里任何积压条目在 settle worker 起来时都会被消费并 INSERT；
以及 `docs/SERVER.md:452-454` 明文规定的 quarantine 处置流程是「修复后 XADD 回正确来源流」。

**影响面**：**今天零影响，因为这张表没有任何生产读取方**——全仓 `grep match_results` 在
`apps/server/src/` 下只命中 `matchConsumer.ts` 的注释与那条 INSERT。真正在兜底的是范围边界：
按区发奖用的 `server_id` 是**独立列**且三形状下都正确，这是它能挂 `[不阻塞]` 的实质理由。
风险全部前置在「接第一个读取方那天」：verifier 对 v2/legacy 行会在 `exactRecord` 抛 `KEYS`
（`matchEvidence.ts:113-124`）；战绩聚合会把 legacy 行静默算成 NULL；`mode` 列本身也是混语义
（v3 恒 0，故 `mode=1` 只可能是 v2/legacy）。

**修复方案（推荐 A：加 `schema_version` 列）**：仓内有现成先例可照抄——`server_id` 就是这样加进
这张表的。`apps/server/tools/db-bootstrap.ts:126-153` 的 `ensureMatchResultsZoneShape` 刻意
不指定 `AFTER` 以走 `ALGORITHM=INSTANT`，且每步前后查真定义、中途崩溃重跑可收敛；
配套 `verifyMatchServerIdColumn`（`:66-90`）读 `INFORMATION_SCHEMA.COLUMNS` 精确核对。
照此新增一列 `schema_version TINYINT UNSIGNED NOT NULL DEFAULT 0`，语义
`0 = 未知/legacy`、`2 = 冻结 v2`、`3 = 可重放 v3`。代码侧 `NormalizedEntry` 加字段，
三个 return 点（`:441`/`:470`/`:485`）分别填 2/3/0，INSERT 加一列。

**代价**：**无需 backfill、无需停机**——`DEFAULT 0` 自动收敛，`db-bootstrap.test.ts:310-372`
已钉死同款语义（旧表预置行升级后由 DEFAULT 收敛）。若要精确标注存量，**只有 v3 能精确回填**
（`UPDATE … WHERE JSON_EXTRACT(payload,'$.schemaVersion')=3`）；v2 与 legacy **无法区分**——
一条恰好是 8 键形状的 legacy 行与真 v2 行逐字节相同。不牵动 `apps/shared/`（该表不是双端契约，
改它不动协议指纹）。需补：新列的 bootstrap 幂等测试 + 三形状各自 `schema_version` 的落库断言。

**顺带建议**（可独立、更廉价）：给 legacy 分支补上 v2/v3 已有的顶层↔payload 绑定校验，
把上面第 2 条失败形态直接消掉——约 5 行，不需要改表。

---

## 2. `emitMatchEvidence` 把「内部一致性缺陷」与「外部 Redis 故障」吞进同一个 catch

**现状**：`apps/server/src/core/match/matchConsumer.ts:266-293`，整个函数只有一个 `try`，
同时覆盖三段自检（`:274` exact validate、`:276` 确定性 replay、`:279` payload 超预算）与
外部 XADD（`:281-288`）。catch（`:289`）统一 `console.error` + 返回 `null`。
函数注释（`:266-270`）只提 XADD 失败，**没提自检失败也走同一条路**。

**可复现的失败形态**：调用方 `GameRoom.ts:1729` 丢弃返回值，因此 GameRoom 内部一致性缺陷
（validate/replay 不过）与 Redis 故障对调用方**完全不可区分**，两者都表现为「整局证据静默丢失」。

**今天的测试覆盖恰好证明了问题**：唯一相关用例
`apps/server/test/int/settlement.test.ts:266-289` 把 `console.error` **整个替换成空函数**
（`:279-280`），因此对日志内容零断言——今天把两类错误合并成同一个码，这条用例也不会红。
它还只覆盖自检①②，**未覆盖自检③**；**XADD 外部失败分支全仓零覆盖**；
**调用方对 `null` 的处理零覆盖**（6 处 `evidenceEmitter` stub 全是成功路径）。

**方向判断**：producer 侧自检失败应当 **fail-closed**——消费侧对**同一组**校验（`:451-469`）
走的就是 fail-closed（写 quarantine 保全原始 fields 再 ACK 并告警），生产侧对自己造的、
还在内存里的数据反而 fail-open 直接丢弃，两侧姿态不一致。但 fail-closed **不等于阻塞收局**
（`:267-268` 的约束仍成立，对局结果已广播）；正确落点是「必须留下不可忽略的持久痕迹」。

**修复方案（推荐 A）**：返回值从 `string | null` 改为判别联合
（`{ok:true,entryId}` / `{ok:false,kind:"self-check"|"transport",reason}`），三段拆独立 try，
错误码**复用消费侧 `decodeFailure` 的同一套码空间**（`V3_PAYLOAD_${code}` / `V3_REPLAY_${code}` /
`V3_PAYLOAD_SIZE`），运维只需一套码表。自检失败额外写一次「无来源条目」的 quarantine——
现有 `quarantineMalformedMatchEntry`（`:509-517`）绑死了「先 XADD quarantine 再 XACK 来源 PEL」，
producer 侧没有来源条目，需新增只 XADD 不 XACK 的姊妹函数。这样自检失败会抬高 quarantine 深度，
被 `runMatchStreamDepthCheck` 的 `depth > 0` 分支（`:887-892`）抓住告警——**复用已有告警通道，
不新增任何 observability 基建**。

**不推荐 B（自检失败直接 throw）**：语义最干净、约 10 行，但 `evidenceEmitter` 被
`void trackTask` 调用，抛出后只变成 `lifecycle.ts:270-272` 的一行日志——**证据照样丢**，
只是把误导性日志换成正确日志。

**代价**：改 `matchConsumer.ts` 一处函数 + 一个新 quarantine 姊妹函数 + 调用方
`GameRoom.ts:1729` 改为观察结果（仍不阻塞）。需补：两类失败各自的日志/码断言（**且不得再把
`console.error` 整个替换掉**）、自检③用例、XADD 失败注入用例。不牵动生成镜像与双端契约。

---

## 3. ready marker 复核窗口的运维刚性

**现状**：`CHARACTER_REGISTRATION_RECHECK_MS` 定义于
`apps/server/src/core/infra/config.ts:207-218, 258-264`，默认 24 小时。
「模块级、只在加载期读一次」属实，且是**三重**固化：`export const` 顶层求值；消费点
`apps/server/src/player/character.ts:71-83` 的 `defaultCharacterInitializerDependencies`
是模块级字面量，import 时就把值固化进对象；`character.ts:128` 的 `??` 分支在生产**永不命中**
（只服务注入式测试）。对照组：同文件 `config.ts:308` 的 `ADMIN_API_SECRET` 与 `:276` 的
`PAY_ENABLED` 是**每次现读的函数**，所以「现读」范式在本仓是有先例的。

**调查中发现的、比登记项更要紧的一点**：`webPlatformClient.ts:125` 是**一个共享熔断器**
（`const breaker = new CircuitBreaker()`）。character 路由族故障会推开同一个熔断器，
进而让 `onAuth` 的 session verify 一起被拒——**故障面被放大到「所有人无法登录」**，
而不是登记里说的「1/24 回访用户」。「1/24」这个估算在共享熔断器存在的前提下**不成立**。

**修复方案（分两步，4.1 可独立排期且收益最大）**：

1. **拆掉共享熔断器**：`webPlatformClient.ts:125` 改为按路由族取实例
   （`session` / `character` 两族即可，不必按 path 细分以免 Map 被参数撑爆），`call()` 加 `route` 形参。
   做完这一步，放大链断掉，受影响面才第一次回落到「回访热档用户」这个量级。
2. **自动 degraded**（推荐，不需要在故障期拧旋钮）：新增
   `CHARACTER_REGISTRATION_GRACE_MS`（默认 `0` = 保持当前行为），在 `character.ts:151-172`
   的 catch 分支里**仅当全部条件成立**时改判放行：`created === "exists"`、
   `registration.state === "ready"`、`nowMs - checkedAtMs < GRACE_MS`（有界宽限）、
   错误是 `WebPlatformUnavailableError`（`ContractError`/`ServiceError` **一律不宽限**，
   它们代表配置事故，fail-open 会掩盖）、且已成功 `enqueueCharacterRepairIntent`。
   ⛔ **绝不调用 `markCharacterRegistrationReady`**——刷新 `checkedAt` 会让宽限自我续期成
   永久信任，等于永久关闭复核。**这是本方案唯一的致命误实现，必须有定向反例守住。**

**安全取舍（结论：宽限不会放进未注册角色）**：决定性的一点是 `hasCharacter` 的返回值
**今天就不是准入判据**——`character.ts:151-177` 两条分支里，`registered === true` 放行、
`registered === false` 补 PUT 后**也放行**，健康路径下没有任何 `hasCharacter` 结果会导致拒绝。
探测是**修复触发器**而非授权检查。因此「探测失败即宽限放行 + 落 intent」与健康路径的最终状态
**语义等价，只是异步**。宽限**不覆盖**：新号（`created === "ok"` 必走 PUT，失败照拒）、
`pending` 残留档、legacy 无 marker 档、`thaw.ts:455` 的 F4 独立探测路径、封号/注销
（封禁语义全在 verify 的 `BANNED`/`DEREGISTERED` 分支与 `/admin/kick` SOP 上）。
唯一新增风险是把 PUT 推迟到 repair 收敛前（上界 `CHARACTER_REPAIR_BACKOFF_MAX_MS` = 300s），
该风险**在今天的崩溃窗内已经存在**，宽限只是拉长窗口——可接受，但必须写进 `docs/SERVER.md`。

**代价**：4.1 改 `webPlatformClient.ts` 一处 + 熔断器隔离用例。4.2 改 `config.ts` 加常量、
`character.ts` catch 分支加条件、`docs/SERVER.md` 写明取舍与「生产部署应显式设为 7d」。
默认 `0` 落地则行为不变、零风险。不牵动生成镜像。
**运行时可调窗口（把常量改成现读函数 / 加 admin 端点）单独做买不到运维能力**——外部无法改
运行中进程的 `process.env`，admin 端点则是 per-instance、重启即失，与 `/admin/kick` 同款成本。

---

## 4. 通用 GameRoom shell 里的玩法硬编码

**现状**：`apps/server/src/rooms/GameRoom.ts`（1769 行）自称通用 shell，但玩法耦合分布在
**6 类约 25 处**。人数一类最典型：`:385` `maxClients = MAX_PLAYERS`、`:945` 房内二次闸、
`:998` **自动开局阈值写死字面量 2**、`:1123` 与 `:1206` 各自再写死一次 `< 2`。
`MAX_PLAYERS = 4` 在 `apps/shared/src/constants/game.ts:12`，并经 manifest 的
`"maxSizeConstant": "MAX_PLAYERS"` 烧进**两个** root 的生成 validator。

**关键实现约束（已实证，决定方案形状）**：Colyseus 0.17 在 `Room.__init()` 里消费
`this.messages`（`@colyseus/core/build/Room.mjs:225-236`），而 `__init()` 在 `onCreate()`
**之前**运行；生产房的 mode 直到 `onCreate:852-866` 才选定。**因此 handler 表不能按 mode 构建**，
必须保持「全 C2S 联合的静态表 + 在 `acceptMessage` 内按 mode 声明准入」。这一条绕不过去。
好消息：`maxClients` 在 `__init()` 后是 accessor（`Room.mjs:187-191`），写入会同步更新
`_listing`，而 `MatchMaker.mjs:300` 在 `onCreate` **之后**执行——**在 `onCreate` 里赋
`this.maxClients` 是被支持的**，撮合侧会正确看到 per-mode 容量。

**修复方案**：把 shell 里每个「玩法事实」变成 `GameMode` 上的一条声明，shell 只按声明分发。
`apps/server/src/rooms/GameMode.ts` 加三个字段：`roster: {min, max, autoStart}`、
`inputs: readonly C2SType[]`、`inputPhases?: {[K in C2SType]?: readonly GamePhaseType[]}`。
`GameModeRegistry.create`（`GameMode.ts:111-128`）已有 fail-closed 的必填校验模式，
把新字段加进去、漏配即抛。shell 侧：`phaseAllows(messageType)` → `phaseAllows(mode, messageType)`
（Ping/Chat 保留为公共能力，其余查 mode 声明；**`C2S.IdlePulse` 从 shell 的 switch 里删掉**，
改由 `IdleGameMode` 声明）；三个 handler 的差异化 body 收敛成 `:706-717` IdlePulse 那种
「交给 `modeMessage`，不被消费就 BadRequest」的统一形状；人数五处改查 `mode.roster`。

**代价（这是重构不是补丁，建议分三阶段）**：
- **阶段一（可独立落地）**：人数五处改为 `mode.roster`，`onCreate` 里赋 `this.maxClients`。
  不动 codegen、不动生成镜像。
- **阶段二**：`inputs` / `inputPhases` 声明化，`IdlePulse` 从 shell switch 下沉到 mode。
  需同步改 `docs/OVERVIEW.md` §4.2 与 `docs/SERVER.md` 的「新增 C2S 消息三处登记」步骤。
- **阶段三（必须一次做完）**：生命周期字段的 manifest 化——在
  `room-state-codegen.ts:429-472` 的 `parseRoomStateDescriptor` 加 root 断言
  （每个 root 必须声明 `tick`/`phase`/`matchId`/`players`），并由 codegen 生成
  `RoomStateLifecycle` 接口替换 `GameRoom.ts:388` 的 `declare readonly state: GameRoomState`。
  **牵动铁律 2 的生成物**：改完必须跑 `codegen:state` + `sync:shared`，并重钉协议指纹。

---

## 5. FGUI 产物往返自检未实现

**现状**：`docs/EXTRAFEATURES.md:241-267` §3.10 登记为未实现，并已写明它与哈希锁是两件事——
「哈希回答『这个文件还是我记下的那个吗』，往返自检回答『这个产物解析回来还是我以为的那份内容吗』」。
代码侧证实：`scripts/fgui-manifest.mjs` 对 `.bin` 只做存在性（`:321-324`）+ 字节哈希；
「组件已导出」这个断言（`:315-317`）查的是**源 XML 的 `exported=true`**，不是产物。
因此「导出过程静默丢内容、而哈希如实记录了这个残缺结果」这一失败形态无人拦。

**可行性已实证**：`.bin` 是 uncompressed FGUI v7（magic `FGUI` + version + compressed=0），
参考解码器就在仓内（`apps/client/extensions/fairygui-cc/runtime/fairygui.mjs:5225-5405`）。
调查中用**纯 Node、零依赖、约 60 行**重写了 header + 索引表 seek + 字符串表 + 依赖表 + 条目表
+ sprite 表，**12 个包全部解析成功**（条目 123 / 组件 27 / exported 条目 88，
与 `package.xml` 的 88 处 `exported="true"` 一致）。

**修复方案**：新增 `scripts/fgui-roundtrip.mjs`，与 `verify:fgui` **并列**（不替换）。
五条不变量，HEAD 全绿实测：

| # | 不变量 | 挡住的失败形态 |
|---|---|---|
| A | `package.xml` 中每个 `exported="true"` 资源的 `id` 必须出现在同名 `.bin` 条目表 | 主失败形态 |
| B | 源 XML 每个 `ui://<pkgId><resId>` 引用，目标 `resId` 必须在**目标包 `.bin`** 里（现有检查只查 `package.xml`） | 跨包引用被目标包漏导 |
| C | `.bin` 段 0 声明的每个依赖包都要有已导出的 `.bin` 且 id 对得上 | 依赖包整包漏导 |
| D | `.bin` 中 Atlas/Spine/Sound/Misc 条目引用的外部文件必须落盘 | 图集/骨骼文件漏导 |
| E | sprite rect ⊆ 对应图集图片真实尺寸（PNG IHDR / JPEG SOF 直读，零依赖） | 图集重导致尺寸变化而 bin 未同步 |

**A–D 首批，E 第二批**——E 必须处理 `rotated` 标志（旋转时 rect 的 w/h 与图集坐标轴互换），
调查中第一版没处理产生 6 个假阳，修正后归零，值得单独一轮。

⛔ **明确不要做**：不要拿「`package.xml` 声明数 == `.bin` 条目数」当不变量。FairyGUI 发布会
剥离未导出且无人引用的资源，这是正确行为——12 个包里 8 个存在合法差额，粗比数量会立刻产生
18 处假阳。

**失败语义**：`.bin` 由 FairyGUI 编辑器写出，本仓拦不住它落盘；本仓能做到的等价语义是
**阻止残缺产物进入下游**——检查必须在 `codegen:fgui` 重钉 AUTO 区块之前、以及
`fgui-manifest --write` 之前跑。建议把不变量检查内联到 `--write` 路径
（`currentManifest()` 之后、写文件之前抛错），`--check` 侧并列执行。

**代价**：纯新增脚本，零依赖；不动 `fgui.manifest.json` schema，`fgui-manifest.test.mjs`
现有 13 个 case 零改动。需决定是否进 `verify:core`（若进，按既有闸需在
AGENTS/CLAUDE/README 命令表与 `verify-toolchain` 的声明表同步登记，并补承重钉）。

**第二优先级（Excel→JSON）**：`tools/excel-to-json.mjs` 的 `--check` **不是往返自检**，
是重生成比对——`checkJson()`（`:314-331`）拿内存里的 `data` 重新序列化再比字节，
writer 与 checker **共用同一个 `data`**（`:379-392`），所以 `buildItems()`（`:243-285`）里
任何静默丢行对两侧同时生效、永远比得上。行数只进 summary 打印、不做断言（`:403`）。
低成本补法是在 `run()` 里对行数/键集做独立断言。
