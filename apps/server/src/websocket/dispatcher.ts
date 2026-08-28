/**
 * RPC dispatcher（[03 · RPC dispatcher](docs/SERVER.md)）。
 *
 * 信封 `{id,type,payload}` → `{id,ok,data,err}`；中间件链：鉴权（连接级 onAuth + 每消息
 * 快路径复验）→ 限流 → zod → 幂等占位 → handler。
 *
 * - 大包防护在 ws transport 层 `maxPayload`（09·G4），这里不再重复算尺寸。
 * - 匿名限流/幂等 key 用 sessionId，⛔ 禁止 null 塌缩共享桶（09·G5）。
 * - 未知 type 只回 UNKNOWN_TYPE + 低权重计数，⛔ 不计 flood 不封禁（09·G6）。
 * - 超时用 Promise.race **无法真正取消**（09·G9）：副作用安全靠数据层幂等/CAS。
 */
import { z, ZodError, type ZodType } from "zod";
import {
  HANDLER_TIMEOUT_MS, RPC_RATE_CAPACITY, RPC_RATE_REFILL_PER_S,
} from "../core/infra/config";
import { kIdemUser, kRl } from "../core/infra/keys";
import { clientFor, clientForKey } from "../core/infra/redisRoute";
import { evalshaWithReload, TOKEN_BUCKET } from "../core/infra/redisScripts";
import {
  InProgressError, InvalidPayloadError, RateLimitedError, UnknownTypeError, toErrCode,
} from "../core/errors";
import { idemAcquire, idemComplete, idemRelease } from "../core/idem";
import {
  validateLobbyRpcResponse,
  validateRpcEnvelope,
  validateRpcReply,
  WireValidationError,
  type IRpcEnvelope,
  type IRpcReply,
  type LobbyRpcType,
  type RpcErrCode,
} from "@game/shared";

/** Error/field helpers used only at the outer transport boundary. */
function safeField(input: unknown, key: string): unknown {
  try {
    if (input === null || input === undefined) return undefined;
    return (input as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function safeText(value: unknown): string {
  try {
    if (value === null || value === undefined) return "";
    return typeof value === "string" ? value : String(value);
  } catch {
    return "";
  }
}

function safeErrorMessage(error: unknown): string {
  try {
    return error instanceof Error ? safeText(error.message) : safeText(error);
  } catch {
    return "";
  }
}

function isWireValidationError(error: unknown): boolean {
  try { return error instanceof WireValidationError; }
  catch { return false; }
}

/** A response-contract failure is a server defect, never client input. */
class RpcResponseContractError extends Error {
  constructor() {
    super("rpc response contract violation");
    this.name = "RpcResponseContractError";
  }
}

function isResponseContractError(error: unknown): boolean {
  try { return error instanceof RpcResponseContractError; }
  catch { return false; }
}

/** Validate an outbound RPC value without exposing validator/cache details. */
function validateResponseForServer(type: LobbyRpcType, input: unknown): unknown {
  try {
    return validateLobbyRpcResponse(type, input);
  } catch {
    throw new RpcResponseContractError();
  }
}

function validateReplyForServer(input: unknown): RpcReply {
  try {
    return validateRpcReply(input);
  } catch {
    throw new RpcResponseContractError();
  }
}

/** Handler wrappers can be registered outside defineRpc; normalize their raw wire failures too. */
async function runHandlerWithResponseContract(
  type: LobbyRpcType,
  run: () => Promise<unknown>,
): Promise<unknown> {
  let result: unknown;
  try {
    result = await run();
  } catch (error) {
    if (isWireValidationError(error)) { throw new RpcResponseContractError(); }
    throw error;
  }
  return validateResponseForServer(type, result);
}

// 信封真源在 shared/protocol/lobbyRpc/envelope.ts（双端同一定义，改形状去那边）
export type RpcEnvelope = IRpcEnvelope;
export type RpcReply = IRpcReply;

/**
 * Colyseus' validator and direct dispatcher callers share the exact same
 * zero-dependency envelope contract.  The transform is deliberately kept at
 * this boundary so a future transport cannot bypass unknown-key/id checks.
 */
export const rpcEnvelopeSchema = z.unknown().transform((input, ctx) => {
  try {
    return validateRpcEnvelope(input);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: safeErrorMessage(error) || "invalid rpc envelope",
    });
    return z.NEVER;
  }
});

export interface RpcCtx {
  /** 已鉴权 uid（09·G1：token 反查，⛔ 不信客户端传参）。 */
  uid: string;
  sessionId: string;
  /** 服务端主动推送（本连接）。 */
  push: (type: string, data: unknown) => void;
}

interface RouteDef<T> {
  schema: ZodType<T>;
  /**
   * 幂等占位（09·I1：执行前 SET NX + 数据层 UNIQUE 兜底）。跨存储/非天然幂等的写 handler
   * 必须开；开了则 payload 必须带 clientReqId（客户端重试复用同一个，09·I2）。
   */
  idem?: boolean;
  handler: (ctx: RpcCtx, payload: T) => Promise<unknown>;
}

const routeTable = new Map<string, RouteDef<unknown>>();

export function registerRoute<T>(type: string, def: RouteDef<T>): void {
  if (routeTable.has(type)) { throw new Error(`RPC 路由重复注册: ${type}`); }
  routeTable.set(type, def as RouteDef<unknown>);
}

// 未知 type 低权重计数（09·G6：灰度期新客户端的新 type 不能触发封禁）
let unknownTypeCount = 0;
export const getUnknownTypeCount = (): number => unknownTypeCount;

/** RPC 限流：per-user 令牌桶（时钟在 Lua 内，09·R7）。 */
async function rateCheck(scope: string): Promise<void> {
  const key = kRl(`rpc:${scope}`);
  const r = await evalshaWithReload(clientForKey(key), TOKEN_BUCKET, [key],
    [RPC_RATE_CAPACITY, RPC_RATE_REFILL_PER_S, 1]);
  if (r === -1) { throw new RateLimitedError(); }
}

interface RpcIdemStore {
  acquire: () => ReturnType<typeof idemAcquire>;
  complete: (resultJson: string) => Promise<void>;
  release: () => Promise<void>;
}

/**
 * Timer boundary for the handler deadline. Keeping the tiny adapter
 * injectable lets the lifecycle contract be tested without waiting ten
 * seconds or monkey-patching process-wide timer state.
 */
export interface DispatcherTimerApi {
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}

const dispatcherTimers: DispatcherTimerApi = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
};

