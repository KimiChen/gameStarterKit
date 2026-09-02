# 08 · 来源与素材借鉴台账

> [返回总目录](README.md) · [上一篇：竖版美术方向](07-art-direction.md)

> 台账日期：2026-08-31<br>
> 借鉴源根目录：`/Users/kimi/work/tanchishe/wegameVersion`（即 `~/work/tanchishe/wegameVersion`）<br>
> 当前直接复用状态：2026-09-02 起按用户授权指令引入 31 项素材（图片 25 + 音效 6，见 §7 登记表）；源代码仍零复制（规则思路按 §3 登记独立重写）。

## 1. 来源性质

### 1.1 根目录说明

来源根的 `README.md` 说明，该目录包含：

- 4,839 个拆分、beautify 并做语法校验的 JavaScript 文件。
- 4,391 个 loading bundle 模块。
- 208 个远程功能 bundle 的代码与素材。
- 按依赖关系推算重建的目录，以及以 `_r/` 表示的未知祖先层级。
- 微信小游戏平台插件和运行时依赖。

它同时明确列出变量混淆、目录推算和缺少平台运行时等限制，并将自身定位为“静态可读档案”，不是可运行、可编译的原始工程。

因此本项目的迁移定义是：阅读该档案以理解规则、数据结构和交互分层，然后按本项目的 TypeScript、Cocos Creator 3.8.8、FairyGUI、Colyseus 和服务端权威模型独立实现。不得把旧 bundle 当作 npm 依赖、源码子模块或 Cocos 3 可直接导入工程。

### 1.2 横版事实

以下两个源文件均能证明参考版本按横版构建：

| 文件 | 审计结论 | Snake Off 处理 |
| --- | --- | --- |
| `/Users/kimi/work/tanchishe/wegameVersion/app-config.json` | 平台配置为 landscape | 不复用方向/尺寸 |
| `/Users/kimi/work/tanchishe/wegameVersion/game/src/settings.js` | 构建设置为横版 | 全部页面按 750×1624 重排 |

所以“竖版”是本项目的新设计，不是从源布局直接迁移。

## 2. 借鉴状态词典

| 状态 | 含义 | 是否已进入本仓 |
| --- | --- | --- |
| 规则参考 | 阅读行为与数据结构，按本项目契约重新实现 | 否；仅进入策划 |
| 交互参考 | 阅读页面层级、提示和控制方式，重新做竖版 UI | 否；仅进入策划 |
| 候选素材 | 已定位原始像素文件，但权利/授权尚未确认 | 否 |
| 明确不复用 | 平台、协议、旧引擎元数据、品牌或不符合目标规则 | 否，且禁止引入 |
| 已直接复用 | 有授权、hash、源/目标和转换记录的实际文件 | 当前没有 |

本文的“借鉴”不代表版权许可、官方合作、代码兼容或资产可发布。

## 3. 代码借鉴登记

以下表格中的路径均已在来源目录中核实存在。

### 3.1 房间号、创建和加入

| 来源文件 | 借鉴什么 | 不借鉴什么 | 目标重写落点 | 状态 |
| --- | --- | --- | --- | --- |
| `subpackages/loading/bundle/_r/prefab/multiUgc/Store/MultiUgcStore.js` | `room_no` 搜索、创建/加入包装、房满/解散提示、分享 query 携带 roomNo 的信息流 | `/share/skin_ugc/multi_ugc_search` 私有 HTTP、平台分享、五人 roomLimit | shared core Room RPC + `InviteCodeLease` + `PrivateRoomLobby` | 交互/职责参考 |
| `subpackages/loading/bundle/_r/prefab/multiUgc/Store/MultiUgcGameStore.js` | create/join/leave 后 room info 与恢复态的分层 | 源全局 Store、平台账号、原恢复协议 | 通用 launch target/capability 与 GameRoom state fragment | 规则参考 |
| `subpackages/loading/bundle/_r/gameplay/service/LockStep/network/UgcSocketProxy.js` | create/join/leave/recover 请求职责分离 | 私有 socket、relay、protobuf 和服务器接口 | Lobby RPC + Colyseus joinById | 只参考职责 |
| `subpackages/loading/bundle/_r/prefab/multiUgc/VM/MultiUGCHomeAlertVM.js` | 创建、快速加入、输入房号、错误提示的页面层级 | 输入变化即调用私有搜索、横版布局；最大 8 位由 Prefab metadata 约束 | `PrivateRoomLobbyLogic` / `PrivateRoomLobbyView` | 交互参考 |
| `subpackages/loading/bundle/_r/prefab/multiUgc/VM/MultiUGCJoinAlertVM.js` | 房主标记、成员槽位、加入前确认 | `for (... < 5)` 的五槽行为、皮肤选择 | `OwnerReady` fragment + 四席位 PrivateRoomLobby | 交互参考 |
| `subpackages/loading/bundle/_r/prefab/multiUgc/VM/MultiUGCCreateRoomAlertVM.js` | 创建后邀请/分享的反馈路径 | 创建后直接开局、平台分享、主题/票券 | 创建成功后展示六位码 | 交互参考 |
| `subpackages/loading/bundle/_r/teamgame/TeamServerHelper.js` | 旧实现中的邀请接受、房主/开赛边界和恢复思路 | 它按 invite_uid 组队，不是数字码；不作为主方案 | 只用于异常清单对照 | 次级参考 |
| `subpackages/loading/bundle/_r/teamgame/OnlineInviteHelper.js` | 在线邀请状态与失败分支 | 平台好友/账号依赖 | 首版不落地 | 次级参考 |

