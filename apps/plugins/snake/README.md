# Snake（贪吃蛇）玩法

> **归并声明（2026-09-06）**：本文件是贪吃蛇玩法的唯一文档，由原 `docs/s/`（8 篇阶段文档 +
> 证据 README）与 `docs/snakeoff/`（9 篇开房玩法提案）共 20 篇归并而成。原目录、
> `docs/s/evidence/`、`plan-s.md` 与 `tools/snake-s1-assets/` 均已删除。
> ⚠ 归并造成了**不可逆的能力损失**，逐条列在 §9，动手改皮肤目录前先读那一节。

---

## 1. 现状速览

已实现并可试玩的是 **竖版新版无尽 V2 + 外观养成 demo**：4096² 竖版战场、原作 `totalTime=0`
无尽生命周期、drop-in 自由加入 + AI 填充、真人死亡限时金币复活、16 套原作皮肤的衣柜与装备、
个人 run 结算与养成奖励。当前代码基线 `snake@5`（S4 因 `wire.ts` 改动从 4 bump 到 5）。

⛔ **这是 demo，不是可放行的生产功能**：衣柜与养成先更新进程内存，再 best-effort 镜像到
同一个 Redis HASH；run 去重与最近结果只在内存，进程重启即丢。发布开关
`onlineCoinRelive5V1` 保持关闭，`eligibleForEnable=false`。任何阶段都不产生生产金币或
养成资产的技术放行资格。

⛔ **已废弃**：原 `docs/snakeoff/` 描述的「Snake Off 开房玩法」（六位邀请码私房、最多四名真人、
房主 Ready/Start、无 AI）是一份**从未实施的提案**，已随本次归并废弃。它的 SNAKE-OPEN-01～08
八个未拍板项一并作废。⚠ 只有它的**素材授权台账**仍然有效，见 §2——那批素材现在还在跑。

---

## 2. 授权与素材来源台账（法务 load-bearing，⛔ 不得删改）

### 2.1 授权证据

| 项 | 值 |
|---|---|
| 借鉴源 | `/Users/kimi/work/tanchishe/wegameVersion`（WeGame 版原作） |
| 冻结来源 commit | `6367f65bf210d75ba39c0e48ecace5b30b538a06` |
| 授权证据（唯一） | 用户会话指令（2026-09-02，项目与源游戏权利方）：「所有素材可采用源游戏的素材」 |
| 批准日期 / 负责人 | 2026-09-02 / KimiChen |
| 台账日期 | 2026-09-03 |
| 首批引入 | 31 项素材，状态「已引入，待验收」 |

⛔ 「网上可见」「同一台机器上存在」「旧项目能运行」**都不是授权证据**。
⚠ 「借鉴」不代表版权许可、官方合作、代码兼容或资产可发布。

### 2.2 引入范围与状态词典

借鉴状态五值：规则参考 / 交互参考 / 候选素材 / 明确不复用 / 已直接复用。
复用登记合法状态只允许：`待授权，不得引入`、`已授权，待转换`、`已引入，待验收`、`已验收`、`已移除`。

⛔ 每个实际复制的文件必须登记九个字段，缺一不可：源绝对路径 / Catalog 逻辑名 / SHA-256 /
权利许可证证据 / 批准日期与负责人 / 目标路径 / 转换重绘说明 / 新 `.meta` / 状态。

⛔ 即使获准也**只导入实际像素文件**，在 Cocos 3.8.8 / FairyGUI 重新建立切片、atlas、UUID 与
`.meta`，⛔ 不复制旧 import / native 元数据关系。
⚠ `atlas/classic_snake150001` 与 `atlas/snake1` 字节相同（dedupe 符号链接），不重复引入。
⚠ `texture/bg/bg1`（1624×750）审计后**明确不采用**：不旋转、不裁切复用。

当前落地的运行时素材在 `apps/Cocos/assets/resources/snakeoff/`（63 个文件 + 同名 `.meta`）：
16 套皮肤图集、16 张确定性生成的预览图、7 张磁铁/光环纹理、食物图集、摇杆/加速/结算底板、8 个音效。

### 2.3 明确不复用清单

