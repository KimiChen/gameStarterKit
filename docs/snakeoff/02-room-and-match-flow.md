# 02 · 房间与比赛流程

> [返回总目录](README.md) · [上一篇：产品定位与核心循环](01-product-and-gameplay.md) · [下一篇：蛇规则与数值基线](03-snake-rules-and-balance.md)

## 1. 房间概念

### 1.1 两个标识，不得混用

每间私人房同时拥有两个不同用途的标识：

| 标识 | 示例 | 用途 | 可见性 |
| --- | --- | --- | --- |
| 六位 `roomCode` | `012345` | 供玩家口述、复制和输入 | 玩家可见 |
| Colyseus `roomId` | 不透明字符串 | 服务端和 SDK 定位物理房间 | 客户端拿到后用于连接，但不展示 |

六位码只有一百万种组合，约 20 bit，不是安全凭证，也不能直接充当内部 `roomId`。将可复用的六位码当作内部 roomId，会使旧房间 dispose、租约过期和新房创建之间发生身份碰撞。

### 1.2 房间容量

- 最多四人，复用当前项目数值 4；目标权威值由 Snake manifest 的 `maxPlayers` 生成，不继续依赖全局常量。
- 房间内不创建 AI 席位。
- 第五名玩家的加入必须在状态写入前拒绝。
- 不要求四人坐满；Start 的最少人数由 `snake.private` profile 的 `startPolicy.minPlayers` 决定。
- `minPlayers` 尚待确认，首版建议为 2；在确认前测试应以参数化方式覆盖 1、2、4 边界，不能把建议伪装成既定事实。

### 1.3 房主

- 房主由 `room.prepareCreate` 签发的 creation ticket 中的 `expectedOwnerUid` 决定，不是“第一个进入空房的人”。
- GameRoom 创建和创建者入座时都要校验 ticket、认证 uid 与 `expectedOwnerUid`；客户端不能自报房主身份。
- uid 只用于服务端认证、ticket 绑定和同账号去重。创建者成功入座后设置 `ownerId = client.sessionId`；公开
  `player.id`、`ownerId`、Start 的 `senderId` 与客户端 `selfId` 全部处于 sessionId 身份域，不向客户端公开 uid。
- 房主也必须 Ready。
- 房主没有踢人、改房规或绕过 Ready 的权限。
- Waiting 阶段房主最终离开时，建议按 joinOrdinal 转移给最早仍占 seat 的成员；该成员若仍在重连宽限中，
  保留 owner 但因 `connected=false` 不能 Start，宽限失败后再按同一规则转移。
- 房主转移不清空仍在房成员的 Ready；即使转移后已满足全员 Ready，新房主仍须再次显式点击 Start。

## 2. 房间状态机

### 2.1 对外阶段与内部事务

沿用现有公开 `GamePhase`：`waiting`、`playing`、`settle`。Start 中的 `Starting` 是服务端内部事务状态（与
`docs/Non-intrusive.md` §6.4 同名同义），不新增为公开可持久阶段。

```text
Create / Resolve code
        │
        ▼
     Waiting
        │  加入、离开、Ready / Unready、房主转移
        │
        │  当前房主 Start + 人数达下限 + 精确 roster 全员 Ready 且在线
        ▼
  [内部 Starting]
        │  任一条件变化 → 取消、unlock、回到 Waiting
        │  lock 与玩法初始化成功
        ▼
     Playing ── 结束条件满足 ──▶ Settle
                                     │
                                     └────▶ Home / Dispose（首期）
```

### 2.2 Waiting 不变量

Waiting 必须同时满足：

- 房间尚未 dispose。
- 玩家数在 1～4 之间；创建者尚在凭 creation ticket 入座的极短窗口可以为 0，但房间已记录可信的
  `expectedOwnerUid`。
- 每个在座玩家都有唯一的 uid、sessionId、joinOrdinal、`ready` 和 `connected`。
- `ownerId` 指向创建票据绑定且已入座的成员；创建者入座前不得把其他人推断为房主。
- `matchId` 为空，Snake 世界尚未推进。
- 六位码租约存在时，只能解析到这一个内部 roomId、区号、`snake` mode/version、profile 和 lease generation。

