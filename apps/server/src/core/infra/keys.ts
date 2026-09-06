/**
 * Redis key 构造器 —— 登记点与分类约束见 docs/SERVER.md §3/§12–§13。
 *
 * ⛔ 业务代码禁止手拼 key（09·R5：新增 key 必须先更新契约登记，再进构造器）。框架键定义在本文件；
 * 玩法自有键 ⛔ 不进本文件，由下方 `kGameplay` 工厂在 `rooms/modes/<id>/keys.ts` 里构造；
 * plugin 自有键同样 ⛔ 不进本文件，由 `kPluginUser` / `kPluginShared` 工厂在 `core/<pluginId>/keys.ts` 里构造；
 * kit 自有键（docs/KIT.md §2「Redis 键」行）也 ⛔ 不进本文件，由 `kKitUser` / `kKitShared` 工厂在
 * `apps/server/src/kits/<kitId>/keys.ts` 里构造——前缀 `kt:` 与 `gp:` / `pl:` 互不可达，共享键强制分片 tag。
 *
 * **项目前缀**：全部键带 `${PROJECT_ID}_` 运行时前缀（config.REDIS_KEY_PREFIX，缺省 `gono_`）：
 * 多项目共用一套 Redis 实例时按项目隔离，文档登记的是去前缀的逻辑键名。本文件是唯一拼接点。
 *
 * **区前缀（docs/DUAL_MODE.md §3.5，M13 每区独立经济）**：per-user 玩法/经济键在项目前缀后再叠
 * **区上下文前缀** `s{sId}_`（`P()` 读 `zoneCtx`）。分类是正确性关键、单形态测试测不到（sId=0 时
 * 两类前缀相等），务对照 §3.5：
 * - **per-zone（`P()`）**：user/bag/fence/archive:proof/applied/lock/idemUser/idemPending/cache:currency/negcache/guild/active:lru —— 角色档 + 每区经济。
 * - **全局（`G`，不带区前缀）**：`sess`（登录时无区写、每 RPC 有区读，带区会前缀不一致致鉴权崩）、
 *   限流 `rl`（含登录 by-IP，前置区）、可靠流 `stream:*`（跨用户/跨区消费）、
 *   角色登记修复 `repair:character:due|attempts`（member 自带 serverId，调度不依赖区上下文）、
 *   通用幂等占位 `idem:{scope}:{key}`（非 uid 作用域；当前无调用点）。
 * - **玩法自有键（`kGameplay`）**：分区语义由玩法在调用点显式选（`{ zone }`），⛔ 无缺省——
 *   框架不替玩法猜，调用点在各玩法自己的 `rooms/modes/<id>/keys.ts` 里，⛔ 玩法名不进本文件。
 * - **kit 自有键（`kKitUser` / `kKitShared`）**：同样显式 `{ zone }`；per-user 键 `kt:<kitId>:<name>:{uid}` 是
 *   冷档 freeze/thaw 按 `kit.json.userKeys` 快照与 UNLINK 的对象（archive/archiveScripts.ts，KIT.md §5）；
 *   共享键 ⛔ 不冻结。
 *
 * ⚠ 过渡期：`zoneCtx` 未设置即回退项目前缀（sId=0 语义，行为同现网）；多区硬化步改为
 * fail-fast + 全入口（LobbyRoom.messages / room / worker）`zoneCtx.run` 包裹，开 GROUP_ZONES 前必做。
 *
 * `{...}` 是 Cluster hash-tag：per-user key 用 `{uid}` 同槽（09·R3）；`active:lru` 用 `{bucket}`。
 * legacy `stream:match` 本身无 hash-tag；它的 v2/v3 后继把**完整 legacy key**放进 hash-tag，使三个版本在
 * Redis Cluster 与自定义 `clientForKey` 路由下都命中同一实例/slot，才能用一次 XREADGROUP 读取三流。
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

// ── 玩法自有键工厂（玩法 key 由玩法自己在 rooms/modes/<id>/keys.ts 定义，
//    中央本文件只提供构造器与分段契约，⛔ 不再逐玩法登记具名 key） ─────────────────

/**
 * 玩法键的分区语义。**⛔ 无隐式缺省**：跨区共享（global）与每区独立（per-zone）是两种互不兼容
 * 的经济语义，不同玩法的取舍不同；给缺省值等于让其中一方静默拿错前缀（per-zone 写落基础前缀，
 * 或 global 读被叠上 `s{sId}_`），而 sId=0 的单形态测试恰好测不出来（文件头 §3.5 分类风险）。
 */
export type GameplayKeyScope = { readonly zone: "per-zone" | "global" };