⛔ **网络与平台**：`_r/teamgame/proto/**`、`_r/gameplay/service/LockStep/network/**`、
微信/抖音 WebSocket/UDP/relay/protobuf 与平台插件、`_r/api/**` 私有服务接口、
share query / 好友 / 票券 / 广告 / 账号 / 皮肤 / 商城逻辑。

⛔ **引擎构建产物**：`cc._RF` 注册包装、Cocos 2 GL node/Scene/Prefab build 描述、
remote bundle 的 UUID/import/native index/旧 atlas metadata/旧 `.meta` 关系、
旧全局 Store 与 Service Locator。

⛔ **目标提交中不得出现**：大段与 beautify JS 结构/命名一致的复制代码；`window.__H`、
`window.__require`、`cc._RF` 等源包装；指向借鉴源的运行时 import、软链接或资源 URL；
未登记的源 UUID 与 native 哈希文件名。

⛔ 参考目录保持只读，不进入 git submodule、package dependency 或同步脚本。

### 2.4 审计结论（2026-09-03）

没有复制旧项目源码、`.meta`、UUID、import cache、私有网络或平台实现；四个源 JS 仅用于
行为/公式取证，目标 TypeScript 独立实现；新资源 `.meta` 全部由目标仓生成。

⚠ **横版事实取证**：`app-config.json`（平台配置 landscape）与 `game/src/settings.js`
（构建设置横版）证明参考版本按横版构建——「竖版」是本项目的新设计，不是复刻。

⚠ **迁移定义**：阅读该静态可读档案理解规则/数据结构/交互分层，然后按本项目 TypeScript、
Cocos Creator 3.8.8、FairyGUI、Colyseus 与服务端权威模型**独立实现**。

⚠ 若日后进一步阅读未登记的源文件，应先补台账：源文件 / 阅读目的 / 提取的行为公式 /
舍弃的依赖 / 目标测试向量 / 目标实现文件 / 评审结论。

---

## 3. 文件清单

登记单元
```
apps/plugins/snake/plugin.json            本文件所在目录
apps/plugins/snakeCosmetic/plugin.json
```

契约真源 `apps/shared`
```
schema/gameplays/snake/manifest.json      codegen 输入（modeVersion 在此）
schema/gameplays/snake/state.json         codegen 输入
src/gameplays/snake/wire.ts               手写真源 ⚠ 进 contractDigest
src/gameplays/snake/ruleset.ts            规则常量
src/gameplays/snake/cosmetics.ts          外观公共类型
src/gameplays/snake/progression.ts        养成公式（纯函数）
src/gameplays/snake/snakeSkinCatalog.generated.ts    ⛔ 生成物，见 §9
src/gameplays/generated/state/snake.ts               ⛔ 生成物
src/protocol/lobbyRpc/domains/snakeCosmetic.ts       ⚠ 进协议指纹字节范围
```

服务端 `apps/server/src`
```
rooms/modes/snake/  index.ts world.ts rules.ts ai.ts lifecycle.ts keys.ts
                    cosmeticProfile.ts cosmeticRpc.ts runRewards.ts
                    skinBusinessCatalog.ts
                    skinBusinessCatalog.generated.ts    ⛔ 生成物，见 §9
rooms/schema/generated/snake.ts                        ⛔ 生成物
websocket/snakeCosmetic/  getSnapshot.ts equip.ts unlock.ts
```

客户端 `apps/client/src`
```
gameplay/modes/snake/index.ts
net/rooms/SnakeRoom.ts
logic/rooms/snake/  SnakeGameplay.ts SnakeHud.ts SnakeControls.ts
                    SnakeSnapshotBuffer.ts SnakePresentationCatalog.ts
                    SnakePresentationCatalog.generated.ts   ⛔ 生成物，见 §9
view/rooms/snake/   SnakeWorldView.ts + .view.json
                    SnakeMeshRenderer.ts SnakeFoodMeshRenderer.ts
                    SnakeMagnetAuraRenderer.ts snakeQuadMesh.ts
plugins/snakeCosmetic/  index.ts logic/{WardrobeLogic,snakeCosmeticRuntime}.ts
                        view/WardrobeView.ts + .view.json
```
⛔ `apps/client/src/shared/**` 与 `apps/Cocos/assets/src/**` 是镜像生成物，禁手改。

