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

- `[已完成]` relayer 已拆为守卫选择短事务、事务外 Redis apply/thaw、守卫落状态短事务；trim 与死信日志
  同样只在提交后执行，MySQL 行锁不再跨外部 I/O。生产契约保持 singleton 串行，lease 交接重放由
  `op_id + canonical payload` 幂等收敛，不承诺多 worker claim/分片。验收证据：
  `relayer-boundary.test.ts` 覆盖成功/失败阶段、lease 丢失、死信与 CAS 0 行，`int/relayer.test.ts` 覆盖
  真实进程崩溃窗口和 lease 接管；定向边界测试 7/7、`npm --workspace @game/server run typecheck`、
  `npm --workspace @game/server run test` 214/214 与 `npm --workspace @game/server run test:int` 104/104 通过。
- `[不阻塞·待补齐]` archive 表仍缺少完整的区隔离与容量方案（详见 §4 P1-06）。
- `[已完成]` 坏 match stream entry 不再 ACK 丢弃：来源流与 quarantine 固定同槽，Lua 先持久化来源
  key/id、group、原因码及精确原始 fields，再 ACK 来源 PEL；v2 payload 在生产/消费两侧做 exact shape 与
  已声明值域校验，opaque loadout 也须为 canonical JSON，legacy 保持历史兼容域。同主机 worker 使用进程
  唯一 consumer，崩溃 PEL 由 `XAUTOCLAIM` 接管。quarantine 禁止自动裁剪，
  非空及 key 类型/权限错误均独立告警；`docs/SERVER.md` 登记了修复重投、确认落库后再删除的处置顺序。
  验收证据：`int/settlement.test.ts` 12/12 覆盖完整 payload 反例、casual/ranked loadout 值域与 JSON
  保真、隔离副本、来源 ACK、普通 trim 不触碰 quarantine 与 quarantine WRONGTYPE 时保留 PEL；
  `stream-depth-lifecycle.test.ts` 3/3 覆盖独立告警；
  `npm --workspace @game/server run typecheck`、服务端单测 215/215、全量集成 106/106 与
  `npm run verify:inventory` 通过。
- `[不阻塞·待补齐]` 热档 schema 迁移仍待补齐（详见 §4 P1-06）。
- `[已完成]` Game HTTP request schema 已由 shared validator 同源生成并直接注入（证据见 §4 P1-03）。
- `[不阻塞·待补齐]` match evidence 不足以重放完整输入序列（**本清单无对应 P 条目，仅此处登记**）。
- `[已完成]` `PROTOCOL_VERSION` 已提升为 6，版本流水明确登记 `setField` 文本接受域由 UTF-16 码元收紧为
  UTF-8 字节并拒绝不成对代理项。客户端 Lobby/Game join 与服务端两个版本闸均消费同一 shared 常量；旧 v5
  会以 `ProtocolMismatch` 拒绝，仓内不存在已部署旧客户端，因而在首次线上发布前完成了单版本切换。
  验收证据：`node scripts/protocol-fingerprint.mjs` 生成 `v6` 指纹，`npm run test:client`、
  `npm --workspace @game/server run test` 与 `npm run verify:sync`。

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

- `[已完成]` `characterRegistration` 与 `characterRegistrationCheckedAt` 已加入 shared
  `EFFECT_RESERVED_FIELDS`；validator 在 allowlist 前拒绝 reserved 字段，Lua reserved 集合也由同一 shared
  常量生成。未来即使误扩 `EFFECT_FIELD_ALLOWLIST`，客户端仍不能写 ready marker 或复核时间戳。
  验收证据：`wire-contract.test.ts` 锁定集合成员与稳定 `EFFECT_RESERVED_FIELD`，
  `int/effect-atomic.test.ts` 锁定 Lua validate-then-apply 不产生半状态；`npm run verify:sync` 与协议指纹通过。
