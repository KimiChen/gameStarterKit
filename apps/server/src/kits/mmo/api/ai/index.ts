/**
 * mmo kit · `ai` api 面（服务端，docs/MMO.md §7.2；MK2-B2）：找路端口 `PathfinderPort`（请求带 instanceEpoch + entityVersion，回执迟到即丢由调用方按版本判；
 * 回执可**同步**（进程内：同一 tick 内生效，无头重放确定性）或 Promise（compute 池：下一步消费））与缺省的进程内实现；可注入 compute 池实现
 * （`core/compute/tasks/kits/mmo/pathfind.ts` 是它的纯任务形态，组合根经 `runInPool` 接线，⛔ kit 目录 import compute）。分桶调度器 / 行为解释器在
 * kit 内部 `ai/` 目录。本面任何导出变化都要 bump `api.ai.version`。
 */
import { findPath, type FindPathOptions, type INavGrid, type INavPoint } from "@game/shared/kits/mmo/api/ai/index";

export interface PathRequest {
    readonly instanceEpoch: number;
    readonly entityId: string;
    /** 目标变了就 +1；回执版本不等 ⇒ 迟到即丢 */
    readonly entityVersion: number;
    readonly from: INavPoint;
    readonly to: INavPoint;
}

export interface PathResult {
    readonly instanceEpoch: number;
    readonly entityId: string;
    readonly entityVersion: number;
    /** null = 不可达 / 超展开上限 */
    readonly path: readonly INavPoint[] | null;
}

export interface PathfinderPort {
    /** 同步返回 ⇒ 调用方当场消费；Promise ⇒ 进收件箱、下一步按版本消费（迟到即丢）。 */
    request(input: PathRequest): PathResult | Promise<PathResult>;
}

/** 进程内找路（缺省）：同步 A*、同步返回（同一 tick 内生效 ⇒ 同种子同命令序仍同轨迹）。 */
export function createInProcessPathfinder(grid: INavGrid, options: FindPathOptions = {}): PathfinderPort {
    return {
        request: (input) => ({ instanceEpoch: input.instanceEpoch, entityId: input.entityId, entityVersion: input.entityVersion, path: findPath(grid, input.from, input.to, options) }),
    };
}

/** 回执是否异步（thenable）。 */
export function isDeferredPathResult(outcome: PathResult | Promise<PathResult>): outcome is Promise<PathResult> {
    return typeof (outcome as { then?: unknown }).then === "function";
}

/** 迟到判定（纯函数）：分线权威换代或实体版本变了 ⇒ 丢。 */
export function isStalePathResult(result: Pick<PathResult, "instanceEpoch" | "entityVersion">, current: { readonly instanceEpoch: number; readonly entityVersion: number }): boolean {
    return result.instanceEpoch !== current.instanceEpoch || result.entityVersion !== current.entityVersion;
}
