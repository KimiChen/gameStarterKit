# 07 · 接口契约、错误码与配置

前六篇讲「为什么」和「怎么设计」。本篇是**照着写代码时要查的东西**。

---

## 术语与命名统一

同一个概念在不同存储里有不同表示，**不要混淆**：

| 概念 | Redis | MySQL | TS |
|---|---|---|---|
| **per-uid 并发写 fence** | 计数器 key `fence:{uid}`（发号）<br>hash field `user:{uid}.fence`（上次写入者） | `user_currency.last_fence` | `uow.fence` |
| **单例任务领导权 fence** | —— | `singleton_lease.fence_token` | `lease.fenceToken` |
| **全局幂等 id** | `applied:{uid}` 的 member | `currency_ledger.idem_key`<br>`gameplay_outbox.op_id` | `opId` |

> 这两个 fence 是**不同的东西**：前者防同一玩家的并发写互相覆盖，后者防僵尸 leader 双写。别共用一个计数器。
>
> 同理，**lock fence 与 `token_epoch` 也不能是同一个计数器**：`fence` 每次抢锁递增（守并发写），`token_epoch` 仅封号/踢人时递增（守鉴权，落 MySQL `accounts`）。

---

## Redis key 全表

### durable 实例（`noeviction` + 纯 RAM）

| key | 类型 | TTL | 用途 |
|---|---|---|---|
| `user:{uid}` | HASH | **无** | 玩法档【真源】。含 `fence` / `ver` / `schemaVersion` |
| `bag:{uid}:{0..3}` | HASH | **无** | 背包分片，field = `itemId`，value = count |
| `fence:{uid}` | STRING | **无** | per-uid 锁 fence 单调计数器。**永不过期、永不重置** |
| `applied:{uid}` | ZSET | **无**（按窗口裁剪） | 幂等已 apply 集合，member = `op_id`，score = applyTs |
| `sess:{uid}` | HASH | 3d | `{connId, gwNode, tokenEpoch, loginTs}` |
| `lock:{uid}` | STRING | PX 5s | 值 = fence；`SET NX PX` 抢锁 |
| `idem:{scope}:{key}` | STRING | 见下 | 幂等占位 |
| `rank:{type}:{season}` | ZSET | 赛季后设 TTL | member = uid，score = `encodeScore()` |
| `rank_sub:{type}:{season}` | HASH | 赛季后设 TTL | field = uid，value = JSON 展示信息 |
| `lb:dedup:{matchId}:{uid}` | STRING | 7d | 结算去重（**必须 per (matchId, uid)**） |
| `active:lru:{bucket}` | ZSET | **无** | 活跃索引，member=uid, score=lastActiveMs。⚠️ hash-tag 是 `{bucket}` 不是 `{uid}`，**寻址规则不同**（[08](./08-cold-archive.md)） |
| `stream:match` | STREAM | **无**（`XTRIM MINID` 按落库位点裁） | 对局证据链（P7），consumer group 消费落 `match_results`。⚠️ 跨用户 key，不与 `{uid}` 同槽；裁剪 owner = 证据链消费者（09·K6） |
| `stream:mailwake` | STREAM | **无**（`XTRIM MINID`，⛔ 禁 MAXLEN） | 邮件实时唤醒（M5/M6）。投递状态权威在 MySQL `mail`（A6），流丢了客户端上线自拉 |
| `rl:{scope}` | HASH | 动态（`cap/rate×2`） | 令牌桶限流（`tokenBucket` Lua）。scope：`login:{ip}` / `rpc:{uid}`；匿名用 sessionId（G5） |

> **不变量**：`user:{uid}` / `bag:*` / `fence:{uid}` / `applied:{uid}` **无 TTL** —— 权威数据，任何驱逐 = 数据丢失。
> 协调类 key（`lock` / `idem` / `sess`）按用途设短 TTL，这不违反上面的不变量。
>
> ⛔ **`thaw:{uid}` 已废弃** —— 冻结/解冻/玩法写/清理任务共用同一把 `lock:{uid}`（[08](./08-cold-archive.md)）。

### cache 实例（`allkeys-lru`，物理独立）

| key | 类型 | TTL | 用途 |
|---|---|---|---|
| `cache:currency:{uid}` | HASH | 5m | 货币**只读缓存**，真源在 MySQL。miss 即回源重建 |
| `cache:rankview:*` | STRING | 30s | 榜单展示缓存 |
| `negcache:user:{uid}` | STRING | 10s | 不存在用户的负缓存。**读点必须在 `EXISTS user` 之后**，建号成功立即失效 |

