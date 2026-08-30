# 06 · 测试与实施路线

> [返回总目录](README.md) · [上一篇：数据、服务端与改动面](05-data-and-server.md) · [下一篇：竖版美术方向](07-art-direction.md)

## 1. 验收指标

### 1.1 房间指标

| 指标 | 首版验收目标 |
| --- | --- |
| 房间码格式正确率 | 100%，始终为六位数字字符串 |
| 同码入同房 | 正确码在有效 Waiting 期内解析到同一 roomId |
| 误建新房 | 输入错误/过期码时为 0 |
| 容量越界 | 第五人成功入座为 0 |
| 自动开局 | Snake 全员 Ready 但未点 Start 时为 0 |
| 越权开局 | 非房主成功 Start 为 0 |
| 非全员 Ready 开局 | 0 |
| 有离线席位时开局 | 0 |
| Start 重复提交 | 一个 roster/version 最多生成一个 matchId |
| Playing 中途入座 | 0 |
| 抢先入座夺取房主 | 0；owner 必须等于 creation ticket 的 expectedOwnerUid |
| ticket 重放/串用 | 成功次数为 0 |
| pending 容量越界 | active + pending 超过四席为 0 |
| 租约误删 | 旧 lease generation 删除新租约为 0 |

### 1.2 模拟指标

| 指标 | 首版验收目标 |
| --- | --- |
| 确定性 | 同 seed/config/roster/input 的最终 hash 100% 相同 |
| 逻辑频率 | 20Hz fixed-step；结果不随客户端 fps 变化 |
| 非有限值进入世界 | 0 |
| 身体/食物/掉落超硬上限 | 0 |
| 同 tick 争抢/碰撞顺序漂移 | 0 |
| 快照回退 | 旧 tick/seq 覆盖新世界为 0 |
| 输入重放 | reconnect 后 SDK 自动发送旧输入为 0 |
| 单 tick 计算 | 四人上限世界在开发机预算内，无同步长任务阻塞网关 |

### 1.3 客户端指标

| 指标 | 首版验收目标 |
| --- | --- |
| 设计适配 | 750×1624、短屏、长屏、安全区均可操作 |
| 输入冲突 | 摇杆和加速双指独立，不被 Waiting FGUI 拦截 |
| 首帧屏障 | 合法 state + world snapshot 前上行输入为 0 |
| 生命周期泄漏 | 旧页面/旧房间迟到 callback 更新新局为 0 |
| 远端表现 | 常规网络下插值连续，无长期跳回 |
| 错误恢复 | 房间业务错误留在房间流程，认证错误才回登录 |

性能数字需要在实现后由 `perf:client`、服务端模拟基准和真机数据确定。本篇不预先承诺未经测量的帧时间或带宽。

## 2. 纯规则测试

### 2.1 房间状态机

至少覆盖：

- creation ticket 绑定的 `expectedOwnerUid` 成为房主；其他 uid 抢先入座不能夺取房主。
- 2、3、4 人不 Ready 均保持 Waiting。
- 所有人 Ready 后仍保持 Waiting。
- 房主 Start 进入一个且仅一个 Start 事务。
- 非房主 Start、人数不足、任一未 Ready 或离线均拒绝。
- 新成员默认未 Ready，其他成员 Ready 保留；最终离开和房主转移也不清空仍在房成员 Ready。
- join、最终离开、Unready、房主转移、drop/reconnect 会改变相应 revision 并让在途 Start 失效。
- 临时断线保留 seat/owner/Ready、标记 disconnected；重连恢复在线，宽限失败只最终离场一次。
- 结算后回 Home/退出房间，首期不进入 rematch Waiting。

对 `snake.private.startPolicy.minPlayers` 采用参数化测试；产品未拍板前，不用一个硬编码用例掩盖开放项。

### 2.2 移动与身体

