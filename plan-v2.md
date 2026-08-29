# gameStarterKit 开发收口计划

> **本文件是当前开放问题、实施状态与验收证据的唯一真相。** `plan.md` 只保留为历史审阅归档；
> 新结论不得回写其中，也不得从历史完成标记推导本轮状态。
>
> 本轮逐项处理下列问题。每个 `[不阻塞·待补齐]` 或 `[条件阻塞]` 问题必须在独立 commit 中同时完成实现、
> 按风险验证和本条证据回写；代码或门禁问题须有能失败的定向测试，纯文档问题至少通过 inventory 链接检查
> 并人工核对 diff。`[不阻塞·有意保留]` 是已经接受的外部前提或范围边界，不属于待开发项。
>
> 历史抽取基线：`plan.md` @ `371d72e`。本文所有 `plan.md:NNN` 都只定位该历史快照；当前归档文件会继续
> 因文档修正而变化，不保证沿用这些行号。
>
> **阻塞性标签**（每条一个）：
> `[不阻塞·有意保留]` 已评估过的取舍或范围限制，不打算改；
> `[不阻塞·待补齐]` 认可的缺口，补齐前不影响当前限定范围的核心验收；
> `[条件阻塞·<触发条件>]` 平时不阻塞，但触发条件成立前必须处理；
> `[已完成]` 已有仓内实现、能失败的定向测试和本条验收证据。
>
> `plan.md` 的 P0-01、P0-03 与 §8–§11 经核对已无开放项，故本清单不设对应条目。

## 1. 总体剩余风险

以下限制由 `plan.md` 的总体结论直接列出（来源：`plan.md:114-118`）：

- `[不阻塞·待补齐]` relayer 仍在持有 MySQL 锁的事务内等待外部 I/O（详见 §4 P1-06）。
- `[不阻塞·待补齐]` archive 表仍缺少完整的区隔离与容量方案（详见 §4 P1-06）。
- `[不阻塞·待补齐]` 坏 stream entry 的处置仍待补齐（**本清单无对应 P 条目，仅此处登记**）。
- `[不阻塞·待补齐]` 热档 schema 迁移仍待补齐（详见 §4 P1-06）。
- `[不阻塞·待补齐]` Game HTTP request schema 尚未直接由 shared validator 生成（详见 §4 P1-03）。
- `[不阻塞·待补齐]` match evidence 不足以重放完整输入序列（**本清单无对应 P 条目，仅此处登记**）。
- `[条件阻塞·首次线上兼容义务发布前]` `PROTOCOL_VERSION` 仍为 5：`9dff8f9` 已收紧 `setField` 的 wire
  接受域（UTF-16 码元 → UTF-8 字节）但未 bump 版本。开发期仓内没有已部署的旧版线上客户端，当前不存在
  混合版本兼容义务；**首次承担线上兼容义务的发布前，必须把该语义变更提升为新协议版本并按迁移窗口发布**。
  来源：`plan.md:123-126`、`plan.md:43-44`

除标注 `[条件阻塞]` 的条目外，本清单所有条目均不影响当前限定范围的核心验收；但不能据此把当前 Demo
描述成通用生产框架。

## 2. 验证基线的外部前提

`plan.md` §3 的基线表全部「通过」结果都建立在以下前提之上，这些前提本身不构成通过证据：

- `[不阻塞·有意保留]` 端到端 `smoke` 仍需要外部 WebPlatform 与一个正在运行的游戏服；`plan.md` 本轮
  **未**把它写成已通过证据，基线表的任何「通过」都不包含 smoke。
- `[不阻塞·有意保留]` 真实 Creator 预览与目标设备性能采样同为人工边界，同样不在任何自动化通过声明内。
- `[不阻塞·有意保留]` 默认进程的真实启动依赖这些本地/外部服务，因此 Node/本地栈测试全绿不等于生产
  拓扑或第三方服务可用性承诺。

来源：`plan.md:158-159`、`plan.md:77`、`plan.md:454`

## 3. P0 保留问题

### P0-02 玩法规则留白

- `[不阻塞·有意保留]` 对局时长上限属于规则设计决策；`plan.md` 明确把它排除在本条内存有界性缺陷之外
  （accepted input 上限已由生产常量 `MAX_ACCEPTED_INPUTS = 16_384` 收口）。此处仅作为规则层留白登记，
  不是未闭合的 P0 缺陷。

来源：`plan.md:260-261`

### P0-04 ready marker

- `[不阻塞·待补齐]` `characterRegistration` 与 `characterRegistrationCheckedAt` 当前不在
  `EFFECT_RESERVED_FIELDS`。现阶段因 `EFFECT_FIELD_ALLOWLIST` 未收录而不可利用，但未来若误加入
  allowlist，客户端可能修改 ready marker 或复核时间戳。