重要差异：

- 源 UGC 分享数据多处写 `roomLimit="5"`，Join VM 也渲染五个槽位；本项目固定最多四人。
- 源 `MultiUGCHomeAlert` 的 EditBox 序列化为 numeric、`maxLength=8`；本项目是恰好六位字符串并保留前导零。
- 源 `NetworkService.sendReady()` 表示进入 relay 后的网络就绪，不是玩家点击的 Ready。Snake Off 的
  `OwnerReady.player.ready` + 房主 Start 是本项目新增房规。

### 3.2 蛇身体、移动与数值

| 来源文件 | 借鉴什么 | 不借鉴什么 | 目标重写落点 | 状态 |
| --- | --- | --- | --- | --- |
| `subpackages/loading/bundle/_r/gameplay/unitComponent/snake/SnakeBodyComponent.js` | CircularDeque 身体点、头进尾出、长度到点数、宽度、snapshot batch | 10,000 默认容量、Cocos Component、全局服务定位器 | `SnakeBodyDeque.ts` + SnakeWorld snapshot | 规则参考 |
| `subpackages/loading/bundle/_r/meta/DataStructure/CircularDeque.js` | 环形双端队列接口与复用思路 | 直接复制实现 | 新增有界、带单测的 TypeScript deque | 数据结构参考 |
| `subpackages/loading/bundle/_r/gameplay/unit/snake/SnakeUnit.js` | 目标角限速转向、普通/加速、长度消耗和掉落、死亡/复活状态 | Cocos 节点、AI/道具/皮肤分支、源全局 Store | `SnakeSimulation.ts`、Snake runtime | 规则参考 |
| `subpackages/loading/bundle/_r/utils/FixedMathUtil.js` | 0.001 量化与集中数值口径 | 源 PI/工具类原样复制 | shared/服务端量化纯函数 | 数值思想参考 |
| `subpackages/loading/bundle/_r/config/GameConstant.js` | 地图、点距、速度、转角、碰撞因子、食物和掉落的调参维度 | 将源默认值直接当目标定表 | `snake-ruleset@1` 的调参输入 | 参数参考 |
| `subpackages/loading/bundle/_r/gameplay/definition/fight/GameData.js` | 对局对象按蛇/食物/输入聚合的领域划分 | 源类层次和平台字段 | SnakeWorld 领域模型 | 结构参考 |
| `subpackages/loading/bundle/_r/gameplay/definition/fight/SnakePointData.js` | 路径点位置/方向的最小数据 | snapshot 序列化布局原样复制 | 量化路径点接口 | 结构参考 |

`GameConstant.js` 中核实的参考默认值包括：地图 3264×1920、最小长度 30、每逻辑步移动 4.5、每步 2 个点、点距 2.25、转角 10°、普通/加速倍率 1/2、身体宽 36、Dot/Star 数量 300/15、普通/星食物价值 1/10、边界/蛇碰撞/吃食因子 0.4/0.5/1.6。它们受运行时配置覆盖，并服务于横版大地图，不能直接成为 700×1500 四人竖版的最终值。

### 3.3 食物、掉落与碰撞

