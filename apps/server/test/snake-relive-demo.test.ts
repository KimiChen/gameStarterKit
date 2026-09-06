import assert from "node:assert/strict";
import { setImmediate as waitImmediate } from "node:timers/promises";
import { test } from "node:test";
import { zoneCtx } from "../src/core/infra/keys";
import { kSnakeUser } from "../src/rooms/modes/snake/keys";
import {
    RedisDemoReliveEconomy,
    SNAKE_DEMO_INITIAL_COINS,
    __resetDemoCoinsForTest,
    demoCoinBalanceOf,
    hydrateDemoCoinBalance,
    isDemoCoinBalanceHydrated,
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

/**
 * F13 的同族写回：结算那条六字段 HSET 里带着 `coinBalance`，而 demo 钱包此前**从不**从 Redis 回灌，
 * 于是每局结算都把「初始余额 + 本局所得」写回去——回访玩家的余额被重置。
 * （复现里没显形只是因为种子档的余额恰好就是初始值 10000。）
 */
test("F13：demo 钱包入房前从 Redis 回灌，回灌前 ⛔ 不可信", async () => {
    __resetDemoCoinsForTest();
    assert.equal(isDemoCoinBalanceHydrated("u-coin"), false);
    assert.equal(demoCoinBalanceOf("u-coin"), SNAKE_DEMO_INITIAL_COINS, "未回灌时读到的是默认初始余额");
    await hydrateDemoCoinBalance("u-coin", { hydration: async () => "37" });
    assert.equal(isDemoCoinBalanceHydrated("u-coin"), true);
    assert.equal(demoCoinBalanceOf("u-coin"), 37, "回灌后读到的是 Redis 里的真实余额");
});

test("F13：钱包回灌——键不存在算成功（新玩家用初始余额），Redis 报错则不可信且可重试", async () => {
    __resetDemoCoinsForTest();
    await hydrateDemoCoinBalance("u-new", { hydration: async () => null });
    assert.equal(isDemoCoinBalanceHydrated("u-new"), true, "键不存在是事实，不是故障");
    assert.equal(demoCoinBalanceOf("u-new"), SNAKE_DEMO_INITIAL_COINS);

    let calls = 0;
    const errors: unknown[] = [];
    const flaky = async (): Promise<string | null> => {
        calls += 1;
        if (calls === 1) throw new Error("redis down");
        return "1234";
    };
    await hydrateDemoCoinBalance("u-flaky", { hydration: flaky, reportError: (error) => { errors.push(error); } });
    assert.equal(isDemoCoinBalanceHydrated("u-flaky"), false, "报错 ⛔ 不算已回灌");
    assert.equal(demoCoinBalanceOf("u-flaky"), SNAKE_DEMO_INITIAL_COINS);
    await hydrateDemoCoinBalance("u-flaky", { hydration: flaky });
    assert.equal(calls, 2, "下一次必须真的重试");
    assert.equal(isDemoCoinBalanceHydrated("u-flaky"), true);
    assert.equal(demoCoinBalanceOf("u-flaky"), 1234);
    assert.equal(errors.length, 1);
});

test("F13：钱包并发回灌共用一次请求，两个调用者都等到回灌后的值", async () => {
    __resetDemoCoinsForTest();
    let calls = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const hydration = async (): Promise<string | null> => { calls += 1; await gate; return "88"; };
    const first = hydrateDemoCoinBalance("u-par", { hydration });
    const second = hydrateDemoCoinBalance("u-par", { hydration });
    assert.equal(isDemoCoinBalanceHydrated("u-par"), false, "在途期间 ⛔ 不得先把标记打上");
    release!();
    await Promise.all([first, second]);
    assert.equal(calls, 1);
    assert.equal(demoCoinBalanceOf("u-par"), 88);
});
