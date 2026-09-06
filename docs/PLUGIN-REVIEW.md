<!--
  来源：2026-09-05 对 docs/PLUGIN.md 的多 agent 审阅（8 个维度独立审阅 → 合并 36 条 → 每条 3 视角反驳，
  34 条成立、2 条否决；4 份替代设计由 3 位评审打分后合成）。正文中的 file:line 以审阅当日的工作树为准，
  后续实施会让部分行号漂移；「更好的实现方式」一节是后续实施的依据，实施状态登记在 plan-v5.md。
  ⛔ 本文是审阅记录，不是设计真源：设计真源仍是 docs/PLUGIN.md，本文的结论只在被 PLUGIN.md 采纳后才生效。
-->
# docs/PLUGIN.md 审阅报告

## 结论

PLUGIN.md 的判据本身（插件只能消费、不能定义；只做构建期插件；zip 用仓库相对路径）站得住，但它把「判据可机检」押在 `scripts/protected-paths.json` 这份 26 条 denylist 上，而该文件自述只是「动线接缝信号」（`scripts/protected-paths.json:9-11`），§2 自己点名的两个「只能定义」落点（`RoomProfile.ts`、`stateRenderer.ts`）都不在名单里。§5 安装流程按字面执行对任何带 RPC 域、View 或 FGUI 包的插件都会在 `verify:all` 被指纹锁与 FGUI manifest 点名，且 kind=gameplay 因 `modes/catalog.ts` 手写登记根本装不上。第三个问题是真相漂移：§6 已被 eacb687/67430a0 部分实施，抬头、CLAUDE.md、README 仍写「未实现」，plan-v5 对插件机制零登记。

## 问题清单

严重度取三位验证者多数意见。

### High

| 编号 | 章节 | 问题 | 证据 | 修法 |
|---|---|---|---|---|
| F03 | §1/§2 | 「下四行全部落在受保护路径上」不实：RoomProfile.ts 与 stateRenderer 不在名单 | `scripts/protected-paths.json:20-39,48-57` 仅含 messages.ts/GameMode.ts；`RoomProfile.ts:31-52` PROFILE_POLICIES；`gameplay-codegen/stateRenderer.ts:99-101,455-467`；`protected-paths-lock.mjs:74` 锁面同集 | 改为「不在任何 allowlist 内」，闸门改 allowlist（见第 3 节） |
| F12 | §5 | 流程漏 `protocol-fingerprint --write`、`fgui-manifest --write`，verify:all 必红 | `protected-paths.json:68` registry.generated.ts 在 protocol/ 内；`protocol-fingerprint.mjs:24-26,128-146`；`plugin-codegen/cli.ts:36-38` 只打印不重钉；`fgui-manifest.mjs:634,648`；`package.json:30,50` | 按 writer 表固定顺序；指纹重钉停下让人决策（是否 bump LOBBY_PROTOCOL_VERSION）；HTTP 端点契约表 `protocol/http.ts:704` 手写，§6.1「日志上报=一个 endpoint」应改判定义型 |
| F13 | §5/§8 | plugin 插件 FGUI 资源在包格式与流程中缺席；同名包目录解压即覆盖 | `plugin-codegen/viewCatalog.ts:208` sidecar 必填 package；`fgui-manifest.mjs:132-147,205-227,559-560`；`FguiView.ts:246-248` 固定 resources bundle；PLUGIN.md:88-90「覆盖同目录」 | 包内携带 ART 源 + .bin/atlas + .meta；解包前用 fgui-manifest 读取函数做内存冲突预检；安装后 `--write`；包名前缀按 Non-intrusive.md:210-212 既有约定机检化 |

### Medium