| 来源文件 | 借鉴什么 | 关键差异 | 目标重写落点 | 状态 |
| --- | --- | --- | --- | --- |
| `subpackages/loading/bundle/_r/gameplay/service/MeshService.js` | 空间网格和邻格 broad-phase | 旧对象/服务依赖 | `SnakeCollision.ts` 空间索引 | 规则参考 |
| `subpackages/loading/bundle/_r/gameplay/service/CollisionService.js` | 3×3 邻格候选、墙/蛇身/食物/掉落检查顺序 | 现代 MultiUGC 的蛇碰撞条件含“任一方是 AI”，不等于四真人互撞 | 明确的新 PvP 碰撞规则 | 规则参考，行为不照搬 |
| `subpackages/loading/bundle/_r/gameplay/service/FoodService.js` | Dot/Star 初始化、随机位置、死亡和 snapshot 批次 | 源数量、全局服务、平台配置 | `SnakeFood.ts` | 规则参考 |
| `subpackages/loading/bundle/_r/gameplay/unit/FoodUnit.js` | 食物类型、位置与生命周期字段 | Cocos Unit 与表现绑定 | 纯 runtime food record | 结构参考 |
| `subpackages/loading/bundle/_r/gameplay/service/WreckService.js` | 加速/死亡掉落的集合管理 | 源全局池和特效依赖 | 有界 wreck 集合 | 规则参考 |
| `subpackages/loading/bundle/_r/gameplay/unit/WreckUnit.js` | 掉落价值与拾取对象划分 | 旧 Cocos Unit | 纯 runtime wreck record | 结构参考 |

### 3.4 输入、帧同步与恢复

| 来源文件 | 借鉴什么 | 不借鉴什么 | 目标重写落点 | 状态 |
| --- | --- | --- | --- | --- |
| `subpackages/loading/bundle/_r/gameplay/definition/fight/LockStepData.js` | 方向 + boost 是输入；9 bit direction、bit9 boost、bit10 direction-present 的紧凑思路 | 源位布局作为首版 wire | 可读 exact `ISnakeInputReq` | 字段思想参考 |
| `subpackages/loading/bundle/_r/gameplay/state/multiUgc/LockStepMainLoop.js` | 20Hz action / 60Hz logic、顺序 buffer、缺帧历史和追帧 | 客户端作为模拟权威、源追帧算法直接复用 | 服务端 20Hz；客户端仅 snapshot buffer/interpolation | 时序参考 |
| `subpackages/loading/bundle/_r/gameplay/service/LockStep/LockStepInputService.js` | 输入采集、按帧应用、join/exit/new_owner 事件划分 | 源 relay frame ownership | GameRoom C2S + mode roster hooks | 职责参考 |
| `subpackages/loading/bundle/_r/gameplay/service/LockStep/NetworkService.js` | ack、历史帧、snapshot、checksum、重连恢复需要成套设计 | 私有 relay/protobuf、弱 checksum、源 socket | Colyseus state + 有界 S2C snapshot | 只参考恢复需求 |
| `subpackages/loading/bundle/_r/gameplay/service/LockStep/SnapshotService.js` | 完整快照、分批编码和恢复边界 | 源序列化格式和全局服务 | SnakeWorld snapshot/restore | 规则参考 |
| `subpackages/loading/bundle/_r/gameplay/ui/FightControl.js` | 左侧连续方向、右侧按住加速、多点操作 | 横版坐标、旧 Cocos input | 竖版 `SnakeWorldView` | 交互参考 |
| `subpackages/loading/bundle/_r/gameplay/strategy/gameModeStrategy/MultiUgcModeStrategy.js` | 限时计分、复活等玩法分支作为产品选项 | 自动继承全部规则 | SNAKE-OPEN-02/03 的候选依据 | 产品参考 |

源快照大约每 1,800 逻辑帧有相关触发，checksum 只覆盖有限统计字段；本项目不复制其周期或 checksum 口径。服务端权威模式需要更频繁、严格有界的展示快照和独立确定性测试。

### 3.5 旧 TeamGame 补充参考

这些旧模块只用于理解确定性更新顺序和本地表现，优先级低于现代 gameplay 模块：

