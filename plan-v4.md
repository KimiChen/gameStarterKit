# gameStarterKit 当前开发收口计划（plan-v4）

> **本文件是当前开放问题、实施状态与验收证据的唯一真相**（`docs/inventory.json` 的
> `routeOfTruth.corePlan` 指向本文件）。上一轮 [plan-v3.md](plan-v3.md) 已降级为历史归档：
> 其正文 34 条 `[已完成]`、0 条待补齐，开放项全部闭合。
>
> 本文件从 plan-v3 的 78 条 `[不阻塞·有意保留]` 中挑出 **5 条真正的产品/工程留白**，
> 查清事实后做成可排期清单，随后逐条实施完毕。
>
> **口径**：每条给出「现状 / 可复现的失败形态 / 影响面 / 修复方案 / 代价」五项，并在实施后
> 补「实施结果」。指向源码的 `file:line` 为**写入清单时的快照**（HEAD `e58061d`），
> 实施后位置多已改变，复核时应重新定位。

## 真相指针迁移的批准来源

plan-v3 §30 登记过一条教训：`plan-v2 → plan-v3` 的迁移**批准存在，但只存在于会话指令**，
仓内查不到，只读仓库的复核者无从追溯。本轮据此先行记录，⛔ 不重复该形态。

- **批准来源**：用户会话指令，原话为「这五个问题都按照你的建议进行修复，修复完提交 commit，
  然后给我拍板的：**我确定可以**」。其中「拍板」指的正是 plan-v4 建档时挂起的那个待决项——
  「是否把 `routeOfTruth.corePlan` 从 plan-v3.md 迁到 plan-v4.md」。
- **迁移改动面**（本次实际修改，非举例）：`docs/inventory.json` 的 `routeOfTruth.corePlan`
  与 12 处能力 `docs`、`referenceDocs`（plan-v4 移出、plan-v3 移入）；
  `scripts/verify-inventory.mjs` 的 4 处硬断言改写与 2 条新增断言（「`referenceDocs` 必须登记
  plan-v3.md」与「`referenceDocs` 不得同时登记当前计划」）与助手关键指令表；
  `scripts/verify-inventory.test.mjs` 的 7 处 fixture；`README.md`、`AGENTS.md`、`CLAUDE.md`；
  `plan-v3.md` 降级归档头；以及 `plan.md`、`plan-v2.md` 两处下游归档指针。
- **归档内自称的复查**：`plan-v3.md:487` 原以现在时自称经 `routeOfTruth.corePlan` 纳入检查，
  已改为当轮时态并加归档补注。
  ⚠ **更正（迁移当轮的这段原文写过头了）**：当时写的是「本次不只按短语查，也按语义查」，
  但语义查实际只覆盖了 `plan-v3.md` 自身这一处。随后的对抗式复核又查出 19 处
  仍以现在时把 plan-v3 当作当前真相（已登记文档 15 处：`docs/OVERVIEW.md` 3 处、
  `docs/EXTRAFEATURES.md` 4 处、`docs/CLIENT.md` 2 处、`docs/SERVER.md` 1 处、`todo-godogen.md`
  5 处；另有未登记的 `docs/snakeoff/` 4 处，其中 OVERVIEW 与 EXTRAFEATURES 是那一轮**本就改过**的
  文件），而 `verify:inventory` 全绿。
  这正是本仓反复点名的「断言写得比证据远」。已全部改正，并新增 `checkArchiveNotClaimedAsTruth`
  机检：归档清单取自 inventory 自己的 `referenceDocs`，下一轮迁移无需改代码即自动开始守新归档。
  ⛔ 该闸只覆盖**已登记文档**（17 份），`docs/snakeoff/` 不在其中，那 4 处是人工改的。

## 实施状态总表

