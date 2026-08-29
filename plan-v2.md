# plan.md 问题抽取清单

> 本文件只从 `plan.md` 抽取当前仍开放、待补齐或明确保留的内容。
> `plan.md` 中标注为「原审阅证据（已收口）」的历史复现不列为当前问题。

## 1. 总体剩余风险

以下限制由 `plan.md` 的总体结论直接列出：

- relayer 仍在持有 MySQL 锁的事务内等待外部 I/O。
- archive 表仍缺少完整的区隔离与容量方案。
- 坏 stream entry 的处置仍待补齐。
- 热档 schema 迁移仍待补齐。
- Game HTTP request schema 尚未直接由 shared validator 生成。
- match evidence 不足以重放完整输入序列。

这些限制不影响当前限定范围的核心验收，但不能据此把当前 Demo 描述成通用生产框架。

## 2. P0 保留问题

### P0-04 ready marker

- `characterRegistration` 与 `characterRegistrationCheckedAt` 当前不在
  `EFFECT_RESERVED_FIELDS`。现阶段因 allowlist 未收录而不可利用，但未来若误加入
  `EFFECT_FIELD_ALLOWLIST`，客户端可能修改 ready marker 或复核时间戳。
- `characterRegistrationCheckedAt` 是复核窗口的新鲜度闸门；若被客户端刷新，可能永久走 ready 快路径，绕过权威复核。
- ready marker 只在有限复核窗口内作为快路径。窗口过期后必须访问 WebPlatform；WebPlatform 不可用时，热档回访和冷档解冻后的 join 会被拒绝。
- `CHARACTER_REGISTRATION_RECHECK_MS` 是模块级常量，只在进程加载时读取；调整需要重启，当前没有运行时降级或宽限开关。
- 以上 fail-closed 行为是有意取舍，但仍是明确的可用性边界。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:355)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:365)

### P0-05 生命周期证据

- 完整外部 Redis/MySQL/WebPlatform smoke、真实 Creator 预览和目标设备采样不在 Node 证据内。
- SIGTERM 子进程用例替换了 `app.config`、rooms/routes、character、loader、Redis/MySQL 等内部模块，运行时房间数为 0。
- 该用例证明 admission 关闭、阶段顺序、资源释放和 exit 0，但不证明真实房间在 `onBeforeShutdown` 与 `onShutdown` 之间排空，也不证明真实依赖装配和真实 ready drain。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:445)

## 3. P1 保留问题

### P1-01 多玩法边界

- `idle` 只是无 presentation 的最小 multi-mode 证明，不代表完整第二玩法 UI 已交付。
- 共享的 `GameRoomState`、Waiting/Playing/Settle 相位、两人开局和部分 reset/settle 仍以 ballMove Demo 为基线。
- 不同房间状态和结算语义的玩法仍需扩展 shared Schema 与 mode 契约。
- 真实 Creator 资源导入和目标设备行为仍需编辑器预览。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:478)

### P1-02 View/Logic 真实引擎边界

- 当前完成的是 Node 可测试边界；真实 Creator 引擎行为仍未验证。
- 真实 Creator 输入、资源行为和编辑器生命周期仍由预览确认。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:487)

### P1-03 HTTP contract

- Game HTTP request schema 仍由 endpoint options 维护；shared validator 只在本地 schema 前后夹持并做接受集合对照。
- 因而新增或修改 endpoint 时，request schema 仍存在长期漂移风险。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:518)

### P1-04 schema-first 范围

- 当前只完成第一阶段的 shared exact validators、RPC/HTTP contract map、Colyseus state mirror 和协议 fingerprint。
- 更广泛的自动生成 state/schema 仍属于后续演进，尚未实现。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:539)

### P1-05 FairyGUI/Creator 资源验证

- FairyGUI 编辑器导出、资源导入和运行时 `autoClearItems` 等行为仍需 Creator 编辑器预览。
- Node 门禁只验证资源/生成物闭包与编排契约，不能替代真实引擎和目标设备验证。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:549)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:566)

### P1-06 任务、存储和冷档边界