测试
```
apps/client/test/  snakeGameplay / snakePresentation / snakeSkinCatalog .test.ts
apps/server/test/  snake-world snake-room snake-rules snake-cosmetic-profile
                   snake-progression snake-run-rewards snake-relive-demo .test.ts
                   int/snake.test.ts  int/snake-relive-demo.test.ts   ⚠ 真栈，有意留在 verify:all 链外
                   wire-vectors/snake.ts  lobbyRpcVectors/snakeCosmetic.ts
```

其它
```
tools/snake-s0-replication/       S0 复刻基线生成器 ⚠ 其输出目录已随本次归并删除，--check 会失败
apps/Cocos/assets/resources/snakeoff/   63 个运行时素材（见 §2.2）
```

---

## 4. 冻结目标与不做清单

### 4.1 目标组合

唯一目标 `newEndlessPortraitV2Map4096TotalTime0`，五个冻结层 ID：
`newEndlessPortraitV2Map4096` / `sourceEndlessTotalTime0` / `sourceEndlessReliveFlow` /
`onlineCoinRelive5V1` / `onlineEndlessDropInV2`。

16 个 internal skin 稳定 ID 冻结为：**1, 2, 3, 4, 10, 11, 101, 111, 112, 132, 133, 139,
401, 403, 411, 701**。

### 4.2 ⛔ 不做清单

- 不改回横版；不用 `4096/4896` 对世界单位做整体缩放；不按屏幕宽高拉伸世界。
- 不移植原作私有网络协议、账号、支付、广告、分享、月卡、临时皮肤、动态 AB 或商业活动系统；
  不组合独立 TimeLimit 90 秒模式；不保留第 1800 tick 自动收局或隐藏超时兜底。
- 不允许客户端自报未经服务端验证的 `skinId`；不让皮肤改变速度、初始长度、转向、碰撞或得分。
- 不把 86 个假榜条目生成场内实体或纳入奖励；不把 AI 死亡残骸公式误作真人资产奖励。
- 不把 `totalTime=0` 解释为永不结算或永不回收：个人 run 和空房生命周期都必须闭环。
- 首发不做抽卡、随机重复皮肤、限时试用、付费皮肤、赛季、拖尾/击杀/死亡特效、名牌、
  表情或皮肤熟练度；数据槽可预留但没有实现和发布承诺。

---

## 5. 关键数值

### 5.1 世界与蛇

| 项 | 值 |
|---|---|
| 世界 | 4096 × 4096（源 V2 4896² 仅覆盖 map 字段） |
| 视觉格距 / 地图边距 / broadphase | 32 / 16 / `GRID_CELL=150` |
| 食物 | 1000 Dot + 30 Star = 1030；显示尺寸 16 / 42；Star 长度与分值各 +10 |
| 出生长度 / 最大长度 | 80 / 100000 |
| 蛇基础速度 | 160 unit/s（每 tick 8 unit @ 20 Hz）；加速 ×2 |
| 最大转向 | 9° / tick |
| 相机缩放 | 1.3 → 0.6 @ 长度 100000 |
| 身体缩放 | 1.0 → 2.8 @ 长度 100000；身体基础宽度 36 |
| 量化 | `q(x) = round(x*1000)/1000`；权威内部位置按 micro-unit 安全整数累加 |
| 活动蛇稳定态 | 17 条（最多 8 真人，AI 数 = 17 − 真人席位数） |
| 首人开局 AI | 16 条 K1 level 0：`401×8, 402×4, 403×2, 404×2`；第 2~8 位真人各替换一条 401 |
| 假榜 | 86 条；每秒刷新，2% 概率重置到 80，否则 +10..100；只下发 Top 10 与本人位置 |
| 容量上限 | 17 蛇 / 1030 食物 / 10 磁铁 / 单蛇 5186 点 / 全房理论 88162 点 |

路径点边界向量（蛇长度 → 逻辑路径点数）：`80→52` `300→200` `3000→960` `18900→1954`
`19200→1964` `20100→1990` `100000→5186`。
`point_step_config` 71 项：n=1..63 `{300n, n+2}`；重复端点 `{18900, 66}`（零宽区间，
⛔ 必须保留但不改变结果）；n=64..67 `{300n, n+3}`；尾部 `{100000,50} {200000,100} {300000,100}`；
`STEP_POINT_COUNT=2`。

### 5.2 生命周期与复活

`totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false`，无 `endTick`；
⚠ 只有 `hasDeadline && tick >= endTick` 才能按时结束。

复活状态机：`deadPresentation` 4 tick / 200 ms → 选择窗 100 tick / 5 秒 →
安全点搜索最多 20 tick → 保护 60 tick / 3 秒，半开区间 `[protectStartTick, +60)`。
五档金币 **100 / 200 / 300 / 300 / 300**，第六次死亡不发窗。
AI 约 40 tick（约 2 秒）独立重生；真人**无**自动复活。
首次出生保护 30 个活动 tick。

### 5.3 磁铁与 Star（不变量 11 / 12）

`toolId = 10001`。房间首次进入 Playing 后第 15、60、150 秒各无条件生成 10 个
（tick 300 / 1200 / 3000），之后从 tick 6000 起每 3000 tick 判定一次。
存在 400 tick（20 秒）；生效 160 tick（8 秒），重拾刷新为 `max(old, pickup+160)` ⛔ 不叠层；
同时存在上限 10。额外拾取范围 `2.4 × 36 = 86.4` 世界单位（作用于 Dot、Star 与两类残骸，
⛔ 不扩大磁铁自身的拾取范围）。

后续波次只接受状态为 `active / deadPresentation / reliveOffering / pendingRelive /
reliveSpawning / reliveCommitting / reliveReady` 且权威长度 `< 50000` 的真人 run
（49999 通过、50000 不通过）；排除 `preparing / cancelled / finalizing / final`。

Star 与磁铁共用确定性移动内核：权威速度 `320/3 unit/s`，20 Hz 下每 tick 标量位移 `16/3`；
milli/micro-unit 余数算法产生 `5.333 / 5.333 / 5.334` 循环，出生时余数为 0；
方向保持期取闭区间 `34..67 tick`，出生方向取 `[0,360)` 整数度；
⚠ draw order 严格「先方向、后保持期」。实体半径 Star = 21、磁铁 = 35。

⛔ **不变量 11**：磁铁不占操作槽；首发操作区只开放加速，默认右手显示 S4、左手镜像显示 S1，
其余物理槽隐藏且不命中；⛔ 不借磁铁开放主动道具入口。

### 5.4 操作区

设计单位 750 × 1624（原点左下）；`controlShiftY = max(0, safeBottom + 161 - 220)`。

| 槽 | 位置 | 直径 | 命中半径 |
|---|---|---|---|
| 摇杆 | (375, 220+shift) | 底盘 220 / 帽 92 | 155 |
| S1 左肩 | (130, 410+shift) | 88 | 56 |
| S2 左上 | (295, 490+shift) | 104 | 64 |
| S3 右上 | (455, 490+shift) | 104 | 64 |
| S4 右肩 | (620, 410+shift) | 144 | 88 |

本地偏好 key `snake.controls.handedness.v1`，默认 `right`，值域 `right|left`，
⚠ 只在设备本地持久化。

### 5.5 残骸与外观

AI 死亡残骸：`totalDeathWreckScore = pow(deadSnakeScore, 0.8) * 2`；
`perWreckScore = max(total / bodyCount, 3)`；⚠ cap 合并前后必须守恒总残骸分值。

自机使用**细白轮廓**（`identity.self.outline = "fine-white"`），AI 与他人使用**名字识别**
（`nameplate = "text"`、`outline = "none"`）。首发不显示正向游玩时长。

### 5.6 存储

逻辑 key `gp:snake:user:{uid}` = `kGameplay("snake","user",uid,{zone:"global"})`；
物理 key `<PROJECT_ID>_gp:snake:user:{uid}`；类型 HASH，无 TTL。
⛔ key 与数据均**不含 `sId`**，⛔ 不新增其他 Snake key。

字段：`coinBalance`（非负安全整数十进制字符串，初始演示余额 10000）、`equippedSkinId`、
`ownedSkinIds`（升序去重 JSON 数组）、`fragmentBalances`（四个固定 skinId 的 JSON 对象）、
`snakeXp`、`achievementProgress`。

