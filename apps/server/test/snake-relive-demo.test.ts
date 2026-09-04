import assert from "node:assert/strict";
import { setImmediate as waitImmediate } from "node:timers/promises";
import { test } from "node:test";
import { zoneCtx } from "../src/core/infra/keys";
import { kSnakeUser } from "../src/rooms/modes/snake/keys";
import {
    RedisDemoReliveEconomy,
    type DemoRelivePersistenceRecord,
    type ReliveEconomyInput,
} from "../src/rooms/modes/snake/lifecycle";

const input = (uid: string, clientReqId = "req-1"): ReliveEconomyInput => ({
    uid,
    roomEpochId: "room-epoch",
    runId: "run-1",
    deathSeq: 1,
    clientReqId,
    coinCost: 100,
});

test("Redis demo economy charges one business death once and mirrors its balance", async () => {
    const records: DemoRelivePersistenceRecord[] = [];
    const uid = `demo-once-${Date.now()}`;
    const economy = new RedisDemoReliveEconomy(500, async (record) => { records.push(record); });
    const first = economy.commit(input(uid));
    const replay = economy.commit(input(uid, "another-request-id"));

    assert.deepEqual(replay, first);
    assert.equal(first.kind, "success");
    assert.equal(economy.balance({ uid }), 400);
    await waitImmediate();
    assert.equal(records.length, 1);
    assert.deepEqual(records[0], { uid, coinBalance: 400 });
});

test("Redis demo mirror failure is reported but does not roll back gameplay", async () => {
    const failures: unknown[] = [];
    const uid = `demo-failure-${Date.now()}`;
    const economy = new RedisDemoReliveEconomy(
        100,
        async () => { throw new Error("redis unavailable"); },
        (error) => { failures.push(error); },
    );

    const result = economy.commit(input(uid));
    assert.equal(result.kind, "success");
    assert.equal(economy.balance({ uid }), 0);
    await waitImmediate();
    assert.equal(failures.length, 1);
});

test("Redis demo balance is shared by mode-local economy instances", () => {
    const uid = `demo-shared-${Date.now()}`;
    const firstRoom = new RedisDemoReliveEconomy(250, async () => undefined);
    const secondRoom = new RedisDemoReliveEconomy(250, async () => undefined);
    assert.equal(firstRoom.commit(input(uid)).kind, "success");
    assert.equal(secondRoom.balance({ uid }), 150);
});

// Snake 钱包刻意是跨区共享的单份余额（rooms/modes/snake/keys.ts 显式选 zone: "global"）。
// 把它改成 "per-zone" 是语义变更而非重构，本用例就是那条变更的红灯。
test("Snake demo Redis key is global: no zone prefix and identical across sId", () => {
    const uid = `demo-key-${Date.now()}`;
    const globalKey = kSnakeUser(uid);
    const zonedKey = zoneCtx.run({ sId: 3 }, () => kSnakeUser(uid));
    assert.equal(zonedKey, globalKey);
    assert.equal(globalKey.endsWith(`gp:snake:user:{${uid}}`), true);
    // 区前缀是 `<PROJECT_ID>_s{sId}_`，紧贴逻辑键名之前；global 键任何 sId 下都不得出现它。
    assert.doesNotMatch(globalKey, /_s\d+_gp:snake:/u);
    assert.doesNotMatch(zonedKey, /_s\d+_gp:snake:/u);
});
