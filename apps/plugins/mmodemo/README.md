# mmodemo —— MMO 内容插件样本 1（apps/plugins/mmodemo）

`mmodemo` 是 [docs/MMO.md](../../../docs/MMO.md) §9.2 的**内容插件样本 1**：建在冻结的 [`mmo` kit](../../kits/mmo/README.md)（tag `mmo-kit-v1-frozen`）上，
只交三样东西——内容包 `demoVale`、表现映射、编排模块——经 kit 的三个贡献点装载（`plugin.json` 的 `contributes.mmo`），
`requires.kits.mmo = { content: 3, orchestration: 2 }`；MG1-B2 起另带一个**可选自有域页面**「头狼战报」（域 `mmodemo`，query `mmodemo.bossBoard`，
route `bossBoard` + 设置面板菜单入口）。⛔ 不自带 mode / wire / state / SQL（§9.1 判据）；世界运行时是 kit 的 `mmoWorld`。
实施状态只在 MMO.md §12 回写（施工单 MMO-PLAN.md §4 MG0–MG1）。

## 文件

| 文件 | 内容 |
| --- | --- |
| `apps/plugins/mmodemo/plugin.json` | 登记：`requires.kits.mmo`、`contributes.mmo.{content,presentation,orchestration}`、客户端 entry（空 module） |
| `apps/plugins/mmodemo/content/pack.json` | 内容包 `demoVale` v1（一份 JSON = 贡献点 `content` 的 data；§9.2 写的分文件形态在 v1 贡献点里是单文件） |
| `apps/server/src/core/mmodemo/mmoOrchestration.ts` | `defineOrchestration({ packId: "demoVale", … })`：只分派事件 |
| `apps/server/src/core/mmodemo/encounters/{bossTimer,ambush,merchant}.ts` | 三段遭遇的纯函数 |
| `apps/client/src/plugins/mmodemo/{index.ts,mmoPresentation.ts}` | plugin module（install 只组装 MmoDemoRuntime：bossBoard 只读 + 关闭 route）；表现映射（占位胶囊颜色 / 尺寸） |
| `apps/shared/src/protocol/lobbyRpc/domains/mmodemo.ts` | 域 `mmodemo`（MG1-B2）：`mmodemo.bossBoard` query 契约 + validator；常量 `MMO_DEMO_PACK_ID` / `MMO_DEMO_MAP_ID` / `MMO_DEMO_BOSS_BOARD_MAX_LINES`（与内容包 / 编排 / kit 面用例交叉核对） |
| `apps/server/src/core/mmodemo/bossBoard.ts`、`apps/server/src/websocket/mmodemo/bossBoard.ts` | 用例（只经 kit `orchestration` 面 v2 `listCheckpointedVars`；坏 var ⇒ 0）+ 端点 |
| `apps/client/src/plugins/mmodemo/logic/{mmoDemoRuntime,MmoDemoBoardLogic}.ts`、`view/MmoDemoBoardView.{ts,view.json}` | 战报页：runtime holder / 逻辑（击杀降序、运行时长、错误码翻译）/ 纯节点 View（popup 层） |
| `apps/server/test/mmodemo-{content,orchestration,bossboard}.test.ts`、`test/lobbyRpcVectors/mmodemo.ts`、`apps/client/test/mmodemo-{logic,board-logic}.test.ts` | 内容包 / 对齐 / harness 重放 / 战报用例与 validator 正反向 / 向量 / 表现覆盖 / 页面逻辑 |

## 内容包 `demoVale`