| # | 条目 | 状态 | commit | 变异验证 |
|---|---|---|---|---|
| 3 | ready marker 的熔断器放大 | **已实现** | `6707c36` | 熔断器合并 → 红；宽限窗口去界 → 红 |
| 2 | `emitMatchEvidence` 吞两类失败 | **已实现** | `d312541` | 两类失败合并 → int 红 1；两码合并 → 红 1 |
| 1 | `match_results.payload` 三形状 | **已实现** | `d34ef36` | 去掉加列 → 红 1；legacy 改标 3 → 红 2；去掉绑定校验 → 红 1 |
| 5 | FGUI 产物往返自检 | **A–D 已实现，E 未做** | `216087f` | 逐条删 A/B/C/D → 各红 1 |
| 4 | GameRoom shell 的玩法硬编码 | **三阶段全部已实现** | `1755bb2` / `47af72c` / `a6ce634` | 共 14 个变异，逐个转红 |

全量门禁：单测 324/324、int 155/155、`verify:all` exit 0（含随后一轮对抗式复核的 8 个修复 commit，见下节）。

## plan-v3 的保留边界仍然有效

本文件只承接 5 条产品/工程留白，**不**复制 plan-v3 的 78 条 `[不阻塞·有意保留]`。那些保留边界
（已评估过的取舍与范围限制）继续有效，其**原始记录与证据在历史归档
[plan-v3.md](plan-v3.md)**——查某条边界的具体内容时读那里，判断「当前计划状态」时读本文件。
⛔ 不要从 plan-v3 的完成标记推导当前状态。

## 仍然开放的部分

| 来源 | 内容 | 为什么留着 |
|---|---|---|
| 条目 5 | 不变量 E：sprite rect ⊆ 图集图片真实尺寸（PNG IHDR / JPEG SOF 直读） | `rotated` 会让 rect 的 w/h 与图集坐标轴互换，调查中第一版未处理产生 6 个假阳；值得单独一轮 |
| 条目 5 | `.meta` uuid 集合与 Cocos 场景序列化的往返自检 | 需要真实 Creator 引擎，属于尚未实现的 Creator 运行证据方向 |
| 条目 5 | `tools/excel-to-json.mjs` 的 `--check` 不是往返自检 | writer 与 checker 共用同一个内存 `data`，`buildItems()` 里的静默丢行对两侧同时生效；低成本补法是在 `run()` 里对行数/键集做独立断言 |
| 条目 1 | 存量 `match_results` 行的精确回填 | 只有 v3 能精确回填；一条恰好 8 键的 legacy 行与真 v2 行逐字节相同，⛔ 无法区分，故一律留在 `schema_version = 0` |

## 对抗式复核轮（8 个 commit）

五条实施完成后做了一轮对抗式复核（8 个维度并行找问题，每条发现由 3 个不同视角的反驳者
独立判定；32 条报出、12 条被驳回、20 条存活，去重后 14 条）。**多数是这一批自己引入的缺陷。**

