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

> 更新（2026-09-03，Snake 新版无尽专项 S0）：复刻证据基线已在 `7a04131` 落地，锁定原作 commit
> `6367f65` 与当前实现 baseline `ecd7514`；34 个来源文件身份（含 1 个符号链接）、28 字段 V2 快照、
> 71 项路径表、5 层配置和 14 张 `sourceDerivedStaticReconstruction` golden 已生成。组合 hash 为
> `2319d173326602d85fc4c6a85f5b4ca16452cd778f0794896398294a1d5f87e2`；unit 10/10、全新临时目录
> 55/55 文件逐字节复建和 SHA 54/54 均通过。该更新没有修改玩法运行时；S1、S2、S2R、S3、S4、S5
> 当时仍未实施，玩法运行时代码事实仍是下表所述首版。

> 更新（2026-09-03，Snake 新版无尽专项 S1 原基线）：原定素材与目录范围已完成。精确锁定来源 commit `6367f65`，
> 68 个读取源文件、16 套 atlas/body 仓内输入、27 个实际表现资源、78 行资源/转换/预览续表、16 张单皮肤预览与
> 两张 contact sheet 已闭合；公共/服务端业务/客户端表现 hash 分别为 `a1cdecbc…b075`、
> `9ed3762e…fa19`、`62e1a668…2efe`。常规生成/检查在 Node 文件权限只允许本仓时仍通过；converter 8/8、
> 客户端 377/377、服务端 489/489、typecheck、sync、inventory 均全绿。Creator 3.8.8 导入/UUID/pivot/混合
> 终验仍归 S5。随后用户拍板把来源 V2 的场内磁铁纳入首发，因此 S1 新增 S1-12 增量并重新标记为
> `[已拍板·待实施]`；上述 commit、计数、hash 与测试均只是磁铁增补前历史基线，S1-12 尚无实现或验证记录。
> S2 无尽运行时、S2R、S3、S4、S5 尚未实施，当前玩法运行时仍是下表的 90 秒首版。

> 更新（2026-09-03，Snake S1→S2 新增冻结口径）：磁铁 `10001` 在房间首次进入 Playing 后 15/60/150 秒各无条件生成 10 个，
> 即使没有资格真人或真人全长 50000 也不例外；之后每 150 秒循环。后续波次只接受
> `active/deadPresentation/reliveOffering/pendingRelive/reliveSpawning/reliveCommitting/reliveReady` 且长度低于
> 50000 的真人 run，其他状态与 AI 不计门槛。真人/AI 均可自动拾取，磁铁存在 20 秒、效果 8 秒且不占操作槽。
> Star 与磁铁速度冻结为 `320/3 unit/s`（20 Hz 每 tick `16/3`），按确定性定点余数推进，变向周期为
> `34..67 tick`。操作习惯默认右手，左手切换仅设备本地持久化且先写后用，写入失败回退右手；首发不显示游玩时长，
> 使用细白自机轮廓与 AI 名字。S1 总预计调整为 4–7 人日（原估 3–5 对应范围已完成 + 增补 1–2），S2 为
> 11–16 人日，专项合计 37–57 人日。`onlineEndlessDropInV2` 保持 ID、层内显式 `version` 从 1 升为 2；其
> layer hash 与五层组合 hash 待实现生成，S0 旧 hash 只作历史证据。这些均为已批准但尚未实现的
> 目标，不改变当前运行时代码事实。

> 更新（2026-09-03，Snake 新版无尽专项 S1-12）：磁铁表现增量已在 `bc5bb97` 完成。显式 refresh 精确锁定
> 来源 commit `6367f65` 的 77 个实际读取文件；仓内新增 `10001` 世界帧、同帧被动 icon alias、五纹理
> UUID-free Cocos 3 aura recipe 与 `eat_tool` 拾取音效，共 8 个 runtime 资源。表现 envelope 升为
> `presentationVersion=2`，客户端 hash 为 `8615596a…d629`；公共 `a1cdecbc…b075`、服务端业务
> `9ed3762e…fa19` 与 16 个皮肤 `contentVersion=1` 保持不变。converter 13/13、client catalog 11/11、
> 全量客户端 380/380、服务端 489/489、typecheck/sync/inventory/SHA 均通过，S1 标记为 `[已完成]`，S2
> 前置门已解除。Creator 3.8.8 的 aura 层级/混合/真机观感仍归 S5，不冒充无头完成证据。

