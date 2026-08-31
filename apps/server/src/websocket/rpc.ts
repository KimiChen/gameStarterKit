/**
 * ws-RPC 类型胶水（项目级，⛔ 不属于 Arthur 回流件）：把 shared 的 lobbyRpc 契约
 * 钉到 dispatcher registerRoute 的 def 形状上。dispatcher.ts / core/errors.ts 保持零改动。
 *
 * 阶段 3（Non-intrusive §6.10）：defineRpc 由 registry metadata 驱动——endpoint 只写
 * handler；request schema（sharedRpcSchema 适配 shared exact/range validator）与幂等行为
 * （LOBBY_RPC_ROUTE_MODES 的 idempotent-write）都从 shared registry 派生，⛔ endpoint
 * 不再（也无法）自填 schema / idem / 响应 validator。
 * response 在 defineRpc 包装层校验，保证直接调用 handler 与 dispatcher 路径具有相同边界。
 */
import { performance } from "node:perf_hooks";
import { z, type ZodType } from "zod";
import {
  LOBBY_RPC_ROUTE_MODES,
  validateLobbyRpcRequest,
  validateLobbyRpcResponse,
  type LobbyRpcRouteMode,
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
  /** registry 派生的执行模式（query / natural-write / idempotent-write），只读 metadata。 */
  mode: LobbyRpcRouteMode;
  /** 幂等占位（09·I1）；= mode === "idempotent-write" 的派生位，dispatcher 沿用它触发 runIdem */
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

// 单签名（阶段 3）：schema 与幂等行为都从 shared registry 派生。旧「idem: true 双重载」的
// 编译期职责由 registry 的显式 mode metadata 承接（LobbyRpcIdemType 现由 mode 生成，
// 「复制只读模板忘开幂等」的缺口不再存在——endpoint 根本没有该参数）。
export function defineRpc<T extends LobbyRpcType>(type: T, def: {
  handler: (ctx: RpcCtx, payload: RpcReq<T>) => Promise<RpcRes<T>>;
}): LobbyRpcDef<T> {
  const mode = LOBBY_RPC_ROUTE_MODES[type];
  const budgeted = withSyncBudget(type, def.handler);
  return {
    type,
    schema: sharedRpcSchema(type),
    mode,
    ...(mode === "idempotent-write" ? { idem: true } : {}),
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
