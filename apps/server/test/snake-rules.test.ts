/**
 * snake 纯规则层单测（docs/snakeoff/03 §11 验收矩阵的纯函数部分）。
 * 世界/房间层行为在 snake-world.test.ts / snake-room.test.ts（S3）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { quantizeSnake, SNAKE_RULESET } from "@game/shared/gameplays/snake/ruleset";
import {
    boostAccepted,
    boostLengthCost,
    compareSnakeRank,
    deathDropPlan,
    directionFromInput,
    directionVector,
    eatDistance,
    geometricLength,
    headRadius,
    normalizeDegrees,
    snakeCollisionDistance,
    stepDistance,
    turnTowards,
    visiblePointCount,
    wallBounds,
} from "../src/rooms/modes/snake/rules";

test("quantizeSnake：0.001 精度量化且在确定位置", () => {
    assert.equal(quantizeSnake(1.0004), 1);
    assert.equal(quantizeSnake(1.0005), 1.001);
    assert.equal(quantizeSnake(-0.00049), 0, "-0 必须归一成 0（确定性 hash 友好）");
    assert.equal(quantizeSnake(0), 0);
});

test("normalizeDegrees：归一到 [0, 360)", () => {
    assert.equal(normalizeDegrees(0), 0);
    assert.equal(normalizeDegrees(360), 0);
    assert.equal(normalizeDegrees(-90), 270);
    assert.equal(normalizeDegrees(725), 5);
});

test("turnTowards：最短弧 + 每 tick 转角钳制 + 跨界", () => {
    // 最短弧：350° → 10° 应走 +20° 而不是 -340°
    assert.equal(turnTowards(350, 10, 30), normalizeDegrees(10));
    // 钳制：目标 180° 反向时每 tick 只走 maxTurnDeg（⛔ 瞬时掉头不存在）。
    // 恰好 180° 时两侧等距，实现统一取负向（-9 → 351°）——确定性 tie-break，双端一致即可。
    assert.equal(turnTowards(0, 180, SNAKE_RULESET.maxTurnDegPerTick),
        360 - SNAKE_RULESET.maxTurnDegPerTick, "180° 等距 tie 统一走负向");
    // 最短弧优先于钳制：0° → 359° 的最短差是 -1°（在钳制范围内，一步到达）
    assert.equal(turnTowards(0, 359, SNAKE_RULESET.maxTurnDegPerTick), 359);
    // 0/360 跨界：1° → 359° 走 -2°
    assert.equal(turnTowards(1, 359, 5), 359);
    // 到达即停
    assert.equal(turnTowards(90, 90, 9), 90);
});

test("directionFromInput：近零向量保持方向（返回 null），其余归一为角度", () => {
    assert.equal(directionFromInput(0, 0), null);
    assert.equal(directionFromInput(1e-4, 1e-4), null); // 长度近零
    assert.equal(directionFromInput(1, 0), 0);
    assert.equal(directionFromInput(0, 1), 90);
    assert.equal(directionFromInput(-1, 0), 180);
    assert.equal(directionFromInput(0, -1), 270);
    // 未归一化输入（摇杆推出 0.5,0.5）也给出 45°——归一化责任在规则层
    assert.equal(directionFromInput(0.5, 0.5), 45);
});

test("directionVector / stepDistance：方向单位向量与位移（量化）", () => {
    const east = directionVector(0);
    assert.equal(east.x, 1);
    assert.equal(east.y, 0);
    const north = directionVector(90);
    assert.ok(Math.abs(north.x) < 1e-9);
    assert.equal(north.y, 1);
    // 160 unit/s × 50ms = 8 unit/tick；boost 1.6× = 12.8 unit/tick
    assert.equal(stepDistance(false), 8);
    assert.equal(stepDistance(true), 12.8);
    // 防穿透前提（03 §7.3 的 swept 论证）：最大单步 < 碰撞直径
    assert.ok(stepDistance(true) < snakeCollisionDistance() * 2,
        "加速单步必须小于碰撞直径，否则需要 swept/子步");
});

test("长度↔几何映射：同长度同点数、封顶 maxBodyPoints、出生最少点数", () => {
    assert.equal(visiblePointCount(0), SNAKE_RULESET.initialPointCount);
    assert.equal(visiblePointCount(SNAKE_RULESET.spawnLength), 30);
    assert.equal(visiblePointCount(30), visiblePointCount(30)); // 同长度同点数
    assert.equal(visiblePointCount(Number.MAX_SAFE_INTEGER), SNAKE_RULESET.maxBodyPoints);
    assert.equal(geometricLength(30), 540);
    assert.ok(visiblePointCount(31) >= visiblePointCount(30), "点数随长度单调不减");
    assert.ok(visiblePointCount(100) > visiblePointCount(30));
});

test("boostAccepted / boostLengthCost：长度下限与债务累进制", () => {
    assert.equal(boostAccepted(true, true, SNAKE_RULESET.minBoostLength + 1), true);
    assert.equal(boostAccepted(true, true, SNAKE_RULESET.minBoostLength), false, "等于下限不加速");
    assert.equal(boostAccepted(true, false, 999), false, "死亡不加速");
    assert.equal(boostAccepted(false, true, 999), false);
    // 3 长度/s × 50ms = 0.15/tick：债务累进，每 6~7 tick 扣 1
    let debt = 0;
    let total = 0;
    for (let i = 0; i < 20; i++) {
        const result = boostLengthCost(debt);
        debt = result.debt;
        total += result.cost;
    }
    assert.equal(total, 3, "20 tick（1s）恰好扣 3 长度");
    assert.ok(debt < 1 && debt >= 0);
});

test("deathDropPlan：掉落数封顶 + 价值聚合 + 出生长度以下不掉落", () => {
    assert.deepEqual(deathDropPlan(SNAKE_RULESET.spawnLength), { count: 0, valuePerWreck: 0 });
    assert.deepEqual(deathDropPlan(10), { count: 0, valuePerWreck: 0 });
    // (100-30)×0.5 = 35 → 24 封顶，每个 1
    const capped = deathDropPlan(1000);
    assert.equal(capped.count, SNAKE_RULESET.maxDeathDrops);
    assert.ok(capped.valuePerWreck >= 1);
    // 价值近似守恒：count × value ≈ floor((length-spawn)×0.5)
    const plan = deathDropPlan(78);
    const totalValue = Math.floor((78 - SNAKE_RULESET.spawnLength) * SNAKE_RULESET.deathDropRatio);
    assert.ok(plan.count * plan.valuePerWreck <= totalValue);
    assert.ok(plan.count * plan.valuePerWreck >= totalValue - plan.count, "聚合误差不超过每残骸 1");
});

test("compareSnakeRank：score↓→length↓→deathCount↑→达分tick↑→id 字典序", () => {
    const base = { id: "a", score: 10, length: 50, deathCount: 0, scoreTick: 100 };
    // score 优先
    assert.ok(compareSnakeRank(base, { ...base, id: "b", score: 9 }) < 0);
    // 同分比长度
    assert.ok(compareSnakeRank(base, { ...base, id: "b", length: 60 }) > 0);
    // 同长比死亡数
    assert.ok(compareSnakeRank(base, { ...base, id: "b", deathCount: 1 }) < 0);
    // 同死亡数比达分 tick（早者优先）
    assert.ok(compareSnakeRank(base, { ...base, id: "b", scoreTick: 200 }) < 0);
    // 全同走 id 字典序（确定性兜底）
    assert.ok(compareSnakeRank(base, { ...base, id: "b" }) < 0);
    assert.ok(compareSnakeRank({ ...base, id: "b" }, base) > 0);
    assert.equal(compareSnakeRank(base, base), 0);
});

test("碰撞距离与墙边界：数值自洽（防穿透/防贴墙抖动）", () => {
    const bounds = wallBounds();
    assert.equal(bounds.halfWidth,
        SNAKE_RULESET.worldWidth / 2 - SNAKE_RULESET.bodyWidth * SNAKE_RULESET.wallCollisionFactor);
    assert.equal(bounds.halfHeight,
        SNAKE_RULESET.worldHeight / 2 - SNAKE_RULESET.bodyWidth * SNAKE_RULESET.wallCollisionFactor);
    assert.ok(snakeCollisionDistance() > stepDistance(true), "碰撞判定距离必须大于单步位移");
    assert.ok(eatDistance(SNAKE_RULESET.dotRadius) > headRadius(), "吃食距离必须大于头半径");
});