> 更新（2026-09-03，Snake 新版无尽专项 S2）：`snake@2` 战场与无尽生命周期已完成。当前运行时已经替换为
> 4096²、1000 Dot + 30 Star、稳定态 17 蛇、无房级 deadline、真人个人死亡/复活/run 终局、AI 独立 40 tick
> 重生、Star/磁铁 `320/3 unit/s` 确定性运动、磁铁三次必发与后续 gate、分块基线/有序 delta，以及中央操作区、
> 设备本地左右手和多指 owner。`onlineEndlessDropInV2@2` layer hash 为
> `3a61016ceb2e9fc1ffe8a342ed5b174fabec1cff4581346a8224f97a2b19a53f`，五层组合 hash 为
> `2c74f005c0375f98a07250c4c14ede9d0075a238d9f355ff6f07c9935d97e8e7`；四个 S0 层保持不变。
> `test:int` 本地真栈 171/171 通过；`verify:all` exit 0（client 384/384、server 495/495、FGUI 66/66、
> inventory 110/110），gameplay codegen、protocol fingerprint、sync、S1 freshness 均通过。S2 只启用非资产
> 确定性测试经济；生产无法绑定该端口，`onlineCoinRelive5V1` 面向玩家的发布开关
> 保持关闭。当时 S2R～S5 尚未实施；下面的后续更新取代这一状态。

> 更新（2026-09-03，Snake S2R demo）：当前运行时升为 `snake@3`，开发环境接入按认证 `uid` 共享的
> `RedisDemoReliveEconomy`。复活先同步扣减进程内 demo 余额，再将唯一字段 `coinBalance` best-effort 写入
> Redis 逻辑 key `gp:snake:user:{uid}`；key、field 和 value 都不增加 `sId`。同一进程内同一业务死亡只扣一次，
> Redis 写失败只告警且不回滚玩法结果。该简化实现不新增 MySQL 表、不修改通用 `GameMode`/`GameRoom`、
> 不接任务调度或跨进程恢复；`eligibleForEnable=false` 且 `onlineCoinRelive5V1` 继续关闭。S3、S4、S5 仍未实施。
> S3～S5 的阶段文档也已按相同 demo 原则收敛：衣柜和养成数据只保存在当前进程，终局奖励同步应用，
> S5 只验收内部 demo 与 Creator 桌面预览。S3/S4 可在同一个 `gp:snake:user:{uid}` HASH 中增加
> `equippedSkinId/ownedSkinIds/fragmentBalances/snakeXp/achievementProgress`，全部不含 `sId`；
> 仍不增加其他 Snake key，也不把生产级持久化、补偿或后台处理列为阶段门禁。
> 本地 `verify:all` exit 0（client 384/384、server 499/499、FGUI 66/66、inventory 110/110），真栈
> `test:int` 172/172；bootstrap 仍为既有 11 张表，受限文件与 SQL schema 均无差异。

> 更新（2026-09-04，`f2639ae`）：state 生成器支持玩法自有枚举、snake 枚举搬回 ruleset，契约 digest 变化按闸递增
> `modeVersion` 3→4；当前运行时口径为 `snake@4`，玩法规则与 S2R 的 `snake@3` 相同。

> 更新（2026-09-05，本机验证基线的两条环境红项，登记根因）：
> - `test:launcher-matrix`（`verify:core` 第 11 步）在本机 1/78 假红：探针以「输出含 marker」判定入口执行，
>   而 bash 5.3.15 对 `--pretty-print` 只回显源码（含 marker 字面量）并 exit 0。已在 `661e542` 修探针
>   （marker 运行期拼接，门禁规则零改动）。在此之前 `verify:all` 链在这台机器上从未跑过第 11 步之后。
> - `apps/server/test/snake-s1-assets.test.ts`「repo-only S1 generator check is fresh」：34 张预览 PNG 像素与
>   钉住的完全相同，字节不同源于 PNG 编码用 `zlib.deflateSync`，本机 Node v26.5.0 与仓库钉子 `.node-version`=22
>   的 deflate 输出不同。已拍板修法：预览 PNG 改用仓内确定性编码器（不依赖 zlib 版本）后 `--write` 重钉。
> 2026-09-05 的插件机制与兑换码实证提交（`4c586e0`…`dfa98cf`）按「除这两条外全绿」口径验收：verify:core 其余
> 步骤、四个矩阵、perf、客户端 419/419、服务端 539/540。