| 来源文件 | 可参考内容 | 明确边界 |
| --- | --- | --- |
| `subpackages/loading/bundle/_r/scene/TeamGame.js` | action→空间点→蛇/食物→碰撞→checksum→render 的固定顺序 | 不复用场景和平台 socket |
| `subpackages/loading/bundle/_r/teamgame/snake/TeamSnake.js` | 身体推进、成长、加速、死亡、本地预测 | 不复用 GL node/Cocos 2 代码 |
| `subpackages/loading/bundle/_r/teamgame/snake/TeamSnakeManager.js` | seeded spawn、动作解包、排名/总分 | 不复用全局 manager |
| `subpackages/loading/bundle/_r/teamgame/utils/TeamCollisionUtil.js` | 网格邻域、墙/蛇/食物碰撞 | 同队免碰等规则不自动继承 |
| `subpackages/loading/bundle/_r/teamgame/food/TeamFoodManager.js` | seeded Dot/Star 生成 | 源数量和资源不继承 |
| `subpackages/loading/bundle/_r/teamgame/TeamWechatHelper.js` | 0.05s turn、ack、帧排序与缺口检测 | WebSocket/UDP/微信能力明确不复用 |

## 4. 素材借鉴登记

### 4.1 登记原则

以下文件已经定位到 catalog 逻辑名、旧 bundle metadata 和 native PNG。

> 更新（2026-09-02）：§7 登记表中的 31 项已按用户授权实际引入（状态「已引入，待验收」），本节约束仅适用于尚未登记的其余素材。

如果权利无法确认，使用 [07](07-art-direction.md) 定义的原创资源替代。即使获准，也只导入实际像素文件并在 Cocos 3.8.8/FairyGUI 重新建立切片、atlas、UUID 和 `.meta`，不复制旧 import/native 元数据关系。

### 4.2 操控素材

共同 catalog：

```text
/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/game/config.json
```

SpriteFrame metadata pack：

```text
/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/game/import/0e/0e9863ad5.json
```

| Catalog 逻辑名 | Native PNG | 尺寸 | 借鉴用途 | 当前状态 |
| --- | --- | ---: | --- | --- |
| `texture/control/game_direction` | `remoteBundles/game/native/28/2852e460-aa25-409d-93d7-111d50c8207f.png` | 328×328 | 摇杆底的信息层级/触摸形态 | 视觉参考，未引入 |
| `texture/control/game_speedup` | `remoteBundles/game/native/a4/a4afd5f1-bb15-4e8c-b16b-44b1d52b1bd8.png` | 324×324 | 加速按钮位置与按住语义 | 视觉参考，未引入 |
| `texture/control/game_direction_oval` | `remoteBundles/game/native/fd/fda24ea2-dd4c-4fa9-8e2c-ebc9edf105a8.png` | 132×132 | 摇杆帽/方向指示形态 | 视觉参考，未引入 |

目标是重新绘制 `snake_control_joystick_base/knob/boost`，不是改名复制。

### 4.3 房间 UI 素材与 Prefab

共同 catalog：

```text
/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/snakeParadiseUGC/config.json
```

#### Prefab/import 审计

| Catalog 逻辑名 | 旧 import 文件 | 审计到的内容 | 目标处理 |
| --- | --- | --- | --- |
| `prefab/multiugc/MultiUGCHomeAlert` | `remoteBundles/snakeParadiseUGC/import/0d/0df652171.json` | 创建/加入/输入房号；EditBox numeric、maxLength=8 | 只参考层级，重做六位竖版 FGUI |
| `prefab/multiugc/MultiUGCJoinAlert` | `remoteBundles/snakeParadiseUGC/import/0f/0f53550ee.json` | 房主和五个成员槽 | 重做四席位 Waiting |
| `prefab/multiugc/MultiUGCCreateRoomAlert` | `remoteBundles/snakeParadiseUGC/import/0f/0f1345320.json` | 创建后邀请/分享 | 重做房间码和复制入口 |
| `prefab/multiugc/MultiUGCRoomItem` | `remoteBundles/snakeParadiseUGC/import/09/09e2602cb.json` | “房间号：”信息行 | 只参考信息层级 |

旧 import 文件是 Cocos 构建元数据，明确不直接复用。

#### Native 图片候选

