# 插件机制设计基线

> 状态：**设计基线 + 分节实施状态**（2026-09-04 讨论定稿；2026-09-05 按 [docs/PLUGIN-REVIEW.md](PLUGIN-REVIEW.md)
> 修订并实施推荐方案 ①～④）。本文回答「什么能做成插件、装载时机在哪、包长什么样、入口放哪」，
> ⛔ 不改变任何既有约束。
>
> | 节 | 状态 |
> | --- | --- |
> | §1 判据 / §2 分层 / §3 例证 | 设计基线；措辞按审阅修正（机检真源改为所有权推导 allowlist） |
> | §4 装载时机 | 设计基线；措辞按审阅修正 |
> | §5 包格式与安装流程 | ✅ 已实现（`apps/server/tools/plugin/`，`plugin -- pack/install/uninstall/check`；隔离 fixture 验证，真实包端到端实证仍开放，见 §9 第 6 条 / plan-v5 E5） |
> | §6 入口与位置 | ✅ 已实施（设置面板、宿主 `apps/plugins/host.json`、slot/order 退役、route 形态 launch、依赖装载） |
> | §7 生命周期 | ✅ 已实现（已安装锁 `scripts/packages/<id>.lock`） |
> | §8 冲突面 | 按实际机检状态改写 |
> | §9 缺口 | 已分「已补 / 仍开放」，开放项登记在 [plan-v5.md](plan-v5.md) E 类 |
>
> 与 [docs/Non-intrusive.md](Non-intrusive.md) 的关系：那份是「框架如何做到新增玩法/plugin 不侵入」的
> 改造方案（框架侧阶段 0-9 已实施）；本文接着回答下一个问题——**外部包能否直接装进本项目跑起来**。
> 判据的机检真源是 §5.2 的所有权推导（`apps/server/tools/plugin/ownership.ts`），`scripts/protected-paths.json`
> 只是它之外的第二道闸。
>
> 审阅记录：[docs/PLUGIN-REVIEW.md](PLUGIN-REVIEW.md)（2026-09-05）。

## 1. 核心判据

> **插件只能「消费」，不能「定义」。要定义就是框架 PR。**

这条判据不是新发明的规矩，而是把前面十几轮改造**已经形成的结构**说出来：框架把「消费一层能力」做成了声明式
（manifest / plugin.json 里一行），把「定义一层能力」留在了中央文件里。两者的分界线恰好就是插件边界。

除「能不能」之外还有第三类：**⛔ 责任不可转移**——技术上完全能做成插件，但责任在发行方，不该外包给
插件（服务条款、隐私政策、推送授权、日志上报，见 §6.1）。

**判据可机检，但机检形态是 allowlist 而不是 denylist**：插件能写入的路径集合由它的身份纯函数推导（§5.2），
不在推导集内的路径整包拒绝。`scripts/protected-paths.json` 自述只约束「普通 plugin/gameplay 的新增动线」，
它拦不住 zip 用相对路径写 `scripts/`、`package.json`、`RoomProfile.ts` 这类根本不在名单里的文件
（PLUGIN-REVIEW F03/F04），所以它只作为 allowlist 之外的第二道闸。威胁模型见 §5.1：作者可信、包不可信，
闸门防的是非预期写入与静默漂移，⛔ 不是沙箱。

## 2. 分层：哪些层可消费、哪些层只能定义

| 层 | 插件能否自持 | 落点 |
| --- | --- | --- |
| gameplay module（实时玩法：manifest/state/wire + 三端模块） | ✅ 可消费 | `apps/shared/schema/gameplays/<id>/`、`apps/shared/src/gameplays/<id>/`、`apps/server/src/rooms/modes/<id>/`（导出 `register<Constant>GameMode`，`codegen:gameplays` 生成 `modes/catalog.generated.ts` 收录）、`apps/client/src/gameplay/modes/<id>/`、`logic/rooms/<id>/`、`view/rooms/<id>/`、`net/rooms/<Constant>Room.ts`、`apps/server/test/wire-vectors/<id>.ts`（wire 向量 sidecar，`codegen:gameplays` 汇入 `index.generated.ts`）、`apps/Cocos/assets/resources/<id>/` |
| plugin（大厅页面 + RPC domain + View + 路由 + 菜单） | ✅ 可消费 | `apps/plugins/<id>/plugin.json`、`apps/client/src/plugins/<id>/`、`apps/server/src/core/<id>/`（自有键经 `kPluginUser`/`kPluginShared`）；每个 domain：`apps/shared/src/protocol/lobbyRpc/domains/<d>.ts`、`apps/server/src/websocket/<d>/`、`apps/server/test/lobbyRpcVectors/<d>.ts`（`codegen:plugins` 生成向量登记表收录）；FGUI 包：`apps/art/fairygui/assets/<Pkg>/` + `resources/ui/<Pkg>.bin`/图集 |
| 入口（菜单 contribution） | ✅ 可消费 | plugin.json 的 `menu`：只有身份（entryId/label/labelKey/icon/launch），launch 可为 `gameplay` 或 `route`；位置见 §6 |
| profile 声明（选用已有的房型策略组合） | ✅ 可消费 | manifest 的 `profiles` 一行 |
| state fragment 声明（选用已有的公共状态片段） | ✅ 可消费 | state.json 的 `fragments` 一行 |
| room policy 定义（新的 Start/Access 策略） | ⛔ 只能定义 | `apps/server/src/rooms/core/RoomProfile.ts` |
| state fragment 定义（新的公共状态片段） | ⛔ 只能定义 | gameplay-codegen 的 stateRenderer |
| core wire 定义（房内公共消息） | ⛔ 只能定义 | `apps/shared/src/protocol/messages.ts` |
| shell 生命周期钩子定义 | ⛔ 只能定义 | `apps/server/src/rooms/GameMode.ts` 的钩子表 |
| 入口位置（首屏摆什么、默认进哪个玩法） | ⛔ 归宿主 | `apps/plugins/host.json`（§6） |
| npm 依赖 / 根命令 / 协议信封 / SQL 表 | ⛔ 框架 PR | Non-intrusive §12.3；§5.2 的硬排除让它们根本进不了包 |

上五行是声明式、零侵入；「只能定义」四行**不在任何插件的可写前缀内**（不是「都在受保护路径上」——
`RoomProfile.ts` 与 stateRenderer 本就不在 protected-paths 名单里，靠的是 allowlist 推导集不含它们）。

## 3. 判据的例证（讨论中逐个验过）