> ⚠️ 货币缓存**物理拆到独立 key + 独立实例**，⛔ 不要混进 `user:{uid}`。
> 否则 handler 容易误把缓存里的 `coin` 当权威直接 `HSET`，绕开 ledger → 违反 [P1](./02-failure-patterns.md)/[P5](./02-failure-patterns.md)。

### 幂等占位的两个状态

[P4](./02-failure-patterns.md) 的「短租约」指的是 **pending 哨兵**，不是结果缓存：

| 状态 | value | TTL | 说明 |
|---|---|---|---|
| pending | `__PENDING__:{holderId}` | `IDEM_PENDING_MS` = **10s** | 执行中。崩溃后租约自然失效，可被后续请求安全抢占 |
| done | `{"ok":true,...}` 结果 JSON | `IDEM_RESULT_MS` = **60s** | 已完成，重放直接回结果 |

⛔ **绝不用 24h 长 TTL 做 pending** —— 进程在写 pending 后崩溃会把用户卡死 24 小时。

---

## Lua 脚本清单

所有脚本用 `EVALSHA` + `NOSCRIPT` 自动重载。

| 脚本 | KEYS | 返回 | 用途 |
|---|---|---|---|
| `applyEffect` | `user`, `applied`, `bag:0..N-1` | `ok` \| `dup` \| **`cold`** | outbox intent apply。**幂等，无 fence CAS**（[04](./04-cross-store-outbox.md)） |
| `casHset` | `user:{uid}` | `ok` \| `stale` \| **`cold`** | 交互式玩法写。**fence CAS**（[03](./03-gateway-data-layer.md)） |
| `casDel` | `lock:{uid}` | `1` \| `0` | 释放锁，校验持有者 |
| `tokenBucket` | `rl:{scope}` | 剩余令牌 | 限流。**内部用 `redis.call('TIME')`**，不接受 app 传入时钟 |
| `freezeCommit` | `lock`,`user`,`fence`,`applied`,`bag*` | `ok` \| `lost` \| `changed` | 冻结：复检锁归属+ver → `UNLINK`（[08](./08-cold-archive.md)） |
| `thawRestore` | 同上 | `ok` \| `lost` | 解冻：复检锁归属 → 原子恢复全部 key |
| `casRenew` | `lock:{uid}` | `1` \| `0` | 看门狗续租：仍持有（值==fence）才 PEXPIRE（L6 支撑件，M2 增补） |
| `createUser` | `user:{uid}` | `ok` \| `exists` | 建号原子创建（R2 两个合法创建点之一；另一个是 thawRestore） |
| `rankUpsert` | `rank`,`rank_sub` | 新 score | 排行累加：ZSCORE→floor→+delta→重算 frac→ZADD + HSET（K1，M7 增补） |

> ⛔ **`cold` = `user:{uid}` 不存在。** 任何写路径都**不得隐式创建** `user:{uid}`——只有「建号」和「thaw」能创建。
> 收到 `cold` → `await ensureLive(uid)` → 重试。见 [08](./08-cold-archive.md)。

### `casDel`（释放锁）

```lua
-- KEYS[1] = lock:{uid}   ARGV[1] = 我持有的 fence
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

### `casHset`（交互式玩法写）

```lua
-- KEYS[1] = user:{uid}
-- ARGV[1] = fence, ARGV[2..] = field/value 交替
if redis.call('EXISTS', KEYS[1]) == 0 then return 'cold' end   -- ⛔ 绝不隐式建档（08）
local cur = tonumber(redis.call('HGET', KEYS[1], 'fence') or '0')
if cur > tonumber(ARGV[1]) then return 'stale' end     -- 僵尸写被拒（P6）

for i = 2, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i+1])
end
redis.call('HSET',    KEYS[1], 'fence', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'ver', 1)
return 'ok'
```

---

## TS 接口契约

```ts
// ───────── 锁与工作单元 ─────────
export interface Lease {
  readonly fence: number;
  release(): Promise<void>;                    // 内部走 casDel
}

/** 进程内 per-uid 串行队列。await 排队，⛔ 不轮询。 */
export function localMutex<T>(uid: string, fn: () => Promise<T>): Promise<T>;

/** 跨实例 Redis 锁 + fence。抢不到抛 BusyError，由上层有界重试。 */
export function acquireLease(uid: string): Promise<Lease>;

/** 低层原语：localMutex + acquireLease。freeze/thaw/清理任务/withUser 全部走它，同 uid 串行。 */
export function withUserLock<T>(uid: string, fn: (fence: number) => Promise<T>): Promise<T>;

