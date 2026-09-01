import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    C2S_RUNTIME_VALIDATORS,
    ErrorCode,
    GAME_WIRE_OWNERS,
    GamePhase,
    S2C,
    validateGameRoomState,
    validatePlayerState,
    validateS2CPayload,
    type C2SType,
    type S2CType,
} from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import { createBallMoveGameMode } from "../src/rooms/modes/ballMove/index";
import { createIdleGameMode } from "../src/rooms/modes/IdleGameMode";
import {
    GameRoomState,
    IdlePlayerState,
    PlayerState,
} from "../src/rooms/schema/GameRoomState";

type Vector = {
    label: string;
    value: unknown;
    accepted: boolean;
};

function acceptedBy(validator: (value: unknown) => unknown, value: unknown): { accepted: boolean; data?: unknown } {
    try {
        return { accepted: true, data: validator(value) };
    } catch {
        return { accepted: false };
    }
}

/**
 * 真 GameRoom + catch-all 单入口的行为探针。owner 分发是 wire catalog 的事实：
 * Move/CastSkill 只有 ballMove 房能收，IdlePulse 只有 idle 房能收，Ping/Chat 属 core
 * （任何 mode 的房都收）。玩法消息经 commands 捕获归一化 payload；core 消息按 shell
 * 行为断言（Ping→Pong 回包，Chat→广播）。
 */
function handledByGameRoom(type: C2SType, value: unknown): {
    captured: Array<{ type: C2SType; payload: unknown }>;
    sent: Array<[string, unknown]>;
    broadcasts: Array<[string, unknown]>;
} {
    const captured: Array<{ type: C2SType; payload: unknown }> = [];
    const sent: Array<[string, unknown]> = [];
    const broadcasts: Array<[string, unknown]> = [];
    const capture = (messageType: C2SType) => (_context: unknown, payload: unknown) => {
        captured.push({ type: messageType, payload });
    };
    const owner = GAME_WIRE_OWNERS[type];
    const mode = owner === "idle"
        ? {
            ...createIdleGameMode(),
            commands: { [C2S.IdlePulse]: capture(C2S.IdlePulse) },
        }
        : {
            ...createBallMoveGameMode(),
            commands: {
                [C2S.Move]: capture(C2S.Move),
                [C2S.CastSkill]: capture(C2S.CastSkill),
            },
        };
    const room = new GameRoom({ seed: 1, clock: () => 0, mode: mode as never });
    room.state.phase = owner === "core" ? GamePhase.Waiting : GamePhase.Playing;
    if (type === C2S.Chat) {
        // shell 的 Chat 广播要求发送者已入座（读 player.name）。
        const player = owner === "idle" ? new IdlePlayerState() : new PlayerState();
        player.id = "wire-client";
        player.name = "契约探针";
        room.state.players.set(player.id, player as PlayerState);
    }
    // 广播在未 boot 的房间没有可观察的 client；这里在既有校验路径外记录归一化结果。
    const internals = room as unknown as { broadcastS2C(type: S2CType, payload: unknown): void };
    const realBroadcast = internals.broadcastS2C.bind(room);
    internals.broadcastS2C = (sentType, payload) => {
        broadcasts.push([sentType, validateS2CPayload(sentType, payload)]);
        realBroadcast(sentType, payload);
    };
    const client = {
        sessionId: "wire-client",
        send(sentType: string, payload: unknown) {
            sent.push([sentType, payload]);
        },
    };
    (room.messages as unknown as { _: (c: unknown, t: string, p: unknown) => void })._(client, type, value);
    return { captured, sent, broadcasts };
}

function symbolExtra(value: Record<string, unknown>): Record<string, unknown> {
    (value as Record<PropertyKey, unknown>)[Symbol("extra")] = true;
    return value;
}

const pingClass = class {
    clientTime = 0;
};
const inheritedPing = Object.create({ clientTime: 0 }) as Record<string, unknown>;
const nonEnumerablePing: Record<string, unknown> = {};
Object.defineProperty(nonEnumerablePing, "clientTime", { value: 0, enumerable: false });

