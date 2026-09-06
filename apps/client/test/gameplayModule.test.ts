/**
 * GameplayModule / GameplayInstanceHost 契约测试（Non-intrusive §7.6/§7.7/§7.8 阶段 9）。
 *
 *  1. host generation 门：旧 generation 的 dispatchInput/requestExit 拒绝，
 *     迟到 join / 迟到 RPC / 上一局 async callback 无权染指新房；
 *  2. 退出原因映射：user-exit / settled → {kind:"manual"}（词汇表写死，见
 *     gameplayExitStopReason 注释）；cancelled/disposed/room-lost/plugin-error
 *     无玩法侧入口；
 *  3. validateLaunch：exact {} 或 {profile?}（取值限 catalog profiles）；
 *  4. 登记态 joiner 使用 validateLaunch({}) 的默认 launch；
 *  5. 阶段 9 退出条件：fixture module 全流程只用新增/内存件，Main/RoomClient/
 *     pages/Home/catalog 手写文件字节不动（独立注入 registry，⛔ 不改生产 catalog）；
 *  6. §7.8：宿主输入闸拒绝的输入不产生 ballMove adapter seq（暂停不跳变）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
    GameplayRegistry,
    gameplayExitStopReason,
    registerGameplayModule,
    RoomController,
    type GameplayControllerBridge,
    type GameplayInstanceHost,
    type GameplayModule,
    type GameplayStopReason,
    type RoomCapability,
} from "../src/logic/gameplay";
import { GamePhase } from "../src/shared/index";
import { createGameplayServices } from "../src/gameplay/services";
import { createGameplayModule as createBallMoveModule } from "../src/gameplay/modes/ballMove/index";
import { createGameplayModule as createIdleModule } from "../src/gameplay/modes/idle/index";
import { createBallMoveRoomAdapter, type BallMoveTypedRoom } from "../src/net/rooms/GameRoomTransport";
import {
    createBallMoveGameplay,
    type BallMoveInput,
    type BallMoveRoom,
} from "../src/logic/rooms/ballMove/BallMoveGameplay";
import { GameECS } from "../src/logic/rooms/ballMove/GameECS";

function bridgeFor(controller: RoomController<any, any>): GameplayControllerBridge {
    return {
        currentGeneration: () => controller.currentGeneration,
        dispatchInput: (input) => controller.input(input),
        requestStop: (reason) => controller.stop(reason),
    };
}

interface FixtureRoom {
    readonly kind: "module-fixture";
}

interface FixtureState {
    readonly hosts: GameplayInstanceHost<string>[];
    readonly inputs: string[][];
    readonly stops: GameplayStopReason[];
}

/** 最小 fixture module：记录每次 createPlugin 的 host 与逐实例输入/停止原因。 */
function fixtureModule(id = "module-fixture"): {
    readonly module: GameplayModule<Record<string, never>, string, FixtureRoom>;
    readonly state: FixtureState;
} {
    const state: FixtureState = { hosts: [], inputs: [], stops: [] };
    const module: GameplayModule<Record<string, never>, string, FixtureRoom> = {
        id,
        validateLaunch: (input) => {
            if (input === undefined || input === null) return {};
            if (typeof input !== "object" || Object.keys(input as object).length > 0) {
                throw new TypeError("[fixture] launch 必须是空对象");
            }
            return {};
        },
        joiner: {
            join: (_launch, _signal): RoomCapability<FixtureRoom> => ({
                ready: Promise.resolve({ kind: "module-fixture" }),
                leave: async () => {},
            }),
        },
        createPlugin: (host) => {
            state.hosts.push(host);
            const inputs: string[] = [];
            state.inputs.push(inputs);
            return {
                id,
                start() {},
                handleInput(input: string) { inputs.push(input); },
                stop(reason) { state.stops.push(reason); },
            };
        },
    };
    return { module, state };
}

test("GameplayInstanceHost：generation 直接是 controller 计数，旧 host 拒绝、迟到异步无权染新房", async () => {
    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    const bridge = bridgeFor(controller);
    const { module, state } = fixtureModule();
    const off = registerGameplayModule(registry, module, bridge);

    assert.equal((await controller.startRegistered(registry, module.id)).status, "started");
    const firstHost = state.hosts[0];
    assert.equal(firstHost.generation, controller.currentGeneration,
        "host.generation 必须直接是 RoomController.currentGeneration 为本局分配的值");
    assert.equal(firstHost.isActive(), true);
    assert.equal(await firstHost.dispatchInput("alpha"), true);
    assert.deepEqual(state.inputs[0], ["alpha"]);

    // 上一局的 async callback 捕获旧 host；新一局开启后它无权操作。
    const lateCallback = async (): Promise<boolean> => firstHost.dispatchInput("late");

    await controller.stop();
    assert.equal(firstHost.isActive(), false, "stop 后旧 host 立即失活");
    assert.equal(await firstHost.dispatchInput("after-stop"), false);

    assert.equal((await controller.startRegistered(registry, module.id)).status, "started");
    const secondHost = state.hosts[1];
    assert.ok(secondHost.generation > firstHost.generation, "新一局必须拿到更大的 generation");

    assert.equal(await lateCallback(), false, "旧 generation 的迟到异步 dispatchInput 必须被拒");
    await firstHost.requestExit("user-exit");
    assert.equal(controller.status, "running", "旧 host 的 requestExit 不得拆新一局");
    assert.deepEqual(state.inputs[1], [], "旧 host 的任何输入不得进入新一局 plugin");

    assert.equal(await secondHost.dispatchInput("beta"), true);
    assert.deepEqual(state.inputs[1], ["beta"]);
    await controller.dispose();
    off();
});

