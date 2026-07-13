# 04 · 跨存储 outbox 协议

## 问题

有两个权威源：

- **货币** → MySQL 8.0
- **玩法状态（道具/背包）** → Redis

一个「花 100 金币买道具」的请求要**同时**改两边。它们之间**不可能做 XA / 2PC**。

朴素写法必然出事：

- 先扣钱后发货，中间崩溃 → **扣了钱没发货**
- 先发货后扣钱，中间崩溃 → **发了货没扣钱**（白送）

---

## 解法

> **MySQL 作协调者 + outbox intent，Redis 作幂等下游副作用，靠崩溃重放收敛。**

### 两条不变式

| 不变式 | 靠什么保证 |
|---|---|
| **永不「扣了钱没发货」** | intent 与扣钱**同一个 MySQL 事务**落盘；relayer 必定补发 |
| **永不「发了货没扣钱」** | Redis apply **严格在扣钱提交之后**才执行 |

**最坏情况只是延迟**（玩家看到钱少了、道具晚几秒到），绝不丢、不双花。

### 为什么货币先行

顺序由「哪一侧的变更丢了不可逆」决定：货币必须是权威同步 MySQL 事务（[P1](./02-failure-patterns.md)），而发道具的前提是**钱已确定扣掉**。

→ **买入类（扣钱 + 发道具）强制货币先行。**

---

## ⚠️ fence 不参与 outbox apply

这是最容易写错的一点。

| 写路径 | 幂等靠什么 | 是否 fence CAS |
|---|---|---|
| 交互式玩法写（`withUser` + Lua） | —— | ✅ **要**。这是 read-modify-write，必须防僵尸写覆盖新状态 |
| **outbox intent apply** | `op_id` 原子去重 | ❌ **不要** |

**为什么 outbox apply 不能被 fence 拒绝：**

`lock:{uid}` 是 `PX 5s`，而 `withUser` 里包着一个同步 MySQL 事务。高负载下事务可能超过 5s → 锁过期 → 别的 writer 拿到更高 fence 并写入。

此时钱**已经在 MySQL 提交**、intent **已经 durable**。如果 relayer 拿 outbox 行里那个**旧 fence** 去做 CAS，会永远返回 `stale` → 反复重试 → **全部进死信，道具永远发不出去**。

> **已提交的 intent 是权威决定，必须落地。** 它的 exactly-once 由 `op_id` 去重保证，不需要也不能靠 fence。

### 顺带纠正一个概念

[P5](./02-failure-patterns.md) 说的「**绝对值覆写**」是针对**跨存储重放**（flush worker 重放 stream 时不能重加 delta）。

**单存储内，「`op_id` 原子去重 + `HINCRBY`」本身就是幂等的** —— 整条 Lua 原子执行，重放时第一步 `ZSCORE` 就命中 `dup` 直接返回。

所以：

- `grant`（发 3 瓶药）本质是**增量** → `HINCRBY`，靠 `op_id` 去重
- `setField`（设等级、设战力）是**绝对值** → `HSET`

---

## `Grant` / `Effect` 数据结构

```ts
/** 一次 intent 要产生的全部玩法副作用。货币不在此（走 MySQL）。 */
export type Grant =
  | { kind: 'item';     itemId: number; count: number }   // 增量：HINCRBY
  | { kind: 'star';     delta: number }                    // 增量：HINCRBY
  | { kind: 'setField'; field: string; value: string };    // 绝对值：HSET

export type Effect = Grant[];
```

### ⚠️ `setField` 的序保证：写前必须 `drainPendingFor`

`item` / `star` 是增量（HINCRBY），乱序重放**可交换**，结果不变；`setField` 是绝对值（HSET），
**不可交换**——若旧 intent 在阶段 2 前崩溃，用户后续操作又写了同字段，relayer 迟到重放会把
旧绝对值盖回去（序反转），且 applied 集合只防同 op 重复、防不了跨 op 乱序。