export function withUser<T>(uid: string, fn: (uow: UnitOfWork) => Promise<T>): Promise<T>;

// ───────── 冷档（08）─────────
/** 确保 user:{uid} 在 Redis 中可用；必要时 thaw。收到 Lua 的 `cold` 后调用。 */
export function ensureLive(uid: string): Promise<void>;
export type UserState = 'LIVE' | 'FROZEN' | 'ARCHIVE_NEWER' | 'ABSENT';
/** 锁内按 fence 新鲜度判定权威方。 */
export function resolve(uid: string): Promise<{ kind: UserState; row?: ArchiveRow }>;

export class UnitOfWork {
  readonly uid: string;
  readonly fence: number;
  /** 按需取字段。⛔ 禁止 HGETALL。缺失字段返回 null。 */
  loadFields(fields: string[]): Promise<Record<string, string | null>>;
  set(field: string, value: string): void;     // 显式脏标，⛔ 不用 Proxy 魔术拦截
  commit(): Promise<void>;                     // 走 casHset
  discard(): void;
}

// ───────── 只读路径（不取锁、不进脏表）─────────
export function readUser(uid: string): Promise<UserView>;
export function readUserReadonly(targetUid: string): Promise<PublicUserView>;  // 冻结对象

export interface UserView       { uid: string; level: number; power: number; star: number; ver: number }
export interface PublicUserView { uid: string; level: number; power: number }   // 不含私有字段

// ───────── 跨存储 outbox ─────────
export type Grant =
  | { kind: 'item';     itemId: number; count: number }
  | { kind: 'star';     delta: number }
  | { kind: 'setField'; field: string; value: string };
export type Effect = Grant[];

export function deriveOpId(uid: string, type: string, clientReqId: string): string;
export function redisApply(uid: string, opId: string, effect: Effect): Promise<'ok' | 'dup' | 'cold'>;
export function markOutboxDone(opId: string): Promise<void>;
export function bumpAttempts(opId: string, err: string): Promise<void>;
export function readBack(uid: string, opId: string): Promise<PurchaseResult>;

// ───────── 排行 ─────────
export function encodeScore(intScore: number, tsSec: number): number;
export function decodeScore(score: number): number;
export function selfEntry(type: string, season: string, uid: string): Promise<RankEntry>;
```

> `markOutboxDone` 是唯一名字（早期草稿里的 `markDone` 已废弃）。

---

## 错误码表

`RpcReply.err = { code, msg }`。客户端按 `code` 分支，⛔ 不要解析 `msg`。

| code | HTTP 类比 | 触发 | 客户端建议动作 |
|---|---|---|---|
| `AUTH_REQUIRED` | 401 | 无 token / token 失效 | 重新 `wx.login` |
| `AUTH_EPOCH_STALE` | 401 | `token.epoch < accounts.token_epoch`（被踢/改密） | 重新登录 |
| `ACCOUNT_BANNED` | 403 | `accounts.status = 1` | 显示封禁提示，不重试 |
| `RATE_LIMITED` | 429 | 令牌桶耗尽 | 退避后重试 |
| `INVALID_PAYLOAD` | 400 | zod 校验失败 | 修 bug，不重试 |
| `UNKNOWN_TYPE` | 404 | 路由表无此 type | 提示升级客户端，**不计 flood** |
| `INSUFFICIENT_BALANCE` | 402 | 余额不足 | 引导充值 |
| `BUSY` | 409 | 抢 `lock:{uid}` 失败 | **自动重试**（同一 `clientReqId`） |
| `STALE_FENCE` | 409 | `casHset` 返回 `stale` | **自动重试** |
| `IN_PROGRESS` | 202 | 幂等 pending 哨兵命中 | 短轮询 |
| `GRANTING` | 202 | 钱已扣、道具发放中 | 显示「发放中」，轮询 `shop.queryOp` |
| `THAWING` | 202 | 冷档解冻中 / 解冻限流（[08](./08-cold-archive.md)） | 显示加载态，**退避比 `IN_PROGRESS` 更长** |
| `USER_DATA_LOST` | 500 | `accounts` 有号但档全无 | ⛔ 不建空档；立即告警 |
| `INTERNAL` | 500 | 未分类 | 退避重试 |

### 异常 → code 映射

```ts
const ERR_MAP = new Map<Function, string>([
  [BusyError,           'BUSY'],
  [StaleFenceError,     'STALE_FENCE'],
  [InsufficientOrStale, 'INSUFFICIENT_BALANCE'],   // ⚠️ 见下
  [BannedError,         'ACCOUNT_BANNED'],
  [EpochStaleError,     'AUTH_EPOCH_STALE'],
]);
```

> ⚠️ `InsufficientOrStale` 是**两种原因合一**（余额不足 / fence 被抬高）。
> 上层要区分：先 `SELECT balance` 判断是不是真的不足；不是就当 `STALE_FENCE` 自动重试。
> **建议直接拆成两个异常**，在 `UPDATE` 前先读一次余额。
> ✅ 实现已采纳拆分：`InsufficientBalanceError` / `StaleFenceError`（`core/errors.ts`，M6）。
> `GRANTING` 在实现中是 `shop.purchase`/`shop.queryOp` 的 **data.status = 'granting'**（04 的响应形状），
> 不是 err.code——客户端见该状态即显示「发放中」并轮询。

---

## 配置与环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `WX_APPID` / `WX_SECRET` | — | 微信小游戏凭证。**走 KMS / Secret Manager，不进代码库** |
| `WX_CODE2SESSION_URL` | `https://api.weixin.qq.com/sns/jscode2session` | |
| `MYSQL_URL` | — | `mysql://user:pw@host:3306/game`（本地栈默认 `mysql://root@127.0.0.1:3316/game`） |
| `MYSQL_POOL_SIZE` | `20` | |
| `REDIS_DURABLE_URL` | — | `noeviction` + 纯 RAM 实例（开源 Redis，无 tiering） |
| `REDIS_CACHE_URL` | — | `allkeys-lru` 实例（**物理独立**） |
| `REDIS_ROUTE_FILE` | `redis-route.yaml` | 16384 桶 → 实例路由表 |

