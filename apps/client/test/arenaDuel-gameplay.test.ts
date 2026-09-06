/**
 * arenaDuel（kits/arena 决斗 mode）客户端逻辑：start 装载 presentation 与房间观察；strike 只在 Playing 期发；
 * 模型带对手命中数；结算后停留 ARENA_DUEL_SETTLE_LINGER_SECONDS 再 requestExit("settled")；「离开」→ "user-exit"。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameplayContext } from "../src/logic/gameplay/index";
import { GamePhase } from "../src/shared/index";
import type { GameplayInstanceHost } from "../src/logic/gameplay/GameplayModule";
import {
    createArenaDuelGameplay,
    ARENA_DUEL_SETTLE_LINGER_SECONDS,
    type ArenaDuelInput,
    type ArenaDuelRoom,
    type ArenaDuelRoomObserver,
    type ArenaDuelViewModel,
} from "../src/logic/rooms/arenaDuel/ArenaDuelGameplay";

function fakeRoom() {
    let observer: ArenaDuelRoomObserver | null = null;
    const room = {
        roomId: "r1",
        sessionId: "me",
        dropping: false,
        strikes: 0,
        unobserved: 0,
        strike() { room.strikes += 1; },
        observe(next: ArenaDuelRoomObserver) { observer = next; return () => { room.unobserved += 1; }; },
        get observer() { return observer!; },
    };
    return room as typeof room & ArenaDuelRoom;
}

function fakeHost() {
    const host = {
        generation: 1,
        exits: [] as string[],
        isActive: () => true,
        dispatchInput: async (_input: ArenaDuelInput) => true,
        requestExit: async (reason: "user-exit" | "settled") => { host.exits.push(reason); },
    };
    return host as typeof host & GameplayInstanceHost<ArenaDuelInput>;
}

function fakePresentation() {
    const presentation = { mounted: 0, unmounted: 0, models: [] as ArenaDuelViewModel[], mount() { presentation.mounted += 1; }, render(model: ArenaDuelViewModel) { presentation.models.push(model); }, unmount() { presentation.unmounted += 1; } };
    return presentation;
}

function context(room: ArenaDuelRoom, active = () => true): GameplayContext<ArenaDuelRoom> {
    return { room, signal: new AbortController().signal, generation: 1, isActive: active };
}

test("arenaDuel：start 挂载并观察；strike 只在 Playing 期发；模型带 hp / 自己与对手命中数", async () => {
    const room = fakeRoom();
    const presentation = fakePresentation();
    const plugin = createArenaDuelGameplay({ host: fakeHost(), presentation });
    const ctx = context(room);
    await plugin.start(ctx);
    assert.equal(presentation.mounted, 1);
    plugin.handleInput({ type: "strike" }, ctx);
    assert.equal(room.strikes, 0, "Waiting 期不发 strike");
    room.observer.addPlayer("me", "Me", 0, true);
    plugin.tick(0.016, ctx);
    assert.equal(presentation.models.at(-1)!.opponentHits, null, "没有对手");
    room.observer.root(GamePhase.Playing, 3, "");
    room.observer.addPlayer("p2", "Bob", 2, false);
    plugin.handleInput({ type: "strike" }, ctx);
    assert.equal(room.strikes, 1);
    room.observer.changePlayer("me", 1);
    plugin.tick(0.016, ctx);
    const model = presentation.models.at(-1)!;
    assert.equal(model.phase, GamePhase.Playing);
    assert.equal(model.hp, 3);
    assert.equal(model.selfHits, 1);
    assert.equal(model.opponentHits, 2);
    assert.deepEqual(model.players.map((p) => [p.name, p.hits, p.isSelf]), [["Bob", 2, false], ["Me", 1, true]]);
    plugin.stop("manual" as never);
    assert.equal(presentation.unmounted, 1);
    assert.equal(room.unobserved, 1);
    plugin.dispose();
    assert.equal(presentation.unmounted, 1, "stop/dispose 幂等");
});

test("arenaDuel：结算后停留再 requestExit(settled)，只请求一次；对手赢时 selfWon=false；leave → user-exit", async () => {
    const room = fakeRoom();
    const host = fakeHost();
    const presentation = fakePresentation();
    const plugin = createArenaDuelGameplay({ host, presentation });
    const ctx = context(room);
    await plugin.start(ctx);
    room.observer.addPlayer("me", "Me", 0, true);
    room.observer.addPlayer("p2", "Bob", 3, false);
    room.observer.root(GamePhase.Playing, 3, "");
    room.observer.root(GamePhase.Settle, 3, "p2");
    plugin.tick(ARENA_DUEL_SETTLE_LINGER_SECONDS / 2, ctx);
    assert.deepEqual(host.exits, []);
    const model = presentation.models.at(-1)!;
    assert.equal(model.selfWon, false);
    assert.equal(model.winnerName, "Bob");
    plugin.tick(ARENA_DUEL_SETTLE_LINGER_SECONDS, ctx);
    plugin.tick(1, ctx);
    assert.deepEqual(host.exits, ["settled"]);
    plugin.handleInput({ type: "strike" }, ctx);
    assert.equal(room.strikes, 0, "结算后不再发 strike");

    const room2 = fakeRoom();
    const host2 = fakeHost();
    const plugin2 = createArenaDuelGameplay({ host: host2, presentation: fakePresentation() });
    const ctx2 = context(room2);
    await plugin2.start(ctx2);
    plugin2.handleInput({ type: "leave" }, ctx2);
    plugin2.handleInput({ type: "leave" }, ctx2);
    await Promise.resolve();
    assert.deepEqual(host2.exits, ["user-exit"]);
});

test("arenaDuel：presentation 缺失 → start 抛错；context 失活后输入/tick 被忽略", async () => {
    const room = fakeRoom();
    await assert.rejects(createArenaDuelGameplay({ host: fakeHost() }).start(context(room)), /presentation/u);
    const presentation = fakePresentation();
    const plugin = createArenaDuelGameplay({ host: fakeHost(), presentation });
    let active = true;
    const ctx = context(room, () => active);
    await plugin.start(ctx);
    room.observer.root(GamePhase.Playing, 2, "");
    active = false;
    plugin.handleInput({ type: "strike" }, ctx);
    assert.equal(room.strikes, 0);
    const before = presentation.models.length;
    plugin.tick(0.5, ctx);
    assert.equal(presentation.models.length, before);
});
