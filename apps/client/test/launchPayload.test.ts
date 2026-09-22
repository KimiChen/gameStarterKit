/**
 * MF9-B4 带参 launch（docs/MMO.md MF9 / docs/MMO-PLAN.md MF9-B4 / EXTRAS X1）：
 *  1. 登记态 joiner 把 launch 输入交给 module.validateLaunch（exact 校验）：未知字段被拒、缺省 `{}`；
 *  2. RoomController.startRegistered(…, launch) 原样转发给登记的 joiner；
 *  3. joinGameRoom / services.joinGameRoom 的 options.profile 覆盖缺省 "default"；
 *  4. AppRuntime.launch(target) 把 `{ ...payload, profile }` 透传到 controller.startRegistered，enterBattle ⇒ `{}`；
 *  5. 仓内全部玩法 module 的 validateLaunch 都拒未知字段。
 * 变异验证：GameplayModule.registerGameplayModule 的 joiner 改回 validateLaunch({}) → ① 转红；
 * AppRuntime.startGameplay 的 launchInput 改成 `{}` → ④ 转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GameplayRegistry, RoomController, registerGameplayModule, type GameplayControllerBridge, type GameplayModule, type RoomCapability } from "../src/logic/gameplay";
import { createGameplayServices } from "../src/gameplay/services";
import { createBallMoveRoomAdapter, joinGameRoom } from "../src/net/rooms/GameRoomTransport";
import { chooseServer } from "../src/net/serverSession";
import type { RoomClient } from "../src/net/RoomClient";
import { createGameplayModule as createBallMoveModule } from "../src/gameplay/modes/ballMove/index";
import { createGameplayModule as createIdleModule } from "../src/gameplay/modes/idle/index";
import { createGameplayModule as createSnakeModule } from "../src/gameplay/modes/snake/index";
import { createGameplayModule as createTallyModule } from "../src/gameplay/modes/tally/index";
import { createGameplayModule as createArenaCaptureModule } from "../src/gameplay/modes/arenaCapture/index";
import { createGameplayModule as createArenaDuelModule } from "../src/gameplay/modes/arenaDuel/index";
import { createFakeStage3D, loadAppHost } from "./appHostHarness";

function bridgeFor(controller: RoomController<any, any>): GameplayControllerBridge {
    return {
        currentGeneration: () => controller.currentGeneration,
        dispatchInput: (input) => controller.input(input),
        requestStop: (reason) => controller.stop(reason),
    };
}

interface FixtureLaunch { readonly arena?: string }

/** 只认 `{ arena?: string }` 的 exact validateLaunch；joiner 记录收到的（已校验）launch。 */
function fixtureModule(seen: FixtureLaunch[]): GameplayModule<FixtureLaunch, string, { kind: "fixture" }> {
    return {
        id: "launchFixture",
        validateLaunch: (input) => {
            if (input === undefined || input === null) return {};
            if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("[fixture] launch 必须是对象");
            for (const key of Object.keys(input as Record<string, unknown>)) {
                if (key !== "arena") throw new TypeError(`[fixture] launch 未知字段：${key}`);
            }
            const arena = (input as { readonly arena?: unknown }).arena;
            if (arena !== undefined && typeof arena !== "string") throw new TypeError("[fixture] launch.arena 必须是字符串");
            return arena === undefined ? {} : { arena };
        },
        joiner: {
            join: (launch, _signal): RoomCapability<{ kind: "fixture" }> => {
                seen.push(launch);
                return { ready: Promise.resolve({ kind: "fixture" as const }), leave: async () => {} };
            },
        },
        createPlugin: () => ({ id: "launchFixture", start() {}, stop() {} }),
    };
}

test("登记态 joiner：launch 输入先过 module.validateLaunch（exact）——未知字段拒、缺省 {}；controller.startRegistered 原样转发", async () => {
    const registry = new GameplayRegistry<any, any>();
    const controller = new RoomController<any, any>();
    const seen: FixtureLaunch[] = [];
    const off = registerGameplayModule(registry, fixtureModule(seen), bridgeFor(controller));
    try {
        const { joiner } = registry.resolveForStart("launchFixture");
        const signal = new AbortController().signal;
        joiner.join(signal, { arena: "north" });
        joiner.join(signal);
        joiner.join(signal, undefined);
        assert.deepEqual(seen, [{ arena: "north" }, {}, {}]);
        assert.throws(() => joiner.join(signal, { bad: 1 }), /launch 未知字段：bad/u);
        assert.throws(() => joiner.join(signal, { arena: 7 }), /launch\.arena 必须是字符串/u);
        assert.throws(() => joiner.join(signal, [1]), /必须是对象/u);
        seen.splice(0);

        assert.equal((await controller.startRegistered(registry, "launchFixture", undefined, { arena: "south" })).status, "started");
        assert.deepEqual(seen, [{ arena: "south" }], "startRegistered 的 launch 原样到达 joiner");
        await controller.stop();
        const failed = await controller.startRegistered(registry, "launchFixture", undefined, { nope: true });
        assert.equal(failed.status, "failed", "validateLaunch 拒绝 ⇒ 启动失败（不进房）");
        assert.match(String((failed as { error?: unknown }).error), /launch 未知字段：nope/u);
        assert.deepEqual(seen, [{ arena: "south" }], "被拒的 launch 不触达 join");
    } finally {
        off();
        await controller.dispose();
    }
});