- relayer 事务边界仍不符合“事务内不等待外部 I/O”的目标规则。
- archive 区隔离和容量方案仍不属于当前核心承诺。
- freeze worker 默认硬关闭，默认配置下不会触发；启用它仍需要 unsafe escape hatch。
- dispatcher 的 timeout 仍不取消 handler，迟到副作用只能由数据层幂等收敛。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:571)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:585)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:596)

### P1-07 大厅重连

- Game transport 目前只做 desired input 对账，不等同于业务恢复。
- 大厅连接最终死亡后会整段重新登录，以重建 session 和角色快照；当前没有独立的 session/角色快照对账层。
- Lobby 房没有注册 `onReconnect`，`slot.dropping` 当前也没有对应消费方。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:615)

### P1-08 本地验证边界

- 失效的 loadtest、未闭合的 Excel 生成链和真实 Creator 预览仍被归为额外或人工验证边界。
- legacy probe 使用本地引擎声明桩，不能替代真实 Creator 引擎、资源导入、运行时交互和目标设备验证。
- `config:excel-to-json:check` 只读取并校验源表，不比较缺失或陈旧的生成 JSON。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:628)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:668)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:148)

### P1-09 登记和文档覆盖

- `verify:inventory` 不检查 AGENTS/CLAUDE/README 命令表完整性，同类遗漏仍可能再次发生。
- inventory 与 Markdown 链接检查只覆盖登记表内文档和就近 README，不扫描仓库根的散装 Markdown。
- 根目录 `todo-godogen.md` 含 T1–T7 未完成任务，形式上构成第二份活跃待办，与“plan.md 是核心优先级唯一真相”存在张力。
- 若长期保留该文件，应继续登记到 README、AGENTS/CLAUDE 和 `docs/EXTRAFEATURES.md`，或迁入 `docs/` 后纳入链接检查。
- 组合根发现不构建完整 TypeScript import graph，scene 发现不扫描动态 prefab；Markdown 检查只守住登记链接和锚点，不是通用语法解析。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:693)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:709)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:718)

## 4. P2 验证和性能边界

### P2-01 性能基线

- 当前基线比较固定输入、渲染命令和 checksum，也记录分配估算。
- 计时分布、heap delta、Cocos/GPU 和目标设备性能阈值不构成门禁，真实阈值仍需本地预览和目标设备采样。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:723)

### P2-02 故障和变异测试

- 当前是定向故障/变异矩阵，不是自动源码 mutation，也不是全局覆盖率指标。
- 集成组需要本地 Redis/MySQL；WebPlatform 故障使用契约兼容的本地测试替身，不要求外部进程在线。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:739)

## 5. 额外未实现项

- `todo-godogen.md` 中的 T1–T7 仍未完成；`plan.md` 将其定性为外部项目的对照吸收计划，不纳入核心 `verify:core` 完成门槛。
- 原列首位的“产物往返自检”已移至 `docs/EXTRAFEATURES.md` §3.10，当前状态仍为未实现。
- 该往返自检用于发现导出过程静默丢内容；现有 manifest/hash 检查不能覆盖这一失败形态。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:92)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:709)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:715)

## 6. 文档自身的问题

- 顶部说明写“其后另有第十、十一轮”，但正文已经记录第十二轮。
- 第十轮记录中的“当前树 HEAD 为 `0ea018c`”不是当前分支 HEAD；当前分支为 `63e6fc0`。
- 第十一轮写“见 P0-04「未覆盖判据」”，当前 P0-04 实际使用的是“覆盖面”标题，引用无法直接定位；同轮登记的 5 处恒真/无覆盖附带断言也没有逐项定位。
- `✅` 表示限定范围已完成，但 P0-04、P0-05、P1-06、P1-07 等条目仍保留明确的安全、可用性、证据或扩展边界，状态标记容易被误读为“没有遗留问题”。
- `PROTOCOL_VERSION=5` 目前只因仓内没有已部署旧客户端而保持不变；首次承担线上兼容义务前，需要重新评估版本升级和兼容矩阵。

来源：[plan.md](/Users/kimi/work/gameStarterKit/plan.md:8)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:59)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:75)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:105)、[plan.md](/Users/kimi/work/gameStarterKit/plan.md:123)