规则：**任何含 `setField` 的写操作，进入 `withUser` 锁后、发起新写之前，先调
`drainPendingFor(uid)`** 把该用户的 pending intent 按创建序吸干（apply + 标 done）。
崩溃窗口由此收敛为「锁内串行」：锁内 drain → 本次写 → relayer 即使迟到也只会判 dup。
`cold`（档冻结）直接上抛，⛔ 不在缺失档上造残档（09·R2）。

（回流自 Arthur 生产修复，Arthur commit `6940979`。）

### 背包存储布局

背包**不能**塞进 `user:{uid}` 主 Hash（大 Hash 的 `HGETALL` 会阻塞 Redis 单线程，见 [03](./03-gateway-data-layer.md)）。按固定分片拆开：

```
bag:{uid}:0 … bag:{uid}:3        HASH   field = itemId, value = count
                                 BAG_SHARDS = 4（固定，改变即需迁移）
shard = itemId % BAG_SHARDS
```

`{uid}` 是 hash-tag → `user` / `applied` / `bag:*` **全部同槽**，单条 Lua 可原子操作。

---

## `redisApply`：单条 Lua，幂等，**不做 fence CAS**

```lua
-- KEYS[1]              = user:{uid}
-- KEYS[2]              = applied:{uid}
-- KEYS[3 .. 2+N]       = bag:{uid}:0 .. bag:{uid}:N-1     (N = #KEYS - 2)
-- ARGV[1] = op_id      ARGV[2] = now_ms      ARGV[3] = effect(JSON string)

if redis.call('EXISTS', KEYS[1]) == 0   then return 'cold' end  -- ⛔ 冷档：绝不在缺失 hash 上建残档（08）
if redis.call('ZSCORE', KEYS[2], ARGV[1]) then return 'dup' end   -- 幂等：已 apply 过

local N   = #KEYS - 2
local eff = cjson.decode(ARGV[3])

for _, g in ipairs(eff) do
  if g.kind == 'item' then
    local shard = g.itemId % N
    redis.call('HINCRBY', KEYS[3 + shard], tostring(g.itemId), g.count)   -- 增量
  elseif g.kind == 'star' then
    redis.call('HINCRBY', KEYS[1], 'star', g.delta)                        -- 增量
  elseif g.kind == 'setField' then
    redis.call('HSET', KEYS[1], g.field, g.value)                          -- 绝对值
  end
end

redis.call('HINCRBY', KEYS[1], 'ver', 1)
redis.call('ZADD',    KEYS[2], ARGV[2], ARGV[1])    -- 记录已 apply
return 'ok'
```

返回值：`'ok'` / `'dup'` / `'cold'` —— **没有 `'stale'`**（intent 是权威决定，不受 fence 拒绝）。

> ⛔ **`cold` 极其重要。** 已冻结的 uid 仍会有后到的 outbox 行（赛季发奖、T+1 退款、GM 补偿都在冻结**之后**插入）。
> 若 `applyEffect` 在不存在的 hash 上直接 `HINCRBY`，会凭空造出一份只含 `star`/`ver=1` 的**残档**，
> 随后清理任务判它为热档、删掉真正的 archive → **整档丢失**。见 [08](./08-cold-archive.md)。

> `EVALSHA` 必须有 `NOSCRIPT` 兜底：Redis 重启 / 故障切换到未缓存脚本的实例时 script cache 会清空，收到 `NOSCRIPT` 要自动 `SCRIPT LOAD` 重载并重试。

### wrapper

```ts
const BAG_SHARDS = 4;

async function redisApply(uid: string, opId: string, effect: Effect): Promise<'ok' | 'dup' | 'cold'> {
  const keys = [
    `user:{${uid}}`,
    `applied:{${uid}}`,
    ...Array.from({ length: BAG_SHARDS }, (_, i) => `bag:{${uid}}:${i}`),
  ];
  // effect 从 MySQL JSON 列读出时 mysql2 已自动解析为 JS 对象 → 必须再 stringify
  return evalshaWithReload(APPLY_SHA, keys, [opId, String(Date.now()), JSON.stringify(effect)]);
}
```