| 需求 | 判定 | 依据 |
| --- | --- | --- |
| 大厅聊天面板 | **消费型 → 插件可做** | plugin 层完备：plugin.json + domain + websocket 端点 + 向量 sidecar + 客户端 View，零中央文件改动（§2 plugin 行） |
| 房内聊天增强（频道/私聊/表情） | 定义型 → 框架 PR | 房内聊天今天是 core wire（`CORE_C2S.Chat`），要扩展就得改 `protocol/messages.ts` |
| 蛇增加「邀请好友内战」 | **消费型 → 插件可做** | 服务端侧只需声明，但代价如实见 §3.1 |
| 做一个「给任意玩法加内战」的通用插件 | 定义型 → 框架 PR | 要同时贡献 room policy + state fragment + core wire |
| 无尽模式要的 `roomLifecycle` 能力 | 定义型 → 框架 PR | 属实：当初改了 `GameRoom.ts`/`GameMode.ts` 共 80 行 |
| 兑换码 / 纯页面型功能 | **消费型 → 插件标准形态** | 一条 idempotent-write RPC domain + 一个 View + 一条 `launch.kind:"route"` 的入口（§6） |

### 3.1 「蛇加内战」的实际代价（消费型样本）

邀请好友内战的**框架部分**已交付（阶段 8）：邀请码租约与 access ticket 在 `core/rooms/invite/`、
`room.prepareCreate`/`room.resolve` 在框架 core domain `lobbyRpc/domains/room.ts`、Ready/Start 是 core wire、
`ownerReady`/`inviteRoom` 是 codegen 注入的公共 fragment、`private` profile（invite-code + owner-ready）
在 `RoomProfile.ts` 注册表里已经现成。

玩法侧的声明：

```jsonc
// apps/plugins/snake/gameplay/manifest.json
"profiles": ["dropIn", "private"]
// apps/plugins/snake/gameplay/state.json
"fragments": ["ownerReady", "inviteRoom"]
```

**服务端零中央文件改动**属实（漏声明 fragment 时 `RoomProfile.ts` 的启动期断言会直接点名缺哪个；
`privateFixture` 是这条路径的现成实证），但「跑一次 codegen 即生效」不成立，代价如实登记
（PLUGIN-REVIEW F07/F08）：

- state 加 fragment 会改 per-mode `contractDigest`，`codegen:gameplays` 要求同批 bump `modeVersion`，
  旧客户端会被 join 版本闸拒绝——这是契约变更，不是零成本；
- snake 自己的代码要改：服务端 AI 填充与 `shouldSettle` 恒 false 的无尽结算策略要为私房分支、
  客户端 `SnakeRoom.ts` 的 joiner 写死 `profile: "dropIn"` 且没有 Ready/Start 出站消息（`RoomClient` 运行时
  拒发未声明的 C2S）——这些是玩法自有代码的工作，不是框架的；
- 客户端还需要玩法自己的输码/房间页 View（`PrivateRoomLobby` 模板属编辑器待办，plan-v5 B3），
  以及 §9 仍开放的 `launch.profile`。

## 4. 装载时机：只做构建期插件

| 层 | 能做到什么 | 约束 |
| --- | --- | --- |
| **构建期插件**（本文取此） | 解包 → `plugin -- install` → codegen/sync → 人工重钉指纹/FGUI 锁 → `verify:all` | 全部静态门禁、类型检查、指纹保留；⚠ 它不是沙箱——构建期只是多了一个 review 窗口，插件源码仍与框架同进程运行 |
| 服务端运行时插件 | 启动期扫描目录并动态 import | 在持有 Redis/MySQL 凭证的进程里执行外部代码，需独立的信任模型。⚠ `websocket/loader.ts` 不是先例：它是「端点全集必须等于 shared 声明集」的静态注册表闸，只是用运行时发现来实现，⛔ 不接受未声明的端点 |
| 客户端运行时插件 | **当前技术栈做不到** | Cocos Creator 在构建期定死模块图；Non-intrusive §5.3 明令 ⛔ 运行时 `fs`/目录扫描/`import.meta.glob`（铁律 10 说的是 FGUI 只走动态 import，与此是两件事） |

客户端的引擎出路是 Asset Bundle 远程加载，但 bundle 里的脚本仍由**本工程构建管线**产出——能做到「主壳
发版一次、玩法 bundle 远程更新」，做不到「第三方任意 zip 解压即用」；这类远程代码下载本就在 §10 非目标内。
平台合规（小游戏/应用商店）是另一个需按发布目标单独核实的变量。

**`.meta` 的取舍**（修正旧表述「安装后始终要开一次 Creator」）：包自带的文件由作者侧 Creator 产出 `.meta` 并**随包分发**，
安装侧 ⛔ 不合成；`sync-client --check` 的 `.meta` 断言只遍历 git 已跟踪文件——`plugin -- install` 只 `git add`
包内文件与已跟踪镜像的改动，`sync:shared` 为 shared 变化**新建**的镜像文件保持未跟踪，因此无头 CI 上安装后
`verify:all` 可通过；提交前仍要开一次 Creator 为这些新镜像（以及首个带客户端源码插件的共享祖先目录
`apps/Cocos/assets/src/plugins.meta`）生成 `.meta` 再 `git add`。Creator 对随包 `.meta` 只会重写键序/版本，uuid 不变。

## 5. 包格式与安装流程

> 状态：✅ 已实现（2026-09-05）——`apps/server/tools/plugin/`，命令 `npm --workspace @game/server run plugin`，
> 契约测试 `apps/server/test/plugin-tool.test.ts`，已安装锁的新鲜度随 `apps/server/test/plugin-lock.test.ts`
> 进 `verify:all`。本节按实现改写，旧表述（denylist 闸、覆盖同目录、合成 .meta）已被
> [PLUGIN-REVIEW](PLUGIN-REVIEW.md) F03/F04/F11/F12/F14/F21 推翻。首个真实包实证：`apps/plugins/redeem`（§9.6）。

### 5.1 威胁模型（先说清闸门防什么）

**作者可信、包不可信**：插件由自己与合作方编写（§10 不承诺不可信第三方），闸门防的是**非预期写入与
静默漂移**——一个 zip 因疏忽（或恶意）夹带了不属于它的文件、覆盖了别人的目录、升级时残留旧文件、
本地改动被静默冲掉。⛔ 不承诺沙箱：插件源码与框架同进程运行，运行期信任与「构建期插件」无关
（构建期只是多了一个 review 窗口，不是隔离边界）。

### 5.2 所有权由身份推导（allowlist，fail-closed）

插件能写入仓库的路径集合由 `plugin.json` 的身份 (id, domains, fguiPackages) + 派生形态（有客户端登记 ⇒ client、有 `gameplay/` ⇒ gameplay，constantName 从 gameplay manifest 派生）与
`apps/plugins/<id>/plugin.json` 声明的客户端目录**纯函数推导**（`tools/plugin/ownership.ts`）——这就是
「目录即所有权」的机检形态：

