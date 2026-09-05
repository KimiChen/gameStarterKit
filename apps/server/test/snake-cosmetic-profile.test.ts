import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SNAKE_COSMETIC_FIELDS,
    SnakeDemoCosmeticStore,
    __grantSnakeFragmentsForTest,
    __resetSnakeCosmeticProfilesForTest,
    type SnakeCosmeticPersistenceRecord,
} from "../src/rooms/modes/snake/cosmeticProfile";
import { SNAKE_FRAGMENT_SKIN_IDS, SNAKE_FRAGMENT_SKIN_THRESHOLDS } from "../src/rooms/modes/snake/skinBusinessCatalog";

/** 不碰真 Redis：记录每次镜像写入，并可注入回灌值与失败。 */
function harness(options: { hydrate?: readonly (string | null)[]; hydrateError?: Error } = {}) {
    __resetSnakeCosmeticProfilesForTest();
    const writes: SnakeCosmeticPersistenceRecord[] = [];
    const corrupt: string[] = [];
    const errors: unknown[] = [];
    const store = new SnakeDemoCosmeticStore({
        persistence: async (record) => { writes.push(record); },
        hydration: async () => {
            if (options.hydrateError) throw options.hydrateError;
            return options.hydrate ?? [null, null, null];
        },
        reportError: (error) => { errors.push(error); },
        reportCorrupt: (_uid, field) => { corrupt.push(field); },
    });
    return { store, writes, corrupt, errors };
}

test("新 uid 拿到默认 profile：装备皮肤 1、只拥有皮肤 1、四项碎片为 0", () => {
    const { store } = harness();
    const profile = store.getSnapshot("u1");
    assert.equal(profile.version, 0);
    assert.equal(profile.equippedSkinId, 1);
    assert.deepEqual(profile.ownedSkinIds, [1]);
    assert.deepEqual(Object.keys(profile.fragmentBalances).sort(), SNAKE_FRAGMENT_SKIN_IDS.map(String).sort());
    assert.ok(Object.values(profile.fragmentBalances).every((value) => value === 0));
});

test("返回的是深拷贝：改动快照不回流到模块内状态", () => {
    const { store } = harness();
    const first = store.getSnapshot("u1") as unknown as { ownedSkinIds: number[]; fragmentBalances: Record<string, number> };
    first.ownedSkinIds.push(999);
    first.fragmentBalances["401"] = 12345;
    const second = store.getSnapshot("u1");
    assert.deepEqual(second.ownedSkinIds, [1], "⛔ 模块内可变对象不得被调用方改写");
    assert.equal(second.fragmentBalances["401"], 0);
});

test("回灌走白名单 HMGET 的三个 field，且顺序固定", () => {
    assert.deepEqual([...SNAKE_COSMETIC_FIELDS], ["equippedSkinId", "ownedSkinIds", "fragmentBalances"]);
});

test("回灌：合法值进内存；只回灌一次，后续读走进程内值", async () => {
    let calls = 0;
    __resetSnakeCosmeticProfilesForTest();
    const store = new SnakeDemoCosmeticStore({
        persistence: async () => {},
        hydration: async () => { calls += 1; return ["401", "[1,401]", '{"133":0,"401":7,"403":0,"411":0}']; },
    });
    const profile = await store.hydrate("u1");
    assert.equal(profile.equippedSkinId, 401);
    assert.deepEqual(profile.ownedSkinIds, [1, 401]);
    assert.equal(profile.fragmentBalances["401"], 7);
    await store.hydrate("u1");
    assert.equal(calls, 1, "同一 uid 只打一次 Redis");
});

test("回灌：坏 JSON / 越权皮肤 / 未拥有的装备值都告警并退回默认，⛔ 坏值不进玩法", async () => {
    {   // ownedSkinIds 不是合法 JSON
        const h = harness({ hydrate: [null, "{not json", null] });
        const profile = await h.store.hydrate("u1");
        assert.deepEqual(profile.ownedSkinIds, [1]);
        assert.deepEqual(h.corrupt, ["ownedSkinIds"]);
    }
    {   // ownedSkinIds 含目录里不存在的皮肤
        const h = harness({ hydrate: [null, "[1,99999]", null] });
        const profile = await h.store.hydrate("u2");
        assert.deepEqual(profile.ownedSkinIds, [1]);
        assert.deepEqual(h.corrupt, ["ownedSkinIds"]);
    }
    {   // fragmentBalances 键集合不对
        const h = harness({ hydrate: [null, null, '{"133":1}'] });
        const profile = await h.store.hydrate("u3");
        assert.ok(Object.values(profile.fragmentBalances).every((v) => v === 0));
        assert.deepEqual(h.corrupt, ["fragmentBalances"]);
    }
    {   // fragmentBalances 负数
        const h = harness({ hydrate: [null, null, '{"133":0,"401":-1,"403":0,"411":0}'] });
        await h.store.hydrate("u4");
        assert.deepEqual(h.corrupt, ["fragmentBalances"]);
    }
    {   // equippedSkinId 指向未拥有的皮肤 → 回退默认皮肤 1
        const h = harness({ hydrate: ["401", "[1]", null] });
        const profile = await h.store.hydrate("u5");
        assert.equal(profile.equippedSkinId, 1);
        assert.deepEqual(h.corrupt, ["equippedSkinId"]);
    }
});