> ⚠️ **`mysql2` 默认把 `JSON` 列自动解析成 JS 对象。** relayer 从 `gameplay_outbox.effect` 读出来的是对象，不是字符串。
> 统一在 `redisApply` 内部 `JSON.stringify`，不要在调用处各写各的。

---

## `applied:{uid}` 的裁剪窗口

```
ZREMRANGEBYSCORE applied:{uid} -inf (now - APPLIED_RETENTION)
```

**`APPLIED_RETENTION` 必须严格大于 `OUTBOX_RETENTION`**，且留足安全余量：

```
APPLIED_RETENTION = OUTBOX_RETENTION
                  + relayer 轮询间隔
                  + 可见延迟 (NOW(3) - INTERVAL 5 SECOND)
                  + 时钟偏移余量
```

否则 relayer 重放一条老 intent 时 `applied` 里已经没记录 → **二次 apply**（重复发货）。

> ⚠️ 口径差：`applied` 的 score 是 **apply 时刻**，`gameplay_outbox` 按 **`created_at`** 老化。二者近似但不等。
> 建议 `APPLIED_RETENTION ≥ 2 × OUTBOX_RETENTION`，简单且安全。

---

## `gameplay_outbox` 表

```sql
CREATE TABLE gameplay_outbox (
  op_id       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id     VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  effect      JSON NOT NULL,
  status      TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- 0 pending / 1 done / 2 dead
  attempts    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(255) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (op_id),
  KEY idx_pending (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

> ⚠️ **`status` 是 `TINYINT`，全篇一律用数字常量 `0/1/2`。**
> 往 `TINYINT` 插字符串 `'pending'`，MySQL 8.0 默认 `sql_mode` 含 `STRICT_TRANS_TABLES` → 直接抛 **1366 Incorrect integer value**，每一次购买都失败。

```ts
export const OUTBOX_PENDING = 0;
export const OUTBOX_DONE    = 1;
export const OUTBOX_DEAD    = 2;
```

- **`op_id` 不存 `fence` 列** —— outbox apply 不做 fence CAS（见上）。
- `op_id` 是**全操作唯一幂等键**，同时用作 `currency_ledger.idem_key` 与 Redis `applied:{uid}` 的 member。**三处同一个 id**，串起整条链路。

---

## `op_id` 怎么来

声明是「服务端生成、不信客户端」，但幂等重试又要求**重试用同一个 `op_id`**。两者用**确定性派生**调和：

```ts
import { v5 as uuidv5 } from 'uuid';
const OP_NS = 'a3f1...';   // 固定 namespace UUID

/** 服务端派生：同一 (uid, type, clientReqId) 永远得到同一个 op_id，且客户端无法跨用户碰撞。 */
export function deriveOpId(uid: string, type: string, clientReqId: string): string {
  return uuidv5(`${uid}:${type}:${clientReqId}`, OP_NS);
}
```

- 客户端只提供 `clientReqId`（自己生成的 UUID），**不提供 `op_id`**。
- 客户端**重试必须复用同一个 `clientReqId`** → 服务端派生出同一个 `op_id` → 幂等生效。
- 客户端换了 `clientReqId` = 一笔新交易，语义正确。

---

## 购买 RPC

```ts
// 请求
{ id: '<rpcId>', type: 'shop.purchase', payload: { clientReqId: string; sku: string } }