新 uid 默认 profile：`version=0`、`equippedSkinId=1`、`ownedSkinIds=[1]`、
`fragmentBalances {133:0, 401:0, 403:0, 411:0}`；皮肤 1 始终视为拥有；
所有皮肤 `saleState:"off-sale"`。四款碎片皮肤 = **133 / 401 / 403 / 411**，
各自独立碎片余额，达门槛时精确扣除门槛并保留超额。

### 5.7 目录 hash

| 层 | 值 |
|---|---|
| public 皮肤身份 | `a1cdecbc…b075` |
| client 表现（`presentationVersion=2`） | `8615596a…d629` |
| server 业务（S3-01 从 `9ed3762e…fa19` 搬来） | `b851e345…9d2c` |

⚠ **不变量 8 的真实锚点**：跨端 hash 比对在双端都是**死判据**——
`resolveServerBattleSkin` 与 `resolveClientSnakeSkinPresentation` 的 hash 形参都有
「等于本进程常量」的默认值，全部生产调用点都不传该参，mismatch 分支不可达。
不变量 8 今后锚到两处活着的判据：① `SNAKE_SKIN_COSMETIC_WRITES_ENABLED` 运行期
fail-closed 发布开关；② 双端模块加载期的三层目录 fail-closed。

---

## 6. 架构不变量与硬约束

- ⛔ **服务端权威**：客户端只上传意图（`{dirX, dirY, boost, seq}`，exact keys），
  ⛔ 不上传坐标、蛇长、食物归属、碰撞结论、得分或赢家。
  拒绝 NaN/Infinity/越界/非整数 seq；`seq <= lastAcceptedSeq` 不改变状态。
- ⛔ **确定性**：相同 seed、初始成员与输入序列必须得到相同服务端结果；
  20 Hz fixed-step，⛔ 渲染帧率不得进入权威公式。
- ⛔ 每 tick 更新顺序固定 10 步，⛔ 不得重排。
- ⛔ 所有集合必须有显式上限，避免长局或恶意输入导致无界增长。
- ⛔ 禁止手改生成物：`apps/shared/src/gameplays/generated/`、
  `apps/server/src/rooms/schema/generated/`、`apps/client/src/gameplay/catalog.generated.ts`、
  `apps/shared/src/protocol/lobbyRpc/registry.generated.ts`、`apps/client/src/generated/`、
  `apps/client/src/shared/`、`apps/Cocos/assets/src/`。
- ⚠ **`wire.ts` 进 contractDigest**：`contractDigest = sha256(manifest.json ‖ \0 ‖
  state.json ‖ \0 ‖ wire.ts)`。动 `wire.ts` **一个字节**（哪怕只加可选字段、只改注释）
  都必须 bump `manifest.json` 的 `modeVersion`。「不进 digest」的注释只豁免
  `cosmetics.ts` / `ruleset.ts` 一类玩法自有模块。
- ⚠ **Lobby RPC 必须同批提交**：域 descriptor、向量 sidecar 与全部 handler 一次交付——
  端点文件集合与 `ALL_LOBBY_RPC_TYPES` 必须双向相等，缺一启动即 throw；
  codegen 缺 sidecar 直接 fail-fast。⛔ 分两批做，中间那批必红。
- ⚠ `walls[]` 与 `star.themeVariants` 是**有意不渲染**的台账与预留：边界渲染走 4px 描边，
  ⛔ 不做墙块平铺；`themeVariants` 是退化别名（light/dark 同帧），食物直接用 `star.frame`。
- ⚠ `skinIdAtRunStart` 只是语义名，源码里**没有**这个字段——schema 字段叫 `skinId`，
  `createPlayer` 时写入、run 期间不再变更。⛔ 不要按字面 grep 该名字找代码。

---

## 7. 三次拍板（2026-09-05）

**A｜外观经济写路径 = 服务端单方面权威。** `equip` / `unlock` 入参**只有 `skinId`**。
⛔ 不加 `catalogHash`，⛔ 不引入「客户端自报、服务端采信」的信任方向。
经已导出的接缝 `SnakeGameModeOptions.runSkinResolver` 注入 resolver，⛔ 不碰 `GameMode` / `GameRoom`。
⚠ 若日后要做部署代差自检，最省的加法是把目录 hash 挂到 `GET /version`，⛔ 不走 Lobby RPC 请求字段。

