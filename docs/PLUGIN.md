# 插件机制设计基线

> 状态：**设计基线**（2026-09-04 讨论定稿）。本文只回答「什么能做成插件、装载时机在哪、包长什么样」，
> ⛔ 不承诺实现时间表，也不改变任何既有约束。
>
> 与 [docs/Non-intrusive.md](Non-intrusive.md) 的关系：那份是「框架如何做到新增玩法/feature 不侵入」的
> 改造方案（框架侧阶段 0-9 已实施）；本文接着回答下一个问题——**外部包能否直接装进本项目跑起来**。
> 判据一旦落地，`scripts/protected-paths.json` 就是它的机检真源。
>
> 审阅记录：[docs/PLUGIN-REVIEW.md](PLUGIN-REVIEW.md)（2026-09-05）。该审阅对本文多处表述给出了带代码证据的修正与推荐实现方案，
> 实施状态登记在 [plan-v5.md](../plan-v5.md)。

## 1. 核心判据

> **插件只能「消费」，不能「定义」。要定义就是框架 PR。**

这条判据不是新发明的规矩，而是把前面十几轮改造**已经形成的结构**说出来：框架把「消费一层能力」做成了声明式
（manifest / feature.json 里一行），把「定义一层能力」留在了受保护的中央文件里。两者的分界线恰好就是插件
边界。

除「能不能」之外还有第三类：**⛔ 责任不可转移**——技术上完全能做成插件，但责任在发行方，不该外包给
插件（服务条款、隐私政策、推送授权、日志上报，见 §6.1）。

判据可机检：安装脚本拿 `scripts/protected-paths.json` 一挡——包内命中受保护路径即拒绝安装。⛔ 没有这道闸，
插件通道就是绕过全部保护路径的后门（一个 zip 里塞一份改过的 `GameRoom.ts`，解压就悄悄改了框架）。

## 2. 分层：哪些层可消费、哪些层只能定义

| 层 | 插件能否自持 | 落点 |
| --- | --- | --- |
| gameplay module（实时玩法：manifest/state/wire + 三端模块） | ✅ 可消费 | `apps/shared/schema/gameplays/<id>/` 等玩法自有目录 |
| feature（大厅页面 + RPC domain + View + 路由 + 菜单） | ✅ 可消费 | `features/<id>/feature.json` + 自有源码目录 |
| profile 声明（选用已有的房型策略组合） | ✅ 可消费 | manifest 的 `profiles` 一行 |
| state fragment 声明（选用已有的公共状态片段） | ✅ 可消费 | state.json 的 `fragments` 一行 |
| room policy 定义（新的 Start/Access 策略） | ⛔ 只能定义 | `apps/server/src/rooms/core/RoomProfile.ts` |
| state fragment 定义（新的公共状态片段） | ⛔ 只能定义 | gameplay-codegen 的 stateRenderer |
| core wire 定义（房内公共消息） | ⛔ 只能定义 | `apps/shared/src/protocol/messages.ts` |
| shell 生命周期钩子定义 | ⛔ 只能定义 | `apps/server/src/rooms/GameMode.ts` 的钩子表 |

上四行是声明式、零侵入；下四行全部落在受保护路径上，属 Non-intrusive §12.3 的「显式框架侵入」。

## 3. 判据的例证（讨论中逐个验过）

| 需求 | 判定 | 依据 |
| --- | --- | --- |
| 大厅聊天面板 | **消费型 → 插件可做** | feature 层完备，零框架改动 |
| 房内聊天增强（频道/私聊/表情） | 定义型 → 框架 PR | 房内聊天今天是 core wire（`CORE_C2S.Chat`），要扩展就得改 `protocol/messages.ts` |
| 蛇增加「邀请好友内战」 | **消费型 → 插件可做** | 服务端侧只需两行声明，见 §3.1 |
| 做一个「给任意玩法加内战」的通用插件 | 定义型 → 框架 PR | 要同时贡献 room policy + state fragment + core wire |
| 无尽模式要的 `roomLifecycle` 能力 | 定义型 → 框架 PR | 属实：当初改了 `GameRoom.ts`/`GameMode.ts` 共 80 行 |

### 3.1 「蛇加内战」的实际代价（消费型样本）

邀请好友内战的**实现全在框架里**（阶段 8 已交付）：邀请码租约与 access ticket 在 `core/rooms/invite/`、
`room.prepareCreate`/`room.resolve` 在框架 core domain `lobbyRpc/domains/room.ts`、Ready/Start 是 core wire、
`ownerReady`/`inviteRoom` 是 codegen 注入的公共 fragment、`private` profile（invite-code + owner-ready）
在 `RoomProfile.ts` 注册表里已经现成。