### 常量

| 常量 | 值 | 出处 |
|---|---|---|
| `LOCK_TTL_MS` | 5000 | 必须 **> 货币事务 p99 延迟** |
| `LOCK_RETRY_MAX` | 3 | 有界重试，⛔ 不无限递归 |
| `IDEM_PENDING_MS` | 10_000 | 短租约（P4） |
| `IDEM_RESULT_MS` | 60_000 | 结果缓存 |
| `SESS_TTL_S` | 259_200 | 3d |
| `OUTBOX_RETENTION_MS` | 86_400_000 | 24h |
| `APPLIED_RETENTION_MS` | 172_800_000 | **≥ 2 × OUTBOX_RETENTION** |
| `OUTBOX_MAX_ATTEMPTS` | 10 | 超过进死信 |
| `RELAYER_POLL_MS` | 1000 | |
| `RELAYER_VISIBILITY_S` | 5 | `created_at < NOW(3) - INTERVAL 5 SECOND` |
| `LEASE_TTL_S` | 15 | `singleton_lease` |
| `BAG_SHARDS` | 4 | **改变即需数据迁移** |
| `BUCKETS` | 16384 | **永不改** |
| `SEASON_BASE` | 赛季起始 epoch 秒 | 每赛季独立 |
| `SEASON_LEN_S` | 赛季秒数 | `encodeScore` 分母 |
| `COLD_DAYS` | **90** | ⚠️ 必须 >> `max(OUTBOX_RETENTION_MS, APPLIED_RETENTION_MS)`；且要**避开月度回流周期**（30 天恰好压在上面，抖动最大化） |
| `FREEZE_ENABLED` | `used_memory/maxmemory > 0.6` | ⚠️ **内存水位驱动，不是注册数**（[08](./08-cold-archive.md)） |
| `FREEZE_RATE` | 50 uid/s **per-instance**，峰期 0 | 按字段预算动态调 |
| `WHALE_FIELDS` | 2000 | 超过则用 `HSCAN` 分块读，别 `HGETALL` |
| `THAW_RATE` | **1000 uid/s per-instance** | 瓶颈是 Redis 的多 KB `HSET`，不是 MySQL 点查 |
| `LOCK_RENEW_MS` | 2000 | freeze/thaw 的看门狗续租周期 |
| `ACTIVE_LRU_BUCKETS` | 256 | `active:lru:{bucket}` 分片数 |
| `WX_TIMEOUT_MS` | 3000 | code2session HTTP 超时（M3 增补） |
| `WX_BREAKER_THRESHOLD` / `WX_BREAKER_OPEN_MS` | 5 / 10_000 | code2session 熔断：连续失败 N 次断路 |
| `LOGIN_RATE_CAPACITY` / `LOGIN_RATE_REFILL_PER_S` | 5 / 0.2 | 登录限流独立严格档（按 IP） |
| `TOKEN_BYTES` | 24 | token 随机段字节数。token 形如 `{uid}.{hex}`——uid 前缀供网关反查（G1），库里只存整串 sha256，⛔ 仍不是 JWT |
| `MAX_WS_PAYLOAD_BYTES` | 65536 | ws transport 层 `maxPayload` 硬上限（G4，M5 增补） |
| `RPC_RATE_CAPACITY` / `RPC_RATE_REFILL_PER_S` | 20 / 10 | RPC per-user 令牌桶（env 可调） |
| `HANDLER_TIMEOUT_MS` | 10_000 | handler 超时 race（⚠ 不取消副作用，G9） |
| `LB_DEDUP_TTL_MS` | 7d | `lb:dedup` 去重键 TTL（M7 增补，暂在 rankService.ts） |