**B｜个人结果契约 = B2a + B0。** 新建 `resultVersion: 2` 的 interface，沿用同一 token 名
`s2c.snake.runResult`，⛔ 不新增并存 token（避免两套 interface / validator / 订阅长期分叉）。
排期上先用 v1 占位打通，形状稳定后一次性改 `wire.ts`、只付一次 `modeVersion` bump（4 → 5）。
⚠ 三个预留字段装不下 S4 的形状：`rewardSummary` 是 `{itemId, amount≥1}[]`，
而 S4 需要布尔 `qualified`、可为 null 的 `fragmentSkinId` 与十余个日常为 0 的整数；
`rewardPolicyVersion` / `rewardReceiptId` 全仓零消费者。

**C｜「再来一局」= ① 离房重进。** ⛔ 不新增房内重开能力。
⚠ 主动离房是 consented close，跳过 10 秒重连宽限，重进走 `createPlayer` → `++runCounter`
拿到新 `runId`，去重键 `uid + roomEpochId + runId` 保持有效；
宽限内的断线重连仍延续原 run。

---

## 8. 实施状态与真引擎缺陷台账

### 8.1 阶段状态

| 阶段 | 状态 | commit | 门禁 |
|---|---|---|---|
| S0 复刻基线与规则冻结 | 已完成 | `7a04131` | unit 10/10；SHA 54/54 |
| S1 素材与三层目录 | 已完成 | `d18846a` + `bc5bb97` | converter 13/13；client 380/380、server 489/489 |
| S2 竖版战场与无尽生命周期 | 已完成 | `04072d4` | `verify:all` exit 0；真栈 int 171/171 |
| S2R Demo 金币复活 | 已完成 | `0b19440` | `verify:all` exit 0；真栈 int 172/172 |
| S3 Demo 衣柜与装备 | 已完成 | — | `verify:all` exit 0（client 435/435、server 587/587） |
| S4 Demo 养成奖励 | 已完成 | — | `modeVersion` 4 → 5；去重键 `uid+roomEpochId+runId` + 单条六字段 HSET |
| S5 Demo 验收 | **进行中** | — | `verify:all` exit 0（client 437/437、server 609/609） |

**S5 剩余缺口**：16 套皮肤逐一装备验证、`safeBottom=0/100` 两组对比、真栈 int 未跑。
⛔ 不得据此宣称 demo 可放行。

### 8.2 Creator 3.8.8 真引擎缺陷台账（F1～F12）

⚠ 这些缺陷的共同特征是「写了属性但到不了 GPU，且不抛异常」——Node 桩与 `verify:all` 全绿
却在真引擎里坏掉。根因往往是**假件与 .d.ts 桩把不存在的引擎成员声明成存在的**。
⛔ 修同类问题时，重点是让假件与真引擎同形，而不是多加断言。

| # | 现象 | 根因 | 状态 |
|---|---|---|---|
| F1 | 11 个皮肤全报 `default-unavailable` + 无来源的 PromiseRejectionEvent | 向 `SpriteFrame.pivot` 赋值；该属性**只有 getter**，严格模式抛 TypeError，废掉整条 `loadAssets` 链 | 已修 |
| F2 | 蛇身/食物网格零渲染 | 只加了 `UIMeshRenderer`（它**没有** mesh/material，只是 UI 桥），缺同节点的 `MeshRenderer` | 已修 |
| F3 | `Can not update a static mesh.` | `utils.createMesh` 造静态网格，逐帧更新被拒；须用 `utils.MeshUtils.createDynamicMesh` | 已修 |
| F4 | `illegal property name: mainTexture.` | effect 名 `builtin-ui` **根本不存在**，材质零 pass；须用 `builtin-unlit` + 按名解析 `alpha-blend` 技法 | 已修 |
| F5 | 结算页标题与「返回主页」落在底板外；战斗 HUD 结算期仍可点 | 底板是固定 674×694 贴图，文字却按视口高度取比例 | 已修 |
| F6 | 复活提示文字压在蛇身上、按钮读不出 | 该层只有容器 + 三个 Label，**没有任何底**，而世界仍在逐帧渲染 | 已修 |
| F7 | 衣柜预览条溢出面板 79px、压住文字 120px | `sizeMode` 在赋 `spriteFrame` **之后**才设 CUSTOM；引擎已用 `frame.rect` 覆写尺寸且⛔ 不回滚 | 已修 |
| F8 | 结算页上重复弹出结束确认框 | run 已结束仍可点「结束本次」 | 已修 |
| F9 | `getComponent: Type must be non-nil`；`s2c.pong` 未登记 onMessage | 未定位 | **观察项** |
| F10 | 蛇身两侧白齿 | 几何画成「每段一个压扁四边形」；应为「每隔 `repeatedBodyPointDistance` 个路径点画一个按朝向旋转的整帧」，且**写入顺序必须尾→头** | 已修 |
| F11 | 同一条蛇身体与头有色差（实测 255→229、128→156） | `builtin-unlit` 走 `CCFragOutput`，缺省 ACES 色调映射叠加入口的 `SRGBToLinear` | 已修（场景 `toneMappingType` 置 LINEAR） |
| F12 | 蛇变短时残留上一帧四边形 | `updateSubMesh` ⛔ 不同步 InputAssembler，而 `gl.drawElements` 读的正是它 | 已修（每次上传后 `onGeometryChanged()`） |

