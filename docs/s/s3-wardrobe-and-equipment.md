# S3：Demo 衣柜与装备

[上一阶段：S2R Demo 金币复活](s2r-reliable-coin-relive.md) ·
[专项索引](README.md) · [下一阶段：S4 Demo 养成奖励](s4-reliable-progression-rewards.md)

## 状态与范围

| 项目 | 口径 |
|---|---|
| 状态 | `[已拍板·待实施]` |
| 实现范围 | 16 套皮肤的浏览、拥有、碎片合成、装备与当前 run 外观锁存 |
| 账号状态 | 当前进程内 profile；成功时 best-effort 镜像到 Redis |
| 客户端本地状态 | 只保存已查看皮肤 ID 与筛选偏好 |
| Redis | 复用 `gp:snake:user:{uid}` HASH，不增加其他 Snake key |
| 发布口径 | 仅供 demo 和内部试玩，不承诺每次 Redis 写入成功或多实例一致 |

S3 延续 S2R 的简化原则：实现可玩的衣柜闭环，但不建设生产账号资产链路，也不扩展通用房间框架。

## 冻结决策

1. 不新增数据库表，不复用现有 Bag/User 作为 Snake demo 的存储。
2. 只复用 Redis HASH `gp:snake:user:{uid}`，S3 允许增加 `equippedSkinId`、`ownedSkinIds` 和
   `fragmentBalances`；不新建其他 Snake key。
3. 账号身份只取认证后的 `uid`。Redis key/value、内存 profile、RPC 和玩法投影都不增加 `sId`。
4. 不修改 `apps/server/src/rooms/GameMode.ts` 和 `apps/server/src/rooms/GameRoom.ts`。
5. 皮肤读取与锁存在 Snake mode 内同步完成，不新增通用准入/离场接口或后台处理流程。
6. 同一进程内，以模块级 `Map<uid, profile>` 共享衣柜状态；首次普通 Lobby RPC 尝试从 Redis
   **`HMGET`**（按字段白名单取 `equippedSkinId` / `ownedSkinIds` / `fragmentBalances`）回灌，
   失败或数据非法时告警并使用默认 profile。⛔ 不用 `HGETALL`：全仓明文禁令（09·R1，
   `apps/server/src/core/userRecord.ts` 抬头与 [docs/SERVER.md](../SERVER.md)「按需 HMGET 并只写
   dirty 字段；禁止 HGETALL 后整档覆盖」），源码零使用；白名单读顺带满足本阶段「字段严格限制」验收条。
7. 装备或合成先同步更新内存，再用一条不等待结果的 `HSET` 写完整相关字段；写失败只告警，
   不回滚已经返回的 demo 结果。
8. 皮肤只改变表现，不改变速度、初始长度、转向、碰撞、攻击范围或得分。

## 皮肤目录

S1 已冻结的 16 个稳定 `skinId` 继续作为唯一目录：

| `skinId` | 展示名 | 稀有度 | Demo 获取方式 | 合成门槛 |
|---:|---|---|---|---:|
| `1` | 经典红 | common | 默认拥有 | - |
| `2` | 海洋蓝 | common | S4 等级解锁 | - |
| `3` | 阳光黄 | common | S4 等级解锁 | - |
| `4` | 樱花粉 | common | S4 等级解锁 | - |
| `10` | 木乃伊 | rare | 暂不开放 | - |
| `11` | 独眼外星人 | rare | 暂不开放 | - |
| `101` | 扑克国王 | epic | S4 成就解锁 | - |
| `111` | 灰白猫 | rare | 暂不开放 | - |
| `112` | 红方仔 | rare | 暂不开放 | - |
| `132` | 奶油猫 | rare | S4 成就解锁 | - |
| `133` | 太空漫游 | epic | 专属碎片 | `300` |
| `139` | 樱花少女 | epic | S4 成就解锁 | - |
| `401` | 彩虹派对 | epic | 专属碎片 | `10` |
| `403` | 薄荷甜筒 | epic | 专属碎片 | `120` |
| `411` | 熊猫学者 | legendary | 专属碎片 | `300` |
| `701` | 招财猫 | legendary | S4 成就解锁 | - |

默认皮肤 `1` 始终视为拥有。所有皮肤保持 `off-sale`；本阶段没有购买入口、价格或重复物品转换。
`133/401/403/411` 使用各自独立的碎片余额，达到门槛时精确扣除门槛并保留超额。

## Profile 与 Redis 投影

建议的手写真源形状如下，实际公开 wire 仍通过 shared 契约生成：

```ts
interface SnakeDemoCosmeticProfile {
  version: number;
  equippedSkinId: number;
  ownedSkinIds: number[];
  fragmentBalances: {
    133: number;
    401: number;
    403: number;
    411: number;
  };
}
```

