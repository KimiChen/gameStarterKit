/**
 * **踢人通道**（kick bus，DUAL_MODE §2.3 / M12d）。⚠ 本文件只负责「把在线连接踢下线」这一件事——
 * 撤销的**权威**由独立 WebPlatform 持有，GM 通过其 Admin HTTP API 写入。
 *
 * **封号语义 = 账号级「下次登不上」**。本模块只负责第二件事——
 * **把在线连接踢下线，逼其重走登录流程**。
 *
 * 传输：**本组** coord Redis 的 `stream:kick`（组内跨节点通道；每节点独立游标 XREAD，⛔ 非 Pub/Sub）。
 * ⚠ coord 按组独占（DUAL_MODE §4.2）⇒ 扇出半径**只到组内**；跨组的撤销送达同样落在 GM 的逐节点 `/admin/kick` 上。
 * 事件只承载 uid 及可选的顶号判别字段——**没有 epoch、没有 outbox**：踢是 **best-effort**，丢了不影响正确性，因为
 *   ① 新建连接 onAuth strict 回权威 verify 即拒；② 重新登录 SELECT status 即拒；
 *   ③ 发钱由结算 recheck 兜（U6）。
 * ⚠ 本通道是**程序化封号的便捷扇出，不构成保证**（fire-and-forget、无 ack）：封号 SOP 要求 GM 工具
 * 直连各节点 `/admin/kick` 并按 ack 确认送达（§2.3）。⛔ 缺踢则在场连接可存活至 sess TTL（3d，无自动收敛）。
 */
import { ForceLogoutReason, type ForceLogoutReasonType } from "@game/shared";
import { KICK_STREAM_TRIM_MS } from "../infra/config";
import { K_STREAM_KICK, kSess } from "../infra/keys";
import { clientFor, coordClient } from "../infra/redisRoute";
import { startStreamConsumer, type StreamConsumer } from "../infra/streamConsumer";
import { defaultLifecycle } from "../infra/lifecycle";
import { storedInt } from "../infra/numbers";

// 自筛踢句柄：websocket 层（online 表）在启动期注入 kickUser（core/auth ⛔ 不反向依赖 websocket 层）。
let kickHandler: ((uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string, sId?: number) => void) | null = null;
const TOKEN_HASH_RE = /^[0-9a-f]{64}$/;

function hasValidKickScope(
  reason: unknown,
  exceptHash: unknown,
  issuedAt: unknown,
  sId: unknown,
): boolean {
  const hasHash = exceptHash !== undefined;
  const hasIssuedAt = issuedAt !== undefined;
  const hasSid = sId !== undefined;
  if (reason === ForceLogoutReason.Replaced) {
    return hasHash && hasIssuedAt && hasSid;
  }
  if (reason === ForceLogoutReason.Banned || reason === ForceLogoutReason.Revoked) {
    return !hasHash && !hasIssuedAt && !hasSid;
  }
  return false;
}
/** 注入本节点强制下线句柄（index.ts 启动期挂 push.kickUser）。 */
export function setKickHandler(fn: (uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string, sId?: number) => void): void { kickHandler = fn; }

/** 本节点自筛踢：命中本节点在线连接即强制下线（先推 reason 再关）；不在本节点直接跳过（§2.3 每节点自筛，⛔ 不查 presence）。 */
/** @param sId 只踢该区的连接（顶号，M12e）；**省略 = 踢该 uid 在本节点的全部区**（封号/撤销：账号级）。 */
export function kickLocal(uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string, sId?: number): void {
  kickHandler?.(uid, reason, exceptTokenHash, sId);
}

