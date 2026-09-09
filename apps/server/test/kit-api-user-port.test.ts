import assert from "node:assert/strict";
import { test } from "node:test";
import { withKitUserFence, readKitUserFieldInZone, retryKitTransaction } from "../src/core/infra/kitApi";
import { currentZoneId, zoneCtx } from "../src/core/infra/keys";

test("kit user fence: explicit zone survives awaits, only frozen fence crosses the facade", async () => {
    const result = await zoneCtx.run({ sId: 3 }, async () => {
        const result = await withKitUserFence("kit-test", 7, async (port) => {
            await Promise.resolve();
            assert.equal(currentZoneId(), 7);
            assert.deepEqual(Object.keys(port), ["fence"]);
            assert.equal(Object.isFrozen(port), true);
            return port.fence;
        }, { withUser: async (uid, fn) => {
            assert.equal(uid, "kit-test");
            assert.equal(currentZoneId(), 7);
            return fn({ fence: 42, unrelated: "not exposed" } as { fence: number });
        } });
        assert.equal(currentZoneId(), 3);
        return result;
    });
    assert.equal(result, 42);
    assert.throws(() => withKitUserFence("kit-test", -1, async () => 0));
});
test("kit field read: explicit per-zone key; catalog enforcement retained", async () => {
    const keys: string[] = [];
    const deps = { userKeysOf: () => ["stats"], hget: async (_uid: string, key: string) => { keys.push(key); return "2"; } };
    assert.equal(await readKitUserFieldInZone("slg", "stats", "u", "trophies", 1, deps), "2");
    await readKitUserFieldInZone("slg", "stats", "u", "trophies", 2, deps);
    assert.notEqual(keys[0], keys[1]);
    await assert.rejects(readKitUserFieldInZone("slg", "unknown", "u", "trophies", 1, deps));
});
test("kit contention: retries rolled-back MySQL contention only, never business failure", async () => {
    let calls = 0;
    assert.equal(await retryKitTransaction(async () => {
        if (++calls < 3) throw { errno: 1213 };
        return "committed";
    }), "committed");
    assert.equal(calls, 3);
    calls = 0;
    await assert.rejects(retryKitTransaction(async () => { calls++; throw new Error("insufficient"); }), /insufficient/);
    assert.equal(calls, 1);
});