| kind | 推导出的可写落点 |
| --- | --- |
| 共有 | `apps/plugins/<id>/`（plugin.json / README.md / gameplay 单源，§5.5）、`apps/server/test/<id>-*.test.ts`、`apps/server/test/int/<id>-*.test.ts`、`apps/client/test/<id>-*.test.ts`（前缀后**必须**紧跟 `-` 或 `.`，⛔ 不是裸 startsWith：`tally` 不拥有 `tallyBoard-*`、`red` 不拥有 `redis-*`；2026-09-05 收紧，PLUGIN-REGISTRY §1-4） |
| gameplay | `apps/shared/src/gameplays/<id>/`、`apps/server/src/rooms/modes/<id>/`、`apps/client/src/gameplay/modes/<id>/`、`apps/client/src/logic/rooms/<id>/`、`apps/client/src/view/rooms/<id>/`、`apps/client/src/net/rooms/<Constant>Room.ts`、`apps/server/test/wire-vectors/<id>.ts`、`apps/Cocos/assets/resources/<id>/` |
| plugin | `apps/client/src/plugins/<id>/`、`apps/server/src/core/<id>/`；每个声明的 domain：`apps/shared/src/protocol/lobbyRpc/domains/<d>.ts`、`apps/server/src/websocket/<d>/`、`apps/server/test/lobbyRpcVectors/<d>.ts`；plugin.json 的 viewDirs/logicDir 必须 ⊆ `apps/client/src/plugins/<id>/**` 或 `apps/client/src/{view,logic}/**/<id>` |
| fguiPackages | `apps/art/fairygui/assets/<Pkg>/`、`apps/Cocos/assets/resources/ui/<Pkg>.bin`、`<Pkg>_atlas*` |
| 镜像 / `.meta` | 由真源推导：`apps/client/src/X` 可写 ⇒ `apps/Cocos/assets/src/X` 与 `X.meta` 可写；插件专属目录的目录 `.meta` 可写，共享祖先目录（如 `view/rooms.meta`）⛔ 不随包 |

推导之前先过**硬排除**：`scripts/`、`tools/`、`apps/server/tools/`、`.github/`、`vendor/`、`node_modules`、
`package*.json`、`.npmrc`、`tsconfig*`、`.env*`、`*.generated.*`、`*.lock|*.fingerprint|*.sha256`、
`scene.scene`、`apps/client/src/{shared,lib,generated,app}`、`apps/shared/src/{generated,protocol}`（域 descriptor
按 allowlist 精确放行）、`apps/server/src/{rooms/schema,rooms/core,core/infra}`；再过 `scripts/protected-paths.json`
的两组保护路径与全部 writer 产物。⛔ 任一路径被拒即**整包拒绝**并逐条点名；「新增 npm 依赖 / 改根命令 /
改协议信封」在这套闸下根本进不了包——它们是框架 PR（Non-intrusive §12.3）。

`apps/server/test/plugin-tool.test.ts` 钉住：真仓 protected-paths.json 的每条路径对任何插件身份都不可写。

**多插件共存的所有权账本**（2026-09-05，PLUGIN-REGISTRY §1-4）：别的已安装插件锁登记的路径永远不是本插件的——
`pack` 遇到推导集与他锁重叠即拒绝采集（⛔ 不静默把别人的文件打进自己的包），`install` 对包内文件与他锁的交集单独点名
（「属于插件 X」），`check` 断言各锁清单两两不交。`registry` 是保留 id。

### 5.3 包格式

zip（或已解开的目录，两者等价）根部两件元数据 + 仓库相对路径的文件：

```text
plugin.json      一个文件两面（schema v2，单源 apps/server/tools/plugin/plugin-schema-v2.json）：
                 身份 { schemaVersion:2, id, version?(semver；宿主自有插件省略), domains?, fguiPackages?, description? }
                 + 客户端登记 { entry?, viewDirs?, views?, owners?, routes?, menu?, dependencies?, resident?, category?, docs?, capabilities? }
files.lock       清单：每行 <仓库相对路径> <sha256>（与 protected-paths.lock 同形态）
<仓库相对路径>…  文件本体（含客户端镜像与 Creator 产出的 .meta）
```

- ⛔ 没有 `kinds`：有客户端登记（entry / views / routes / menu 任一）⇒ client 形态，包内有 `gameplay/manifest.json` ⇒ gameplay
  形态，两者可并存（一个玩法插件天然 = gameplay 单源 + 入口登记），两者皆无即拒绝；⛔ 没有 `constantName`：从 gameplay
  manifest 派生；派生结果写进锁抬头（`"kinds":["client","gameplay"]`），`check` 按它与树比对身份漂移。
- ⛔ 没有 `requires.*SchemaVersion`（2026-09-05 合并 plugin.json 时去掉）：兼容轴就是 `plugin.json` 自己的 `schemaVersion`
  （const，读时 fail-closed）与 gameplay manifest 的 `schemaVersion`（读时与 gameplay-schema 的 const 比对）。协议整数不是插件的
  兼容轴：gameplay 的契约身份是 per-mode `contractDigest`/`modeVersion`（既有闸），Lobby 域的契约身份是 codegen 层的域
  descriptor digest → 域级 `contractVersion` 闸（`LOBBY_RPC_DOMAIN_CONTRACTS`；覆盖面 = 域 descriptor 文件自身字节，与
  gameplay 只算 wire.ts 同口径——跨文件复用的 validator/类型变化由 protocol-fingerprint 点名但不强制 bump）；
- ⛔ 不放路径映射（仓库布局不能成为第二真源），⛔ 不放 slot/order（位置归宿主，§6）；
- 同一份 `plugin.json` 以 `apps/plugins/<id>/plugin.json` 落在仓库（作者侧手写、`pack` 的输入、`install` 原样落回、`codegen:plugins` 的登记面），
  包的自证由 `files.lock` 承担：清单外条目、哈希不符一律拒绝。

### 5.4 命令与动线

```text
npm --workspace @game/server run plugin -- pack <id> (--out <zip> | --out-dir <dir>)
npm --workspace @game/server run plugin -- install <zip|dir> [--allow-downgrade] [--replace-local-fork] [--break-dependents] [--no-git] [--no-postinstall] [--dry-run]
npm --workspace @game/server run plugin -- install --reinstall-from-tree <id> [--allow-identity-change] [--adopt-tracked] [--allow-downgrade] [--break-dependents] [--no-git] [--no-postinstall] [--dry-run]
npm --workspace @game/server run plugin -- uninstall <id> [--force] [--drop-data] [--no-git] [--no-postinstall] [--dry-run]
npm --workspace @game/server run plugin -- check
npm --workspace @game/server run plugin -- test <id> [--int]
```