⚠ **取证环境限制**：本仓位于 `/Volumes/KimData` 非启动卷，Creator 的资源监听**收不到该卷的
文件变更**——原子替换与浏览器硬重载实测均无效，**必须手动重开 Creator** 才会重新导入编译。
⛔ 别把「改完代码预览没变」当成修复无效；先用运行时判据（如网格顶点数）确认跑的是哪一版。

---

## 9. ⚠ 本次归并造成的不可逆损失

### 9.1 三个皮肤目录已成为不可再生的孤儿

`tools/snake-s1-assets/`（含 `source/` 40 个冻结源）**已删除**。它是下面三个生成物的
注册写入器，登记在 `scripts/protected-paths.json`（三条 writer 登记已一并摘除）：

```
apps/shared/src/gameplays/snake/snakeSkinCatalog.generated.ts
apps/server/src/rooms/modes/snake/skinBusinessCatalog.generated.ts
apps/client/src/logic/rooms/snake/SnakePresentationCatalog.generated.ts
```

⛔ **这三个文件从此只能手工维护**：没有任何工具能从原作素材重新生成它们，
16 套皮肤的帧矩形、pivot、body track、稀有度与合成门槛全部固化在这三个文件里。
⚠ 改动它们时没有 hash 守卫、没有 `--check`、也没有确定性重建可以复核。

### 9.2 机器可读的素材来源链已断

原 `docs/s/evidence/s1/provenance.json`（78 行：27 个实际复制目标 + 35 个提取输入 +
16 个生成预览 + 三层目录生成物）与 `tools/snake-s1-assets/source/manifest.json`
（登记冻结来源的 68 个实际读取文件）**均已删除**。
⚠ §2 的散文台账是现在**唯一**的来源与授权记录，⛔ 不得删改。

### 9.3 S0/S1 证据与复刻基线已删除

`docs/s/evidence/`（s0 55 个、s1 30 个、s5 8 个文件）已删除，包括 14 张 S0 golden、
16 张 S1 预览、contact sheet、`SHA256SUMS` 与各类审计 JSON。
⚠ `tools/snake-s0-replication/` 本身保留，但它的输出目录已不存在，`--check` 会失败；
`--write` 仍可重新生成一份（不含已丢失的 S1 证据）。
⚠ S0 证据**原本就无法重新生成**：重钉需要外部归档 `--source` 参数，而该归档在本机已不存在。

### 9.4 一处**故意保留**的失效指针

`apps/shared/src/protocol/lobbyRpc/domains/snakeCosmetic.ts` 的注释里仍写着
`docs/s/README.md §9.1`（即本文件 §7 的拍板 A）。⛔ **有意不改**：该文件的字节进入域契约摘要，
改任何一个字节都会被 codegen 要求 bump `contractVersion` 3 → 4，而
`dispatcher.ts` 会用它比对幂等记录（`record.contractVersion !== expectedVersion` →
`result-expired`）——为一行注释让在途幂等回执失效不成比例。
⚠ 读到那行时请转到本文件 §7。

### 9.5 阶段实施记录已删除

S0～S5 各阶段的逐步骤实施记录、验收矩阵、每步的测试计数与 commit 对照已删除。
本文件 §8.1 保留的是结论，⛔ 不保留过程。