- 方向归一化、零向量、最短角差、0/360°跨界。
- 最大转角正负边界与 180°目标。
- 普通/加速位移和量化位置。
- 身体队列头进尾出、扩容、收缩、容量封顶。
- 相同长度映射相同身体点数。
- snapshot→restore 后路径、方向、长度和 head 一致。

### 2.3 食物与碰撞

- 生成点不越界、不进入保护区，尝试上限后可安全延后。
- 同 tick 两蛇抢同一食物的稳定 tie-break。
- 墙、自身、他蛇身体、头对头、出生保护。
- 高速 swept path 不穿过细身体。
- 死亡掉落数量、价值守恒/上限和全房对象上限。
- 复活制与淘汰制分别有独立规则测试；最终只启用拍板的一套。

### 2.4 排名

- score、length、deathCount、达到分数 tick 的逐级排序。
- 完全相同的确定性兜底。
- 多人同 tick 死亡、全灭和倒计时最后一 tick 得分。
- Settle 后迟到输入不改变排名。

## 3. shared 与协议测试

### 3.1 房间码/RPC

- 接受 `000000`、`012345`、`999999`。
- 拒绝空串、5 位、7 位、空格、全角数字、负号、number 类型。
- prepareCreate/resolve req/res exact keys，未知字段拒绝。
- framework/mode version、profile、roomId、creation/join ticket 长度与字符边界。
- create/join purpose 不可互换，ticket 不可跨 uid、roomId、profile 或 lease generation 使用。
- LobbyRpcMap、ALL_LOBBY_RPC_TYPES、请求/响应 validator 和服务端端点全集一致。

### 3.2 GameRoom 消息

- Ready 只接受一个 boolean 字段。
- Start 只接受严格空对象。
- SnakeInput 拒绝 NaN、Infinity、越界方向、负/小数/过大 seq、未知字段。
- SnapshotRequest 的 afterTick 为安全非负整数。
- WorldSnapshot 每层数组、id、坐标、matchId、tick、seq 均 exact validate。
- generated wire registry 自动覆盖每个 core/玩法 token 的 owner、方向、validator、phase、rate cost 和版本。
- 新增 Snake token 的 fixture 只新增玩法 wire 后即可通过，不需要修改中央 schema map/handler/phaseAllows。

### 3.3 Gameplay manifest 与 state descriptor

- `snake` manifest 唯一映射 modeVersion、profile、maxPlayers、wire 与 `SnakeRoomState`。
- owner-ready/invite profile 缺 `OwnerReady` 或 `InviteRoom` fragment 时 codegen/启动 fail-fast。
- Snake root/player 默认值与 validator 一致。
- players 最多四个、map key 与 player.id 相同。
- ballMove/idle 的现有 root 行为不变。
- generated 三端 mode/wire/state/View catalog 集合一致；手工编辑或陈旧输出会被 `--check` 发现。

## 4. 服务端测试

### 4.1 Game plugin、profile 与 GameRoom

- ballMove 行为等价抽离后，auto profile 保持现有自动开始回归；不存在隐式 ballMove fallback。
- owner-ready profile 不因第二、第三或第四人加入自动开始。
- Start 在进入第一个 await 前同步建立 admission fence；lock、initialize、mode start 后逐一做 revision mutation test。
- lock 失败、超时、迟到成功与 unlock 失败沿用 fail-closed 行为；底层 lock 未收敛前 retry fence 必须拒绝第二次 Start。
- mode snapshot 只能凭 shared token 通过 typed context 广播，玩法拿不到原始 Client/Room。
- Snake 无 matchEvidenceRuleset 时不写 `ballMove@1` stream。
- onDispose、重连超时和在途 Start 之间资源 exactly-once 释放。

### 4.2 Redis 房间码

使用真实本地 Redis 集成测试覆盖：

