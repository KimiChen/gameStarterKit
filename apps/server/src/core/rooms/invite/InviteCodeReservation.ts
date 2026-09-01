/**
 * 六位邀请码 lease 服务（Non-intrusive §6.6/§6.7）。
 *
 * - 码与内部房间分离：`(project, sId, roomCode) → opaque roomId + mode/profile + generation`，
 *   ⛔ 不把六位码当 Colyseus roomId，⛔ 不写进 listing metadata / filterBy；
 * - 使用 coordination Redis（`coordClient()`；dev 缺省复用 durable 实例，⛔ 不能用可淘汰 cache）；
 * - 全部 key 经 `keys.ts` 构造且 `sId` 显式参数逐层传递（⛔ 不读 zoneCtx，§6.7）；
 * - `leaseToken` 是续租/释放能力凭证（CSPRNG 256bit），只存在于服务端进程内存与 Redis value，
 *   ⛔ 不进 resolve 响应、不进 room state、不进日志与指标标签、不进任何 ownership key；
 *   CAS 比较在 Lua 内双侧 sha1 后进行（恒定时间等价），TS 侧不比较原文。
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  INVITE_CODE_ALLOC_MAX_ATTEMPTS,
  INVITE_CODE_COOLDOWN_MS,
  INVITE_LEASE_TTL_MS,
} from "../../infra/config";
import { kInviteCode, kInviteCodeGen } from "../../infra/keys";
import { coordClient } from "../../infra/redisRoute";
import { evalshaWithReload } from "../../infra/redisScripts";
import { INVITE_CODE_ALLOCATE, INVITE_CODE_RENEW, INVITE_CODE_TOMBSTONE } from "./redisScripts";

/** 分配结果：房间持有的 lease 句柄。leaseToken ⛔ 不得离开服务端进程/Redis value。 */
export interface InviteLease {
  readonly code: string;
  readonly leaseToken: string;
  readonly generation: number;
}

export interface InviteCodeAllocationArgs {
  readonly sId: number;
  readonly roomId: string;
  readonly mode: string;
  readonly modeVersion: number;
  readonly profile: string;
  /** 测试覆写；生产缺省 INVITE_LEASE_TTL_MS。 */
  readonly leaseTtlMs?: number;
  /** 测试注入的码生成器（构造确定碰撞以验证有界重试）；生产缺省 CSPRNG newInviteCode。 */
  readonly codeFactory?: () => string;
}

export interface InviteLeaseHandleArgs {
  readonly sId: number;
  readonly code: string;
  readonly roomId: string;
  readonly leaseToken: string;
  readonly leaseTtlMs?: number;
  readonly cooldownMs?: number;
}

/** resolve 读到的 active lease value（不含 leaseToken——读方永远拿不到能力凭证）。 */
export interface InviteLeaseView {
  readonly roomId: string;
  readonly mode: string;
  readonly modeVersion: number;
  readonly profile: string;
  readonly sId: number;
  readonly generation: number;
}

export type InviteRenewResult = "renewed" | "lost" | "unknown";
export type InviteReleaseResult = "ok" | "lost" | "unknown";

/** GameRoom 侧消费的注入接口（单测用内存假件；int/生产用下方 Redis 实现）。 */
export interface InviteCodeService {
  allocate(args: InviteCodeAllocationArgs): Promise<InviteLease>;
  renew(args: InviteLeaseHandleArgs): Promise<InviteRenewResult>;
  /** Start 成功与 dispose 都走本方法：active → tombstone（⛔ 非 DEL，§6.7 第 7 条）。 */
  releaseToTombstone(args: InviteLeaseHandleArgs): Promise<InviteReleaseResult>;
}

/** 码池拥塞（有界重试全部碰撞）：fail-closed 稳定错误 + 告警指标，⛔ 不扩大重试/不降级长码。 */
export class InviteCodePoolExhaustedError extends Error {
  constructor() {
    super("invite code pool exhausted");
    this.name = "InviteCodePoolExhaustedError";
  }
}

/** 告警指标（码池拥塞计数；测试可读）。 */
export const inviteCodeMetrics = { allocExhausted: 0 };

const sha1hex = (value: string): string => createHash("sha1").update(value, "utf8").digest("hex");

/** CSPRNG ≥128bit：256bit base64url，43 字符。每次分配重新生成（§6.7）。 */
export const newLeaseToken = (): string => randomBytes(32).toString("base64url");

/** `crypto.randomInt(0, 1_000_000)` + padStart —— `000001` 是合法码（§6.6/§6.7 第 1 条）。 */
export const newInviteCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, "0");

