/**
 * 异常类型 + 错误码映射（[07 · 错误码表](docs/SERVER.md)）。
 *
 * 客户端按 `code` 分支，⛔ 禁止解析 `msg`（09·G3）。新增错误码必须先加 07 的表。
 */

import type { RpcErrCode } from "@game/shared";

// 错误码真源在 shared/protocol/lobbyRpc/envelope.ts 的 RPC_ERR_CODES（登记顺序：07 表 → shared → 此处映射）
export type ErrCode = RpcErrCode;

/** 抢 lock:{uid} 失败（客户端同一 clientReqId 自动重试）。 */
export class BusyError extends Error {
  constructor(msg = "user lock busy") { super(msg); this.name = "BusyError"; }
}

/** casHset 返回 stale：本请求的 fence 已被更高 fence 超越（客户端自动重试）。 */
export class StaleFenceError extends Error {
  constructor(msg = "fence stale") { super(msg); this.name = "StaleFenceError"; }
}

/**
 * 余额守卫 UPDATE 0 行且回读确认余额确实不足。
 * ⚠ 07 的 InsufficientOrStale 已按其建议拆开：UPDATE 前先读余额，
 * 足 → StaleFenceError（自动重试）；不足 → 本异常（引导充值）。
 */
export class InsufficientBalanceError extends Error {
  constructor(msg = "insufficient balance") { super(msg); this.name = "InsufficientBalanceError"; }
}

/** accounts.status = 1。 */
export class BannedError extends Error {
  constructor(msg = "account banned") { super(msg); this.name = "BannedError"; }
}

/** sess.tokenEpoch < accounts.token_epoch（被踢/封号后旧会话）。 */
export class EpochStaleError extends Error {
  constructor(msg = "token epoch stale") { super(msg); this.name = "EpochStaleError"; }
}

/** 无 token / token 无效。 */
export class AuthRequiredError extends Error {
  constructor(msg = "auth required") { super(msg); this.name = "AuthRequiredError"; }
}

/** 令牌桶耗尽。 */
export class RateLimitedError extends Error {
  constructor(msg = "rate limited") { super(msg); this.name = "RateLimitedError"; }
}

/** zod 校验失败。 */
export class InvalidPayloadError extends Error {
  constructor(msg = "invalid payload") { super(msg); this.name = "InvalidPayloadError"; }
}

/** 路由表无此 type（⛔ 不计 flood 不封禁，09·G6）。 */
export class UnknownTypeError extends Error {
  constructor(msg = "unknown rpc type") { super(msg); this.name = "UnknownTypeError"; }
}

/** 幂等 pending 哨兵命中：同 op 正在执行（客户端短轮询）。 */
export class InProgressError extends Error {
  constructor(msg = "operation in progress") { super(msg); this.name = "InProgressError"; }
}

/** 冷档解冻中 / 解冻限流（客户端退避比 IN_PROGRESS 更长）。 */
export class ThawingError extends Error {
  constructor(msg = "user thawing") { super(msg); this.name = "ThawingError"; }
}

/** accounts 有号但热档与冷档全无（09·F4）：⛔ 不建空档，立即告警。 */
export class UserDataLostError extends Error {
  constructor(msg = "user data lost") { super(msg); this.name = "UserDataLostError"; }
}

/**
 * Lua 返回 cold：user:{uid} 不存在（可能已冻结）。
 * 内部信号，调用方 `ensureLive(uid)` 后重试；不直接对客户端暴露。
 */
export class ColdUserError extends Error {
  constructor(msg = "user cold") { super(msg); this.name = "ColdUserError"; }
}

/** 异常 → 错误码（07 ERR_MAP + 全量错误码）。 */
const ERR_MAP = new Map<Function, ErrCode>([
  [BusyError, "BUSY"],
  [StaleFenceError, "STALE_FENCE"],
  [InsufficientBalanceError, "INSUFFICIENT_BALANCE"],
  [BannedError, "ACCOUNT_BANNED"],
  [EpochStaleError, "AUTH_EPOCH_STALE"],
  [AuthRequiredError, "AUTH_REQUIRED"],
  [RateLimitedError, "RATE_LIMITED"],
  [InvalidPayloadError, "INVALID_PAYLOAD"],
  [UnknownTypeError, "UNKNOWN_TYPE"],
  [InProgressError, "IN_PROGRESS"],
  [ThawingError, "THAWING"],
  [UserDataLostError, "USER_DATA_LOST"],
]);

/** 把任意异常规约成 RpcReply.err。未映射的一律 INTERNAL（不泄漏内部细节）。 */
export function toErrCode(e: unknown): ErrCode {
  if (e && typeof e === "object") {
    const code = ERR_MAP.get((e as object).constructor);
    if (code) { return code; }
  }
  return "INTERNAL";
}