| # | 问题 | 严重度 | commit |
|---|---|---|---|
| 1 | `docs/OVERVIEW.md` §4.2 动线代码块仍教人往 `phaseAllows` 加 case，与同节散文和 SERVER.md 的 ⛔ 矛盾；加 case 会短路 `default` 分支、静默吞掉 mode 声明的 phases | 高 | `74a7be1` |
| 2 | `d312541` 的落点（自检失败必须留持久痕迹）零回归覆盖——删掉整段 quarantine XADD 后单测 315/315、int 20/20 全绿；用例名 "before any XADD" 与生产行为相反；条目泄漏进永不裁剪的流 | 高 | `a7d593d` |
| 3 | 真相指针迁移漏了 19 处文档引用（已登记 15 处 + 未登记 snakeoff 4 处；含那轮**本就改过**的 OVERVIEW 与 EXTRAFEATURES），`verify:inventory` 全绿 | 高 | `d5f996a` |
| 4 | FGUI 不变量 B 只解析 `ui://`，漏掉主要拼写 `src=`/`pkg=`（53 对 38）——「被引用但未导出」的资源同时逃过 A 与 B | 高 | `ede87fe` |
| 5 | 不变量 D 漏掉 `require=` 伴生文件（Spine 的 `.atlas.txt`/`.png`） | 中 | `ede87fe` |
| 6 | `GRACE ≤ RECHECK` 时宽限是静默空操作；SERVER.md 恰好把 7d 写成建议值，而窗口上界那句也不实 | 中 | `20aa0e2` |
| 7 | root 的 `phase` 只验到「是个 enum」，异枚举与成员子集都能通过 | 中 | `9c87e70` |
| 8 | `usesDefaultBallMoveRules` 是自报布尔值，与真实 root 无绑定；idle root 上声明它会静默写坏状态且房间再也不结算 | 中 | `9c87e70` |
| 9 | `onLeave` 在 mode hook **之后**重取 player——mode 删条目会让整局证据被静默丢弃（上一轮引入的行为变化） | 中 | `880a8ca` |
| 10 | fail-closed 闸被注释/文档/用例名一致说成「登记期」，实际在 `create()`（建房时） | 中 | `880a8ca` |
| 11 | producer quarantine 条目与 Lua 条目字段不同，SERVER.md 的处置流程对它不成立；时间戳字段名也不一致 | 中 | `880a8ca` |
| 12 | 不变量 A 只比 id 集合，条目的 `exported`/`type`/`name` 从不对账 | 低 | `e460783` |
| 13 | 计数不实：「12 个包里 8 个存在合法差额」实测 7；「18 处假阳」实测 15 | 低 | `ede87fe` |
| 14 | `6707c36` 的提交信息写「服务端单测 297→298」，实测是 **297→299**（该 commit 加了 2 条用例）。commit 已推送不可改写，记录于此 | 低 | 本条 |

复核同时**驳回**了 12 条，其中值得记的两条：「`schema_version` 实际标的是来源流而非 payload 形状」
经独立核对不成立；「新测试用了仓内不存在的 `WEBPLATFORM_RETRY_ATTEMPTS`」的驳回则被第十九轮复核
**证伪**——该 env 全仓仅被测试设置、无读取方（确为死 env），原报出属实，已删除。⛔ 复核者的
结论同样要验，不能照单全收；上表第 13 条里的「18 处假阳」正是复核者判定「属实」而实测为 15 的例子。

新增的三道机检（都配了反例，逐条删除实现即转红）：
- `phaseAllows` 穷尽矩阵：每个非公共 C2S × 每个 phase 各断言「未声明必须拒 / 声明了必须放行」，
  往 switch 里加任何 case 都会转红。
- `checkArchiveNotClaimedAsTruth`：已登记文档不得把历史归档说成当前真相。归档清单取自
  inventory 自己的 `referenceDocs`，**下一轮迁移无需改代码**即自动开始守新归档。
- `CHARACTER_REGISTRATION_GRACE_MS` 与 `RECHECK` 的加载期配对校验。

全量门禁（本轮结束时）：单测 324/324、int 155/155、`verify:all` exit 0。

## 实施中发现的、清单里没有的事实

1. **ballMove v1 证据与 roster 的耦合此前无人守**（条目 4 阶段一发现）。证据侧
   `copyRoster` 用 `exactArray(2, 2)` 把 `initialRoster` 冻死，而 shell 直到真开局时才撞上，
   表现为给加入者的 `1000/Unknown` + 回滚。已提前到登记期报错。
2. **满员闸与开局边界重验在正常路径上到不了**（条目 4 阶段一）。`min ≤ autoStart ≤ max` 成立时
   人数一到 `autoStart` 就开局，座位数永远够不到 `max`。两处是 joinById/直连的兜底闸，
   用例改用预置座位与直接调用被验方法抵达——⛔ 不因为够不到就不测。
3. **条目 4 阶段三不牵动协议指纹**，与清单里的预判相反。`RoomStateLifecycle` 是服务端生成物，
   `apps/shared/` 逐字节未变，`sync:shared` 写入 0 个文件。已用例钉死（shared 产物不得出现
   `RoomStateLifecycle`）。