- 并发抢同一码只有一个成功。
- 冲突后重新随机并最终得到不同六位码。
- CAS_RENEW 只有 leaseToken/generation 相同才续租。
- CAS_DEL 旧 generation 不删除新 value。
- TTL 后 resolve 不可用。
- renew 保持短 TTL，但不可续 waitingDeadline 到达后房间关闭且 dispose。
- 畸形 value、错误 sId/mode/version/profile、listing 缺失均 fail-closed。
- creation/join claim 覆盖 issued→pending→seated、并发重放、可安全恢复的入座前失败和 expiry。
- Redis 在创建/resolve 时不可用就 fail-closed，不留下无码可进的半成功房。
- 进程 admission 关闭后不新建租约或 Redis client。

### 4.3 多客户端房间

用 `@colyseus/testing` 或现有 int harness 覆盖：

1. A `prepareCreate`，凭 creation ticket `create` 并加入；A 是 expected owner。
2. B 用码 resolve，凭一次性 join ticket `joinById`。
3. A/B Ready 后不自动开始。
4. B Start 被拒。
5. A Start 后双方进入同一 matchId。
6. C 使用旧 join ticket/roomId 加入 Playing 原房失败；六码若被新房复用，也只能拿到新 lease generation。
7. Waiting 中 B 掉线时保留 Ready 但阻止 Start；重连后由 A 重新点击可开局。
8. 断线、10 秒内重连和超时最终离场；房主最终离开时按稳定规则转移。
9. 四人 active/pending 满房和第五人拒绝。

外部 WebPlatform strict session 与同区准入属于完整集成前提；纯房间单测可以注入认证结果，但不能把 stub 结果声称为完整登录链验收。

## 5. 客户端与 Creator 测试

### 5.1 无头 Logic/adapter

- PrivateRoomLobby 的 prepareCreate/resolve/create/joinById 在途合流、取消、迟到响应和稳定错误映射。
- Waiting 席位排序、owner、Ready、Start enabled/disabled 派生。
- ClipboardPort 成功、拒绝/无权限和宿主不支持时都有稳定反馈，Logic 不直接访问 DOM/平台全局。
- RoomClient join-or-create/create/join-by-id strategy 的 connection key 不冲突。
- 不同 roomId 不复用旧 slot。
- SnakeRoom capability 在 generation 失效后拒绝发送和 callback。
- snapshot buffer 拒绝旧 match/tick/seq，并按设定渲染延迟插值。
- reconnect 清除 boost，取得权威 `ackSeq` 后从更大的新 seq 继续发送，不重放也不归零到被服务端拒绝。
- gameplay stop/dispose/unmount 幂等。

### 5.2 FairyGUI 契约

- PrivateRoomLobby 与 Snake View contribution 进入 generated View catalog，FGUI contract 从 `ViewMeta` 派生。
- `btn_`、`txt_`、`lst_` 等命名符合 codegen 规则。
- 四席位列表 defaultItem、controller、relation 和 `ui://` 依赖闭包被机检。
- 设计源、发布 `.bin`/图集与 manifest hash 同步。
- View/Logic contribution 与 generated registry 双向相等；新增玩法 fixture 不手改生产 catalog。

### 5.3 Creator 人工验收

Node 侧测试不能替代以下真实引擎验证：

- Cocos 3.8.8 打开工程无脚本/资源错误。
- 750×1624、短屏和长屏预览布局。
- 刘海与底部 home indicator 安全区。
- 双指摇杆 + 加速；触摸取消、切后台和场景销毁。
- Waiting FGUI 关闭后战斗触摸不被全局 InputProcessor 吞掉。
- 蛇身、食物、死亡、复活/淘汰和结算渲染。
- 真实 websocket drop/reconnect、首份世界快照和输入恢复。
- 复制六码在目标宿主可用；不支持剪贴板时仍可手动选择/口述，不阻断入房。
- 资源发布、`.meta`、动态图集/材质在目标平台可加载。

## 6. 实施路线

### 阶段 0：产品规则冻结

完成：

- 拍板最少开局人数。
- 拍板 90 秒计分或最后存活。
- 拍板复活/淘汰、真人碰撞、房主最终离开和 Waiting deadline。
- 确认参考素材只参考，或提供逐项授权。

