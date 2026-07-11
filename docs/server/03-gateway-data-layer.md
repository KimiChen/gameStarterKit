# 03 · 网关数据层（取数 / 排位）

本篇讲**非房间**部分：WS 网关如何取用户数据、改玩法状态、读写排行榜，以及为什么**进程重启用户数据不会丢**。

设计借鉴生产项目 `aisanguo-server`（PHP/Swoole 游戏服务端），但**反转了它的持久化定位**。

---

## 核心范式：进程不持有任何权威状态

> **进程只是无状态执行器。**

`aisanguo` 靠三根支柱做到「重启不丢」，我们照搬这三条：

1. **数据落点固定** —— 一个用户 = 一个 Redis Hash。进程内存里的对象只是**投影**，重启即清空，下次 `load(uid)` 冷加载恢复。
2. **写入边界 = 每个业务请求**（不是定时快照）—— `lock → load → mutate → commit / rollback` 是**单一提交边界**。
3. **停服不做「最后落库」** —— SIGTERM 只排空在途请求就退出。这恰恰**反证**了写在每次请求时就已经落了。

**崩溃最多丢「当前那一条尚未 commit 的请求」。** 已提交的全在 Redis / MySQL。

> ⚠️ 我们与 `aisanguo` 的关键差异：它把 Redis 当**唯一**真源、`load` miss 时判定「查无此人」不回源。
> 我们：**货币在 MySQL，玩法在 Redis**；货币 miss 必须**回源 MySQL 重建缓存**。

---

## Redis key 一览