- `[不阻塞·有意保留]` `characterRegistrationCheckedAt` 是复核窗口的新鲜度闸门；若被客户端刷新，
  可能永久走 ready 快路径，绕过权威复核。
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
- `[已完成]` SIGTERM 子进程用例继续隔离外部适配器并证明默认入口的 admission 关闭、阶段释放顺序与
  exit 0；另由 `shutdown-aggregator.test.ts` 在独立子进程中启动真实 `Server`、`WebSocketTransport` 与
  matchmaker，通过真实 SDK 客户端加入一个活动测试 Room。其阻塞式 `onDispose` 锁定
  `before-done < room-dispose-start < room-dispose-done < after-start`，并证明 dispose 未释放时
  `onShutdown` 与停服 Promise 均不能提前完成，最终房间计数归零、房间引用移除且 transport 关闭。
  该证据不引入 Redis/MySQL/WebPlatform，也不把直接调用 Room hook 当作框架生命周期。
  验收证据：`shutdown-aggregator.test.ts` 6/6 与 `index-startup-lifecycle.test.ts` 3/3 定向通过；
  `npm --workspace @game/server run typecheck`、服务端单测 215/215 与 `npm run verify:inventory` 通过。

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

- `[已完成]` `GameHttpContractMap` 在 shared 定义每项 contract 时由 request validator 直接生成
  Standard Schema；`createGameEndpoint` 给带 body 的路由安装同一 schema 实例，并在类型与运行时都禁止
  endpoint options 另带本地 body schema。验收证据：HTTP request/response 与 wire 定向测试 22/22，
  服务端单测 215/215、`npm run typecheck`、`npm run verify:sync` 与协议指纹测试 3/3 通过。
- `[已完成]` HTTP domain 文件由 TypeScript AST 自动发现并生成静态 `manifest.generated.ts`，`http/index.ts`
  不再维护人工 import 表；生成器强制官方 factory、literal contract key 和直接 default export，并双向拒绝
  缺失、未知、重复或未重生成的 endpoint。验收证据：HTTP manifest/route/response 定向测试 15/15，
  `npm --workspace @game/server run codegen:http -- --check`、服务端 typecheck、服务端单测 220/220 与
  `git diff --check` 通过；漏文件反例同时证明旧的已登记 route 集合断言仍会误绿而 freshness 门禁会失败。
- `[不阻塞·有意保留]` WebPlatform consumer map 另登记了仓内未调用的 `Livez`/`Readyz` 两个契约
  （属 consumer 子集而非生成全集，当前无实际暴露面）。

来源：`plan.md:521`、`plan.md:525-526`、`plan.md:530-531`

### P1-04 schema-first 范围

- `[已完成]` `apps/shared/schema/game-room-state.json` 现为 `PlayerState` / `GameRoomState` 全部 wire 字段、
  默认值、值域、Map key 关联及服务端内部字段的单一声明源；同一 manifest 生成 shared 纯数据接口与
  exact validators，以及服务端 `@colyseus/schema` class，`serverOnly` 字段只生成未装饰属性，不进入 wire。
- `[已完成]` `codegen:state` 对 manifest 做 exact shape、kind、重复名、bounds、跨字段/Map 引用和
  serverOnly 冲突校验，`--check` 只读拒绝缺失或陈旧双端生成物；AST 反向断言 shared validator keys、
  server decorated keys 与 manifest 精确相等。验收证据：生成/freshness 正反例 6/6，真实 wire 合约
  14/14，协议指纹 3/3，服务端全量单测 247/247；shared/server 与两套客户端 typecheck、
  `codegen:state -- --check`、`npm run verify:sync` 及 scoped diff check 通过。

来源：`plan.md:541-547`

### P1-05 FairyGUI/Creator 资源验证

- `[不阻塞·有意保留]` FairyGUI 编辑器导出、资源导入和运行时 `autoClearItems` 等行为仍需 Creator
  编辑器预览。
- `[不阻塞·有意保留]` Node 门禁只验证资源/生成物闭包与编排契约，不能替代真实引擎和目标设备验证。

来源：`plan.md:552`、`plan.md:566-567`

### P1-06 任务、存储和冷档边界

- `[已完成]` relayer 事务边界已拆为守卫短事务与事务外 I/O，且失败/接管路径有定向证据（见 §1）。
- `[不阻塞·待补齐]` archive 区隔离/容量方案仍待补齐（即 §1 第 2 条）。
- `[不阻塞·待补齐]` 热档 schema 迁移仍待补齐（即 §1 第 4 条）。
- `[不阻塞·有意保留]` freeze worker 默认硬关闭（`FREEZE_ENABLED`），默认配置下不会触发。
  （「启用需 unsafe escape hatch」一说出自 `docs/EXTRAFEATURES.md`，非 `plan.md` 原文。）
