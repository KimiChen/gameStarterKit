/**
 * Redis key 构造器 —— 与 [07 · Redis key 全表](docs/SERVER.md) 一一对应。
 *
 * ⛔ 业务代码禁止手拼 key（09·R5：新增 key 必须先进 07 全表再进本文件）。
 *
 * **全部键带 `${projectId}_` 运行时前缀**（config.REDIS_KEY_PREFIX，缺省 `gono_`）：
 * 多项目共用同一套本地/测试 Redis 实例时按项目隔离，07 全表登记的是去前缀的逻辑键名。
 * 前缀不含 hash-tag，`{...}` 语义不受影响；本文件是唯一拼接点，⛔ 别处不得再拼前缀。
 *
 * `{...}` 是 Cluster hash-tag：per-user key 用 `{uid}` 同槽（09·R3），单条 Lua 才能原子操作；
 * `active:lru` 的 hash-tag 是 `{bucket}`（寻址规则不同，见 08）；
 * 跨用户 key（stream:match）无 hash-tag，⛔ 不与 per-user key 进同一条 Lua。
 */
import { crc32 } from "node:zlib";
import { ACTIVE_LRU_BUCKETS, BAG_SHARDS, REDIS_KEY_PREFIX as P } from "./config";

// ── durable 实例 ──────────────────────────────────────────────

/** 玩法档【真源】HASH，无 TTL。含 fence / ver / schemaVersion 字段。 */
export const kUser = (uid: string) => `${P}user:{${uid}}`;
/** 背包分片 HASH（field=itemId, value=count），无 TTL。shard = itemId % BAG_SHARDS。 */
export const kBag = (uid: string, shard: number) => `${P}bag:{${uid}}:${shard}`;
/** 全部背包分片（Lua KEYS 用，顺序 = shard 0..N-1）。 */
export const kBagAll = (uid: string) => Array.from({ length: BAG_SHARDS }, (_, i) => kBag(uid, i));
/** per-uid 锁 fence 单调计数器 STRING。永不过期、永不重置。 */
export const kFence = (uid: string) => `${P}fence:{${uid}}`;
/** 幂等已 apply 集合 ZSET（member=op_id, score=applyTs），无 TTL、按窗口裁剪。 */
export const kApplied = (uid: string) => `${P}applied:{${uid}}`;
/** 会话 HASH {connId, gwNode, tokenEpoch, loginTs}，TTL 3d。 */
export const kSess = (uid: string) => `${P}sess:{${uid}}`;
/** per-uid 锁 STRING（值=fence），PX 5s。⛔ thaw:{uid} 已废弃，禁止第二把 per-uid 锁（09·L1）。 */
export const kLock = (uid: string) => `${P}lock:{${uid}}`;
/** 幂等占位（07 `idem:{scope}:{key}`）。user 作用域的 key 带 `{uid}` hash-tag 与档同实例。 */
export const kIdem = (scope: string, key: string) => `${P}idem:${scope}:${key}`;
export const kIdemUser = (scope: string, uid: string, sub: string) => `${P}idem:${scope}:{${uid}}:${sub}`;
/** 限流令牌桶（07 Lua 清单 `rl:{scope}`）。匿名走 sessionId/IP，⛔ 禁止 null 塌缩（09·G5）。 */
export const kRl = (scope: string) => `${P}rl:${scope}`;
/** 活跃索引 ZSET（member=uid, score=lastActiveMs）。hash-tag 是 {bucket} 不是 {uid}。 */
export const kActiveLru = (bucket: number) => `${P}active:lru:{${bucket}}`;
/** uid → active:lru 桶号（0..255）。⚠ 与 16384 路由桶是两套空间（09·S2：改分片数即迁移）。 */
export const activeLruBucketOf = (uid: string): number =>
  (crc32(Buffer.from(uid)) >>> 0) % ACTIVE_LRU_BUCKETS;
/** 对局证据链 STREAM。⛔ XTRIM MINID 按落库位点裁，禁止 MAXLEN（09·K6）。 */
export const K_STREAM_MATCH = `${P}stream:match`;
/** 邮件唤醒 STREAM（10·M5；⚠ 07 key 全表待补）。可靠流：⛔ 禁止 MAXLEN，XTRIM MINID
 *  按已投递位点裁（09·K6）。投递状态权威在 MySQL mail 表，流只作实时唤醒（09·A6）。 */
export const K_STREAM_MAILWAKE = `${P}stream:mailwake`;
/** 工会事件 seq STRING（INCR 单调，无 TTL）。hash-tag g<gid> 与 log 同槽。 */
export const kGuildEvtSeq = (gid: number) => `${P}guild:evt:seq:{g${gid}}`;
/** 工会事件近窗 LIST（LPUSH + LTRIM 上限 GUILD_EVT_LOG_MAX）。⛔ 非可靠流非权威——
 *  增量通知载体，窗口外客户端全量刷新（shared lobbyRpc/guild.ts 窗口语义）。 */
export const kGuildEvtLog = (gid: number) => `${P}guild:evt:log:{g${gid}}`;

// ── cache 实例（物理独立，09·R4） ─────────────────────────────

/** 货币只读缓存 HASH，TTL 5m，真源在 MySQL。⛔ 不混进 user:{uid}（09·A2）。 */
export const kCacheCurrency = (uid: string) => `${P}cache:currency:{${uid}}`;
/** 不存在用户的负缓存 STRING，TTL 10s。读点必须在 EXISTS user 之后（09·F4）。 */
export const kNegcacheUser = (uid: string) => `${P}negcache:user:{${uid}}`;