4. **`player.id` 的缺失已有更早的既存闸**（条目 4 阶段三）：map 的 `key.field` 指向它。
   用例据实钉住挡它的是那一条，⛔ 不谎称是本轮新增覆盖。

---

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

**实施结果（`d34ef36`）**：按方案 A 落地，并把「顺带建议」一起做了。
`schema_version TINYINT UNSIGNED NOT NULL DEFAULT 0` 照 `server_id` 的先例走不指定 `AFTER` 的
`ALGORITHM=INSTANT`，配 `verifyMatchSchemaVersionColumn` 读 `INFORMATION_SCHEMA` 精确核对；
`NormalizedEntry.schemaVersion` 三个 return 点分别填 2/3/0。legacy 补上
`LEGACY_MATCH_ID_MISMATCH` / `LEGACY_MODE_MISMATCH`，**只在 payload 确实带了该字段时**要求一致
——⛔ 不能无条件要求存在，真 c8 旧消息两者都不带，用例专门钉住这条不被误伤。
本机既有开发库由 `db:bootstrap` 就地 INSTANT 加列后 int 全绿，即迁移路径本身的实测。

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

**实施结果（`d312541`）**：`EmitEvidenceResult` 判别联合区分 `ok` / `kind:"self-check"` /
`kind:"transport"`；自检失败带具体码（`V3_PAYLOAD_<code>` 与 `V3_REPLAY_MISMATCH` 分别成码）
并走 `quarantineProducerSelfCheck`（只 XADD、`sourceKind:"producer"`、不 XACK）。
quarantine 自身写失败降级为 `transport/V3_QUARANTINE_UNAVAILABLE`——⛔ 不把传输故障伪装成
自检结论。GameRoom 只在 `kind === "self-check"` 时告警。

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

**实施结果（`6707c36`）**：熔断器按路由族拆分（`session` / `character` 各一个），
`call()` 签名加 `route` 参数。`webplatform-breaker-isolation.test.ts` 单独成文件——
`WEBPLATFORM_BREAKER_FAILURES` 在模块加载期读一次，而既有的
`webplatform-client.test.ts` 把它设成 100（等于关掉熔断），`node --test` 每文件一个子进程，
这样才能拥有自己的阈值与模块实例。宽限窗口由 `CHARACTER_REGISTRATION_GRACE_MS` 控制、
默认 0（即默认行为不变），且**刻意不调用** `markCharacterRegistrationReady`——
⛔ 宽限是「暂缓拒绝」，不是「重新确认已就绪」。

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

**实施结果（`1755bb2` / `47af72c` / `a6ce634`，三阶段全部完成）**：

- **阶段一**：`GameMode.roster{min,max,autoStart}`，五处字面量全部改读它，`onCreate` 里赋
  `this.maxClients`。登记期与注入期各一道 fail-closed 闸——注入式 mode 不经过 registry，
  ⛔ 只在 registry 校验等于留了个后门。
- **阶段二**：`GameMode.inputs{accepts,phases?}`，`C2S.IdlePulse` 从 shell 的 `phaseAllows`
  switch 里删除，改由 `IdleGameMode` 声明。`phaseAllows` 只保留 Ping/Chat。文档里的
  「新增 C2S 三处登记」据此改写为「两处登记 + 准入随玩法走」。
  ⚠ handler 表仍必须是全 C2S 联合的静态表，这条绕不过去（`Room.__init()` 早于 `onCreate()`）。
