/**
 * 异常类型 + 错误码映射（[07 · 错误码表](docs/SERVER.md)）。
 *
 * 客户端按 `code` 分支，⛔ 禁止解析 `msg`（09·G3）。新增错误码必须先加 07 的表。
 */

import { ErrorCode as ColyseusErrorCode, ServerError } from "@colyseus/core";
import type { ErrorCodeType, RpcErrCode } from "@game/shared";

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

// EpochStaleError 已随 M12d 简化退休（撤销真相位只剩 status + token_hash，无 epoch fence）：
// 撤销的存量 token 一律走 AuthRequiredError（hash 不匹配）/ BannedError（status=1）。
// shared 的 `AUTH_EPOCH_STALE` 错误码**保留不删**（客户端 union 少动；服务端不再产出）。

/** 无 token / token 无效。 */
export class AuthRequiredError extends Error {
  constructor(msg = "auth required") { super(msg); this.name = "AuthRequiredError"; }
}

/** 令牌桶耗尽。 */
export class RateLimitedError extends Error {
  constructor(msg = "rate limited") { super(msg); this.name = "RateLimitedError"; }
}

/** 微信侧不可用（超时/熔断/系统繁忙）——客户端退避重试，不算凭证错误。未映射 → INTERNAL(500)。 */
export class WxUnavailableError extends Error {
  constructor(msg = "wx unavailable") { super(msg); this.name = "WxUnavailableError"; }
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
  [AuthRequiredError, "AUTH_REQUIRED"],
  [RateLimitedError, "RATE_LIMITED"],
  [InvalidPayloadError, "INVALID_PAYLOAD"],
  [UnknownTypeError, "UNKNOWN_TYPE"],
  [InProgressError, "IN_PROGRESS"],
  [ThawingError, "THAWING"],
  // 冷档命中：语义上就是「解冻中/需解冻，稍后重试」——⛔ 不许落到 INTERNAL
  //（曾经未映射：回流用户写操作全部报内部错误）
  [ColdUserError, "THAWING"],
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

/**
 * 建连拒绝（`onAuth`/`onJoin`）专用的 `ServerError`。
 *
 * ⚠ **`ServerError` 的第一参会被 Colyseus 当 HTTP status 用**
 * （`@colyseus/core/router/default_routes`: `throw ctx.error(e.code, …)` → `new Response(…, {status})`），
 * 所以它自己的 `ErrorCode` 全是 **520–526**。⛔ 直接传业务码（2001/3004/3005/…）会让
 * `new Response` 抛 `RangeError: init["status"] must be in the range of 200 to 599`：
 * 拒连**仍然发生**（所以只断言"被拒"的测试是假绿），但**业务码到不了客户端**、服务端还刷 SERVER_ERROR 日志。
 *
 * 故约定：**status 只用 Colyseus 的 525/526，业务码走 message**（客户端 `Number(msg)` → shared
 * `ErrorMessage` 取文案，仍是单源）。`errors-http-status.test.ts` 机检不再有越界 status。
 */
export function joinRefused(code: ErrorCodeType, kind: "auth" | "app" = "app"): ServerError {
  return new ServerError(
    kind === "auth" ? ColyseusErrorCode.AUTH_FAILED : ColyseusErrorCode.APPLICATION_ERROR,
    String(code),
  );
}