- `[不阻塞·有意保留]` dispatcher 的 timeout 仍不取消 handler，迟到副作用只能由数据层幂等收敛。

来源：`plan.md:573-574`、`plan.md:585-586`、`plan.md:596-597`

### P1-07 大厅重连

- `[不阻塞·有意保留]` Game transport 目前只做 desired input 对账，不等同于业务恢复。
- `[已完成]` 大厅连接最终死亡后先复用当前内存 token，以显式 ownership 重进所选区 Lobby，再拉
  `user.getInfo`；shared validator 校验后的角色快照仅在完整 session identity（generation/userId/token）
  仍匹配时原子提交，失败才进入既有 `returnToLogin`。同世代重复事件合流，页面取消或旧世代迟到只释放
  自己的 ownership，不能覆盖新快照或关闭新登录连接；初次登录也在进入 Home 前提交同一权威快照。
  验收证据：`sessionReconcile.test.ts` 与页面生命周期负例覆盖成功、失败、取消、重复事件、uid 不匹配及
  新旧世代竞态；Cocos Creator 3.8.8 真实导入生成新增脚本 `.meta`；`npm run test:client` 229/229、
  `npm run test:fgui` 50/50、两套客户端 typecheck 与 `npm run verify:sync` 通过。
- `[已完成]` Lobby 只对 SDK 可自动重试的异常关闭码开放 10 秒 `onDrop` 窗口，`onReconnect` 以
  session、token 与精确 online-registration 三重身份重新校验并把稳定逻辑连接原子换绑到新 transport；
  replacement login、宽限超时、停服和迟到回调只能注销自己持有的 registration。客户端在 `onDrop`
  后立即拒绝在途及新增 RPC，当前 generation 的 `onReconnect` 仅清除 `slot.dropping`，room、ownership
  与 push listener 原样保留；只有最终 `onLeave` 才触发既有 session/profile 对账。验收证据：
  `lobby-join-race.test.ts` 17/17 覆盖成功换绑、timeout、replacement、token fence、停服及非重连关闭码；
  客户端 transport 定向测试 30/30 与全量 `npm run test:client` 231/231 覆盖 fail-fast、恢复、迟到旧代和
  最终离线；服务端 typecheck、两套客户端 typecheck、`npm run verify:sync` 与 owned diff check 通过。

来源：`plan.md:615-618`

### P1-08 本地验证边界

- `[不阻塞·有意保留]` 失效的 loadtest、尚无运行时消费方的 Excel 示例链和真实 Creator 预览仍被归为
  额外或人工验证边界。
- `[不阻塞·有意保留]` legacy probe 使用本地引擎声明桩，不能替代真实 Creator 引擎、资源导入、运行时
  交互和目标设备验证。
- `[不阻塞·有意保留]` 客户端 strict 编译探针（`apps/client/tsconfig.test.json`，覆盖 Main、全部 View、
  `pages.ts`/ViewMgr 与客户端 tests）同样只在 Node 最小 cc/FairyGUI 桩下运行，其「通过」只证明
  TypeScript/API 形状，真实 Creator 类型与资源仍需编辑器验证。
- `[已完成]` Excel writer/checker 共用唯一 canonical serializer；默认双端 JSON 已入库，
  `config:excel-to-json:check` 只读逐字节比较服务端与客户端输出，分别报告任一缺失或陈旧结果，且
  `--no-client-output` 仍只约束服务端输出。验收证据：五个真实 xlsx 正反例覆盖 canonical 通过且不改写、
  双缺失、单缺失、双陈旧与 server-only；Cocos Creator 3.8.8 生成资源目录及 JSON `.meta`；
  `npm run config:excel-to-json:check` 5/5、`node scripts/verify-toolchain.mjs`、
  `npm run verify:inventory` 与 `npm run verify:project` 通过。
