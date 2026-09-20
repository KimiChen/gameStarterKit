/**
 * mmo kit · `ai` api 面（shared，docs/MMO.md §7.2；MK2-B2）：行为词汇（内容包 `behavior`：idle / patrol / aggro）、脑状态机的**纯决策函数**
 * `decide`（感知 → 状态 + 动作；⛔ IO / 随机）、分桶节拍纯函数、nav 网格 A*（./nav）。服务端分桶调度器 / 行为解释器在 kit 内部 `ai/` 目录用它们。
 * 插件只能 import 本门面；本面任何导出变化都要 bump `api.ai.version`。
 */
import type { MmoBehavior } from "../content/index";
export type { MmoBehavior };
export { NAV_DEFAULT_MAX_EXPANSIONS, findPath, lineClear, type FindPathOptions, type INavGrid, type INavPoint } from "./nav";

/** 脑状态（死亡不在此：死亡实体没有脑；复活回 idle）。 */
export type AiState = "idle" | "patrol" | "chase" | "attack" | "return";

/** 感知（服务端每次思考前算好，纯数据）。 */
export interface AiPerception {
    readonly behavior: MmoBehavior;
    readonly state: AiState;
    /** 距出生位 */
    readonly distanceToOrigin: number;
    readonly aggroRadius: number;
    /** 0 = 不离开出生位（只在射程内还手） */
    readonly leashRadius: number;
    /** 当前目标（仇恨最高 / 已锁定）；null = 无 */
    readonly target: { readonly distance: number; readonly alive: boolean } | null;
    /** 仇恨表外、aggroRadius 内最近的可攻击角色（无目标时才用） */
    readonly candidate: { readonly distance: number } | null;
    /** 可用（已冷却）技能的射程；null = 没有可用技能 */
    readonly spellRange: number | null;
    /** 巡逻点数（patrol 用） */
    readonly waypointCount: number;
    /** 已到当前巡逻点 / 出生位 */
    readonly arrived: boolean;
}

export type AiAction =
    | { readonly kind: "stay" }
    | { readonly kind: "acquire" }
    | { readonly kind: "chase" }
    | { readonly kind: "cast" }
    | { readonly kind: "evade" }
    | { readonly kind: "returnHome" }
    | { readonly kind: "nextWaypoint" }
    | { readonly kind: "goHome" };

export interface AiDecision {
    readonly state: AiState;
    readonly action: AiAction;
}

/** 到达阈值（世界单位；与 movement 面 MMO_ARRIVE_EPSILON 不同：脑级「算到了」的容差）。 */
export const AI_ARRIVE_RADIUS = 8;

/**
 * 决策（纯函数）：
 *  1. 有活目标：出了拴绳 ⇒ return + evade（清仇恨、回出生位、回满血）；leash 0 且目标不在射程 ⇒ stay（只还手）；在射程且有可用技能 ⇒ attack + cast；否则 chase；
 *  2. 无目标：aggroRadius 内有候选 ⇒ acquire（转 chase）；不在出生位 ⇒ return + goHome；patrol 有巡逻点 ⇒ patrol（到点换下一个）；否则 idle。
 */
export function decide(p: AiPerception): AiDecision {
    if (p.target && p.target.alive) {
        if (p.leashRadius > 0 && p.distanceToOrigin > p.leashRadius) return { state: "return", action: { kind: "evade" } };
        if (p.spellRange !== null && p.target.distance <= p.spellRange) return { state: "attack", action: { kind: "cast" } };
        if (p.leashRadius <= 0) return { state: "attack", action: { kind: "stay" } };
        return { state: "chase", action: { kind: "chase" } };
    }
    if (p.candidate && p.aggroRadius > 0 && p.candidate.distance <= p.aggroRadius) return { state: "chase", action: { kind: "acquire" } };
    if (p.state === "return" && !p.arrived) return { state: "return", action: { kind: "goHome" } };
    if (p.state === "return" && p.arrived) return { state: "idle", action: { kind: "evade" } };
    if (p.behavior === "patrol" && p.waypointCount > 0) return { state: "patrol", action: p.arrived ? { kind: "nextWaypoint" } : { kind: "stay" } };
    if (p.distanceToOrigin > AI_ARRIVE_RADIUS) return { state: "return", action: { kind: "goHome" } };
    return { state: "idle", action: { kind: "stay" } };
}

/** 分桶：实体 id 哈希落桶（0..buckets-1）；`shouldThink` = 本 tick 轮到该桶。 */
export function bucketOf(id: string, buckets: number): number {
    let hash = 0;
    for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    return hash % Math.max(1, buckets);
}

export function shouldThink(id: string, tick: number, buckets: number): boolean {
    return buckets <= 1 || tick % buckets === bucketOf(id, buckets);
}
