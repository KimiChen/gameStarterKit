/** S4-03 结算：去重、一次同步替换、单条六字段镜像、不合格 run 零奖励。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SnakeRunStats } from "@game/shared/gameplays/snake/progression";
import {
    SnakeDemoCosmeticStore,
    __grantSnakeFragmentsForTest,
    __resetSnakeCosmeticProfilesForTest,
    fullSnapshotOf,
} from "../src/rooms/modes/snake/cosmeticProfile";
import { SNAKE_FRAGMENT_SKIN_THRESHOLDS } from "../src/rooms/modes/snake/skinBusinessCatalog";
import { __resetDemoCoinsForTest, demoCoinBalanceOf } from "../src/rooms/modes/snake/lifecycle";
import {
    __resetRunRewardsForTest,
    applyRunRewards,
    latestRunResultOf,
    processedRunCount,
    type SnakeRewardPersistenceRecord,
} from "../src/rooms/modes/snake/runRewards";

const ZERO: SnakeRunStats = { activeTicks: 0, score: 0, kills: 0, starCollected: 0, meaningfulInputCount: 0 };
const stats = (over: Partial<SnakeRunStats>): SnakeRunStats => ({ ...ZERO, ...over });
/** 合格且能拿到可观奖励的一局。 */
const GOOD = stats({ activeTicks: 6000, score: 3000, kills: 6, starCollected: 12, meaningfulInputCount: 20 });

function harness() {
    __resetSnakeCosmeticProfilesForTest();
    __resetRunRewardsForTest();
    __resetDemoCoinsForTest();
    const writes: SnakeRewardPersistenceRecord[] = [];
    const errors: unknown[] = [];
    return {
        writes,
        errors,
        opts: {
            persistence: async (record: SnakeRewardPersistenceRecord) => { writes.push(record); },
            reportError: (error: unknown) => { errors.push(error); },
        },
    };
}

test("合格 run：金币/XP/碎片同步落进程内 profile，并只写一条六字段镜像", () => {
    const h = harness();
    const before = demoCoinBalanceOf("u1");
    const result = applyRunRewards(
        { uid: "u1", roomEpochId: "e1", runId: "r1", endReason: "explicitExit", stats: GOOD }, h.opts);

    assert.equal(result.qualified, true);
    assert.ok(result.coinAmount > 0 && result.xpAmount > 0);
    assert.equal(result.coinBalanceAfter, before + result.coinAmount);
    assert.equal(demoCoinBalanceOf("u1"), before + result.coinAmount);

    const profile = fullSnapshotOf("u1");
    assert.equal(profile.xp, result.xpAmount);
    assert.equal(result.xpAfter, profile.xp);
    // 碎片按优先级落到 401（未拥有的第一个）。
    assert.equal(result.fragmentSkinId, 401);
    assert.equal(profile.fragmentBalances["401"], result.fragmentAmount);

    assert.equal(h.writes.length, 1, "⛔ 一次终局只写一条");
    assert.deepEqual(Object.keys(h.writes[0]).sort(),
        ["achievementProgress", "coinBalance", "equippedSkinId", "fragmentBalances", "ownedSkinIds", "snakeXp", "uid"]);
    assert.equal(h.writes[0].coinBalance, result.coinBalanceAfter, "同一条写里带上钱包，⛔ 不再各写各的");
    assert.equal(h.writes[0].snakeXp, profile.xp);
});

test("同一 uid+roomEpochId+runId 重复终局只奖一次，返回缓存结果且不重复写", () => {
    const h = harness();
    const input = { uid: "u1", roomEpochId: "e1", runId: "r1", endReason: "explicitExit", stats: GOOD };
    const first = applyRunRewards(input, h.opts);
    const second = applyRunRewards(input, h.opts);
    assert.equal(second, first, "⛔ 必须是同一个缓存对象");
    assert.equal(h.writes.length, 1, "重复终局 ⛔ 不重复写 Redis");
    assert.equal(demoCoinBalanceOf("u1"), first.coinBalanceAfter, "⛔ 不二次加币");
    assert.equal(fullSnapshotOf("u1").xp, first.xpAmount, "⛔ 不二次加 XP");
    assert.equal(processedRunCount(), 1);
});

test("换 runId 或换 roomEpochId 都算新 run，各自发一次", () => {
    const h = harness();
    const base = { uid: "u1", endReason: "explicitExit", stats: GOOD };
    const a = applyRunRewards({ ...base, roomEpochId: "e1", runId: "r1" }, h.opts);
    const b = applyRunRewards({ ...base, roomEpochId: "e1", runId: "r2" }, h.opts);
    const c = applyRunRewards({ ...base, roomEpochId: "e2", runId: "r1" }, h.opts);
    assert.equal(processedRunCount(), 3);
    assert.equal(h.writes.length, 3);
    assert.equal(fullSnapshotOf("u1").xp, a.xpAmount + b.xpAmount + c.xpAmount);
});