/** 分段字面量闸：空串或含 `:` / `{` / `}` 会让 `gp:<modeId>:<name>` 变成可歧义前缀（两个玩法拼出同一物理键）。 */
const assertGameplayKeySegment = (value: string, label: string): void => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new Error(`kGameplay ${label} "${value}" 非法：只允许 [A-Za-z0-9._-] 且首字符为字母数字（分段不得含 ':' / '{' / '}'）`);
  }
};

/**
 * 玩法自有 per-user 键：逻辑名 `gp:<modeId>:<name>:{uid}`（物理键再带项目前缀，per-zone 时另带区前缀）。
 *
 * ⚠ 分段顺序是契约（同 `kIdemUser`）：`gp:` 命名空间段把玩法键族与框架键族隔开（框架新增 `user:` /
 * `bag:` 一类顶层名时永不与玩法撞名）、`modeId` 紧随其后（按玩法前缀 scan/清理的唯一依据）、
 * **`{uid}` hash-tag 必须是末段**（09·R3 与该 uid 的框架键同槽）。⛔ 禁改分段或挪动末段。
 *
 * `scope.zone` 由调用方显式给：`"per-zone"` 走 `P()`（每区独立，同 kUser/kBag，继承其 fail-fast）；
 * `"global"` 走 `G`（跨区共享单份，玩法自己承担「同一 uid 在任何区看到同一份」的语义）。
 */
export const kGameplay = (modeId: string, name: string, uid: string, scope: GameplayKeyScope): string => {
  assertGameplayKeySegment(modeId, "modeId");
  assertGameplayKeySegment(name, "name");
  return `${scope.zone === "per-zone" ? P() : G}gp:${modeId}:${name}:{${uid}}`;
};

// ── plugin 自有键工厂（plugin 键由 plugin 自己在 core/<pluginId>/keys.ts 定义，中央本文件只提供
//    构造器与分段契约——与 kGameplay 对称；docs/PLUGIN.md §8「plugin 侧仍各写各的」的收口） ─────

/** plugin 键的分区语义（与 GameplayKeyScope 同形：⛔ 无隐式缺省，理由见 GameplayKeyScope）。 */
export type PluginKeyScope = GameplayKeyScope;

/** plugin 分段字面量闸：与玩法键同一规则，错误信息点名 kPlugin。 */
const assertPluginKeySegment = (value: string, label: string): void => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new Error(`kPlugin ${label} "${value}" 非法：只允许 [A-Za-z0-9._-] 且首字符为字母数字（分段不得含 ':' / '{' / '}'）`);
  }
};

/**
 * plugin 自有 per-user 键：逻辑名 `pl:<pluginId>:<name>:{uid}`（物理键再带项目前缀，per-zone 时另带区前缀）。
 *
 * 分段顺序是契约（同 `kGameplay`）：`pl:` 命名空间段把 plugin 键族与框架键族 / 玩法键族（`gp:`）
 * 隔开、`pluginId` 紧随其后（按 plugin 前缀 scan/清理的唯一依据）、**`{uid}` hash-tag 必须是末段**
 * （09·R3 与该 uid 的框架键同槽）。⛔ 禁改分段或挪动末段。
 */
export const kPluginUser = (pluginId: string, name: string, uid: string, scope: PluginKeyScope): string => {
  assertPluginKeySegment(pluginId, "pluginId");
  assertPluginKeySegment(name, "name");
  return `${scope.zone === "per-zone" ? P() : G}pl:${pluginId}:${name}:{${uid}}`;
};

/**
 * plugin 自有共享键（非 per-user）：逻辑名 `pl:<pluginId>:<name>:{<pluginId>}`——hash-tag 取
 * pluginId，让同一 plugin 的全部共享键同槽（可进同一条 Lua），且永不与任何 `{uid}` 槽混淆。
 * `key` 是可选的自由末段（如 `guild:<gid>`），走同一字面量闸。
 */
export const kPluginShared = (pluginId: string, name: string, scope: PluginKeyScope, key?: string): string => {
  assertPluginKeySegment(pluginId, "pluginId");
  assertPluginKeySegment(name, "name");
  if (key !== undefined) assertPluginKeySegment(key, "key");
  const suffix = key === undefined ? "" : `:${key}`;
  return `${scope.zone === "per-zone" ? P() : G}pl:${pluginId}:${name}:{${pluginId}}${suffix}`;
};

// ── kit 自有键工厂（kit 键由 kit 自己在 apps/server/src/kits/<kitId>/keys.ts 定义，中央本文件只提供
//    构造器与分段契约——与 kGameplay / kPluginUser 对称；docs/KIT.md §2「Redis 键」行：前缀 `kt:`，
//    与 `gp:` / `pl:` 互不可达；共享键的 hash-tag 必须带区或分片键，⛔ 不允许整 kit 一个 tag） ─────