### 2.3 Playing 不变量

- Start 时冻结的参与者集合等于当前正式参赛集合。
- 房间已经 `lock()`，不接受新连接入座。
- Start 成功后已释放本房的六位码 lease，该数字不再指向本 Playing 房；若尚未被复用则 resolve 不可用，若后来被
  新房抢占则只会指向新 lease generation。首期不额外引入 tombstone key。
- Ready 不能再改变。
- 只有合法 SnakeInput 能改变模拟输入。
- 服务端 tick、蛇世界和结算条件持续推进。

### 2.4 Settle 不变量

- 世界模拟已经停止，终局 tick 和排名已冻结。
- 迟到 SnakeInput 不得改变结果。
- 结算数据只属于本局临时状态，首版不写永久战绩。
- 首期结算后返回 Home 并退出/销毁本房；再来一局留到后续单独定义 roster、Ready 和邀请码语义。

## 3. 创建房间

### 3.1 客户端流程

1. 玩家已登录并连接本区 LobbyRoom。
2. 点击“创建房间”。
3. 客户端发送 `room.prepareCreate({ mode, modeVersion, profile })`；服务端按认证上下文签发短期
   creation ticket，不接受客户端自报 uid 或 sId。
4. `RoomClient.create("game", options + creationTicket)` 创建同一个通用 `GameRoom`；profile 选择
   invite-code + owner-ready 策略，不新增第二个房间壳。
5. GameRoom 原子占有 ticket claim，固定 `expectedOwnerUid`，在 listing 可见前设置 private，并随机抢占六位码租约。
6. 创建者凭同一受约束上下文入座；认证 uid 必须等于 `expectedOwnerUid`。
7. 创建者成为房主，进入 Waiting，并从权威房间状态看到 `roomCode`。

### 3.2 六位码生成

建议使用 Node `crypto.randomInt(0, 1_000_000)` 生成数值，再转换为六位字符串：

```text
code = randomInt(0, 1_000_000).toString().padStart(6, "0")
```

每次候选码必须通过 Redis `SET key value NX PX ttl` 原子抢占。发生冲突时有限次数重试；超过预算应返回服务繁忙，不能降级为顺序枚举或使用弱随机。

### 3.3 Ticket claim、失败与取消

- creation ticket 绑定 `uid + sId + mode + modeVersion + profile + purpose=create + jti + exp`，必须安全随机、短期且不可跨用途复用。
- ticket claim 通过有界状态原子推进；同一 ticket 的并发 create 不能创建两间有效房。
- 如果房间创建成功但邀请码租约失败，Redis 故障应 fail-closed，关闭未发布房间。
- 如果码租约成功但创建者取消或未在有界 creation admission 窗口内入座，空房应立即 CAS 释放 lease 并 dispose；
  Waiting 绝对期限只是已有等待房的产品寿命和异常兜底，不替代空房清理。
- RPC/SDK 超时不等于创建已取消；`RoomClient` 要收敛迟到结果，不能悄悄退化为另一次 `joinOrCreate`。

## 4. 输入六位码加入

### 4.1 输入规则

- 输入类型始终是字符串。
- 必须恰好匹配 `/^[0-9]{6}$/`。
- 保留前导零，不用数值输入框或 `parseInt` 作为状态真源。
- 客户端可以自动过滤空格和非数字按键，但服务端仍做 exact validator。
- 未满六位时 Join 按钮禁用；满六位后由玩家显式提交。

### 4.2 Resolve 流程

`room.resolve` 根据当前已认证 uid 和 sId 校验：

1. roomCode 格式合法。
2. 当前账号通过 RPC 限流。
3. 租约存在，且记录的 sId 与权威区一致，mode、modeVersion、profile 属于 generated catalog 的有效注册项。
4. listing 中的 phase、starting、reserved seat、容量和重复 uid 只作为最佳努力 UX 快照；能提前发现时可拒绝，
   不能把它们宣称为已锁定的最终准入。
5. 签发绑定 uid、roomId、mode/version/profile、lease generation、purpose 和 expiry 的短期一次性 join ticket。
6. 返回内部 roomId 和 join ticket；客户端使用精确 options 调用 `joinById`。