- **阶段三**：`parseRoomStateDescriptor` 加 root 生命周期断言，codegen 生成
  `RoomStateLifecycle` / `RoomStatePlayerLifecycle`，`GameRoom.state` 改用前者；
  **13 个** `this.ballState` 访问点，另有 **1 处**在 `onLeave` 里直接 `player as unknown as PlayerState`
  读 `alive`（那处必须用 hook 前捕获的引用，⛔ 不能改走 `ballState` 重取，见 `880a8ca`）——
  即 ball 专属访问点共 14 个，其中 13 个走访问器。⚠ 原文写「13 个……承接**全部**」是超出证据的：
  「全部」把那处刻意的例外抹掉了。getter 声明本身不是读写点。
  ⚠ 该数字被改错过两次：最初写「20 处」——那是重新给 `state` 定类型后 `tsc` 报出的**错误条数**，
  不是访问点数（同一行上的 `player.hp` / `.maxHp` / `.alive` 各算一条错误，却只对应一个访问点）；
  第十九轮改成「14 处」，是把 getter 声明也算进了读写点。以 `grep -o 'this\.ballState' | wc -l` 为准。

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

**实施结果（`216087f`，不变量 A–D）**：`scripts/fgui-roundtrip.mjs` 用纯 Node、零依赖解析
uncompressed FGUI v7，字段顺序照抄 `fairygui.mjs` 的 `loadPackage`——那是运行时真正用来读这些
文件的实现。12 个包全部解析成功，条目 123 / 组件 27 / exported 88，与 `package.xml` 的 88 处
`exported="true"` 相等。检查**内联在 `currentManifest()` 里、重记哈希之前**，`--write` 与
`--check` 同口径，一次 `--write` 不会把残缺状态钉成新基线。E 未做，理由见上文「仍然开放的部分」。

`test:fgui` 的三处声明（`package.json` / `verify-toolchain` / `toolchainContract` 承重钉）同步登记
——只改两处时承重钉如期转红，这也是该承重钉自身的一次实测。

---

## 复核与修复记录（2026-08-31）

**复核范围**：`0d2333e..f2a73ec`（真相迁移 + 五条实施 + 八个对抗修复 + 回写，共 20 个 commit）。
方法：三路对抗式独立核查（实施项 / 修复项 / 迁移与文档一致性）+ 全量基线实测。

**判定**：五条实施结果与八个对抗修复的声称**全部成立**（每条都做了父状态核对与亲手变异复现）；
真相迁移改动面与 plan-v4 各处声明基本属实；基线数字（服务端 324→326/326、int 155→157/157、
客户端 264/264、inventory 100/100、verify:all exit 0）实测复现。

**本轮修掉的**（各自独立 commit，均配能失败的断言与变异推演）：

1. `55fb112`：manifest 移除 ballMove root 时 `instanceof undefined` 的含混 TypeError → 可读诊断；
   绑定校验抽为导出的 `assertBallMoveRulesBinding`（生成物冻结，边界分支只能直接调用覆盖）。
2. 死 env `WEBPLATFORM_RETRY_ATTEMPTS` 删除——复核轮的驳回记录被证伪（全仓仅设置无读取）。
3. FGUI 引用抽取三处先剥 XML 注释，注释里的 `src=`/`ui://`/`pkg=` 不再产生假引用。
> ⚠ 本文引用的 commit hash 以**可从 HEAD 到达**为准。上面两条曾写成 `a77a4cd` / `ae03792`——
> 那是 rebase 前的 hash，在本地因 reflog 仍能 `git show`，但 `git merge-base --is-ancestor` 判定不可达，
> 新 clone 的仓库里就是死引用。⛔ 回写 hash 后若发生过 rebase，必须重新核对可达性，
> 不能只确认「能 show 出来」。

4. `018a2bd`：emitMatchEvidence 自检③（payload 超预算）与 XADD 传输失败的故障注入覆盖
   （自检③在诚实数据下数学不可达，用定点桩 + 上界实测断言锁定；详见 commit 与用例注释）。
