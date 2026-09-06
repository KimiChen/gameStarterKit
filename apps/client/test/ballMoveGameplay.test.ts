import assert from "node:assert/strict";
import { test } from "node:test";
import { GameplayRegistry, RoomController, type RoomCapability } from "../src/logic/gameplay/index";
import {
    BALL_MOVE_GAMEPLAY_ID,
    BallMoveGameplay,
    registerBallMoveGameplay,
    type BallMoveInput,
    type BallMovePlayerObserver,
    type BallMovePresentation,
    type BallMoveRenderWorld,
    type BallMoveRoom,
} from "../src/logic/rooms/ballMove/BallMoveGameplay";
import { GameECS } from "../src/logic/rooms/ballMove/GameECS";
import { BALL_MOVE_MIN_PLAYERS, GamePhase } from "../src/shared/index";
import type {
    GamePhaseType,
    IChatRes,
    IErrorRes,
    IPlayerState,
    IPongRes,
    ISkillResultRes,
    IWelcomeRes,
} from "../src/shared/index";

class FakePresentation implements BallMovePresentation {
    mounts = 0;
    unmounts = 0;
    renders = 0;
    lastPlayerCount = 0;
    /** 等待提示的推送流水（null = 收起）。 */
    readonly waitings: (string | null)[] = [];

    showWaiting(text: string | null): void { this.waitings.push(text); }

    mount(): void { this.mounts++; }
    render(world: BallMoveRenderWorld): void {
        this.renders++;
        let count = 0;
        world.forEachPlayer(() => { count++; });
        this.lastPlayerCount = count;
    }
    unmount(): void { this.unmounts++; }
}

class CountingGameECS extends GameECS {
    clears = 0;
    override clear(): void {
        this.clears++;
        super.clear();
    }
}

class FakeBallMoveRoom implements BallMoveRoom {
    readonly roomId = "room-exact";
    readonly sessionId = "self";
    dropping = false;
    /** 默认按「已开局」构造：多数用例测的是移动本身。⚠ 阶段闸单独有用例。 */
    phaseValue: GamePhaseType | null = GamePhase.Playing;
    readonly moves: Array<{ x: number; y: number }> = [];
    pings = 0;
    clears = 0;
    observer: BallMovePlayerObserver | null = null;
    observerOffs = 0;
    listenerOffs = 0;

    onWelcome(callback: (message: IWelcomeRes) => void): () => void {
        return this.listener(() => callback({ sessionId: "self", tickRate: 20, motd: "hello" }));
    }
    onPong(_callback: (message: IPongRes) => void): () => void { return this.listener(); }
    onChat(_callback: (message: IChatRes) => void): () => void { return this.listener(); }
    onSkillResult(_callback: (message: ISkillResultRes) => void): () => void { return this.listener(); }
    onError(_callback: (message: IErrorRes) => void): () => void { return this.listener(); }
    observePlayers(observer: BallMovePlayerObserver): () => void {
        this.observer = observer;
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            this.observer = null;
            this.observerOffs++;
        };
    }
    phase(): GamePhaseType | null { return this.phaseValue; }
    move(dirX: number, dirY: number): void { this.moves.push({ x: dirX, y: dirY }); }
    clearMove(): void { this.clears++; }
    ping(): void { this.pings++; }

    private listener(invoke?: () => void): () => void {
        invoke?.();
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            this.listenerOffs++;
        };
    }
}

class FailingListenerRoom extends FakeBallMoveRoom {
    override onChat(_callback: (message: IChatRes) => void): () => void {
        throw new Error("chat listener failed");
    }
}

const player = (id: string, x: number, y: number): IPlayerState => ({
    id,
    name: id,
    x,
    y,
    hp: 100,
    maxHp: 100,
    alive: true,
});

