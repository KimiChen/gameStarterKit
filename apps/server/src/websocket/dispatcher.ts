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
import { performance } from "node:perf_hooks";
import { z, ZodError, type ZodType } from "zod";
import {
  HANDLER_TIMEOUT_MS, IDEM_HASH_BUDGET_MS, IDEM_PENDING_MS,
  RPC_BUDGET_WARN_INTERVAL_MS, RPC_RATE_CAPACITY, RPC_RATE_REFILL_PER_S,
} from "../core/infra/config";
import { kIdemPending, kIdemUser, kRl } from "../core/infra/keys";
import { clientFor, clientForKey } from "../core/infra/redisRoute";
import { evalshaWithReload, TOKEN_BUCKET } from "../core/infra/redisScripts";
import {
  BusyError, InProgressError, InvalidPayloadError, RateLimitedError, RpcFault,
  toRpcFaultCode, UnknownTypeError, toErrCode,
} from "../core/errors";
import {
  idemAcquire, idemComplete, idemPayloadHash, idemRelease, newIdemLeaseId,
  type IdemAcquire, type IdemCompleteResult,
} from "../core/idem";
import {
  LOBBY_RPC_CONTRACT_VERSIONS,
  LOBBY_RPC_INSPECTABLE,
  LOBBY_RPC_INSPECTS,
  LOBBY_RPC_OPERATION_GROUPS,
  validateLobbyRpcResponse,
  validateRpcEnvelope,
  validateRpcReply,
  WireValidationError,
  type IRpcEnvelope,
  type IRpcReply,
  type LobbyRpcType,
  type RpcErrCode,
  type RpcRes,
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

/** §6.13 受控 operation 查询结果；`done-oversize` 墓碑映射 `result-expired`，⛔ 不归 unknown。 */
export type InspectResult<T extends LobbyRpcType = LobbyRpcType> =
  | { kind: "pending" }
  | { kind: "done"; data: RpcRes<T> }
  | { kind: "result-expired" }
  | { kind: "unknown" };

export interface RpcCtx {
  /** 已鉴权 uid（09·G1：token 反查，⛔ 不信客户端传参）。 */
  uid: string;
  sessionId: string;
  /** 服务端主动推送（本连接）。 */
  push: (type: string, data: unknown) => void;
  /**
   * §6.11：框架注入的当前请求 canonical payload hash 与契约版本（仅幂等写路由；
   * 领域收据直接复用它，⛔ 禁止领域自行再实现一套 canonicalization）。
   */
  operation?: { readonly hash: string; readonly contractVersion: number };
  /**
   * §6.13：受控 operation 查询能力。只有声明了 `inspectsOperationGroup` 的 query 路由
   * 会拿到（dispatcher 按 route metadata 绑定 uid/zone/组），其余路由恒为 undefined。
   */
  operations?: {
    readonly inspect: (routeType: LobbyRpcType, clientReqId: string) => Promise<InspectResult>;
  };
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
  acquire: () => Promise<IdemAcquire>;
  complete: (resultJson: string) => Promise<IdemCompleteResult>;
  release: () => Promise<void>;
}

// ── 幂等 v2 指标（§6.12：oversize 与孤儿 lease 都必须可观测；形态照 rpc-budget） ──

const idemMetricCounters = { oversize: 0, orphanLease: 0, slowHandler: 0, slowHash: 0 };
const idemMetricWarnAt = new Map<string, number>();
const IDEM_METRIC_IS_PROD = process.env.NODE_ENV === "production";

function idemMetricWarn(metric: keyof typeof idemMetricCounters, type: string, detail: string): void {
  idemMetricCounters[metric]++;
  const key = `${metric}:${type}`;
  const now = Date.now();
  if (IDEM_METRIC_IS_PROD && now - (idemMetricWarnAt.get(key) ?? 0) < RPC_BUDGET_WARN_INTERVAL_MS) { return; }
  idemMetricWarnAt.set(key, now);
  try { console.warn(detail); } catch { /* logging is best-effort */ }
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
 * 幂等 v2 状态机（§6.11 固定序，acquire 的 hash/版本比对在单条 Lua 内原子完成）：
 *  - conflict（同 ID 异 payload）→ OPERATION_CONFLICT（本阶段唯一有意的对外行为收紧）；
 *  - in-progress（同 hash pending）→ IN_PROGRESS；
 *  - done（同 hash）→ 缓存重放前重过 response validator（失败 → INTERNAL 且**不删记录**，
 *    该 clientReqId 在剩余 TTL 内不可用——刻意 fail-closed，客户端改由领域收据查询恢复）；
 *  - done-oversize 墓碑 → OPERATION_RESULT_EXPIRED（既不重跑 handler 也不伪装 unknown）；
 *  - version-mismatch → fail closed：pending 态 IN_PROGRESS / done 态 OPERATION_RESULT_EXPIRED
 *    （⛔ 不重放、不重新执行）；
 *  - corrupt/未知版本记录 → INTERNAL（⛔ 不当作未执行）；
 *  - busy（每 uid pending 上限）→ BUSY；
 *  - acquired → handler → complete(CAS)。complete 返回 lost = 本次执行确实成功但缓存归属
 *    已旁落（孤儿 lease）：结果仍回给本次调用方、⛔ 不回滚业务也不覆盖新记录，打独立指标。
 *  任何失败路径只释放自己的 pending（CAS by leaseId）。
 */
async function runValidatedIdem(
  type: LobbyRpcType,
  store: RpcIdemStore,
  run: () => Promise<unknown>,
): Promise<unknown> {
  let state: IdemAcquire;
  try {
    state = await store.acquire();
  } catch (error) {
    // The Redis adapter should never emit shared wire errors, but if a test or
    // future adapter does, it is a server-side boundary failure, not input.
    if (isWireValidationError(error)) { throw new RpcResponseContractError(); }
    throw error;
  }
  switch (state.kind) {
    case "busy":
      throw new BusyError("并发幂等操作过多，稍后重试");
    case "in-progress":
      throw new InProgressError();
    case "conflict":
      throw new RpcFault("OPERATION_CONFLICT", "同一 clientReqId 携带了不同 payload");
    case "done-oversize":
      throw new RpcFault("OPERATION_RESULT_EXPIRED", "操作已执行，结果缓存不可得，请走领域查询");
    case "version-mismatch":
      if (state.state === "pending") { throw new InProgressError(); }
      throw new RpcFault("OPERATION_RESULT_EXPIRED", "操作已执行，契约版本已升级，请走领域查询");
    case "corrupt":
      // A corrupt/unknown-version record must not be reflected to the caller or
      // interpreted as "not executed". It is not our pending lease, so do not
      // release/delete it here; normal TTL handles the entry (fail closed).
      throw new RpcResponseContractError();
    case "done": {
      let cached: unknown;
      try {
        cached = JSON.parse(state.result);
      } catch {
        throw new RpcResponseContractError();
      }
      return validateResponseForServer(type, cached);
    }
    case "acquired":
      break;
    default:
      throw new RpcResponseContractError();
  }
  const startedAt = Date.now();
  try {
    const result = await runHandlerWithResponseContract(type, run);
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > IDEM_PENDING_MS * 0.8) {
      // §6.12：IDEM_PENDING_MS 必须 > handler 实测 p99——逼近租约窗口的路由要么拆分要么单独放大
      idemMetricWarn("slowHandler", type,
        `[idem-p99] ${type} 幂等执行耗时 ${elapsedMs}ms，逼近 IDEM_PENDING_MS(${IDEM_PENDING_MS}) 的 80%`);
    }
    let completion: IdemCompleteResult;
    try {
      completion = await store.complete(JSON.stringify(result ?? null));
    } catch (error) {
      if (isWireValidationError(error)) { throw new RpcResponseContractError(); }
      throw error;
    }
    if (completion === "lost") {
      // 孤儿 lease：pending 归新持有者或归 TTL，⛔ 不归旧 handler（不 release、不覆盖、不失败）
      idemMetricWarn("orphanLease", type,
        `[idem-orphan-lease] ${type} complete CAS 失败：lease 已旁落（handler 已提交，结果未入缓存）`);
    } else if (completion === "ok-oversize") {
      idemMetricWarn("oversize", type,
        `[idem-result-oversize] ${type} 结果体超 IDEM_RESULT_MAX_BYTES，已写 done-oversize 墓碑——该路由不该走通用结果缓存`);
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
  operation: { readonly hash: string; readonly contractVersion: number },
  run: () => Promise<unknown>,
): Promise<unknown> {
  const key = kIdemUser(type, ctx.uid, clientReqId);
  const counterKey = kIdemPending(ctx.uid);
  const client = clientFor(ctx.uid);
  // §6.12：每次 acquisition 独立 leaseId（⛔ 不用 sessionId——同连接重试必须像陌生人一样 CAS）
  const leaseId = newIdemLeaseId();
  return runValidatedIdem(type, {
    acquire: () => idemAcquire(client, key, counterKey, {
      hash: operation.hash,
      leaseId,
      contractVersion: operation.contractVersion,
    }),
    complete: (resultJson) => idemComplete(client, key, counterKey, leaseId, resultJson),
    release: () => idemRelease(client, key, counterKey, leaseId),
  }, run);
}

// ── §6.13 受控 operation 查询 ────────────────────────────────────────────────

/** inspect 的可注入依赖（单测用 fake read/tables；生产走 Redis GET + generated 表）。 */
export interface InspectDeps {
  read: (key: string) => Promise<string | null>;
  tables: {
    groups: { readonly [type: string]: string | undefined };
    inspectable: readonly string[];
    versions: { readonly [type: string]: number | undefined };
  };
}

function isPlainObjectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 无锁读一条通用幂等记录（§6.13）：
 *  - 目标路由必须 `LOBBY_RPC_OPERATION_GROUPS[target] === 已授权组` 且在 LOBBY_RPC_INSPECTABLE 内；
 *  - uid/zone 从 ctx 绑定（key 经 keys.ts 构造），客户端不能传入或覆盖；
 *  - done 的 data 重过对应 response validator；腐坏记录 throw INTERNAL（⛔ 不伪装 unknown）；
 *  - done-oversize → result-expired（⛔ 不归 unknown）；版本不匹配 fail closed（pending→pending、
 *    done→result-expired）；不暴露 hash/leaseId/holder。
 *  - ⚠ 查询是无锁读：领域适配（收据优先 + 返回 unknown 前复读收据关双 miss 窗）在领域查询
 *    路由内完成，本能力只覆盖 transient gate。
 */
async function inspectOperationWith(
  deps: InspectDeps,
  uid: string,
  authorizedGroup: string,
  targetType: LobbyRpcType,
  clientReqId: string,
): Promise<InspectResult> {
  if (typeof clientReqId !== "string" || clientReqId.length < 1 || clientReqId.length > 64) {
    throw new InvalidPayloadError("clientReqId 非法");
  }
  if (deps.tables.groups[targetType] !== authorizedGroup || !deps.tables.inspectable.includes(targetType)) {
    throw new InvalidPayloadError("目标路由不在授权 operation group 内");
  }
  const raw = await deps.read(kIdemUser(targetType, uid, clientReqId));
  if (raw === null) { return { kind: "unknown" }; }
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    throw new RpcResponseContractError();
  }
  if (!isPlainObjectValue(record) || record.v !== 2) { throw new RpcResponseContractError(); }
  const expectedVersion = deps.tables.versions[targetType] ?? 1;
  if (record.state === "pending") { return { kind: "pending" }; }
  if (record.state === "done-oversize") { return { kind: "result-expired" }; }
  if (record.state === "done") {
    if (record.contractVersion !== expectedVersion) { return { kind: "result-expired" }; }
    if (typeof record.resultJson !== "string") { throw new RpcResponseContractError(); }
    let cached: unknown;
    try {
      cached = JSON.parse(record.resultJson);
    } catch {
      throw new RpcResponseContractError();
    }
    // validateResponseForServer 已按 targetType 的 shared validator 精确校验，收窄安全
    return { kind: "done", data: validateResponseForServer(targetType, cached) as RpcRes<LobbyRpcType> };
  }
  throw new RpcResponseContractError();
}

const productionInspectDeps = (uid: string): InspectDeps => ({
  read: (key) => clientFor(uid).get(key),
  tables: {
    groups: LOBBY_RPC_OPERATION_GROUPS,
    inspectable: LOBBY_RPC_INSPECTABLE,
    versions: LOBBY_RPC_CONTRACT_VERSIONS,
  },
});

/** 按 route 声明的 inspectsOperationGroup 构造 ctx.operations（uid/组已绑定）。 */
function makeOperationsCapability(uid: string, group: string): NonNullable<RpcCtx["operations"]> {
  return {
    inspect: (routeType, clientReqId) =>
      inspectOperationWith(productionInspectDeps(uid), uid, group, routeType, clientReqId),
  };
}

function rpcErrorCode(error: unknown): RpcErrCode {
  // Inbound wire validation is client input. Outbound/cache validation is a
  // server defect and is deliberately wrapped above so it cannot be confused
  // with a malformed request.
  try {
    if (isResponseContractError(error)) { return "INTERNAL"; }
    if (isWireValidationError(error)) { return "INVALID_PAYLOAD"; }
    // §4.7 RpcFault 白名单读取点其一（另一处在 LobbyRoom.rpcErrorCode）；ERR_MAP 类目保留不迁移
    const fault = toRpcFaultCode(error);
    if (fault !== null) { return fault; }
    return toErrCode(error);
  } catch {
    return "INTERNAL";
  }
}

/** Narrow unit-test seam; production callers use dispatchRpc. */
export const _dispatcherTestHooks = {
  runValidatedIdem,
  rpcErrorCode,
  runWithHandlerTimeout,
  inspectOperationWith,
  idemMetricCounters,
};

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
    const routeType = envelope.type as LobbyRpcType;

    // §6.11 固定序：validator 归一化之后、handler 可能改对象之前计算 canonical hash，
    // 注入 ctx.operation（领域收据复用同一 hash）。同步耗时在 handler 预算外——独立探针
    //（依赖 transport maxPayload + validator 上限钳住输入，超 IDEM_HASH_BUDGET_MS 打 warn）。
    ctx.operation = undefined;
    if (def.idem) {
      const hashStartedAt = performance.now();
      const hash = idemPayloadHash(routeType, payload);
      const hashMs = performance.now() - hashStartedAt;
      if (hashMs > IDEM_HASH_BUDGET_MS) {
        idemMetricWarn("slowHash", routeType,
          `[idem-hash-budget] ${routeType} canonical hash 同步耗时 ~${hashMs.toFixed(1)}ms（预算 ${IDEM_HASH_BUDGET_MS}ms）`);
      }
      ctx.operation = { hash, contractVersion: LOBBY_RPC_CONTRACT_VERSIONS[routeType] };
    }
    // §6.13：只有声明了 inspectsOperationGroup 的 query 路由拿到 operations 能力
    //（codegen 保证 LOBBY_RPC_INSPECTS 只含 query 路由）；其余路由显式清空防 ctx 复用泄漏。
    const inspectsGroup = LOBBY_RPC_INSPECTS[routeType];
    ctx.operations = inspectsGroup === undefined ? undefined : makeOperationsCapability(ctx.uid, inspectsGroup);

    const invoke = (): Promise<unknown> => {
      const operation = ctx.operation;
      if (!def.idem || operation === undefined) {
        return runHandlerWithResponseContract(
          routeType,
          () => def.handler(ctx, payload),
        );
      }
      const clientReqId = (payload as { clientReqId?: unknown }).clientReqId;
      if (typeof clientReqId !== "string" || clientReqId.length === 0) {
        throw new InvalidPayloadError("缺 clientReqId");
      }
      return runIdem(ctx, routeType, clientReqId, operation, () => def.handler(ctx, payload));
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