新 `uid` 的默认值为 `version=0`、`equippedSkinId=1`、`ownedSkinIds=[1]` 和四项碎片均为
`0`。对外返回排序后的副本，不能把模块内可变对象直接暴露给 handler 或客户端。

Redis 继续使用 S2R 已创建的同一个 HASH。S3 实施后的允许字段为：

| field | 编码 |
|---|---|
| `coinBalance` | S2R 已有的非负安全整数十进制字符串 |
| `equippedSkinId` | 合法 `skinId` 十进制字符串 |
| `ownedSkinIds` | 升序、去重的 JSON 数组，例如 `[1,401]` |
| `fragmentBalances` | 四个固定 skin ID 的 JSON 对象，例如 `{"133":0,"401":12,"403":0,"411":0}` |

不写 `version`、`sId`、请求 ID、run、状态或时间戳。`version` 只用于当前进程内刷新 UI，
不是 Redis 并发控制。读取时必须解析并完整校验 JSON；损坏值不能直接进入客户端或玩法。

所有修改在一个同步调用中完成：

- `equip(skinId)`：目录存在且已拥有时更新装备；重复装备同一皮肤直接返回当前快照。
- `unlock(skinId)`：仅接受四款碎片皮肤；余额足够时扣门槛并加入拥有集合。
- 已拥有皮肤再次解锁直接返回当前快照，不再次扣碎片。
- 非法 ID、未拥有装备或碎片不足返回领域错误，profile 保持不变。
- 每次真实变化后 `version + 1`；同一 Node.js 事件循环内不会出现半写状态。

## RPC 与玩法接入

