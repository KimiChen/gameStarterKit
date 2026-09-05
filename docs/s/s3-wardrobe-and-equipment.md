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

S1 已冻结的 16 个稳定 `skinId` 继续作为唯一目录。下表是 **S3-1 已落地的冻结值**
（真源 `tools/snake-s1-assets/core.mjs` 的 `SNAKE_S3_DEMO_BUSINESS`，生成到服务端业务目录）。

> ⚠ **语义纠偏（2026-09-05 回源原作后修订）**：这 16 个 ID 在原作里是 `Constant.internalSkinIds`
> ——**「贴图随包内置、跳过 CDN 下载」的资源本地性白名单** + AI 蛇换皮池，**不是**稀有度分组或商店档位；
> 原作里它们分属不同系列。原作的皮肤业务目录（名称/稀有度/获取方式/价格/碎片）**全部由服务端下发**，
> 客户端包内没有静态业务表。⇒ 下表除标注「原作实测」的格子外**均为本仓自设**，
> ⛔ 不得对外声称是原作口径。

**稀有度采用原作 6 档制**（`0 普通 / 1 稀有 / 2 史诗 / 3 传说 / 4 典藏 / 5 至臻`，旧字母名
`C/B/A/S/SS/SSS`；出处 `ShowConstant.js` 的 `RARE_LEVEL_NAMES` / `RARE_LEVEL_OLD_NAMES`，
值域由 `PrefabUtil` 钳制到 0..5）。demo 只用到 `0..3`，`4 典藏` / `5 至臻` 无对应皮肤，属**有意留空**。

| `skinId` | 展示名 | 稀有度 | Demo 获取方式 | 合成门槛 |
|---:|---|---:|---|---:|
| `1` | **小红**（原作实测 `defaultSkinName`） | `0` 普通 | `default` 默认拥有（原作实测：无条件授予） | - |
| `2` | *（原作无名，留技术占位）* 角色：组队**蓝队**皮肤 | `0` 普通 | `levelUnlock` | - |
| `3` | *（原作无名）* 角色：组队**黄队**皮肤 | `0` 普通 | `levelUnlock` | - |
| `4` | *（原作无名）* 角色：组队**粉队**皮肤 | `0` 普通 | `levelUnlock` | - |
| `10` | *（原作无名）* 角色：`challengeSkinId` 挑战蛇 | `1` 稀有 | `locked` 暂不开放 | - |
| `11` | *（原作无名）* 角色：`teamBossSkinId` 组队 Boss | `1` 稀有 | `locked` 暂不开放 | - |
| `101` | *（原作无名）* | `2` 史诗 | `achievementUnlock` | - |
| `111` | *（原作无名）* | `1` 稀有 | `locked` 暂不开放 | - |
| `112` | *（原作无名）* | `1` 稀有 | `locked` 暂不开放 | - |
| `132` | *（原作无名）* | `1` 稀有 | `achievementUnlock` | - |
| `133` | *（原作无名）* | `2` 史诗 | `fragmentCraft` | `300` |
| `139` | *（原作无名）* | `2` 史诗 | `achievementUnlock` | - |
| `401` | *（原作无名）* | `2` 史诗 | `fragmentCraft` | `10` |
| `403` | *（原作无名）* | `2` 史诗 | `fragmentCraft` | `120` |
| `411` | *（原作无名）* | `3` 传说 | `fragmentCraft` | `300` |
| `701` | **招财喵**（原作实测，⚠ 是「喵」不是「猫」） | `3` 传说（**原作实测** `worth_level=3`） | `achievementUnlock` | - |

**展示名口径**：全归档带名字的皮肤记录只有 `701/702/703`（`FeedGameStore.js` 的
`bounty_config.skin_list`，其中 `702 小恐龙` / `703 猫耳睡衣` **不在**冻结 16 之列），
另有 `Constant.js` 的 `defaultSkinName = "小红"` 对应皮肤 `1`。⇒ 只有 `1` 与 `701` 是
`state: "approved"`，其余 14 个保留 S1 技术占位 `皮肤 N`（`state: "technical-draft"`）。
⛔ **不要为它们编造产品名**——按 2026-09-05 拍板「展示名全部使用原作实测值」，无实测即不命名。

**获取方式与碎片门槛是本仓自设**：原作两者均由服务端下发，全归档 `chip_infos: [有内容]` 与
`has_chip: 1` 命中均为 **0**。⚠ 已知差异一处：`701` 的原作实测获取方式是
`get_method=5 happyCoin`「赏金模式专属」、售价 1e6 快乐币；demo 没有快乐币系统，故仍用
`achievementUnlock`。