玩法侧只做声明：

```jsonc
// apps/shared/schema/gameplays/snake/manifest.json
"profiles": ["dropIn", "private"]
// apps/shared/schema/gameplays/snake/state.json
"fragments": ["ownerReady", "inviteRoom"]
```

跑一次 `codegen:gameplays` 即生效，**服务端零中央文件改动**；漏声明 fragment 时 `RoomProfile.ts` 的启动期
断言会直接点名缺哪个。`privateFixture` 是这条路径的现成实证。

⚠ 客户端侧仍有两项自带成本：需要玩法自己的输码/房间页 View（框架原设想的 `PrivateRoomLobby` 模板属编辑器
待办、尚未做），以及 §6 的 `launch.profile` 缺口。

## 4. 装载时机：只做构建期插件

| 层 | 能做到什么 | 约束 |
| --- | --- | --- |
| **构建期插件**（本文取此） | 解压 → 一条命令 → 跑起来 | 多一条命令；全部静态门禁、类型检查、指纹保留 |
| 服务端运行时插件 | 服务端启动扫描目录并动态 import（`websocket/loader.ts` 已有先例） | 在持有 Redis/MySQL 凭证的进程里执行外部代码，需信任模型 |
| 客户端运行时插件 | **当前技术栈做不到** | Cocos Creator 在构建期定死模块图；铁律 10 与 Non-intrusive §5.3 明令 ⛔ 运行时 `fs`/目录扫描/`import.meta.glob` |

客户端唯一的引擎出路是 Asset Bundle 远程加载，但 bundle 里的脚本仍由**本工程构建管线**产出——能做到「主壳
发版一次、玩法 bundle 远程更新」，做不到「第三方任意 zip 解压即用」。平台合规（小游戏/应用商店）是另一个
需按发布目标单独核实的变量。

**既定取舍**：接受「安装后始终要开一次 Creator」（生成客户端镜像的 `.meta`），换取全部构建期审计能力。

## 5. 包格式与安装流程

> 状态：✅ 已实现（2026-09-05）——`apps/server/tools/plugin/`，命令 `npm --workspace @game/server run plugin`，
> 契约测试 `apps/server/test/plugin-tool.test.ts`，已安装锁的新鲜度随 `apps/server/test/plugin-lock.test.ts`
> 进 `verify:all`。本节按实现改写，旧表述（denylist 闸、覆盖同目录、合成 .meta）已被
> [PLUGIN-REVIEW](PLUGIN-REVIEW.md) F03/F04/F11/F12/F14/F21 推翻。

### 5.1 威胁模型（先说清闸门防什么）

**作者可信、包不可信**：插件由自己与合作方编写（§10 不承诺不可信第三方），闸门防的是**非预期写入与
静默漂移**——一个 zip 因疏忽（或恶意）夹带了不属于它的文件、覆盖了别人的目录、升级时残留旧文件、
本地改动被静默冲掉。⛔ 不承诺沙箱：插件源码与框架同进程运行，运行期信任与「构建期插件」无关
（构建期只是多了一个 review 窗口，不是隔离边界）。

### 5.2 所有权由身份推导（allowlist，fail-closed）

插件能写入仓库的路径集合由 `plugin.json` 的身份 (id, kinds, constantName, domains, fguiPackages) 与
`features/<id>/feature.json` 声明的客户端目录**纯函数推导**（`tools/plugin/ownership.ts`）——这就是
「目录即所有权」的机检形态：

| kind | 推导出的可写落点 |
| --- | --- |
| 共有 | `plugins/<id>/`、`docs/<id>/`、`apps/server/test/<id>*.ts`、`apps/server/test/int/<id>*.ts`、`apps/client/test/<id>*.ts` |
| gameplay | `apps/shared/schema/gameplays/<id>/`、`apps/shared/src/gameplays/<id>/`、`apps/server/src/rooms/modes/<id>/`、`apps/client/src/gameplay/modes/<id>/`、`apps/client/src/logic/rooms/<id>/`、`apps/client/src/view/rooms/<id>/`、`apps/client/src/net/rooms/<Constant>Room.ts`、`apps/Cocos/assets/resources/<id>/` |
| feature | `features/<id>/`、`apps/client/src/features/<id>/`、`apps/server/src/core/<id>/`；每个声明的 domain：`apps/shared/src/protocol/lobbyRpc/domains/<d>.ts`、`apps/server/src/websocket/<d>/`、`apps/server/test/lobbyRpcVectors/<d>.ts`；feature.json 的 viewDirs/logicDir 必须 ⊆ `apps/client/src/features/<id>/**` 或 `apps/client/src/{view,logic}/**/<id>` |
| fguiPackages | `apps/art/fairygui/assets/<Pkg>/`、`apps/Cocos/assets/resources/ui/<Pkg>.bin`、`<Pkg>_atlas*` |
| 镜像 / `.meta` | 由真源推导：`apps/client/src/X` 可写 ⇒ `apps/Cocos/assets/src/X` 与 `X.meta` 可写；插件专属目录的目录 `.meta` 可写，共享祖先目录（如 `view/rooms.meta`）⛔ 不随包 |

