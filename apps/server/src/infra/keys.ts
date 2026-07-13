/**
 * Redis key 构造器 —— 与 [07 · Redis key 全表](../../../../docs/server/07-contracts-and-config.md#redis-key-全表) 一一对应。
 *
 * ⛔ 业务代码禁止手拼 key（09·R5：新增 key 必须先进 07 全表再进本文件）。
 *
 * `{...}` 是 Cluster hash-tag：per-user key 用 `{uid}` 同槽（09·R3），单条 Lua 才能原子操作；
 * `active:lru` 的 hash-tag 是 `{bucket}`（寻址规则不同，见 08）；
 * 跨用户 key（rank / stream:match）无 hash-tag，⛔ 不与 per-user key 进同一条 Lua。
 */
import { crc32 } from "node:zlib";
import { ACTIVE_LRU_BUCKETS, BAG_SHARDS } from "./config";

// ── durable 实例 ──────────────────────────────────────────────

/** 玩法档【真源】HASH，无 TTL。含 fence / ver / schemaVersion 字段。 */
export const kUser = (uid: string) => `user:{${uid}}`;
/** 背包分片 HASH（field=itemId, value=count），无 TTL。shard = itemId % BAG_SHARDS。 */
export const kBag = (uid: string, shard: number) => `bag:{${uid}}:${shard}`;
/** 全部背包分片（Lua KEYS 用，顺序 = shard 0..N-1）。 */
export const kBagAll = (uid: string) => Array.from({ length: BAG_SHARDS }, (_, i) => kBag(uid, i));
/** per-uid 锁 fence 单调计数器 STRING。永不过期、永不重置。 */
export const kFence = (uid: string) => `fence:{${uid}}`;
/** 幂等已 apply 集合 ZSET（member=op_id, score=applyTs），无 TTL、按窗口裁剪。 */
export const kApplied = (uid: string) => `applied:{${uid}}`;
/** 会话 HASH {connId, gwNode, tokenEpoch, loginTs}，TTL 3d。 */
export const kSess = (uid: string) => `sess:{${uid}}`;
/** per-uid 锁 STRING（值=fence），PX 5s。⛔ thaw:{uid} 已废弃，禁止第二把 per-uid 锁（09·L1）。 */
export const kLock = (uid: string) => `lock:{${uid}}`;
/** 幂等占位（07 `idem:{scope}:{key}`）。user 作用域的 key 带 `{uid}` hash-tag 与档同实例。 */
export const kIdem = (scope: string, key: string) => `idem:${scope}:${key}`;
export const kIdemUser = (scope: string, uid: string, sub: string) => `idem:${scope}:{${uid}}:${sub}`;
/** 限流令牌桶（07 Lua 清单 `rl:{scope}`）。匿名走 sessionId/IP，⛔ 禁止 null 塌缩（09·G5）。 */
export const kRl = (scope: string) => `rl:${scope}`;
/** 排行 ZSET（member=uid, score=encodeScore），赛季后设 TTL。跨用户 key。 */
export const kRank = (type: string, season: string) => `rank:${type}:${season}`;
/** 榜展示信息 HASH（field=uid, value=JSON）。跨用户 key。 */
export const kRankSub = (type: string, season: string) => `rank_sub:${type}:${season}`;
/** 省榜 ZSET（07 key 全表）。provinceEnc = encodeURIComponent(省名)——键段安全 ASCII。
 *  展示信息复用 rank_sub:{type}:{season}（同一用户展示一份）；省份数量不定 → TTL 由写路径
 *  逐次刷新（rankService.provKeyTtlSec），⛔ 不进 seasonRotation 遍历。跨用户 key。 */
export const kRankProv = (type: string, provinceEnc: string, season: string) =>
  `rank:${type}:prov:${provinceEnc}:${season}`;
/** 结算去重 STRING，TTL 7d。⚠ 必须 per (matchId, uid)（09·K2）。 */
export const kLbDedup = (matchId: string, uid: string) => `lb:dedup:${matchId}:${uid}`;
/** 活跃索引 ZSET（member=uid, score=lastActiveMs）。hash-tag 是 {bucket} 不是 {uid}。 */
export const kActiveLru = (bucket: number) => `active:lru:{${bucket}}`;
/** uid → active:lru 桶号（0..255）。⚠ 与 16384 路由桶是两套空间（09·S2：改分片数即迁移）。 */
export const activeLruBucketOf = (uid: string): number =>
  (crc32(Buffer.from(uid)) >>> 0) % ACTIVE_LRU_BUCKETS;
/** 对局证据链 STREAM。⛔ XTRIM MINID 按落库位点裁，禁止 MAXLEN（09·K6）。 */
export const K_STREAM_MATCH = "stream:match";
/** 邮件唤醒 STREAM（10·M5；⚠ 07 key 全表待补）。可靠流：⛔ 禁止 MAXLEN，XTRIM MINID
 *  按已投递位点裁（09·K6）。投递状态权威在 MySQL mail 表，流只作实时唤醒（09·A6）。 */
export const K_STREAM_MAILWAKE = "stream:mailwake";

// ── cache 实例（物理独立，09·R4） ─────────────────────────────

/** 货币只读缓存 HASH，TTL 5m，真源在 MySQL。⛔ 不混进 user:{uid}（09·A2）。 */
export const kCacheCurrency = (uid: string) => `cache:currency:{${uid}}`;
/** 榜单展示缓存 STRING，TTL 30s。 */
export const kCacheRankview = (sub: string) => `cache:rankview:${sub}`;
/** 不存在用户的负缓存 STRING，TTL 10s。读点必须在 EXISTS user 之后（09·F4）。 */
export const kNegcacheUser = (uid: string) => `negcache:user:{${uid}}`;