默认皮肤 `1` 始终视为拥有。所有皮肤保持 `saleState: "off-sale"`；本阶段没有购买入口、价格或重复物品转换
（`ownershipItemId` / `fragmentItemId` / `price` 三项**继续 fail-closed**，validator 拒绝任何填值）。
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

> ✅ **拍板 A（2026-09-05，结论见 [README §9.1](README.md#91-三项拍板结论2026-09-05-用户拍板已生效)）：
> 采用「服务端单方面权威」。** 下面三个接口的入参**只有 `skinId`，⛔ 不加 `catalogHash`**，
> 也不引入「客户端自报、服务端采信」的信任方向。
>
> 安全性可证：判定材料全在服务端——公共目录加载期保证 ID 唯一与默认皮肤唯一、查不到即拒；
> 业务值（价格、碎片门槛）**只存在于服务端生成物**，客户端没有这份数据、骗不出低价；owned 集合服务端读写。
>
> 不变量 8 此前描述的跨端 hash 比对**双端都是死判据**（服务端 `resolveServerBattleSkin` 与客户端
> `resolveClientSnakeSkinPresentation` 的 hash 形参默认值都等于本进程常量，全部生产调用点都不传该参）。
> 它今后应锚到真正活着的 `SNAKE_SKIN_COSMETIC_WRITES_ENABLED` 与双端加载期 fail-closed。
> ⛔ 实施时不要删 `canWriteSnakeSkinCosmetics`——S3-01 要**保留并启用**它。

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

- [x] 新增模块级 profile store 与 Redis codec（`rooms/modes/snake/cosmeticProfile.ts`）。
- [x] 首次读取按白名单 `HMGET` 回灌（每 uid 只打一次 Redis，失败也记，避免每次 RPC 重打）；
      写操作先更新内存，再 best-effort 单条 `HSET` 写三个 cosmetic field。
      ⛔ 不合并 `coinBalance`——两条 fire-and-forget 路径各持过期快照，合并写会互相覆盖，留到 S4。
- [x] 覆盖默认值、非法/损坏 Redis、未拥有、碎片边界、重复操作和返回副本测试（12/12）。
- [ ] `getSnapshot/equip/unlock` 的域 descriptor / 向量 sidecar / 三个 ws 端点（**必须同批提交**）。

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

| 阶段 | 状态 | commit | 自动验证 | Creator 证据 | 备注 |
|---|---|---|---|---|---|
| S3-01 | `[已完成]` | 本次 | `snake-s1-assets` 7/7（含新增 fail-closed 与展示名口径用例）；服务端 typecheck 0 错；`evidence/s1` `shasum -c` 29/29 | 不适用 | 业务层 hash `9ed3762e…fa19` → **`b851e345…9d2c`**；public `a1cdecbc…b075` 与 client `8615596a…d629` **未变** |
| S3-02（服务端 store 部分） | `[已完成]` | 本次 | `snake-cosmetic-profile` 12/12；`verify:all` exit 0（client 427/427、server 560/560） | 不适用 | 新建 `rooms/modes/snake/cosmeticProfile.ts`；白名单 `HMGET` 回灌、单条 `HSET` 只写三个 cosmetic field、读函数深拷贝 |
| S3-02（RPC 域与端点部分） | `[已拍板·待实施]` | - | - | - | 域 descriptor + 向量 sidecar + 三个 ws 端点**必须同批**（README §9.2 陷阱 2） |
| S3-03～05 | `[已拍板·待实施]` | - | - | - | 内存先记，单 HASH best-effort Redis 投影 |

> ⚠ **`SNAKE_SKIN_COSMETIC_WRITES_ENABLED` 仍为 `false`**，S3-01 有意不翻转它：按 §9.1-A，它现在是
> 不变量 8 的锚点，在 equip/unlock 写路径落地（S3-02/S3-03）之前翻转会让该锚点宣称一个不存在的能力。
>
> ⚠ **S3-01 重钉了 `docs/s/evidence/s1`**：业务层与 S1 三层目录由同一个生成器产出，改业务值必然重写
> S1 证据包（`catalog-hashes.json` / `provenance.json` / `README.md` / `SHA256SUMS` 等）。
> 这是允许的——S1 工具的 `--write`/`--check` 是 repo-only，可重钉；⛔ 与 `evidence/s0` 不同
> （后者不可重生成，见 [S0](s0-replication-baseline.md) 开头补注）。

---

[上一阶段：S2R Demo 金币复活](s2r-reliable-coin-relive.md) ·
[专项索引](README.md) · [下一阶段：S4 Demo 养成奖励](s4-reliable-progression-rewards.md)