/** 广播踢人到控制总线（best-effort：Redis 抖动只是漏踢；权威撤销已落 MySQL，送达保证走 GM `/admin/kick`）。 */
export async function broadcastKick(
  uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string, issuedAtMs?: number, sId?: number,
): Promise<void> {
  // This is an internal producer, but its arguments still cross a Redis
  // serialization boundary.  Refuse malformed values before publishing; the
  // consumer is strict as a second line of defence.
  const validReason = (Object.values(ForceLogoutReason) as string[]).includes(reason);
  const validUid = typeof uid === "string" && uid.length > 0 && uid.length <= 128;
  const validHash = exceptTokenHash === undefined
    || (typeof exceptTokenHash === "string" && TOKEN_HASH_RE.test(exceptTokenHash));
  const validIssuedAt = issuedAtMs === undefined
    || (Number.isSafeInteger(issuedAtMs) && issuedAtMs >= 0);
  const validSid = sId === undefined || (Number.isSafeInteger(sId) && sId >= 0 && sId <= 65535);
  if (!validUid || !validReason || !validHash || !validIssuedAt || !validSid
    || !hasValidKickScope(reason, exceptTokenHash, issuedAtMs, sId)) {
    // Do not interpolate rejected values: an internal adapter can still pass a
    // hostile object whose string conversion throws and defeats this boundary.
    try { console.error("[kick] 拒绝发布非法踢人事件"); } catch { /* logging is best-effort */ }
    return;
  }
  try {
    await coordClient().xadd(K_STREAM_KICK, "*", "uid", uid, "reason", reason,
      // 顶号判别位（可选）：消费侧据此跳过持新登录态的连接，⛔ 防迟到投递自踢
      ...(exceptTokenHash !== undefined ? ["exceptHash", exceptTokenHash] : []),
      // ⚠ 单调栅栏（A6）：`exceptHash` 是**等值**判据、⛔ 不单调——消费循环卡顿导致事件积压时，
      // 晚到的旧事件拿**旧的** exceptHash 去比**新的**在线表，两者必然不等 ⇒ 把已经合法登录的
      // 赢家踢下线。带上发起方的签发时刻，消费侧即可认出"我已经过期了"。
      ...(issuedAtMs !== undefined ? ["issuedAt", String(issuedAtMs)] : []),
      // ⚠ 顶号的作用域是**区**（M12e）：带 sId ⇒ 消费侧只踢该区的连接。
      // ⛔ 封号/撤销**不带** sId（账号级，要踢光该 uid 的全部区）——两种语义靠"有没有这个字段"区分。
      ...(sId !== undefined ? ["sId", String(sId)] : []));
  } catch (e) {
    console.error(`[kick] 广播失败 uid=${uid}（权威已落库；GM 工具的 /admin/kick 才是保证送达的那一步）`, e);
  }
}

/**
 * 解析踢人流条目。字段来自 Redis，不能依赖 TypeScript 的静态类型；显式
 * 损坏字段必须让整条事件失效，尤其不能把坏的 `sId` 降级成 undefined（那
 * 会把一个本应按区的事件扩大成账号级踢人）。字段完全缺失时才保留旧版
 * 兼容语义：缺 `reason` = banned，缺 `sId` = 全区账号级踢人。
 */
export interface KickStreamEntry {
  uid: string;
  reason: ForceLogoutReasonType;
  exceptHash?: string;
  issuedAt?: number;
  sId?: number;
}

const KICK_FIELDS = new Set(["uid", "reason", "exceptHash", "issuedAt", "sId"]);

export function parseKickFields(fields: readonly string[]): KickStreamEntry | null {
  // Redis normally supplies a plain array, but this parser is also called by
  // adapters/tests.  Keep every property read inside the guard so a revoked
  // or hostile Proxy cannot reject the stream consumer loop.
  try {
    if (!Array.isArray(fields)) { return null; }
    if (fields.length === 0 || fields.length % 2 !== 0) { return null; }
    const values = new Map<string, string>();
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];
      // XREAD normally returns strings, but retain a runtime guard for test/future
      // adapters and reject duplicate/unknown keys instead of choosing ambiguously.
      if (typeof key !== "string" || typeof value !== "string"
        || !KICK_FIELDS.has(key) || values.has(key)) {
        return null;
      }
      values.set(key, value);
    }

    const uid = values.get("uid");
    if (uid === undefined || uid.length === 0 || uid.length > 128) { return null; }

    const rawReason = values.get("reason");
    let reason: ForceLogoutReasonType;
    if (rawReason === undefined) {
      // Legacy publishers only sent uid; preserve that narrow compatibility path.
      reason = ForceLogoutReason.Banned;
    } else if ((Object.values(ForceLogoutReason) as string[]).includes(rawReason)) {
      reason = rawReason as ForceLogoutReasonType;
    } else {
      return null;
    }

    const rawSid = values.get("sId");
    let sId: number | undefined;
    if (rawSid !== undefined) {
      try {
        sId = storedInt(rawSid, "kick.sId", { min: 0, max: 65535 });
      } catch {
        return null;
      }
    }

    const rawIssuedAt = values.get("issuedAt");
    let issuedAt: number | undefined;
    if (rawIssuedAt !== undefined) {
      try {
        issuedAt = storedInt(rawIssuedAt, "kick.issuedAt", { min: 0, max: Number.MAX_SAFE_INTEGER });
      } catch {
        return null;
      }
    }

    const exceptHash = values.get("exceptHash");
    // exceptHash is produced by tokenHashOf() and is only an equality guard;
    // accepting an empty/arbitrary value would almost never match an online
    // token and could self-kick the newly logged-in connection.
    if (exceptHash !== undefined && !TOKEN_HASH_RE.test(exceptHash)) { return null; }
    // Kick events are a discriminated union, not five independently optional
    // fields. Replacement is zone-scoped and requires the complete monotonic
    // fence; banned/revoked events are account-wide and carry none of it. This
    // prevents a partial replacement event from widening into an account kick.
    if (!hasValidKickScope(reason, exceptHash, issuedAt, sId)) { return null; }

    const entry: KickStreamEntry = { uid, reason };
    if (exceptHash !== undefined) { entry.exceptHash = exceptHash; }
    if (issuedAt !== undefined) { entry.issuedAt = issuedAt; }
    if (sId !== undefined) { entry.sId = sId; }
    return entry;
  } catch {
    return null;
  }
}