class RedisInviteCodeService implements InviteCodeService {
  async allocate(args: InviteCodeAllocationArgs): Promise<InviteLease> {
    const ttlMs = args.leaseTtlMs ?? INVITE_LEASE_TTL_MS;
    // 有界重试碰撞（§6.7 第 2 条）；Redis 故障直接向上抛——fail-closed，
    // ⛔ 不创建一个没有可解析邀请码的「半成功私房」（§6.7 第 8 条）。
    for (let attempt = 0; attempt < INVITE_CODE_ALLOC_MAX_ATTEMPTS; attempt++) {
      const code = (args.codeFactory ?? newInviteCode)();
      const leaseToken = newLeaseToken();
      const reply = await evalshaWithReload(
        coordClient(),
        INVITE_CODE_ALLOCATE,
        [kInviteCode(args.sId, code), kInviteCodeGen(args.sId, code)],
        [ttlMs, args.roomId, args.mode, args.modeVersion, args.profile, args.sId, leaseToken],
      );
      if (!Array.isArray(reply) || typeof reply[0] !== "string") {
        throw new Error("inviteCodeAllocate 回包形状非法");
      }
      if (reply[0] === "taken") continue;
      if (reply[0] === "ok" && typeof reply[1] === "number") {
        return { code, leaseToken, generation: reply[1] };
      }
      throw new Error(`inviteCodeAllocate 未知判定: ${String(reply[0])}`);
    }
    inviteCodeMetrics.allocExhausted++;
    // ⚠ 告警只记事实，⛔ 不携带任何具体 code/token。
    console.error("[invite] ⚠⚠ 邀请码池拥塞：有界重试全部碰撞，按 fail-closed 拒绝建房");
    throw new InviteCodePoolExhaustedError();
  }

  async renew(args: InviteLeaseHandleArgs): Promise<InviteRenewResult> {
    try {
      const reply = await evalshaWithReload(
        coordClient(),
        INVITE_CODE_RENEW,
        [kInviteCode(args.sId, args.code)],
        [sha1hex(args.leaseToken), args.leaseTtlMs ?? INVITE_LEASE_TTL_MS, args.roomId, args.sId],
      );
      if (reply === "renewed") return "renewed";
      if (reply === "lost") return "lost";
      return "unknown";
    } catch {
      // I/O / 超时：三态里的 unknown——由房间侧累计，超 leaseTtlMs 按 lost 处理（§6.7 第 5 条）。
      return "unknown";
    }
  }

  async releaseToTombstone(args: InviteLeaseHandleArgs): Promise<InviteReleaseResult> {
    try {
      const reply = await evalshaWithReload(
        coordClient(),
        INVITE_CODE_TOMBSTONE,
        [kInviteCode(args.sId, args.code)],
        [sha1hex(args.leaseToken), args.cooldownMs ?? INVITE_CODE_COOLDOWN_MS, args.roomId, args.sId],
      );
      if (reply === "ok") return "ok";
      if (reply === "lost") return "lost";
      return "unknown";
    } catch {
      return "unknown";
    }
  }
}

/** 生产单例（GameRoom 缺省注入）。 */
export const inviteCodeService: InviteCodeService = new RedisInviteCodeService();

/**
 * resolve 侧读 lease（query；⛔ 不返回 leaseToken）。返回：
 *  - InviteLeaseView：active；
 *  - "unavailable"：码不存在 / tombstone 隔离期 / 记录腐坏——统一折叠语义的上游事实，
 *    调用方必须映射为完全相同的 `ROOM_CODE_UNAVAILABLE` 响应（§6.8）。
 * Redis 故障向上抛（调用方映射可重试 `ROOM_SERVICE_UNAVAILABLE`，⛔ 不降级为确定性结论）。
 */
export async function readInviteLease(sId: number, code: string): Promise<InviteLeaseView | "unavailable"> {
  const raw = await coordClient().get(kInviteCode(sId, code));
  if (raw === null) return "unavailable";
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return "unavailable";
  }
  if (record === null || typeof record !== "object") return "unavailable";
  const value = record as Record<string, unknown>;
  if (value.v !== 1 || value.state !== "active") return "unavailable";
  if (typeof value.roomId !== "string" || typeof value.mode !== "string"
    || typeof value.profile !== "string"
    || typeof value.modeVersion !== "number" || typeof value.sId !== "number"
    || typeof value.generation !== "number") {
    return "unavailable";
  }
  // 区不匹配：key 已带 sId，理论不可达；仍按折叠语义兜底（⛔ 不区分原因）。
  if (value.sId !== sId) return "unavailable";
  return {
    roomId: value.roomId,
    mode: value.mode,
    modeVersion: value.modeVersion,
    profile: value.profile,
    sId: value.sId,
    generation: value.generation,
  };
}