- `[不阻塞·有意保留]` `characterRegistrationCheckedAt` 是复核窗口的新鲜度闸门；若被客户端刷新，
  可能永久走 ready 快路径，绕过权威复核。
- `[条件阻塞·扩 EFFECT_FIELD_ALLOWLIST 时]` 由此产生一条长期约束：将来扩 `EFFECT_FIELD_ALLOWLIST` 时，
  **必须**同时把上述两个字段加入 `EFFECT_RESERVED_FIELDS`（值规则对 allowlist 穷尽，扩表也必须同时补规则）。
- `[不阻塞·有意保留]` ready marker 只在有限复核窗口（默认 24 小时）内作为快路径；窗口过期的热档与
  全部解冻冷档在下次 join 时必打一次 `hasCharacter`。
- `[不阻塞·有意保留]` WebPlatform 不可用时该次 join 被拒（与首次建档失败同码），重试仍会被拒，
  只留 durable repair intent 待外部恢复后收敛。默认窗口下故障期每小时约有 1/24 的回访热档用户受影响；
  冷档解冻后 `characterRegistrationCheckedAt` 必为旧值，解冻用户在故障期一律受影响。
- `[不阻塞·有意保留]` `CHARACTER_REGISTRATION_RECHECK_MS` 是模块级常量，只在进程加载时读取；调整需要
  重启，当前没有运行时降级或宽限开关。
- 以上 fail-closed 行为是有意取舍（`plan.md` 明确写为「不是待降级项」），但仍是明确的可用性边界。

来源：`plan.md:355-363`、`plan.md:365-371`

### P0-05 生命周期证据

- `[不阻塞·有意保留]` 完整外部 Redis/MySQL/WebPlatform smoke、真实 Creator 预览和目标设备采样不在
  Node 证据内。
- `[不阻塞·待补齐]` SIGTERM 子进程用例替换的不止外部适配器，还包括 `app.config` 组合根
  （rooms/routes/express）、`infra/config`，以及 loader、loopMonitor、matchConsumer、kickBus、
  character、characterRepair、push、redisRoute、mysql、webPlatformClient 的探针桩，运行时房间数为 0；
  其中 `player/character.ts` 被桩掉意味着 character-ready 阶段本身也是探针。
- `[不阻塞·待补齐]` 该用例证明 admission 关闭时点、阶段释放顺序与 exit 0，但不证明真实房间在
  `onBeforeShutdown` 与 `onShutdown` 之间被排空。其中真实依赖装配另由同文件的源码接缝断言
  （含 `listen(app, PORT)`、只注册一处 aggregator）与本地 smoke 承担；真实房间排空仍无 Node 侧证据。

来源：`plan.md:437-438`、`plan.md:445-454`

## 4. P1 保留问题

### P1-01 多玩法边界

- `[不阻塞·有意保留]` `idle` 只是无 presentation 的最小 multi-mode 证明，不代表完整第二玩法 UI 已交付。
- `[不阻塞·有意保留]` 共享的 `GameRoomState`、Waiting/Playing/Settle 相位、两人开局和部分 reset/settle
  仍以 ballMove Demo 为基线。
- `[不阻塞·待补齐]` 不同房间状态和结算语义的玩法仍需扩展 shared Schema 与 mode 契约。
- `[不阻塞·有意保留]` 真实 Creator 资源导入和目标设备行为仍需编辑器预览。

来源：`plan.md:478-485`

### P1-02 View/Logic 真实引擎边界

- `[不阻塞·有意保留]` 当前完成的是 Node 可测试边界；真实 Creator 引擎行为仍未验证。
- `[不阻塞·有意保留]` 真实 Creator 输入、资源行为和编辑器生命周期仍由预览确认。

来源：`plan.md:490`、`plan.md:516`

### P1-03 HTTP contract

- `[不阻塞·待补齐]` Game HTTP request schema 仍由 endpoint options 维护；shared validator 只在本地
  schema 前后夹持并做接受集合对照，未由 shared 直接生成。
- `[不阻塞·待补齐]` 新增 endpoint 仍须人工登记 contract map；漂移本身已由 route/shared 接受集合漂移
  用例与前后夹持的 shared validator 覆盖，残留的是「schema 未由 shared 直接生成」这一来源边界。
- `[不阻塞·有意保留]` WebPlatform consumer map 另登记了仓内未调用的 `Livez`/`Readyz` 两个契约
  （属 consumer 子集而非生成全集，当前无实际暴露面）。

来源：`plan.md:521`、`plan.md:525-526`、`plan.md:530-531`