同一套命令同时服务两种包类别：插件（`apps/plugins/<id>/plugin.json`）与 kit（`apps/kits/<id>/kit.json`，docs/KIT.md）；
包根清单文件名（`plugin.json` / `kit.json`）就是类别，同一 id 只能是其一（树上并存、或装着 kit 来一个同 id 插件包，
都拒绝）。kit 相对插件多出来的闸：`kit.json.modes` ≡ `gameplays/<modeId>/` 单源（id / constantName 逐个比对）、`sql.files`
随包非空且 `sql/` 下没有清单外文件、插件 `requires.kits` 的正向闸（所需 kit 已安装或宿主自有，每个 api 面
`minSupported ≤ 声明 ≤ version`）、kit 升级的反向闸（已安装插件的声明落到新区间外即拒绝，`--break-dependents` 放行并让
`check` 对那些插件红）、`uninstall` 的依赖反查（还有插件锁声明依赖即拒绝，⛔ 无 flag 可绕）、`--drop-data`（仅 kit：
卸载默认保留表与账本行）。`test <id>` 按已安装锁枚举包自带的 `apps/server/test/*.test.ts` 与 `apps/client/test/*.test.ts`
单跑（`--int` 再加 `test/int/`），是审核清单里「测试通过」的机检形态。

**作者侧 `pack`**：按推导集从工作树采集（含镜像与 `.meta`；缺 `.meta` 即失败——先开一次 Creator 让它落盘；
`*.generated.*` 等硬排除形态即使在自己目录里也不采集），写 `files.lock`，用与 install 相同的校验自检一遍，
写出确定性 zip（同一工作树两次 pack 字节级相同）。

**宿主侧 `install`**（= install-or-upgrade，「zip 清单 ⟷ 已安装锁 ⟷ 工作树」三方比对）：

1. 读包并自证（`files.lock`）；身份交叉校验（plugin.json / manifest.json 的 id、constantName、viewDirs；
   每个 domain 的 descriptor 与向量 sidecar 同批在包内；每个 FGUI 包的 ART 源与发布物同批在包内）；
2. 每个路径过 §5.2 闸；镜像与真源字节相同、`.meta` 齐全；**`.meta` 内容闸**（2026-09-05，PLUGIN-REGISTRY §1-11，
   `tools/plugin/meta.ts`）：JSON 可解析、uuid 是小写 8-4-4-4-12（与 `scripts/sync-client.mjs` 同一正则，测试钉住相等）、
   importer 与目标类型相符（`.ts`→typescript、`.json`→json、目录→directory、图片→image、`.bin`→buffer …）、包内 uuid
   互不重复；安装（含从树重装）再把包内 uuid 与宿主 `apps/Cocos/assets` 树比对（本插件旧锁与本包将覆盖的路径除外），
   撞车在落盘前拒绝并点名两侧路径——修法在作者侧（删掉包内那个 `.meta` 让 Creator 重铸后重新 pack），⛔ 不再是
   verify:sync 事后报错与插件锁互相矛盾；
3. 已安装锁 `scripts/packages/<id>.lock` 存在时：工作树与旧锁不符（本地改动）⇒ 拒绝；同版本不同内容 ⇒ 拒绝；
   降级须 `--allow-downgrade`；旧锁有、新包无的文件 ⇒ 按清单删除（陈旧文件不残留）；
   首装时目标路径已存在且不属本插件 ⇒ 拒绝（所有权冲突，⛔ 不覆盖）；
4. 受影响路径的工作树必须干净（`git status`；索引里已暂存删除且工作树不存在的路径视为干净——uninstall 后未提交即可
   重装），校验类失败都发生在落盘之前；
   升级时旧锁的每条路径也要重过 §5.2 闸（锁是仓内明文，被改过/规则演进即拒绝，⛔ 不按可疑的锁删文件）；
   锁登记的文件在树中缺失 ⇒ 拒绝（先 `plugin -- check` 修锁或 `uninstall --force`）；推导集内已有不属本插件的
   文件（含 id/domain 与框架目录同名的目录级占用）⇒ 所有权冲突拒绝；
5. 原子落盘 → 写 `scripts/packages/<id>.lock`（已安装插件的唯一登记面）→ `git add`（只加存在或已跟踪的路径）
   → `codegen:gameplays`（含 gameplay；按新旧并集跑，升级去掉 gameplay 时仍跑一次收缩）/ `codegen:plugins`（总是跑：每个 plugin.json 都是它的输入；
   codegen 仍跑一次收缩）→ `sync:shared`（Cocos 镜像只 `git add -u`：新建的镜像文件没有 `.meta`，保持未跟踪）。
   **升级删除面显式交给 codegen**（2026-09-05，PLUGIN-REGISTRY §1-2）：旧身份 / 旧 plugin.json 有、新包没有的
   gameplay id / plugin id / 域 / View 名按 uninstall 同一算法算成 `--allow-delete` 集合传下去（成批删除时
   `SYNC_FORCE=1`），报告与 `--dry-run` 都打印它。**postinstall 失败即精确回滚**（PLUGIN-REGISTRY §1-1）：本次写入 /
   删除的插件文件与锁按落盘前字节复原、受影响路径的 git 索引重新同步、生成物 writer 路径里「本次新变脏」的部分
   restore / 删除（之前就脏的用户 WIP 原样留下），然后把 codegen 的原错误连同回滚清单抛出——树回到安装前，同一包可
   直接重来，⛔ 不留「文件已写、锁已写、生成物过期」的半安装态；
6. 停下，打印**人工**下一步：域变化时人工决定是否 bump `LOBBY_PROTOCOL_VERSION` 后
   `node scripts/protocol-fingerprint.mjs --write`（⛔ 脚本不隐式重钉）、带 FGUI 包时
   `node scripts/fgui-manifest.mjs --write`、`npm run verify:all`、提交前开一次 Creator 为 `sync:shared` 新建的
   镜像（与首个带客户端源码插件的 `plugins.meta`）生成 `.meta` 后 `git add apps/Cocos/assets/src`，并确认随包 `.meta`
   的 uuid 稳定（Creator 只会重写键序/版本，uuid 不变）。