const c2sVectors: Record<C2SType, readonly Vector[]> = {
    [C2S.Ping]: [
        { label: "zero", value: { clientTime: 0 }, accepted: true },
        { label: "safe integer max", value: { clientTime: Number.MAX_SAFE_INTEGER }, accepted: true },
        { label: "negative", value: { clientTime: -1 }, accepted: false },
        { label: "unsafe integer", value: { clientTime: Number.MAX_SAFE_INTEGER + 1 }, accepted: false },
        { label: "fraction", value: { clientTime: 1.5 }, accepted: false },
        { label: "nan", value: { clientTime: Number.NaN }, accepted: false },
        { label: "infinity", value: { clientTime: Number.POSITIVE_INFINITY }, accepted: false },
        { label: "wrong type", value: { clientTime: "1" }, accepted: false },
        { label: "missing", value: {}, accepted: false },
        { label: "extra key", value: { clientTime: 0, extra: true }, accepted: false },
        { label: "symbol key", value: symbolExtra({ clientTime: 0 }), accepted: false },
        { label: "class instance", value: new pingClass(), accepted: false },
        { label: "inherited required key", value: inheritedPing, accepted: false },
        { label: "known non-enumerable key", value: nonEnumerablePing, accepted: true },
        { label: "null prototype", value: Object.assign(Object.create(null), { clientTime: 0 }), accepted: true },
    ],
    [C2S.Move]: [
        { label: "both lower", value: { dirX: -1, dirY: -1 }, accepted: true },
        { label: "both upper", value: { dirX: 1, dirY: 1 }, accepted: true },
        { label: "fraction", value: { dirX: 0.25, dirY: -0.25 }, accepted: true },
        { label: "x below", value: { dirX: -1.01, dirY: 0 }, accepted: false },
        { label: "y above", value: { dirX: 0, dirY: 1.01 }, accepted: false },
        { label: "nan", value: { dirX: Number.NaN, dirY: 0 }, accepted: false },
        { label: "infinity", value: { dirX: Number.POSITIVE_INFINITY, dirY: 0 }, accepted: false },
        { label: "wrong type", value: { dirX: 0, dirY: "0" }, accepted: false },
        { label: "missing", value: { dirX: 0 }, accepted: false },
        { label: "extra key", value: { dirX: 0, dirY: 0, tick: 1 }, accepted: false },
        { label: "symbol key", value: symbolExtra({ dirX: 0, dirY: 0 }), accepted: false },
    ],
    [C2S.IdlePulse]: [
        { label: "empty object", value: {}, accepted: true },
        { label: "null prototype", value: Object.create(null), accepted: true },
        { label: "extra key", value: { count: 1 }, accepted: false },
        { label: "symbol key", value: symbolExtra({}), accepted: false },
        { label: "array", value: [], accepted: false },
        { label: "null", value: null, accepted: false },
    ],
    [C2S.CastSkill]: [
        { label: "skill lower", value: { skillId: 0 }, accepted: true },
        { label: "skill upper", value: { skillId: 0xffff }, accepted: true },
        { label: "target lower", value: { skillId: 1, targetId: "a" }, accepted: true },
        { label: "target upper", value: { skillId: 1, targetId: "t".repeat(64) }, accepted: true },
        { label: "explicit undefined target", value: { skillId: 1, targetId: undefined }, accepted: true },
        { label: "skill negative", value: { skillId: -1 }, accepted: false },
        { label: "skill above", value: { skillId: 0x10000 }, accepted: false },
        { label: "skill fraction", value: { skillId: 1.5 }, accepted: false },
        { label: "skill nan", value: { skillId: Number.NaN }, accepted: false },
        { label: "target empty", value: { skillId: 1, targetId: "" }, accepted: false },
        { label: "target overlong", value: { skillId: 1, targetId: "t".repeat(65) }, accepted: false },
        { label: "target wrong type", value: { skillId: 1, targetId: 1 }, accepted: false },
        { label: "extra key", value: { skillId: 1, tick: 1 }, accepted: false },
        { label: "symbol key", value: symbolExtra({ skillId: 1 }), accepted: false },
    ],
    [C2S.Chat]: [
        { label: "one character", value: { text: "x" }, accepted: true },
        { label: "max length", value: { text: "x".repeat(100) }, accepted: true },
        { label: "trimmed content", value: { text: " x " }, accepted: true },
        { label: "empty", value: { text: "" }, accepted: false },
        { label: "only spaces", value: { text: " ".repeat(100) }, accepted: false },
        { label: "only control whitespace", value: { text: " \t\n" }, accepted: false },
        { label: "overlong", value: { text: "x".repeat(101) }, accepted: false },
        { label: "wrong type", value: { text: 1 }, accepted: false },
        { label: "extra key", value: { text: "x", channel: "global" }, accepted: false },
        { label: "symbol key", value: symbolExtra({ text: "x" }), accepted: false },
    ],
    // §10.1：Ready/Start payload 均 exact（去掉任一 exact-keys 断言 → 本矩阵转红）。
    [C2S.RoomReady]: [
        { label: "ready true", value: { ready: true }, accepted: true },
        { label: "ready false", value: { ready: false }, accepted: true },
        { label: "missing", value: {}, accepted: false },
        { label: "wrong type", value: { ready: 1 }, accepted: false },
        { label: "stringly bool", value: { ready: "true" }, accepted: false },
        { label: "extra key", value: { ready: true, seat: 1 }, accepted: false },
        { label: "symbol key", value: symbolExtra({ ready: true }), accepted: false },
        { label: "null", value: null, accepted: false },
    ],
    [C2S.RoomStart]: [
        { label: "empty object", value: {}, accepted: true },
        { label: "null prototype", value: Object.create(null), accepted: true },
        { label: "extra key", value: { force: true }, accepted: false },
        { label: "symbol key", value: symbolExtra({}), accepted: false },
        { label: "array", value: [], accepted: false },
        { label: "null", value: null, accepted: false },
    ],
};

