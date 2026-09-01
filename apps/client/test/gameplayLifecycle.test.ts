import assert from "node:assert/strict";
import { test } from "node:test";
import {
    GameplayRegistry,
    registerGameplayModule,
    RoomController,
    type GameplayControllerBridge,
    type GameplayPlugin,
    type RoomCapability,
} from "../src/logic/gameplay";
import type { BallMoveRoom } from "../src/logic/rooms/ballMove/BallMoveGameplay";
import {
    createIdleGameplay,
    IdleGameplay,
    registerIdleGameplay,
    type IdleInput,
    type IdleRoom,
} from "../src/logic/rooms/idle/IdleGameplay";
import { registerGeneratedGameplays } from "../src/gameplay/catalog.generated";
import { createGameplayServices, type GameplayPresentationHost } from "../src/gameplay/services";
import { createGameplayModule as createBallMoveModule } from "../src/gameplay/modes/ballMove/index";
import { createGameplayModule as createIdleModule } from "../src/gameplay/modes/idle/index";

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

const room = (): IdleRoom => ({ kind: "idle-fixture", pulse() {} });

/** §7.7 controller 桥（生产由 AppRuntime 绑定；测试直连 controller）。 */
function bridgeFor(controller: RoomController<any, any>): GameplayControllerBridge {
    return {
        currentGeneration: () => controller.currentGeneration,
        dispatchInput: (input) => controller.input(input),
        requestStop: (reason) => controller.stop(reason),
    };
}

/** module 装配测试 services：⛔ 不再有逐玩法 joiner/adapter 字段（§7.6）。 */
function servicesFor(
    controller: RoomController<any, any>,
    presentationHost?: GameplayPresentationHost,
) {
    return createGameplayServices({
        controllerBridge: bridgeFor(controller),
        ...(presentationHost ? { presentationHost } : {}),
    });
}

function trackedGameplay(
    id = "idle",
    disposal: Promise<void> = Promise.resolve(),
): { plugin: GameplayPlugin<IdleRoom, IdleInput>; state: { disposeCalls: number } } {
    const state = { disposeCalls: 0 };
    return {
        state,
        plugin: {
            id,
            start() {},
            async dispose() {
                state.disposeCalls++;
                await disposal;
            },
        },
    };
}

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

test("GameplayRegistry：玩法自带 joiner 可由无默认 transport 的 RoomController 启动", async () => {
    const actualRoom: IdleRoom = { kind: "idle", roomId: "idle-room", sessionId: "idle-self", pulse() {} };
    const capability = lease(Promise.resolve(actualRoom));
    let joins = 0;
    const registry = new GameplayRegistry<IdleRoom, IdleInput>();
    registerIdleGameplay(registry, {
        joiner: { join: () => { joins++; return capability; } },
    });
    const controller = new RoomController<IdleRoom, IdleInput>();

    assert.deepEqual(await controller.startRegistered(registry, "idle"), {
        status: "started",
        generation: 1,
        pluginId: "idle",
    });
    assert.equal(joins, 1);
    assert.equal(controller.pluginId, "idle");
    await controller.dispose();
    assert.equal(capability.leaveCalls, 1);
});

test("GameplayRegistry：replace 使用 registration ownership，旧 disposer 不删除同 factory 新登记", () => {
    const registry = new GameplayRegistry<IdleRoom, IdleInput>();
    const firstJoiner = { join: () => lease(Promise.resolve(room())) };
    const secondJoiner = { join: () => lease(Promise.resolve(room())) };
    const oldOff = registry.register("idle", createIdleGameplay, { joiner: firstJoiner });
    const newOff = registry.register("idle", createIdleGameplay, { replace: true, joiner: secondJoiner });

    oldOff();
    assert.equal(registry.has("idle"), true);
    assert.strictEqual(registry.getJoiner("idle"), secondJoiner);
    newOff();
    assert.equal(registry.has("idle"), false);
});

test("GameplayRegistry：factory 重入 replace 时仍返回同一 registration 的 plugin/joiner 快照", () => {
    const registry = new GameplayRegistry<IdleRoom, IdleInput>();
    const oldJoiner = { join: () => lease(Promise.resolve(room())) };
    const newJoiner = { join: () => lease(Promise.resolve(room())) };
    registry.register("idle", () => {
        registry.register("idle", createIdleGameplay, { replace: true, joiner: newJoiner });
        return createIdleGameplay();
    }, { joiner: oldJoiner });

    const resolved = registry.resolveForStart("idle");
    assert.strictEqual(resolved.joiner, oldJoiner, "plugin 与 joiner 必须来自 factory 调用前的同一快照");
    assert.strictEqual(registry.getJoiner("idle"), newJoiner, "重入 replacement 仍成为后续登记");
});