| Catalog 逻辑名 | Native PNG | 尺寸 | 借鉴用途 | 当前状态 |
| --- | --- | ---: | --- | --- |
| `texture/home/createRoom` | `remoteBundles/snakeParadiseUGC/native/33/33ea6080-77ea-435d-bbb4-5016113fc408.png` | 126×126 | “创建房间”图标语义 | 视觉参考，未引入 |
| `texture/home/join_btn` | `remoteBundles/snakeParadiseUGC/native/8b/8b99b494-d808-4b6c-aba8-b088c93f073c.png` | 186×66 | “加入房间”按钮层级 | 视觉参考，未引入 |
| `texture/multiugc/roomOwnerTag` | `remoteBundles/snakeParadiseUGC/native/77/77e79e7c-a994-4cf8-a688-bdfffdbeef76.png` | 49×23 | 房主小标签语义 | 视觉参考，未引入 |

### 4.4 食物与蛇 atlas

共同 catalog：

```text
/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/gameClassic/config.json
```

| Catalog 逻辑名 | Metadata | Native PNG | 尺寸 | 当前状态 |
| --- | --- | --- | ---: | --- |
| `atlas/food` | `remoteBundles/gameClassic/import/01/01b444aa2.json` | `remoteBundles/gameClassic/native/0c/0c88437b-ad24-4e65-9524-ed3bdcc7afe2.png` | 216×72 | 形状/切片密度参考，未引入 |
| `atlas/snake1` | `remoteBundles/gameClassic/import/03/03bf96766.json` | `remoteBundles/gameClassic/native/38/3838e867-b693-4c7c-9833-a146ba682ee3.png` | 216×72 | 蛇头/身体最小 atlas 参考，未引入 |
| `atlas/classic_snake150007` | `remoteBundles/gameClassic/import/0e/0ee128670.json` | `remoteBundles/gameClassic/native/d2/d25f370d-d6de-4f9d-a32f-9e9b6151b1e7.png` | 216×72 | 皮肤变化参考，首版不做皮肤 |
| `atlas/classic_snake150008` | `remoteBundles/gameClassic/import/0a/0ac917060.json` | `remoteBundles/gameClassic/native/d2/d2e25824-1509-41cd-abf4-0390a671c761.png` | 216×72 | 皮肤变化参考，首版不做皮肤 |
| `atlas/classic_snake150001` | catalog index 62 | `remoteBundles/gameClassic/native/a1/a126f45c-a4ee-443e-ab55-a7c289e5c41f.png` | 216×72 | 去重 symlink 指向 snake1，不是独立第四套 |

这些 atlas 只证明“少量切片即可表达基础蛇/食物”。目标项目优先制作一套可着色原创蛇和原创 Dot/Star/Wreck，不复制具体皮肤。

### 4.5 审计过但明确不采用的背景

| Catalog 逻辑名 | Native PNG | 尺寸 | 结论 |
| --- | --- | ---: | --- |
| `texture/bg/bg1` | `remoteBundles/gameClassic/native/85/85ae0591-52e1-472c-9cfd-f8df01b0a92d.png` | 1624×750 | 横版背景；不旋转、不裁切复用，竖版场地重新设计 |

## 5. 明确不直接复用清单

### 5.1 网络与平台

- `subpackages/loading/bundle/_r/teamgame/proto/**`
- `subpackages/loading/bundle/_r/gameplay/service/LockStep/network/**`
- 微信/抖音 WebSocket、UDP、relay、protobuf 和平台插件。
- `subpackages/loading/bundle/_r/api/**` 下的私有服务接口。
- share query、好友、票券、广告、账号、皮肤和商城逻辑。

原因：这些属于原平台和私有后端契约，与本项目 Colyseus/shared 单源协议不兼容，也没有服务端实现或授权边界。

### 5.2 引擎构建产物

- `cc._RF` 注册包装。
- Cocos 2 GL node、Scene、Prefab build 描述。
- remote bundle 的 UUID、import/native index、旧 atlas metadata 和旧 `.meta` 关系。
- 旧全局 Store、Service Locator 和平台全局对象。

原因：目标是 Cocos Creator 3.8.8 + 纯 TypeScript Logic/View 分层，旧构建对象不能成为新工程真源。

### 5.3 产品规则

- 五人容量。
- 最大 8 位的 room_no 输入。
- 第二人/创建后直接开局。
- Playing 动态中途加入。
- AI 特例碰撞。
- 未经确认的复活、道具、主题和 UGC。
- 横版布局和地图比例。

原因：与用户已经确认的“最多四人、无需等满、全员 Ready、房主 Start、竖版”冲突。

## 6. 目标仓落点映射

