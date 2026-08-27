import assert from "node:assert/strict";
import { test } from "node:test";
import {
    GameplayRegistry,
    RoomController,
    type GameplayPlugin,
    type RoomCapability,
} from "../src/logic/gameplay";
import {
    createIdleGameplay,
    IdleGameplay,
    registerIdleGameplay,
    type IdleInput,
    type IdleRoom,
} from "../src/logic/rooms/idle/IdleGameplay";

interface Deferred<T> {
    readonly promise: Promise<T>;
    resolve(value: T): void;
    reject(error?: unknown): void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function lease(ready: Promise<IdleRoom>): RoomCapability<IdleRoom> & { leaveCalls: number } {
    let leaveCalls = 0;
    return {
        ready,
        get leaveCalls() { return leaveCalls; },
        async leave() { leaveCalls++; },
    };
}

const room = (): IdleRoom => ({ kind: "idle-fixture" });

test("GameplayRegistry：新增 idle 玩法只需登记 factory，id 与解绑具有 ownership", () => {
    const registry = new GameplayRegistry<IdleRoom, IdleInput>();
    const off = registerIdleGameplay(registry);
    assert.equal(registry.has("idle"), true);
    assert.deepEqual(registry.list(), ["idle"]);
    assert.ok(registry.create("idle") instanceof IdleGameplay);
    assert.throws(() => registry.register("idle", createIdleGameplay), /已登记/);
    off();
    assert.equal(registry.has("idle"), false);
    assert.throws(() => registry.create("idle"), /未登记/);
});

test("RoomController：精确 room context、并发启动合流、输入/tick 与幂等 stop", async () => {
    const actualRoom = room();
    const capability = lease(Promise.resolve(actualRoom));
    let joins = 0;
    const controller = new RoomController<IdleRoom, IdleInput>({
        join: () => { joins++; return capability; },
    });
    const plugin = createIdleGameplay();

    const first = controller.start(plugin);
    const second = controller.start(plugin);
    assert.strictEqual(first, second, "同一插件的在途 start 必须合流");
    assert.deepEqual(await first, { status: "started", generation: 1, pluginId: "idle" });
    assert.equal(joins, 1);
    assert.equal(controller.status, "running");
    assert.strictEqual(plugin.room, actualRoom, "插件必须持有本次 join 的精确 room");
    assert.equal(await controller.input({ type: "pulse", value: 3 }), true);
    assert.equal(await controller.tick(0.25), true);
    assert.deepEqual(plugin.inputs, [{ type: "pulse", value: 3 }]);
    assert.equal(plugin.ticks, 1);
    assert.equal(plugin.elapsedMs, 250);

    const already = await controller.start(plugin);
    assert.deepEqual(already, { status: "already-running", generation: 1, pluginId: "idle" });
    const other: GameplayPlugin<IdleRoom, IdleInput> = {
        id: "other",
        start: () => {},
    };
    assert.deepEqual(await controller.start(other), { status: "busy", generation: 1, pluginId: "other" });

    await controller.stop();
    await controller.stop();
    assert.equal(capability.leaveCalls, 1, "重复 stop 只能释放一次 room lease");
    assert.equal(plugin.stopReasons.length, 1);
    assert.equal(plugin.disposed, true);
    assert.equal(controller.status, "stopped");
    assert.equal(await controller.input({ type: "pulse" }), false);
});

test("RoomController：取消黑洞 join 立即释放，迟到 ready 不启动旧插件也不影响新 generation", async () => {
    const pending = deferred<IdleRoom>();
    const staleLease = lease(pending.promise);
    const freshRoom = room();
    const freshLease = lease(Promise.resolve(freshRoom));
    let joinCount = 0;
    const controller = new RoomController<IdleRoom, IdleInput>({
        join: () => ++joinCount === 1 ? staleLease : freshLease,
    });
    const stalePlugin = createIdleGameplay();
    const staleStart = controller.start(stalePlugin);

    await controller.stop({ kind: "cancelled" });
    assert.equal(staleLease.leaveCalls, 1, "取消必须立即释放 ownership，不等待 ready");
    assert.equal(controller.status, "stopped");

    const freshPlugin = createIdleGameplay();
    assert.deepEqual(await controller.start(freshPlugin), { status: "started", generation: 2, pluginId: "idle" });
    pending.resolve(room());
    assert.deepEqual(await staleStart, { status: "cancelled", generation: 1, pluginId: "idle" });
    assert.equal(stalePlugin.started, false);
    assert.equal(stalePlugin.disposed, true);
    assert.equal(staleLease.leaveCalls, 1, "迟到 ready 不得二次释放旧 lease");
    assert.strictEqual(freshPlugin.room, freshRoom);
    await controller.dispose();
    assert.equal(freshLease.leaveCalls, 1);
});

test("RoomController：外部 AbortSignal 在 running 状态也会触发完整 stop", async () => {
    const capability = lease(Promise.resolve(room()));
    const controller = new RoomController<IdleRoom, IdleInput>({ join: () => capability });
    const plugin = createIdleGameplay();
    const signalController = new AbortController();
    assert.deepEqual(await controller.start(plugin, signalController.signal), {
        status: "started", generation: 1, pluginId: "idle",
    });
    signalController.abort();
    // Abort listener starts async stop; let its leave/dispose awaits settle.
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(controller.status, "stopped");
    assert.equal(capability.leaveCalls, 1);
    assert.equal(plugin.stopReasons[0]?.kind, "cancelled");
});