**同仓迭代 `install --reinstall-from-tree <id>`**（plan-v5 E6 方案 ②，2026-09-05；两道新闸见段末）：已安装锁把插件自有文件锁死后，
宿主仓内直接改其中任何一个文件（哪怕 `apps/plugins/<id>/README.md` 一行）都会让 `check`/`plugin-lock.test.ts` 红，而普通
`install` 对「树≠锁」直接拒绝——同仓「作者=宿主」需要一条合法路径。本形态以**工作树为真相**重写已安装锁：
等价于「`pack` 当前树 → `install` 该包」，采集与自检走 pack 同一条路（缺 `.meta` / 越权 / 镜像不一致即拒绝），
锁被篡改即拒绝，目录级所有权冲突拒绝；**版本规则原样保留**——树上内容与锁不同但 `apps/plugins/<id>/plugin.json`
的 version 未 bump ⇒ 拒绝并点名改动面（新增/变化/删除），降级须 `--allow-downgrade`。它 ⛔ 不写任何插件文件
（文件本来就在树上），只重写 `scripts/packages/<id>.lock`，然后照常 `git add` + postinstall。动线：
改文件 → bump version → `install --reinstall-from-tree <id>` → `check` ✔ → 提交；之后从同一棵树 `pack` 出的包
与新锁逐条相同，仍可分发给别的宿主。
两道闸（2026-09-05，PLUGIN-REGISTRY §1-3；对抗审阅实证：树上把框架域 guild 写进 domains 并 bump，旧实现会把 guild 的
7 个框架文件「adopted」进插件锁，之后 `uninstall` 会按锁删掉框架功能）：① **身份变化闸**——树上 `plugin.json` 的
kinds / constantName / domains / fguiPackages 与锁不同即拒绝，显式 `--allow-identity-change` 才放行（`check` 同时点名
这种漂移）；② **git 跟踪闸**——谁算「本插件的」：旧锁条目一定是，树上新采集到的文件只有在 git **未跟踪**时才算作者
刚写的新文件；已跟踪却不在旧锁的文件视为框架（或别的提交）所有，拒绝并点名，确认后 `--adopt-tracked` 显式吸收
（`--no-git` 无从判定，退化为全部吸收）。锁内已不存在于树的越权条目不再拦 reinstall（构不成误删风险；规则演进后
改名的旧文件正是这种形态），登记了树上存在的越权文件仍拒绝。

**锁的来源抬头 `# source`**（2026-09-05，PLUGIN-REGISTRY §1-5 / §4.2）：`install <zip|dir>` 写
`{"kind":"package","filesLockSha256":…}`（内容身份 = 包内 files.lock 规范文本的 sha256，宿主可从锁 entries 离线复算；
`install --from-registry` 落地后再带 `registry` 子对象），`--reinstall-from-tree` 写 `{"kind":"tree",…,"forkedFrom":<上一来源>}`
（树 ≡ 锁的 no-op 保留原来源）。**分叉之上的升级**：锁 `source.kind === "tree"` 时，内容不同的来包默认拒绝并列出会被
覆盖/删除的分叉文件，显式 `--replace-local-fork` 才放行（同版本不同内容也放行——分叉 bump 到的版本号可能恰与上游撞车；
⛔ 不引入 `-local.N` 版本后缀）。旧锁没有这一行 ⇒ `check` 显示 `unknown`。

**对抗验证后的加固**（2026-09-05 晚；三名审阅者对七条修复各自实跑绕过场景，击穿处全部收口，用例前缀「加固」）：
回滚精确到**操作前**而不是 HEAD——插件文件与锁按落盘前字节复原，生成物根下操作前已脏的路径按操作前字节复原（用户已暂存 /
未暂存的 WIP 逐字回来，索引也按 `git ls-files -s` 快照逐条恢复），只有本次新变脏的路径才按 HEAD 收回；落盘阶段（写文件 /
删陈旧 / 写锁 / git add）与 postinstall 同一套回滚；`git status -z` 解析，非 ASCII 路径不再让回滚自己炸；「暂存删除算干净」
只限 HEAD 里本插件锁登记过的路径；仅大小写不同的改名按「先删旧名再写新名」处理（大小写不敏感卷不丢文件）；读包阶段拒绝
「文件与其子路径并存」。`--reinstall-from-tree` ⛔ 不替作者删仍在磁盘的旧锁文件（去掉域却留着域文件 ⇒ 拒绝并点名），
View 改名的删除面从旧锁 sidecar 推出，吸收了共享命名空间（测试前缀 / 域目录 / resources/ui …）的新文件时点名请人确认。
锁来源：与分叉内容相同的包 ⛔ 不能把 `tree` 洗白成 `package`（来源照旧，`--replace-local-fork` 才改标），无 `# source`
的旧锁按分叉待遇 fail-closed，`check` 复核抬头形状、`filesLockSha256` 与清单一致、id 大小写归一不重复，`uninstall` 报告来源。
gameplay `manifest.json` 的 `schemaVersion` 读时与 gameplay-schema 比对（包与树两侧）；孤儿 `.meta` 拒绝；
宿主 `.meta` 解析不了即拒绝装（撞车无从判定）；升级时同路径 `.meta` 换 uuid 只报告不拦。

**报告里的 `nextSteps` 按事实派生**（2026-09-05 小修）：协议指纹一项不再按「带 domain 就一定变了」猜——postinstall
跑完后脚本执行 `node scripts/protocol-fingerprint.mjs --check`，只有真报过期才写「协议指纹已过期 … `--write`」，
未变化则一句不提；`--dry-run` / `--no-postinstall` 没跑 codegen、无从判断，对带 domain 或 gameplay 形态的包给条件式
提示「本次未跑 codegen：跑完后若 protocol/ 生成物变化 …」。钉：`plugin-tool.test.ts` 的 `nextStepsFor` 用例。

**`uninstall`**：先让锁的每条路径重过 §5.2 闸并要求受影响路径的工作树干净（未提交的锁改动尤其可疑），
再按锁清单删除（⛔ 不按目录猜）、删 `apps/plugins/<id>/` 与锁，然后用显式 `--allow-delete`
（gameplay id / plugin id / 各 domain / plugin.json 登记的 View 名）驱动两个 codegen 收缩生成物，
`SYNC_FORCE=1` 放行 sync 熔断（成批删除是有意的）。本地改动过的文件默认拒绝删除（`--force` 放行）。

**`check`**（只读；`plugin-lock.test.ts` 随 `verify:all` 跑同一逻辑）：每把锁的清单文件都在且哈希一致、
`apps/plugins/<id>/plugin.json` 与锁一致、锁内路径仍在推导集内。没有插件 = 空通过。

### 5.5 目录形态：一个插件一个目录（阶段 1，2026-09-05；同日把登记单元并入 plugin.json、目录搬到 apps/plugins/）

```text
apps/plugins/
  host.json                       宿主 placement（默认玩法 + 首屏入口顺序）；host / registry 是保留 id
  <id>/plugin.json                身份 + 客户端登记（§5.3；宿主自有插件没有 version）
  <id>/README.md                  插件自述（plugin.json 的 docs 指向它）
  <id>/gameplay/manifest.json     有玩法时的单源（与 apps/shared/schema/gameplays/<id>/ 同等被发现）
  <id>/gameplay/state.json
```

