/** Snake V2 的服务端纯规则层；方向/量化/路径/相机/身体公式均来自 shared 真源。 */
import {
    directionVector,
    normalizeSnakeDegrees,
    quantizeSnake,
    snakeBodyScale,
    snakeCameraScale,
    snakePathPointCount,
    SNAKE_RULESET,
} from "@game/shared/gameplays/snake/ruleset";

export { directionVector, quantizeSnake, snakeBodyScale, snakeCameraScale, snakePathPointCount };

/** [0, 360) 角度归一化（兼容既有服务端调用名）。 */
export const normalizeDegrees = normalizeSnakeDegrees;

/** 最短弧转向；每 tick 最多转 maxTurnDeg。 */
export function turnTowards(currentDeg: number, targetDeg: number, maxTurnDeg: number): number {
    const delta = ((targetDeg - currentDeg) % 360 + 540) % 360 - 180;
    const clamped = Math.max(-maxTurnDeg, Math.min(maxTurnDeg, delta));
    return quantizeSnake(normalizeDegrees(currentDeg + clamped));
}

/** 输入向量到目标角；近零向量保持原方向。 */
export function directionFromInput(dirX: number, dirY: number): number | null {
    const lenSq = dirX * dirX + dirY * dirY;
    if (lenSq < 1e-6) return null;
    return normalizeDegrees((Math.atan2(dirY, dirX) * 180) / Math.PI);
}

/** 蛇本 tick 位移。 */
export function stepDistance(boost: boolean): number {
    const perSecond = boost
        ? SNAKE_RULESET.baseSpeed * SNAKE_RULESET.boostMultiplier
        : SNAKE_RULESET.baseSpeed;
    return quantizeSnake((perSecond * SNAKE_RULESET.fixedStepMs) / 1000);
}

/** 兼容渲染/测试的几何长度投影。 */
export function geometricLength(length: number): number {
    return quantizeSnake(visiblePointCount(length) * SNAKE_RULESET.pointSpacing);
}

/** V2 逻辑长度到路径点数；运行时不得消费三个 1240 source metadata 字段。 */
export function visiblePointCount(length: number): number {
    const count = snakePathPointCount(Math.max(0, Math.min(length, SNAKE_RULESET.maxLength)));
    return Math.min(Math.max(count, SNAKE_RULESET.initialPointCount), SNAKE_RULESET.maxBodyPoints);
}

export function bodyWidth(length: number = SNAKE_RULESET.spawnLength): number {
    return quantizeSnake(SNAKE_RULESET.bodyWidth * snakeBodyScale(length));
}

export function headRadius(length: number = SNAKE_RULESET.spawnLength): number {
    return bodyWidth(length) / 2;
}

/** 磁铁只扩 Dot/Star/残骸拾取圈，不扩磁铁本身。 */
export function eatDistance(
    foodRadius: number,
    length: number = SNAKE_RULESET.spawnLength,
    magnetActive = false,
): number {
    const base = (headRadius(length) + foodRadius) * SNAKE_RULESET.eatDistanceFactor;
    return quantizeSnake(base + (magnetActive ? SNAKE_RULESET.magnetExtraPickupRadius : 0));
}

export function snakeCollisionDistance(
    firstLength: number = SNAKE_RULESET.spawnLength,
    secondLength: number = SNAKE_RULESET.spawnLength,
): number {
    return quantizeSnake(
        (bodyWidth(firstLength) + bodyWidth(secondLength)) * SNAKE_RULESET.snakeCollisionFactor / 2,
    );
}

export function wallBounds(length: number = SNAKE_RULESET.spawnLength): {
    readonly halfWidth: number;
    readonly halfHeight: number;
} {
    const inset = bodyWidth(length) * SNAKE_RULESET.wallCollisionFactor;
    return {
        halfWidth: quantizeSnake(SNAKE_RULESET.worldWidth / 2 - inset),
        halfHeight: quantizeSnake(SNAKE_RULESET.worldHeight / 2 - inset),
    };
}

export function boostAccepted(requested: boolean, alive: boolean, length: number): boolean {
    return requested && alive && length > SNAKE_RULESET.minBoostLength;
}

export function boostLengthCost(boostDebt: number): { readonly cost: number; readonly debt: number } {
    const perTick = (SNAKE_RULESET.boostLengthCostPerSecond * SNAKE_RULESET.fixedStepMs) / 1000;
    let debt = boostDebt + perTick;
    let cost = 0;
    while (debt >= 1) {
        debt -= 1;
        cost += 1;
    }
    return { cost, debt: quantizeSnake(debt) };
}

/**
 * AI 死亡残骸：每个身体采样点各产生一份，单份严格应用
 * `max(pow(score, .8) * 2 / bodyCount, 3)`。0.001 量化余数分散到稳定的前 N 份，
 * 因而量化后的总分等于“单份精确值 × bodyCount”；房间实体 cap 只负责合并，不改变总分。
 */
export function aiDeathWreckValues(deadScore: number, bodyCount: number): readonly number[] {
    if (!Number.isFinite(deadScore) || deadScore < 0 || !Number.isSafeInteger(bodyCount) || bodyCount <= 0) return [];
    const formulaTotal = Math.pow(deadScore, SNAKE_RULESET.aiDeathWreckScoreExponent)
        * SNAKE_RULESET.aiDeathWreckScoreMultiplier;
    const perWreck = Math.max(formulaTotal / bodyCount, SNAKE_RULESET.aiDeathWreckMinValue);
    const totalMilli = Math.round(perWreck * bodyCount * 1000);
    const baseMilli = Math.floor(totalMilli / bodyCount);
    const remainder = totalMilli - baseMilli * bodyCount;
    return Array.from({ length: bodyCount }, (_unused, index) =>
        (baseMilli + (index < remainder ? 1 : 0)) / 1000);
}

/** 旧调用名保留为非真人通用探针；S2 世界只对 AI 使用上面的公式。 */
export function deathDropPlan(length: number): { readonly count: number; readonly valuePerWreck: number } {
    const values = aiDeathWreckValues(length, Math.max(1, visiblePointCount(length)));
    return { count: values.length, valuePerWreck: values[0] ?? 0 };
}

export interface SnakeRankEntry {
    readonly id: string;
    readonly score: number;
    readonly length: number;
    readonly deathCount: number;
    readonly scoreTick: number;
}

export function compareSnakeRank(left: SnakeRankEntry, right: SnakeRankEntry): number {
    if (left.score !== right.score) return right.score - left.score;
    if (left.length !== right.length) return right.length - left.length;
    if (left.deathCount !== right.deathCount) return left.deathCount - right.deathCount;
    if (left.scoreTick !== right.scoreTick) return left.scoreTick - right.scoreTick;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
