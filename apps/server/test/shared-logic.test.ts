/**
 * shared 纯函数单测（无需本地栈）：体力恢复 / RNG 子流 / 自然日 / 通用 LOD。
 * LOD 由 slg worldmap 消费；其余公式接入生产权威路径前先在这里把关。
 * SC2-B1 变异：删 lodForValueStable 的 (1 ± hysteresisRatio) →「阈值附近抖动」用例转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    recomputeStamina, spendStamina, staminaInfo, STAMINA_MAX, STAMINA_REGEN_MS,
    SeededRandom, hashStr, isNewNaturalDay, naturalDayIndex,
    lodForValue, lodForValueStable,
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
    const d = (y: number, m: number, day: number, h: number): number => Date.UTC(y, m - 1, day, h);
    assert.equal(isNewNaturalDay(d(2026, 7, 13, 9), d(2026, 7, 13, 23), 0), false);
    assert.equal(isNewNaturalDay(d(2026, 7, 13, 23), d(2026, 7, 14, 0), 0), true);
    assert.equal(isNewNaturalDay(0, d(2026, 7, 13, 9), 0), false);
});

test("naturalDayIndex：显式 UTC 偏移，不随宿主 TZ 漂移", () => {
    const beforeUtcMidnight = Date.UTC(2026, 6, 13, 23, 59);
    const afterUtcMidnight = Date.UTC(2026, 6, 14, 0, 1);
    assert.equal(isNewNaturalDay(beforeUtcMidnight, afterUtcMidnight, 0), true);
    // 同一瞬间在 UTC+8 仍属于 7 月 14 日同一天。
    assert.equal(naturalDayIndex(Date.UTC(2026, 6, 13, 16), 480), naturalDayIndex(Date.UTC(2026, 6, 14, 1), 480));
    assert.throws(() => naturalDayIndex(afterUtcMidnight, 1441), /offset/);
});

test("lodForValue：任意档数、升序阈值与边界相等取更细档", () => {
    const thresholds = Object.freeze([10, 20, 40, 80]);
    assert.deepEqual([1, 9, 10, 19, 20, 39, 40, 79, 80, 100]
        .map((value) => lodForValue(value, thresholds)), [4, 4, 3, 3, 2, 2, 1, 1, 0, 0]);
    assert.equal(lodForValue(Number.MIN_VALUE, thresholds), 4);
    assert.equal(lodForValue(Number.MAX_VALUE, thresholds), 0);
    assert.deepEqual(thresholds, [10, 20, 40, 80]);
});

test("lodBands：空表单档与单阈值双档", () => {
    assert.equal(lodForValue(1, []), 0);
    assert.equal(lodForValueStable(0, 100, [], 0.25), 0);
    assert.deepEqual([7, 8, 9].map((value) => lodForValue(value, [8])), [1, 0, 0]);
    assert.equal(lodForValueStable(1, 9, [8], 0.25), 1);
    assert.equal(lodForValueStable(1, 10, [8], 0.25), 0);
    assert.equal(lodForValueStable(0, 6, [8], 0.25), 0);
    assert.equal(lodForValueStable(0, 5, [8], 0.25), 1);
});

test("lodForValueStable：阈值附近抖动保持原档，跨带后反向抖动也不回跳", () => {
    const thresholds = Object.freeze([10, 20, 40, 80]);
    for (const [i, threshold] of thresholds.entries()) {
        const finer = thresholds.length - 1 - i;
        const coarser = finer + 1;
        const jitter = [threshold * 0.99, threshold * 1.01, threshold * 0.99, threshold * 1.01];
        assert.deepEqual(jitter.map((value) => lodForValue(value, thresholds)), [coarser, finer, coarser, finer]);
        for (const initial of [finer, coarser]) {
            let lod = initial;
            for (const value of jitter) {
                lod = lodForValueStable(lod, value, thresholds, 0.1);
                assert.equal(lod, initial, `threshold=${threshold}, initial=${initial}, value=${value}`);
            }
        }
        let lod = lodForValueStable(coarser, threshold * 1.2, thresholds, 0.1);
        assert.equal(lod, finer);
        for (const value of jitter) lod = lodForValueStable(lod, value, thresholds, 0.1);
        assert.equal(lod, finer);
        lod = lodForValueStable(lod, threshold * 0.8, thresholds, 0.1);
        assert.equal(lod, coarser);
        for (const value of jitter) lod = lodForValueStable(lod, value, thresholds, 0.1);
        assert.equal(lod, coarser);
    }
});

test("lodForValueStable：跨两档及全部档一次到位，首尾不越界", () => {
    const thresholds = [10, 20, 40, 80];
    assert.equal(lodForValueStable(4, 30, thresholds, 0.1), 2);
    assert.equal(lodForValueStable(0, 30, thresholds, 0.1), 2);
    assert.equal(lodForValueStable(4, 100, thresholds, 0.1), 0);
    assert.equal(lodForValueStable(0, 1, thresholds, 0.1), 4);
    assert.equal(lodForValueStable(0, Number.MAX_VALUE, thresholds, 0.1), 0);
    assert.equal(lodForValueStable(4, Number.MIN_VALUE, thresholds, 0.1), 4);
});

test("lodForValueStable：升细边界相等迁移、降粗边界相等保留", () => {
    // 二进制可精确表示的数值，避免浮点舍入掩盖 >= / < 的契约。
    const thresholds = [8, 16, 32];
    for (const [i, threshold] of thresholds.entries()) {
        const finer = thresholds.length - 1 - i;
        const coarser = finer + 1;
        assert.equal(lodForValueStable(coarser, threshold * 1.25 - 0.125, thresholds, 0.25), coarser);
        assert.equal(lodForValueStable(coarser, threshold * 1.25, thresholds, 0.25), finer);
        assert.equal(lodForValueStable(finer, threshold * 0.75, thresholds, 0.25), finer);
        assert.equal(lodForValueStable(finer, threshold * 0.75 - 0.125, thresholds, 0.25), coarser);
    }
});

test("lodForValueStable：零滞回与无状态分档一致，不依赖上一档", () => {
    const thresholds = [8, 16, 32];
    for (const value of [1, 7, 8, 9, 15, 16, 17, 31, 32, 33, 100]) {
        for (let prev = 0; prev <= thresholds.length; prev += 1) {
            assert.equal(lodForValueStable(prev, value, thresholds, 0), lodForValue(value, thresholds));
        }
    }
});

test("lodBands：拒绝非法数值、无序阈值、越界上一档与滞回比例", () => {
    for (const value of [0, -1, NaN, Infinity, -Infinity]) {
        assert.throws(() => lodForValue(value, [1]), /positive and finite/);
        assert.throws(() => lodForValueStable(0, value, [1], 0.1), /positive and finite/);
    }
    for (const thresholds of [[0], [-1], [NaN], [Infinity], [-Infinity], [2, 1], [1, 1], [1, 3, 2]]) {
        assert.throws(() => lodForValue(1, thresholds), /thresholds/);
        assert.throws(() => lodForValueStable(0, 1, thresholds, 0.1), /thresholds/);
    }
    for (const prev of [-1, 2, 0.5, NaN, Infinity, -Infinity]) {
        assert.throws(() => lodForValueStable(prev, 1, [1], 0.1), /prev LOD/);
    }
    assert.throws(() => lodForValueStable(1, 1, [], 0.1), /prev LOD/);
    for (const ratio of [-0.01, 1, 2, NaN, Infinity, -Infinity]) {
        assert.throws(() => lodForValueStable(0, 1, [1], ratio), /hysteresisRatio/);
    }
    assert.equal(lodForValueStable(1, 1, [1], 0.999), 1);
});
