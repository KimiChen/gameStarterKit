/**
 * shared 纯函数单测（无需本地栈）：体力恢复 / RNG 子流 / 自然日。
 * 这些函数是服务端权威路径（体力门禁等）的输入，公式回归在这里把关。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    recomputeStamina, spendStamina, staminaInfo, STAMINA_MAX, STAMINA_REGEN_MS,
    SeededRandom, hashStr, isNewNaturalDay,
} from "@game/shared";

test("recomputeStamina：进位保留余数、满则计时归 now", () => {
    const t0 = 1_700_000_000_000;
    const r = recomputeStamina(0, t0, t0 + 2.5 * STAMINA_REGEN_MS);
    assert.equal(r.stamina, 2, "2.5 个周期回 2 点");
    assert.equal(r.lastRecoverAt, t0 + 2 * STAMINA_REGEN_MS, "余数 0.5 周期保留在计时起点里");

    const full = recomputeStamina(STAMINA_MAX, t0, t0 + 123);
    assert.deepEqual(full, { stamina: STAMINA_MAX, lastRecoverAt: t0 + 123 }, "满体力计时器重置到 now");
});

test("spendStamina：满体力扣减起表；不足不扣但回写恢复结果", () => {
    const t0 = 1_700_000_000_000;
    const fromFull = spendStamina({ stamina: STAMINA_MAX, lastStaminaRecoverAt: 0 }, t0);
    assert.equal(fromFull.ok, true);
    assert.deepEqual(fromFull.fields, { stamina: STAMINA_MAX - 1, lastStaminaRecoverAt: t0 });

    const broke = spendStamina({ stamina: 0, lastStaminaRecoverAt: t0 }, t0 + 1000);
    assert.equal(broke.ok, false, "刚开始恢复不足 1 点，不可开局");
    assert.equal(broke.fields.stamina, 0);

    const info = staminaInfo({ stamina: 0, lastStaminaRecoverAt: t0 }, t0 + 1000);
    assert.equal(info.msToNext, STAMINA_REGEN_MS - 1000, "倒计时 = 周期 - 已过时长");
});

test("SeededRandom.stream：同 (seed,name) 可复现，异名子流互相独立", () => {
    const a1 = SeededRandom.stream(42, "wave");
    const a2 = SeededRandom.stream(42, "wave");
    const b = SeededRandom.stream(42, "shop");
    const seqA1 = [a1.next(), a1.next(), a1.next()];
    // b 在 a2 消费前先消费，若子流不独立会带偏 a2
    b.next(); b.next();
    const seqA2 = [a2.next(), a2.next(), a2.next()];
    assert.deepEqual(seqA1, seqA2, "同名子流序列一致，且不受其他子流消耗影响");
    assert.notDeepEqual(seqA1, [SeededRandom.stream(42, "shop").next(), NaN, NaN].slice(0, 3), "异名子流不同序");
    assert.equal(hashStr("wave"), hashStr("wave"), "hashStr 稳定");
    assert.notEqual(hashStr("wave"), hashStr("shop"));
});

test("isNewNaturalDay：同日 false / 跨午夜 true / 首次(0) false", () => {
    const d = (y: number, m: number, day: number, h: number): number => new Date(y, m - 1, day, h).getTime();
    assert.equal(isNewNaturalDay(d(2026, 7, 13, 9), d(2026, 7, 13, 23)), false);
    assert.equal(isNewNaturalDay(d(2026, 7, 13, 23), d(2026, 7, 14, 0)), true);
    assert.equal(isNewNaturalDay(0, d(2026, 7, 13, 9)), false);
});