| 借鉴主题 | 来源主文件/素材 | 目标模块 | 迁移方式 |
| --- | --- | --- | --- |
| 六位码创建/加入 | MultiUgcStore/HomeAlert | shared core Room RPC、InviteCodeLease、PrivateRoomLobby | 按 ticket/profile 新契约重写；位数/人数/服务端均重做 |
| 房主/席位 | JoinAlert VM + roomOwnerTag | OwnerReady/InviteRoom fragment + PrivateRoomLobby | 四席位、Ready、connected、房主 Start 原创设计 |
| 蛇身体 | SnakeBodyComponent/CircularDeque | SnakeBodyDeque/SnakeWorld | 有界纯 TS 实现 |
| 移动/加速 | SnakeUnit/FightControl | SnakeSimulation + SnakeWorldView | 服务端权威 + 竖版多点触控 |
| 食物/掉落 | FoodService/WreckService | SnakeFood | 新地图和上限下重新定表 |
| 碰撞 | MeshService/CollisionService | SnakeCollision | 明确四真人规则，稳定顺序 |
| 输入/恢复 | LockStepData/MainLoop/NetworkService | C2S SnakeInput + S2C snapshot | 不复刻私有锁步 wire |
| 摇杆/加速图 | game_direction/speedup | 原创 `snake_control_*` | 只参考交互语义 |
| 蛇/食物图 | gameClassic atlas | 原创可着色蛇与 food sprites | 只参考最小切片规模 |

## 7. 直接素材复用登记模板

后续每个实际复制的文件必须新增一行，所有字段缺一不可。2026-09-02 首批引入 31 项
（用户会话指令授权；`atlas/classic_snake150001` 与 `atlas/snake1` 字节相同——dedupe 符号链接——不重复引入）：

