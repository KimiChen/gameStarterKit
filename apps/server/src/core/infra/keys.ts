/**
 * Redis key 构造器 —— 登记点与分类约束见 docs/SERVER.md §3/§12–§13。
 *
 * ⛔ 业务代码禁止手拼 key（09·R5：新增 key 必须先更新契约登记，再进本文件）。
 *
 * **项目前缀**：全部键带 `${PROJECT_ID}_` 运行时前缀（config.REDIS_KEY_PREFIX，缺省 `gono_`）：
 * 多项目共用一套 Redis 实例时按项目隔离，文档登记的是去前缀的逻辑键名。本文件是唯一拼接点。
 *
 * **区前缀（docs/DUAL_MODE.md §3.5，M13 每区独立经济）**：per-user 玩法/经济键在项目前缀后再叠
 * **区上下文前缀** `s{sId}_`（`P()` 读 `zoneCtx`）。分类是正确性关键、单形态测试测不到（sId=0 时
 * 两类前缀相等），务对照 §3.5：
 * - **per-zone（`P()`）**：user/bag/fence/applied/lock/idemUser/cache:currency/negcache/guild —— 角色档 + 每区经济。
 * - **全局（`G`，不带区前缀）**：`sess`（登录时无区写、每 RPC 有区读，带区会前缀不一致致鉴权崩）、
 *   限流 `rl`（含登录 by-IP，前置区）、可靠流 `stream:*`（跨用户/跨区消费）、
 *   角色登记修复 `repair:character:due|attempts`（member 自带 serverId，调度不依赖区上下文）、
 *   通用幂等占位 `idem:{scope}:{key}`（非 uid 作用域；当前无调用点）。
 * - **暂全局待定**：`active:lru`（冷档索引，per-zone 化涉及登录 touchActive 的前置区上下文，留到 archive 步）。
 *
 * ⚠ 过渡期：`zoneCtx` 未设置即回退项目前缀（sId=0 语义，行为同现网）；多区硬化步改为
 * fail-fast + 全入口（LobbyRoom.messages / room / worker）`zoneCtx.run` 包裹，开 GROUP_ZONES 前必做。
 *
 * `{...}` 是 Cluster hash-tag：per-user key 用 `{uid}` 同槽（09·R3）；`active:lru` 用 `{bucket}`。
 * legacy `stream:match` 本身无 hash-tag；它的 v2 后继把**完整 legacy key**放进 hash-tag，使两个版本在
 * Redis Cluster 与自定义 `clientForKey` 路由下都命中同一实例/slot，才能用一次 XREADGROUP 双读。
 * 跨用户流 ⛔ 不与 per-user key 进同一条 Lua。区前缀不含 hash-tag，`{...}` 语义不受影响。
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

/** 组侧会话缓存 HASH {tokenHash, issuedAt, loginTs, connId, gwNode}，TTL 3d。`tokenHash` 是快路径唯一校验位 + 顶号判据；`issuedAt` 是写入栅栏（session.ts 的 Lua）与踢人陈旧判据（kickBus 回读）的单调量。`connId` 由 Lua 恒写空串，`gwNode` 现有唯一调用点也只传空串，两者暂无读取方，属预留字段。
 *  ⚠ **全局键**：登录时（无区上下文）写、每 RPC（有区上下文）读，若带区前缀两者不一致 → 鉴权崩（§3.5 分类硬约束）。 */
/**
 * 组侧会话缓存键 —— **(uid, 区) 两个身份分量**（M12e：单端语义作用域从账号收窄到 `(账号, 区)`）。
 *
 * ⚠ **sId 是显式参数，⛔ 不走 `P()` 的 ambient zoneCtx**：本键有两个**不在 zoneCtx 内**的读者
 * （`archive/freezeWorker.ts` 的在线判定、`auth/kickBus.ts` 消费侧的栅栏回读），
 * 用 `P()` 会让它们在 `GROUP_ZONES` 非空时直接撞 `currentZoneId()` 的 fail-fast。
 * ⚠ 仍挂在**全局**前缀 `G` 下：uid 与 sId 都已在键名里，⛔ 别再叠一层区前缀（会变成 s1_...:s1）。
 */
export const kSess = (uid: string, sId: number) => `${G}sess:{${uid}}:s${sId}`;
/** 幂等占位 · 通用作用域（非 uid，07 `idem:{scope}:{key}`）。全局。 */
export const kIdem = (scope: string, key: string) => `${G}idem:${scope}:${key}`;
/** 限流令牌桶（07 Lua 清单 `rl:{scope}`）。⚠ **全局**：含登录 by-IP（`login:{ip}`）前置区、匿名走 sessionId/IP（09·G5）。 */
export const kRl = (scope: string) => `${G}rl:${scope}`;
/** legacy 对局证据链 STREAM：升级后仅供新 consumer 排空；⛔ 新 producer 禁写。 */
export const K_STREAM_MATCH = `${G}stream:match`;
/**
 * v2 对局证据链 STREAM（新 producer 唯一写点，schemaVersion=2）。
 * hash-tag 内容刻意等于**完整 legacy key**：旧 key 无 tag 时按整个 key 路由，因此两者输入同一串字节，
 * 在 Redis Cluster slot 与 `clientForKey` 的自定义桶路由下都同实例；⛔ 不得简化成 `{stream:match}`。
 * 两流均按各自已落库位点 XTRIM MINID，禁止 MAXLEN（09·K6）。
 */
export const K_STREAM_MATCH_V2 = `${G}stream:match:v2:{${K_STREAM_MATCH}}`;
/** 邮件唤醒 STREAM（10·M5，跨节点消费）。可靠流：⛔ 禁 MAXLEN，XTRIM MINID 按已投递位点裁（09·K6）。 */
export const K_STREAM_MAILWAKE = `${G}stream:mailwake`;
/** 踢人流（DUAL_MODE §2.3 / M12d）：coord Redis 上广播 `{uid, reason[, exceptHash]}` 触发各节点自筛踢在线连接。
 *  `exceptHash` = 顶号判别位（跳过持新登录态的连接，⛔ 防迟到投递自踢）。
 *  **best-effort、无 ack**（权威撤销在 WebPlatform；⛔ 漏踢无自动收敛，送达保证走 GM `/admin/kick`）。⛔ 禁 MAXLEN，走 XTRIM MINID。 */
export const K_STREAM_KICK = `${G}stream:kick`;
/**
 * WebPlatform 角色登记修复 intent（GAME-6）：两个 durable key 用固定 hash-tag 同槽，才能用
 * MULTI 原子维护调度项与失败次数。member 是 `JSON [userId,serverId]`，score 是 nextAttemptMs。
 *
 * ⚠ worker 在 HTTP PUT 成功前绝不 ZREM；进程崩溃/多实例竞争最多重复调用幂等 PUT，不会丢 intent。
 */
export const K_CHARACTER_REPAIR_DUE = `${G}repair:character:due:{character-repair}`;
export const K_CHARACTER_REPAIR_ATTEMPTS = `${G}repair:character:attempts:{character-repair}`;

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
