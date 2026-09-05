/**
 * S4 Demo 养成奖励的**纯公式层**：零副作用、零依赖、可独立单测。
 *
 * ⚠ 本文件只算数，⛔ 不碰 profile、Redis、run 状态或去重——那些归服务端 S4-03。
 * ⚠ 手写 shared 模块**不进 `contractDigest`**（只有 manifest/state/wire.ts 进），
 * 故新增或调整本文件⛔ 不需要 bump `modeVersion`。
 *
 * 全部整数运算：`cappedComponent` 先乘后整除再封顶，避免浮点漂移；输入一律先 `max(0, x)` 夹紧，
 * 因此负数或异常统计不会产生负奖励。
 */

/** 一档「按某项统计换算 + 单项封顶」的参数。 */
export interface SnakeRewardComponent {
    readonly numerator: number;
    readonly denominator: number;
    readonly cap: number;
}

export interface SnakeRewardTrack {
    readonly base: number;
    /** 全局硬顶：本 run 该项奖励的上界。 */
    readonly hardCap: number;
    readonly time: SnakeRewardComponent;
    readonly score: SnakeRewardComponent;
    readonly kills: SnakeRewardComponent;
}

/** 合格 run 的判据参数（`600` ticks = 20 Hz 下 30 秒）。 */
export interface SnakeQualifyPolicy {
    readonly minActiveTicks: number;
    readonly minMeaningfulInputs: number;
}

export interface SnakeRewardPolicy {
    readonly version: number;
    readonly qualify: SnakeQualifyPolicy;
    readonly coin: SnakeRewardTrack;
    readonly xp: SnakeRewardTrack;
}

/**
 * 冻结的 demo 参数。⛔ 不建立策略迁移或历史版本兼容——改了就是改了，由 fixture 钉住。
 * 参数取值使两条硬顶都**可达但不易触顶**：30 秒零分零杀 ≈ 15 币 / 40 XP；
 * 30 分钟 5000 分 20 杀触及 100 币 / 300 XP。
 */
export const SNAKE_REWARD_POLICY: SnakeRewardPolicy = Object.freeze({
    version: 1,
    qualify: Object.freeze({ minActiveTicks: 600, minMeaningfulInputs: 3 }),
    coin: Object.freeze({
        base: 5,
        hardCap: 100,
        time: Object.freeze({ numerator: 1, denominator: 60, cap: 30 }),
        score: Object.freeze({ numerator: 1, denominator: 100, cap: 40 }),
        kills: Object.freeze({ numerator: 5, denominator: 1, cap: 25 }),
    }),
    xp: Object.freeze({
        base: 10,
        hardCap: 300,
        time: Object.freeze({ numerator: 1, denominator: 20, cap: 120 }),
        score: Object.freeze({ numerator: 1, denominator: 40, cap: 100 }),
        kills: Object.freeze({ numerator: 10, denominator: 1, cap: 70 }),
    }),
});

/** run 终局时喂给公式的统计快照（只读副本，⛔ 不是房间状态本身）。 */
export interface SnakeRunStats {
    readonly activeTicks: number;
    readonly score: number;
    readonly kills: number;
    readonly starCollected: number;
    readonly meaningfulInputCount: number;
}

/** 终局原因里唯一**不发奖**的一种（作弊/管理踢出）。 */
export const SNAKE_REWARD_EXCLUDED_END_REASON = "moderationKick";