宿主自带的登记单元（builtin / snakeCosmetic）与带 version 的可分发单元（snake / redeem / tally）在同一根下、同一形态——
「插件只消费框架既有形态」在这里字面成立。`codegen:plugins` 只有这一个发现根（目录名 = id）；`codegen:gameplays` 读
`apps/shared/schema/gameplays/<id>/`（框架玩法：snake / ballMove / idle）∪ `apps/plugins/<id>/gameplay/`。旧的 `features/`
目录、`feature.json`、`FeatureHost`、`codegen:features`、`ft:` 键前缀全部改名（feature → plugin；键前缀 `pl:`），
`feature` 这个词从此不再是仓内概念，留给日常语义与将来的地基层（kit，另开设计）。`apps/` 之所以是插件的家：npm workspaces
是显式列举而非 `apps/*` 通配、Creator 只看 `apps/Cocos/assets`、仓内没有 `apps/*` 形态的通配规则，而且到阶段 3 时
`apps/plugins/<id>/{shared,server,client}` 正好与 `apps/shared`、`apps/server`、`apps/client` 并排。

**为什么不是软链接**：三个 sync 脚本都用 `Dirent.isDirectory()` 遍历（符号链接目录被跳过）、`pack` 拒绝符号链接、Creator
资源库不认链接目录、git 符号链接在 Windows 上要特权、TypeScript 按真实路径判 `rootDir`。本仓对「同一份代码出现在两处」
的既定答案是复制 + 新鲜度闸（`sync:shared` / `sync:client`），插件的后续阶段沿用同一模式：

- 阶段 2：gameplay 插件的客户端四件（gameplay/logic/view/net）允许全部放在 `apps/client/src/plugins/<id>/`，生成的
  catalog 与 `<Constant>Room` 引用指向那里（源 + Cocos 镜像两处，与全仓一致）；
- 阶段 3（plugin-api 门面落地后，PLUGIN-REGISTRY §4.3）：`apps/plugins/<id>/{shared,server,test}` + `sync:plugins` 物化
  到框架固定位置（物化副本登记为 writer 产物，手改即红），锁只登记 `apps/plugins/<id>/**`。前提是插件代码只 import
  `@game/plugin-api/*` 这类稳定说明符——相对导入在原地与物化后无法同时成立；客户端受 Cocos 编译链只认相对导入的限制，
  源码收到 `apps/client/src/plugins/<id>/` 为止。

#### 5.5.1 snake 迁入插件标准（2026-09-06，已实施）

默认玩法 snake 从「宿主自有单元」升为带 version 的可分发 plugin：玩法单源搬到
`apps/plugins/snake/gameplay/{manifest,state}.json`，测试改用 `snake-` 前缀落进推导集，`plugin.json` 加
`version: 1.0.0`。**实证**（主树真跑）：`pack snake` 78 文件零跳过 → 删掉全部 78 个作者文件（十个 snake 目录被清空，
证明推导集无遗漏）→ `install` 写回 78 文件、postinstall 三个 codegen 均 `no changes` → 与迁移提交逐字节相同
（`git diff` 只多出 `scripts/packages/snake.lock`）→ `check` 五包全绿 → `plugin -- test snake` 106 例 → `uninstall
--dry-run` 78 文件。

两处连带修正：

- **三个冻结数据表去掉 `.generated` 后缀**（`snakeSkinCatalogData` / `skinBusinessCatalogData` /
  `SnakePresentationCatalogData`）。它们的生成器已随文档归并删除、从此只能手工维护（snake README §9.1），而
  `*.generated.*` 是 §5.2 的硬排除文件名形态：带旧名时 `pack` 把它们漏在包外，`install` 又把树上残留的同名文件判成
  所有权冲突——snake 打得出包却装不上。⚠ 一般结论：**插件目录内不能有真正的生成物**，凡是必须随包走的内容都不能
  叫 `*.generated.*`。
- **域名前缀规则收紧到真实包上**：snake 一带 version，未被声明的宿主域 `snakeCosmetic` 就落进「框架先占可分发单元前缀」
  （规则 iii），`snakeCosmetic` 因此必须在自己的 `plugin.json` 里显式声明该域。规则按设计生效，不是缺陷。

⚠ **仍未达标的一项：美术资源不随包走**。玩法资源的所有权规则是 `resources/<modeId>/`，而 snake 的 96 个资源在
`apps/Cocos/assets/resources/snakeoff/`（目录名 ≠ mode id），落在推导集外——`pack snake` 因此**一张图都不带**。
在本仓装回来看不出问题（资源本来就在），但把这个包装到别的仓里只有代码没有贴图。要补齐得把目录改名为
`resources/snake/`，代价是：三个客户端文件里的 80 条 `snakeoff/...` 资源路径要同步改（65 条在手工维护的冻结表 `SnakePresentationCatalogData.ts` 里）（现在是
手工维护的冻结表，⛔ 没有重建工具复核）、`previews/` 目前由 snake 与 snakeCosmetic 共用要先定归属、96 个
`.meta` 要随文件一起搬且 uuid 不能变。⛔ 本轮不动：它要 snake 专项对 README §2 素材台账拍板。

## 6. 入口与位置：插件声明身份，宿主决定去处

> 状态：✅ 已实施（2026-09-05）——设置面板（`logic/page/SettingsLogic.ts`，eacb687）、宿主 placement
> `apps/plugins/host.json`（`codegen:plugins` 生成 `GENERATED_HOST`）、slot/order 从 schema/codegen/
> PluginRegistry/AppRuntime/Main 全部退役、`launch.kind:"route"`、PluginHost 按 `dependencies` 装载。
> 机检：`apps/client/test/homeMenu.test.ts`、`settings.test.ts`、`pluginHost.test.ts`、
> `apps/server/test/plugin-codegen.test.ts`「入口治理闸」。

**框架默认形态**（本仓自带、供接手者替换）：默认首屏（本项目的宣传内容 `PromoHome`，右上角一个设置
按钮）→ 设置面板，**插件入口默认收纳在设置面板的入口列表里**；旧 FGUI `Home` 保留为可达 route（ballMove
的现成入口、开发调试快捷入口）。

贡献模型：

> 插件只声明入口的**身份与元数据**（`entryId` / `label` / `labelKey` / 图标 / `launch`），
> ⛔ **不声明位置**。位置归宿主。

- `launch` 两种形态：`{ kind:"gameplay", gameplayId }` 进玩法；`{ kind:"route", routeId }` 打开一个 plugin
  route（纯客户端登记插件——兑换码/聊天面板一类——的唯一入口形态；AppRuntime 先让 route 归属的 plugin
  过 PluginHost 闸再打开）。
- **位置归宿主的机检形态**是 `apps/plugins/host.json`（不是「宿主自己写代码硬编码 entryId」）：

  ```jsonc
  { "schemaVersion": 1,
    "defaultLaunch": { "kind": "gameplay", "gameplayId": "snake" },   // 默认玩法（Main.gameplayId 留空时的兜底）
    "home": ["snake/snake"] }                                          // 首屏 Home 入口，qualified id 有序列表
  ```

  `codegen:plugins` 校验 defaultLaunch 有唯一贡献者、home 每条都存在且不重复，并渲染为 `GENERATED_HOST`；
  换默认玩法/首屏顺序 = 改 host.json + 重跑 codegen，**零代码改动**。真实产品替换首屏时也只改这一份。