test("RoomController：登记缺 joiner 时不构造无主 plugin", async () => {
    let factoryCalls = 0;
    const registry = new GameplayRegistry<IdleRoom, IdleInput>();
    registry.register("idle", () => { factoryCalls++; return createIdleGameplay(); });
    const controller = new RoomController<IdleRoom, IdleInput>({
        join: () => lease(Promise.resolve(room())),
    });

    const result = await controller.startRegistered(registry, "idle");
    assert.equal(result.status, "failed");
    assert.equal(factoryCalls, 0, "startRegistered 不得回退到 controller 默认 joiner 或泄漏 plugin");
});

test("RoomController：所有未接管插件的拒绝路径都等待 exactly-once dispose", async () => {
    const disposeGate = deferred<void>();
    const missingJoiner = new RoomController<IdleRoom, IdleInput>();
    const shared = trackedGameplay("idle", disposeGate.promise);
    let firstSettled = false;
    const first = missingJoiner.start(shared.plugin).then((result) => {
        firstSettled = true;
        return result;
    });
    const second = missingJoiner.start(shared.plugin);
    await Promise.resolve();
    assert.equal(shared.state.disposeCalls, 1, "并发拒绝必须合流到同一次 dispose");
    assert.equal(firstSettled, false, "start 结果不得早于异步 dispose");
    disposeGate.resolve();
    assert.equal((await first).status, "failed");
    assert.equal((await second).status, "failed");
    assert.equal(shared.state.disposeCalls, 1);

    const activeLease = lease(Promise.resolve(room()));
    const busyController = new RoomController<IdleRoom, IdleInput>({ join: () => activeLease });
    const active = createIdleGameplay();
    await busyController.start(active);
    const busy = trackedGameplay("other");
    assert.equal((await busyController.start(busy.plugin)).status, "busy");
    assert.equal(busy.state.disposeCalls, 1);
    assert.equal(active.disposed, false, "busy 拒绝不能清理当前运行插件");
    await busyController.dispose();

    const disposedController = new RoomController<IdleRoom, IdleInput>();
    await disposedController.dispose();
    const registry = new GameplayRegistry<IdleRoom, IdleInput>();
    const rejected = trackedGameplay();
    registry.register("idle", () => rejected.plugin, {
        joiner: { join: () => lease(Promise.resolve(room())) },
    });
    assert.equal((await disposedController.startRegistered(registry, "idle")).status, "disposed");
    assert.equal(rejected.state.disposeCalls, 1);

    const throwing = trackedGameplay();
    const throwingController = new RoomController<IdleRoom, IdleInput>({
        join: () => { throw new Error("join failed"); },
    });
    assert.equal((await throwingController.start(throwing.plugin)).status, "failed");
    assert.equal(throwing.state.disposeCalls, 1, "同步 join 异常返回前必须完成 dispose");

    let malformedLeaves = 0;
    const malformed = trackedGameplay();
    const malformedController = new RoomController<IdleRoom, IdleInput>({
        join: () => ({
            ready: null,
            async leave() { malformedLeaves++; },
        }) as never,
    });
    assert.equal((await malformedController.start(malformed.plugin)).status, "failed");
    assert.equal(malformedLeaves, 1, "shape 校验失败仍必须释放已返回的 transport capability");
    assert.equal(malformed.state.disposeCalls, 1);
});

test("generated 登记：后续模块登记失败会回滚先前登记，且不删除调用前已有登记", () => {
    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    const idleJoiner = { join: () => lease(Promise.resolve(room())) };
    const existingIdleOff = registry.register("idle", createIdleGameplay, { joiner: idleJoiner });
    // 生成序 ballMove → idle：idle 撞已登记 ⇒ 本次 ballMove 必须回滚。
    assert.throws(
        () => registerGeneratedGameplays(registry, servicesFor(controller)),
        /已登记/,
    );
    assert.equal(registry.has("ballMove"), false, "idle 登记失败后必须撤销本次 ballMove");
    assert.equal(registry.has("idle"), true, "失败回滚不得删除调用前已有的 idle");
    existingIdleOff();
});