解析成功不等于预留席位。resolve 与真正 onJoin 之间，其他玩家可能先占满或房主可能开始，因此 GameRoom 必须原子
claim ticket，并重验 auth、mode/profile、lease generation、phase、starting 和容量。异步校验前先同步登记
`pendingSession/pendingUid/pendingSeat`，容量计算包含 pending；成功转 active seat，失败统一释放。重连使用 Colyseus
reconnection token，不重复消费 join ticket。

### 4.3 统一失败语义

错误、过期、已开始和不存在的数字码建议统一对外为 `ROOM_CODE_UNAVAILABLE`，避免成为批量枚举房间的高质量探针。满员可以单独返回 `ROOM_FULL`，但仍受相同限流。

加入失败绝不能自动调用 `joinOrCreate`，否则两名输入同一码的玩家可能被静默分到不同房间。

## 5. Ready 规则

### 5.1 状态含义

权威 Schema 字段按通用 `OwnerReady` fragment 命名为 `player.ready`；它与服务端角色登记中的
`characterRegistration` ready marker 分属不同契约，代码中必须通过完整类型/路径区分。它表示该成员的开局同意；
是否可开局由当前精确 roster 的 `allReady && allConnected` 动态计算。

### 5.2 Ready 请求

客户端发送：

```ts
{ ready: boolean }
```

服务端接受条件：

- 发送者仍是当前房间成员。
- phase 为 Waiting。
- payload 只有 `ready` 一个 boolean 字段。

重复设置相同值是幂等 no-op。Start 在途时，冻结 roster 中的成员仍可提交 `{ ready:false }`；服务端同步更新
`readyRevision` 并使本次 Start 失效。admission fence 只阻止新 seat 和重复 Start，不能吞掉成员的 Unready 取消权。
服务端更新 Schema 后，所有客户端从权威状态刷新按钮和 Start 可用性。

### 5.3 Ready 保留与 revision

- 新玩家入座时仅该玩家默认 `ready=false`；其他成员的 Ready 保留，因此 `allReady` 自然变为 false。
- Waiting 中成员最终离开或房主转移时，仍在房成员的 Ready 保留；相关 `rosterRevision`/`readyRevision` 变化会使在途 Start 失效。
- 临时断线保留 seat、owner 和 Ready，但立即设 `connected=false` 并增加 `connectionRevision`；离线成员会阻止 Start。
- 重连恢复 `connected=true` 并再次增加 `connectionRevision`，使断线前的 Start 快照不能复用。
- Start 回滚不盲目清空 Ready；保留当前权威值，让导致失败的新人、Unready 或离线状态直接反映在 `canStart` 中。
- 首期结算退出房间，不定义跨局 Ready 复用。

## 6. 房主 Start 规则

### 6.1 可开始谓词

只有以下谓词全部为真，房主 Start 才可能成功：

```text
canStart =
  phase == Waiting
  && senderId == ownerId
  && profile.startPolicy.minPlayers <= players.size <= manifest.maxPlayers
  && every(players, player.ready == true)
  && every(players, player.connected == true)
  && noStartTransactionInFlight
  && roomNotDisposed
```

客户端可用同一逻辑显示按钮状态和禁用原因，但服务端结果才是权威。

### 6.2 Start 事务快照

进入任何 await 前先同步设置 `starting` 与 admission fence，拒绝新 seat 和重复 Start，然后冻结：

- `startGeneration`
- `startingOwnerId`
- 按 joinOrdinal 稳定排序的 `startingSessionIds`
- `rosterRevision`
- `readyRevision`
- `connectionRevision`
- 当前 `phase`

所有异步步骤之后都重新验证精确快照，至少包括：

1. `await room.lock()` 后。
2. 玩法 `onMatchInitialize` 后。
3. 玩法 `onMatchStart` 后。
4. 发布 `Playing` 前。

### 6.3 必须取消的竞态

Start 过程中发生任一事件，本次开局必须 fail-closed：

