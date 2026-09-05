/**
 * tally 插件（plugins/tally）客户端逻辑：start 装载 presentation 与房间观察；tap 只在 Playing 期发；
 * 结算后停留 TALLY_SETTLE_LINGER_SECONDS 再 requestExit("settled")；「离开」→ "user-exit"；stop 幂等卸载。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameplayContext } from "../src/logic/gameplay/index";
import { GamePhase } from "../src/shared/index";
import type { GameplayInstanceHost } from "../src/logic/gameplay/GameplayModule";
import {
    createTallyGameplay,
    TALLY_SETTLE_LINGER_SECONDS,
    type TallyInput,
    type TallyRoom,
    type TallyRoomObserver,
    type TallyViewModel,
} from "../src/logic/rooms/tally/TallyGameplay";

function fakeRoom() {
    let observer: TallyRoomObserver | null = null;
    const room = {
        roomId: "r1",
        sessionId: "me",
        dropping: false,
        taps: 0,
        unobserved: 0,
        tap() { room.taps += 1; },
        observe(next: TallyRoomObserver) { observer = next; return () => { room.unobserved += 1; }; },
        get observer() { return observer!; },
    };
    return room as typeof room & TallyRoom;
}

function fakeHost() {
    const host = {
        generation: 1,
        exits: [] as string[],
        isActive: () => true,
        dispatchInput: async (_input: TallyInput) => true,
        requestExit: async (reason: "user-exit" | "settled") => { host.exits.push(reason); },
    };
    return host as typeof host & GameplayInstanceHost<TallyInput>;
}

function fakePresentation() {
    const presentation = { mounted: 0, unmounted: 0, models: [] as TallyViewModel[], mount() { presentation.mounted += 1; }, render(model: TallyViewModel) { presentation.models.push(model); }, unmount() { presentation.unmounted += 1; } };
    return presentation;
}

function context(room: TallyRoom, active = () => true): GameplayContext<TallyRoom> {
    return { room, signal: new AbortController().signal, generation: 1, isActive: active };
}

test("tally：start 挂载并观察；tap 只在 Playing 期发；模型按 taps 降序、标记自己", async () => {
    const room = fakeRoom();
    const host = fakeHost();
    const presentation = fakePresentation();
    const plugin = createTallyGameplay({ host, presentation });
    const ctx = context(room);
    await plugin.start(ctx);
    assert.equal(presentation.mounted, 1);
    plugin.handleInput({ type: "tap" }, ctx);
    assert.equal(room.taps, 0, "Waiting 期不发 tap");
    room.observer.root(GamePhase.Playing, 5, "");
    room.observer.addPlayer("me", "Me", 0, true);
    room.observer.addPlayer("p2", "Bob", 3, false);
    plugin.handleInput({ type: "tap" }, ctx);
    assert.equal(room.taps, 1);
    room.observer.changePlayer("me", 1);
    plugin.tick(0.016, ctx);
    const model = presentation.models.at(-1)!;
    assert.equal(model.phase, GamePhase.Playing);
    assert.equal(model.tapGoal, 5);
    assert.equal(model.selfTaps, 1);
    assert.deepEqual(model.players.map((p) => [p.name, p.taps, p.isSelf]), [["Bob", 3, false], ["Me", 1, true]]);
    assert.equal(model.winnerName, null);
    plugin.stop("manual" as never);
    assert.equal(presentation.unmounted, 1);
    assert.equal(room.unobserved, 1);
    plugin.stop("manual" as never);
    plugin.dispose();
    assert.equal(presentation.unmounted, 1, "stop/dispose 幂等");
});

test("tally：结算后停留再 requestExit(settled)，只请求一次；leave → user-exit", async () => {
    const room = fakeRoom();
    const host = fakeHost();
    const presentation = fakePresentation();
    const plugin = createTallyGameplay({ host, presentation });
    const ctx = context(room);
    await plugin.start(ctx);
    room.observer.addPlayer("me", "Me", 0, true);
    room.observer.addPlayer("p2", "Bob", 0, false);
    room.observer.root(GamePhase.Playing, 3, "");
    room.observer.root(GamePhase.Settle, 3, "me");
    plugin.tick(TALLY_SETTLE_LINGER_SECONDS / 2, ctx);
    assert.deepEqual(host.exits, [], "停留期内不退出");
    let model = presentation.models.at(-1)!;
    assert.equal(model.selfWon, true);
    assert.equal(model.winnerName, "Me");
    assert.ok(model.lingerLeft !== null && model.lingerLeft > 0);
    plugin.tick(TALLY_SETTLE_LINGER_SECONDS, ctx);
    plugin.tick(1, ctx);
    assert.deepEqual(host.exits, ["settled"], "到时只请求一次退出");
    plugin.handleInput({ type: "tap" }, ctx);
    assert.equal(room.taps, 0, "结算后不再发 tap");

    const room2 = fakeRoom();
    const host2 = fakeHost();
    const plugin2 = createTallyGameplay({ host: host2, presentation: fakePresentation() });
    const ctx2 = context(room2);
    await plugin2.start(ctx2);
    plugin2.handleInput({ type: "leave" }, ctx2);
    plugin2.handleInput({ type: "leave" }, ctx2);
    await Promise.resolve();
    assert.deepEqual(host2.exits, ["user-exit"]);
    model = plugin2.model();
    assert.equal(model.phase, GamePhase.Waiting);
});

test("tally：presentation 缺失或形状不对 → start 抛错且不留状态；context 失活后输入/tick 被忽略", async () => {
    const room = fakeRoom();
    const bad = createTallyGameplay({ host: fakeHost() });
    await assert.rejects(bad.start(context(room)), /presentation/u);
    const presentation = fakePresentation();
    const plugin = createTallyGameplay({ host: fakeHost(), presentation });
    let active = true;
    const ctx = context(room, () => active);
    await plugin.start(ctx);
    room.observer.root(GamePhase.Playing, 2, "");
    active = false;
    plugin.handleInput({ type: "tap" }, ctx);
    assert.equal(room.taps, 0);
    const before = presentation.models.length;
    plugin.tick(0.5, ctx);
    assert.equal(presentation.models.length, before, "失活后不再渲染");
});