完整表见 [07 · Redis key 全表](./07-contracts-and-config.md#redis-key-全表)。这里只列本篇要用的。

### durable 实例（`noeviction` + 纯 RAM）

```
user:{uid}                 HASH   无 TTL   玩法档【真源】。含 fence、ver、schemaVersion 字段
bag:{uid}:{0..3}           HASH   无 TTL   背包分片，field = itemId, value = count
fence:{uid}                STRING 无 TTL   per-uid 锁 fence 单调计数器（永不过期、永不重置）
applied:{uid}              ZSET   无 TTL   幂等已 apply 集合，member=op_id, score=applyTs（按窗口裁剪）
sess:{uid}                 HASH   TTL 3d  {connId, gwNode, tokenEpoch, loginTs}
lock:{uid}                 STRING PX 5s   值 = fence；SET NX PX 抢锁
idem:{scope}:{key}         STRING 见 07   幂等占位（pending 10s / 结果 60s）
rank:{type}:{season}       ZSET           member=uid, score=encodeScore(intScore, tsSec)
rank_sub:{type}:{season}   HASH           field=uid, value=JSON(展示信息)
```

### cache 实例（`allkeys-lru`，**物理独立**）

```
cache:currency:{uid}       HASH   TTL 5m  货币【只读缓存】，真源在 MySQL。miss 即回源重建
```

`{uid}` 是 **hash-tag**：Redis Cluster 只对花括号内内容算 slot，上述 per-user key 全部同槽，单条 Lua 才能原子操作。

> **不变量**：`user:{uid}` / `bag:*` / `fence:{uid}` **无 TTL** —— 权威数据，任何驱逐 = 数据丢失。
> 协调类 key（`lock` / `idem` / `sess`）按用途设短 TTL，这不违反上面的不变量。

> ⚠️ **货币缓存放 cache 实例、用独立 key**，⛔ 不要混进 `user:{uid}`，也不要放 durable。
> 否则 handler 容易误把缓存里的 `coin` 当权威直接 `HSET`，绕开 ledger → 违反 [P1](./02-failure-patterns.md)/[P5](./02-failure-patterns.md)。

---

## RPC dispatcher

客户端 join 共享 `LobbyRoom` 后，所有取数/排位请求走**单一 `rpc` 消息通道**。

Colyseus 的 `send`/`onMessage` 是「按类型的单向消息」，**没有请求/响应配对**，所以要自己加 correlation id：

```ts
// 信封
interface RpcEnvelope { id: string; type: string; payload: unknown }
interface RpcReply    { id: string; ok: boolean; data?: unknown; err?: { code: string; msg: string } }

// LobbyRoom.onMessage('rpc', (client, msg) => dispatch(ctx, msg))
// 中间件链：鉴权 → 限流 → zod 校验 → 幂等占位 → handler
```

handler 独立成文件：`handlers/user.ts`、`handlers/rank.ts`、`handlers/mail.ts` …

### 必须踩住的几个坑

| 坑 | 后果 | 修法 |
|---|---|---|
| `MAX_MESSAGE_BYTES` 在 dispatcher 里检查 | 大包**已经**吃过内存/带宽才被拒 | 在 ws transport 层设 `maxPayload`，硬上限超限直接断帧不解码 |
| 令牌桶用 app 节点传入的 `nowMs` | 多节点时钟漂移污染 refill | Lua 内用 `redis.call('TIME')` 取单一权威时钟 |
| `auth: 'optional'` 的 `userId = null` | 所有匿名连接共享 `rl:null` 桶 → **跨用户连坐 DoS**；幂等空间串味读到别人结果 | 匿名用 `sessionId` / 真实 IP 作 key，**禁止 null 塌缩** |
| 未知 `type` 一律计 flood 并封禁 | 灰度期新老客户端并存必然出现「对端不认识的 type」→ **误封** | 未知 type 只回错误 + 低权重计数；引入协议版本协商与弃用期 |
| handler 超时用 `Promise.race` | JS 无法真正取消，handler 仍在后台跑并可能完成副作用 | 关键写副作用必须在数据层做幂等/CAS，不依赖应用层取消 |

---

## `withUser`：每请求工作单元

### 读写分路（重要）

> **只读路径不取分布式锁。** 每次看档都抢一把跨实例锁是纯浪费。

```ts
// 只读：不取锁、不进脏表 —— 借 aisanguo 的 loadOnlyRead 思想
routeTable['user.getInfo'] = (ctx) => readUser(ctx.uid).then(u => u.toClientDTO());

// 读别人的档（看主页 / 榜详情）：返回冻结对象，不注册脏追踪
routeTable['user.getProfile'] = (ctx, m) => readUserReadonly(m.targetUid);
```

读别人的档**必须**用 readonly 加载。一个请求里可能 load 多个 uid，普通 load 出来的对象任何赋值都会被 flush，会把别人的档一起写回。

### 写路径

```ts
async function withUser<T>(uid: string, fn: (uow: UnitOfWork) => Promise<T>): Promise<T> {
  return localMutex(uid, async () => {          // ① 进程内 per-uid async 队列（不轮询）
    const lease = await acquireLease(uid);       // ② 跨实例 Redis 锁 + fence
    const uow = new UnitOfWork(uid, lease.fence);
    try {
      const r = await fn(uow);
      await uow.commit();                        // ③ 单一提交边界
      return r;
    } catch (e) {
      uow.discard();                             // 没 commit 就没写，天然不落
      throw e;
    } finally {
      await lease.release();                     // Lua CAS 校验 fence 再 DEL
    }
  });
}
```

**两层锁的分工：**

- `localMutex(uid)` —— 单进程内 event loop 上同一 uid 的请求排队。**用 async mutex / promise 队列，不要忙轮询**（Node 单 loop 上 `sleep(200)` 重试是纯空转）。
- `acquireLease(uid)` —— 跨网关实例的 Redis 锁 + fence token。**有界重试 + 超时**，不要无限递归。

```ts
async function acquireLease(uid: string): Promise<Lease> {
  const fence = await durable.incr(`fence:{${uid}}`);            // 单调递增（lock fence）
  const ok = await durable.set(`lock:{${uid}}`, fence, 'NX', 'PX', LOCK_TTL_MS);
  if (!ok) throw new BusyError();                                 // 由上层【有界】重试
  return { fence, release: () => casDel(uid, fence) };            // Lua：值匹配才 DEL
}
```

- `fence:{uid}` 是**永驻计数器**（no-TTL），与 `user:{uid}` 里的 `fence` 字段是**两个东西**：前者发号，后者记录「上次写入者的 fence」供 CAS 比对。
- 抢锁失败时 `INCR` 已经消耗掉一个号 —— **这是安全的**：fence 只需单调，不需连续；下一个成功者拿到更大的号。不会漏锁、不会泄漏。

> **锁中途过期不需要看门狗续租。** fence 会在业务写处拦下僵尸写（[P6](./02-failure-patterns.md)）。
>
> ⚠️ **这句话只对 `casHset` 成立** —— 它有 fence CAS。冷档冻结的 `UNLINK` 和解冻的批量 `HSET` **不是 fence 守卫的写**，
> 必须在 Lua 里复检锁归属 + 看门狗续租，见 [08 · 锁会过期](./08-cold-archive.md#但仅有锁还不够锁会过期)。

> ⚠️ 另外 `LOCK_TTL_MS` **必须大于货币事务的 p99 延迟**（`withUser` 里包着同步 MySQL 事务）。
> 否则锁频繁过期 → 货币 `UPDATE ... WHERE last_fence <= :f` 大量 0 行 → 干净失败但失败率难看。
> 见 [04 · 锁过期怎么办](./04-cross-store-outbox.md#锁过期怎么办)。

---

## `UnitOfWork`

### 脏追踪必须是「每 RPC 作用域」的

> ⛔ **绝不用 module 级全局脏表。**
>
> `aisanguo` 用进程级全局静态脏表 + PHP `__set` 魔术方法自动记脏，正确性建立在「uid 悲观锁把 action 串行 + 每 action 清空全局态」上。
>
> **Node 单 event loop 上并发 async handler 在 `await` 点交错**：module 级可变脏表会在你的 `await redis.hmget` 与 `await redis.hset` 之间被**另一个玩家的 RPC 改写** → 跨用户串脏，**把 A 的改动 flush 进 B**。

```ts
class UnitOfWork {
  private dirty = new Map<string, string>();   // 作用域对象，绝不是单例
  constructor(readonly uid: string, readonly fence: number) {}

  /** 按需取字段。⛔ 禁止 HGETALL（见下）。缺失字段为 null。 */
  async loadFields(fields: string[]): Promise<Record<string, string | null>> {
    // ⚠️ ioredis 的 hmget 返回 (string|null)[]，与请求字段【顺序对齐的数组】，不是对象
    const vals = await durable.hmget(`user:{${this.uid}}`, ...fields);
    return Object.fromEntries(fields.map((f, i) => [f, vals[i]]));
  }

  set(field: string, value: string) { this.dirty.set(field, value); }   // 显式，不用 Proxy 魔术拦截

  async commit() {
    if (this.dirty.size === 0) return;
    // 单条 Lua casHset：fence CAS + 只写脏字段 + bump ver。返回 'stale' 时抛 StaleFenceError
    const r = await casHset(this.uid, this.fence, this.dirty);
    if (r === 'stale') throw new StaleFenceError();
  }

  discard() { this.dirty.clear(); }
}
```

### ⛔ 禁止 `HGETALL` 全量 load

**Redis 是单线程。** 背包上千字段的大 Hash，一次 `HGETALL` 是 O(N)，会阻塞**整个实例**几毫秒到几十毫秒，期间所有其他用户的所有命令排队。

> **唯一例外**：冷档冻结 worker（[08](./08-cold-archive.md)）——用户已冷、不在热路径、有限速、只在低峰跑，且鲸鱼档要走 `HSCAN` 分块。

晚高峰大量重度玩家并发进入，每个 `withUser` 触发一次全量读 → 单线程被大 key 反复霸占 → 全实例 p99 飙升。Cluster 迁移该 slot 时 `MIGRATE` 大 key 会直接卡死迁移。

**修法：**

- 按需 `HMGET` 只取本次要用的字段
- 背包这类大集合从用户主 Hash **拆成独立 key 或分页**（`bag:{uid}:{page}`）
- 容量规划按「**最大**玩家 Hash × 并发」估阻塞，不是按均值

### 内存开销的取舍

hashtable 编码下**每个字段有 ~90–110B 的固定 dict 开销**（`dictEntry` + key sds + value sds + jemalloc 对齐），与 payload 无关。

`aisanguo` 那种 100–200 个独立字段做脏追踪，光字典就 15KB/用户。

> **字段级脏追踪省的是写放大，付的是内存。**
>
> 建议**混合**：热标量字段级（`level`、`power`、`fence`、`ver`）+ 冷大集合 blob 化（背包/邮件/成就 → 少数 JSON field 或独立 key）。

---

## 玩法写：`casHset`（交互式，带 fence CAS）

交互式玩法写是 **read-modify-write**，必须防僵尸写覆盖新状态。走一条带 fence CAS 的 Lua：

```lua
-- KEYS[1] = user:{uid}
-- ARGV[1] = fence, ARGV[2..] = field/value 交替
if redis.call('EXISTS', KEYS[1]) == 0 then return 'cold' end  -- ⛔ 绝不隐式建档（08）
local cur = tonumber(redis.call('HGET', KEYS[1], 'fence') or '0')
if cur > tonumber(ARGV[1]) then return 'stale' end        -- P6：僵尸写被拒

for i = 2, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i+1])
end
redis.call('HSET', KEYS[1], 'fence', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'ver', 1)
return 'ok'
```

> **`EVALSHA` 必须有 `NOSCRIPT` 兜底。** Redis 重启 / 故障切换到未缓存脚本的实例时 script cache 会清空。
> 收到 `NOSCRIPT` 时自动 `SCRIPT LOAD` 重载并重试。

### 与 outbox 的 `applyEffect` 区分开

| | `casHset`（本篇） | `applyEffect`（[04](./04-cross-store-outbox.md)） |
|---|---|---|
| 场景 | 交互式玩法写（加经验、升战力） | 已提交的 outbox intent |
| fence CAS | ✅ 有 | ❌ **无** |
| 幂等 | 无（靠锁串行） | `applied:{uid}` 的 `op_id` |
| `EXISTS` 前置 | ✅ 有（返回 `cold`） | ✅ 有（返回 `cold`） |

> **两者都不得隐式创建 `user:{uid}`。** 收到 `cold` → `await ensureLive(uid)` 解冻 → 重试。见 [08](./08-cold-archive.md)。

> **已提交的 intent 是权威决定，必须落地**，不能被 fence 拒绝 —— 否则锁过期后会永远 `stale` 进死信。详见 04。

**货币绝不用 `HINCRBY` 做权威增量** —— 走 MySQL 事务，Redis 只在 cache 实例回填绝对值（[P5](./02-failure-patterns.md)）。

---

## 会话与撤销

- 会话态 `sess:{uid}`（TTL）与权威档 `user:{uid}`（no-TTL）**物理分离**。
- **踢人 / 顶号：删 `sess:{uid}` + `INCR token_epoch`（落 MySQL），绝不删 `user:{uid}`。**
- 网关重启后 `sess:*` 仍在 Redis；TTL 过期则客户端重连重建。**不碰权威数据。**

`token_epoch` 存三处并保持一致：MySQL `accounts` 行（权威）、Redis `sess:{uid}`、token 签发时写入。校验时 `token.epoch < account.token_epoch` 即失效。

---

## 排行榜

### 分数编码：时间戳进小数位做 tie-break

同分时「先达到者靠前」。把赛季内时间编码进 `score` 的小数部分：

```ts
const SEASON_BASE  = 1609459200;   // 本赛季起点(epoch 秒)
const SEASON_LEN_S = 30 * 86400;   // 本赛季长度(秒)

/** 同分时「先达到者靠前」：elapsed 越小 → frac 越大 → ZREVRANGE 排越前。 */
export function encodeScore(intScore: number, tsSec: number): number {
  const elapsed = Math.min(Math.max(tsSec - SEASON_BASE, 0), SEASON_LEN_S);
  const frac = (1 - elapsed / SEASON_LEN_S) / 10;    // 用满 0 ~ 0.1
  return intScore + frac;
}
export const decodeScore = (s: number) => Math.floor(s);
```

> ⚠️ **分母必须是赛季长度，不是绝对 epoch。**
> 早期写法 `(1 - (tsSec - BASE) / (tsSec + 1e9)) / 10` 的分母约 2.6e9，而赛季 elapsed 上限仅 ~2.6e6 秒 —— 比值只在 `0 ~ 0.001` 之间，`frac` 被压在 `0.0999 ~ 0.1`，**tie-break 分辨率几乎归零**（每秒 Δ ≈ 3.7e-11）。

> ⚠️ **累加分数不能直接 `ZINCRBY`** —— 那会破坏小数位的 tie-break 语义。
> 必须在**单条 Lua 里**原子完成：`ZSCORE` 取旧值 → `floor` 还原整数分 → 加 delta → 重算小数 → `ZADD` 覆写。

**精度上界**：double 有 52 位尾数。要保住 `frac` 的秒级分辨率（`1/(10 × SEASON_LEN_S)` ≈ 4e-7），`intScore` 应控制在 **~1e12 以内**，而不是贴着 `2^53`。赛季长度上限约 97 天（`2^23` 秒）。

### 取榜：两段式 + 补自己

避免 N+1：ZSET 只管排序，展示信息批量 hydrate。

```ts
async function getRank(type: string, season: string, uid: string, start: number, len: number) {
  const key = `rank:${type}:${season}`;
  const raw  = await durable.zrevrange(key, start, start + len - 1, 'WITHSCORES');
  const ids  = pairs(raw).map(([m]) => m);
  const subs = ids.length ? await durable.hmget(`rank_sub:${type}:${season}`, ...ids) : [];

  const list = ids.map((id, i) => ({
    rank: start + i + 1,
    uid: id,
    score: decodeScore(Number(pairs(raw)[i][1])),
    sub: JSON.parse(subs[i] ?? '{}'),
  }));

  // 自己未上榜 → 单独补一条放头部
  const myRank = await durable.zrevrank(key, uid);
  if (myRank === null) list.unshift(await selfEntry(type, season, uid));
  return list;
}
```

> ⚠️ **Cluster 下这段会 `CROSSSLOT` 失败**：`rank_sub` 的多个 uid 分散在不同 slot，批量 `HMGET` 直接报错。
> 这是 [Sentinel vs Cluster 决策](./README.md#仍待拍板)必须先拍板的原因之一。

### 赛季轮换与发奖

- key 内嵌周期标识：`rank:{type}:2026W28`。换季 = 写新 key，旧 key 设 TTL 自然回收，**不搬数据**。
- **发奖状态必须落 MySQL** `rank_award(season, uid)` UNIQUE，不要只存 Redis。
- **发奖不在结算瞬间直接发**：ranked 延迟到无头重放校验通过（[P7](./02-failure-patterns.md)）。
- 榜是**派生数据**：定期把 top-N 快照进 MySQL `rank_snapshot`，防 Redis 丢导致榜和领奖状态一起没。

### 去重键必须 per (matchId, uid)

一局有 ≥2 名玩家。若去重键只按 `matchId` 全局唯一，第二名玩家 `SETNX` 失败即被静默跳过 → **除首个玩家外全部丢更新**。

```
lb:dedup:{matchId}:{uid}      ✅
lb:dedup:{matchId}            ❌ 一局里只有一个人能改分
```

---

## 重启后会发生什么

| 组件 | 重启后 |
|---|---|
| 网关进程内存 | 清空（本来就只是投影） |
| `localMutex` 队列 | 清空（在途请求丢失，客户端重试） |
| `lock:{uid}` | 仍在 Redis，`PX 5s` 后自动过期 |
| `sess:{uid}` | 仍在 Redis；TTL 内可无缝续用，否则客户端重连重建 |
| `user:{uid}` 玩法档 | **仍在 Redis，完好** |
| 货币 | **仍在 MySQL，完好**；Redis 缓存 miss 则回源重建 |
| `gameplay_outbox` pending | relayer 重启后继续幂等重放，收敛 |

**崩溃最多丢：当前那一条尚未 commit 的请求。**

---

## 下一步

- 一个请求同时**扣钱（MySQL）+ 发道具（Redis）**怎么办？→ [04 · 跨存储 outbox 协议](./04-cross-store-outbox.md)
- `readUser` / `localMutex` / `casDel` / `Lease` 等的**完整签名**、错误码表、常量清单 → [07 · 接口契约与配置](./07-contracts-and-config.md)