/** kit 键的分区语义（与 GameplayKeyScope 同形：⛔ 无隐式缺省，理由见 GameplayKeyScope）。 */
export type KitKeyScope = GameplayKeyScope;

/**
 * kit 分段字面量的**唯一**判据（与玩法键 / plugin 键同一规则）：`assertKitKeySegment` 与冷档快照校验器
 * （archive/lazyMigrate.ts 的 `kits` 成员名）都从这里取——⛔ 不得再复制正则，否则校验器放行的名字会在
 * thaw 建 KEYS 时被 `kKitUser` 拒绝（校验已过、Lua 未跑的中途失败）。
 */
export const isKitKeySegment = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);

/** kit 分段字面量闸（`kKitShared` 的 shard 段同样过闸），错误信息点名 kKit。 */
const assertKitKeySegment = (value: string, label: string): void => {
  if (!isKitKeySegment(value)) {
    throw new Error(`kKit ${label} "${value}" 非法：只允许 [A-Za-z0-9._-] 且首字符为字母数字（分段不得含 ':' / '{' / '}'）`);
  }
};

/**
 * kit 自有 per-user 键：逻辑名 `kt:<kitId>:<name>:{uid}`（物理键再带项目前缀，per-zone 时另带区前缀）。
 *
 * 分段顺序是契约（同 `kGameplay` / `kPluginUser`）：`kt:` 命名空间段把 kit 键族与框架键族 / 玩法键族（`gp:`）/
 * plugin 键族（`pl:`）隔开、`kitId` 紧随其后（`uninstall --drop-data` 按 `kt:<kitId>:` 前缀 SCAN 清理的唯一依据）、
 * **`{uid}` hash-tag 必须是末段**（09·R3 与该 uid 的框架键同槽——冷档 FREEZE_COMMIT / THAW_RESTORE 把它们与
 * user/bag 放进同一条 Lua）。⛔ 禁改分段或挪动末段。
 *
 * 冷档：`name` ∈ `kit.json.userKeys` 且 `{ zone: "per-zone" }` 的键由 freeze 快照、UNLINK，thaw 恢复（KIT.md §5）；
 * 快照要求它是 HASH（或不存在），其它类型 freeze 拒绝。
 *
 * ⚠ **写侧硬契约（冷档正确性的前提，与 bag 只走 APPLY_EFFECT 的理由相同）**：对 `userKeys` per-user HASH 的每一次
 * 写都必须满足二者之一——(a) 在 `withUserLock(uid)` 内进行；或 (b) 在同一条 Lua 里先确认 `user:{uid}` 存在
 * （缺席返回 'cold'，⛔ 不得给冷档用户凭空创建 kt: 键——否则 thaw 会因「目标非空」拒绝恢复，该用户被锁死）
 * 并 `HINCRBY user:{uid} ver 1`。理由：FREEZE_COMMIT 在快照读取与 UNLINK 之间只靠 `user.ver`（再加各 kt: 键的
 * HLEN 计数）判快照是否过期，不持锁也不 bump ver 的直写会在窗口内落地后被一并 UNLINK（写丢失、档里也没有）。
 * 跨用户写（如别的玩家的行动改本 uid 的键）同样受此约束。kit-api 的 effect apply 路径必须按此实现。
 */
export function kKitUser(kitId: string, name: string, uid: string, scope: KitKeyScope): string {
  assertKitKeySegment(kitId, "kitId"); assertKitKeySegment(name, "name");
  return `${scope.zone === "per-zone" ? P() : G}kt:${kitId}:${name}:{${uid}}`;
}

/**
 * kit 自有共享键（非 per-user）：hash-tag **强制带分片键**（KIT.md §2：⛔ 不允许整 kit 一个 tag，
 * 否则一个 kit 的全部共享数据落同一 slot / 同一实例）：
 * - per-zone：`kt:<kitId>:<name>:{<kitId>:s<sId>:<shard>}`（sId = 当前区上下文，tag 里带区使跨区键永不同槽）；
 * - global：`kt:<kitId>:<name>:{<kitId>:<shard>}`。
 * `shard` 是必填非空分段（走同一字面量闸）——tag 里恒有分片键，整 kit 单 tag 在构造上不可能。
 * 同 (kitId, shard) 的共享键同槽，可进同一条 Lua；tag 以 kitId 开头，永不与任何 `{uid}` 槽混淆。
 */