推导之前先过**硬排除**：`scripts/`、`tools/`、`apps/server/tools/`、`.github/`、`vendor/`、`node_modules`、
`package*.json`、`.npmrc`、`tsconfig*`、`.env*`、`*.generated.*`、`*.lock|*.fingerprint|*.sha256`、
`scene.scene`、`apps/client/src/{shared,lib,generated,app}`、`apps/shared/src/{generated,protocol}`（域 descriptor
按 allowlist 精确放行）、`apps/server/src/{rooms/schema,rooms/core,core/infra}`；再过 `scripts/protected-paths.json`
的两组保护路径与全部 writer 产物。⛔ 任一路径被拒即**整包拒绝**并逐条点名；「新增 npm 依赖 / 改根命令 /
改协议信封」在这套闸下根本进不了包——它们是框架 PR（Non-intrusive §12.3）。

`apps/server/test/plugin-tool.test.ts` 钉住：真仓 protected-paths.json 的每条路径对任何插件身份都不可写。

### 5.3 包格式

zip（或已解开的目录，两者等价）根部两件元数据 + 仓库相对路径的文件：

```text
plugin.json      身份：{ schemaVersion:1, id, version(semver), kinds:["gameplay"|"feature",…],
                       constantName?(gameplay 必填), domains?, fguiPackages?,
                       requires?:{ featureSchemaVersion, gameplaySchemaVersion }, description? }
files.lock       清单：每行 <仓库相对路径> <sha256>（与 protected-paths.lock 同形态）
<仓库相对路径>…  文件本体（含客户端镜像与 Creator 产出的 .meta）
```

- `kinds` 可同时含 gameplay 与 feature——一个玩法插件天然是「manifest/state/wire + feature.json」的组合，
  ⛔ 没有「kind 二分」；
- `requires` 只钉两个 schemaVersion（feature-schema-v1 / gameplay-schema-v1）。协议整数不是插件的兼容轴：
  gameplay 的契约身份是 per-mode `contractDigest`/`modeVersion`（既有闸），Lobby 域的契约身份是
  §9 待补的 codegen 层 digest → contractVersion 闸；
- ⛔ 不放路径映射（仓库布局不能成为第二真源），⛔ 不放 slot/order（位置归宿主，§6）；
- `plugin.json` 同时以 `plugins/<id>/plugin.json` 落在仓库（作者侧手写、`pack` 的输入、`install` 原样落回），
  包的自证由 `files.lock` 承担：清单外条目、哈希不符一律拒绝。

### 5.4 命令与动线

```text
npm --workspace @game/server run plugin -- pack <id> (--out <zip> | --out-dir <dir>)
npm --workspace @game/server run plugin -- install <zip|dir> [--allow-downgrade] [--no-git] [--no-postinstall] [--dry-run]
npm --workspace @game/server run plugin -- uninstall <id> [--force] [--no-git] [--no-postinstall] [--dry-run]
npm --workspace @game/server run plugin -- check
```

**作者侧 `pack`**：按推导集从工作树采集（含镜像与 `.meta`；缺 `.meta` 即失败——先开一次 Creator 让它落盘；
`*.generated.*` 等硬排除形态即使在自己目录里也不采集），写 `files.lock`，用与 install 相同的校验自检一遍，
写出确定性 zip（同一工作树两次 pack 字节级相同）。

**宿主侧 `install`**（= install-or-upgrade，「zip 清单 ⟷ 已安装锁 ⟷ 工作树」三方比对）：

1. 读包并自证（`files.lock`）；身份交叉校验（feature.json / manifest.json 的 id、constantName、viewDirs；
   每个 domain 的 descriptor 与向量 sidecar 同批在包内；每个 FGUI 包的 ART 源与发布物同批在包内）；
