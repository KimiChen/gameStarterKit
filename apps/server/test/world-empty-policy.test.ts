/**
 * MMO MF4-B6 空实例三策略（docs/MMO.md §4.5 空实例策略表；MF1 冻结）在 WorldRoom 壳上各一例（假时钟、manualTick）：
 *  - sleep（缺省）：最后一人离开 emptyAfterMs 后停固定步、保留租约并继续续租；有人准入即续跑，⛔ 不重放（tick 不跳）；
 *  - run：空实例照常推进，周期检查点照写；
 *  - unload：emptyAfterMs 后强制检查点 → Draining → Offline，释放租约、state offline、dispose；未到 emptyAfterMs 不 unload。
 * 变异验证：WorldRuntime.evaluateEmpty 删 `now - emptySince < emptyAfterMs` 判断（emptyAfterMs 被忽略）→ 「未到 emptyAfterMs 不 unload」转红；
 * sleep 分支不置 sleeping → 「休眠零步」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import { WorldPhase } from "@game/shared";
import { fakeClient, harness, join, joinOptions } from "./world-room.test";

const P_ALICE = "p_alice_0000000001";
const P_BOB = "p_bob_00000000001";

async function occupied(world: { emptyPolicy: "sleep" | "run" | "unload"; emptyAfterMs: number; checkpointMs: number }) {
    const h = harness({ world });
    h.control.seedPersona(P_ALICE, "u-alice");
    h.control.seedPersona(P_BOB, "u-bob");
    await h.room.onCreate(joinOptions());
    const alice = fakeClient("sa", P_ALICE, "u-alice");
    await join(h.room, alice);
    assert.equal(h.room.advance(100), 2);
    await h.room.onLeave(alice as never, CloseCode.CONSENTED);
    assert.equal(h.room.seatedCount, 0);
    return { ...h, alice };
}

test("sleep：最后一人离开 emptyAfterMs 后停固定步（租约保留续租）；准入唤醒且 ⛔ 不重放", async () => {
    const h = await occupied({ emptyPolicy: "sleep", emptyAfterMs: 1_000, checkpointMs: 100_000 });
    h.clock.now += 999;
    assert.equal(h.room.advance(100), 2, "未到 emptyAfterMs 照常推进");
    assert.equal(h.room.isSleeping, false);
    h.clock.now += 1;
    h.room.advance(100); // 本次推进后判定空实例 ⇒ 休眠
    assert.equal(h.room.isSleeping, true);
    const tickAtSleep = h.room.worldTick;
    assert.equal(h.room.advance(100), 0, "休眠零步");
    h.clock.now += 60_000;
    assert.equal(h.room.advance(100_000), 0, "休眠期间时间流逝也不推进");
    assert.equal(h.room.worldTick, tickAtSleep);
    assert.equal(h.room.phase, WorldPhase.Active, "休眠仍是 Active（不是 Draining）");
    assert.equal(h.leases.held.get("wi_m1_0")?.released, false, "租约保留");
    assert.equal(h.leases.held.get("wi_m1_0")?.stopped, false, "续租循环未停");
    const bob = fakeClient("sb", P_BOB, "u-bob");
    await join(h.room, bob);
    assert.equal(h.room.isSleeping, false, "准入唤醒");
    assert.equal(h.room.advance(100), 2, "续跑");
    assert.equal(h.room.worldTick, tickAtSleep + 2, "⛔ 不重放（休眠期间的时间不补步）");
});

test("run：空实例照常推进，周期检查点照写", async () => {
    const h = await occupied({ emptyPolicy: "run", emptyAfterMs: 100, checkpointMs: 500 });
    h.clock.now += 10_000;
    assert.equal(h.room.advance(100), 2, "空实例照常推进");
    assert.equal(h.room.isSleeping, false);
    assert.equal(h.room.phase, WorldPhase.Active);
    assert.deepEqual(h.checkpoints.map((entry) => entry.reason), ["periodic"], "到节拍即写周期检查点");
    assert.deepEqual(h.checkpoints[0]!.checkpoint.persona, [], "空实例：无 persona 条目");
    h.clock.now += 499;
    h.room.advance(50);
    assert.equal(h.checkpoints.length, 1, "未到节拍不重复写");
    h.clock.now += 1;
    h.room.advance(50);
    assert.equal(h.checkpoints.length, 2);
    assert.equal(h.leases.held.size, 1, "租约保留");
});

test("unload：emptyAfterMs 后强制检查点 → Draining → Offline：释放租约、state offline、dispose；未到 emptyAfterMs 不 unload", async () => {
    const h = await occupied({ emptyPolicy: "unload", emptyAfterMs: 1_000, checkpointMs: 100_000 });
    h.clock.now += 999;
    assert.equal(h.room.advance(100), 2);
    assert.equal(h.room.phase, WorldPhase.Active, "未到 emptyAfterMs 不 unload");
    assert.equal(h.leases.held.size, 1);
    h.clock.now += 1;
    h.room.advance(100);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.room.phase, WorldPhase.Offline);
    assert.deepEqual(h.checkpoints.map((entry) => entry.reason), ["forced"], "unload 前强制检查点");
    assert.ok(h.mode.__probe.log.includes("drain:empty-unload"));
    assert.equal(h.leases.held.size, 0, "释放租约");
    assert.equal(h.control.instance("wi_m1_0").state, "offline");
    assert.equal(h.room.isDisposed, true);
    assert.equal(h.room.advance(100), 0);
    assert.equal(h.timers.pending.size, 0, "无残留计时器");
});
