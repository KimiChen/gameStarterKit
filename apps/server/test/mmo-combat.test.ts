/**
 * mmo kit combat 面（MK2-B1，纯函数，⛔ 起房）：ticksOf / effectiveStats（buff 加攻、debuff 减防、过期忽略）/ damageOf（框架 calcDamageWithDefense × 浮动，最小 1，
 * 同 roll 同结果）/ healOf / auraOf / cooldownReadyTick / checkCast 十种拒绝顺序 / threatOf / castReqIdOf。
 * 变异验证：checkCast 不查冷却 → 「cooldown」红；effectiveStats 不忽略过期 aura → 「过期忽略」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { calcDamageWithDefense } from "@game/shared/logic/battle";
import { auraOf, castReqIdOf, checkCast, cooldownReadyTick, damageOf, effectiveStats, healOf, threatOf, ticksOf, type CastCheckInput } from "@game/shared/kits/mmo/api/combat/index";
import type { ISpellTemplate } from "@game/shared/kits/mmo/api/content/index";

const strike: ISpellTemplate = { spellId: "strike", name: "挥击", kind: "damage", castMs: 0, cooldownMs: 1500, mpCost: 0, range: 60, power: 8 };
const mend: ISpellTemplate = { spellId: "mend", name: "缝合", kind: "heal", castMs: 1500, cooldownMs: 6000, mpCost: 15, range: 200, power: 25 };
const guard: ISpellTemplate = { spellId: "guard", name: "戒备", kind: "buff", castMs: 0, cooldownMs: 10_000, mpCost: 5, range: 0, power: 5, durationMs: 8_000 };
const fighter = { level: 1, attack: 10, defense: 2 };
const slime = { level: 1, attack: 4, defense: 0 };

test("公式：calcDamageWithDefense = max(1, power + 0.5·atk − 0.3·def) × 等级成长；damageOf 浮动 ±10% 同 roll 同结果、最小 1；healOf；ticksOf 向上取整", () => {
    assert.equal(calcDamageWithDefense(8, 10, 0, 1), 13);
    assert.equal(calcDamageWithDefense(8, 10, 0, 3), 13 * 1.1);
    assert.equal(calcDamageWithDefense(1, 0, 100, 1), 1, "防御压到最小 1");
    assert.deepEqual([damageOf(strike, fighter, slime, 0), damageOf(strike, fighter, slime, 0.5), damageOf(strike, fighter, slime, 0.999)], [12, 13, 14], "0.9× / 1.0× / ≈1.1×");
    assert.equal(damageOf(strike, fighter, slime, 0.5), damageOf(strike, fighter, slime, 0.5), "同 roll 同结果");
    assert.equal(damageOf({ power: 0 }, { level: 1, attack: 0, defense: 0 }, { level: 1, attack: 0, defense: 999 }, 0), 1, "最小 1");
    assert.equal(healOf(mend, { level: 1, attack: 6, defense: 1 }, 0.5), 26, "25 + 6 × 0.2 = 26.2 → 26");
    assert.deepEqual([ticksOf(1000, 50), ticksOf(1, 50), ticksOf(0, 50), ticksOf(-5, 50)], [20, 1, 0, 0]);
});

test("aura：effectiveStats buff 加攻 / debuff 减防（≥ 0）、过期忽略；auraOf 只对 buff / debuff；cooldownReadyTick", () => {
    const auras = [
        { spellId: "guard", kind: "buff" as const, power: 5, expiresTick: 100 },
        { spellId: "weaken", kind: "debuff" as const, power: 3, expiresTick: 100 },
        { spellId: "old", kind: "buff" as const, power: 50, expiresTick: 10 },
    ];
    assert.deepEqual(effectiveStats(fighter, auras, 20), { level: 1, attack: 15, defense: 0 }, "过期忽略；防御压到 0");
    assert.deepEqual(effectiveStats(fighter, auras, 100), { level: 1, attack: 10, defense: 2 }, "expiresTick ≤ tick 全过期");
    assert.deepEqual(auraOf(guard, 40, 50), { spellId: "guard", kind: "buff", power: 5, expiresTick: 200 });
    assert.equal(auraOf(strike, 40, 50), null);
    assert.equal(cooldownReadyTick(strike, 7, 50), 37);
});

test("checkCast：拒绝顺序 unknown-spell → not-learned → dead → casting → cooldown → mp → no-target → self-target → target-dead → range；治疗缺目标落到本人", () => {
    const ok: CastCheckInput = { spell: strike, learned: true, casterAlive: true, casting: false, readyTick: undefined, tick: 10, mp: 20, target: { alive: true, distance: 30, isSelf: false } };
    assert.equal(checkCast(ok), null);
    assert.equal(checkCast({ ...ok, spell: undefined }), "unknown-spell");
    assert.equal(checkCast({ ...ok, learned: false }), "not-learned");
    assert.equal(checkCast({ ...ok, casterAlive: false }), "dead");
    assert.equal(checkCast({ ...ok, casting: true }), "casting");
    assert.equal(checkCast({ ...ok, readyTick: 11 }), "cooldown");
    assert.equal(checkCast({ ...ok, readyTick: 10 }), null, "就绪 tick = 当前 tick 可施");
    assert.equal(checkCast({ ...ok, spell: mend, mp: 3 }), "mp");
    assert.equal(checkCast({ ...ok, target: null }), "no-target");
    assert.equal(checkCast({ ...ok, target: { alive: true, distance: 0, isSelf: true } }), "self-target");
    assert.equal(checkCast({ ...ok, target: { alive: false, distance: 0, isSelf: false } }), "target-dead");
    assert.equal(checkCast({ ...ok, target: { alive: true, distance: 61, isSelf: false } }), "range");
    assert.equal(checkCast({ ...ok, spell: mend, target: null }), null, "治疗缺目标 ⇒ 本人");
    assert.equal(checkCast({ ...ok, spell: mend, target: { alive: true, distance: 250, isSelf: false } }), "range", "治疗他人也看射程");
    assert.deepEqual([threatOf(13), threatOf(-2), castReqIdOf(7)], [13, 0, "cast:7"]);
});