| 编号 | 章节 | 问题 | 证据 | 修法 |
|---|---|---|---|---|
| F01 | 抬头/§6/§9 | 抬头「未实现」与代码「§6 已部分实施」冲突；plan-v5 零登记 | `SettingsLogic.ts:1-15,81-88,137-146,199-203`；`loginFlow.ts:703-704,740-760`；PLUGIN.md 定稿 de393be 22:37 早于 eacb687/67430a0；plan-v5.md grep plugin/插件 为空，:109-110 B1/B2 过期；AGENTS.md:12 同口径 | 抬头改分节状态表；§9 六条缺口（§9.2 已是 B3）登记进 plan-v5；CLAUDE.md/README/AGENTS 同步。inventory referenceDocs 语义是归档清单（`verify-inventory.mjs:615-671`），不宜增员 |
| F02 | §1/§10 | 「防后门」与「只覆盖可信包」互相拆台 | PLUGIN.md:21-22 vs :181-182；`protected-paths-lock.mjs:18-20`「挡的是静默不是恶意」；lock 先于文档落地（eef4515 是 6ae128d 祖先），闸的净增价值是「解包前拒绝」而非覆盖面 | 显式写威胁模型「作者可信、包不可信」，删「后门」 |
| F04 | §1/§5 | denylist fail-open：scripts/**、tools/**、package.json、app.config.ts、镜像/锁文件均可被 zip 覆盖 | `protected-paths.json:9-11` 自述范围；`app.config.ts:6,14`；`lobbyRpc/coreErrors.ts`（原路径有误）；§5 未定义 zip 是否含镜像/生成物 | 由 (id, kind, 声明) 推导 allowlist，解包到 staging 校验后落盘 |
| F05 | §2/§5 | 无任何闸拦包内 package.json/lifecycle 脚本 | `verify-toolchain.mjs:17` 仅钉 3 项、:93-100 GATED_SCRIPT_NAMES 不含 postinstall/prepare（探针实证放行）；根 package.json 有 `verify-inventory.mjs:304-312` 兜底，workspace 无 | allowlist 拒绝一切 package*.json/.npmrc/tsconfig；文档写明「新依赖=框架 PR」 |
| F06 | §2/§3 | 新 RPC 域必改中央测试登记表 | `lobby-rpc-vectors.test.ts:29-45,73-74`；`lobby-rpc-contract.test.ts:24-36`；e387d08 实证各 +2 行；Non-intrusive.md:993 原意是 sidecar 发现。深路径 import 一说不成立（`websocket/room/resolve.ts:9` 用字面量） | 三处登记表改目录发现或 codegen 渲染；§2 落点补 core/<域>、lobbyRpcVectors/<域>.ts |
| F07 | §3.1 | 「跑一次即生效」漏 modeVersion bump 与客户端重发 | `gameplay-codegen/lib.ts:263-269,989-1004`；snake 已有记录 `catalog.generated.ts:79-83`；`GameRoom.ts:636,1026-1030`；写盘前先校验，无半写 | §3.1 补「契约变更：bump modeVersion、旧客户端拒入」；全新玩法首装不触发 |
| F08 | §3 | 「蛇加内战」代价陈述失实 | `modes/snake/index.ts:802,874,889`（AI 填充、shouldSettle 恒 false）、:811-814 无时限；`SnakeRoom.ts:35-36` 无 Ready/Start；`RoomClient.ts:1230` 运行时拒发；`PrivateRoomService.ts:104-126` 已有通用 joiner | 「消费型」判定保留，改写成本：结算/AI 策略/出站消息是 snake 自有代码工作 |
| F10 | §4/§5/§9.3 | kind=gameplay 不可装：catalog.ts 手写 | `modes/catalog.ts:1-15`；`game-mode.test.ts:118-129`；`gameplay-codegen.test.ts:1244-1252` 硬编码三玩法 | catalog 生成化为 §5 硬前置；测试改发现式；名单增员须与生成化同批（§12.2 双向 deepEqual） |
| F11 | §4/§5 | 「合成 .meta」无 writer；verify:all 只查 git 已跟踪文件 | `sync-client.mjs:198-201,221-232,283-292`；eacb687 用 scratchpad 脚本合成；`core.mjs:1965-1970` 定义双写者模型（与 245d363 不矛盾） | 作者侧 Creator 产出 .meta 随包；安装后 `git add` 使校验生效；§9 补此缺口 |
| F14 | §5/§7 | 无已安装登记面；plugin 无 digest 闸 | plugin.json 落点未定（`gameplay-codegen/lib.ts:199-201` 拒额外文件）；`LobbyRoom.ts:258` 只比整数；已有 route contractVersion（`defineDomain.ts:33`、`idem.ts:105-110`）无 digest 强制 | plugins lock；codegen 层 digest→contractVersion 闸；join 闸需独立协议 PR（Non-intrusive.md:230） |
| F15 | §6/§8 | 「slot/order 已消解 ✅」与 schema required 冲突 | `plugin-schema-v2.json:75`；`pluginManifestSchema.ts:31-32,190-191`；`viewCatalog.ts:762-770`；`PluginRegistry.ts:75-89`；`homeMenu.test.ts:86-98`；de393be 纯文档 | §8 改「已决定、未实施」；列七处改动面 |
| F16 | §6.2.1 | 移除排序后默认玩法静默翻为 ballMove | `builtinPlugin.ts:52-54`；`settings.test.ts:3-5`；仅 `AppRuntime.ts:399-401,467-473` 兜底路径消费 | 默认玩法改显式宿主声明；过渡加锁死测试 |
| F17 | §6.2 | 同 gameplayId 多贡献者裁决退化为字母序 | `AppRuntime.ts:64-79,412-428`；`viewCatalog.ts:605-630` 无跨 plugin 查重；`SettingsLogic.ts:148` 渲染与闸不一致 | codegen「一 gameplayId 一贡献者」fail-fast |
| F20 | §5 | 四个扁平目录目录≠所有权 | `net/rooms/`、`modes/`（IdleGameMode.ts）、`lobbyRpc/domains/`、`websocket/`；`plugin-codegen/lib.ts:118-120` 同名覆盖无感 | per-id 文件前缀规则 + core 保留名 |
| F21 | §5/§7 | 无 per-package 清单：残留、本地改动、卸载范围 | `gameplay-codegen/lib.ts:147-168,258-260`；`viewCatalog.ts:597`；plugin writer 不删任何文件 (`lib.ts:738-740`) | 文件清单 + 哈希 lock |
| F23 | §5 | 纯 plugin 写不出入口 | `plugin-schema-v2.json:83-91` launch 仅 gameplay；`loginFlow.ts:782-791` 只读 contribution；`SettingsLogic.ts:87` 兑换码是宿主占位 | launch 增 route 形态；改动面含 AppRuntime.launch/LaunchPort |
| F24 | §6 | entryId 仅 plugin 内唯一，设置面板按裸 entryId find | `viewCatalog.ts:625-627`；`SettingsLogic.ts:193,204,210`（且在 slot/order 序里找）；§8 表漏 entryId | 全仓唯一或复合键；「宿主只能硬编码」一半不成立（§6.2(3)） |
| F26 | §8 | keys.ts/schema.sql/catalog.ts 无扩展点 | `keys.ts:4-5,86,120-122`；`db-bootstrap.ts:610`；§6.1 兑换码样例必需持久化 | kPlugin 工厂；SQL 明写「需新表=框架 PR」 |
| F27 | §8/§9.7 | 两条「待核实」已可定论；dependencies 运行期不消费 | `fgui-manifest.mjs:205-221,559`；`viewCatalog.ts:383-398`；`AppRuntime.ts:143-147` 未传；`PluginHost.ts:51` 无读取；Non-intrusive.md:1840 要求依赖逆序 | §8 改定论；PluginHost 按依赖装载/卸载 |

### Low

F09（§4 信任模型对立为措辞歧义，§10 已答；`plugin-codegen/cli.ts:10` codegen 不执行代码，仅 verify:all 跑 test glob）；F18（zip-slip/symlink 属 §10 排除项，仓内已有先例 `init-project.mjs:128-150`、`plugin-codegen/lib.ts:88-97`，§5 应引用）；F22（「框架版本」= GAME_ROOM_PROTOCOL_VERSION，Non-intrusive.md:667-671，PLUGIN.md:88 同义反复；真实兼容轴是两个 schemaVersion）；F25（ballMove 进列表源自 Non-intrusive.md:1977，文案属实现选择）；F28（§9.4 内部自相矛盾，缺的是 LocalizePort 契约与 locales 载体）；F29（viewDirs 未收敛到 <id>，覆盖注册被 `viewCatalog.ts:462-475,613-619` 挡住）；F30（`RoomProfile.ts:44-46`、SERVER.md:281-283、rooms/README.md:53-56 主语含糊，dropInFixture 不进生产仍真）；F31（loader.ts:7,47-55 是静态注册表闸，非运行时插件先例）；F32（铁律 10 误引，真源 Non-intrusive.md:800/824；Asset Bundle 段需回指 §10）；F33（test glob 非递归，插件测试需 id 前缀平铺；三处钉子 `verify-toolchain.mjs:54`、`toolchainContract.test.ts:191`）；F34（卸载漏 sync 熔断，snake 本体 22 逻辑项 ≥20 即触发，`sync-client.mjs:153-162`、`sync-shared.mjs:109`）；F36（§6.2.2 链路终点已是 PromoHome，AreaList 为旁支 `loginFlow.ts:722-725`）。

## 更好的实现方式

三位评审两位选方案 0（allowlist + lock + 三方比对），总分最高的是方案 3（服务端与资源现实）。推荐以方案 0 为骨架、嫁接方案 3 的资源/安装动线与方案 2 的入口治理。

**核心主张**：允许写入集合由 (id, kind, plugin.json 声明) 纯函数推导，fail-closed；已安装状态是一把派生锁；install/upgrade/uninstall 都是「zip 清单 ⟷ lock ⟷ 工作树」比对；威胁模型明写「作者可信、包不可信」，不承诺沙箱。

**分条设计**
1. 所有权推导：`apps/server/tools/plugin/ownership.ts`，复用 gameplay-codegen/plugin-codegen 导出的目录常量；扁平目录用 `<ConstantName>Room.ts`、`<id>-*.test.ts` 前缀；硬性排除 scripts/**、tools/**、package*.json、镜像、生成物、锁、scene；plugin.json 的 viewDirs/logicDir 必须 ⊆ 集合；测试断言「codegen 发现集 ⊆ 推导集」且各插件展开集两两不交。
2. 包格式：zip 根 `plugin.json`（schemaVersion/id/kind 含 gameplay+plugin/version/domains/fguiPackages/requires 仅两个 schemaVersion）+ `files.lock`；id 与 plugin.json/manifest/目录名交叉校验。⛔ 版本不进 gameplay manifest（会进 contractDigest）。
3. 状态锁：`scripts/plugins/<id>.lock`，登记 generatedWriterOwned，`apps/server/test/plugin-lock.test.ts` 随 verify:all；升级三方比对（本地改动拒绝、同版本不同内容拒绝、降级显式 flag、旧有新无按清单删）。
4. 命令：`npm --workspace @game/server run plugin -- pack|install|uninstall|check`，⛔ 不新增根命令。install：工作树干净 → 校验 → staging 解包 → 原子落盘 → `git add` 暂存 → codegen:gameplays/plugins → sync:shared → 停下，打印 fingerprint/fgui-manifest `--write` 与 LOBBY_PROTOCOL_VERSION 决策；失败用 `git restore/clean` 精确回滚；verify:all 由人跑。uninstall 按 lock 删 + `--allow-delete` + `SYNC_FORCE=1`。
5. .meta：作者侧 pack 采集 Creator 产出的 .meta，缺即失败；安装侧不合成。
6. 服务端硬前置：`modes/catalog.generated.ts`（统一 `registerGameMode` 导出，IdleGameMode 迁 `modes/idle/`）；`lobbyRpcVectors/index.generated.ts` 供两份 vectors 测试消费，plugin-codegen.test.ts 改目录发现；`kPluginUser/kPluginShared` 工厂；SQL 不开口。
7. FGUI：解包前内存冲突预检；跨包引用只允许自有或 Common_*；前缀规则按 Non-intrusive §3.1 定后机检。
8. 入口治理（独立 PR）：显式 `defaultLaunch`、一 gameplayId 一贡献者、entryId 全仓唯一、PluginHost 按 dependencies 装载；slot/order 分四步退役。
9. plugin 契约闸首批只做 codegen 层 digest→contractVersion，join 信封改动另立协议 PR。

**与现有决定对照**

| 决定 | 处置 |
|---|---|
| 消费/定义判据、构建期插件、zip 仓库相对路径、卸载显式命令、§6.1 归属表、§10 非目标 | 保留 |
| 「protected-paths.json 是机检真源」 | 修改：改为 ownership 推导 + lock，该文件保持接缝信号 |
| §5 流程、§4「解压→一条命令→跑起来」 | 修改：一条命令落盘并跑 codegen/sync，指纹与 verify 留人 |
| 「合成 .meta」、「框架版本/协议整数范围」、Asset Bundle「唯一出路」、loader.ts「先例」 | 删除 |
| §6 slot/order「已移除」 | 修改为「已决定、分步实施」 |

**实施顺序**：① 文档真相对齐（F01/F15/F30/F36，零代码风险）；② 服务端硬前置（catalog 生成化、vectors 表、kPlugin）；③ ownership + pack/install/lock + writer 链；④ 入口治理 PR；⑤ 后续：plugin 契约 join 闸、LocalizePort 契约、launch route/profile。

## 附录：未采纳的发现

- F19：`joinGameRoom` 硬编码 default 是有意分层，玩法自有 joiner（`SnakeRoom.ts:208-227`，`ballMove/index.ts:57-59` 注释）是设计好的接缝，非断点；仅 §9.1「launchDefaults」措辞需改。
- F35：受保护路径改动由 `verify:protected-paths` 机检、不会静默；「不需要 Creator」已由 Non-intrusive.md:1077-1081 回答；真正问题是 `Main.ts:29-30` 注释自相矛盾，属代码注释修正项。