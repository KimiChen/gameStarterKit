import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { zoneCtx } from "../../src/core/infra/keys";
import { kSnakeUser } from "../../src/rooms/modes/snake/keys";
import { clientFor, closeRedis } from "../../src/core/infra/redisRoute";
import { RedisDemoReliveEconomy } from "../../src/rooms/modes/snake/lifecycle";
import { assertRedisUp, sleep, testUid } from "./helpers";

after(async () => { await closeRedis(); });

test("Snake demo successful relive mirrors only its balance to durable Redis", async () => {
    await assertRedisUp();
    const uid = testUid("snake-relive-mirror");
    const key = kSnakeUser(uid);
    assert.equal(zoneCtx.run({ sId: 3 }, () => kSnakeUser(uid)), key);
    const redis = clientFor(uid);
    await redis.unlink(key);
    try {
        const economy = new RedisDemoReliveEconomy(500);
        const result = economy.commit({
            uid,
            roomEpochId: "demo-epoch",
            runId: "demo-run",
            deathSeq: 1,
            clientReqId: "demo-request",
            coinCost: 100,
        });
        assert.equal(result.kind, "success");
        if (result.kind !== "success") return;

        const deadline = Date.now() + 3_000;
        let balance: string | null = null;
        while (Date.now() < deadline) {
            balance = await redis.hget(key, "coinBalance");
            if (balance !== null) break;
            await sleep(20);
        }
        assert.equal(balance, "400");
        assert.deepEqual(await redis.hkeys(key), ["coinBalance"]);
    } finally {
        await redis.unlink(key);
    }
});