> 更新（2026-09-05，两条环境红项闭合）：探针修复 `661e542`、确定性 PNG 编码 + S1 证据重钉 `f731658` 之后，
> `npm run verify:all` 在本机**首次完整 exit 0**：verify:core 17 步全绿（含 launcher-matrix 3/3、四个矩阵、perf），
> 客户端 419/419，服务端 540/540。PNG 编码器改动对 S0 的影响：14 张 golden 由同一 `encodePng` 产出，S0
> `--write/--check` 需要外部锁定归档，本轮未重生；下一次持归档刷新 S0 时 golden 字节会变（像素不变），
> 届时需重钉 docs/s/evidence/s0 的 SHA256SUMS 与 goldens manifest。

---

## A. 可排期的工程项（无头环境可做）

| # | 条目 | 现状 / 为什么留着 | 出处 |
|---|---|---|---|
| A1 | FGUI 不变量 E：sprite rect ⊆ 图集图片真实尺寸（PNG IHDR / JPEG SOF 直读） | 不变量 A–D 已实现（`216087f`）；E 未做：`rotated` 会让 rect 的 w/h 与图集坐标轴互换，第一版未处理产生 6 个假阳，值得单独一轮 | plan-v4「仍然开放的部分」条目 5 |
| A2 | `tools/excel-to-json.mjs` 的 `--check` 不是往返自检 | writer 与 checker 共用同一个内存 `data`，`buildItems()` 的静默丢行对两侧同时生效；低成本补法：在 `run()` 里对行数/键集做独立断言 | 同上 |

## B. 编辑器 / Creator 待办（⛔ 无头环境无法替代）

> **一次 Creator 3.8.8 会话的清单（2026-09-05 无头侧预写，等待用户执行；证据格式按 Non-intrusive §10：
> 截图/录屏、Creator 版本、日期、操作者、对应 commit）**
>
> 1. 打开 `apps/Cocos` 工程，让 Creator 重写 `.meta`：① 脚本合成的两个占位 `apps/Cocos/assets/src/features.meta`、
>    `apps/Cocos/assets/src/shared/protocol/lobbyRpc/domains/redeem.ts.meta` 应被 Creator 按自己的键序重写、uuid 不变
>    （B5 口径）；② 随插件包入仓的 13 个 `apps/Cocos/assets/src/features/redeem/**.meta` 若被 Creator 重排键序，
>    `scripts/plugins/redeem.lock` 会红（它们在 files.lock 内）——**只记录 `git diff --stat`，⛔ 不要为了让锁绿而改回
>    键序**；这条结果直接决定 E6 的方案取舍（`.meta` 是否应出所有权、或锁按语义比对 `.meta`）；③ 16 张重编码的
>    `apps/Cocos/assets/resources/snakeoff/previews/*.png` 重新导入无报错、`.meta` uuid 不变。
> 2. 桌面预览：登录 → 首屏 → 设置面板「插件入口」出现「兑换码」→ 打开 RedeemView：EditBox 可输入、输入即大写、
>    格式不合规时「兑换」置灰；本地栈（`stack`/`db:bootstrap`/`dev`）跑起来后输入 `WELCOME2026` 兑换成功显示
>    `+100 金币`，再兑一次显示「已使用」；「关闭」回到设置面板。这是 RedeemView（纯节点 + EditBox）与 FeatureHost
>    装载 module 在真实引擎里的首次运行证据（无头侧已由 `featureModuleLoad.test.ts` 钉住装载链）。
> 3. 顺手清 B4：动态加载/取消回滚/输入租约/跨包资源各留一段录屏；B6 的 uuid 集合往返自检按其行的判定方式做。
> 4. 会话结束把上述结果（尤其 1-② 的 diff）贴回来，由无头侧登记证据并处理 E6。
>
> **执行结果（2026-09-05 下午，用户打开 Creator 3.8.8 后由 Claude 经 Chrome 9222 + CDP 驱动预览；证据与环境
> 见 [docs/evidence/creator-2026-09-05/README.md](docs/evidence/creator-2026-09-05/README.md)）**：
> 1-①/②/③ Creator **未重写任何 `.meta`**（合成占位形态与 3.8.8 落盘一致；随包 13 个 `.meta` 未被重排，锁全程 ✔）；
> 2 全链路走通：dev 登录 → 首屏 → 设置面板插件入口 → RedeemView 输入/兑换成功/重兑被拒/关闭，服务端 Redis 记账一致；
> 3 只覆盖了「动态加载」，取消回滚/输入租约/跨包资源与 B6 未做。实测暴露三处真实引擎缺陷并已修：CocosView 页面
> 按父层锚点居中（`e9e6900`）、行标签左锚（此前被面板左缘切半）、代码创建的 EditBox 需显式 textLabel/placeholderLabel。
> 预览 `index.html` 写死 `settings.js?scene=current_scene`：编辑器没打开场景时预览是空场景，需在编辑器里打开
> `scene.scene` 或（如本次）改写该查询参数。