5. `c493c8c`：宽限「不覆盖」形状的五条定向反例（新号/pending/legacy×2/配置事故）+ 正对照。
6. plan-v4 文档更正一个 commit：迁移段分项计数（OVERVIEW 2→3、todo-godogen 4→5、
   「已登记 19 处」拆 15+4）、断言口径（4 改写 + 2 新增）、驳回记录证伪更正、
   条目 4「20 处 ballState」→ 实测 13 处（`this.ballState` 精确计数；20 是最初 tsc 错误条数，
   14 是本轮误测把 getter 声明算了进去，`8fbb987` 已二次更正，见条目 4 的就地注记）。

**仍登记的观察项/边界**：

- `src=` 悬空的 resId（pkg 有效但目标包声明里无此 id）今天无闸——修它要先定义「合法但不被引用」
  的语义边界，有误红风险，暂登记不动。
- FGUI 合法差额里有 2 个**负差额**包（Dynamic_Login、View_SharedWidget_Confirm，bin 比声明多）——
  「发布会剥离未导出资源」的文档解释不覆盖负差额，属解释不完备而非缺陷。
- 条目 2 的 XADD 失败在 GameRoom stub 侧无注入（int 侧已覆盖，单测侧桩不重复建设）。

### 第二十轮：同事 4 个 commit + 对抗式复核 9 个修复

同事修了 4 条（`55fb112` 缺 root 可读诊断、`299ed81` 删死 env、`4bc4366` 引用抽取剥注释、
`5a16965` 更正四处计数），随后一轮六维度对抗式复核（21 条报出、12 条驳回、9 条存活）。

**接手时先撞上的两件事**（都不在复核范围内，是直接跑门禁发现的）：

- `npm run typecheck` **一直是红的**：`55fb112` 抽出的函数里 `selected` 在 `instanceof` 否定分支被
  收窄成 `never`，读 `.constructor.name` 编译失败。单测全绿是因为 tsx 运行期不做类型检查。
  `verify:all` 本就含 typecheck，闸是有的——这次是没跑到底。（`c77d7bc`）
- 工作区残留**一处未还原的变异**：`emitMatchEvidence` 的 `PAYLOAD_SIZE` 守卫被删掉，
  正是当轮新写的自检③用例的变异锚点。HEAD 一直是对的，丢的是工作区。

**复核确认并修掉的 9 条**：

| 问题 | 严重度 | commit |
|---|---|---|
| 「排队超时只在 任务超时<退避 排序下可达」是假命题（`onJobTimeout` 只看任务是否还在 queue，worker 被长任务占满同样可达），写在三处 | 高 | `e0a816b` |
| 注释剥离对 CDATA 不感知，CDATA 里的 `<!--` 会吞掉其后真实引用（方向是误绿）；实测当前 41 个 XML 里 0 命中，属加固 | 高 | `06aeeea` |
| 把退避改成可配置后，用例仍按硬编码 1000/900 断言——`COMPUTE_RESPAWN_DELAY_MS=2000` 即假红 | 中 | `68ea3fa` |
| 注释剥离的第三个调用点（`pkg=` 扫描）无人守：单独去掉它 test:fgui 仍 62/62 全绿 | 中 | `ac7e18a` |
| `stripXmlComments` 与既有 `withoutXmlComments` 逐字节同义，一条规则两份实现 | 中 | `d792f26` |
| 熔断用例注释的证据命令 `grep -n 超时` 是坏引证，只会命中注释自己（应为 `grep -n TIMEOUT`） | 中 | `afa92b4` |
| 「13 个访问点承接**全部** ball 专属读写」超出证据：`onLeave` 有一处刻意的例外 | 低 | `8d0f6d7` |
| `assertBallMoveRulesBinding` 插进了 `GameRoomClock` 与它的 JSDoc 之间 | 低 | `e6fec0a` |
| plan-v4 两个 commit hash 被 rebase 变成不可达（本地 reflog 仍能 show，新 clone 即死引用） | 低 | `ab3bf46` |

