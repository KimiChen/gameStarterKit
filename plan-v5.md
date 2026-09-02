# gameStarterKit 当前开发收口计划（plan-v5）

> **本文件是当前开放问题、实施状态与验收证据的唯一真相**（`docs/inventory.json` 的
> `routeOfTruth.corePlan` 指向本文件）。历史归档链：[plan-v4.md](plan-v4.md)（上一轮）、
> [plan-v3.md](plan-v3.md)、[plan-v2.md](plan-v2.md)、[plan.md](plan.md)——
> ⛔ 不要从任何归档的完成标记推导当前状态；查当轮证据读归档，判断「当前还欠什么」只读本文件。
>
> **口径**：每条给出「现状 / 为什么留着 / 出处」三项。指向源码的 `file:line` 为**写入清单时的
> 快照**（HEAD `2e6da3b`），位置随迭代漂移，复核时重新定位。

## 真相指针迁移的批准来源

- **批准来源**：用户会话指令，原话为「检查 plan*.md 系列文档，还有哪些没有解决的，抽离出来，
  放入到 plan-v5.md 文档中，并将 plan-v5.md 设为真源，其他 plan 系列文件为历史记录」。
- **迁移改动面**（本次实际修改）：`docs/inventory.json`（`routeOfTruth.corePlan` 与 12 处能力
  `docs`、`referenceDocs` 增员 plan-v4.md）；`scripts/verify-inventory.mjs`（corePlan 硬断言、
  README 入口断言、referenceDocs 增员断言、助手关键指令表两条）；`scripts/verify-inventory.test.mjs`
  的对应 fixture；`README.md`、`AGENTS.md`、`CLAUDE.md`；`plan-v4.md` 降级归档头；
  `plan.md`/`plan-v2.md`/`plan-v3.md` 下游归档指针；已登记文档中以现在时把 plan-v4 当真相的
  表述（OVERVIEW/EXTRAFEATURES/Non-intrusive 抬头/todo-godogen）。
- 归档机检 `checkArchiveNotClaimedAsTruth` 的清单取自 `referenceDocs`：plan-v4.md 移入后
  自动开始被守，无需改判据代码（该设计在 v3→v4 迁移时落地，本轮首次复用）。
  ⚠ **但它只挡住了它扫得到的那部分**：该闸原本只扫 inventory 登记的文档，于是未登记的
  `docs/snakeoff/` 仍有 5 处指向 plan-v4（README 3 处 + 05/06 各 1 处），**与 v3→v4 那轮
  漏的是同一批文件**——上一轮还专门把这条限制写进计划说「那几处是人工改的」，第二次照样没记住。
  已在 `a69a43f` 把扫描面改为全仓 Markdown（并加词边界，否则 `live-plan.md` 会被
  `plan.md` 的子串匹配误红），漏网文档在 `02b2863` 补齐。⛔ 不要再把扫描面缩回登记表。

## 当前验证基线（建档时实测）

`verify:all` exit 0（服务端单测 448/448、客户端 358/358、FGUI 66/66、typecheck 全阶段 0 错、
verify:sync 镜像一致、inventory 全绿）；`test:int` 169/169（本地真 Redis/MySQL 实跑，
含 drop-in 真栈四场景）。

> 更新（2026-09-02，Snake Off 首版落地后）：`verify:all` exit 0（服务端 480/480、
> 客户端 366/366、FGUI 66/66、inventory 110/110）；`test:int` 170/170（含 snake 真栈四场景）。

---

## A. 可排期的工程项（无头环境可做）

| # | 条目 | 现状 / 为什么留着 | 出处 |
|---|---|---|---|
| A1 | FGUI 不变量 E：sprite rect ⊆ 图集图片真实尺寸（PNG IHDR / JPEG SOF 直读） | 不变量 A–D 已实现（`216087f`）；E 未做：`rotated` 会让 rect 的 w/h 与图集坐标轴互换，第一版未处理产生 6 个假阳，值得单独一轮 | plan-v4「仍然开放的部分」条目 5 |
| A2 | `tools/excel-to-json.mjs` 的 `--check` 不是往返自检 | writer 与 checker 共用同一个内存 `data`，`buildItems()` 的静默丢行对两侧同时生效；低成本补法：在 `run()` 里对行数/键集做独立断言 | 同上 |

## B. 编辑器 / Creator 待办（⛔ 无头环境无法替代）