| 项 | 内容 |
| --- | --- |
| 图 | `demoVale` 2400×2400，视距 400；碰撞位图（格 100）：山脊 x ∈ [1000, 1200) × y ∈ [1000, 2000)、巨石 x ∈ [400, 600) × y ∈ [1500, 1700)；nav 格 100；出生点 `start` (600, 600)；无传送门 |
| 区域 | `den` 狼穴（圆心 (1900, 1900) 半径 220，tag boss）/ `ambush` 伏击林（矩形 (1200, 400)–(1700, 900)，tag ambush） |
| 职业 | `fighter`（120 / 40，strike + warcry）/ `caster`（90 / 110，fireball + heal）——id 与 kit `MMO_CLASS_IDS` 相同（角色进图按 classId 取本包模板），表现 id `vale-fighter` / `vale-caster` |
| 怪 | `wolf` 灰狼（aggro 150 / 拴绳 500，撕咬）×4 @ (1400, 1500)；`valeBoar` 林猪（被动）×3 @ (800, 1800)；`alphaWolf` 头狼（tier boss，`checkpointOnDeath`，撕咬 + 狼嚎，600 血）——只由编排刷，不在 kit 刷新点 |
| 技能 | strike / warcry（buff，替代 §9.2 的 `dash`：v1 技能族没有位移类）/ fireball / heal / bite / howl（debuff） |
| 物品 10 | wolf-fang / wolf-pelt / boar-tusk / alpha-fang（boss 奖励）/ iron-sword（战士武器 +4）/ oak-staff（法师武器 +3）/ leather-vest / hunter-cloak / amber-charm / vale-tonic（消耗品） |
| 掉落表 | wolf-drops（狼牙 6 : 狼皮 3 : 药水 1）/ boar-drops（猪牙 1–2）/ alpha-drops（头狼之牙 5 : 铁剑 1） |
| NPC | `merchant` 行商 @ (700, 500)，`interacts: ["trade"]` |

物品 id 全区唯一（kit 双端 `mergeItemTemplates` 同 id 必须同义）；表现 id 与 kit 内置灰盒映射不重叠（用例钉）。

## 编排（`orchestration` 面 v1；预算数字见 kit README §5）

| 遭遇 | 事件 → 命令 |
| --- | --- |
| ① 定时 boss | `instanceStarted` → `startTimer("bossSpawn", 600 000 ms, repeat)`；`timer(tag boss)` → 狼穴里没有活 boss 才 `spawn alphaWolf@den`（±60 抖动，经 `api.rng`）+ `notice(warn)` + `sayWorld`；`creatureDied(tag boss, killer)` → `setVar("bossKills", durable)` + 对 `party.membersInInstance(killer)` 逐个 `grantItem alpha-fang ×1`（封顶 50 人：1 + 50 ≤ 64 条命令预算） |
| ② 区域伏击 | `regionEntered(ambush, character)` 且 `tick − ambushAt ≥ 1200`（60 s）→ 围着来者 `spawn wolf ×3`（tag ambush，120 s 收回；落点不可走的跳过）+ `setVar("ambushAt")` + `notice` |
| ③ 行商 | `interact(trade @ merchant)` → `prompt`（领药水 / 下次再来）；`choice(gift)` → `grantItem vale-tonic ×1`（v1 无扣币 / 交易命令，所以是赠送；⛔ 逐角色记次数——vars ≤ 4 KB） |

`limits: { maxSpawnsAlive: 8, maxGrantCount: 5 }`；订阅 `instanceStarted / timer / creatureDied / regionEntered / interact / choice`。
模块只 import kit shared `api/orchestration` 门面与本目录，无 Date / Math.random / 计时器（`mmo-orchestration-boundary.test.ts` 机检）。

## 可选域页面「头狼战报」（MG1-B2；§9.2「自有域（可选）」）

`mmodemo.bossBoard`（query，无参数）：服务端经 kit `orchestration` 面 v2 `listCheckpointedVars(sId, "demoVale", "demoVale")` 读 demoVale 各分线
**最新已落库检查点**里编排 durable var `bossKills`（bossTimer 在 creatureDied(tag boss) 时 `setVar` 累计）→ `{ mapId, packId, lines[{ instanceId, rev, tick, bossKills }], totalKills }`
（≤ 64 条分线 = kit `CHECKPOINTED_VARS_MAX_ROWS`；无检查点 rev / tick 0；非法 var ⇒ 0）。插件 ⛔ 碰 kit 表、⛔ 读框架 `world_instance`，也不新增错误码。
客户端：设置面板「头狼战报」卡（`card-bossBoard`）→ route `bossBoard` → `MmoDemoBoardView`（popup）：击杀降序列分线（标签「分线 n · …末 6 位」、检查点 rev、
运行时长 = tick × TICK_MS）、合计、刷新 / 关闭；错误只按 code 翻译，失败保留旧数据。`host.json` 未动（未登记的入口默认落设置面板玩法卡）。