2. 每个路径过 §5.2 闸；镜像与真源字节相同、`.meta` 齐全；
3. 已安装锁 `scripts/plugins/<id>.lock` 存在时：工作树与旧锁不符（本地改动）⇒ 拒绝；同版本不同内容 ⇒ 拒绝；
   降级须 `--allow-downgrade`；旧锁有、新包无的文件 ⇒ 按清单删除（陈旧文件不残留）；
   首装时目标路径已存在且不属本插件 ⇒ 拒绝（所有权冲突，⛔ 不覆盖）；
4. 受影响路径的工作树必须干净（`git status`），任何失败都发生在落盘之前；
5. 原子落盘 → 写 `scripts/plugins/<id>.lock`（已安装插件的唯一登记面）→ `git add`
   → `codegen:gameplays`（含 gameplay）/ `codegen:features`（含 feature）→ `sync:shared`；
6. 停下，打印**人工**下一步：域变化时人工决定是否 bump `LOBBY_PROTOCOL_VERSION` 后
   `node scripts/protocol-fingerprint.mjs --write`（⛔ 脚本不隐式重钉）、带 FGUI 包时
   `node scripts/fgui-manifest.mjs --write`、`npm run verify:all`、开一次 Creator 确认随包 `.meta` 的 uuid 稳定
   （Creator 只会重写键序/版本，uuid 不变；无头 CI 安装后 `verify:all` 即可通过，开 Creator 是确认而非前置）。

**`uninstall`**：按锁清单删除（⛔ 不按目录猜）、删 `plugins/<id>/` 与锁，然后用显式 `--allow-delete`
（gameplay id / feature id / 各 domain / feature.json 登记的 View 名）驱动两个 codegen 收缩生成物，
`SYNC_FORCE=1` 放行 sync 熔断（成批删除是有意的）。本地改动过的文件默认拒绝删除（`--force` 放行）。

**`check`**（只读；`plugin-lock.test.ts` 随 `verify:all` 跑同一逻辑）：每把锁的清单文件都在且哈希一致、
`plugins/<id>/plugin.json` 与锁一致、锁内路径仍在推导集内。没有插件 = 空通过。

## 6. 入口与位置：插件声明身份，宿主决定去处

**框架默认形态**（本仓自带、供接手者替换）：默认加载页 → 默认首屏（本项目的宣传内容，右上角一个设置
按钮）→ 设置面板，**插件入口默认收纳在设置面板的入口列表里**。

由此确定贡献模型：

> 插件只声明入口的**身份与元数据**（`entryId` / `label` / `labelKey` / 图标 / `launch`），
> ⛔ **不声明位置**。位置归宿主。

因此 `slot` / `order` 从插件 manifest **移除**——插件本就不该有权把自己塞进首屏。位置竞争这一整类冲突
随之消失（旧表述见 §8）。⚠ 框架默认首屏是宣传页、不摆玩法入口，所以框架层**不需要**「谁上首屏」的
白名单；真实产品的首屏由接手的开发者自己写，那是他们的项目代码，不需要框架给配置位。

设置面板列表的排序取 **`featureId` 字母序**：确定、无冲突、与语言无关（按显示名排会随语言变动）。

### 6.1 设置面板里的条目归属

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| 关闭音乐 / 音效 | 框架已有存储位 | `musicOn` / `sfxOn` 已在 user profile，`user.updateProfile` 即幂等写路由 |
| 兑换码 | **消费型 → 插件标准形态** | 一条 idempotent-write RPC domain + 一个 View |
| 日志上报 | 消费型（偏框架） | 客户端诊断 + 一个 endpoint |
| 选择语言 | 框架横切能力，**当前是空位** | `labelKey` 字段已存在但客户端无任何 i18n 实现，实际渲染用的是硬编码 `label`（见 §9） |
| 是否打开推送 | 框架 + 平台能力 | 现有 push 只有下行机制，无「订阅开关」语义；真推送还需平台 token |
| 服务条款 / 隐私政策 | **⛔ 责任不可转移，宿主自负** | 需版本化的「已同意」状态；插件改了条款文本，责任归属无法解释 |

合规四项（条款 / 隐私 / 推送 / 日志）应当是设置面板的**宿主固定区块**，插件入口列表是它下面的另一个区块。

### 6.2 三个连带后果

