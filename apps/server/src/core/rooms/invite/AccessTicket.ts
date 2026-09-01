/**
 * creation/join access ticket（Non-intrusive §6.8，唯一形态 ⛔ 不并存第二种）：
 * CSPRNG 生成的**不透明串**（256bit base64url），串本身不携带任何自描述声明；全部绑定
 * 字段（uid/sId/roomId/mode/modeVersion/profile/lease generation/purpose/jti/exp）与
 * `issued → pending(session) → seated` 状态一起存放在 coordination Redis 记录里，
 * key 经 `keys.ts` 构造并带项目/区前缀、PX=exp；claim 是对该记录的 Lua CAS 状态推进。
 * 服务端只存 ticket 的 sha256（key 即 sha256hex，比对=按哈希寻址，沿用既有会话凭证的
 * sha256 范式）。⛔ 本方案不引入自包含签名 token，也不引入任何新的签名密钥。
 */
import { createHash, randomBytes } from "node:crypto";
import { INVITE_MAX_ROOMS_PER_UID, INVITE_WAITING_DEADLINE_MS, ROOM_TICKET_TTL_MS } from "../../infra/config";
import { kRoomTicket, kRoomTicketQuota } from "../../infra/keys";
import { coordClient } from "../../infra/redisRoute";
import { evalshaWithReload } from "../../infra/redisScripts";
import {
  TICKET_CLAIM_CREATION,
  TICKET_CLAIM_JOIN,
  TICKET_ISSUE_CREATION,
  TICKET_TRANSITION,
} from "./redisScripts";

/** 不透明 ticket 串：256bit ≥ §6.8 要求的 128bit；base64url 43 字符。 */
export const newAccessTicket = (): string => randomBytes(32).toString("base64url");
/** 安全随机 jti（记录/配额成员标识；不等于 ticket 本身）。 */
export const newTicketJti = (): string => randomBytes(16).toString("hex");
/** 服务端只按 sha256 寻址/存储 ticket（原文不落 Redis key、不进日志）。 */
export const accessTicketHash = (ticket: string): string =>
  createHash("sha256").update(ticket, "utf8").digest("hex");

// ── 签发（Lobby RPC 侧；zoneCtx.run 内取得的权威 sId 以显式参数传入） ────────

export interface IssueCreationTicketArgs {
  readonly sId: number;
  readonly uid: string;
  readonly mode: string;
  readonly modeVersion: number;
  readonly profile: string;
  readonly nowMs: number;
  readonly ttlMs?: number;
  readonly maxPerUid?: number;
}

export type IssueCreationTicketResult =
  | { readonly kind: "ok"; readonly ticket: string; readonly jti: string; readonly expiresAt: number }
  | { readonly kind: "quota" };

/** 配额（活跃 invite room + 未消费 creation ticket）原子检查 + 签发（单条 Lua）。 */
export async function issueCreationTicket(args: IssueCreationTicketArgs): Promise<IssueCreationTicketResult> {
  const ttlMs = args.ttlMs ?? ROOM_TICKET_TTL_MS;
  const expiresAt = args.nowMs + ttlMs;
  const ticket = newAccessTicket();
  const jti = newTicketJti();
  const record = JSON.stringify({
    v: 1,
    purpose: "create",
    state: "issued",
    uid: args.uid,
    sId: args.sId,
    mode: args.mode,
    modeVersion: args.modeVersion,
    profile: args.profile,
    jti,
    exp: expiresAt,
  });
  const reply = await evalshaWithReload(
    coordClient(),
    TICKET_ISSUE_CREATION,
    [kRoomTicketQuota(args.sId, args.uid), kRoomTicket(args.sId, accessTicketHash(ticket))],
    [
      args.maxPerUid ?? INVITE_MAX_ROOMS_PER_UID,
      ttlMs,
      jti,
      record,
      // quota 键 TTL 兜底：覆盖最长成员（活跃房 = waitingDeadline 视界）+ 一个 ticket TTL 余量。
      INVITE_WAITING_DEADLINE_MS + ttlMs,
    ],
  );
  if (!Array.isArray(reply) || typeof reply[0] !== "string") {
    throw new Error("roomTicketIssueCreation 回包形状非法");
  }
  if (reply[0] === "quota") return { kind: "quota" };
  if (reply[0] === "dup") throw new Error("roomTicketIssueCreation 撞 sha256 记录（不可能事件）");
  if (reply[0] !== "ok") throw new Error(`roomTicketIssueCreation 未知判定: ${String(reply[0])}`);
  return { kind: "ok", ticket, jti, expiresAt };
}