- codegen 另闸：**entryId 全仓唯一**（宿主与设置面板都按裸 entryId 引用）、**一 gameplayId 一贡献者**
  （launch → plugin 的映射不靠排序裁决）。
- 全量入口列表（设置面板）按 **`pluginId` → `entryId` 字母序**：确定、无冲突、与语言无关；⛔ 不裁剪——
  未上首屏的入口（回归样例 ballMove）仍出现在设置面板。
- plugin.json 的 `dependencies` 由 PluginHost 真正消费：launch 先按声明序装依赖（依赖正在 dispose 则等它拆完
  再装；运行期环点名结算 failed），任一依赖非 active 则本 plugin failed 且不装；仍有依赖方在位的 plugin 不随
  route refcount 归零释放（记请求，依赖方拆完后级联释放）；disposeAll 按依赖拓扑拆（依赖方先拆）。codegen 侧
  查环与不存在的依赖。

### 6.1 设置面板里的条目归属

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| 关闭音乐 / 音效 | 框架已有存储位 | `musicOn` / `sfxOn` 已在 user profile，`user.updateProfile` 即幂等写路由（✅ 已接线） |
| 兑换码 | **消费型 → 插件标准形态** | 一条 idempotent-write RPC domain + 一个 View + `launch.kind:"route"` 入口 |
| 日志上报 | 消费型（偏框架），但 HTTP 端点契约表 `protocol/http.ts` 是手写中央文件——需要新 HTTP endpoint 的形态属框架 PR，走 Lobby RPC domain 的形态才是插件 | 客户端诊断 + 一条 RPC |
| 选择语言 | 框架横切能力，**当前是空位** | `labelKey` 字段已存在但客户端无任何 i18n 实现，实际渲染用的是硬编码 `label`（见 §9） |
| 是否打开推送 | 框架 + 平台能力 | 现有 push 只有下行机制，无「订阅开关」语义；真推送还需平台 token |
| 服务条款 / 隐私政策 | **⛔ 责任不可转移，宿主自负** | 需版本化的「已同意」状态；插件改了条款文本，责任归属无法解释 |

合规四项（条款 / 隐私 / 推送 / 日志）是设置面板的**宿主固定区块**（当前置灰占位、逐条带原因，⛔ 不做假实现），
插件入口列表是它下面的另一个区块。

### 6.2 连带后果（状态）

1. **默认玩法的数据来源**：✅ 已重定位为 `apps/plugins/host.json` 的 `defaultLaunch`（`DEFAULT_LAUNCH_GAMEPLAY_ID`
   读 `GENERATED_HOST`，⛔ 不再从排序推导——否则退役 slot/order 后会静默翻成回归样例 ballMove，
   PLUGIN-REVIEW F16）。`Main.ts` 的 `@property gameplayId` 已降格为**开发调试快捷入口**（tooltip/注释改写；
   删除 @property 属场景资产 diff，需 Creator）。
2. **加载页是全新 route**：仍开放（§9）。现有链路是 Login → AreaList → LoginNotice → PromoHome，没有加载页。
   它要承担 FGUI 包预加载与进度——⚠ 本仓 FGUI 包**只有加载路径、没有卸载路径**（包闭包是 app session
   内常驻），所以「开局预热哪些包」是加载页的实质决策，设计时须与 `packageLoader` 的既有能力对齐。
3. **宣传首屏注定被整体替换**，这与 `HomeView.ts` / `HomeLogic.ts` 在保护清单里并不矛盾，但两件事必须
   分开讲：**普通插件不得改 Home**（保护清单与 §5.2 硬排除管的是这个）；**项目开发者替换首屏是他们自己的
   项目**，且首屏入口顺序仍从 `host.json` 读，不必硬编码。

⚠ 定位提醒：在框架默认形态里，设置面板实质承担了「入口大厅」的职责。**这是框架默认长这样，不是产品
应该长这样**——真实产品多半会把主要玩法直接摆首屏（改 `host.json.home`）。

## 7. 生命周期取舍：安装为主，卸载罕见

游戏项目一旦引入某个插件包（如聊天），基本不会卸载。这条事实反转了两个取舍：

1. **卸载路径保持显式**（`plugin -- uninstall`，按已安装锁的清单删，⛔ 不做「删目录自动收缩生成物」）。
   在「基本不卸载」的世界里，目录消失最可能的成因是**误删或包没拉全**，此时静默收缩生成物比报错糟糕得多
   ——所以两个 codegen 的 `--allow-delete` 删除保护要留着，卸载命令显式传它；升级删掉域 / View / kind 时 install
   也按同一算法显式传（§5.4 第 5 条）。
2. **升级取代卸载成为第二高频操作**，因此包必须带版本；**已安装状态是一把锁**（`scripts/packages/<id>.lock`：
   版本 + 全部文件的 sha256），升级 = 三方比对（§5.4），本地改动、同版本不同内容、降级都被点名。
   多插件长期共存是常态，冲突面（§8）才是主战场。

## 8. 冲突面（多包共存时的真正战场）

| 冲突面 | 现状 |
| --- | --- |
| 玩法/plugin id、RPC domain、route 名、View 名、错误码、operationGroup | ✅ codegen fail-fast（含大小写归一化） |
| menu entryId | ✅ codegen 全仓唯一（2026-09-05） |
| 同一 gameplayId 多贡献者 | ✅ codegen 拒绝（一 gameplayId 一贡献者） |
| 入口位置 | ✅ 已消解——插件不声明位置，`apps/plugins/host.json` 是唯一声明处 |
| Redis key 命名空间 | ✅ gameplay 侧 `kGameplay`（`gp:`）、plugin 侧 `kPluginUser`/`kPluginShared`（`pl:`）、kit 侧 `kKitUser`/`kKitShared`（`kt:`，docs/KIT.md §2）三个工厂，命名空间互不可达 |
| FGUI 包名与 `ui://` 命名空间 | ✅ `scripts/fgui-manifest.mjs` 已查 package 名/id 与资源名/id 重复；安装侧靠所有权推导（只允许声明的 `fguiPackages`）挡住同名包解压覆盖 |
| 插件间依赖顺序与环 | ✅ codegen 查环与不存在的依赖；PluginHost 运行期按依赖顺序装载/逆序卸载 |
| 文件级越权与残留 | ✅ allowlist 整包拒绝；已安装锁让升级按清单删、卸载按清单删 |
| Lobby 域契约漂移（plugin 侧） | ✅ codegen 闸：`domains/<域>.ts` **自身字节** digest 变化必须伴随域级 `contractVersion` 递增（`LOBBY_RPC_DOMAIN_CONTRACTS`，与 gameplay 只算 wire.ts 的 modeVersion 闸同口径）；跨文件复用的 validator/类型（primitives/economy/../http、被他域 import 的域文件）变化由 protocol-fingerprint 点名但不强制 bump；join 信封侧仍共用协议整数（Non-intrusive §4.8，⛔ 不各自新增版本闸） |
| MySQL 表 | ⛔ 不开口：需要新表的能力不是插件，是框架 PR（Non-intrusive §12.3） |