- 有新玩家加入或尝试入座成功。
- 任一成员最终离开。
- 任一成员取消 Ready。
- 任一成员 drop 或 reconnect，导致 `connectionRevision` 改变。
- 房主发生变化。
- phase 不再是 Waiting。
- 房间 dispose 或生命周期 generation 变化。
- lock 超时、失败或迟到完成。
- Snake 初始化或 Start hook 失败。

失败时恢复 Waiting/撤销 starting fence，保留当前权威 Ready，并在需要时安全 `unlock()`。若 `lock()` 只是超时而
底层 Promise 尚未收敛，必须保留独立 retry fence，拒绝第二次 Start；底层迟到成功时立即释放 stale lock，迟到失败
也要先收敛后再移除 retry fence。如果获得 lock 后连 unlock 都失败，应关闭房间，而不是留下“看似 Waiting、实际不
再接客”的幽灵房。

### 6.4 重复与越权请求

| 请求 | 结果 |
| --- | --- |
| 非房主 Start | `NOT_ROOM_OWNER`，不产生副作用 |
| 有人未 Ready | `ROOM_NOT_READY` |
| 人数低于下限 | `NOT_ENOUGH_PLAYERS` |
| 已在 Start 事务 | 同一房主重复请求合流或返回 `START_IN_PROGRESS` |
| 已 Playing | `GAME_ALREADY_STARTED` |
| Settle | `INVALID_ROOM_PHASE` |

不得仅依赖按钮禁用，也不得把失败 Start 当成成功后再客户端回滚。

## 7. 离开与重连

### 7.1 Waiting 临时断线

- 非主动断线进入现有 10 秒重连宽限。
- 宽限内保留席位、房主和 Ready，不允许他人占用该席位。
- 断线立即标记 `connected=false` 并增加 `connectionRevision`，所以即使其他人已 Ready 也不能 Start。
- 重连成功恢复同一 session/seat 语义、标记在线并再次增加 `connectionRevision`。
- 宽限失败才视为最终离开，更新 roster revision；若需要则转移房主，但保留其他成员的 Ready。

### 7.2 Waiting 主动退出

- 立即最终离场，不等待重连。
- 若是房主，按最终产品决定转移或解散；本方案建议转移。
- 房间无人后释放六位码租约并允许 autoDispose。
- 释放租约只能比较 leaseToken/generation/roomId 后 CAS 删除，旧房不得误删后来复用同一码的新房。

### 7.3 Playing 临时断线

候选基线：

- 沿用 10 秒宽限。
- 宽限期内保留最后合法方向，但服务端强制 `boost=false`，防止离线持续消耗或获得加速优势。
- 重连后先接收完整 Snake 世界快照，确认 snapshot tick 后再开放上行输入。
- 宽限超时按一次权威死亡处理；若采用淘汰制，则进入淘汰状态。

若最终选择“掉线立即死亡”或“暂停整局”，必须同步改 [03](03-snake-rules-and-balance.md) 的胜负规则和 [04](04-client-and-protocol.md) 的恢复协议。

### 7.4 房主 Playing 离开

Playing 中房主身份不影响模拟，不因房主离开而中断已开始的对局。首期没有返回 Waiting 的 rematch，房主标识只需
保留到结算/退出；后续若增加 rematch，再单独定义跨局转移。

## 8. 房间码生命周期

### 8.1 候选时间线

```text
创建成功
  → SET NX 建立短 lease TTL
  → Waiting 中按 leaseToken CAS 定期续租
  → 不可续的 waitingDeadline 到达：关闭并 dispose
  → Start 成功：停止续租、释放 lease 并关闭 resolve
  → Playing / Settle 不依赖房间码存活
  → 空房 / dispose：CAS 删除
  → 进程崩溃：TTL 自动回收
```

`leaseTtlMs`、`renewIntervalMs` 与 `waitingDeadlineMs` 的具体值由 SNAKE-OPEN-07 决定；短 TTL 用于崩溃回收，
绝对 Waiting deadline 用于产品寿命上限，二者不能混成一个可无限续期的 15 分钟数字。

### 8.2 为什么开局后不依赖租约