export interface IssueJoinTicketArgs {
  readonly sId: number;
  readonly uid: string;
  readonly roomId: string;
  readonly mode: string;
  readonly modeVersion: number;
  readonly profile: string;
  readonly code: string;
  readonly generation: number;
  readonly nowMs: number;
  readonly ttlMs?: number;
}

/** resolve 命中后签发 join ticket（绑定 lease generation；⚠ 不预留座位——§6.8）。 */
export async function issueJoinTicket(args: IssueJoinTicketArgs): Promise<{ ticket: string; expiresAt: number }> {
  const ttlMs = args.ttlMs ?? ROOM_TICKET_TTL_MS;
  const expiresAt = args.nowMs + ttlMs;
  const ticket = newAccessTicket();
  const record = JSON.stringify({
    v: 1,
    purpose: "join",
    state: "issued",
    uid: args.uid,
    sId: args.sId,
    roomId: args.roomId,
    mode: args.mode,
    modeVersion: args.modeVersion,
    profile: args.profile,
    code: args.code,
    generation: args.generation,
    jti: newTicketJti(),
    exp: expiresAt,
  });
  await coordClient().set(kRoomTicket(args.sId, accessTicketHash(ticket)), record, "PX", ttlMs);
  return { ticket, expiresAt };
}

// ── GameRoom 侧消费接口（注入面；单测内存假件、生产 Redis 实现） ─────────────

export interface ClaimCreationArgs {
  readonly sId: number;
  readonly ticket: string;
  readonly roomId: string;
  readonly mode: string;
  readonly profile: string;
}

export type ClaimCreationResult =
  | { readonly kind: "ok"; readonly uid: string; readonly modeVersion: number }
  | { readonly kind: "refused" };

export interface ClaimJoinArgs {
  readonly sId: number;
  readonly ticket: string;
  readonly sessionId: string;
  readonly roomId: string;
  readonly mode: string;
  readonly profile: string;
  readonly code: string;
  readonly generation: number;
}

export type ClaimJoinResult =
  | { readonly kind: "ok"; readonly uid: string }
  | { readonly kind: "refused" };

export interface AccessTicketService {
  /** onCreate 原子占有 creation claim；返回 expectedOwnerUid（⛔ 不得从入座顺序推断房主）。 */
  claimCreation(args: ClaimCreationArgs): Promise<ClaimCreationResult>;
  /** 准入时序第 3 步：issued → pending(session) CAS + 绑定校验（roomId/mode/profile/generation）。 */
  claimJoin(args: ClaimJoinArgs): Promise<ClaimJoinResult>;
  /** 入座前安全失败：pending(session) → issued（原 exp 内恢复，best-effort）。 */
  releaseJoin(sId: number, ticket: string, sessionId: string): Promise<void>;
  /** 第 6 步落座后：pending(session) → seated（此后不可回退；同 ticket 重放被拒）。 */
  seatJoin(sId: number, ticket: string, sessionId: string): Promise<void>;
  /** 房主落座：claimed(roomId) → seated。 */
  seatCreation(sId: number, ticket: string, roomId: string): Promise<void>;
  /** room dispose：释放配额成员 r:<roomId>（owner 的私房槽位）。 */
  releaseRoomQuota(sId: number, uid: string, roomId: string): Promise<void>;
}