test("GameRoom C2S boundary is sourced from the generated wire catalog", () => {
    const room = new GameRoom({ seed: 1, clock: () => 0 });
    // 三方一致：wire catalog 的 C2S 键集 == runtime validator 键集 == 本向量矩阵覆盖集。
    const catalogC2S = Object.keys(GAME_WIRE_OWNERS).filter((type) => type.startsWith("c2s."));
    assert.deepEqual(
        catalogC2S.sort(),
        Object.keys(C2S_RUNTIME_VALIDATORS).sort(),
        "wire catalog and shared validators must register the same C2S message set",
    );
    assert.deepEqual(
        Object.keys(c2sVectors).sort(),
        Object.keys(C2S_RUNTIME_VALIDATORS).sort(),
        "the vector matrix must cover the complete C2S message set",
    );
    // 阶段 2b：房间只注册 catch-all 单入口，任何具名 handler 都是绕闸暗道。
    assert.deepEqual(Object.keys(room.messages), ["_"]);

    for (const [rawType, vectors] of Object.entries(c2sVectors)) {
        const type = rawType as C2SType;
        const shared = C2S_RUNTIME_VALIDATORS[type] as (value: unknown) => unknown;
        for (const vector of vectors) {
            const sharedResult = acceptedBy(shared, vector.value);
            assert.equal(sharedResult.accepted, vector.accepted, `${type} shared ${vector.label}`);

            const handled = handledByGameRoom(type, vector.value);
            if (sharedResult.accepted) {
                if (type === C2S.Ping) {
                    // core Ping：shell 直接回 Pong，归一化 clientTime 原样回带。
                    assert.equal(handled.sent.length, 1, `${type} pong reply count: ${vector.label}`);
                    assert.equal(handled.sent[0][0], S2C.Pong, `${type} pong reply type: ${vector.label}`);
                    assert.equal(
                        (handled.sent[0][1] as { clientTime?: unknown }).clientTime,
                        (sharedResult.data as { clientTime: number }).clientTime,
                        `${type} pong normalization drift: ${vector.label}`,
                    );
                } else if (type === C2S.Chat) {
                    // core Chat：shell 广播归一化后的 trim 文本，不回错误。
                    assert.equal(handled.broadcasts.length, 1, `${type} broadcast count: ${vector.label}`);
                    assert.equal(handled.broadcasts[0][0], S2C.Chat, `${type} broadcast type: ${vector.label}`);
                    assert.equal(
                        (handled.broadcasts[0][1] as { text?: unknown }).text,
                        (sharedResult.data as { text: string }).text.trim(),
                        `${type} chat normalization drift: ${vector.label}`,
                    );
                    assert.deepEqual(handled.sent, [], `${type} valid payload emitted an error: ${vector.label}`);
                } else if (type === C2S.RoomReady || type === C2S.RoomStart) {
                    // core 私房控制消息：auto/default profile 的房间收到即回 BadRequest（§6.2；
                    // owner-ready profile 的行为矩阵在 private-room.test.ts）。
                    assert.deepEqual(handled.captured, [], `${type} core message reached gameplay: ${vector.label}`);
                    assert.equal(handled.sent.length, 1, `${type} auto-profile refusal count: ${vector.label}`);
                    assert.equal(handled.sent[0][0], S2C.Error, `${type} auto-profile refusal type: ${vector.label}`);
                    assert.equal(
                        (handled.sent[0][1] as { code?: unknown }).code,
                        ErrorCode.BadRequest,
                        `${type} auto-profile refusal code: ${vector.label}`,
                    );
                } else {
                    assert.deepEqual(
                        handled.captured,
                        [{ type, payload: sharedResult.data }],
                        `${type} actual handler normalization drift: ${vector.label}`,
                    );
                    assert.deepEqual(handled.sent, [], `${type} valid payload emitted an error: ${vector.label}`);
                }
            } else {
                assert.deepEqual(handled.captured, [], `${type} malformed payload reached gameplay: ${vector.label}`);
                assert.equal(handled.sent.length, 1, `${type} malformed payload reply count: ${vector.label}`);
                assert.equal(handled.sent[0][0], S2C.Error, `${type} malformed payload reply type: ${vector.label}`);
                assert.equal(
                    (handled.sent[0][1] as { code?: unknown }).code,
                    ErrorCode.BadRequest,
                    `${type} malformed payload error code: ${vector.label}`,
                );
            }
        }
    }
});

