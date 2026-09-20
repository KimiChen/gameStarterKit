/**
 * mmo kit · `combat` api 面（shared，docs/MMO.md §7.2；MK2-B1）：施法准入 / 冷却 / 耗蓝 / 伤害・治疗公式 / aura 折算的**双端同源纯函数**。
 * 服务端施法管线（准备 → 施放 → 完成）逐步调用这些函数；客户端用同一份做冷却模型与预测提示。随机只经调用方传入的 roll（服务端 = 分线随机流），
 * 伤害公式族建在框架 `shared/logic/battle.ts` 的 `calcDamageWithDefense` 上。插件只能 import 本门面；本面任何导出变化都要 bump `api.combat.version`。
 */
import { calcDamageWithDefense } from "../../../../logic/battle";
import type { ISpellTemplate } from "../content/index";

export interface ICombatStats {
    readonly level: number;
    readonly attack: number;
    readonly defense: number;
}

/** 增益 / 减益（战斗热状态：⛔ 进检查点，恢复后清零，§7.3）。 */
export interface IAura {
    readonly spellId: string;
    readonly kind: "buff" | "debuff";
    readonly power: number;
    readonly expiresTick: number;
}

/** 伤害 / 治疗浮动幅度（±10%）。 */
export const MMO_COMBAT_FLUCTUATION = 0.1;
/** 最小伤害 / 治疗。 */
export const MMO_COMBAT_MIN_EFFECT = 1;
/** 治疗按攻击加成系数。 */
export const MMO_HEAL_ATTACK_RATIO = 0.2;
/** 角色死亡后自动复活等待（ms；MK2-B1 灰盒参数）。 */
export const MMO_PLAYER_RESPAWN_MS = 5_000;

/** 毫秒 → 固定步数（向上取整；0 ⇒ 0）。 */
export function ticksOf(ms: number, fixedStepMs: number): number {
    if (!(ms > 0) || !(fixedStepMs > 0)) return 0;
    return Math.ceil(ms / fixedStepMs);
}

/** aura 折算：buff 加攻击、debuff 减防御（≥ 0）；已过期（expiresTick ≤ tick）忽略。 */
export function effectiveStats(base: ICombatStats, auras: Iterable<IAura>, tick: number): ICombatStats {
    let attack = base.attack;
    let defense = base.defense;
    for (const aura of auras) {
        if (aura.expiresTick <= tick) continue;
        if (aura.kind === "buff") attack += aura.power;
        else defense -= aura.power;
    }
    return { level: base.level, attack: Math.max(0, attack), defense: Math.max(0, defense) };
}

/** 浮动因子：roll ∈ [0, 1) ⇒ [1 − F, 1 + F)。 */
function fluctuation(roll: number): number {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(roll) ? roll : 0));
    return 1 - MMO_COMBAT_FLUCTUATION + clamped * 2 * MMO_COMBAT_FLUCTUATION;
}

/** 直伤：框架公式族 calcDamageWithDefense(power, attack, defense, level) × 浮动，最小 1。 */
export function damageOf(spell: Pick<ISpellTemplate, "power">, attacker: ICombatStats, defender: ICombatStats, roll: number): number {
    return Math.max(MMO_COMBAT_MIN_EFFECT, Math.round(calcDamageWithDefense(spell.power, attacker.attack, defender.defense, attacker.level) * fluctuation(roll)));
}

/** 治疗：power + 攻击 × 0.2，× 浮动，最小 1。 */
export function healOf(spell: Pick<ISpellTemplate, "power">, caster: ICombatStats, roll: number): number {
    return Math.max(MMO_COMBAT_MIN_EFFECT, Math.round((spell.power + caster.attack * MMO_HEAL_ATTACK_RATIO) * fluctuation(roll)));
}

/** 增益 / 减益模板 → aura（其他类型 ⇒ null）。 */
export function auraOf(spell: ISpellTemplate, tick: number, fixedStepMs: number): IAura | null {
    if (spell.kind !== "buff" && spell.kind !== "debuff") return null;
    return { spellId: spell.spellId, kind: spell.kind, power: spell.power, expiresTick: tick + ticksOf(spell.durationMs ?? 0, fixedStepMs) };
}

/** 冷却就绪 tick。 */
export function cooldownReadyTick(spell: Pick<ISpellTemplate, "cooldownMs">, tick: number, fixedStepMs: number): number {
    return tick + ticksOf(spell.cooldownMs, fixedStepMs);
}

/** 施法准入拒绝原因（顺序 = 检查顺序）。 */
export type CastRejection = "unknown-spell" | "not-learned" | "dead" | "casting" | "cooldown" | "mp" | "no-target" | "self-target" | "target-dead" | "range";

export interface CastCheckInput {
    readonly spell: ISpellTemplate | undefined;
    readonly learned: boolean;
    readonly casterAlive: boolean;
    readonly casting: boolean;
    /** 该技能的冷却就绪 tick（无 = 未冷却） */
    readonly readyTick: number | undefined;
    readonly tick: number;
    readonly mp: number;
    /** 解析后的目标（null = 没有目标） */
    readonly target: { readonly alive: boolean; readonly distance: number; readonly isSelf: boolean } | null;
}

/** 目标需求：直伤 / 减益要一个非本人的活目标；治疗 / 增益缺目标时落到本人。 */
export function needsHostileTarget(spell: Pick<ISpellTemplate, "kind">): boolean {
    return spell.kind === "damage" || spell.kind === "debuff";
}

/** 施法准入（纯函数）：null = 可施。 */
export function checkCast(input: CastCheckInput): CastRejection | null {
    if (!input.spell) return "unknown-spell";
    if (!input.learned) return "not-learned";
    if (!input.casterAlive) return "dead";
    if (input.casting) return "casting";
    if (input.readyTick !== undefined && input.readyTick > input.tick) return "cooldown";
    if (input.mp < input.spell.mpCost) return "mp";
    if (needsHostileTarget(input.spell)) {
        if (!input.target) return "no-target";
        if (input.target.isSelf) return "self-target";
        if (!input.target.alive) return "target-dead";
        if (input.target.distance > input.spell.range) return "range";
    } else if (input.target && !input.target.isSelf) {
        if (!input.target.alive) return "target-dead";
        if (input.target.distance > input.spell.range) return "range";
    }
    return null;
}

/** 仇恨：直伤 = 伤害值（治疗 / 增益 v1 不计）。 */
export function threatOf(damage: number): number {
    return Math.max(0, damage);
}

/** 施法回执的 clientReqId（opResult 关联；wire id 形态允许 `:`）。 */
export function castReqIdOf(seq: number): string {
    return `cast:${seq}`;
}
