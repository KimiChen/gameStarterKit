import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    C2S_RUNTIME_VALIDATORS,
    ErrorCode,
    GAME_WIRE_OWNERS,
    GAME_WIRE_PHASES,
    GAMEPLAY_CATALOG,
    GamePhase,
    S2C,
    validateGameRoomState,
    validatePlayerState,
    validateS2CPayload,
    type C2SType,
    type GamePhaseType,
    type S2CType,
} from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import {
    createRoomPlayerForMode,
    GameRoomState,
    PlayerState,
} from "../src/rooms/schema/GameRoomState";
import { discoverC2SVectors } from "./wire-vectors/index";

function acceptedBy(validator: (value: unknown) => unknown, value: unknown): { accepted: boolean; data?: unknown } {
    try {
        return { accepted: true, data: validator(value) };
    } catch {
        return { accepted: false };
    }
}

/** wire owner 全集来自生成的 catalog；玩法 owner = core 之外的那些。⛔ 不手写玩法名。 */
const GAMEPLAY_OWNERS = [...new Set(Object.values(GAME_WIRE_OWNERS))].filter((owner) => owner !== "core").sort();

type CaptureHandler = (context: unknown, payload: unknown) => void;

/**
 * 玩法无关的探针 mode：commands 由该 owner 在 wire catalog 里的**全部** C2S token 自动
 * 构造，player 走生成的 `createRoomPlayerForMode`，roster 上限取 catalog 的 maxPlayers。
 *
 * ⛔ 刻意不依赖任何玩法 mode 的真实实现：本矩阵只验 dispatcher 准入与归一化
 * （owner 闸 / phase / exact validate 都是 shell 行为）。⛔ 也不得在这里写
 * `owner === "<某玩法>"` 分支——那正是本轮要拆掉的耦合。
 */
function probeMode(owner: string, capture: (type: C2SType) => CaptureHandler) {
    const entry = (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, { readonly maxPlayers: number }>>>)[owner];
    if (!entry) throw new Error(`[wire-contract] wire owner ${owner} 不在 GAMEPLAY_CATALOG 里`);
    const commands: Record<string, CaptureHandler> = {};
    for (const [type, tokenOwner] of Object.entries(GAME_WIRE_OWNERS)) {
        if (tokenOwner === owner && type.startsWith("c2s.")) commands[type] = capture(type as C2SType);
    }
    return {
        id: owner,
        roster: { min: 1, max: entry.maxPlayers, autoStart: 1 },
        createPlayer: ({ sessionId }: { sessionId: string }) => {
            const player = createRoomPlayerForMode(owner);
            player.id = sessionId;
            player.name = `probe-${sessionId}`;
            return player;
        },
        commands,
    };
}

/**
 * 真 GameRoom + catch-all 单入口的行为探针。owner 分发是 wire catalog 的事实：
 * 每条玩法消息只有它自己的 owner 房能收，Ping/Chat 属 core（任何 mode 的房都收）。
 * 玩法消息经 commands 捕获归一化 payload；core 消息按 shell 行为断言（Ping→Pong 回包，
 * Chat→广播）。owner/phase 全部读生成的 wire catalog，⛔ 无具名玩法分支。
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
    // core 消息在任何 mode 的房里都由 shell 处理；探针固定用排序后的第一个玩法 owner 承载。
    const hostOwner = owner === "core" ? GAMEPLAY_OWNERS[0] : owner;
    const mode = probeMode(hostOwner, capture);
    const room = new GameRoom({ seed: 1, clock: () => 0, mode: mode as never });
    // 玩法消息取该 token 自己声明的首个合法 phase；core 消息的 phase 规则归 shell。
    const declaredPhases = (GAME_WIRE_PHASES as Readonly<Partial<Record<string, readonly GamePhaseType[]>>>)[type];
    room.state.phase = declaredPhases?.[0] ?? GamePhase.Waiting;
    if (type === C2S.Chat) {
        // shell 的 Chat 广播要求发送者已入座（读 player.name）。
        const player = createRoomPlayerForMode(hostOwner);
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

test("GameRoom C2S boundary is sourced from the generated wire catalog", () => {
    const room = new GameRoom({ seed: 1, clock: () => 0 });
    const discovered = discoverC2SVectors();
    // 归属闸：每份 sidecar 只装自己 owner 的消息（放错文件 = 下一次按 owner 找向量时找不到）。
    for (const [type, entry] of discovered) {
        assert.equal(
            (GAME_WIRE_OWNERS as Readonly<Partial<Record<string, string>>>)[type],
            entry.owner,
            `${type} 的向量放错了 sidecar 文件（wire-vectors/${entry.owner}.ts）`,
        );
    }
    // 三方一致：wire catalog 的 C2S 键集 == runtime validator 键集 == 发现到的向量并集。
    const catalogC2S = Object.keys(GAME_WIRE_OWNERS).filter((type) => type.startsWith("c2s."));
    assert.deepEqual(
        catalogC2S.sort(),
        Object.keys(C2S_RUNTIME_VALIDATORS).sort(),
        "wire catalog and shared validators must register the same C2S message set",
    );
    // ⚠ 双向 deepEqual，⛔ 不许弱化成「向量可选」：少一条向量与多一条无向量的 validator
    //   都必须红（判别力实测见本轮 commit message）。
    assert.deepEqual(
        [...discovered.keys()].sort(),
        Object.keys(C2S_RUNTIME_VALIDATORS).sort(),
        "wire-vectors/ 发现到的向量并集必须与 C2S validator 全集双向相等",
    );
    // 阶段 2b：房间只注册 catch-all 单入口，任何具名 handler 都是绕闸暗道。
    assert.deepEqual(Object.keys(room.messages), ["_"]);

    for (const [rawType, entry] of discovered) {
        const type = rawType as C2SType;
        const vectors = entry.value;
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