| 源绝对路径 | Catalog 逻辑名 | SHA-256 | 权利/许可证证据 | 批准日期/负责人 | 目标路径 | 转换/重绘说明 | 新 `.meta` | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/game/native/28/2852e460-aa25-409d-93d7-111d50c8207f.png` | `texture/control/game_direction` | `7c83f5033dbe6705834d1161a0675322df06a00e12b16d1ddeeff074690c0b9a` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_control_joystick_base.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/game/native/a4/a4afd5f1-bb15-4e8c-b16b-44b1d52b1bd8.png` | `texture/control/game_speedup` | `4d228fc30b1778ae89e667ad0a69a4f21bac291173c852c4e733fb8945d26576` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_control_boost.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/game/native/fd/fda24ea2-dd4c-4fa9-8e2c-ebc9edf105a8.png` | `texture/control/game_direction_oval` | `8f671efc2eeabb3418ec7ab2606ef6518a97a80c65fd948e8e577d52fed0e26b` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_control_joystick_knob.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/gameClassic/native/38/3838e867-b693-4c7c-9833-a146ba682ee3.png` | `atlas/snake1` | `cde58013d1868e9b6e122cd35558c766c6a7c71d68ea759c470ab14629fdf3b7` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_classic_1.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/gameClassic/native/d2/d25f370d-d6de-4f9d-a32f-9e9b6151b1e7.png` | `atlas/classic_snake150007` | `76f2b63a9f746f6a791e51f2c2ce36c30ced0fca5e2f993aafc59baf1f3e3c9f` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_classic_2.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/gameClassic/native/d2/d2e25824-1509-41cd-abf4-0390a671c761.png` | `atlas/classic_snake150008` | `68b0ac8b527f3ec8c551739dc3972429091139203eafec7e6b5dac5048a8f32a` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_classic_3.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/internalSkins/native/4e/4e50d45b-da2a-44b2-b03d-0213b2525c83.png` | `internalSkins skin id=1` | `0a5ccf9e5b838353d674b8b8225ae556ed7d5a705acb6094d93f748448829aab` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_01.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/internalSkins/native/94/9444d0fe-5a5b-49a0-92e5-63371e113dee.png` | `internalSkins skin id=2` | `ab289b3cb4e105cd8b757da2428a1c6e722e02f569be27e94f5a8dbb57576bf9` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_02.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/internalSkins/native/cd/cde2f284-0c19-475c-be40-d6f5effceeae.png` | `internalSkins skin id=4` | `be275750f2fa11548e97ef390c3afe527e690cfe6ef03ec37bfdf012f2822718` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_04.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/internalSkins/native/eb/eba7f350-2372-44f2-bedf-7c7e58c2b0df.png` | `internalSkins skin id=10` | `d1b0ac5c76c451f749af93ac28d911d4f0ccfcab9dd18d013280c7a366602f7e` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_10.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/internalSkins/native/c6/c6b650b1-3a1b-411c-b669-ab954ce39ec1.png` | `internalSkins skin id=11` | `49fe36223cf02e6d31f3a5be8b19c787a0f12310a5a6f6c91d93cbe24c0a81bf` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_11.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/internalSkins/native/0b/0b656626-a645-44a7-93d0-4693e3de0752.png` | `internalSkins skin id=133` | `ca79e87ef9fe4d26e49011fdf4985d5ec41619a2c857d2e8d3d6e6fe5f267397` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_133.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/internalSkins/native/b5/b5af9822-d47b-4be5-a586-1640cd18e117.png` | `internalSkins skin id=139` | `87fd6ed02f2f3ef7b730802e0dd4e447e6f69ac689779934df84ea0254805578` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_139.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/internalSkins/native/80/8064c44e-b475-43dd-a5be-7a6b60a8d947.png` | `internalSkins skin id=401` | `a5d2fe784ce17ce7bb63aea04a5a98a0119a11fa274b7f8fc3da6803219dd991` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_401.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/internalSkins/native/10/10103e1e-6a50-4066-946f-db737489e951.png` | `internalSkins skin id=701` | `e7519f28b0fa5da9220ccd933a1a6203cd62a58fb55a5ff42d1282b4c42731ee` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_skin_ai.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/gameClassic/native/0c/0c88437b-ad24-4e65-9524-ed3bdcc7afe2.png` | `atlas/food` | `6f17cac75d4b33bef3ebe6029b2fe76bb9ed0d22112dcb26a667d4e2c5e32e67` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_food_classic.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/atlas/native/97/979c0e19-9df3-4990-817d-10edb06ee05c.png` | `atlas/foods` | `36d444e74894ac6f9592e07a98551dd28937bcd33a0fb1a0a36def79d2f87571` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_foods.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/atlas/native/5d/5dbc7df2-bb0c-428c-a3b6-d69c30c2aba4.png` | `atlas/foods_new` | `66db78f30a3b0fcc17f2d0913f2dd782377b3cb904ef9206b47f54dc9c58a4b0` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_foods_new.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/atlas/native/86/86fac1f5-f65e-4b15-abed-56ac768f9847.png` | `atlas/candy` | `dba789dfadfaade178b6d154262185d4dde73bf381078b2df83f209d7f4e6680` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_candy.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/atlas/native/67/67069467-2aa8-4d48-b05e-b6baa743e0f4.png` | `atlas/snake_extras` | `01c89919e26b4aeea08c5381b26f098aa18ffc4661896c6f7d9d7abd334b9288` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_extras.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/gameClassic/native/43/43bd6cef-1ea5-49a8-9ee6-35fe332b39c6.png` | `texture/map/block1` | `3e05de6038c643c725ba59782d024959e949f89bf8087b51f3db310bf4703ede` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_wall_block_1.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/gameClassic/native/ae/aed7b327-a69a-4b9c-a8e3-310bf6cd5cf1.png` | `texture/map/block2` | `e02ebb01563ab418947b86f131bcb50598bd2446687f51ab022c0b5110ceeaf1` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_wall_block_2.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/gameClassic/native/20/200eb2a9-43ec-4754-8291-4dece1ad3fdd.png` | `gameover/bg` | `ae936766d42ce5502a2f2828abf9768763ce9da60418834f17ba5a345f4cbcca` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_result_bg.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/common/native/a1/a1c41e72-866c-4e22-bd11-d6021aaff681.png` | `texture/btn/btnBlue_368_110` | `42ad40c840b88c2112e084167849e8e587403837c038da661264660710ed8d2b` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_btn_blue.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/common/native/9d/9dc6ee1c-ce81-4634-ada2-84a9eb001f20.png` | `texture/btn/btnYellow_368_110` | `309ac364d7f62d2cbf90cfcc3fb4f687be23f7fa84b74cce5cad53ace5f8b516` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_btn_yellow.png` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/audio/native/88/88c98762-8c62-4dd6-a0c0-237a778cc8b6.mp3` | `audio/eat_food` | `33a86d8e738ea9120d1abd09c1b6234c83e972b09e071c4ecbcd05ba0e575822` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_sfx_eat_food.mp3` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/audio/native/fa/fa4e17a1-8c3e-4340-922d-50fcf4dfa538.mp3` | `audio/eat_wreck` | `b556777b04899444bfee3a68a9829fa646fc46f772b34abad8f19612dc867ea6` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_sfx_eat_wreck.mp3` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/audio/native/45/454df9b6-56c4-43c8-9dfe-8adfc4ecdf43.mp3` | `audio/kill` | `41e06994f05a12898dd3dddfdbba11b9fdee783efe4d63c499349d2cfe09d3a0` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_sfx_kill.mp3` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/audio/native/d1/d1effd86-7e5e-4c82-bb88-9a27c2ca4e4b.mp3` | `audio/time_over` | `e687e745fe6d93925eea349ef67857da780379bd086c37f27186b91a3e301a8f` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_sfx_time_over.mp3` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/audio/native/3b/3b1fa3f8-94a9-4b68-9bae-9c91c58c0914.mp3` | `audio/end` | `e7efb684164c4bd63db627eb03131fa743b3e55ce75daa6bce30450788c9406c` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_sfx_end.mp3` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |
| `/Users/kimi/work/tanchishe/wegameVersion/remoteBundles/audio/native/c2/c280b506-d28c-4947-8f4b-d8b6f490f5ca.mp3` | `audio/button_click` | `00428dcf5dc443a71e4ef0df3f70f886bba5da81194f12be97fa738dfa070dcf` | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 | 2026-09-02 / KimiChen | `apps/Cocos/assets/resources/snakeoff/snake_sfx_button.mp3` | 原样复制 native 像素源 + 重命名 `snake_*`；未复制旧 import/UUID/.meta；.meta 按 Creator 3.8 格式合成（uuid 已入库，待 Creator 打开确认） | 合成（见左） | 已引入，待验收 |