test("ballMove plugin：registry 装配后由精确 room 驱动监听、输入、tick/渲染与清理", async () => {
    const ecs = new CountingGameECS();
    const presentation = new FakePresentation();
    const room = new FakeBallMoveRoom();
    let leaveCalls = 0;
    const capability: RoomCapability<BallMoveRoom> = {
        ready: Promise.resolve(room),
        async leave() { leaveCalls++; },
    };
    const registry = new GameplayRegistry<BallMoveRoom, BallMoveInput>();
    registerBallMoveGameplay(registry, {
        presentation,
        ecs,
        now: () => 1_100,
        joiner: { join: () => capability },
    });
    const controller = new RoomController<BallMoveRoom, BallMoveInput>();

    assert.deepEqual(registry.list(), [BALL_MOVE_GAMEPLAY_ID]);
    assert.deepEqual(await controller.startRegistered(registry, BALL_MOVE_GAMEPLAY_ID), {
        status: "started",
        generation: 1,
        pluginId: BALL_MOVE_GAMEPLAY_ID,
    });
    assert.equal(presentation.mounts, 1);
    assert.ok(room.observer, "plugin start 必须在精确 room 上登记状态观察器");

    room.observer?.add(player("self", 100, 100), true);
    assert.equal(await controller.input({ type: "target", x: 200, y: 100 }), true);
    assert.equal(await controller.tick(1 / 60), true);
    assert.equal(presentation.renders, 1);
    assert.equal(presentation.lastPlayerCount, 1);
    assert.ok((room.moves.at(-1)?.x ?? 0) > 0.99);
    assert.ok(Math.abs(room.moves.at(-1)?.y ?? 1) < 1e-9);

    assert.equal(await controller.input({ type: "release" }), true);
    assert.deepEqual(room.moves.at(-1), { x: 0, y: 0 });
    await controller.tick(5);
    assert.equal(room.pings, 1);
    room.dropping = true;
    await controller.tick(5);
    assert.equal(room.pings, 1, "掉线窗口不得累计并补发过期 ping");

    await controller.stop({ kind: "manual" });
    await controller.stop({ kind: "manual" });
    assert.equal(leaveCalls, 1);
    assert.equal(room.clears, 1);
    assert.equal(room.listenerOffs, 5);
    assert.equal(room.observerOffs, 1);
    assert.equal(room.observer, null);
    assert.equal(presentation.unmounts, 1);
    assert.equal(ecs.clears, 2, "start 前复位一次，stop/dispose 共用的一次 teardown 再清一次");
    let remaining = 0;
    ecs.forEachPlayer(() => { remaining++; });
    assert.equal(remaining, 0);
});

/**
 * F17 回归（真机实证 2026-09-06）：`c2s.move` 的 wire 声明是 `phases: [Playing]`，而 ballMove 的
 * roster 要 2 人才开局——单人进这个演示时房间一直停在 Waiting，每拖一下就被服务端按
 * 「1001 参数非法」拒一次，控制台刷屏。客户端必须自己看阶段。
 */
test("ballMove plugin：房间还没开局（Waiting）时 ⛔ 不发 move；开局后同一个方向照常发出去", async () => {
    const ecs = new CountingGameECS();
    const presentation = new FakePresentation();
    const room = new FakeBallMoveRoom();
    room.phaseValue = GamePhase.Waiting;
    const registry = new GameplayRegistry<BallMoveRoom, BallMoveInput>();
    registerBallMoveGameplay(registry, {
        presentation, ecs, now: () => 1_100,
        joiner: { join: () => ({ ready: Promise.resolve(room), async leave() {} }) },
    });
    const controller = new RoomController<BallMoveRoom, BallMoveInput>();
    await controller.startRegistered(registry, BALL_MOVE_GAMEPLAY_ID);
    room.observer?.add(player("self", 100, 100), true);

    await controller.input({ type: "target", x: 200, y: 100 });
    await controller.tick(1 / 60);
    assert.equal(room.moves.length, 0, "Waiting 阶段 ⛔ 一条 move 都不许发——发了就是服务端 1001 刷屏");
    await controller.input({ type: "release" });
    assert.equal(room.moves.length, 0, "松手的归零 move 同样不发");

    // 开局后：同一个 target 必须真的发出去（⛔ 阶段闸不能顺手把去重状态污染掉）。
    room.phaseValue = GamePhase.Playing;
    await controller.input({ type: "target", x: 200, y: 100 });
    await controller.tick(1 / 60);
    assert.equal(room.moves.length, 1, "开局后同一个方向必须发得出去");
    assert.ok((room.moves.at(-1)?.x ?? 0) > 0.99);

    // 等待提示：未开局时报「n/2」，开局后收起；⚠ 只在变化时推，⛔ 不每帧刷。
    assert.deepEqual(presentation.waitings, [`等待另一名玩家（1/${BALL_MOVE_MIN_PLAYERS}）`, null],
        "先给等待提示、开局后收起，且各只推一次");
    await controller.tick(1 / 60);
    assert.equal(presentation.waitings.length, 2, "文案没变就 ⛔ 不重复推");
    await controller.dispose();
});

