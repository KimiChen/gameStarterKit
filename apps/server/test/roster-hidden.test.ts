/**
 * MMO MF5a-B4 `roster` 开关（docs/MMO.md §4.3 D4 / §5.4 MF5a，M07）：名册与客户端 Schema 投影分离。
 *  - 生成物：`viewFixture`（manifest roster:"hidden"）的 root 没有 players map、没有 player Schema 类；
 *    `ROOM_STATE_ROSTER` / `GAMEPLAY_CATALOG.roster` 登记可见性；shared validator 对带 players 的快照 exact-keys 拒；
 *    既有 public mode 的 player 类 / 构造表原样；
 *  - GameRoom：hidden 房的名册只在服务端座位表——容量 / 重复 / 首人开局 / 离座回填 / 聊天署名全部按座位表判定，
 *    真实 Schema 序列化（toJSON）不含名册；createPlayer 返回普通对象即可（无 player 类）。
 * 变异验证：生成器删「hidden root ⛔ players」拒绝 → gameplay-codegen 反例转红；GameRoom 对 hidden 也写 Schema players →
 * 「toJSON 不含名册」/ 入座转红（root 没有 players 属性）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    ErrorCode,
    GAME_ROOM_PROTOCOL_VERSION,
    GAMEPLAY_CATALOG,
    GamePhase,
    S2C,
    validateRoomStateForMode,
    WireValidationError,
    type IGameRoomJoinOptions,
} from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import type { GameMode } from "../src/rooms/GameMode";
import { resolveRoomProfile } from "../src/rooms/core/RoomProfile";
import {
    createRoomPlayerForMode,
    createRoomStateForMode,
    ROOM_STATE_PLAYER_CONSTRUCTORS,
    ROOM_STATE_ROSTER,
    ViewFixtureState,
} from "../src/rooms/schema/GameRoomState";

const MODE_ID = "viewFixture";

test("生成物：hidden root 无 players / 无 player 类；ROOM_STATE_ROSTER 与 catalog 登记；public mode 原样", () => {
    assert.equal(ROOM_STATE_ROSTER.viewFixture, "hidden");
    assert.equal(ROOM_STATE_ROSTER.dropInFixture, "public");
    assert.equal(GAMEPLAY_CATALOG.viewFixture.roster, "hidden");
    assert.equal(GAMEPLAY_CATALOG.ballMove.roster, "public");
    const root = createRoomStateForMode(MODE_ID);
    assert.ok(root instanceof ViewFixtureState);
    assert.equal((root as unknown as { players?: unknown }).players, undefined, "hidden root 没有 players 属性");
    assert.deepEqual(Object.keys(root.toJSON()).sort(), ["matchId", "phase", "revision", "tick"]);
    assert.equal(Object.prototype.hasOwnProperty.call(ROOM_STATE_PLAYER_CONSTRUCTORS, MODE_ID), false, "hidden mode 不在 player 构造表");
    assert.throws(() => createRoomPlayerForMode(MODE_ID), /hidden roster/u);
    assert.ok(createRoomPlayerForMode("dropInFixture"), "public mode 的 player 类原样");
    // shared validator：名册字段对 hidden root 是陌生键（exact keys）
    const snapshot = { tick: 0, phase: GamePhase.Waiting, matchId: "", revision: 0 };
    assert.deepEqual(validateRoomStateForMode(MODE_ID, snapshot), snapshot);
    assert.throws(() => validateRoomStateForMode(MODE_ID, { ...snapshot, players: {} }), (error: unknown) => error instanceof WireValidationError);
});

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string; profile: string };
    sent: Array<readonly [string, unknown]>;
    send: (type: string, payload: unknown) => void;
};
function client(sessionId: string): FakeClient {
    const sent: Array<readonly [string, unknown]> = [];
    return { sessionId, auth: { userId: `u-${sessionId}`, sId: 0, mode: MODE_ID, profile: "dropIn" }, sent, send(type, payload) { sent.push([type, payload]); } };
}
function joinOptions(): IGameRoomJoinOptions {
    return { v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: MODE_ID, modeVersion: GAMEPLAY_CATALOG.viewFixture.modeVersion, profile: "dropIn" };
}
/** hidden 名册 mode：createPlayer 返回普通对象（没有 player Schema 类可 new）。 */
function createHiddenMode(): GameMode<ViewFixtureState, { id: string; name: string }> {
    return {
        id: MODE_ID,
        roster: { min: 1, max: 8, autoStart: 1 },
        createPlayer({ sessionId, name }) { return { id: sessionId, name }; },
    };
}
async function buildHiddenRoom(): Promise<GameRoom> {
    const room = new GameRoom({ seed: 7, clock: () => 0, fixedStepMs: 50, mode: createHiddenMode(), profile: resolveRoomProfile(MODE_ID, "dropIn") });
    const internals = room as unknown as { setSimulationInterval(cb: () => void, delay: number): void; lock(): Promise<void>; unlock(): Promise<void>; roomId: string };
    internals.setSimulationInterval = () => undefined;
    internals.lock = async () => undefined;
    internals.unlock = async () => undefined;
    internals.roomId = "view-room";
    await room.onCreate(joinOptions());
    return room;
}
/** 未 boot 的房间没有可观察的 client：捕获 shell 的广播落点（同 game-room-wire-contract 的做法）。 */
function captureBroadcasts(room: GameRoom): Array<readonly [string, unknown]> {
    const broadcasts: Array<readonly [string, unknown]> = [];
    const internals = room as unknown as { broadcastS2C(type: string, payload: unknown): void };
    internals.broadcastS2C = (type, payload) => { broadcasts.push([type, payload]); };
    return broadcasts;
}
function dispatch(room: GameRoom, type: string, who: unknown, payload: unknown): void {
    (room.messages as unknown as Record<string, (c: unknown, t: string, p: unknown) => void>)["_"](who, type, payload);
}
async function expectJoinRefused(room: GameRoom, who: FakeClient, code: number): Promise<void> {
    await assert.rejects(room.onJoin(who as never, joinOptions()), (error: unknown) => error instanceof Error && error.message.includes(String(code)));
}