## 验证

`npm --workspace @game/server run plugin -- test mmodemo`（内容包 validator / 对齐 / 与灰盒同装载；harness：boss 周期与不叠刷、奖励只发同队在场者、
70 人封顶不撑爆预算、伏击冷却、行商 prompt → 赠送、同种子重放逐条相等、换成 65 条命令的 handler ⇒ suspend；MG1-B2 战报用例 / validator 正反向 / 向量）
+ `npm run test:client`（表现覆盖与不重叠；战报页逻辑）+ 框架 `lobby-rpc-vectors`（域 ⇔ 向量文件、validator 正反向）。

MG0-B3 动线验收（docs/MMO.md §9.4，2026-09-22，相对 tag `mmo-kit-v1-frozen` = kit 0.1.26 的修复提交）：

| # | 判据 | 结果 |
| --- | --- | --- |
| 1 | 全量 diff 分四类 | 插件提交 24 条：手写 17（插件目录 / core/mmodemo / client/plugins/mmodemo / 三份用例）+ 生成物 6（两端 contributions.generated、plugins.generated、docs/plugins.generated.md 及 Cocos 镜像）+ 锁 1；宿主 placement 0 |
| 2 | `plugin -- changed --base mmo-kit-v1-frozen --dry-run` | 24 条全部落在包 mmodemo 的所有权推导集内（另 7 条生成物 / 镜像由 codegen --check 与 verify:sync 把关）⇒ foreign = []、packages = [mmodemo] |
| 3 | 框架 / kit 冻结基线零变 | 指定路径 `':!*.generated.*'` diff 为空；`scripts/packages/mmo.lock` 字节不变；`git grep mmodemo` 在 kit 路径只命中 `*.generated.*` 与 kit README 的样本名说明文字（B4 说明书与 MG0 反馈段，非代码耦合） |
| 4 | 生成物来源 | 全部生成路径 ∈ generatedWriterOwned；四个 writer 重跑零变；`codegen:plugins --check` / `codegen:gameplays --check` fresh |
| 5 | 锁与指纹 | `scripts/packages/mmodemo.lock` 新增；`LOBBY_PROTOCOL_VERSION` 不动（指纹 e03aae620dcd02d3 不变）；GAME_ROOM / WORLD_ROOM 协议版本不变 |
| 6 | 宿主 placement | `apps/plugins/host.json` 未动（无路由 / 菜单） |
| 7 | 干净安装（worktree at tag） | `plugin -- pack` 17 文件 zip → `install`（written 17）→ codegen:plugins / gameplays → sync → `db:bootstrap` 两遍 `kit_migration` 11 → 11 行（插件零 DDL）→ `check` 7 包一致 → `plugin -- test mmodemo` 15 例 → 服务端 typecheck 零错（客户端 typecheck 在裸检出缺未跟踪的 `ui-uniflex/generated`，与插件无关，kit-clean-install 同样要补拷）→ harness 事件序列 = mmodemo-orchestration → `uninstall`（17 文件收回）→ `check` ✔ |
| 9 | 沙箱 | `mmo-orchestration-boundary` 收录本模块绿；65 条命令注入 ⇒ suspend(commands) 整批丢弃；同种子重放逐条相等 |

## 偏差（对照 §9.2）

- `dash` 改为 `warcry`（buff）：v1 `MmoSpellKind` 只有 damage / heal / buff / debuff。
- 内容包是一份 `pack.json`（贡献点 data = 单文件），不是 §9.2 列的分文件。
- 行商是赠送不是交易；奖励封顶 50 人；可选域页面 `mmodemo.bossBoard` 已于 MG1-B2 交付（战报只读最新检查点，⛔ 运行中实时值）。