| # | 待办 | 现状 | 出处 |
|---|---|---|---|
| B1 | Home「玩法入口列表 GList」视觉 | 机制（generated menu contributions + LaunchPort + disabled/failed 叠加）已落地并有无头测试；视觉仍是单 `btn_enter` 渲染 contribution[0]，需 FGUI 编辑器出图 | plan-v4 仍然开放 / 遗留待办表 |
| B2 | failed 入口的「可手动重试」UX | 逻辑闸已接通（`47dc934`/`7c3065b`：启动通道经 FeatureHost，点击 = userIntent）；failed 入口当前渲染为不可点击占位（§7.4 既定），重试交互随 B1 一并出图 | plan-v4 仍然开放 |
| B3 | `PrivateRoomLobby` FGUI 包与模板 View | 服务端/客户端 transport 已就绪（`e387d08`/`05591e2`，headless 测试覆盖）；页面视觉需编辑器出图后按阶段 6 动线接入 | plan-v4 仍然开放 |
| B4 | Creator 预览人工证据：动态加载/取消回滚/输入租约/跨包资源 | 机制有无头测试；真实引擎与资源验证需 Creator 本地预览留证 | plan-v4 遗留待办表 |
| B5 | 合成 `.meta` 的 Creator 确认 | Non-intrusive 阶段 8a/9 由脚本合成的镜像 `.meta` 需打开一次 Creator 确认 uuid 稳定后随提交固化 | plan-v4 遗留待办表 |
| B6 | `.meta` uuid 集合 ↔ Cocos 场景序列化往返自检 | 需要真实 Creator 引擎，属 Creator 运行证据方向 | plan-v4 仍然开放条目 5 |

## C. 玩法实现（既定范围外，随玩法立项另立计划）

| # | 条目 | 现状 |
|---|---|---|
| C1 | snakeoff（竖版贪吃蛇）玩法实现 | ✅ **首版已实现**（2026-09-02，S0–S5：素材与台账 `e9ab40f`、shared 契约 `f0c2111`、SnakeWorld 模拟 `3d2affe`、房间集成 `08b48e4`、客户端战斗链路 `b062f2a`、默认入口切换）。拍板口径：drop-in 自由加入（8 人、首人即开局、Playing 可入）+ 90s 限时计分 + 死亡 2s 复活保分 + AI 填充。剩余尾巴：Creator 预览人工证据与真机联调（归 C3）、数值手感调优（随预览进行）、皮肤/相机随长度缩放等 v1.1 候选（见玩法包内注记） |
| C2 | undergroundIdle 玩法实现 | wsrpc 迁移入口路线次之（同一拍板）；美术生产流程与规格文档在 `docs/undergroundIdle/`（在途） |
| C3 | 两玩法的**真机联调** | 承接 plan-v4「遗留待办」表的 `真机 / 阶段 10` 行。原表已定性为「既定范围外，随玩法实现另立计划」，故归入 C 而非 B——⛔ 但必须被点名：B 类全是编辑器/Creator 项，不点名它就会随抽离一起消失 |

## D. 有意保留 / 永久边界（登记备查，⛔ 不是待办）

- 存量 `match_results` 行的精确回填**不可行**：恰好 8 键的 legacy 行与真 v2 行逐字节相同，
  无法区分，一律留在 `schema_version = 0`。（plan-v4 条目 1）
- `fb777ce` 熔断 flake 未形成复现-修复-复现闭环（连续全量绿未再撞见）；若再现需重新取证。
  （plan-v4 第二十一轮）
- `enterBattle()` 回退通道不过 feature 闸：默认玩法属 built-in 常驻（恒 active）无实际差异；
  未来默认玩法若变为托管 feature 需重新评估。（plan-v4 第二十三轮）
- 幂等 per-uid 计数器按窗口虚高（窗口内多次失败也计数）；operation inspect 暂无生产消费者
  （受控诊断面）；v8 信封硬断要求双端同批部署（协议层既定）。（同上）
- `GameRoom.ts` 已 2148 行：god-object 风险，拆分属另立计划。（同上，行数为建档时实测）
- feature install() 内 await 对自身 gameplay target 的 ports.launch 会与 in-flight install
  合流成循环 await 静默挂死；结构上无法区分合流者，已在 ports.ts 与 FeatureHost.launch
  双侧注释警告。（`a92b127`）
- drop-in ⛔ 不与 evidence capability 组合（evidence 冻结 initialRoster 与动态 roster 矛盾）；
  **动态 roster 的证据格式属未来独立设计**。（`91230dd`）
- FGUI 观察项两条：`src=` 悬空 resId 无闸（要先定义「合法但不被引用」的语义边界，有误红风险）；
  2 个负差额包（Dynamic_Login、View_SharedWidget_Confirm）的解释不完备（属解释缺口而非缺陷）。
  （plan-v4 第二十轮）
- 条目 2 的 XADD 失败在 GameRoom stub 侧无注入：int 侧已覆盖，单测侧桩不重复建设。（同上）
- plan-v3 的 78 条 `[不阻塞·有意保留]` 与其尾部各轮的保留边界（`--workspaces` 形态失败关闭、
  workspace 引用解析跳过、豁免表条目靠评审等）继续有效，**原始记录与证据在历史归档
  [plan-v3.md](plan-v3.md)**，本文件不复制。

## 已闭合（不再追踪，证据在归档）

- plan-v4 承接的 5 条产品/工程留白已全部实施完毕（条目 1–4 全实现、条目 5 的 A–D 实现，
  E 即 A1）；Non-intrusive 框架侧阶段 0–9 已实施（证据表在 plan-v4「Non-intrusive 阶段 0–9
  实施证据」）；drop-in 房型框架已实施（plan-v4 第二十四轮）。
- 历史计划链的开放项：plan.md / plan-v2.md 的开放项经 plan-v3 全部闭合
  （plan-v3 正文 34 条 `[已完成]`、0 条待补齐）；plan-v3 的开放项经 plan-v4 全部闭合。
