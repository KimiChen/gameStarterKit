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
import type { IRpcEnvelope, IRpcReply } from "@game/shared";

// 信封真源在 shared/protocol/lobbyRpc/envelope.ts（双端同一定义，改形状去那边）
export type RpcEnvelope = IRpcEnvelope;
export type RpcReply = IRpcReply;

export const rpcEnvelopeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  payload: z.unknown().optional(),
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

/** 幂等包装：pending 命中 → IN_PROGRESS；done 命中 → 回缓存；干净失败 → 立即释放。 */
async function runIdem(ctx: RpcCtx, type: string, clientReqId: string, run: () => Promise<unknown>): Promise<unknown> {
  const key = kIdemUser(type, ctx.uid, clientReqId);
  const client = clientFor(ctx.uid);
  const state = await idemAcquire(client, key, ctx.sessionId);
  if (state.kind === "pending") { throw new InProgressError(); }
  if (state.kind === "done") { return JSON.parse(state.result); }
  try {
    const result = await run();
    await idemComplete(client, key, JSON.stringify(result ?? null));
    return result;
  } catch (e) {
    await idemRelease(client, key, ctx.sessionId).catch(() => {});
    throw e;
  }
}

/** 单条 RPC 处理。永不 throw——一切异常规约成 {ok:false, err}（09·G3 按 code 分支）。 */
export async function dispatchRpc(ctx: RpcCtx, msg: RpcEnvelope): Promise<RpcReply> {
  try {
    const def = routeTable.get(msg.type);
    if (!def) {
      unknownTypeCount++;
      throw new UnknownTypeError();
    }
    await rateCheck(ctx.uid || ctx.sessionId); // 匿名回退 sessionId（09·G5）

    let payload: unknown;
    try {
      payload = def.schema.parse(msg.payload ?? {});
    } catch (e) {
      throw e instanceof ZodError ? new InvalidPayloadError(e.message) : e;
    }

    const invoke = (): Promise<unknown> => {
      if (!def.idem) { return def.handler(ctx, payload); }
      const clientReqId = (payload as { clientReqId?: unknown }).clientReqId;
      if (typeof clientReqId !== "string" || clientReqId.length === 0) {
        throw new InvalidPayloadError("缺 clientReqId");
      }
      return runIdem(ctx, msg.type, clientReqId, () => def.handler(ctx, payload));
    };

    // 超时兜底（09·G9）：race 不取消 handler，数据层幂等保证迟到首跑无害
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`handler 超时: ${msg.type}`)), HANDLER_TIMEOUT_MS).unref());
    const data = await Promise.race([invoke(), timeout]);
    return { id: msg.id, ok: true, data };
  } catch (e) {
    const code = toErrCode(e);
    if (code === "INTERNAL") { console.error(`[rpc] INTERNAL type=${msg.type}`, e); }
    // INTERNAL = 未映射异常，message 可能携带栈/SQL/内部路径——生产环境不下发原文
    //（完整异常已进上面的服务端日志）；业务错误码的 message 是刻意给客户端的，照传
    const rawMsg = (e as Error)?.message ?? "";
    const msgOut = code === "INTERNAL" && process.env.NODE_ENV === "production" ? "internal error" : rawMsg;
    return { id: msg.id, ok: false, err: { code, msg: msgOut } };
  }
}