### MySQL 服务器配置

```ini
binlog_format = ROW              # RC 会话隔离级别的前提
transaction_isolation = REPEATABLE-READ   # 默认；货币/outbox 会话切 RC
sql_mode = STRICT_TRANS_TABLES,...        # 保持严格模式
```

### 依赖

| 包 | 版本 | 备注 |
|---|---|---|
| Node.js | ≥ 22（现用 25） | `node:sqlite` 需 22.5+ |
| `colyseus` 系列 | `^0.17.0` | 已有 |
| `ioredis` | `^5` | **新增** |
| `mysql2` | `^3` | **新增**，用 `mysql2/promise` |
| `zod` | `^4.1` | 已有 |
| `uuid` | `^11` | **新增**，`uuidv5` 派生 `op_id` |

> ⚠️ **`max_allowed_packet`**：`mysql2` 默认 16MB。鲸鱼档的 `user_archive.snapshot` 可达 MB 级，**单档必须小于它**，否则 `INSERT` 直接失败。
| crc32 | 任选 | 分桶路由 |

---

## ⛔ 待拍板（阻塞实现）

| 项 | 影响 |
|---|---|
| **Sentinel vs Cluster** | Cluster 下跨用户多键操作 `CROSSSLOT`（排行 hydrate、全服发奖） |
| **rating 算法** | Elo vs Glicko-2 → `rank_award` / `rank_snapshot` 表结构 |
| **多端登录策略** | 单端互踢 vs 多端 → `sess:{uid}` 是单值还是多会话；互踢需**原子换发协议**防双方互撤 |
| **SQLite→MySQL cutover 顺序** | 见 [05 迁移 runbook](./05-mysql8-schema.md#存量迁移-runbook-sqlite--mysql--redis)，双写期权威归属已定，但**排期未定** |

---

## 验收阈值（开工前填空）

[README 的两个前置实测](./README.md#-开工前必须先做的两件事)和 [06 的 SLA](./06-capacity-and-ops.md#运维必须签字的-sla) 都要求「实测」，但**没有数字就无法判定通过与否**。开工前把下表填满：

| 项 | 目标值 | 谁负责 | 状态 |
|---|---|---|---|
| 目标峰值 CCU | ______ | 产品 | ⬜ |
| 目标充值 / 结算 QPS | ______ | 产品 | ⬜ |
| 货币事务 p99 延迟上限 | ______ ms | 后端 | ⬜ |
| `LOCK_TTL_MS` 是否 > 上一行 | ______ | 后端 | ⬜ |
| Colyseus 0.17 能否定向建房 | 支持 / 不支持 | 后端 | ⬜ |
| Redis failover RPO 上界 | ______ s | 运维 | ⬜ |
| Redis 冷启动 RTO 上界 | ______ min | 运维 | ⬜ |
| 单档平均大小（决定容量） | ______ KB | 后端 | ⬜ |
| DR 演练：真的恢复过一次 | 是 / 否 | 运维 | ⬜ |

### 最小验收测试清单

- [ ] 并发双发同一 `clientReqId` 的购买 → 只扣一次钱、只发一次货
- [ ] 阶段 1 提交后 kill 进程 → relayer 重启后道具送达
- [ ] 阶段 2 后、阶段 3 前 kill → relayer 重放判 `dup`，不重复发货
- [ ] 锁过期期间并发写 → 后到的低 fence 写被 `casHset` 拒绝
- [ ] 僵尸 relayer（暂停超 `LEASE_TTL_S` 后恢复）→ 守卫 UPDATE 0 行，自杀，不写业务表
- [ ] 封号后旧 token 立即失效（`token_epoch`），且不能重新登录
- [ ] 大 Hash 用户登录 → 无 `HGETALL`，慢查询日志干净
- [ ] Redis 主动 failover → 货币零丢失；玩法丢失量 ≤ 承诺 RPO
