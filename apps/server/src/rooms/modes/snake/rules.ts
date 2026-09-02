/**
 * Snake 玩法的纯函数规则层（docs/snakeoff/03；数值一律来自 shared `SNAKE_RULESET`）。
 *
 * 本文件 ⛔ 不持有任何可变状态：世界状态在 world.ts，这里只有可独立单测的
 * 确定性计算——转向、位移、长度↔几何、吃食、加速消耗、死亡掉落、排名。
 * 所有输出经 `quantizeSnake` 在确定位置量化（03 §3.2），保证同 seed + 同输入
 * 序列的跨运行时一致。
 */
import { quantizeSnake, SNAKE_RULESET } from "@game/shared/gameplays/snake/ruleset";

/** [0, 360) 角度归一化。 */
export function normalizeDegrees(deg: number): number {
    const wrapped = deg % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * 最短弧转向（03 §4.2）：每 tick 最多转 maxTurnDeg，⛔ 不允许瞬时 180° 掉头
 * （掉头被摊到若干 tick，避免穿过自身身体的判定空洞）。
 */
export function turnTowards(currentDeg: number, targetDeg: number, maxTurnDeg: number): number {
    const delta = ((targetDeg - currentDeg) % 360 + 540) % 360 - 180; // 最短带符号差 [-180, 180)
    const clamped = Math.max(-maxTurnDeg, Math.min(maxTurnDeg, delta));
    return quantizeSnake(normalizeDegrees(currentDeg + clamped));
}

/** 方向角 → 单位向量。 */
export function directionVector(deg: number): { readonly x: number; readonly y: number } {
    const rad = (deg * Math.PI) / 180;
    return { x: quantizeSnake(Math.cos(rad)), y: quantizeSnake(Math.sin(rad)) };
}

/** 输入向量 → 目标角度；零/近零向量返回 null（保持上一方向，03 §4.1）。 */
export function directionFromInput(dirX: number, dirY: number): number | null {
    const lenSq = dirX * dirX + dirY * dirY;
    if (lenSq < 1e-6) return null;
    return normalizeDegrees((Math.atan2(dirY, dirX) * 180) / Math.PI);
}

/** 本 tick 位移距离（unit）。boostAccepted 由调用方按规则判定后传入。 */
export function stepDistance(boostAccepted: boolean): number {
    const perSecond = boostAccepted
        ? SNAKE_RULESET.baseSpeed * SNAKE_RULESET.boostMultiplier
        : SNAKE_RULESET.baseSpeed;
    return quantizeSnake((perSecond * SNAKE_RULESET.fixedStepMs) / 1000);
}

/** 逻辑长度 → 身体几何路径长度（unit；pointSpacing 采样模型，03 §5.2 备选）。 */
export function geometricLength(length: number): number {
    return quantizeSnake(Math.max(0, length) * SNAKE_RULESET.pointSpacing);
}

/** 逻辑长度 → 可见身体点数（封顶 maxBodyPoints；03 §2.3 硬上限）。 */
export function visiblePointCount(length: number): number {
    const count = Math.ceil(geometricLength(length) / SNAKE_RULESET.pointSpacing);
    return Math.min(Math.max(count, SNAKE_RULESET.initialPointCount), SNAKE_RULESET.maxBodyPoints);
}

/** 头部碰撞半径（首版固定体宽；v1.1 候选：随长度变粗时这里跟着变）。 */
export function headRadius(): number {
    return SNAKE_RULESET.bodyWidth / 2;
}

/** 吃食判定距离：蛇头半径 + 食物半径，再乘统一倍率（源 EAT_DIS_FACTOR=1.6 同式）。 */
export function eatDistance(foodRadius: number): number {
    return quantizeSnake((headRadius() + foodRadius) * SNAKE_RULESET.eatDistanceFactor);
}

/** 蛇身碰撞距离：两条等宽蛇的中线距离阈值（源 SNAKE 0.5 因子同式）。 */
export function snakeCollisionDistance(): number {
    return quantizeSnake(SNAKE_RULESET.bodyWidth * SNAKE_RULESET.snakeCollisionFactor);
}

/** 撞墙边界：|x| 或 |y| 超过半宽/半高 − 头部内缩量即死（源 BORDER 0.4 因子同式）。 */
export function wallBounds(): { readonly halfWidth: number; readonly halfHeight: number } {
    const inset = SNAKE_RULESET.bodyWidth * SNAKE_RULESET.wallCollisionFactor;
    return {
        halfWidth: quantizeSnake(SNAKE_RULESET.worldWidth / 2 - inset),
        halfHeight: quantizeSnake(SNAKE_RULESET.worldHeight / 2 - inset),
    };
}

/** 加速是否被接受（03 §6.3）：活着、长度高于下限、本 tick 请求了加速。 */
export function boostAccepted(requested: boolean, alive: boolean, length: number): boolean {
    return requested && alive && length > SNAKE_RULESET.minBoostLength;
}

/**
 * 加速消耗的 tick 结算：返回本 tick 应扣的整数长度（债务累进制，03 §6.3 的
 * while-debt 形式化）。债务由调用方持有并回写。
 */
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
 * 死亡掉落（03 §6.4）：掉落数封顶、价值聚合。
 * 返回 `{ count, valuePerWreck }`；count=0 表示无掉落。
 */
export function deathDropPlan(length: number): { readonly count: number; readonly valuePerWreck: number } {
    const totalValue = Math.floor(Math.max(0, length - SNAKE_RULESET.spawnLength) * SNAKE_RULESET.deathDropRatio);
    if (totalValue <= 0) return { count: 0, valuePerWreck: 0 };
    const count = Math.min(SNAKE_RULESET.maxDeathDrops, totalValue);
    return { count, valuePerWreck: Math.max(1, Math.floor(totalValue / count)) };
}

/** 排名输入（03 §9.1）。 */
export interface SnakeRankEntry {
    readonly id: string;
    readonly score: number;
    readonly length: number;
    readonly deathCount: number;
    /** 最后一次达到当前 score 的 tick（早者优先）。 */
    readonly scoreTick: number;
}

/**
 * 稳定排名：score↓ → length↓ → deathCount↑ → 达分 tick↑ → id 字典序（确定性兜底，
 * ⛔ 不作为面向玩家的公平规则宣传）。
 */
export function compareSnakeRank(left: SnakeRankEntry, right: SnakeRankEntry): number {
    if (left.score !== right.score) return right.score - left.score;
    if (left.length !== right.length) return right.length - left.length;
    if (left.deathCount !== right.deathCount) return left.deathCount - right.deathCount;
    if (left.scoreTick !== right.scoreTick) return left.scoreTick - right.scoreTick;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