// 响应
{ id, ok: true, data: {
    opId: string;
    status: 'done' | 'granting';   // granting = 钱已扣、道具发放中
    balance: number;
    granted?: Effect;
} }
```

阶段 1 提交后、阶段 2 完成前有一个**中间态窗口**：玩家看到钱少了、道具没到。

- 服务端返回 `status: 'granting'`
- 客户端显示「**发放中**」，轮询下面的查询接口
- **永不丢，只延迟。** ⛔ 客户端不要做「超时即失败」的判断

```ts
// 状态查询
{ type: 'shop.queryOp', payload: { opId: string } }
→ { data: { status: 'granting' | 'done' | 'dead'; balance: number } }
```

---

## 协议实现

```ts
async function purchase(uid: string, sku: Sku, clientReqId: string) {
  const opId  = deriveOpId(uid, 'shop.purchase', clientReqId);
  const price = sku.price;
  const effect: Effect = sku.grants;

  return withUser(uid, async (uow) => {

    // ───── 阶段 1：MySQL 事务 —— 扣钱 与 发货意图 原子落盘 ─────
    const outcome = await mysqlTx(async (tx) => {
      // 幂等去重：ODKU no-op（⛔ 绝不用 INSERT IGNORE）
      const led = await tx.exec(
        `INSERT INTO currency_ledger (user_id, idem_key, currency, delta, balance_after, reason)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE id = id`,
        [uid, opId, CUR_COIN, -price, 0, 'shop.purchase']);
      if (led.affectedRows === 0) return 'DUP';        // 重复请求 → 幂等返回

      // 原子扣减 + 余额守卫 + fence 守业务写（P6）
      const upd = await tx.exec(
        `UPDATE user_currency
            SET balance = balance - ?, version = version + 1, last_fence = ?
          WHERE user_id = ? AND currency = ? AND balance >= ? AND last_fence <= ?`,
        [price, uow.fence, uid, CUR_COIN, price, uow.fence]);
      if (upd.affectedRows === 0) throw new InsufficientOrStale();  // 干净失败，Redis 未动

      // durable intent —— 与扣钱同事务
      await tx.exec(
        `INSERT INTO gameplay_outbox (op_id, user_id, effect, status)
         VALUES (?,?,CAST(? AS JSON),?)`,
        [opId, uid, JSON.stringify(effect), OUTBOX_PENDING]);

      return 'OK';
    });

    if (outcome === 'DUP') return await readBack(uid, opId);

    // ───── 此刻：钱已权威扣除，且发货意图已持久，二者原子 ─────

    await redisApply(uid, opId, effect);              // 阶段 2：幂等 apply（无 fence）
    await markOutboxDone(opId);                        // 阶段 3：best-effort
    return await readBack(uid, opId);
  });
}
```

> `led` / `upd` 都是 `mysql2` 的 `ResultSetHeader`。**`affectedRows` 在返回结果上，不在连接对象上** —— 没有 `tx.affectedRows` 这种东西。
>
> ODKU 的 `affectedRows` 语义：**插入 = 1，`id=id` 命中重复 = 0**，真实更新 = 2。

### 锁过期怎么办

`withUser` 的 `lock:{uid}` 是 `PX 5s`，里面包着 MySQL 同步事务。若事务超时导致锁过期：

- 另一个 writer 拿到更高 fence，先做了货币操作 → `last_fence` 被抬高
- 本次事务的 `UPDATE ... WHERE last_fence <= :f` **受影响 0 行** → 抛 `InsufficientOrStale` → **整个事务 ROLLBACK**（ledger 行也一并回滚）
- **干净失败，客户端用同一 `clientReqId` 重试即可**

这是正确行为，不是数据损坏。但仍应保证 **`lock` TTL > 货币事务的 p99 延迟**，否则失败率会很难看。

---

## 崩溃窗口分析

| 崩溃点 | 结果 | 收敛方式 |
|---|---|---|
| 阶段 1 事务提交前 | 钱没扣、intent 没落、Redis 没动 | 干净失败，客户端重试（`op_id` 幂等） |
| 阶段 1 提交后、阶段 2 前 | 钱已扣、intent 已 durable、道具没发 | **relayer 必定补发**（幂等） |
| 阶段 2 执行中 | Lua 原子，要么全做要么没做 | relayer 重放，`applied` 判 `dup` 跳过 |
| 阶段 2 后、阶段 3 前 | 道具已发，outbox 仍 pending | relayer 重放 → `dup` → 标记 done |

**任何时刻都不会出现「扣了钱永久没发货」或「发了货没扣钱」。**

---

## relayer（崩溃收敛）

**单例进程**，用 `singleton_lease` + `fence_token`（[P6](./02-failure-patterns.md)，DDL 见 [05](./05-mysql8-schema.md)）。

```ts
// 会话切 RC 缩小间隙锁；需 binlog_format=ROW
await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');

