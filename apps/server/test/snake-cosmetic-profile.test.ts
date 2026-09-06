import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SNAKE_COSMETIC_FIELDS,
    SnakeDemoCosmeticStore,
    __forceEquippedSkinIdForTest,
    __grantSnakeFragmentsForTest,
    __resetSnakeCosmeticProfilesForTest,
    equippedSkinIdOf,
    isProfileHydrated,
    type SnakeCosmeticPersistenceRecord,
} from "../src/rooms/modes/snake/cosmeticProfile";
import { DEFAULT_SNAKE_RUN_SKIN_RESOLVER } from "../src/rooms/modes/snake/lifecycle";
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
    assert.equal(isProfileHydrated("u1"), false, "读不到 Redis ⛔ 不算已回灌——否则结算会把默认档写回去");
});

/**
 * F13 的两条根因之一：旧实现在 await **之前**就把 uid 记进「已回灌」，于是
 * ① 并发的第二个调用者立刻拿到尚未回灌的默认档（所以「入房时 fire-and-forget 预热」不成立）；
 * ② 一次 Redis 抖动就让该 uid 在整个进程生命周期里永远停在默认档。
 */
test("F13：同一 uid 的并发回灌共用一次请求，且两个调用者都拿到回灌后的值", async () => {
    __resetSnakeCosmeticProfilesForTest();
    let calls = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const store = new SnakeDemoCosmeticStore({
        persistence: async () => {},
        hydration: async () => {
            calls += 1;
            await gate;
            return ["401", "[1,401]", '{"133":0,"401":7,"403":0,"411":0}'];
        },
    });
    const first = store.hydrate("u1");
    const second = store.hydrate("u1");
    assert.equal(isProfileHydrated("u1"), false, "在途期间 ⛔ 不得先把标记打上");
    release!();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(calls, 1, "并发只打一次 Redis");
    assert.deepEqual(a.ownedSkinIds, [1, 401]);
    assert.deepEqual(b.ownedSkinIds, [1, 401], "第二个调用者 ⛔ 不许拿到尚未回灌的默认档");
    assert.equal(isProfileHydrated("u1"), true);
});

test("F13：回灌失败不毒化——下一次调用会重试，成功后才算已回灌", async () => {
    __resetSnakeCosmeticProfilesForTest();
    let calls = 0;
    const errors: unknown[] = [];
    const store = new SnakeDemoCosmeticStore({
        persistence: async () => {},
        reportError: (error) => { errors.push(error); },
        hydration: async () => {
            calls += 1;
            if (calls === 1) throw new Error("redis down");
            return ["401", "[1,401]", null];
        },
    });
    assert.deepEqual((await store.hydrate("u1")).ownedSkinIds, [1], "第一次失败：保持默认档");
    assert.equal(isProfileHydrated("u1"), false);
    assert.deepEqual((await store.hydrate("u1")).ownedSkinIds, [1, 401], "第二次必须真的重试");
    assert.equal(calls, 2);
    assert.equal(isProfileHydrated("u1"), true);
    assert.equal(errors.length, 1);
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

test("equippedSkinIdOf：uid 缺失 / 未预热 / 装备值失效都回退默认皮肤 1", () => {
    const h = harness();
    assert.equal(equippedSkinIdOf(null), 1, "未认证 fixture 回退默认皮肤");
    assert.equal(equippedSkinIdOf("never-hydrated"), 1, "未预热 uid 回退默认皮肤");

    const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(133)!;
    __grantSnakeFragmentsForTest("u1", 133, threshold);
    h.store.unlock("u1", 133);
    h.store.equip("u1", 133);
    assert.equal(equippedSkinIdOf("u1"), 133, "已预热则读装备值");

    // 防御性复核：直接把内部装备值改成未拥有的皮肤（模拟目录在两次发布之间漂移）。
    const leaked = h.store.getSnapshot("u1");
    assert.equal(leaked.ownedSkinIds.includes(701), false);
    __forceEquippedSkinIdForTest("u1", 701);
    assert.equal(equippedSkinIdOf("u1"), 1, "装备了未拥有的皮肤 → 回退，⛔ 不得把它带进战斗");

    __forceEquippedSkinIdForTest("u1", 99999);
    assert.equal(equippedSkinIdOf("u1"), 1, "目录里不存在的皮肤 → 回退");
});

test("DEFAULT_SNAKE_RUN_SKIN_RESOLVER 是同步的，且只认服务端传入的 uid", () => {
    const h = harness();
    const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(403)!;
    __grantSnakeFragmentsForTest("u9", 403, threshold);
    h.store.unlock("u9", 403);
    h.store.equip("u9", 403);
    const resolved = DEFAULT_SNAKE_RUN_SKIN_RESOLVER.resolve({ roomEpochId: "e1", sessionId: "s1", uid: "u9" });
    assert.equal(resolved, 403);
    assert.equal(typeof resolved, "number", "⛔ 必须同步返回：createPlayer 不能 await");
    assert.equal(DEFAULT_SNAKE_RUN_SKIN_RESOLVER.resolve({ roomEpochId: "e1", sessionId: "s1", uid: null }), 1);
});