| # | 待办 | 现状 | 出处 |
|---|---|---|---|
| B1 | Home「玩法入口列表 GList」视觉 | 机制（generated menu contributions + LaunchPort + disabled/failed 叠加）已落地并有无头测试；视觉仍是单 `btn_enter` 渲染 contribution[0]，需 FGUI 编辑器出图 | plan-v4 仍然开放 / 遗留待办表 |
| B2 | failed 入口的「可手动重试」UX | 逻辑闸已接通（`47dc934`/`7c3065b`：启动通道经 FeatureHost，点击 = userIntent）；failed 入口当前渲染为不可点击占位（§7.4 既定），重试交互随 B1 一并出图 | plan-v4 仍然开放 |
| B3 | `PrivateRoomLobby` FGUI 包与模板 View | 服务端/客户端 transport 已就绪（`e387d08`/`05591e2`，headless 测试覆盖）；页面视觉需编辑器出图后按阶段 6 动线接入 | plan-v4 仍然开放 |
| B4 | Creator 预览人工证据：动态加载/取消回滚/输入租约/跨包资源 | 机制有无头测试；真实引擎与资源验证需 Creator 本地预览留证 | plan-v4 遗留待办表 |
| B5 | 合成 `.meta` 的 Creator 确认 | Non-intrusive 阶段 8a/9 由脚本合成的镜像 `.meta` 需打开一次 Creator 确认 uuid 稳定后随提交固化。2026-09-05 Creator 3.8.8 打开工程并多次刷新资源库：未重写任何合成 `.meta`（含镜像与 features.meta 占位），形态与其落盘格式一致——见 [证据](docs/evidence/creator-2026-09-05/README.md)；B5 可视为闭合，保留待下次 Creator 版本升级复核 | plan-v4 遗留待办表 |
| B6 | `.meta` uuid 集合 ↔ Cocos 场景序列化往返自检 | 需要真实 Creator 引擎，属 Creator 运行证据方向 | plan-v4 仍然开放条目 5 |

## C. 玩法实现（既定范围外，随玩法立项另立计划）

| # | 条目 | 现状 |
|---|---|---|
| C1 | snakeoff（竖版贪吃蛇）玩法实现 | ✅ **首版已实现**（2026-09-02，S0–S5：素材与台账 `e9ab40f`、shared 契约 `f0c2111`、SnakeWorld 模拟 `3d2affe`、房间集成 `08b48e4`、客户端战斗链路 `b062f2a`、默认入口切换）。下一轮竖版新版无尽 V2 专项已完成 **S0 复刻证据基线**（`7a04131`）、**完整 S1 素材/三层目录**（原基线 `d18846a` + 磁铁增量 `bc5bb97`，[证据](docs/s/evidence/s1/README.md)）、**S2 战场/无尽生命周期**与 **S2R demo 金币复活**。当前代码口径为 `snake@4`（`f2639ae` state 枚举归属重构递增 modeVersion，规则同 S2R 的 `snake@3`）：8 真人 drop-in、稳定态 17 蛇、4096²、1030 食物、无房级 deadline、个人 run、Star/磁铁精确运动、按 uid 的 demo 金币余额和设备本地左右手。S2R 当前仅 best-effort 镜像 Redis 余额；S3/S4 将以同一 HASH 镜像 demo 衣柜/养成 profile，S5 Creator demo 验收仍未实施，`onlineCoinRelive5V1` 发布开关保持关闭；详细状态见 [docs/s/README.md](docs/s/README.md)。剩余尾巴：Creator 预览人工证据与真机联调（归 C3/S5）、数值手感调优（随预览进行） |
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