while (running) {
  await renewLeaseOrDie();          // 守卫 UPDATE 与业务写同事务（P6）

  const rows = await conn.query(
    `SELECT op_id, user_id, effect FROM gameplay_outbox
      WHERE status = ? AND created_at < NOW(3) - INTERVAL 5 SECOND
      ORDER BY created_at, op_id
      LIMIT 100
      FOR UPDATE SKIP LOCKED`, [OUTBOX_PENDING]);   // 8.0 原生，支持多 worker 并行

  for (const row of rows) {
    try {
      let r = await redisApply(row.user_id, row.op_id, row.effect);
      if (r === 'cold') {                       // ⚠️ 该 uid 已被冻结
        await ensureLive(row.user_id);          //    先解冻，再重试（08）
        r = await redisApply(row.user_id, row.op_id, row.effect);
      }
      if (r !== 'ok' && r !== 'dup') throw new Error(`apply=${r}`);
      await markOutboxDone(row.op_id);
    } catch (e) {
      await bumpAttempts(row.op_id, String(e));               // 仅真失败才累加
    }
  }
  await sleep(RELAYER_POLL_MS);
}
```

> ⚠️ **relayer 不走 `withUser`**，扫到的 outbox 行可能属于一个已冻结的 uid（赛季发奖、T+1 退款、GM 补偿都在冻结**之后**插入新行）。
> 必须处理 `cold` → `ensureLive` → 重试。见 [08](./08-cold-archive.md)。

### 死信

`attempts > OUTBOX_MAX_ATTEMPTS` 的行 → `status = OUTBOX_DEAD` + 告警 + 人工介入。

> ⚠️ **dead 行的人工处置契约**：必须通过**重放**（走 `redisApply`，由 `applied` 去重）解决，
> ⛔ 不得手工把 `status` 直接改成 `done` —— 那会让「已发货」的假设与事实脱节。

**不要无限重投** —— 毒消息会卡死消费者、pending 无限增长。

> 注意：`redisApply` **不会**返回 `stale`，所以不存在「合法状态被当成失败累加进死信」的问题。
> 真正会进死信的是：Redis 连不上、Lua 报错、`effect` 结构非法。

---

## 反向操作：clawback

反作弊判定作弊后要撤回非法所得。**按存储分头**：

| 撤回什么 | 怎么做 |
|---|---|
| 货币 | MySQL 冲正：新 `op_id`，插一条负向 `currency_ledger` + `UPDATE balance` 同事务 |
| 道具 / 段位 | Redis 补偿：新 `op_id` 走同一条 outbox 协议，`effect` 是反向增量（`count` 为负） |

> ⚠️ 玩法的「撤销」**不是「恢复 MySQL 旧值」**（MySQL 里没有玩法历史）——只能**前向补偿**。
>
> 若需要「回滚到某个时点」的能力（bug 批量写坏一批用户、反作弊追溯 3 天前的战力暴涨），
> 就必须让关键玩法变更也走**不可变事件流**（绝对值快照）。
> **这是「玩法真源 = Redis」的已知代价**，见 [06 · 已知代价](./06-capacity-and-ops.md)。

⛔ 扣道具时注意负数下溢：Lua 里对 `item` 分支加 `HINCRBY` 后检查结果 `< 0` 则回补到 0 并记录异常（或用 `HGET` 先读再 `HSET` 绝对值）。

---

## 什么时候**不**需要 outbox

只改 Redis、不碰钱的请求（打完一关加经验、升级战力、日常任务进度）**直接走 `withUser` + fence CAS 的玩法写 Lua**，不要引入 outbox 的复杂度。

outbox 只服务于**跨两个权威源**的操作：

- 扣钱 + 发道具（购买、付费抽卡）
- 发奖（赛季奖励里既有货币又有道具）
- 退款 + 回收道具

---

## 相关

- 函数签名、错误码、常量清单 → [07 · 接口契约与配置](./07-contracts-and-config.md)
- `singleton_lease` / `currency_ledger` DDL → [05](./05-mysql8-schema.md)
