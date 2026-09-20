/**
 * mmo kit · `combat` api 面（客户端，docs/MMO.md §7.2；MK2-B1）：目标选择（最近的存活怪）、施法意图、冷却模型（private 流的 `cooldowns` 剩余 ms → 本地倒计时，
 * 同一 `checkCast` 做施法前的本地提示）。⛔ 不 import cc（铁律 9）。本面任何导出变化都要 bump `api.combat.version`。
 */
import { castReqIdOf, checkCast, needsHostileTarget, ticksOf, type CastRejection } from "../../../../shared/kits/mmo/api/combat/index";
import type { IMmoEntityWire } from "../../../../shared/gameplays/mmoWorld/wire";
import { withinRadius } from "../../../../shared/kits/mmo/api/world/index";

export { castReqIdOf, checkCast, needsHostileTarget, ticksOf };
export type { CastRejection };

/** 冷却模型：按 private 流的剩余 ms 记就绪时刻，本地倒计时（服务端只在集合变化时发）。 */
export class CooldownModel {
    private readonly readyAt = new Map<string, number>();

    /** private 流一次快照：只保留服务端仍在冷却的技能（集合语义）。 */
    accept(cooldowns: Readonly<Record<string, number>> | undefined, nowMs: number): void {
        this.readyAt.clear();
        for (const [spellId, remaining] of Object.entries(cooldowns ?? {})) this.readyAt.set(spellId, nowMs + remaining);
    }

    remainingMs(spellId: string, nowMs: number): number {
        const ready = this.readyAt.get(spellId);
        return ready === undefined ? 0 : Math.max(0, ready - nowMs);
    }

    isReady(spellId: string, nowMs: number): boolean {
        return this.remainingMs(spellId, nowMs) === 0;
    }

    /** 当前仍在冷却的技能 → 剩余 ms（视图用）。 */
    snapshot(nowMs: number): Readonly<Record<string, number>> {
        const out: Record<string, number> = {};
        for (const [spellId, ready] of this.readyAt) {
            const remaining = ready - nowMs;
            if (remaining > 0) out[spellId] = Math.ceil(remaining);
        }
        return out;
    }
}

/** 敌对目标自动选择：视野内最近的存活怪（⛔ 本人 / 角色）；radius 内没有 ⇒ null。 */
export function pickHostileTarget(entities: Iterable<IMmoEntityWire>, self: { readonly x: number; readonly y: number }, radius: number): IMmoEntityWire | null {
    let best: IMmoEntityWire | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const entity of entities) {
        if (entity.kind !== "creature" || entity.hp <= 0) continue;
        if (!withinRadius(self, entity, radius)) continue;
        const distanceSq = (entity.x - self.x) ** 2 + (entity.y - self.y) ** 2;
        if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq && best !== null && entity.id < best.id)) {
            best = entity;
            bestDistanceSq = distanceSq;
        }
    }
    return best;
}
