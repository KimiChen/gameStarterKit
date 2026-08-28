import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    C2S_RUNTIME_VALIDATORS,
    ErrorCode,
    GamePhase,
    S2C,
    validateGameRoomState,
    validatePlayerState,
    type C2SType,
} from "@game/shared";
import { GameRoom, GAME_ROOM_C2S_SCHEMAS } from "../src/rooms/GameRoom";
import { GameRoomState, PlayerState } from "../src/rooms/schema/GameRoomState";

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

function handledByGameRoom(type: C2SType, value: unknown): {
    captured: Array<{ type: C2SType; payload: unknown }>;
    sent: Array<[string, unknown]>;
} {
    const captured: Array<{ type: C2SType; payload: unknown }> = [];
    const sent: Array<[string, unknown]> = [];
    const room = new GameRoom({
        seed: 1,
        clock: () => 0,
        mode: {
            id: "wire-contract-probe",
            onMessage(message) {
                captured.push({ type: message.type, payload: message.payload });
                return true;
            },
        },
    });
    room.state.phase = type === C2S.Move || type === C2S.CastSkill
        ? GamePhase.Playing
        : GamePhase.Waiting;
    const client = {
        sessionId: "wire-client",
        send(sentType: string, payload: unknown) {
            sent.push([sentType, payload]);
        },
    };
    const handlers = room.messages as Record<C2SType, (client: unknown, payload: unknown) => void>;
    handlers[type](client, value);
    return { captured, sent };
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
};

test("GameRoom C2S boundary is sourced from shared validators", () => {
    const room = new GameRoom({ seed: 1, clock: () => 0 });
    assert.deepEqual(
        Object.keys(GAME_ROOM_C2S_SCHEMAS).sort(),
        Object.keys(C2S_RUNTIME_VALIDATORS).sort(),
        "server and shared must register the same C2S message set",
    );
    assert.deepEqual(
        Object.keys(room.messages).sort(),
        Object.keys(C2S_RUNTIME_VALIDATORS).sort(),
        "actual GameRoom handlers and shared must register the same C2S message set",
    );

    for (const [rawType, vectors] of Object.entries(c2sVectors)) {
        const type = rawType as C2SType;
        const shared = C2S_RUNTIME_VALIDATORS[type] as (value: unknown) => unknown;
        const server = GAME_ROOM_C2S_SCHEMAS[type];
        for (const vector of vectors) {
            const sharedResult = acceptedBy(shared, vector.value);
            const serverResult = server.safeParse(vector.value);
            assert.equal(sharedResult.accepted, vector.accepted, `${type} shared ${vector.label}`);
            assert.equal(serverResult.success, vector.accepted, `${type} server ${vector.label}`);
            assert.equal(
                serverResult.success,
                sharedResult.accepted,
                `${type} server/shared acceptance drift: ${vector.label}`,
            );
            if (sharedResult.accepted && serverResult.success) {
                assert.deepEqual(serverResult.data, sharedResult.data, `${type} normalized result drift: ${vector.label}`);
            }

            const handled = handledByGameRoom(type, vector.value);
            if (sharedResult.accepted) {
                assert.deepEqual(
                    handled.captured,
                    [{ type, payload: sharedResult.data }],
                    `${type} actual handler normalization drift: ${vector.label}`,
                );
                assert.deepEqual(handled.sent, [], `${type} valid payload emitted an error: ${vector.label}`);
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
    player.lastCastAt = { 1: 1234 };
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