test("不合格 run：全部奖励为 0，成就进度不累计，但仍写一条镜像并可查最近结果", () => {
    const h = harness();
    const result = applyRunRewards(
        { uid: "u2", roomEpochId: "e1", runId: "r1", endReason: "explicitExit", stats: stats({ activeTicks: 100 }) },
        h.opts);
    assert.equal(result.qualified, false);
    assert.equal(result.coinAmount, 0);
    assert.equal(result.xpAmount, 0);
    assert.equal(result.fragmentSkinId, null);
    assert.equal(result.fragmentAmount, 0);
    assert.ok(Object.values(result.achievementProgressAfter).every((v) => v === 0), "不合格 run ⛔ 不累计成就");
    assert.equal(latestRunResultOf("u2"), result);
});

test("moderationKick ⛔ 不发奖", () => {
    const h = harness();
    const result = applyRunRewards(
        { uid: "u3", roomEpochId: "e1", runId: "r1", endReason: "moderationKick", stats: GOOD }, h.opts);
    assert.equal(result.qualified, false);
    assert.equal(result.coinAmount, 0);
    assert.equal(result.xpAmount, 0);
});

test("等级与成就解锁：跨门槛时把皮肤加进拥有集合，⛔ 已拥有不重复解锁", () => {
    const h = harness();
    // 一局打满 XP：连续多局累计到 2 级（阈值 100）。
    let last = applyRunRewards(
        { uid: "u4", roomEpochId: "e1", runId: "r1", endReason: "explicitExit", stats: GOOD }, h.opts);
    let round = 2;
    while (last.levelAfter < 2 && round < 12) {
        last = applyRunRewards(
            { uid: "u4", roomEpochId: "e1", runId: `r${round}`, endReason: "explicitExit", stats: GOOD }, h.opts);
        round += 1;
    }
    assert.ok(last.levelAfter >= 2, "多局累计后应升到 2 级");
    assert.ok(fullSnapshotOf("u4").ownedSkinIds.includes(2), "2 级解锁皮肤 2");

    // 再来一局不应重复把皮肤 2 列进 newlyUnlocked。
    const next = applyRunRewards(
        { uid: "u4", roomEpochId: "e1", runId: `r${round}`, endReason: "explicitExit", stats: GOOD }, h.opts);
    assert.equal(next.newlyUnlockedSkinIds.includes(2), false, "⛔ 已拥有不重复解锁");
});

test("成就达标解锁：kills 累计到 100 解锁皮肤 101", () => {
    const h = harness();
    const killer = stats({ activeTicks: 6000, kills: 60, meaningfulInputCount: 5 });
    applyRunRewards({ uid: "u5", roomEpochId: "e1", runId: "r1", endReason: "explicitExit", stats: killer }, h.opts);
    assert.equal(fullSnapshotOf("u5").ownedSkinIds.includes(101), false, "60 < 100 还不解锁");
    const second = applyRunRewards(
        { uid: "u5", roomEpochId: "e1", runId: "r2", endReason: "explicitExit", stats: killer }, h.opts);
    assert.equal(second.achievementProgressAfter["101"], 100, "进度在门槛处饱和");
    assert.ok(second.newlyUnlockedSkinIds.includes(101));
    assert.ok(fullSnapshotOf("u5").ownedSkinIds.includes(101));
});

test("碎片：四款全拥有时本局碎片为 0（⚠ 真的先全拥有，不是靠不合格 run 蒙混）", () => {
    const h = harness();
    const store = new SnakeDemoCosmeticStore({ persistence: async () => {}, hydration: async () => [null, null, null] });
    for (const skinId of [401, 403, 133, 411]) {
        __grantSnakeFragmentsForTest("u6", skinId, SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(skinId)!);
        assert.equal(store.unlock("u6", skinId).kind, "ok");
    }
    const owned = fullSnapshotOf("u6").ownedSkinIds;
    for (const skinId of [401, 403, 133, 411]) assert.ok(owned.includes(skinId), `前置：应已拥有 ${skinId}`);

    // 合格 run，但四款碎片皮肤都已拥有 ⇒ 本局碎片为 0。
    const result = applyRunRewards(
        { uid: "u6", roomEpochId: "e1", runId: "r1", endReason: "explicitExit", stats: GOOD }, h.opts);
    assert.equal(result.qualified, true, "必须是合格 run，否则测的是另一条分支");
    assert.equal(result.fragmentSkinId, null);
    assert.equal(result.fragmentAmount, 0);
});

test("Redis 镜像写失败只告警，已返回的奖励结果不回滚", async () => {
    __resetSnakeCosmeticProfilesForTest();
    __resetRunRewardsForTest();
    __resetDemoCoinsForTest();
    const errors: unknown[] = [];
    const result = applyRunRewards(
        { uid: "u7", roomEpochId: "e1", runId: "r1", endReason: "explicitExit", stats: GOOD },
        {
            persistence: async () => { throw new Error("redis down"); },
            reportError: (error) => { errors.push(error); },
        });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(errors.length, 1);
    assert.ok(result.coinAmount > 0);
    assert.equal(demoCoinBalanceOf("u7"), result.coinBalanceAfter, "写失败 ⛔ 不撤销已发奖励");
    assert.equal(fullSnapshotOf("u7").xp, result.xpAmount);
});