### P1-04 schema-first 范围

- `[不阻塞·待补齐]` 当前只完成第一阶段的 shared exact validators、RPC/HTTP contract map、
  Colyseus state mirror 和协议 fingerprint。
- `[不阻塞·待补齐]` 更广泛的自动生成 state/schema 仍属于后续演进，尚未实现。

来源：`plan.md:541-547`

### P1-05 FairyGUI/Creator 资源验证

- `[不阻塞·有意保留]` FairyGUI 编辑器导出、资源导入和运行时 `autoClearItems` 等行为仍需 Creator
  编辑器预览。
- `[不阻塞·有意保留]` Node 门禁只验证资源/生成物闭包与编排契约，不能替代真实引擎和目标设备验证。

来源：`plan.md:552`、`plan.md:566-567`

### P1-06 任务、存储和冷档边界

- `[不阻塞·待补齐]` relayer 事务边界、archive 区隔离/容量方案与热档 schema 迁移仍列为明确限制
  （即 §1 的第 1、2、4 条）。
- `[不阻塞·有意保留]` freeze worker 默认硬关闭（`FREEZE_ENABLED`），默认配置下不会触发。
  （「启用需 unsafe escape hatch」一说出自 `docs/EXTRAFEATURES.md`，非 `plan.md` 原文。）
- `[不阻塞·有意保留]` dispatcher 的 timeout 仍不取消 handler，迟到副作用只能由数据层幂等收敛。

来源：`plan.md:573-574`、`plan.md:585-586`、`plan.md:596-597`

### P1-07 大厅重连

- `[不阻塞·有意保留]` Game transport 目前只做 desired input 对账，不等同于业务恢复。
- `[不阻塞·待补齐]` 大厅连接最终死亡后会整段重新登录，以重建 session 和角色快照；当前没有独立的
  session/角色快照对账层。
- `[不阻塞·待补齐]` Lobby 房没有注册 `onReconnect`，`slot.dropping` 当前也没有对应消费方。

来源：`plan.md:615-618`

### P1-08 本地验证边界

- `[不阻塞·有意保留]` 失效的 loadtest、未闭合的 Excel 生成链和真实 Creator 预览仍被归为额外或人工
  验证边界。
- `[不阻塞·有意保留]` legacy probe 使用本地引擎声明桩，不能替代真实 Creator 引擎、资源导入、运行时
  交互和目标设备验证。
- `[不阻塞·有意保留]` 客户端 strict 编译探针（`apps/client/tsconfig.test.json`，覆盖 Main、全部 View、
  `pages.ts`/ViewMgr 与客户端 tests）同样只在 Node 最小 cc/FairyGUI 桩下运行，其「通过」只证明
  TypeScript/API 形状，真实 Creator 类型与资源仍需编辑器验证。
- `[不阻塞·待补齐]` `config:excel-to-json:check` 只读取并校验源表，不比较缺失或陈旧的生成 JSON。
- `[不阻塞·有意保留]` `test:int` / `test:faults:int` 依赖本地 Redis/MySQL 与当前 Node/Colyseus 运行时；
  环境中触发的既有 schema decorator 兼容错误按约定记录为环境边界，不得误写成新回归。

来源：`plan.md:631-632`、`plan.md:668-669`、`plan.md:149`、`plan.md:148`、`plan.md:154-156`

### P1-09 登记和文档覆盖

- `[不阻塞·待补齐]` `verify:inventory` 不检查 AGENTS/CLAUDE/README 命令表完整性，同类遗漏仍可能再次发生。
- `[不阻塞·有意保留]` inventory 与 Markdown 链接检查只覆盖登记表内文档和就近 README，不扫描仓库根的
  散装 Markdown；根目录 `todo-godogen.md` 与本文件因此都不在任何机检覆盖内，其待办与处置见 §6。
- `[不阻塞·有意保留]` 组合根发现不构建完整 TypeScript import graph，scene 发现不扫描动态 prefab；
  Markdown 检查只守住登记链接和锚点，不是通用语法解析。

来源：`plan.md:695-696`、`plan.md:709-716`、`plan.md:718-719`

## 5. P2 验证和性能边界

### P2-01 性能基线

- `[不阻塞·有意保留]` 当前基线比较固定输入、渲染命令和 checksum，也记录分配估算。
- `[不阻塞·有意保留]` 计时分布、heap delta、Cocos/GPU 和目标设备性能阈值不构成门禁，真实阈值仍需
  本地预览和目标设备采样。

来源：`plan.md:725-729`、`plan.md:736-737`

### P2-02 故障和变异测试

