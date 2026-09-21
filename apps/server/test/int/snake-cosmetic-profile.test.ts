/** PS5：真实 Redis 边界；外部连接换装后同一 game 进程再次准入必须重读。 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { clientFor, closeRedis } from "../../src/core/infra/redisRoute";
import { kSnakeUser } from "../../src/rooms/modes/snake/keys";
import {
    SNAKE_COSMETIC_FIELDS,
    SNAKE_PROGRESSION_FIELDS,
    __resetSnakeCosmeticProfilesForTest,
    fullSnapshotOf,
    SNAKE_ACHIEVEMENT_KEYS,
    persistSnakeCosmeticOperation,
} from "../../src/rooms/modes/snake/cosmeticProfile";
import { snakeCosmeticStore } from "../../src/rooms/modes/snake/cosmeticRpc";
import { __resetDemoCoinsForTest, resolveProfilePreheat, persistSnakeReliveDebit, RedisDemoReliveEconomy } from "../../src/rooms/modes/snake/lifecycle";
import { applyRunRewards, __resetRunRewardsForTest, persistSnakeRunReward } from "../../src/rooms/modes/snake/runRewards";
import { drainSnakeProfileWrites, mergeStoredSnakeFields } from "../../src/rooms/modes/snake/profilePersistence";
import { SNAKE_FRAGMENT_SKIN_THRESHOLDS } from "../../src/rooms/modes/snake/skinBusinessCatalog";
import { assertRedisUp, testUid } from "./helpers";

after(async () => { await closeRedis(); });

test("PS5：真实准入预热重新读取外部连接的换装，合体换装与热档其余字段保持一致", async () => {
    await assertRedisUp();
    __resetSnakeCosmeticProfilesForTest();
    __resetDemoCoinsForTest();
    const uid = testUid("snake-ps5-profile");
    const key = kSnakeUser(uid);
    const redis = clientFor(uid);
    const lobby = redis.duplicate();
    const preheat = resolveProfilePreheat(undefined, "development");
    const fields = [...SNAKE_COSMETIC_FIELDS, ...SNAKE_PROGRESSION_FIELDS, "coinBalance"];
    try {
        await lobby.hset(key,
            "equippedSkinId", "401", "ownedSkinIds", "[1,2,401]",
            "fragmentBalances", '{"133":0,"401":7,"403":0,"411":0}',
            "snakeXp", "240", "coinBalance", "777");
        await preheat(uid);
        assert.equal(fullSnapshotOf(uid).equippedSkinId, 401);

        await lobby.hset(key, "equippedSkinId", "2");
        const expected = await lobby.hmget(key, ...fields);
        assert.equal(fullSnapshotOf(uid).equippedSkinId, 401, "外部持久档更新不会自动改变 game 内存");
        await preheat(uid);
        assert.equal(fullSnapshotOf(uid).equippedSkinId, 2);
        assert.equal(fullSnapshotOf(uid).xp, 240);
        assert.equal(fullSnapshotOf(uid).fragmentBalances["401"], 7);
        assert.deepEqual(await lobby.hmget(key, ...fields), expected, "准入水合不能改写 Redis 热档");

        assert.equal(snakeCosmeticStore.equip(uid, 1).kind, "ok");
        await preheat(uid);
        assert.equal(fullSnapshotOf(uid).equippedSkinId, 1, "合体进程 HSET 后的 HMGET 能看到本次换装");
        assert.deepEqual(await redis.hmget(key, ...fields), ["1", ...expected.slice(1)]);
    } finally {
        await redis.unlink(key);
        await lobby.quit();
        __resetSnakeCosmeticProfilesForTest();
        __resetDemoCoinsForTest();
    }
});


test("PS5：game 旧入局档离座结算不得覆盖另一进程已装备 / 已合成的热档", async () => {
    await assertRedisUp();
    __resetSnakeCosmeticProfilesForTest();
    __resetDemoCoinsForTest();
    __resetRunRewardsForTest();
    const uid = testUid("snake-stale-game-reward");
    const redis = clientFor(uid);
    const key = kSnakeUser(uid);
    const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(401)!;
    try {
        await redis.hset(key, "equippedSkinId", "1", "ownedSkinIds", "[1]", "snakeXp", "100", "coinBalance", "777",
            "fragmentBalances", JSON.stringify({ "133": 0, "401": threshold + 7, "403": 0, "411": 0 }));
        await resolveProfilePreheat(undefined, "development")(uid);
        // 使用真实持久化操作模拟独立 lobby；不改 game 内存快照。
        await persistSnakeCosmeticOperation({ uid, kind: "unlock", skinId: 401, fragmentCost: threshold });
        await persistSnakeCosmeticOperation({ uid, kind: "equip", skinId: 401 });
        assert.equal(fullSnapshotOf(uid).equippedSkinId, 1);
        const reward = applyRunRewards({ uid, roomEpochId: "ps5", runId: "stale-run", endReason: "explicitExit",
            stats: { activeTicks: 6000, score: 3000, kills: 6, starCollected: 12, meaningfulInputCount: 20 } });
        await drainSnakeProfileWrites(uid);
        assert.equal(await redis.hget(key, "equippedSkinId"), "401", "离座结算不能拿旧装备1覆盖Lobby的401");
        const owned = JSON.parse((await redis.hget(key, "ownedSkinIds"))!);
        assert.ok(owned.includes(401), "game 旧拥有集不得抹掉Lobby合成皮肤");
        const fragments = JSON.parse((await redis.hget(key, "fragmentBalances"))!);
        assert.equal(fragments["401"], 7 + reward.fragmentAmount, "只能追加本次奖励，不得恢复已扣的门槛碎片");
        assert.equal(Number(await redis.hget(key, "snakeXp")), 100 + reward.xpAmount);
        assert.equal(Number(await redis.hget(key, "coinBalance")), 777 + reward.coinAmount);
        await resolveProfilePreheat(undefined, "development")(uid);
        assert.equal(fullSnapshotOf(uid).equippedSkinId, 401);
        assert.equal(fullSnapshotOf(uid).fragmentBalances["401"], fragments["401"]);
    } finally { await drainSnakeProfileWrites(uid); await redis.unlink(key); }
});

test("PS5：真实Redis合成 / 复活扣费与两笔奖励竞争同一热档，碎片 / XP / 金币不丢增量且拥有集合并", async () => {
    await assertRedisUp();
    const uid = testUid("snake-concurrent-merge");
    const redis = clientFor(uid);
    const key = kSnakeUser(uid);
    const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(401)!;
    const achievementGains = Object.fromEntries(SNAKE_ACHIEVEMENT_KEYS.map((entry) => [entry, 1]));
    try {
        for (const reversed of [false, true]) {
            await redis.hset(key, "equippedSkinId", "1", "ownedSkinIds", "[1]", "snakeXp", "100", "coinBalance", "777",
                "achievementProgress", JSON.stringify(Object.fromEntries(SNAKE_ACHIEVEMENT_KEYS.map((entry) => [entry, 0]))),
                "fragmentBalances", JSON.stringify({ "133": 0, "401": threshold + 7, "403": 0, "411": 0 }));
            const reward = { uid, coinAmount: 11, xpAmount: 13, newlyUnlockedSkinIds: [2],
                fragmentSkinId: 401, fragmentAmount: 3, achievementGains };
            const operations = [
                () => persistSnakeCosmeticOperation({ uid, kind: "unlock", skinId: 401, fragmentCost: threshold }),
                () => persistSnakeRunReward(reward), () => persistSnakeRunReward(reward),
                () => persistSnakeReliveDebit({ uid, coinCost: 7, initialBalance: 777 }),
            ];
            if (reversed) operations.reverse();
            await Promise.all(operations.map((operation) => operation()));
            assert.deepEqual(JSON.parse((await redis.hget(key, "ownedSkinIds"))!), [1, 2, 401]);
            assert.equal(JSON.parse((await redis.hget(key, "fragmentBalances"))!)["401"], 13);
            assert.equal(await redis.hget(key, "snakeXp"), "126");
            assert.equal(await redis.hget(key, "coinBalance"), "792");
            assert.ok(Object.values(JSON.parse((await redis.hget(key, "achievementProgress"))!)).every((value) => value === 2));
            const before = await redis.hmget(key, "ownedSkinIds", "fragmentBalances", "snakeXp", "achievementProgress", "coinBalance");
            await persistSnakeCosmeticOperation({ uid, kind: "equip", skinId: 401 });
            assert.equal(await redis.hget(key, "equippedSkinId"), "401");
            assert.deepEqual(await redis.hmget(key, "ownedSkinIds", "fragmentBalances", "snakeXp", "achievementProgress", "coinBalance"), before,
                "equip只拥有装备字段，不能回写任何旧奖励字段");
            await persistSnakeCosmeticOperation({ uid, kind: "unlock", skinId: 401, fragmentCost: threshold });
            assert.equal(JSON.parse((await redis.hget(key, "fragmentBalances"))!)["401"], 13, "已经合成不能再次扣除");
        }
    } finally { await redis.unlink(key); }
});

test("PS5：字段CAS持续冲突达到有界预算后失败，不能覆盖竞争者的新值", async () => {
    await assertRedisUp();
    const uid = testUid("snake-cas-budget");
    const redis = clientFor(uid);
    const key = kSnakeUser(uid);
    let reads = 0;
    try {
        await redis.hset(key, "snakeXp", "0");
        await assert.rejects(mergeStoredSnakeFields(uid, ["snakeXp"], () => {
            // 同一Redis连接先排竞争写，再排CAS，确定性制造真实比较失败。
            void redis.hset(key, "snakeXp", String(++reads));
            return ["999"];
        }), /retry budget/);
        assert.equal(reads, 8);
        assert.equal(await redis.hget(key, "snakeXp"), "8");
    } finally { await redis.unlink(key); }
});


test("PS5：先奖励新增本地余额再立即复活，镜像必须按因果顺序先加后扣且停服等待两笔", async () => {
    await assertRedisUp();
    __resetSnakeCosmeticProfilesForTest();
    __resetDemoCoinsForTest();
    __resetRunRewardsForTest();
    const uid = testUid("snake-reward-before-debit");
    const redis = clientFor(uid);
    const key = kSnakeUser(uid);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const errors: unknown[] = [];
    try {
        await redis.hset(key, "coinBalance", "0");
        await resolveProfilePreheat(undefined, "development")(uid);
        const result = applyRunRewards({ uid, roomEpochId: "causal", runId: "award", endReason: "explicitExit",
            stats: { activeTicks: 6000, score: 3000, kills: 6, starCollected: 12, meaningfulInputCount: 20 } }, {
            persistence: async (record) => { await gate; await persistSnakeRunReward(record); },
            reportError: (error) => { errors.push(error); },
        });
        assert.ok(result.coinAmount > 0);
        const economy = new RedisDemoReliveEconomy(0, persistSnakeReliveDebit, (error) => { errors.push(error); });
        const debit = economy.commit({ uid, roomEpochId: "causal", runId: "other-room", deathSeq: 1,
            clientReqId: "spend-reward", coinCost: result.coinAmount });
        assert.equal(debit.kind, "success", "同步玩法已看到刚发出的奖励");
        assert.equal(economy.balance({ uid }), 0);
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.deepEqual(errors, [], "奖励尚未落盘时，后排扣费不得抢读旧余额而误判不足");
        release();
        await drainSnakeProfileWrites(uid);
        assert.deepEqual(errors, []);
        assert.equal(await redis.hget(key, "coinBalance"), "0", "Redis最终也应先加本次奖励、再扣同额费用");
    } finally { release(); await drainSnakeProfileWrites(uid); await redis.unlink(key); }
});
