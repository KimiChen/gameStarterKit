/**
 * mmodemo · 遭遇 ②「区域伏击」（docs/MMO.md §9.2）：角色进入 `ambush` 区域且冷却已过 ⇒ 围着来者刷 3 只 tag=ambush 的灰狼（120 s 后收回）+ notice，
 * `ambushAt` 记本次 tick 作冷却（60 s = 1200 步 @ 50 ms）。怪物 / 掉落进区域不触发；落点不可走的那只跳过（⛔ 让 kit 语义拒绝）。
 */
import type { OrchestrationCommand, OrchestrationEvent, OrchestrationReadApi } from "@game/shared/kits/mmo/api/orchestration/index";

export const AMBUSH_REGION_ID = "ambush";
export const AMBUSH_TAG = "ambush";
export const AMBUSH_WOLF_TEMPLATE_ID = "wolf";
export const AMBUSH_WOLVES = 3;
/** 冷却 60 s（固定步 50 ms ⇒ 1200 步） */
export const AMBUSH_COOLDOWN_TICKS = 1200;
export const AMBUSH_DESPAWN_MS = 120_000;
export const AMBUSH_AT_VAR = "ambushAt";
const AMBUSH_RADIUS = 140;

/** 事件联合里 regionEntered / regionLeft 共用一个成员形状；分派处已按 kind 收窄。 */
export type RegionEnteredEvent = Extract<OrchestrationEvent, { readonly kind: "regionEntered" | "regionLeft" }>;

export function onRegionEntered(event: RegionEnteredEvent, api: OrchestrationReadApi): OrchestrationCommand[] {
    if (event.regionId !== AMBUSH_REGION_ID || event.entityKind !== "character") return [];
    const last = api.vars.get(AMBUSH_AT_VAR);
    if (typeof last === "number" && api.tick - last < AMBUSH_COOLDOWN_TICKS) return [];
    const actor = api.world.entity(event.entityId);
    if (!actor) return [];
    const commands: OrchestrationCommand[] = [];
    for (let index = 0; index < AMBUSH_WOLVES; index += 1) {
        const angle = (index / AMBUSH_WOLVES) * Math.PI * 2 + api.rng("ambush") * 0.5;
        const pos = { x: Math.round(actor.x + Math.cos(angle) * AMBUSH_RADIUS), y: Math.round(actor.y + Math.sin(angle) * AMBUSH_RADIUS) };
        if (!api.world.isWalkable(pos)) continue;
        commands.push({ op: "spawn", templateId: AMBUSH_WOLF_TEMPLATE_ID, pos, tag: AMBUSH_TAG, despawnAfterMs: AMBUSH_DESPAWN_MS });
    }
    if (commands.length === 0) return [];
    commands.push({ op: "setVar", key: AMBUSH_AT_VAR, value: api.tick }, { op: "notice", text: "伏击！狼群从林间扑出。", level: "warn" });
    return commands;
}