test("gameplay module：模块 joiner 可整体替换（⛔ 无逐玩法 context 字段），idle 由无默认 transport 的 controller 启动", async () => {
    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    const services = servicesFor(controller);
    const idleCapability = lease(Promise.resolve({
        kind: "idle", roomId: "idle-real", sessionId: "self", pulse() {},
    }));
    // 测试替换 transport 的口径：替换**模块对象的 joiner**（模块是普通对象，spread
    // 即可），⛔ 不再经 catalog context 的 ballMoveJoiner/idleJoiner 字段注入。
    const ballOff = registerGameplayModule(registry, {
        ...createBallMoveModule(services),
        joiner: { join: () => lease(Promise.resolve({} as never)) as unknown as RoomCapability<BallMoveRoom> },
    }, services.controllerBridge);
    const idleOff = registerGameplayModule(registry, {
        ...createIdleModule(services),
        joiner: { join: () => idleCapability },
    }, services.controllerBridge);

    assert.deepEqual(registry.list(), ["ballMove", "idle"]);
    assert.equal((await controller.startRegistered(registry, "idle")).status, "started");
    assert.equal(controller.pluginId, "idle");
    await controller.dispose();
    assert.equal(idleCapability.leaveCalls, 1);
    idleOff();
    ballOff();
    assert.deepEqual(registry.list(), []);
});

test("gameplay module：idle 不创建 BallMove presentation，缺失 presentation 只影响 ballMove 并完整回滚", async () => {
    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    let nodeReads = 0;
    const host: GameplayPresentationHost = {
        get node(): never {
            nodeReads++;
            return {} as never;
        },
        dispatchInput() {},
    };
    let idleLeaves = 0;
    const idleJoiner = {
        join: () => ({
            ready: Promise.resolve({ kind: "idle" as const, roomId: "idle", sessionId: "self", pulse() {} }),
            async leave() { idleLeaves++; },
        }),
    };
    let ballLeaves = 0;
    const ballJoiner = {
        join: () => ({
            ready: Promise.resolve({} as never),
            async leave() { ballLeaves++; },
        }),
    };
    const services = servicesFor(controller, host);
    const offs = [
        registerGameplayModule(registry, { ...createBallMoveModule(services), joiner: ballJoiner },
            services.controllerBridge),
        registerGameplayModule(registry, { ...createIdleModule(services), joiner: idleJoiner },
            services.controllerBridge),
    ];

    assert.deepEqual(await controller.startRegistered(registry, "idle"), {
        status: "started", generation: 1, pluginId: "idle",
    });
    assert.equal(nodeReads, 0, "启动无 presentation 的 idle 不得读取/构造 BallMoveView");
    await controller.stop();
    assert.equal(idleLeaves, 1);

    for (const off of offs) off();

    // 无 presentationHost 的 services：ballMove 启动失败且完整回滚，idle 不受影响。
    const missingRegistry = new GameplayRegistry<any, any>();
    const missingServices = servicesFor(controller);
    registerGameplayModule(missingRegistry, { ...createBallMoveModule(missingServices), joiner: ballJoiner },
        missingServices.controllerBridge);
    registerGameplayModule(missingRegistry, { ...createIdleModule(missingServices), joiner: idleJoiner },
        missingServices.controllerBridge);
    const failed = await controller.startRegistered(missingRegistry, "ballMove");
    assert.equal(failed.status, "failed");
    assert.match(String((failed as { error?: unknown }).error), /presentation adapter/);
    assert.equal(nodeReads, 0, "缺 presentation 时不得构造 BallMoveView");
    assert.equal(ballLeaves, 1, "缺 presentation 的失败启动必须释放 room capability");
});

test("GameplayRegistry：玩法 id 必须是 canonical wire identity", () => {
    const registry = new GameplayRegistry<IdleRoom, IdleInput>();
    assert.throws(() => registry.register(" idle ", createIdleGameplay), /规范/);
    assert.throws(() => registry.register("idle/path", createIdleGameplay), /规范/);
});

test("RoomController：精确 room context、并发启动合流、输入/tick 与幂等 stop", async () => {
    let pulses = 0;
    const actualRoom: IdleRoom = { kind: "idle-fixture", pulse() { pulses++; } };
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
    assert.equal(pulses, 1, "idle input 必须调用精确 room 的 pulse capability");
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
    assert.equal(pulses, 1, "stop 后的输入不能再触发 room pulse");
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