> ⛔ **待拍板 A（[README §9.1](README.md#91-三项必须先拍板的问题)，未定不进 S3-1）**：不变量 8
> 「catalog hash 不一致时禁止外观经济写」目前**没有活的判据**——战斗路径调
> `resolveServerBattleSkin(requestedSkin)` 不传 `peerHash`，而形参默认值就是本进程常量，比对恒真；
> `canWriteSnakeSkinCosmetics` 生产调用点为 0；Snake wire 里也没有客户端上报皮肤目录 hash 的通道
> （`layerHashes`/`configHash` 是 ruleset 配置 hash，不是皮肤目录 hash）。下面三个接口若不带
> `catalogHash`，S3 落地后该不变量将被静默架空。选项：① `equip`/`unlock` 请求加必选 `catalogHash`
> （要改域 descriptor 与向量 sidecar，**形状定了不好改**）；② 显式承认该判据只在文档层并降级不变量 8。

`snakeCosmetic` demo Feature 只需要三个接口：

```text
snakeCosmetic.getSnapshot()
snakeCosmetic.equip(skinId)
snakeCosmetic.unlock(skinId)
```

服务端从认证上下文取得 `uid`，客户端不能提交账号身份。首次 `getSnapshot` 在 profile 尚未载入时
按字段白名单 `HMGET` 并填充模块级缓存；后续请求直接使用当前进程内值。接口不要求持久请求记录；网络重试依靠
操作自身的结果幂等性：重复装备是 no-op，重复解锁已拥有皮肤不会再次扣碎片。

客户端在发起 Snake join 前调用这个普通 Lobby RPC 预热 profile。Redis 不可用时仍返回默认 profile；
这不是 `GameRoom` 的异步准入 hook，也不会修改通用房间生命周期。

真人进入 Snake 时，mode 复用现有认证身份映射，在创建实体前同步读取 profile：

```text
认证 uid
  -> 读取已由 Lobby RPC 预热的进程内 profile；未预热则使用默认值
  -> 校验 equippedSkinId 仍存在且已拥有
  -> 非法时回退皮肤 1
  -> 把 skinIdAtRunStart 写入当前房间内 run
  -> 创建蛇实体
```

run 中换装只影响下一次新 run。当前真人复活、宽限重连和当前结果页继续使用
`skinIdAtRunStart`；客户端 join 数据中的皮肤值始终无效。

## 客户端

衣柜页面提供：

- 全部、已拥有、未拥有、可合成四种筛选。
- 16 套皮肤的动态 head/body/tail 预览与稳定 fallback。
- 装备、碎片进度和合成按钮；不展示未实现的购买按钮。
- 默认皮肤、已装备状态、稀有度和获取方式。
- 设备本地 `snakeCosmetic.viewedSkinIds.v1`，仅用于红点；损坏或写失败时降级为内存状态，
  不影响服务端 profile。

Logic 保持无引擎依赖，View 通过既有动态 FGUI 注册入口打开。生成文件仍只能由 feature/gameplay codegen 与
sync 命令刷新。

## 实施任务

### S3-01：冻结 demo catalog

> ⚠ **真源订正（2026-09-05 核对）**：业务投影**不在 shared**，而是服务端生成物
> `apps/server/src/rooms/modes/snake/skinBusinessCatalog.generated.ts`，其值由
> `tools/snake-s1-assets/core.mjs` 硬编码产出，`--write` 重生；`skinBusinessCatalog.ts` 的 validator
> 当前**主动拒绝**任何被填值的业务字段（`rarity`/`acquisition`/`fragmentItemId`/… 必须是
> `{state, value:null}`），这是设计好的 S1→S3 门禁，注释写明「S3 更新业务值时仍从这里扩展」。
> ⛔ 不要按旧措辞去 `apps/shared` 另手写一份业务目录——那会造出第二份目录并绕开公共 hash。

- [ ] 改 `tools/snake-s1-assets/core.mjs` 产出 16 套真实业务值（展示名、稀有度、获取方式、
      四项碎片门槛），跑 `node tools/snake-s1-assets/cli.mjs --write` 重生服务端业务目录。
- [ ] 放宽 `skinBusinessCatalog.ts` validator 的 approved 分支（保留 fail-closed 缺省），并翻转
      `SNAKE_SKIN_COSMETIC_WRITES_ENABLED`。
- [ ] **同批**更新 `apps/server/test/snake-s1-assets.test.ts` 里被硬钉的
      `SERVER_SNAKE_SKIN_BUSINESS_HASH` 与 `canWriteSnakeSkinCosmetics(...) === false` 断言，
      否则服务端测试直接红；新 hash 回写专项 README §8 与 `evidence/s1`。
- [ ] 验证目录 ID 唯一、默认皮肤唯一、fallback 无环且皮肤没有玩法数值字段。

### S3-02：实现 profile、Redis 投影与 RPC

- [ ] 新增模块级 profile store、Redis codec 和 `getSnapshot/equip/unlock` descriptor/handler。
- [ ] 首次读取尝试回灌；写操作先更新内存，再 best-effort `HSET` 完整相关字段。
- [ ] 覆盖默认值、非法/损坏 Redis、未拥有、碎片边界、重复操作和返回副本测试。

### S3-03：接入 Snake mode

- [ ] 在 Snake 自有目录内把认证 `uid` 交给同步皮肤 resolver，并锁存 `skinIdAtRunStart`。
- [ ] 不修改通用 `GameMode` / `GameRoom`，不从 join 数据读取皮肤。

### S3-04：完成衣柜 Logic / View

- [ ] 完成筛选、预览、装备、合成、错误提示和设备本地红点。
- [ ] 资源缺失稳定回退皮肤 1；页面关闭后释放输入和监听。

### S3-05：验证与同步

- [ ] 运行 codegen、shared/client/Cocos sync、双端 typecheck、客户端/FGUI/服务端测试。
- [ ] 把 Creator 3.8.8 的动态预览和交互证据留给 S5。

## 验收条件

- [ ] Redis 只使用 `gp:snake:user:{uid}`，字段严格限制为本阶段允许的
  `coinBalance/equippedSkinId/ownedSkinIds/fragmentBalances`。
- [ ] Redis 投影不含 `sId`；JSON 字段稳定排序且损坏输入安全回退。
- [ ] 默认、装备、解锁、碎片门槛、重复操作和非法请求在当前进程内结果正确。
- [ ] join 自报皮肤无效；run 中换装不改变当前蛇，下一 run 才采用新装备。
- [ ] 四款碎片皮肤精确扣门槛并保留超额，其他皮肤没有合成入口。
- [ ] 16 套预览、筛选、fallback、本地红点和 View/Logic 边界通过自动测试。
- [ ] 受限的通用房间文件没有差异，生成镜像新鲜。

## Demo 限制

- Redis 写成功时，进程重启后的首次 snapshot 可回灌拥有、碎片和装备；写失败期间的变化会丢失。
- 多进程实例各自缓存 profile，可能出现旧值覆盖；本 demo 不处理跨实例并发。
- 不提供历史查询、跨设备同步或生产资产保证。
- 本阶段完成只能表述为“Demo 衣柜与装备可内部试玩”。

## 证据回写

| 状态 | commit | 自动验证 | Creator 证据 | 备注 |
|---|---|---|---|---|
| `[已拍板·待实施]` | - | - | - | 内存先记，单 HASH best-effort Redis 投影 |

---

[上一阶段：S2R Demo 金币复活](s2r-reliable-coin-relive.md) ·
[专项索引](README.md) · [下一阶段：S4 Demo 养成奖励](s4-reliable-progression-rewards.md)