test("回灌：Redis 抛错只告警，profile 保持默认且不阻塞", async () => {
    const h = harness({ hydrateError: new Error("redis down") });
    const profile = await h.store.hydrate("u1");
    assert.equal(profile.equippedSkinId, 1);
    assert.equal(h.errors.length, 1);
});

test("equip：未拥有拒绝、非法 ID 拒绝、重复装备是 no-op 且不写 Redis", () => {
    const h = harness();
    assert.deepEqual(h.store.equip("u1", 99999), { kind: "unknownSkin" });
    assert.deepEqual(h.store.equip("u1", 401), { kind: "notOwned" });
    assert.equal(h.writes.length, 0, "失败路径 ⛔ 不得写 Redis");

    const again = h.store.equip("u1", 1);
    assert.equal(again.kind, "ok");
    assert.equal(h.store.getSnapshot("u1").version, 0, "重复装备同一皮肤不涨 version");
    assert.equal(h.writes.length, 0, "no-op ⛔ 不写 Redis");
});

test("unlock：非碎片皮肤拒绝、碎片不足拒绝且不扣，达标时精确扣门槛并保留超额", () => {
    const h = harness();
    assert.deepEqual(h.store.unlock("u1", 2), { kind: "notCraftable" });

    const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(401)!;
    assert.deepEqual(h.store.unlock("u1", 401), { kind: "insufficientFragments", required: threshold, balance: 0 });
    assert.equal(h.writes.length, 0);
    assert.deepEqual(h.store.getSnapshot("u1").ownedSkinIds, [1], "失败后 profile 不变");

    __grantSnakeFragmentsForTest("u1", 401, threshold + 3);
    const ok = h.store.unlock("u1", 401);
    assert.equal(ok.kind, "ok");
    const profile = h.store.getSnapshot("u1");
    assert.deepEqual(profile.ownedSkinIds, [1, 401], "拥有集合升序");
    assert.equal(profile.fragmentBalances["401"], 3, "精确扣门槛，超额保留");
    assert.equal(profile.version, 1);
    assert.equal(h.writes.length, 1);
});

test("unlock：已拥有再次解锁直接返回快照，⛔ 不二次扣碎片", () => {
    const h = harness();
    const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(133)!;
    __grantSnakeFragmentsForTest("u1", 133, threshold * 2);
    assert.equal(h.store.unlock("u1", 133).kind, "ok");
    const afterFirst = h.store.getSnapshot("u1");
    assert.equal(h.store.unlock("u1", 133).kind, "ok");
    const afterSecond = h.store.getSnapshot("u1");
    assert.equal(afterSecond.fragmentBalances["133"], afterFirst.fragmentBalances["133"], "⛔ 不得二次扣除");
    assert.equal(afterSecond.version, afterFirst.version, "no-op 不涨 version");
    assert.equal(h.writes.length, 1, "只有第一次真实变化写 Redis");
});

test("镜像只写三个 cosmetic field，⛔ 不含 coinBalance", () => {
    const h = harness();
    const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(403)!;
    __grantSnakeFragmentsForTest("u1", 403, threshold);
    h.store.unlock("u1", 403);
    assert.equal(h.writes.length, 1);
    assert.deepEqual(Object.keys(h.writes[0]).sort(), ["equippedSkinId", "fragmentBalances", "ownedSkinIds", "uid"]);
    assert.equal("coinBalance" in h.writes[0], false);
});

test("Redis 镜像写失败只告警，已返回的 demo 结果不回滚", async () => {
    __resetSnakeCosmeticProfilesForTest();
    const errors: unknown[] = [];
    const store = new SnakeDemoCosmeticStore({
        persistence: async () => { throw new Error("redis write failed"); },
        hydration: async () => [null, null, null],
        reportError: (error) => { errors.push(error); },
    });
    const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(411)!;
    __grantSnakeFragmentsForTest("u1", 411, threshold);
    const result = store.unlock("u1", 411);
    assert.equal(result.kind, "ok");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(errors.length, 1);
    assert.deepEqual(store.getSnapshot("u1").ownedSkinIds, [1, 411], "写失败不撤销内存变更");
});

test("同一进程内不同房间共享同一 uid 的 profile", () => {
    const h = harness();
    const other = new SnakeDemoCosmeticStore({ persistence: async () => {}, hydration: async () => [null, null, null] });
    const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(401)!;
    __grantSnakeFragmentsForTest("u1", 401, threshold);
    h.store.unlock("u1", 401);
    assert.deepEqual(other.getSnapshot("u1").ownedSkinIds, [1, 401]);
});