export function kKitShared(kitId: string, name: string, shard: string, scope: KitKeyScope): string {
  assertKitKeySegment(kitId, "kitId"); assertKitKeySegment(name, "name"); assertKitKeySegment(shard, "shard");
  if (scope.zone === "per-zone") {
    return `${P()}kt:${kitId}:${name}:{${kitId}:s${currentZoneId()}:${shard}}`;
  }
  return `${G}kt:${kitId}:${name}:{${kitId}:${shard}}`;
}

// ── durable 实例 · per-zone 键（P()：角色档 + 每区经济，09·R3 同 {uid} 槽） ──────────────

/** 玩法档【真源】HASH，无 TTL。含 fence / ver / schemaVersion 字段。 */
export const kUser = (uid: string) => `${P()}user:{${uid}}`;
/** 背包分片 HASH（field=itemId, value=count），无 TTL。shard = itemId % BAG_SHARDS。 */
export const kBag = (uid: string, shard: number) => `${P()}bag:{${uid}}:${shard}`;
/** 全部背包分片（Lua KEYS 用，顺序 = shard 0..N-1）。 */
export const kBagAll = (uid: string) => Array.from({ length: BAG_SHARDS }, (_, i) => kBag(uid, i));
/** per-uid 锁 fence 单调计数器 STRING。永不过期、永不重置。 */
export const kFence = (uid: string) => `${P()}fence:{${uid}}`;
/** 冷档同源证明 HASH（field=freeze_id,value=1）。只按当前 archive 行的精确 membership 判权。 */
export const kArchiveProof = (uid: string) => `${P()}archive:proof:{${uid}}`;
/** 幂等已 apply 集合 ZSET（member=op_id, score=applyTs），无 TTL、按窗口裁剪。member=op_id 已编码 sId（§3.4）。 */
export const kApplied = (uid: string) => `${P()}applied:{${uid}}`;
/** applied payload 绑定 HASH（field=op_id, value=规范化 effect JSON）。与 applied 同槽，防同 ID 换 payload。 */
export const kAppliedPayload = (uid: string) => `${P()}applied:payload:{${uid}}`;
/** per-uid 锁 STRING（值=fence），PX 5s。⛔ thaw:{uid} 已废弃，禁止第二把 per-uid 锁（09·L1）。 */
export const kLock = (uid: string) => `${P()}lock:{${uid}}`;
/** 幂等占位 · user 作用域（09·I1；带 `{uid}` hash-tag 与档同实例，per-zone 隔离跨区同 clientReqId）。
 *  v2 值是 JSON `StoredIdem` 记录（core/idem.ts；pending 带 PX=IDEM_PENDING_MS、done/oversize 带 PX=IDEM_RESULT_MS）。
 *  ⚠ 分段顺序是契约（§6.11）：scope=路由名、`{uid}` hash-tag、**clientReqId 必须在末段**——摘要可安全
 *  排除 clientReqId 的推理与冲突检测都依赖它，⛔ 禁改分段或挪动末段（登记见 docs/SERVER.md §8/§13）。 */
export const kIdemUser = (scope: string, uid: string, sub: string) => `${P()}idem:${scope}:{${uid}}:${sub}`;
/** 每 uid 并发 pending 幂等计数 STRING（§6.12 per-uid 上限；登记见 docs/SERVER.md §8/§13）。
 *  与 kIdemUser 同 `{uid}` 槽（IDEM_V2_ACQUIRE 单条 Lua 同槽读写）；PX=IDEM_PENDING_MS 随租约自然衰减，
 *  release/complete DECR 下限 0。计数器只是上限护栏，⛔ 不是真源——腐坏时 Lua 自愈重置。 */
export const kIdemPending = (uid: string) => `${P()}idem:pending:{${uid}}`;
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
 * v2 历史对局证据链 STREAM（升级后只排空，schemaVersion=2；新 producer 禁写）。
 * hash-tag 内容刻意等于**完整 legacy key**：旧 key 无 tag 时按整个 key 路由，因此两者输入同一串字节，
 * 在 Redis Cluster slot 与 `clientForKey` 的自定义桶路由下都同实例；⛔ 不得简化成 `{stream:match}`。
 * 各来源流均按各自已落库位点 XTRIM MINID，禁止 MAXLEN（09·K6）。
 */
export const K_STREAM_MATCH_V2 = `${G}stream:match:v2:{${K_STREAM_MATCH}}`;
/**
 * v3 可重放对局证据链 STREAM（新 producer 唯一写点，schemaVersion=3）。
 * 与 legacy/v2 使用相同的完整 legacy key hash-tag，确保三流可由一次 XREADGROUP 同槽读取。
 */
