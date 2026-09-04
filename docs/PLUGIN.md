# 插件机制设计基线

> 状态：**设计基线**（2026-09-04 讨论定稿）。本文只回答「什么能做成插件、装载时机在哪、包长什么样」，
> ⛔ 不承诺实现时间表，也不改变任何既有约束。
>
> 与 [docs/Non-intrusive.md](Non-intrusive.md) 的关系：那份是「框架如何做到新增玩法/feature 不侵入」的
> 改造方案（框架侧阶段 0-9 已实施）；本文接着回答下一个问题——**外部包能否直接装进本项目跑起来**。
> 判据一旦落地，`scripts/protected-paths.json` 就是它的机检真源。

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

- zip 内部**直接用仓库相对路径**（解压即到位——「目录即所有权」本来就是契约），另加一个薄 `plugin.json`：
  id / version / kind（gameplay | feature）/ 兼容声明（框架版本、`GAME_ROOM_PROTOCOL_VERSION` 或
  `LOBBY_PROTOCOL_VERSION` 范围）。⛔ **不放路径映射**，否则仓库布局会变成第二真源。
- `install` 即 **install-or-upgrade**（覆盖同目录 → 重跑 codegen），契约变化交给既有的 digest / modeVersion
  闸去发现。
- 安装流程：校验兼容 → **拿 protected-paths 挡住越界写入** → 解包 → `codegen:gameplays` + `codegen:features`
  → `sync:shared` → 合成 `.meta` → `verify:all` → 提示开一次 Creator。
- 卸载：**保持显式命令**，沿用 codegen 现有的 `--allow-delete` 删除保护。⛔ 不做「删目录自动收缩生成物」——
  见 §7。

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