- `[不阻塞·有意保留]` 当前是定向故障/变异矩阵，不是自动源码 mutation，也不是全局覆盖率指标。
- `[不阻塞·有意保留]` 集成组需要本地 Redis/MySQL；WebPlatform 故障使用契约兼容的本地测试替身，
  不要求外部进程在线。

来源：`plan.md:741-746`

### P2-03 Starter 范围边界

- `[不阻塞·有意保留]` `init:project` 的必选项不包含 Unity、托管、渠道与商业化；这些始终留在额外功能
  范围，不构成 Starter 初始化的完成门槛。

来源：`plan.md:755-756`

## 6. 额外未实现项

- `[不阻塞·有意保留]` `todo-godogen.md` 中的 T1–T7（三条 P1、四条 P2）仍未完成；`plan.md` 将其定性为
  对外部项目的对照吸收计划，不是本仓承诺、不与核心优先级竞争，也不构成核心完成门槛
  （`todo-godogen.md` 自述为「不进入 `verify:core` 的既有门禁口径」）。
- `[不阻塞·有意保留]` 原列首位的「产物往返自检」已按 `docs/undergroundIdle/` 的既有先例迁入
  [`docs/EXTRAFEATURES.md` §3.10](docs/EXTRAFEATURES.md#310-产物往返自检导出物反序列化校验)，
  当前状态仍为未实现；它用于发现导出过程静默丢内容，现有 manifest/hash 检查不能覆盖这一失败形态。
  该迁移可作为其余条目的处置样板。
- `[不阻塞·待补齐]` 若长期保留 `todo-godogen.md` 的其余内容，应同样在 README、AGENTS/CLAUDE 与
  `docs/EXTRAFEATURES.md` 登记，或迁入 `docs/` 后纳入链接检查。

来源：`plan.md:92-96`、`plan.md:709-716`

## 7. 文档自身的问题

- `[已完成]` 历史归档顶部前向引用已明确覆盖第十至十二轮，不再漏掉第十二轮。验收证据：
  `npm run verify:inventory` 通过并人工核对归档轮次范围。
- `[不阻塞·待补齐]` 第十轮记录（`plan.md:59`）内嵌「当前树 HEAD 为 `0ea018c`」：这是撰写时快照，
  随分支推进立即过期。过程记录中的自指表述应写成纯历史叙述（「复核时 HEAD」已足够），
  不宜保留第二个「当前」表述。
- `[不阻塞·待补齐]` 第十一轮（`plan.md:75`）写「见 P0-04「未覆盖判据」」，但 P0-04 实际使用的小节标题是
  「覆盖面」（`plan.md:373`），引用无法直接定位；同轮登记的 5 处恒真/无覆盖附带断言只给了条目范围
  （P0-04 及 P0-05／P1-08／P1-09），没有逐项行号，读者无法核对。且 `plan.md:373` 的「覆盖面」段落通篇
  陈述判据已被 `0ca9f74` 用例锁定、删 `character.ts:121` 会变红，并未登记任何恒真/无覆盖断言——
  引用因而不只是标题对不上，指向的内容也不含被引之物。
- `[不阻塞·待补齐]` 图例（`plan.md:105`）把 `✅` 定义为「当前基线已完成并有测试/门禁证据」，但 P0-04
  （`plan.md:365-371`）、P0-05（`plan.md:445-454`）、P1-06、P1-07 等 ✅ 条目仍保留明确的安全、可用性、
  证据或扩展边界，状态标记容易被误读为「没有遗留问题」；本清单的存在即为缓解。
  更硬的问题在图例本身：同一行把 `◐` 定义为「核心接缝已完成但保留明确限制」并声明「当前无条目使用」，
  而 P0-04、P0-05、P1-05（`plan.md:566`）、P1-08（`plan.md:668`）、P1-09（`plan.md:695`、`:718`）
  都带明确保留边界，正落在 `◐` 的定义域内却标为 ✅。二选一：要么把这些条目改标 `◐`，要么在图例中
  删掉「当前无条目使用」并写明「✅ 与「保留边界」小节可以共存，✅ 仅覆盖条目正文声明的限定范围」。
- `[已完成]` `plan-v2.md` 已登记为 `docs/inventory.json` 的 `routeOfTruth.corePlan`，根 README、
  AGENTS/CLAUDE 与当前缺口入口均指向本文件；`verify-inventory.mjs` 会拒绝把历史 `plan.md` 重新登记为
  当前计划，同时通过 `referenceDocs` 继续检查历史归档链接。验收证据：`npm run verify:inventory` 与
  `npm run test:inventory`。

> 协议版本待评估项原列于本节，因其带有硬性发布前置条件、属技术待办而非文档问题，已移至 §1 第 7 条。