function clampNonNegative(value: number): number {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** `min(cap, floor(max(0, x) * num / den))`。⛔ 分母为 0 视为该项不计分。 */
export function cappedComponent(value: number, component: SnakeRewardComponent): number {
    if (component.denominator <= 0) return 0;
    const raw = Math.floor((clampNonNegative(value) * component.numerator) / component.denominator);
    return Math.min(component.cap, Math.max(0, raw));
}

export function isQualifiedRun(stats: SnakeRunStats, endReason: string, policy = SNAKE_REWARD_POLICY): boolean {
    if (endReason === SNAKE_REWARD_EXCLUDED_END_REASON) return false;
    if (clampNonNegative(stats.activeTicks) < policy.qualify.minActiveTicks) return false;
    return clampNonNegative(stats.score) > 0
        || clampNonNegative(stats.kills) > 0
        || clampNonNegative(stats.meaningfulInputCount) >= policy.qualify.minMeaningfulInputs;
}

function trackReward(stats: SnakeRunStats, track: SnakeRewardTrack): number {
    const sum = track.base
        + cappedComponent(stats.activeTicks, track.time)
        + cappedComponent(stats.score, track.score)
        + cappedComponent(stats.kills, track.kills);
    return Math.min(track.hardCap, Math.max(0, sum));
}

/** 不合格 run 一律 0 奖励（仍可展示本局统计）。 */
export function computeCoinReward(stats: SnakeRunStats, endReason: string, policy = SNAKE_REWARD_POLICY): number {
    return isQualifiedRun(stats, endReason, policy) ? trackReward(stats, policy.coin) : 0;
}

export function computeXpReward(stats: SnakeRunStats, endReason: string, policy = SNAKE_REWARD_POLICY): number {
    return isQualifiedRun(stats, endReason, policy) ? trackReward(stats, policy.xp) : 0;
}

// ── 等级 ────────────────────────────────────────────────────────────────────

export const SNAKE_MAX_LEVEL = 10;

/** `50 * level * (level - 1)`，level ∈ [1, 10]。等级 1 的门槛是 0。 */
export function xpThreshold(level: number): number {
    const clamped = Math.min(SNAKE_MAX_LEVEL, Math.max(1, Math.floor(level)));
    return 50 * clamped * (clamped - 1);
}

/** 满级后 XP 继续累计但显示等级保持 10。 */
export function derivedLevel(totalXp: number, maxLevel = SNAKE_MAX_LEVEL): number {
    const xp = clampNonNegative(totalXp);
    let level = 1;
    for (let candidate = 2; candidate <= maxLevel; candidate += 1) {
        if (xp >= xpThreshold(candidate)) level = candidate; else break;
    }
    return level;
}

/** 达到该等级即自动解锁对应皮肤（等级 1 的皮肤 1 本来就默认拥有）。 */
export const SNAKE_LEVEL_UNLOCKS: readonly { readonly level: number; readonly skinId: number }[] = Object.freeze([
    Object.freeze({ level: 1, skinId: 1 }),
    Object.freeze({ level: 2, skinId: 2 }),
    Object.freeze({ level: 4, skinId: 3 }),
    Object.freeze({ level: 7, skinId: 4 }),
]);

/** 从旧等级升到新等级期间新达成的解锁（⛔ 不重复授予已过门槛的档位）。 */
export function levelUnlocksBetween(levelBefore: number, levelAfter: number): readonly number[] {
    const out: number[] = [];
    for (let index = 0; index < SNAKE_LEVEL_UNLOCKS.length; index += 1) {
        const unlock = SNAKE_LEVEL_UNLOCKS[index];
        if (unlock.level > levelBefore && unlock.level <= levelAfter) out.push(unlock.skinId);
    }
    return out;
}

// ── 成就 ────────────────────────────────────────────────────────────────────

export type SnakeAchievementMetric = "activeTicks" | "kills" | "starCollected" | "score";

export interface SnakeAchievement {
    readonly skinId: number;
    readonly metric: SnakeAchievementMetric;
    readonly threshold: number;
}

/** 每项进度在门槛处饱和；达到门槛即解锁对应皮肤。 */
export const SNAKE_ACHIEVEMENTS: readonly SnakeAchievement[] = Object.freeze([
    Object.freeze({ skinId: 101, metric: "kills" as const, threshold: 100 }),
    Object.freeze({ skinId: 132, metric: "activeTicks" as const, threshold: 36000 }),
    Object.freeze({ skinId: 139, metric: "starCollected" as const, threshold: 200 }),
    Object.freeze({ skinId: 701, metric: "score" as const, threshold: 100000 }),
]);

export function achievementMetricOf(stats: SnakeRunStats, metric: SnakeAchievementMetric): number {
    switch (metric) {
        case "kills": return clampNonNegative(stats.kills);
        case "activeTicks": return clampNonNegative(stats.activeTicks);
        case "starCollected": return clampNonNegative(stats.starCollected);
        default: return clampNonNegative(stats.score);
    }
}

/** 累计进度 + 本局增量，在门槛处饱和。 */
export function accumulateAchievement(previous: number, gained: number, threshold: number): number {
    return Math.min(threshold, clampNonNegative(previous) + clampNonNegative(gained));
}

// ── 专属碎片 ────────────────────────────────────────────────────────────────

/** 优先级：第一个尚未拥有的皮肤拿本局全部碎片；四款均拥有时为 0。 */
export const SNAKE_FRAGMENT_PRIORITY: readonly number[] = Object.freeze([401, 403, 133, 411]);

export interface SnakeFragmentGrant {
    readonly skinId: number | null;
    readonly amount: number;
}

const NO_FRAGMENTS: SnakeFragmentGrant = Object.freeze({ skinId: null, amount: 0 });

/**
 * `1 + min(4, min(4, floor(score/1000)) + min(4, floor(kills/5)))`，范围 `1..5`。
 * 不合格 run 不发碎片。⚠ 本局选定后⛔ 不因随后换装或合成改投其他皮肤。
 */
export function computeFragmentGrant(
    stats: SnakeRunStats,
    endReason: string,
    ownedSkinIds: readonly number[],
    policy = SNAKE_REWARD_POLICY,
): SnakeFragmentGrant {
    if (!isQualifiedRun(stats, endReason, policy)) return NO_FRAGMENTS;
    let target: number | null = null;
    for (let index = 0; index < SNAKE_FRAGMENT_PRIORITY.length; index += 1) {
        const skinId = SNAKE_FRAGMENT_PRIORITY[index];
        if (ownedSkinIds.indexOf(skinId) < 0) { target = skinId; break; }
    }
    if (target === null) return NO_FRAGMENTS;
    const scorePart = Math.min(4, Math.floor(clampNonNegative(stats.score) / 1000));
    const killPart = Math.min(4, Math.floor(clampNonNegative(stats.kills) / 5));
    return Object.freeze({ skinId: target, amount: 1 + Math.min(4, scorePart + killPart) });
}