test("GameRoom（hidden）：名册只在座位表——首人开局、容量 / 重复按座位表、离座回填、聊天署名；Schema toJSON 不含名册", async () => {
    const room = await buildHiddenRoom();
    assert.equal((room.state as unknown as { players?: unknown }).players, undefined);
    const a = client("a");
    await room.onJoin(a as never, joinOptions());
    assert.equal(room.state.phase, GamePhase.Playing, "drop-in 首人即开局（按座位表 size ≥ autoStart）");
    assert.equal(room.seatedCount, 1);
    assert.deepEqual(room.seatedSessionIds(), ["a"]);
    const serialized = (): string[] => Object.keys((room.state as unknown as { toJSON(): Record<string, unknown> }).toJSON()).sort();
    assert.deepEqual(serialized(), ["matchId", "phase", "revision", "tick"], "真实 Schema 序列化 ⛔ 不含名册 / 视口");
    await expectJoinRefused(room, client("a"), ErrorCode.AlreadyInRoom);
    const others = ["b", "c", "d", "e", "f", "g", "h"].map(client);
    for (const who of others) await room.onJoin(who as never, joinOptions());
    assert.equal(room.seatedCount, 8);
    await expectJoinRefused(room, client("i"), ErrorCode.RoomFull);
    // 聊天署名读座位表（hidden 房没有 Schema player 可读）；未入座者的聊天静默丢弃
    const broadcasts = captureBroadcasts(room);
    dispatch(room, C2S.Chat, a, { text: "hi" });
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0]?.[0], S2C.Chat);
    assert.equal((broadcasts[0]?.[1] as { fromId: string }).fromId, "a");
    assert.equal(typeof (broadcasts[0]?.[1] as { fromName: string }).fromName, "string", "署名来自座位表的 name");
    dispatch(room, C2S.Chat, client("stranger"), { text: "hi" });
    assert.equal(broadcasts.length, 1, "未入座 ⛔ 不广播");
    // 主动离开 → 座位回填
    await room.onLeave(others[0] as never, 4000);
    assert.equal(room.seatedCount, 7);
    assert.deepEqual(room.seatedSessionIds().includes("b"), false);
    await room.onJoin(client("b2") as never, joinOptions());
    assert.equal(room.seatedCount, 8);
    assert.deepEqual(serialized(), ["matchId", "phase", "revision", "tick"]);
    await room.onDispose();
});