/** Promise.race deadline used by dispatchRpc; the handler is intentionally not cancelled. */
async function runWithHandlerTimeout<T>(
  type: string,
  invoke: () => Promise<T>,
  timers: DispatcherTimerApi = dispatcherTimers,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = timers.setTimeout(
      () => reject(new Error(`handler 超时: ${type}`)),
      HANDLER_TIMEOUT_MS,
    );
    // An idle handler deadline must not keep a draining process alive. The
    // optional shape also supports browser-like adapters used by tests.
    const unref = (timeoutHandle as unknown as { unref?: () => void }).unref;
    if (typeof unref === "function") { unref.call(timeoutHandle); }
  });
  try {
    return await Promise.race([invoke(), timeout]);
  } finally {
    if (timeoutHandle !== null) { timers.clearTimeout(timeoutHandle); }
  }
}

/**
 * 幂等状态机：pending 命中 → IN_PROGRESS；done 命中 → 回已校验缓存；首次执行只有通过
 * shared response contract 后才能从 pending 提升为 done。校验/执行失败会立即释放自己的占位。
 */
async function runValidatedIdem(
  type: LobbyRpcType,
  store: RpcIdemStore,
  run: () => Promise<unknown>,
): Promise<unknown> {
  let state: Awaited<ReturnType<typeof idemAcquire>>;
  try {
    state = await store.acquire();
  } catch (error) {
    // The Redis adapter should never emit shared wire errors, but if a test or
    // future adapter does, it is a server-side boundary failure, not input.
    if (isWireValidationError(error)) { throw new RpcResponseContractError(); }
    throw error;
  }
  if (state.kind === "pending") { throw new InProgressError(); }
  if (state.kind === "done") {
    let cached: unknown;
    try {
      cached = JSON.parse(state.result);
    } catch {
      // A corrupt durable/cache value must not be reflected to the caller or
      // interpreted as a fresh execution. It is not our pending lease, so do
      // not release/delete it here; normal TTL/repair handles the entry.
      throw new RpcResponseContractError();
    }
    return validateResponseForServer(type, cached);
  }
  try {
    const result = await runHandlerWithResponseContract(type, run);
    try {
      await store.complete(JSON.stringify(result ?? null));
    } catch (error) {
      if (isWireValidationError(error)) { throw new RpcResponseContractError(); }
      throw error;
    }
    return result;
  } catch (e) {
    await store.release().catch(() => {});
    throw e;
  }
}