退出条件：README 的 SNAKE-OPEN-01～08 都有明确结论，候选参数形成 `snake-ruleset@1` 草案。

### 阶段 1：行为等价抽离 ballMove

完成：

- 将 Move、技能、出生/复位、fixed-step、死亡、结算和 evidence 从 `GameRoom` 移入 ballMove 私有目录。
- 删除 `usesDefaultBallMoveRules` 和未知 mode 回退 ballMove。
- 现有 ballMove/idle 行为、协议和测试保持等价。

退出条件：`GameRoom` 不再包含 ballMove 玩法语义，未登记 mode fail-fast，现有回归全绿。

### 阶段 2：generated gameplay 扩展边界

完成：

- per-mode manifest/state/wire 描述与 `codegen:gameplays --check`。
- typed token registry、GameRoom catch-all dispatcher、分片 state fragment 和 mode digest。
- generated server/client/View catalog；ballMove/idle 先迁移成首批 fixture。
- framework version 与 modeVersion 分离。

退出条件：新增一个测试玩法只新增 descriptor/module 文件和 generated diff，不再手改中央消息、state、catalog 全集。

### 阶段 3：通用 private-room 与 owner-ready policy

完成：

- InviteCodeLease、短 TTL/renew、绝对 Waiting deadline 与 CAS。
- `room.prepareCreate/resolve`、creation/join ticket、create/joinById、pending seat。
- owner/Ready/connected、房主转移和 revision-fenced Start。
- 单一 `GameRoom` + profile；不新增 InviteGameRoom。

退出条件：1～4 人容量矩阵、选定 minPlayers、ticket 重放、并发 Start、drop/reconnect、lease/Redis 故障用例通过。

### 阶段 4：客户端 module 与通用私房页面

完成：

- `GameplayModule`、通用 launch request、三种 RoomClient strategy 和 generation fence。
- generated lobby/View contribution、Home 入口列表和 PrivateRoomLobby。
- 创建、输码、Waiting、Ready、房主 Start、退出与错误恢复闭环。

退出条件：不含 Snake 世界时，2～4 个真实客户端也能走通 private-room 全链，业务错误不清除有效登录态。

### 阶段 5：服务端 SnakeWorld

完成：

- 新增 Snake manifest/state/wire/server module。
- 移动、身体、食物、加速、碰撞、死亡和排名纯模拟。
- SnakeGameMode onStep/input/snapshot。
- 确定性 hash、实体/包体硬上限和性能基准。

退出条件：无客户端渲染也能以输入 fixture 完成一局并得到稳定终局；Snake 未触碰 ballMove evidence。

### 阶段 6：竖版客户端、重连与默认切换

完成：

- Cocos SnakeWorldView/HUD、摇杆、加速、快照插值与轻预测。
- Playing 重连恢复、ackSeq 后续发、迟到 callback 与旧 generation 故障测试。
- SnakeResultView 返回 Home；原创/已授权素材导入。
- 四人长局、带宽、Creator/真机和完整开房链验收。
- Home 默认 contribution 切到 Snake；ballMove 保留可显式选择。

退出条件：Definition of Done 全部满足，`plan-v3.md` 更新真实实施证据。

### 阶段 7：可选清理与扩展

- 单独决定是否删除 ballMove。
- 多节点 Driver/Presence。
- rematch、平台分享、匹配、观战、战绩等后续能力。

本阶段不属于首版阻塞项。

## 7. Definition of Done

### 7.1 产品闭环

- [ ] 房主能创建并看到恰好六位数字码。
- [ ] 好友能输入该码加入同一 Waiting 房。
- [ ] 最多四人，不要求四人坐满。
- [ ] 当前成员全部 Ready 后不会自动开始。
- [ ] 只有房主点击 Start 且服务端复核成功才开始。
- [ ] 新成员/房主转移不清空其他人的 Ready；任何离线席位都会阻止 Start。
- [ ] Playing 后锁房。
- [ ] 竖版核心玩法和结算完整可用；首期结算后返回已登录 Home。