1. **「默认玩法」将失去数据来源。** `AppRuntime` 现在的默认 launch target 读「排序最前的 contribution」，
   slot/order 移除后该表达式无输入；而首屏不摆玩法入口，「默认进哪个玩法」也失去产品含义。建议把
   `Main.ts` 的 `@property gameplayId` 与 `enterBattle()` 回退通道**降格为开发调试快捷入口**并改名注释，
   ⛔ 不要留一个语义悬空的字段。
2. **加载页是全新 route。** 现有链路是 Login → AreaList → LoginNotice → Home，没有加载页。它要承担 FGUI
   包预加载与进度——⚠ 本仓 FGUI 包**只有加载路径、没有卸载路径**（包闭包是 app session 内常驻），所以
   「开局预热哪些包」是加载页的实质决策，设计时须与 `packageLoader` 的既有能力对齐。
3. **宣传首屏注定被整体替换**，这与 `HomeView.ts` / `HomeLogic.ts` 在保护清单里并不矛盾，但两件事必须
   分开讲：**普通插件不得改 Home**（保护清单管的是这个）；**项目开发者替换 Home 是他们自己的项目**，
   不受插件约束。⛔ 不要把后者误读成「框架不让改首屏」。

⚠ 定位提醒：在框架默认形态里，设置面板实质承担了「入口大厅」的职责。**这是框架默认长这样，不是产品
应该长这样**——真实产品多半会把主要玩法直接摆首屏。

## 7. 生命周期取舍：安装为主，卸载罕见

游戏项目一旦引入某个插件包（如聊天），基本不会卸载。这条事实反转了两个取舍：

1. **卸载路径不值得投资**。在「基本不卸载」的世界里，目录消失最可能的成因是**误删或包没拉全**，此时静默
   收缩生成物比报错糟糕得多——所以删除保护要留着。
2. **升级取代卸载成为第二高频操作**，因此包必须带版本与兼容声明；且**多插件长期共存是常态**，冲突面（§8）
   才是主战场。

## 8. 冲突面（多包共存时的真正战场）

| 冲突面 | 现状 |
| --- | --- |
| 玩法/feature id、RPC domain、route 名 | ✅ codegen 已 fail-fast |
| Redis key 命名空间 | ✅ gameplay 侧有 `kGameplay` 工厂；⛔ feature 侧仍各写各的 |
| 菜单 slot/order | ✅ **已消解**——插件不再声明位置（§6），位置竞争这一整类冲突消失 |
| FGUI 包名与 `ui://` 命名空间 | ⚠ 有闭包校验，同名包冲突的防护**待核实** |
| 插件间依赖顺序与环 | ⚠ feature manifest 已有 `dependencies` 字段，是否被真正消费（顺序/环检测）**待核实** |

## 9. 做插件机制前要补的缺口

1. **`launch.profile`**：菜单条目的 `launch` 现在只有 `{ kind, gameplayId }`，不带房型。因此一个玩法在 Home
   只能出一个入口——蛇要同时提供「快速开始」（dropIn）与「邀请好友」（private）就需要它。补丁很小：生成器
   加可选字段 → AppRuntime 传下去 → 让 target 覆盖 services 的 `launchDefaults`。
2. **`PrivateRoomLobby` 模板**（Non-intrusive §7.5 的编辑器待办）：不做的话，每个用 private profile 的玩法
   都要自画输码/房间页。
3. **`modes/catalog.ts` 生成化**：服务端玩法注册目前仍是手写三行；改由 codegen 从目录发现后，「加目录自动进」
   才成立。
4. **i18n / LocalizePort 空位**：`labelKey` 有字段、无实现，实际渲染的是硬编码 `label`。做「选择语言」
   之前它只是装饰；一旦要做，它就成了契约——且**必须先于插件机制落地**，否则每个插件都会硬编码一种语言。
5. **默认 launch target 的去处**：随 slot/order 移除一并重定位（§6.2 第 1 条）。
6. **框架默认加载页**：全新 route，与 FGUI 包预热策略绑定（§6.2 第 2 条）。
7. §8 的两条待核实项。

## 10. 非目标

沿用 [docs/Non-intrusive.md](Non-intrusive.md) §3.3 的既定边界并在此重申：

- ⛔ 不实现运行时热插拔、远程代码下载或脚本热更新；
- ⛔ 不承诺支持**不可信第三方包**——当前判据只覆盖「自己与合作方编写的包」，服务端代码沙箱是另一个量级的
  议题，需独立立项；
- ⛔ 不把 codegen 产物、协议指纹、镜像 diff 隐藏掉——它们是 review 的可见面（Non-intrusive §1 的既有论证）。
