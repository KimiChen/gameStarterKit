/**
 * Redis key 构造器 —— 与 [07 · Redis key 全表](docs/SERVER.md) 一一对应。
 *
 * ⛔ 业务代码禁止手拼 key（09·R5：新增 key 必须先进 07 全表再进本文件）。
 *
 * **项目前缀**：全部键带 `${PROJECT_ID}_` 运行时前缀（config.REDIS_KEY_PREFIX，缺省 `gono_`）：
 * 多项目共用一套 Redis 实例时按项目隔离，07 全表登记的是去前缀的逻辑键名。本文件是唯一拼接点。
 *
 * **区前缀（docs/DUAL_MODE.md §3.5，M13 每区独立经济）**：per-user 玩法/经济键在项目前缀后再叠
 * **区上下文前缀** `s{sId}_`（`P()` 读 `zoneCtx`）。分类是正确性关键、单形态测试测不到（sId=0 时
 * 两类前缀相等），务对照 §3.5：
 * - **per-zone（`P()`）**：user/bag/fence/applied/lock/idemUser/cache:currency/negcache/guild —— 角色档 + 每区经济。
 * - **全局（`G`，不带区前缀）**：`sess`（⚠ 登录时无区写、每 RPC 有区读——带区会前缀不一致致鉴权崩）、
 *   限流 `rl`（含登录 by-IP，前置区）、可靠流 `stream:*`（跨用户/跨区消费）。
 * - **暂全局待定**：`active:lru`（冷档索引，per-zone 化涉及登录 touchActive 的前置区上下文，留到 archive 步）。
 *
 * ⚠ 过渡期：`zoneCtx` 未设置即回退项目前缀（sId=0 语义，行为同现网）；多区硬化步改为
 * fail-fast + 全入口（LobbyRoom.messages / room / worker）`zoneCtx.run` 包裹，开 GROUP_ZONES 前必做。
 *
 * `{...}` 是 Cluster hash-tag：per-user key 用 `{uid}` 同槽（09·R3）；`active:lru` 用 `{bucket}`；
 * 跨用户 key（stream:match）无 hash-tag，⛔ 不与 per-user key 进同一条 Lua。区前缀不含 hash-tag，`{...}` 语义不受影响。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { crc32 } from "node:zlib";
import { ACTIVE_LRU_BUCKETS, BAG_SHARDS, GROUP_ZONES, REDIS_KEY_PREFIX } from "./config";

/** 区上下文（per-request sId，docs/DUAL_MODE.md §3.5）。入口（LobbyRoom.messages / room / worker）
 *  `zoneCtx.run({ sId }, ...)` 建立；ALS 自动透传进 dispatcher/handler，⛔ 无需碰 dispatcher。 */
export const zoneCtx = new AsyncLocalStorage<{ sId: number }>();
/**
 * 当前区 sId。**fail-fast 门控在 GROUP_ZONES（硬化步）**：
 * - 已设 zoneCtx → 返回其 sId（含 0=大混服）。
 * - 未设 + GROUP_ZONES 空（单形态/大混服）→ 回退 0（安全默认，测试/现网零影响）。
 * - 未设 + GROUP_ZONES 非空（真开多区）→ **throw**：抓漏包裹的危险路径（防 per-zone 写静默落基础前缀/s0，§3.5 B3）。
 * 严格性自动跟随真实风险：只有真开多区才严格，不必包裹每个测试/cleanup 的直接键调用。
 */
export const currentZoneId = (): number => {
  const s = zoneCtx.getStore();
  if (s) { return s.sId; }
  if (GROUP_ZONES.length > 0) {
    throw new Error("zoneCtx 未建立且 GROUP_ZONES 非空——per-zone 路径必须在 zoneCtx.run 内（DUAL_MODE §3.5 硬化：入口漏包裹）");
  }
  return 0;
};
/** per-zone 前缀：sId=0（大混服/单形态）= 项目前缀；sId≥1（区服）= 项目前缀 + `s{sId}_`（§5.3）。复用 currentZoneId 的 fail-fast。 */
const P = (): string => {
  const sId = currentZoneId();
  return sId === 0 ? REDIS_KEY_PREFIX : `${REDIS_KEY_PREFIX}s${sId}_`;
};
/** 全局键前缀（不随区变，= 项目前缀）：sess / 限流 / 可靠流。 */
const G = REDIS_KEY_PREFIX;

// ── durable 实例 · per-zone 键（P()：角色档 + 每区经济，09·R3 同 {uid} 槽） ──────────────