### 7.2 正确性

- [ ] 所有协议 exact validate，消息/错误/公式来自 shared。
- [ ] creation ticket 绑定 owner，join ticket 绑定用途与精确目标；重放、串用和 pending 泄漏为 0。
- [ ] Start 入 await 前建立 admission fence，所有异步边界都有 roster/ready/connection/owner/generation 复核。
- [ ] 蛇世界相同输入确定性一致。
- [ ] 输入、实体、身体、快照、计算和消息频率有硬上限。
- [ ] reconnect 不重复入座、不重放旧输入、不接受旧快照。
- [ ] Snake 不污染 ballMove evidence 或永久战绩。

### 7.3 工程边界

- [ ] 未修改 bitECS 锁定文件和 vendor Colyseus。
- [ ] 未手改 shared/client/Cocos 生成镜像。
- [ ] View/Logic 分离，FairyGUI 只走动态 import。
- [ ] Snake 只新增 module/descriptor 业务目录；公共壳只包含一次性 generated 扩展能力，不出现 Snake 分支。
- [ ] 参考目录没有成为运行时/编译依赖。
- [ ] 每个直接复用素材都有授权、hash、源/目标和转换台账；否则全部为原创资源。
- [ ] ballMove 是否删除是单独决策。

### 7.4 验证命令

至少运行：

```bash
npm run codegen:gameplays -- --check       # 拟新增；实现前尚不存在
npm run sync:shared
node scripts/protocol-fingerprint.mjs
npm run sync:client
npm run typecheck
npm --workspace @game/server run test
npm run test:client
npm run test:fgui
npm run verify:sync
npm run verify:inventory
npm run verify:project
npm run verify:core
npm run verify:all
```

涉及真实 Redis/完整栈时再运行：

```bash
npm --workspace @game/server run stack
npm --workspace @game/server run db:bootstrap
npm --workspace @game/server run test:int
npm --workspace @game/server run smoke
```

完整 `smoke` 依赖外部 WebPlatform Public/Internal 和游戏服进程，不能在缺少这些前提时将失败误归因于 Snake。

## 8. 风险与应对

| 风险 | 触发症状 | 应对 |
| --- | --- | --- |
| 把六位码当 roomId | 码复用后幽灵房/误删 listing | 内外标识分离，lease generation CAS |
| 第一入座者被当房主 | 抢跑连接夺取 Start 权限 | creation ticket 固定 expectedOwnerUid |
| ticket/pending 实现不完整 | 重放入座、容量超卖或僵尸席位 | 原子 claim 状态机 + pending 计容量 + 统一释放 |
| Ready 与 Start 竞态 | 未同意/离线成员被带入局 | 同步 admission fence + revisions + 每个 await 后复核 |
| 继续复用 auto-start | 第二人一入座就 Playing | mode start policy + 回归测试 |
| 第二个房间壳 | auth/reconnect/修复长期漂移 | 单一 GameRoom + profile，不建 InviteGameRoom |
| 蛇身全放 Schema | patch/GC/重连包暴涨 | 摘要 Schema + 有界 snapshot |
| 客户端锁步伪权威 | 作弊/漂移/恢复困难 | 服务端 fixed-step 权威 |
| FGUI 抢触摸 | 摇杆无响应或偶发丢指 | Playing 前释放交互租约，Creator 验证 |
| 参考真人不互撞被误继承 | PvP 行为反直觉 | 产品明确规则，独立碰撞测试 |
| 源素材版权不明 | 无法发布或返工 | 默认原创；复用前逐项授权台账 |
| 单进程能力被写成多节点 | 上线后 roomId 不可达 | 明确非承诺，多节点单独里程碑 |
| 同阶段删除 ballMove | 回归面和协议 diff 过大 | 先并存验收，后独立清理 |

---

> [返回总目录](README.md) · [上一篇：数据、服务端与改动面](05-data-and-server.md) · [下一篇：竖版美术方向](07-art-direction.md)