test("real Colyseus GameRoomState and PlayerState instances satisfy the shared state contract", () => {
    const state = new GameRoomState();
    state.tick = 17;
    state.phase = GamePhase.Playing;
    state.matchId = "match-schema-contract";

    const player = new PlayerState();
    player.id = "session-a";
    player.name = "A";
    player.x = 12.5;
    player.y = 48;
    player.hp = 75;
    player.maxHp = 100;
    player.alive = true;
    // Internal fields must stay out of the wire projection.
    player.dirX = Number.NaN;
    player.dirY = Number.POSITIVE_INFINITY;
    player.level = 99;
    player.lastCastTick = { 1: 1234 };
    state.players.set(player.id, player);

    // Assert the actual Schema projection, rather than only validating a
    // hand-written plain fixture.  This makes a decorated field rename,
    // removal, addition, or accidental exposure of an internal field fail at
    // the server/shared contract boundary.
    const serialized = state.toJSON() as {
        tick: unknown;
        phase: unknown;
        matchId: unknown;
        players: Record<string, Record<string, unknown>>;
    };
    assert.deepEqual(Object.keys(serialized).sort(), ["matchId", "phase", "players", "tick"]);
    assert.deepEqual(
        Object.keys(serialized.players["session-a"]).sort(),
        ["alive", "hp", "id", "maxHp", "name", "x", "y"],
    );
    assert.equal("dirX" in serialized.players["session-a"], false);
    assert.equal("dirY" in serialized.players["session-a"], false);
    assert.equal("level" in serialized.players["session-a"], false);
    assert.deepEqual(
        validateGameRoomState(serialized),
        validateGameRoomState(state),
        "shared validator must accept the exact projection emitted by Colyseus",
    );

    assert.deepEqual(validatePlayerState(player), {
        id: "session-a",
        name: "A",
        x: 12.5,
        y: 48,
        hp: 75,
        maxHp: 100,
        alive: true,
    });
    assert.deepEqual(validateGameRoomState(state), {
        tick: 17,
        phase: GamePhase.Playing,
        matchId: "match-schema-contract",
        players: new Map([
            ["session-a", {
                id: "session-a",
                name: "A",
                x: 12.5,
                y: 48,
                hp: 75,
                maxHp: 100,
                alive: true,
            }],
        ]),
    });

    class LookalikeState {
        toJSON() {
            return state.toJSON();
        }
    }
    assert.throws(
        () => validateGameRoomState(new LookalikeState()),
        /STATE_OBJECT/,
        "仅有 toJSON 的普通 class 不能冒充 Colyseus Schema",
    );
});