/** Redis wiring for the pure idempotency state machine above. */
async function runIdem(
  ctx: RpcCtx,
  type: LobbyRpcType,
  clientReqId: string,
  run: () => Promise<unknown>,
): Promise<unknown> {
  const key = kIdemUser(type, ctx.uid, clientReqId);
  const client = clientFor(ctx.uid);
  return runValidatedIdem(type, {
    acquire: () => idemAcquire(client, key, ctx.sessionId),
    complete: (resultJson) => idemComplete(client, key, resultJson),
    release: () => idemRelease(client, key, ctx.sessionId),
  }, run);
}

function rpcErrorCode(error: unknown): RpcErrCode {
  // Inbound wire validation is client input. Outbound/cache validation is a
  // server defect and is deliberately wrapped above so it cannot be confused
  // with a malformed request.
  try {
    if (isResponseContractError(error)) { return "INTERNAL"; }
    if (isWireValidationError(error)) { return "INVALID_PAYLOAD"; }
    return toErrCode(error);
  } catch {
    return "INTERNAL";
  }
}

/** Narrow unit-test seam; production callers use dispatchRpc. */
export const _dispatcherTestHooks = { runValidatedIdem, rpcErrorCode, runWithHandlerTimeout };

/** 单条 RPC 处理。永不 throw——一切异常规约成 {ok:false, err}（09·G3 按 code 分支）。 */
export async function dispatchRpc(ctx: RpcCtx, msg: RpcEnvelope): Promise<RpcReply> {
  try {
    // Validate again even when the caller is LobbyRoom's Colyseus wrapper:
    // tests, internal adapters, and future transports can invoke dispatchRpc
    // directly.  In particular, `payload: null` must not collapse to `{}`.
    const envelope = validateRpcEnvelope(msg);
    // Apply the same per-principal budget before route lookup.  Unknown or
    // future message names must not bypass the limiter and become an unbounded
    // CPU/log counter during a probing flood.
    await rateCheck(ctx.uid || ctx.sessionId);
    const def = routeTable.get(envelope.type);
    if (!def) {
      unknownTypeCount++;
      throw new UnknownTypeError();
    }

    let payload: unknown;
    try {
      const rawPayload = envelope.payload === undefined ? {} : envelope.payload;
      payload = def.schema.parse(rawPayload);
    } catch (e) {
      throw e instanceof ZodError ? new InvalidPayloadError(e.message) : e;
    }

    const invoke = (): Promise<unknown> => {
      if (!def.idem) {
        return runHandlerWithResponseContract(
          envelope.type as LobbyRpcType,
          () => def.handler(ctx, payload),
        );
      }
      const clientReqId = (payload as { clientReqId?: unknown }).clientReqId;
      if (typeof clientReqId !== "string" || clientReqId.length === 0) {
        throw new InvalidPayloadError("缺 clientReqId");
      }
      return runIdem(ctx, envelope.type as LobbyRpcType, clientReqId, () => def.handler(ctx, payload));
    };

    // 超时兜底（09·G9）：race 不取消 handler，数据层幂等保证迟到首跑无害
    const data = await runWithHandlerTimeout(envelope.type, invoke);
    return validateReplyForServer({
      id: envelope.id,
      ok: true,
      data: validateResponseForServer(envelope.type as LobbyRpcType, data),
    });
  } catch (e) {
    // Shared wire errors are client input failures, not internal outages.
    // Preserve that distinction before mapping the rest of the domain errors.
    const code = rpcErrorCode(e);
    if (code === "INTERNAL") {
      const type = safeText(safeField(msg, "type"));
      // Do not pass the original error object to console inspection: a hostile
      // Proxy can throw while Node formats it, defeating the catch boundary.
      try { console.error(`[rpc] INTERNAL type=${type}`, safeErrorMessage(e)); } catch { /* logging is best-effort */ }
    }
    // INTERNAL = 未映射异常，message 可能携带栈/SQL/内部路径——生产环境不下发原文
    //（完整异常已进上面的服务端日志）；业务错误码的 message 是刻意给客户端的，照传
    const rawMsg = safeErrorMessage(e);
    const visibleMsg = isResponseContractError(e)
      ? "internal error"
      : code === "INTERNAL" && process.env.NODE_ENV === "production" ? "internal error" : rawMsg;
    // Keep the reply itself valid even when a Zod/driver error contains a
    // huge path or serialized payload.  Client correlation must survive the
    // truncation, while details remain in server logs.
    const msgOut = visibleMsg.length > 2048 ? visibleMsg.slice(0, 2048) : visibleMsg;
    let replyId = "invalid";
    try {
      if (typeof msg?.id === "string" && msg.id.length >= 1 && msg.id.length <= 64) replyId = msg.id;
    } catch { /* a hostile proxy/object must not make the dispatcher throw */ }
    return validateRpcReply({ id: replyId, ok: false, err: { code, msg: msgOut } });
  }
}