合法状态只允许：

- `待授权，不得引入`
- `已授权，待转换`
- `已引入，待验收`
- `已验收`
- `已移除`

“网上可见”“同一台机器上存在”“旧项目能运行”都不是授权证据。

## 8. 源代码借鉴记录模板

若实现阶段进一步阅读未列出的源文件，应先补台账：

| 源文件 | 阅读目的 | 提取的行为/公式 | 舍弃的依赖 | 目标测试向量 | 目标实现文件 | 评审结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 待新增 |  |  |  |  |  |  |

目标提交中不得出现：

- 大段与 beautify JS 结构/命名一致的复制代码。
- `window.__H`、`window.__require`、`cc._RF` 等源包装。
- 指向 `/Users/kimi/work/tanchishe/wegameVersion` 的运行时 import、软链接或资源 URL。
- 未登记的源 UUID 和 native 哈希文件名。

## 9. 实施前来源检查清单

- [ ] 规则实现引用的源文件都在 §3 登记。
- [ ] 目标规则与源行为不同处有显式测试，而不是隐式猜测。
- [ ] 6 位、4 人、Ready + 房主 Start、竖版没有被源最大 8 位/5 人/横版覆盖。
- [ ] 所有目标 TypeScript 是按本项目接口重新设计。
- [ ] 私有 relay/protobuf/平台 API 没有进入 shared/server/client。
- [ ] 所有美术默认按原创方案制作。
- [ ] 如有直接素材，每项都有授权、SHA-256、目标路径和转换记录。
- [ ] Cocos 3.8.8 重新导入并生成新 `.meta`，不复制旧 import metadata。
- [ ] 参考目录保持只读，不进入 git submodule、package dependency 或同步脚本。

## 10. 当前审计结论

截至 2026-08-31：

- 已确认借鉴根目录为 `/Users/kimi/work/tanchishe/wegameVersion`。
- 已定位房间号、蛇身体、移动、碰撞、食物、输入、快照和控制相关代码文件。
- 已定位操控、房间 UI、食物/蛇 atlas 和横版背景的 catalog/native 对应。
- 已确认源为横版、房号输入上限 8、UGC 房间显示 5 席位。
- 已确认参考真人碰撞分支存在 AI 条件，不能自动当成四真人规则。
- 已确认文档编写期间没有向本仓复制源代码或素材。
- 所有源素材的权利/许可状态仍未确认，因此只能作为视觉候选或审计证据。

---

> [返回总目录](README.md) · [上一篇：竖版美术方向](07-art-direction.md)
