/** Snake Endless V2 的 shared/server 纯规则 golden。 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
    nextSnakeMotionStepMilli,
    quantizeSnake,
    snakeBodyScale,
    snakeCameraScale,
    snakeDeadlineDone,
    snakePathPointCount,
    SNAKE_ENDLESS_CONFIG,
    SNAKE_ENDLESS_LAYER_MANIFEST,
    SNAKE_ONLINE_ADAPTATION_V2,
    SNAKE_POINT_STEP_CONFIG,
    SNAKE_RULESET,
} from "@game/shared/gameplays/snake/ruleset";
import {
    aiDeathWreckValues,
    boostAccepted,
    boostLengthCost,
    compareSnakeRank,
    directionFromInput,
    directionVector,
    eatDistance,
    normalizeDegrees,
    snakeCollisionDistance,
    stepDistance,
    turnTowards,
    wallBounds,
} from "../src/rooms/modes/snake/rules";

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonical(record[key])]));
    }
    return value;
}

test("S2 五层身份：四层 hash 不变，online v2 与组合 hash 为真实新值", () => {
    const onlineBytes = `${JSON.stringify(canonical(SNAKE_ONLINE_ADAPTATION_V2), null, 2)}\n`;
    assert.equal(createHash("sha256").update(onlineBytes).digest("hex"),
        SNAKE_ENDLESS_CONFIG.layerHashes.onlineAdaptation);
    assert.deepEqual(SNAKE_ENDLESS_CONFIG.layerVersions,
        { battlefield: 1, lifecycle: 1, reliveFlow: 1, relivePolicy: 1, onlineAdaptation: 2 });
    assert.equal(SNAKE_ENDLESS_CONFIG.layerHashes.battlefield,
        "6750cb34f7b454902a0263b17ddd9745942eb511b56e1510aed5a886ea72a07e");
    assert.equal(SNAKE_ENDLESS_CONFIG.layerHashes.lifecycle,
        "efc56090b06e92c5ba0027330b7719d6f857c5709045ddb850d64a46e551b477");
    assert.equal(SNAKE_ENDLESS_CONFIG.layerHashes.reliveFlow,
        "9b33262d53fd0de440a8adc6ca6bf7c09493d32d0b0034dd20677c10915eb865");
    assert.equal(SNAKE_ENDLESS_CONFIG.layerHashes.relivePolicy,
        "e668f382989f593802dc6ab608524811a0fb39756d70a5afe9e6ce2737bbc646");
    const manifestBytes = `${JSON.stringify(canonical(SNAKE_ENDLESS_LAYER_MANIFEST), null, 2)}\n`;
    assert.equal(createHash("sha256").update(manifestBytes).digest("hex"), SNAKE_ENDLESS_CONFIG.configHash);
    assert.equal(SNAKE_ENDLESS_CONFIG.configHash, "2c74f005c0375f98a07250c4c14ede9d0075a238d9f355ff6f07c9935d97e8e7");
    assert.notEqual(SNAKE_ENDLESS_CONFIG.configHash, SNAKE_ENDLESS_CONFIG.legacyS0ConfigHash);
});

test("4096² V2 几何与 71 项路径表命中全部冻结向量", () => {
    assert.equal(SNAKE_RULESET.worldWidth, 4096);
    assert.equal(SNAKE_RULESET.worldHeight, 4096);
    assert.equal(SNAKE_RULESET.visualGridSpacing, 32);
    assert.equal(SNAKE_RULESET.mapMargin, 16);
    assert.equal(SNAKE_RULESET.spawnLength, 80);
    assert.equal(SNAKE_RULESET.maxLength, 100000);
    assert.equal(SNAKE_POINT_STEP_CONFIG.length, 71);
    assert.deepEqual([80, 300, 3000, 18900, 19200, 20100, 100000].map(snakePathPointCount),
        [52, 200, 960, 1954, 1964, 1990, 5186]);
    assert.deepEqual(SNAKE_POINT_STEP_CONFIG.slice(-3), [
        { max_length: 100000, step_length: 50 },
        { max_length: 200000, step_length: 100 },
        { max_length: 300000, step_length: 100 },
    ]);
});

test("相机/身体尺度连续、单调并钉住端点", () => {
    assert.equal(snakeCameraScale(0), 1.3);
    assert.ok(Math.abs(snakeCameraScale(100000) - 0.6) < 1e-12);
    assert.equal(snakeBodyScale(0), 1);
    assert.equal(snakeBodyScale(100000), 2.8);
    for (const length of [80, 300, 3000, 18900, 19200, 20100]) {
        assert.ok(snakeCameraScale(length) >= snakeCameraScale(length + 1));
        assert.ok(snakeBodyScale(length) <= snakeBodyScale(length + 1));
    }
});

test("320/3 unit/s 的 milli 余数严格循环 5333/5333/5334", () => {
    let remainder = 0;
    const steps: number[] = [];
    let total = 0;
    for (let index = 0; index < 6000; index += 1) {
        const next = nextSnakeMotionStepMilli(remainder);
        remainder = next.remainder;
        steps.push(next.stepMilli);
        total += next.stepMilli;
    }
    assert.deepEqual(steps.slice(0, 6), [5333, 5333, 5334, 5333, 5333, 5334]);
    assert.equal(total, 32_000_000, "300 秒累计必须精确为 32000 unit");
    assert.equal(remainder, 0);
    assert.throws(() => nextSnakeMotionStepMilli(3), RangeError);
});

test("无尽 deadline 必须由 hasDeadline 守门", () => {
    assert.equal(snakeDeadlineDone({ hasDeadline: false, endTick: null }, Number.MAX_SAFE_INTEGER), false);
    assert.equal(snakeDeadlineDone({ hasDeadline: false, endTick: 0 }, 1801), false);
    assert.equal(snakeDeadlineDone({ hasDeadline: true, endTick: 1800 }, 1799), false);
    assert.equal(snakeDeadlineDone({ hasDeadline: true, endTick: 1800 }, 1800), true);
});

test("方向、速度、转角与磁铁扩圈均消费 V2 单源", () => {
    assert.equal(quantizeSnake(-0.00049), 0);
    assert.equal(normalizeDegrees(-90), 270);
    assert.equal(directionFromInput(0, 0), null);
    assert.equal(directionFromInput(0, 1), 90);
    assert.deepEqual(directionVector(0), { x: 1, y: 0 });
    assert.equal(stepDistance(false), 8);
    assert.equal(stepDistance(true), 16);
    assert.equal(turnTowards(0, 180, 9), 351);
    assert.equal(turnTowards(350, 10, 9), 359);
    assert.equal(eatDistance(8, 80, true) - eatDistance(8, 80, false), 86.4);
    assert.ok(snakeCollisionDistance(100000, 100000) > snakeCollisionDistance(80, 80));
    assert.ok(wallBounds(100000).halfWidth < wallBounds(80).halfWidth);
});

test("加速债务 1 秒精确扣 3，长度下限/死亡拒绝", () => {
    let debt = 0;
    let cost = 0;
    for (let index = 0; index < 20; index += 1) {
        const next = boostLengthCost(debt);
        debt = next.debt;
        cost += next.cost;
    }
    assert.equal(cost, 3);
    assert.equal(debt, 0);
    assert.equal(boostAccepted(true, true, SNAKE_RULESET.minBoostLength + 1), true);
    assert.equal(boostAccepted(true, true, SNAKE_RULESET.minBoostLength), false);
    assert.equal(boostAccepted(true, false, 999), false);
});

test("AI 死亡残骸公式边界与 0.001 分值守恒", () => {
    for (const [score, bodyCount] of [[0, 10], [1, 1], [80, 52], [9999, 400], [100000, 5186]] as const) {
        const values = aiDeathWreckValues(score, bodyCount);
        const formulaTotal = Math.pow(score, SNAKE_RULESET.aiDeathWreckScoreExponent)
            * SNAKE_RULESET.aiDeathWreckScoreMultiplier;
        const expected = quantizeSnake(Math.max(
            formulaTotal / bodyCount,
            SNAKE_RULESET.aiDeathWreckMinValue,
        ) * bodyCount);
        assert.equal(values.length, bodyCount);
        assert.equal(quantizeSnake(values.reduce((sum, value) => sum + value, 0)), expected);
        assert.ok(values.every((value) => value >= SNAKE_RULESET.aiDeathWreckMinValue));
    }
});

test("排名 tie-break 稳定", () => {
    const base = { id: "a", score: 10, length: 50, deathCount: 0, scoreTick: 100 };
    assert.ok(compareSnakeRank(base, { ...base, id: "b", score: 9 }) < 0);
    assert.ok(compareSnakeRank(base, { ...base, id: "b", length: 60 }) > 0);
    assert.ok(compareSnakeRank(base, { ...base, id: "b", deathCount: 1 }) < 0);
    assert.ok(compareSnakeRank(base, { ...base, id: "b", scoreTick: 200 }) < 0);
    assert.ok(compareSnakeRank(base, { ...base, id: "b" }) < 0);
});