test("ballMove plugin：非法 target fail-closed，越界 target 在玩法边界收敛", async () => {
    const ecs = new GameECS();
    const room = new FakeBallMoveRoom();
    const registry = new GameplayRegistry<BallMoveRoom, BallMoveInput>();
    registerBallMoveGameplay(registry, { presentation: new FakePresentation(), ecs });
    const controller = new RoomController<BallMoveRoom, BallMoveInput>({
        join: () => ({ ready: Promise.resolve(room), async leave() {} }),
    });
    const plugin = registry.create(BALL_MOVE_GAMEPLAY_ID);
    assert.equal((await controller.start(plugin)).status, "started");
    room.observer?.add(player("self", 10, 10), true);

    await controller.input({ type: "target", x: Number.NaN, y: 10 });
    await controller.tick(1 / 60);
    assert.equal(room.moves.length, 0);
    await controller.input({ type: "target", x: Number.MAX_VALUE, y: Number.MAX_VALUE });
    await controller.tick(1 / 60);
    assert.equal(room.moves.length, 1);
    assert.ok(Number.isFinite(room.moves[0].x));
    assert.ok(Number.isFinite(room.moves[0].y));
    await controller.dispose();
});

test("ballMove plugin：启动半失败会回滚已登记监听、展示层与 room 输入", async () => {
    const room = new FailingListenerRoom();
    const presentation = new FakePresentation();
    const ecs = new CountingGameECS();
    const plugin = new (class extends BallMoveGameplay {
        constructor() { super({ presentation, ecs }); }
    })();
    const controller = new RoomController<BallMoveRoom, BallMoveInput>({
        join: () => ({ ready: Promise.resolve(room), async leave() {} }),
    });

    const result = await controller.start(plugin);
    assert.equal(result.status, "failed");
    assert.equal(room.listenerOffs, 2, "Chat 注册前已登记的消息监听必须回滚");
    assert.equal(room.clears, 1, "半失败启动也必须清掉本局输入意图");
    assert.equal(presentation.unmounts, 1);
    assert.equal(ecs.clears, 2, "start 与 rollback 各清一次 ECS");
    await controller.dispose();
});

test("ballMove plugin：直接 dispose 也会清理 room 输入与展示层", async () => {
    const room = new FakeBallMoveRoom();
    const presentation = new FakePresentation();
    const plugin = new (class extends BallMoveGameplay {
        constructor() { super({ presentation }); }
    })();
    const controller = new RoomController<BallMoveRoom, BallMoveInput>({
        join: () => ({ ready: Promise.resolve(room), async leave() {} }),
    });
    assert.equal((await controller.start(plugin)).status, "started");
    plugin.dispose();
    assert.equal(room.clears, 1);
    assert.equal(presentation.unmounts, 1);
    await controller.dispose();
});

test("ballMove plugin：「离开」经 host.requestExit(user-exit) 退出，且只请求一次（真机实证：该入口此前无退出 UI）", async () => {
    const room = new FakeBallMoveRoom();
    const presentation = new FakePresentation();
    const exits: string[] = [];
    const host = {
        generation: 1,
        isActive: () => true,
        dispatchInput: async () => true,
        requestExit: async (reason: string) => { exits.push(reason); },
    };
    const plugin = new (class extends BallMoveGameplay {
        constructor() { super({ presentation, host: host as never }); }
    })();
    // 直接驱动插件（与 snakeGameplay 测试同口径）：handleInput 的守卫要求 context 是 start 时那一个对象。
    const context = { room, signal: new AbortController().signal, generation: 1, isActive: () => true };
    await plugin.start(context as never);
    plugin.handleInput({ type: "leave" }, context as never);
    plugin.handleInput({ type: "leave" }, context as never);
    await Promise.resolve();
    assert.deepEqual(exits, ["user-exit"], "重复点击只请求一次退出");
    plugin.dispose();
});