test("requestExit：user-exit/settled 都映射既有 manual（词汇表写死），且经通用 stop 路径", async () => {
    assert.deepEqual(gameplayExitStopReason("user-exit"), { kind: "manual" });
    assert.deepEqual(gameplayExitStopReason("settled"), { kind: "manual" });

    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    const { module, state } = fixtureModule();
    const off = registerGameplayModule(registry, module, bridgeFor(controller));

    await controller.startRegistered(registry, module.id);
    await state.hosts[0].requestExit("settled");
    assert.equal(controller.status, "stopped", "settled 走 controller.stop 通用恢复路径");
    assert.deepEqual(state.stops.at(-1), { kind: "manual" });

    await controller.startRegistered(registry, module.id);
    await state.hosts[1].requestExit("user-exit");
    assert.equal(controller.status, "stopped");
    assert.deepEqual(state.stops.at(-1), { kind: "manual" });
    await controller.dispose();
    off();
});

test("registerGameplayModule：module/bridge 形状 fail-fast；plugin.id 必须等于 module.id", async () => {
    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    const bridge = bridgeFor(controller);
    const { module } = fixtureModule();
    assert.throws(
        () => registerGameplayModule(registry, { ...module, validateLaunch: undefined as never }, bridge),
        /validateLaunch\/joiner\/createPlugin/,
    );
    assert.throws(
        () => registerGameplayModule(registry, module, { ...bridge, requestStop: undefined as never }),
        /currentGeneration\/dispatchInput\/requestStop/,
    );
    const off = registerGameplayModule(registry, {
        ...module,
        id: "mismatched-id",
    }, bridge);
    // registry 的 plugin.id === 登记 key 闸在 resolve 时兜底（createPlugin 返回原 id）。
    const result = await controller.startRegistered(registry, "mismatched-id");
    assert.equal(result.status, "failed");
    assert.match(String((result as { error?: unknown }).error), /id 不匹配/);
    await controller.dispose();
    off();
});

test("validateLaunch：ballMove/idle 只接受 exact {} 或 {profile ∈ catalog.profiles}", () => {
    const controller = new RoomController<any, any>();
    const services = createGameplayServices({ controllerBridge: bridgeFor(controller) });
    for (const module of [createBallMoveModule(services), createIdleModule(services)] as const) {
        assert.deepEqual(module.validateLaunch(undefined), {});
        assert.deepEqual(module.validateLaunch({}), {});
        assert.deepEqual(module.validateLaunch({ profile: "default" }), { profile: "default" });
        assert.throws(() => module.validateLaunch({ profile: "private" }), /profiles/);
        assert.throws(() => module.validateLaunch({ roomId: "r1" }), /未知字段/);
        assert.throws(() => module.validateLaunch("default"), /对象/);
        assert.throws(() => module.validateLaunch([]), /对象/);
    }
});

test("登记态 joiner：join 使用 validateLaunch({}) 的默认 launch（launch 接缝已就位）", async () => {
    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    const { module } = fixtureModule();
    const captured: unknown[] = [];
    const off = registerGameplayModule(registry, {
        ...module,
        validateLaunch: (input) => {
            captured.push(["validate", input]);
            return {};
        },
        joiner: {
            join: (launch, _signal) => {
                captured.push(["join", launch]);
                return { ready: Promise.resolve({ kind: "module-fixture" as const }), leave: async () => {} };
            },
        },
    }, bridgeFor(controller));
    await controller.startRegistered(registry, module.id);
    assert.deepEqual(captured, [["validate", {}], ["join", {}]],
        "登记态 join 必须先 validateLaunch({}) 再把校验产物交给 module joiner");
    await controller.dispose();
    off();
});