class RedisAccessTicketService implements AccessTicketService {
  async claimCreation(args: ClaimCreationArgs): Promise<ClaimCreationResult> {
    const ticketKey = kRoomTicket(args.sId, accessTicketHash(args.ticket));
    // 预读只为派生 quota key 的 uid 分量（记录本身按 sha256 寻址）；授权判定全部在
    // 下方 Lua 的原子 CAS 内重做，预读值被篡改只会导致 claim 'mismatch' 拒绝。
    const raw = await coordClient().get(ticketKey);
    if (raw === null) return { kind: "refused" };
    let uid: string;
    try {
      const record = JSON.parse(raw) as { uid?: unknown };
      if (typeof record.uid !== "string" || record.uid.length < 1) return { kind: "refused" };
      uid = record.uid;
    } catch {
      return { kind: "refused" };
    }
    const reply = await evalshaWithReload(
      coordClient(),
      TICKET_CLAIM_CREATION,
      [ticketKey, kRoomTicketQuota(args.sId, uid)],
      [args.sId, args.mode, args.profile, args.roomId,
        INVITE_WAITING_DEADLINE_MS + ROOM_TICKET_TTL_MS,
        INVITE_WAITING_DEADLINE_MS + ROOM_TICKET_TTL_MS,
        uid],
    );
    if (!Array.isArray(reply) || typeof reply[0] !== "string") {
      throw new Error("roomTicketClaimCreation 回包形状非法");
    }
    if (reply[0] === "ok" && typeof reply[1] === "string" && typeof reply[2] === "string") {
      return { kind: "ok", uid: reply[1], modeVersion: Number(reply[2]) };
    }
    return { kind: "refused" };
  }

  async claimJoin(args: ClaimJoinArgs): Promise<ClaimJoinResult> {
    const reply = await evalshaWithReload(
      coordClient(),
      TICKET_CLAIM_JOIN,
      [kRoomTicket(args.sId, accessTicketHash(args.ticket))],
      [args.sessionId, args.sId, args.roomId, args.mode, args.profile, args.code, args.generation],
    );
    if (!Array.isArray(reply) || typeof reply[0] !== "string") {
      throw new Error("roomTicketClaimJoin 回包形状非法");
    }
    if (reply[0] === "ok" && typeof reply[1] === "string") {
      return { kind: "ok", uid: reply[1] };
    }
    return { kind: "refused" };
  }

  async releaseJoin(sId: number, ticket: string, sessionId: string): Promise<void> {
    try {
      await evalshaWithReload(
        coordClient(),
        TICKET_TRANSITION,
        [kRoomTicket(sId, accessTicketHash(ticket))],
        ["pending", sessionId, "issued"],
      );
    } catch {
      // best-effort：失败由记录 TTL 收敛（pending 无法被他人 claim，损失有界）。
    }
  }

  async seatJoin(sId: number, ticket: string, sessionId: string): Promise<void> {
    await evalshaWithReload(
      coordClient(),
      TICKET_TRANSITION,
      [kRoomTicket(sId, accessTicketHash(ticket))],
      ["pending", sessionId, "seated"],
    );
  }

  async seatCreation(sId: number, ticket: string, roomId: string): Promise<void> {
    await evalshaWithReload(
      coordClient(),
      TICKET_TRANSITION,
      [kRoomTicket(sId, accessTicketHash(ticket))],
      ["claimed", roomId, "seated"],
    );
  }

  async releaseRoomQuota(sId: number, uid: string, roomId: string): Promise<void> {
    try {
      await coordClient().zrem(kRoomTicketQuota(sId, uid), `r:${roomId}`);
    } catch {
      // best-effort：残余成员由 quota 键 TTL 与 score 剪除兜底。
    }
  }
}

/** 生产单例（GameRoom 缺省注入）。 */
export const accessTicketService: AccessTicketService = new RedisAccessTicketService();
