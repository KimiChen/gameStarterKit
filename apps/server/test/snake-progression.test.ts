/** S4-02 纯公式层的 fixture：上下界、溢出保护、不合格 run 与优先级都逐条钉死。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SNAKE_ACHIEVEMENTS,
    SNAKE_FRAGMENT_PRIORITY,
    SNAKE_MAX_LEVEL,
    SNAKE_REWARD_POLICY,
    accumulateAchievement,
    achievementMetricOf,
    cappedComponent,
    computeCoinReward,
    computeFragmentGrant,
    computeXpReward,
    derivedLevel,
    isQualifiedRun,
    levelUnlocksBetween,
    xpThreshold,
    type SnakeRunStats,
} from "@game/shared/gameplays/snake/progression";

const ZERO: SnakeRunStats = { activeTicks: 0, score: 0, kills: 0, starCollected: 0, meaningfulInputCount: 0 };
const stats = (over: Partial<SnakeRunStats>): SnakeRunStats => ({ ...ZERO, ...over });

test("cappedComponent：先乘后整除再封顶；负数/非有限/零分母都退化为 0", () => {
    const c = { numerator: 1, denominator: 60, cap: 30 };
    assert.equal(cappedComponent(600, c), 10);
    assert.equal(cappedComponent(599, c), 9, "整除向下取整");
    assert.equal(cappedComponent(999999, c), 30, "单项封顶");
    assert.equal(cappedComponent(-1, c), 0, "负数夹紧");
    assert.equal(cappedComponent(Number.NaN, c), 0);
    assert.equal(cappedComponent(Number.POSITIVE_INFINITY, c), 0, "非有限值不得穿透封顶");
    assert.equal(cappedComponent(100, { numerator: 1, denominator: 0, cap: 9 }), 0, "零分母该项不计分");
});

test("合格 run 判据：moderationKick 一律不发；时长不足不发；三选一支路各自成立", () => {
    const long = { activeTicks: 600 };
    assert.equal(isQualifiedRun(stats({ ...long, score: 1 }), "explicitExit"), true);
    assert.equal(isQualifiedRun(stats({ ...long, kills: 1 }), "explicitExit"), true);
    assert.equal(isQualifiedRun(stats({ ...long, meaningfulInputCount: 3 }), "explicitExit"), true);
    assert.equal(isQualifiedRun(stats({ ...long, meaningfulInputCount: 2 }), "explicitExit"), false, "三项都不满足");
    assert.equal(isQualifiedRun(stats({ activeTicks: 599, score: 999 }), "explicitExit"), false, "时长不足");
    assert.equal(isQualifiedRun(stats({ ...long, score: 999 }), "moderationKick"), false, "⛔ 踢出不发奖");
});

test("金币/XP：不合格 run 为 0；下界是 base + 时长；上界精确触顶", () => {
    // 不合格
    assert.equal(computeCoinReward(stats({ activeTicks: 100, score: 50 }), "explicitExit"), 0);
    assert.equal(computeXpReward(stats({ activeTicks: 100, score: 50 }), "explicitExit"), 0);
    assert.equal(computeCoinReward(stats({ activeTicks: 6000, score: 5 }), "moderationKick"), 0);

    // 刚好合格的最小 run：30 秒、0 分、0 杀、3 次有效输入
    const minimal = stats({ activeTicks: 600, meaningfulInputCount: 3 });
    assert.equal(computeCoinReward(minimal, "explicitExit"), 5 + 10);
    assert.equal(computeXpReward(minimal, "explicitExit"), 10 + 30);

    // 触顶：30 分钟 + 5000 分 + 20 杀
    const big = stats({ activeTicks: 36000, score: 5000, kills: 20, meaningfulInputCount: 50 });
    assert.equal(computeCoinReward(big, "explicitExit"), SNAKE_REWARD_POLICY.coin.hardCap);
    assert.equal(computeXpReward(big, "explicitExit"), SNAKE_REWARD_POLICY.xp.hardCap);

    // 极端输入不得穿透硬顶
    const absurd = stats({ activeTicks: 1e12, score: 1e12, kills: 1e9, meaningfulInputCount: 9 });
    assert.equal(computeCoinReward(absurd, "explicitExit"), 100);
    assert.equal(computeXpReward(absurd, "explicitExit"), 300);
});

test("等级：门槛表 50*L*(L-1)，满级封顶，解锁只在跨过档位时授予一次", () => {
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(xpThreshold),
        [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500],
    );
    assert.equal(derivedLevel(0), 1);
    assert.equal(derivedLevel(99), 1);
    assert.equal(derivedLevel(100), 2);
    assert.equal(derivedLevel(4499), 9);
    assert.equal(derivedLevel(4500), SNAKE_MAX_LEVEL);
    assert.equal(derivedLevel(1e9), SNAKE_MAX_LEVEL, "满级后继续累计但显示等级封顶");
    assert.equal(derivedLevel(-5), 1, "负数夹紧");

    assert.deepEqual(levelUnlocksBetween(1, 2), [2]);
    assert.deepEqual(levelUnlocksBetween(1, 7), [2, 3, 4], "一次跨多档拿齐");
    assert.deepEqual(levelUnlocksBetween(2, 2), [], "没升级就不授予");
    assert.deepEqual(levelUnlocksBetween(7, 10), [], "更高等级没有新皮肤");
});

test("成就：四项指标各自取值，进度在门槛处饱和", () => {
    assert.deepEqual(SNAKE_ACHIEVEMENTS.map((a) => a.skinId), [101, 132, 139, 701]);
    const s = stats({ activeTicks: 10, score: 20, kills: 30, starCollected: 40 });
    assert.equal(achievementMetricOf(s, "activeTicks"), 10);
    assert.equal(achievementMetricOf(s, "score"), 20);
    assert.equal(achievementMetricOf(s, "kills"), 30);
    assert.equal(achievementMetricOf(s, "starCollected"), 40);

    assert.equal(accumulateAchievement(90, 5, 100), 95);
    assert.equal(accumulateAchievement(90, 50, 100), 100, "门槛处饱和");
    assert.equal(accumulateAchievement(100, 50, 100), 100, "已饱和不再增长");
    assert.equal(accumulateAchievement(-5, -5, 100), 0, "负数夹紧");
});

test("碎片：按 401→403→133→411 取第一个未拥有；数量 1..5；四款全有则不发", () => {
    assert.deepEqual([...SNAKE_FRAGMENT_PRIORITY], [401, 403, 133, 411]);
    const ok = stats({ activeTicks: 600, score: 1, meaningfulInputCount: 3 });

    assert.deepEqual(computeFragmentGrant(ok, "explicitExit", [1]), { skinId: 401, amount: 1 });
    assert.deepEqual(computeFragmentGrant(ok, "explicitExit", [1, 401]), { skinId: 403, amount: 1 });
    assert.deepEqual(computeFragmentGrant(ok, "explicitExit", [1, 401, 403]), { skinId: 133, amount: 1 });
    assert.deepEqual(computeFragmentGrant(ok, "explicitExit", [1, 401, 403, 133]), { skinId: 411, amount: 1 });
    assert.deepEqual(computeFragmentGrant(ok, "explicitExit", [1, 401, 403, 133, 411]), { skinId: null, amount: 0 });

    // 数量：1 + min(4, min(4,score/1000) + min(4,kills/5))
    assert.equal(computeFragmentGrant(stats({ activeTicks: 600, score: 2000, meaningfulInputCount: 3 }), "explicitExit", [1]).amount, 3);
    assert.equal(computeFragmentGrant(stats({ activeTicks: 600, kills: 10, meaningfulInputCount: 3 }), "explicitExit", [1]).amount, 3);
    assert.equal(computeFragmentGrant(stats({ activeTicks: 600, score: 9e9, kills: 9e9, meaningfulInputCount: 3 }), "explicitExit", [1]).amount, 5, "上界 5");

    // 不合格 run 不发碎片
    assert.deepEqual(computeFragmentGrant(stats({ activeTicks: 10 }), "explicitExit", [1]), { skinId: null, amount: 0 });
    assert.deepEqual(computeFragmentGrant(ok, "moderationKick", [1]), { skinId: null, amount: 0 });
});

test("策略常量是冻结的：⛔ 运行期改参数不生效（改动只能走真源 + fixture）", () => {
    assert.equal(Object.isFrozen(SNAKE_REWARD_POLICY), true);
    assert.equal(Object.isFrozen(SNAKE_REWARD_POLICY.coin), true);
    assert.equal(SNAKE_REWARD_POLICY.version, 1);
});