六位码只负责把新成员带到 Waiting 房间。Start 成功后参赛集合已经冻结，继续让对局存活依赖临时 Redis 码会增加无关故障面。对局进行中 Redis 短暂不可用不应直接终止蛇世界。

### 8.3 首期结算与邀请码

首期 Start 成功后永久关闭“该数字 → 本局房间”的邀请映射；数字本身可以被后续新房重新分配。Settle 后所有客户端
返回 Home，房间随后退出或 dispose。若后续增加 rematch，必须重新定义下一轮 roster、Ready、邀请码和断线恢复边界；
不得假定已释放的旧码仍属于原房。

## 9. 异常矩阵

| 场景 | 服务端行为 | 客户端恢复 |
| --- | --- | --- |
| 码少于/多于六位 | exact validator 拒绝 | 保留输入，显示格式错误 |
| 码不存在/过期/已开始 | 统一不可用 | 返回开房入口，不退出登录 |
| resolve 后房间变满 | onJoin 最终拒绝 | 显示房满，可重新输码 |
| 第五人加入 | 拒绝且不写 state | 显示房满 |
| 全员 Ready | 仅更新 Start 可用性 | 继续停留 Waiting |
| 非房主 Start | 拒绝 | 显示只有房主可开始 |
| Start 期间有人 Unready | 取消开局、回 Waiting | 刷新 Ready 与按钮原因 |
| Start 期间有人离开 | 取消开局、处理房主/roster，保留仍在房成员 Ready | 新房主按最新状态再次点击 Start |
| Start 期间有人掉线/重连 | connection revision 变化，取消旧 Start | 等全员在线后由房主重试 |
| lock 超时但底层未收敛 | 保留 retry fence，拒绝第二次 Start | 保持 Waiting 并显示暂不可重试 |
| lock 迟到成功 | 识别旧 generation、释放 stale lock，收敛后再移除 retry fence | 保持 Waiting 或收到房间关闭 |
| Playing 后使用旧 join ticket/roomId | generation/phase/purpose 重验拒绝进入原房 | 显示原房已开始 |
| Playing 后重新输入同一数字 | 未复用时不可用；已复用时只解析到新 Waiting 房和新 generation | 按本次 resolve 权威结果展示 |
| 主动退出 | 立即最终离场 | 回 Home |
| 网络抖动 | 进入 10 秒恢复窗口 | 显示重连遮罩，不重复入座 |
| 重连快照无效/过旧 | 丢弃，保持输入关闭 | 请求/等待新快照；超时退出 |

## 10. 房间规则验收

- 创建结果的码始终匹配 `^[0-9]{6}$`，并覆盖 `000000`、`012345`、`999999`。
- 同一区、同一有效 lease generation 内，同一码解析到同一内部 roomId；数字被新房复用后只指向新 generation。
- 房间最多四人，第五人无法在 Schema 中短暂出现。
- 全员 Ready 后至少等待房主 Start，不存在自动开局路径。
- 非房主、未 Ready、人数不足、错误 phase 均不能开始。
- Start 并发请求最多产生一个 Playing 迁移和一个 matchId。
- Start 所有 await 边界后都验证精确 roster、owner、Ready、connected 与 revisions；未收敛 late lock 阻止重试。
- 新成员默认未 Ready；阵容/房主变化不清空其他成员 Ready，但 revision 会使旧 Start 失效。
- 有断线成员时不能 Start；drop/reconnect 都会使在途 Start 失效。
- Playing 后旧 ticket、旧 generation 和六码都无法加入原房；数字复用只会指向另一新 Waiting 房。
- creation ticket 绑定可信 `expectedOwnerUid`；抢先进入空房不能成为房主。
- join ticket 只能用于绑定的 uid/房间/版本/profile/lease generation，重放和跨用途使用被拒绝。
- pending seat 计入四人容量，失败后不泄漏占位。
- 断线宽限成功不重复席位，宽限失败只执行一次最终离场。
- 旧房释放租约时不会删除后来复用相同数字码的新租约。

---

> [返回总目录](README.md) · [上一篇：产品定位与核心循环](01-product-and-gameplay.md) · [下一篇：蛇规则与数值基线](03-snake-rules-and-balance.md)