**两个 flaky 测试**（`verify:all` 真的红过，非并发干扰）：compute 故障注入用例两个子进程的超时
预算都不足以覆盖 worker 冷启动（`ac691e5` + `25de865`，第一次只修了一半）；熔断隔离用例的
40ms/120ms 是全文唯一的负载敏感数字（`fb777ce`）。⚠ 后者**未能确定性复现**（连续 13 次全量绿都没
撞上），是按静态分析消除唯一可疑变量，不是复现-修复-复现的闭环；若再现需另找根因。

**改不了的一条**：`c77d7bc` 的提交信息写「单测 326/326」，实测该 commit 上是 **325**（326 要等
同事那两个测试 commit 落地之后）。commit 已推送，不可改写，记录于此。

**同事四处计数更正的复核结论**：三处属实且原文比他们说的更差——我的分项加总只有 17，
却自称总数 19（实测 OVERVIEW 3 / EXTRAFEATURES 4 / CLIENT 2 / SERVER 1 / todo-godogen 5 /
snakeoff 4 = 19）。第四处「ballState 14 处」把 getter 声明算成了读写点，实测访问器调用 13 处、
另有 1 处刻意例外。另：他们推翻了上一轮复核对 `WEBPLATFORM_RETRY_ATTEMPTS` 的驳回——
该 env 确无读取方（重试硬编码 `attempt < 2`），**原报出属实，上一轮的驳回是错的**。

### 第二十一轮：对抗复核同事的 flaky/加固批次（2026-08-31）

**复核范围**：`d28363d..33fe7f1`（16 个 commit：compute flaky 四连修、排队超时更正、熔断 flake
两连修、FGUI 注释/CDATA 三连修、四个文档修正、第二十轮回写）。方法：三路对抗式独立核查 +
真实负载测量（冷启动空载 90–170ms、满载峰值 1142ms）+ 多配置矩阵实测。

**判定**：compute 四连修（`ac691e5`/`41e06d8`/`25de865`/`68ea3fa`）与 `e0a816b` 的可达性更正
**全部成立**（根因经负载实测证实；`COMPUTE_RESPAWN_DELAY_MS=2000` 的假红在父 commit 复现、
HEAD 绿）；`fb777ce` 成立且其「未闭环」自报诚实（文件内唯一负载敏感变量属实，全量套件
连跑 6 遍稳定）；FGUI 三件（`06aeeea`/`ac7e18a`/`d792f26`）成立；文档四处基本属实。

**本轮修掉的**（各自独立 commit）：

1. 熔断用例注释的 grep 证据命令**第三次**自指（`grep -n TIMEOUT` 命中注释自身）——改为
   正则形式使命令文本不匹配自身，实测只命中两行赋值。
2. compute late-queue 断言 `>= 850`（`68ea3fa` 漏网的第 4 处硬编码）→ 相对式
   `>= RESPAWN_MS * 0.9`；第二子进程退避钩子在 env 缺失时为 NaN → 补 `?? 1000`。
3. compute admission 饱和用例的 `COMPUTE_TASK_TIMEOUT_MS=1000` 小于真实 worker 冷启动时
   third 转 running 而非 overload → 放宽到 5000（断言依赖容量计数，不依赖超时发生）。
4. `COMPUTE_RESPAWN_DELAY_MS` 的加载期边界补 config-guard 用例（0/负/小数/非数字/越界拒启，
   1/上限/常用值放行；两组变异实测转红）。
5. plan-v4 标题计数更正（「对抗式复核 10 个修复」→ 9 个，与表行数一致）。

**仍登记**：第二子进程 1200ms 预算与满载冷启动峰值（1142ms）贴边，更重机器可能再红；
CDATA **内容**里的字面 `src=` 仍会被当真引用（当前 0 命中，未守边界）；
`fb777ce` 未形成复现-修复-复现闭环（已自报），若全量套件再现熔断红需重新取证。

实测：`verify:all` exit 0（服务端 327/327、客户端 264/264、FGUI 63/63）、
compute 相关文件连跑 5 次稳定、typecheck 全阶段 0 错。