export const K_STREAM_MATCH_V3 = `${G}stream:match:v3:{${K_STREAM_MATCH}}`;
/**
 * 对局证据坏条目隔离流。与 legacy/v2/v3 源流使用同一 hash-tag，consumer 才能在一个 Lua 原子段中
 * 先持久化原始条目、再 ACK 来源 PEL。该流禁止自动裁剪；人工修复重投并确认落库后才可 XDEL。
 */
export const K_STREAM_MATCH_QUARANTINE = `${G}stream:match:quarantine:{${K_STREAM_MATCH}}`;
/** 邮件唤醒 STREAM（10·M5，跨节点消费）。可靠流：⛔ 禁 MAXLEN，XTRIM MINID 按已投递位点裁（09·K6）。 */
export const K_STREAM_MAILWAKE = `${G}stream:mailwake`;
/** 踢人流（DUAL_MODE §2.3 / M12d）：coord Redis 上广播
 * `{uid, reason[, exceptHash, issuedAt, sId]}` 触发各节点自筛踢在线连接。
 *  `exceptHash` = 顶号判别位（tokenHashOf 生成的 64 位小写 hex，跳过持新登录态的连接，⛔ 防迟到投递自踢）；
 *  `issuedAt` + `sId` 是顶号事件的单调栅栏。缺 `sId` 的封号/撤销事件保持账号级踢人语义。
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

// ── coordination 实例 · 私房邀请码 / access ticket 键族（Non-intrusive §6.7/§6.8；
//    登记见 docs/SERVER.md §13）。⚠ 全部 **`sId` 显式参数**，⛔ 不走 `P()`/zoneCtx：
//    GameRoom 不在任何 `zoneCtx.run` 作用域内（区是房级常量），而 `room.prepareCreate` /
//    `room.resolve` 跑在 LobbyRoom 的 `zoneCtx.run({sId})` 里——create 与 renew/release
//    若一侧读 ALS、一侧读房级 sId，就会打到不同 key（§6.7）。
//    ⚠ 这些键只存在于 coordClient（组内单实例）；INVITE_CODE_ALLOCATE 的 code/gen 同
//    hash-tag，TICKET_ISSUE_CREATION 刻意跨 tag（quota + ticket），⛔ 不得搬去 cluster。 ──

/** 邀请码 lease/tombstone STRING（JSON value；active 带 PX=leaseTtl，tombstone 带 PX=cooldown，⛔ 非 DEL）。 */
export const kInviteCode = (sId: number, code: string) => `${G}room:code:{s${sId}:${code}}`;
/** per-(sId, code) 单调分配代号 INCR 计数器。永不重置、永不随 lease 释放而删除（§6.7）。 */
export const kInviteCodeGen = (sId: number, code: string) => `${G}room:code:gen:{s${sId}:${code}}`;
/** creation/join ticket 记录 STRING（JSON，PX=exp）。键名只含 ticket 的 sha256，⛔ 不含原文。 */
export const kRoomTicket = (sId: number, ticketSha256: string) => `${G}room:ticket:s${sId}:${ticketSha256}`;
/** 单 uid 私房配额 ZSET：member=`t:<jti>`（未消费 creation ticket）/`r:<roomId>`（活跃私房），score=过期时刻 ms。 */
export const kRoomTicketQuota = (sId: number, uid: string) => `${G}room:quota:s${sId}:{${uid}}`;

/** 每区活跃索引 ZSET（member=uid, score=lastActiveMs）。hash-tag 是 {bucket} 不是 {uid}。
 * s0 保持 legacy 物理键；s1+ 由 P() 增加区前缀，禁止跨区共享候选。 */
export const kActiveLru = (bucket: number) => `${P()}active:lru:{${bucket}}`;
/** uid → active:lru 桶号（0..255）。⚠ 与 16384 路由桶是两套空间（09·S2：改分片数即迁移）。 */
export const activeLruBucketOf = (uid: string): number =>
  (crc32(Buffer.from(uid)) >>> 0) % ACTIVE_LRU_BUCKETS;

// ── cache 实例（物理独立，09·R4） · per-zone ─────────────────────────────

/** 货币只读缓存 HASH，TTL 5m，真源在 MySQL。⛔ 不混进 user:{uid}（09·A2）。每区独立经济 → per-zone。 */
export const kCacheCurrency = (uid: string) => `${P()}cache:currency:{${uid}}`;
/** 不存在用户的负缓存 STRING，TTL 10s。读点必须在 EXISTS user 之后（09·F4）。per-zone（本区有无角色）。 */
export const kNegcacheUser = (uid: string) => `${P()}negcache:user:{${uid}}`;