/** Decode the session fence without conflating missing/corrupt data with a current event. */
export function normalizeKickStoredIssuedAt(raw: unknown): number | null {
  if (raw === null || raw === undefined) { return null; }
  try {
    return storedInt(raw, "session.issuedAt", { min: 0, max: Number.MAX_SAFE_INTEGER });
  } catch {
    return null;
  }
}

let consumer: StreamConsumer | null = null;
let consumerUnregister: (() => void) | null = null;
/** 控制总线消费（每节点一个，独立游标）：读 stream:kick → 本节点在线即踢。 */
export function startKickConsumer(): void {
  if (consumer) { return; }
  consumer = startStreamConsumer("kick", coordClient, K_STREAM_KICK, async (fields) => {
    const entry = parseKickFields(fields);
    if (!entry) {
      console.warn("[kick] 丢弃非法踢人流条目");
      return;
    }
    const { uid, reason, sId, issuedAt, exceptHash } = entry;
    // ⚠ **单调栅栏（A6）：陈旧的顶号事件整条丢弃**。回读组 sess 的 `issuedAt`（A1 落地的单调量）：
    // 事件比它旧 ⇒ 说明这条广播发出之后**又发生过更晚的登录**，而那次登录已经发过自己的踢人事件
    // ⇒ 本条已无事可做，继续处理只会拿过期的 exceptHash 去踢掉赢家。
    // ⛔ **只对带 issuedAt 的事件做这个判断**：封号/撤销（GM 侧）不绑定任何一次登录，必须无条件踢。
    if (issuedAt !== undefined && sId !== undefined) {
      let stored: string | null;
      try {
        stored = await clientFor(uid).hget(kSess(uid, sId), "issuedAt");
      } catch {
        // A scoped kick is best-effort. If freshness cannot be proven, dropping
        // it is safer than letting an old exceptHash evict the current winner.
        console.warn(`[kick] 无法验证顶号事件栅栏，已丢弃 uid=${uid} sId=${sId}`);
        return;
      }
      const storedAt = normalizeKickStoredIssuedAt(stored);
      if (storedAt === null) {
        console.warn(`[kick] 组 sess 栅栏缺失或损坏，已丢弃顶号事件 uid=${uid} sId=${sId}`);
        return;
      }
      if (storedAt > issuedAt) {
        console.warn(`[kick] 丢弃陈旧顶号事件 uid=${uid}（事件 issuedAt=${issuedAt} < 组 sess ${stored}）`);
        return;
      }
    }
    kickLocal(uid, reason, exceptHash, sId);
  }, { trimMs: KICK_STREAM_TRIM_MS });
  consumerUnregister = defaultLifecycle.register("kick", () => stopKickConsumer());
}
export async function stopKickConsumer(): Promise<void> {
  const current = consumer;
  consumer = null;
  consumerUnregister?.();
  consumerUnregister = null;
  await current?.stop();
}