- `[不阻塞·有意保留]` `test:int` / `test:faults:int` 依赖本地 Redis/MySQL 与当前 Node/Colyseus 运行时；
  环境中触发的既有 schema decorator 兼容错误按约定记录为环境边界，不得误写成新回归。

来源：`plan.md:631-632`、`plan.md:668-669`、`plan.md:149`、`plan.md:148`、`plan.md:154-156`

### P1-09 登记和文档覆盖

- `[已完成]` `verify:inventory` 以根 `package.json.scripts` 为动态权威集合，只解析 AGENTS/CLAUDE 的
  `常用本地命令` shell block 与 README 的 `常用开发命令` 表格首列，三处都必须完整登记全部根命令，
  并拒绝 stale 命令。验收证据：三处均识别 34/34 个根脚本；`npm run test:inventory` 20/20 覆盖
  同步遗漏、新增未登记与 stale 登记反例；`npm run verify:inventory`、两脚本 `node --check` 及
  AGENTS/CLAUDE byte-identical 检查通过。
- `[不阻塞·有意保留]` inventory 与 Markdown 链接检查只覆盖登记表内文档和就近 README，不扫描任意
  根目录 Markdown；`plan-v2.md` 已通过 `routeOfTruth.corePlan`、`todo-godogen.md` 已通过
  `referenceDocs` 显式纳入检查，未登记的其它散装文档仍不在通用扫描范围内。
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
- `[已完成]` 根 `todo-godogen.md` 作为未实现的外部项目对照计划长期保留，并已在 README、
  AGENTS/CLAUDE 与 `docs/EXTRAFEATURES.md` 登记；`docs/inventory.json.referenceDocs` 将其全部 Markdown
  链接和锚点纳入检查，本地 `#L` 行号均已替换为稳定标题锚点。验收证据：`npm run test:inventory`
  25/25 覆盖入口、登记、EXTRAFEATURES、内部锚点及助手文档同步遗漏；`npm run verify:inventory`、
  两脚本 `node --check`、AGENTS/CLAUDE byte-identical 与 `git diff --check` 通过。

来源：`plan.md:92-96`、`plan.md:709-716`

## 7. 文档自身的问题

- `[已完成]` 历史归档顶部前向引用已明确覆盖第十至十二轮，不再漏掉第十二轮。验收证据：
  `npm run verify:inventory` 通过并人工核对归档轮次范围。
- `[已完成]` 第十轮记录只保留「复核时 HEAD `1c1a728`」这一历史角色，已删除会随分支推进失效的
  「当前树 HEAD」自指。验收证据：`npm run verify:inventory` 通过并人工核对该轮上下文。
- `[已完成]` 第十一轮记录已直接列出当时的 5 组需回填断言：P0-04 的 sId 包装变量自证与
  future/bad/boundary/真实 Redis reader 覆盖、P0-05 的固定 timer 顺序、P1-08 的 strict
  `noUnusedLocals` 守门及 P1-09 的命令表完整性，不再引用不存在且内容不相符的小节。验收证据：
  `npm run verify:inventory` 通过，并与第十二轮收口记录及当前 P1-09 开放项人工交叉核对。
- `[已完成]` 历史图例已把 `✅` 限定为「条目正文声明的验收范围已完成」，并明确它可与取舍、覆盖面和
  保留边界共存、不代表零遗留；`◐` 则专指验收范围内仍有可执行缺口或仅部分完成，两者定义互斥。
  验收证据：`npm run verify:inventory` 通过，并人工核对 P0-04、P0-05、P1-05、P1-06、P1-07、P1-08
  与 P1-09 的状态及保留边界。
- `[已完成]` `plan-v2.md` 已登记为 `docs/inventory.json` 的 `routeOfTruth.corePlan`，根 README、
  AGENTS/CLAUDE 与当前缺口入口均指向本文件；`verify-inventory.mjs` 会拒绝把历史 `plan.md` 重新登记为
  当前计划，同时通过 `referenceDocs` 继续检查历史归档链接。验收证据：`npm run verify:inventory` 与
  `npm run test:inventory`。

> 协议版本待评估项原列于本节，因其带有硬性发布前置条件、属技术待办而非文档问题，已移至 §1 第 7 条。