test("joinGameRoom / services.joinGameRoom：options.profile 覆盖缺省 default（v8 信封 profile 字段）", async () => {
    const { session } = await loadAppHost();
    chooseServer({ serverId: 7, gameWsUrl: "ws://127.0.0.1:1/ws" } as unknown as Parameters<typeof chooseServer>[0]);
    session.setSession({ userId: "uid-launch", accessToken: "token-launch", isNewAccount: false });
    try {
        const joins: unknown[] = [];
        const fakeClient = {
            init: () => {},
            joinGame: (_adapter: unknown, options: unknown) => {
                joins.push(options);
                return { kind: "game-room-ownership", ready: new Promise(() => {}), leave: async () => {} };
            },
        } as unknown as RoomClient;
        const adapter = createBallMoveRoomAdapter();
        const signal = new AbortController().signal;
        joinGameRoom(fakeClient, adapter, signal);
        joinGameRoom(fakeClient, adapter, signal, {});
        joinGameRoom(fakeClient, adapter, signal, { profile: "private" });
        const services = createGameplayServices({ stage3d: createFakeStage3D(), controllerBridge: bridgeFor(new RoomController<any, any>()), roomClient: fakeClient });
        services.joinGameRoom(adapter, signal, { profile: "vip" });
        services.joinGameRoom(adapter, signal);
        assert.deepEqual(joins.map((options) => (options as { profile: string; sId: number }).profile), ["default", "default", "private", "vip", "default"]);
        assert.ok(joins.every((options) => (options as { sId: number }).sId === 7));
    } finally {
        session.clearSession();
    }
});

test("AppRuntime.launch(target)：payload / profile 透传为 { ...payload, profile } 到 controller.startRegistered；enterBattle ⇒ {}", async () => {
    const { appRuntime, makeNode } = await loadAppHost();
    const runtime = new appRuntime.AppRuntime({ stage3d: createFakeStage3D(), node: makeNode(), launchPluginMap: new Map() }) as unknown as Record<string, any>;
    const calls: unknown[][] = [];
    runtime.roomController = {
        status: "idle",
        startRegistered: async (...args: unknown[]) => { calls.push(args); return { status: "started", generation: 1, pluginId: String(args[1]) }; },
        dispose: async () => {},
    };
    runtime.gameplayRegistry = { fixture: true };
    try {
        await runtime.launch({ kind: "gameplay", gameplayId: "ballMove", payload: { arena: "north", size: 3 }, profile: "default" });
        assert.equal(calls.length, 1);
        assert.equal(calls[0][1], "ballMove");
        assert.deepEqual(calls[0][3], { arena: "north", size: 3, profile: "default" }, "payload 展开 + profile 保留键");
        await runtime.launch({ kind: "gameplay", gameplayId: "ballMove", payload: { arena: "east" } });
        assert.deepEqual(calls[1][3], { arena: "east" }, "无 profile 时不注入 profile 键");
        await runtime.launch({ kind: "gameplay", gameplayId: "ballMove" });
        assert.deepEqual(calls[2][3], {}, "无参 target ⇒ {}");
        await runtime.enterBattle();
        assert.deepEqual(calls[3][3], {}, "enterBattle ⇒ {}");
    } finally {
        runtime.roomController = null;
        runtime.dispose();
    }
});

test("仓内全部玩法 module 的 validateLaunch 拒未知字段（exact 校验是 module 约定，带参 launch 依赖它）", () => {
    const services = createGameplayServices({ stage3d: createFakeStage3D(), controllerBridge: bridgeFor(new RoomController<any, any>()) });
    const modules = [
        createBallMoveModule(services), createIdleModule(services), createSnakeModule(services),
        createTallyModule(services), createArenaCaptureModule(services), createArenaDuelModule(services),
    ];
    assert.deepEqual(modules.map((module) => module.id).sort(), ["arenaCapture", "arenaDuel", "ballMove", "idle", "snake", "tally"]);
    for (const module of modules) {
        assert.throws(() => module.validateLaunch({ __unknown: 1 }), /未知字段|unknown/iu, `${module.id} 必须拒未知 launch 字段`);
        assert.doesNotThrow(() => module.validateLaunch({}), `${module.id} 接受空 launch`);
    }
});