/** 玩法档【真源】HASH，无 TTL。含 fence / ver / schemaVersion 字段。 */
export const kUser = (uid: string) => `${P()}user:{${uid}}`;
/** 背包分片 HASH（field=itemId, value=count），无 TTL。shard = itemId % BAG_SHARDS。 */
export const kBag = (uid: string, shard: number) => `${P()}bag:{${uid}}:${shard}`;
/** 全部背包分片（Lua KEYS 用，顺序 = shard 0..N-1）。 */
export const kBagAll = (uid: string) => Array.from({ length: BAG_SHARDS }, (_, i) => kBag(uid, i));
/** per-uid 锁 fence 单调计数器 STRING。永不过期、永不重置。 */
export const kFence = (uid: string) => `${P()}fence:{${uid}}`;
/** 幂等已 apply 集合 ZSET（member=op_id, score=applyTs），无 TTL、按窗口裁剪。member=op_id 已编码 sId（§3.4）。 */
export const kApplied = (uid: string) => `${P()}applied:{${uid}}`;
/** per-uid 锁 STRING（值=fence），PX 5s。⛔ thaw:{uid} 已废弃，禁止第二把 per-uid 锁（09·L1）。 */
export const kLock = (uid: string) => `${P()}lock:{${uid}}`;
/** 幂等占位 · user 作用域（09·I1；带 `{uid}` hash-tag 与档同实例，per-zone 隔离跨区同 clientReqId）。 */
export const kIdemUser = (scope: string, uid: string, sub: string) => `${P()}idem:${scope}:{${uid}}:${sub}`;
/** 工会事件 seq STRING（INCR 单调，无 TTL）。hash-tag g<gid> 与 log 同槽。工会 per-zone。 */
export const kGuildEvtSeq = (gid: number) => `${P()}guild:evt:seq:{g${gid}}`;
/** 工会事件近窗 LIST（LPUSH + LTRIM 上限 GUILD_EVT_LOG_MAX）。 */
export const kGuildEvtLog = (gid: number) => `${P()}guild:evt:log:{g${gid}}`;

// ── durable 实例 · 全局键（G：不带区前缀，见文件头分类） ────────────────────────

/** 会话 HASH {connId, gwNode, tokenEpoch, loginTs}，TTL 3d。
 *  ⚠ **全局键**：登录时（无区上下文）写、每 RPC（有区上下文）读，若带区前缀两者不一致 → 鉴权崩（§3.5 分类硬约束）。 */
export const kSess = (uid: string) => `${G}sess:{${uid}}`;
/** 幂等占位 · 通用作用域（非 uid，07 `idem:{scope}:{key}`）。全局。 */
export const kIdem = (scope: string, key: string) => `${G}idem:${scope}:${key}`;
/** 限流令牌桶（07 Lua 清单 `rl:{scope}`）。⚠ **全局**：含登录 by-IP（`login:{ip}`）前置区、匿名走 sessionId/IP（09·G5）。 */
export const kRl = (scope: string) => `${G}rl:${scope}`;
/** 对局证据链 STREAM（跨用户/跨区消费）。⛔ XTRIM MINID 按落库位点裁，禁止 MAXLEN（09·K6）。 */
export const K_STREAM_MATCH = `${G}stream:match`;
/** 邮件唤醒 STREAM（10·M5，跨节点消费）。可靠流：⛔ 禁 MAXLEN，XTRIM MINID 按已投递位点裁（09·K6）。 */
export const K_STREAM_MAILWAKE = `${G}stream:mailwake`;
/** 控制总线撤销流（DUAL_MODE §2.3）：账号服务自持 coord Redis 上，广播 {uid, epoch}（max-wins 幂等）。
 *  每节点独立游标消费维护本地 maxEpoch。⛔ 禁 MAXLEN，走 XTRIM MINID（epoch 单调 + verify 重设基线）。 */
export const K_STREAM_REVOKE = `${G}stream:revoke`;

/** 活跃索引 ZSET（member=uid, score=lastActiveMs）。hash-tag 是 {bucket} 不是 {uid}。
 *  ⚠ per-zone 归属留到 archive 步（登录 touchActive 前置区上下文的一致性待解），暂用全局前缀（单形态无差）。 */
export const kActiveLru = (bucket: number) => `${G}active:lru:{${bucket}}`;
/** uid → active:lru 桶号（0..255）。⚠ 与 16384 路由桶是两套空间（09·S2：改分片数即迁移）。 */
export const activeLruBucketOf = (uid: string): number =>
  (crc32(Buffer.from(uid)) >>> 0) % ACTIVE_LRU_BUCKETS;

// ── cache 实例（物理独立，09·R4） · per-zone ─────────────────────────────

/** 货币只读缓存 HASH，TTL 5m，真源在 MySQL。⛔ 不混进 user:{uid}（09·A2）。每区独立经济 → per-zone。 */
export const kCacheCurrency = (uid: string) => `${P()}cache:currency:{${uid}}`;
/** 不存在用户的负缓存 STRING，TTL 10s。读点必须在 EXISTS user 之后（09·F4）。per-zone（本区有无角色）。 */
export const kNegcacheUser = (uid: string) => `${P()}negcache:user:{${uid}}`;