## E. 插件机制（docs/PLUGIN.md；2026-09-05 按 docs/PLUGIN-REVIEW.md 实施推荐方案 ①～④）

已实施（证据 = 各自测试，随 `verify:all`）：服务端 `modes/catalog.generated.ts`、RPC 向量登记表
`lobbyRpcVectors/index.generated.ts`、`kFeatureUser`/`kFeatureShared`、插件命令
`npm --workspace @game/server run plugin -- pack|install|uninstall|check`（所有权推导 allowlist +
`scripts/plugins/<id>.lock`）、宿主 placement `features/host.json`（slot/order 退役、`launch.kind:"route"`、
FeatureHost 按 `dependencies` 装载）、feature 侧域契约闸（`LOBBY_RPC_DOMAIN_CONTRACTS`）、首个真实插件
`plugins/redeem`（兑换码，E5）。⛔ 本表只登记仍开放的项（E5 保留一行只为登记 Creator 侧尾巴）。

| # | 条目 | 现状 / 为什么留着 | 出处 |
|---|---|---|---|
| E1 | `launch.profile`：一个玩法多房型入口 | 入口 gameplay launch 不带房型；客户端各玩法 joiner 写死 profile（`apps/client/src/net/rooms/SnakeRoom.ts`）。补丁：生成器加可选字段 → AppRuntime 传下去 → joiner 按 target 选 profile。PLUGIN-REVIEW F19 判定当前分层是有意接缝，非断点 | PLUGIN.md §9.1 |
| E2 | i18n / LocalizePort 契约 | `labelKey` 有字段无实现，渲染用硬编码 `label`；缺 LocalizePort 契约与 locales 载体。必须先于第一个第三方插件落地，否则每个插件硬编码一种语言 | PLUGIN.md §9.3 / PLUGIN-REVIEW F28 |
| E3 | 框架默认加载页 | 全新 route，与 FGUI 包预热策略绑定（本仓 FGUI 包只有加载路径无卸载路径） | PLUGIN.md §6.2 (2) |
| E4 | join 信封侧的 feature 契约比对 | codegen 层域契约闸已落地（`LOBBY_RPC_DOMAIN_CONTRACTS`）；Lobby join 仍只比对 `LOBBY_PROTOCOL_VERSION`，域契约变化是否 bump 该整数是人工决策（Non-intrusive §4.8 ⛔ 不各自新增版本闸） | PLUGIN.md §9.5 / PLUGIN-REVIEW F14 |
| E6 | 同仓「作者=宿主」的插件迭代动线 | ✅ **已实施方案 ②**（用户拍板，2026-09-05）：`install --reinstall-from-tree <id>` 以工作树为真相重写已安装锁——采集/自检走 pack 同一条路，锁被篡改/越权/目录级冲突照拒，同版本不同内容拒绝并点名改动面（必须 bump `plugins/<id>/plugin.json`），降级须显式，⛔ 不写插件文件只重写锁，然后 git add + postinstall（`apps/server/tools/plugin/install.ts` `reinstallFromTree`，契约测试 `plugin-tool.test.ts`）。现场重放：`docs/redeem/README.md` 措辞修正 + bump 1.0.1 → 锁重写 → `check` ✔。背景：此前只改一行即 `plugin-lock.test.ts` 红（`b5b73f5` 后实测）、普通 install 对「树≠锁」直接拒绝。仍开放的同类尾巴：随包 `.meta` 在锁内，Creator 重排键序即锁红（B 节清单 1-② 待实测后决定 `.meta` 是否按语义比对）；卸载后须先提交才能重装 | `apps/server/tools/plugin/{install,cli}.ts`；PLUGIN.md §5.4 |
| E5 | 第一个真实插件的端到端实证 | ✅ **已完成，两种形态都有真实样本**（2026-09-05）。**gameplay 形态**：「点数赛」`plugins/tally`（[docs/tally/README.md](docs/tally/README.md)，kinds gameplay+feature）作者侧 `pack`（28 文件）→ 作者文件全部移出、生成物回退到 HEAD → 干净树 `install`：postinstall 重生 gameplay 10 件 + feature 3 件产物，人工中央源码零改动 → `verify:all` exit 0（客户端 426/426、服务端 545/545），`fb903db`；Creator 预览打通一整局（入口 → 开局 → 计数回流 → 判胜结算 → 回首屏，[证据第二轮](docs/evidence/creator-2026-09-05/README.md)），并暴露第 4 处只有真机才看得见的框架缺陷——玩法退出后无人恢复首屏（所有玩法共用的 `requestExit` 路径，snake 结算退出同样黑屏），已在 AppRuntime.controllerBridge.requestStop 补 `restoreAuthenticatedBase`。实证逼出并先行修掉的框架前置：wire 向量登记表由手写 import 表改为 `codegen:gameplays` 生成（`800d534`）、codegen 测试 fixture 按目录发现玩法集（`d2ae00f`）——两处都是「新玩法必须改中央源码/中央测试」。**feature 形态**：「兑换码」插件 `plugins/redeem`（[docs/redeem/README.md](docs/redeem/README.md)）作者侧 `pack`（29 文件）→ 干净树 `plugin -- install`（postinstall 重生全部生成物）→ `protocol-fingerprint --write` → `verify:all` 通过（两条既有环境基线除外）；框架前置补齐见 `5c6df35`（feature.json `module` 装载器、feature 目录形态放行、测试闸去中央清单）。补证（2026-09-05 下午）：① 一次性 worktree 上 `pack` 已安装树 ⇔ `redeem.lock` 29 条逐条相同；`uninstall` 删 29 文件 + postinstall 收缩生成物（sync 清理 3 个镜像文件含共享祖先 `features.meta`）→ 提交 → `fingerprint --write` → 从同一包 `install` → 与卸载前 HEAD 的 diff 只剩两个仓库持有的 `.meta`（`features.meta`、镜像 `domains/redeem.ts.meta`，按设计由 Creator 生成、不随包）；`check` ✔。⚠ 卸载后不能在同一未提交树上直接重装（install 要求受影响路径干净），动线是「卸载 → 提交 → 安装」。② 客户端装载链 `generated load → createFeatureModule → FeatureHost.install → AppRuntime.launch({kind:"route"}) → navigation.open` 由框架级测试 `apps/client/test/featureModuleLoad.test.ts` 钉住（只读 generated 表，不点名插件）。Creator 侧尾巴已闭合（2026-09-05 下午，[证据](docs/evidence/creator-2026-09-05/README.md)）：Creator 3.8.8 打开工程后未重写随包 13 个 `.meta` 与两个脚本合成的占位 `.meta`（形态与其落盘一致、uuid 稳定、锁全程 ✔）；RedeemView 在真实引擎里跑通成功/已使用/不存在三条路径。实测修掉三处真机缺陷（CocosView 父锚居中、行标签左锚、EditBox 显式 Label），RedeemView 两次经 `--reinstall-from-tree` 迭代到 1.0.3 | PLUGIN.md §9.6 |

`PrivateRoomLobby` 模板仍是 B3（编辑器待办），不重复登记。

## 已闭合（不再追踪，证据在归档）

- plan-v4 承接的 5 条产品/工程留白已全部实施完毕（条目 1–4 全实现、条目 5 的 A–D 实现，
  E 即 A1）；Non-intrusive 框架侧阶段 0–9 已实施（证据表在 plan-v4「Non-intrusive 阶段 0–9
  实施证据」）；drop-in 房型框架已实施（plan-v4 第二十四轮）。
- 历史计划链的开放项：plan.md / plan-v2.md 的开放项经 plan-v3 全部闭合
  （plan-v3 正文 34 条 `[已完成]`、0 条待补齐）；plan-v3 的开放项经 plan-v4 全部闭合。