test("阶段 9 退出条件：fixture module 全流程不修改 Main/RoomClient/pages/Home/catalog 手写文件（字节断言）", async () => {
    // 中央手写文件清单（catalog.generated 是生成物，随生成器演进；这里钉手写面）。
    const pinned = [
        "../src/Main.ts",
        "../src/net/RoomClient.ts",
        "../src/view/pages.ts",
        "../src/view/HomeView.ts",
        "../src/logic/page/HomeLogic.ts",
        "../src/gameplay/catalog.ts",
        "../src/gameplay/services.ts",
        "../src/app/AppRuntime.ts",
    ].map((relative) => new URL(relative, import.meta.url));
    const before = pinned.map((url) => readFileSync(url, "utf8"));

    // §7.5：测试替换 catalog 使用独立注入的 registry，⛔ 不修改生产 catalog。
    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    const { module, state } = fixtureModule("fixture-armory");
    const off = registerGameplayModule(registry, module, bridgeFor(controller));
    assert.equal((await controller.startRegistered(registry, "fixture-armory")).status, "started");
    assert.equal(await state.hosts[0].dispatchInput("probe"), true);
    await state.hosts[0].requestExit("settled");
    assert.equal(controller.status, "stopped");
    await controller.dispose();
    off();

    const after = pinned.map((url) => readFileSync(url, "utf8"));
    assert.deepEqual(after, before,
        "新增 fixture 玩法的注册/启动/输入/退出全流程不得改动任何中央手写文件");
});

test("§7.8：宿主输入闸拒绝的输入不产生 ballMove adapter seq（暂停期间 seq 不跳变）", async () => {
    const adapter = createBallMoveRoomAdapter();
    const sent: Array<{ type: string; payload: unknown }> = [];
    const typedRoom = {
        current: true,
        dropping: false,
        send: (type: string, payload: unknown) => {
            sent.push({ type, payload });
            return true;
        },
    } as unknown as BallMoveTypedRoom;
    const inputLease = adapter.beginInputLease();
    const listener = () => () => {};
    const capability: BallMoveRoom = {
        roomId: "seq-room",
        sessionId: "self",
        get dropping() { return false; },
        phase: () => GamePhase.Playing,
        onWelcome: listener,
        onPong: listener,
        onChat: listener,
        onSkillResult: listener,
        onError: listener,
        observePlayers: () => () => {},
        move: (dirX, dirY) => adapter.move(inputLease, typedRoom, dirX, dirY),
        clearMove: () => { adapter.clearMove(inputLease, typedRoom); },
        ping() {},
    };

    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    // 宿主输入闸（AppRuntime.dispatchGameplayInput 的语义）：hidden 时拒绝新输入意图。
    let hostHidden = false;
    const bridge: GameplayControllerBridge = {
        currentGeneration: () => controller.currentGeneration,
        dispatchInput: (input) => hostHidden ? Promise.resolve(false) : controller.input(input),
        requestStop: (reason) => controller.stop(reason),
    };
    const ecs = new GameECS();
    const hosts: GameplayInstanceHost<BallMoveInput>[] = [];
    const module: GameplayModule<Record<string, never>, BallMoveInput, BallMoveRoom> = {
        id: "ballMove",
        validateLaunch: () => ({}),
        joiner: {
            join: () => ({ ready: Promise.resolve(capability), leave: async () => {} }),
        },
        createPlugin: (host) => {
            hosts.push(host);
            return createBallMoveGameplay({
                presentation: { mount() {}, render() {}, unmount() {} },
                ecs,
            });
        },
    };
    const off = registerGameplayModule(registry, module, bridge);
    try {
        assert.equal((await controller.startRegistered(registry, "ballMove")).status, "started");
        ecs.addPlayer({ id: "self", name: "p", x: 100, y: 100, hp: 100, maxHp: 100, alive: true }, true);
        const host = hosts[0];

        assert.equal(await host.dispatchInput({ type: "target", x: 700, y: 100 }), true);
        await controller.tick(0.016);
        assert.equal(adapter.desiredMove.seq, 1, "首个目标输入经 tick steer 产生 seq=1");

        // hide：宿主停喂 tick + 拒新输入意图 ⇒ 不触达 adapter，seq 保持。
        hostHidden = true;
        assert.equal(await host.dispatchInput({ type: "target", x: 0, y: 100 }), false,
            "hide 期间新输入意图必须被拒");
        assert.equal(adapter.desiredMove.seq, 1, "被拒输入不得推进 input seq");
        assert.deepEqual(adapter.desiredMove, { dirX: 1, dirY: 0, seq: 1 },
            "hide 期间 desired move 不得被改写");

        // show（ready）：恢复输入与 tick，seq 连续 1→2，⛔ 不因暂停跳变。
        hostHidden = false;
        assert.equal(await host.dispatchInput({ type: "target", x: 0, y: 100 }), true);
        await controller.tick(0.016);
        assert.equal(adapter.desiredMove.seq, 2, "恢复后 seq 必须连续（1→2）");
        assert.equal(sent.filter((entry) => entry.type === "c2s.move").length, 2);
    } finally {
        await controller.dispose();
        off();
        ecs.clear();
    }
});