## 9. 缺口清单（做插件机制前要补的）

已补（2026-09-05，证据在各自测试）：

- ✅ `modes/catalog.ts` 生成化（`codegen:gameplays` → `modes/catalog.generated.ts`）；
- ✅ RPC 向量登记表生成化（`codegen:plugins` → `lobbyRpcVectors/index.generated.ts`）——新增域不再手改中央测试；
- ✅ plugin 侧 Redis 键工厂；
- ✅ 默认 launch target 重定位（`host.json.defaultLaunch`）与 slot/order 退役；
- ✅ `launch.kind:"route"`（纯 plugin 入口）；
- ✅ `dependencies` 运行期消费；⛔ `dependencies` 不得直接写 kit id——对 kit 的依赖只经 `requires.kits` 声明（codegen 拒绝，KIT.md §4；带客户端 entry 的 kit 由 codegen 自动并入 dependencies 且排在前面）；
- ✅ §8 两条「待核实」定论（FGUI 包名重复已查、依赖已消费）；
- ✅ plugin 侧契约闸（codegen 层域 descriptor digest → 域级 `contractVersion`，`LOBBY_RPC_DOMAIN_CONTRACTS`）。

仍开放（登记在 [plan-v5.md](plan-v5.md) E 类）：

1. **`launch.profile`**：入口的 gameplay launch 不带房型，一个玩法只能出一个入口——蛇要同时提供「快速开始」
   （dropIn）与「邀请好友」（private）就需要它。客户端现状是各玩法 joiner 写死 profile（`SnakeRoom.ts`），
   补丁：生成器加可选字段 → AppRuntime 传下去 → 玩法 joiner 按 target 选 profile。
2. **`PrivateRoomLobby` 模板**（plan-v5 B3，编辑器待办）：不做的话，每个用 private profile 的玩法都要自画
   输码/房间页。
3. **i18n / LocalizePort 空位**：`labelKey` 有字段、无实现，实际渲染的是硬编码 `label`。做「选择语言」
   之前它只是装饰；一旦要做，它就成了契约——缺的是 LocalizePort 契约与 locales 载体，
   并**必须先于第一个第三方插件落地**，否则每个插件都会硬编码一种语言。
4. **框架默认加载页**：全新 route，与 FGUI 包预热策略绑定（§6.2 第 2 条）。
5. **join 信封侧的 plugin 契约比对**：codegen 层的闸已落地（上表），但 Lobby join 仍只比对 `LOBBY_PROTOCOL_VERSION`
   整数——按 Non-intrusive §4.8 两类实体共用协议整数、⛔ 不各自新增版本闸，域契约变化要不要反映到
   `LOBBY_PROTOCOL_VERSION` 是人工决策（`plugin -- install` 在域变化时会提示）。
6. **第一个真实插件的端到端实证**（plan-v5 E5）：✅ 已完成（2026-09-05）——「兑换码」插件
   `apps/plugins/redeem`（client 形态、domains `redeem`；文件清单与取舍见 [apps/plugins/redeem/README.md](../apps/plugins/redeem/README.md)）
   在作者侧 `plugin -- pack` 成 29 文件的包，再从**干净树**以 `plugin -- install` 进仓：postinstall 链
   （codegen:plugins → sync:shared）重生全部生成物，人工步骤只剩 `protocol-fingerprint --write`
   （新增域为纯追加，未 bump `LOBBY_PROTOCOL_VERSION`）与共享祖先 `apps/Cocos/assets/src/plugins.meta`；
   `verify:all` 通过（launcher-matrix `bash --pretty-print` 与 S1 素材新鲜度两条为既有环境基线）。
   实证过程暴露并补齐的框架前置（`5c6df35`）：plugin.json 可选 `module`（PluginHost 装载器由生成器渲染，
   AppRuntime 透传）、logic/sidecar 可落 `apps/client/src/plugins/<id>/`、plugin View 只豁免 cc/fairygui
   值导入、错误码顺序测试不再硬编码域清单——即「新插件不得需要改中央源码/中央测试」的判据真的成立了。
   Creator 侧确认已于当天下午闭合（见 plan-v5 E5 行与 docs/evidence/creator-2026-09-05）。
   **gameplay 形态**同日由第二个真实插件「点数赛」`apps/plugins/tally` 走通同一条动线（`fb903db`，
   [apps/plugins/tally/README.md](../apps/plugins/tally/README.md)）：它逼出了两处此前纯客户端形态没碰到的中央清单——
   `apps/server/test/wire-vectors/index.ts` 的手写 import 表（改为 `codegen:gameplays` 生成 `index.generated.ts`，
   sidecar `wire-vectors/<id>.ts` 进 gameplay 所有权）与 `gameplay-codegen.test.ts` 的硬编码玩法集（改为按 schema
   目录发现）。至此 §3 的判据在两种 kind 上都有真实包背书。
7. **kit（地基层）前置的框架 PR**：迁移账本 / 按区表登记 / freeze-thaw 读 `userKeys` / `kKit*` / `kit-api/server` 门面 / effect 登记通道 / 域名前缀规则对插件生效 / plugin schema v3（`requires`）/ 锁目录合并到 `scripts/packages/`——清单与顺序见 [docs/KIT.md](KIT.md) §7，状态只在 KIT.md §9 回写。
8. **同仓「作者=宿主」的插件迭代动线**（plan-v5 E6）：✅ 已按方案 ② 实施（2026-09-05）——
   `install --reinstall-from-tree <id>`（§5.4）。E5 实证当天撞上的现场（改插件 README 一行即锁红、
   只能回退）已用它重放闭合：bump 1.0.0 → 1.0.1 后以树重写锁。仍开放的同类尾巴：随包 `.meta` 在锁内，Creator
   重排键序即锁红（plan-v5 B 节清单 1-② 待实测后决定 `.meta` 是否按语义比对）。

## 10. 非目标

沿用 [docs/Non-intrusive.md](Non-intrusive.md) §3.3 的既定边界并在此重申：

- ⛔ 不实现运行时热插拔、远程代码下载或脚本热更新；
- ⛔ 不承诺支持**不可信第三方包**——威胁模型是「作者可信、包不可信」（§5.1），服务端代码沙箱是另一个
  量级的议题，需独立立项；
- ⛔ 不把 codegen 产物、协议指纹、镜像 diff 隐藏掉——它们是 review 的可见面（Non-intrusive §1 的既有论证）。
