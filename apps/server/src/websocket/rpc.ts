/**
 * ws-RPC 类型胶水（项目级，⛔ 不属于 Arthur 回流件）：把 shared 的 lobbyRpc 契约
 * 钉到 dispatcher registerRoute 的 def 形状上。dispatcher.ts / core/errors.ts 保持零改动。
 *
 * 所有端点的 request schema 必须使用下方 sharedRpcSchema 适配器；它直接调用
 * shared 的 exact/range validator，避免本地 Zod object 漏字段或静默剥离未知键。
 * response 也在 defineRpc 包装层校验，保证直接调用 handler 与 dispatcher 路径具有相同边界。
 */
import { performance } from "node:perf_hooks";
import { z, type ZodType } from "zod";
import {
  validateLobbyRpcRequest,
  validateLobbyRpcResponse,
  type LobbyRpcIdemType,
  type LobbyRpcType,
  type RpcReq,
  type RpcRes,
} from "@game/shared";
import { RPC_BUDGET_PROD_SAMPLE, RPC_BUDGET_WARN_INTERVAL_MS, RPC_SYNC_BUDGET_MS } from "../core/infra/config";
import type { RpcCtx } from "./dispatcher";

/** 单个端点定义。构造一律用 defineRpc（⛔ 不手写对象字面量），由同目录 loader.ts 收集注册。 */
export interface LobbyRpcDef<T extends LobbyRpcType> {
  type: T;
  schema: ZodType<RpcReq<T>>;
  /** 幂等占位（09·I1）；开了则 req 必须含 clientReqId——defineRpc 重载在编译期强制 */
  idem?: boolean;
  handler: (ctx: RpcCtx, payload: RpcReq<T>) => Promise<RpcRes<T>>;
}

/**
 * Adapt the shared zero-dependency request validator to the dispatcher's Zod
 * port.  Keeping this adapter in one place prevents each endpoint from
 * maintaining a second (and potentially looser) object schema.
 */
export function sharedRpcSchema<T extends LobbyRpcType>(type: T): ZodType<RpcReq<T>> {
  return z.unknown().transform((input, ctx) => {
    try {
      return validateLobbyRpcRequest(type, input);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "invalid payload",
      });
      return z.NEVER;
    }
  });
}

/** 全端点联合（loader 的收集元素类型） */
export type AnyLobbyRpcDef = { [K in LobbyRpcType]: LobbyRpcDef<K> }[LobbyRpcType];

// idem: true 重载：类型域收窄到 LobbyRpcIdemType（req 含 clientReqId 的路由），09·I2 编译期化
export function defineRpc<T extends LobbyRpcIdemType>(type: T, def: {
  schema: ZodType<RpcReq<T>>;
  idem: true;
  handler: (ctx: RpcCtx, payload: RpcReq<T>) => Promise<RpcRes<T>>;
}): LobbyRpcDef<T>;
// 无 idem 重载：只读/天然幂等路由。类型域排除 LobbyRpcIdemType——req 含 clientReqId 的
// 路由必须显式 idem: true（防「复制只读模板忘开幂等」：漏开则占位/结果缓存整条链失效）
export function defineRpc<T extends Exclude<LobbyRpcType, LobbyRpcIdemType>>(type: T, def: {
  schema: ZodType<RpcReq<T>>;
  handler: (ctx: RpcCtx, payload: RpcReq<T>) => Promise<RpcRes<T>>;
}): LobbyRpcDef<T>;
export function defineRpc<T extends LobbyRpcType>(type: T, def: Omit<LobbyRpcDef<T>, "type">): LobbyRpcDef<T> {
  const budgeted = withSyncBudget(type, def.handler);
  return {
    type,
    ...def,
    // Validate responses before dispatcher serialization and idem caching.
    handler: async (ctx, payload): Promise<RpcRes<T>> =>
      validateLobbyRpcResponse(type, await budgeted(ctx, payload)),
  };
}

// ── rpc-budget：handler 同步预算守门（铁律 11 的机检面，docs/SERVER.md 2026-07）──────
// 测量：4ms 定时器心跳链——handler 生命周期内定时器迟到多少，就是事件循环被同步代码
// 卡了多久（finally 里再补测「纯同步 handler 没等到首个心跳」的尾巴）。
// ⚠ 不用 ELU：实测 eventLoopUtilization 差值在「同步块 + 同 tick 测量」下读数为 0。
// 并发下会把别的请求造成的阻塞算进来（归因噪声）——开发自测（低并发）准确，
// 生产按采样率探针 + loopMonitor 全局兜底。目的：写出重计算的人**第一次运行**就被指路。
const lastWarnAt = new Map<string, number>();
const PROBE_INTERVAL_MS = 4;
const IS_PROD = process.env.NODE_ENV === "production";

function withSyncBudget<T extends LobbyRpcType>(
  type: T, inner: LobbyRpcDef<T>["handler"],
): LobbyRpcDef<T>["handler"] {
  return async (ctx, payload) => {
    // 生产环境按采样率探针（每请求一条 4ms 定时器链，全量开销不值得）；开发全量
    if (IS_PROD && Math.random() >= RPC_BUDGET_PROD_SAMPLE) {
      return inner(ctx, payload);
    }
    let maxGapMs = 0;
    let last = performance.now();
    let stopped = false;
    const tick = () => {
      if (stopped) { return; }
      const now = performance.now();
      const gap = now - last - PROBE_INTERVAL_MS;
      if (gap > maxGapMs) { maxGapMs = gap; }
      last = now;
      setTimeout(tick, PROBE_INTERVAL_MS).unref();
    };
    setTimeout(tick, PROBE_INTERVAL_MS).unref();
    try {
      return await inner(ctx, payload);
    } finally {
      stopped = true;
      // 纯同步 handler（首个心跳还没来得及触发）的尾巴：finally 与阻塞同一轮 loop
      const finalGap = performance.now() - last - PROBE_INTERVAL_MS;
      if (finalGap > maxGapMs) { maxGapMs = finalGap; }
      if (maxGapMs > RPC_SYNC_BUDGET_MS) {
        const now = Date.now();
        const throttled = IS_PROD && now - (lastWarnAt.get(type) ?? 0) < RPC_BUDGET_WARN_INTERVAL_MS;
        if (!throttled) {
          lastWarnAt.set(type, now);
          console.warn(`[rpc-budget] ${type} 期间事件循环最长阻塞 ~${maxGapMs.toFixed(1)}ms（预算 ${RPC_SYNC_BUDGET_MS}ms）`
            + "——重计算应卸载到 core/compute/tasks/（判据与四类清单见 docs/SERVER.md §11）");
        }
      }
    }
  };
}
