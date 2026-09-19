/**
 * 协议身份版本矩阵（Non-intrusive §4.8 / §10.1，阶段 7）：
 * 拆分后的两个人工兼容整数各管各的 join 闸——
 *  - Lobby join 只比较 `LOBBY_PROTOCOL_VERSION`；
 *  - Game join 只比较 `GAME_ROOM_PROTOCOL_VERSION`；
 *  - 仓库级 protocol fingerprint 只是字节审计锁，⛔ 不参与任何 join 判定。
 *
 * 变异说明（§10.1「Game join 只比较一个整数」行）：当前两整数同值（都为 7），单靠行为
 * 拒绝矩阵无法区分「比较了哪一个」。因此本文件同时钉住两个房间源码的**比较位点与
 * import 绑定**——让另一个整数参与拒绝（例如把 LobbyRoom 的闸改成同时比较
 * GAME_ROOM_PROTOCOL_VERSION，或 GameRoom 反之）时，源码钉先转红；两整数将来取值分叉后，
 * 行为矩阵也会独立转红。
 *
 * MF3-B2 起 Game join 的比较位点在 `rooms/core/RoomAuth.ts`（比较注入的 `protocolVersion`，
 * GameRoom 房型经 `gameRoomAuth` 绑定为 GAME_ROOM_PROTOCOL_VERSION）；`GameRoom.ts` 本身 0 次出现该常量
 * （MF3 退出条件之一），源码钉随之分成「RoomAuth 比较 + 绑定」与「GameRoom 零出现」两半。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join as joinPath } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
    ErrorCode,
    GAME_ROOM_PROTOCOL_VERSION,
    GAMEPLAY_CATALOG,
    GameplayModeId,
    LOBBY_PROTOCOL_VERSION,
    WORLD_ROOM_PROTOCOL_VERSION,
    validateWorldRoomJoinOptions,
    type IWorldRoomJoinOptions,
} from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import { WorldRoom } from "../src/rooms/WorldRoom";
import { WORLD_FIXTURE_MODE_ID, createWorldFixtureMode } from "./fixtures/worldFixtureMode";
import { registerBallMoveGameMode } from "../src/rooms/modes/ballMove/index";
import { LobbyRoom } from "../src/websocket/LobbyRoom";

// GameRoom.onAuth 先验 mode 已登记再验 token；玩法登记在组合根，测试进程自行补齐。
registerBallMoveGameMode();

const SRC_ROOT = joinPath(fileURLToPath(import.meta.url), "../../src");
const assertCode = (code: number) => (error: unknown): boolean =>
    error instanceof Error && error.message.includes(String(code));

/** v8 完整信封（§4.4 必填 modeVersion/profile）；modeVersion 取 catalog 单源。 */
const gameOptions = () => ({
    v: GAME_ROOM_PROTOCOL_VERSION,
    sId: 0,
    mode: GameplayModeId.BallMove,
    modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
    profile: "default",
});

test("版本矩阵：Lobby join 只拿 LOBBY_PROTOCOL_VERSION 判定（正确版本穿过版本闸，错误版本 ProtocolMismatch）", async () => {
    // 错误版本：版本闸先于 token 闸 ⇒ ProtocolMismatch
    await assert.rejects(
        LobbyRoom.onAuth("", { v: LOBBY_PROTOCOL_VERSION + 1, sId: 0 }, undefined as never),
        assertCode(ErrorCode.ProtocolMismatch),
    );
    // 缺省 v 视为 1 ≠ 当前 LOBBY_PROTOCOL_VERSION ⇒ 同样拒绝
    await assert.rejects(
        LobbyRoom.onAuth("", { sId: 0 }, undefined as never),
        assertCode(ErrorCode.ProtocolMismatch),
    );
    // 正确版本：穿过版本闸，落在后面的 token 闸（TokenExpired）——证明比较的就是这一个整数
    await assert.rejects(
        LobbyRoom.onAuth("", { v: LOBBY_PROTOCOL_VERSION, sId: 0 }, undefined as never),
        assertCode(ErrorCode.TokenExpired),
    );
});

test("版本矩阵：Game join 只拿 GAME_ROOM_PROTOCOL_VERSION 判定（onAuth 与 onCreate 同口径）", async () => {
    const options = gameOptions();
    await assert.rejects(
        GameRoom.onAuth("", { ...options, v: GAME_ROOM_PROTOCOL_VERSION + 1 }, undefined as never),
        assertCode(ErrorCode.ProtocolMismatch),
    );
    await assert.rejects(
        GameRoom.onAuth("", options, undefined as never),
        assertCode(ErrorCode.TokenExpired),
    );
    const room = new GameRoom({ seed: 4801 });
    assert.throws(
        () => room.onCreate({ ...options, v: GAME_ROOM_PROTOCOL_VERSION + 1 }),
        assertCode(ErrorCode.ProtocolMismatch),
    );
});

// ── v8 必填切换（§4.4/§9 阶段 8）：旧 v=7 Game join 明确拒绝，Lobby 不受影响 ────────────
// 变异验证：把 GAME_ROOM_PROTOCOL_VERSION 退回 7、或给缺 profile/modeVersion 的 join 走
// 「缺省时随便匹配」的兼容 → 本组转红。
test("版本矩阵 v8：旧 v=7 Game join（无 profile/modeVersion 信封）被 ProtocolMismatch 明确拒绝", async () => {
    assert.equal(GAME_ROOM_PROTOCOL_VERSION, 8, "阶段 8b 的必填切换随 bump 7→8 落地");
    // 旧 v=7 客户端的真实信封：不带 profile/modeVersion。版本闸先于 validator，
    // 给出的是可识别的 ProtocolMismatch（升级提示），⛔ 不是含混的 BadRequest。
    const legacy = { v: 7, sId: 0, mode: GameplayModeId.BallMove };
    await assert.rejects(
        GameRoom.onAuth("", legacy as never, undefined as never),
        assertCode(ErrorCode.ProtocolMismatch),
    );
    const room = new GameRoom({ seed: 4802 });
    assert.throws(() => room.onCreate(legacy as never), assertCode(ErrorCode.ProtocolMismatch));
    // v=8 但缺 profile/modeVersion：validator 收紧后是 BadRequest（⛔ 不注入缺省 profile）。
    await assert.rejects(
        GameRoom.onAuth("", { v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: GameplayModeId.BallMove } as never,
            undefined as never),
        assertCode(ErrorCode.BadRequest),
    );
    // Lobby 不受影响：LOBBY_PROTOCOL_VERSION 仍为 7，v=7 Lobby join 穿过版本闸落在 token 闸。
    assert.equal(LOBBY_PROTOCOL_VERSION, 7, "8b 只 bump GAME_ROOM，Lobby 身份不动");
    await assert.rejects(
        LobbyRoom.onAuth("", { v: 7, sId: 0 }, undefined as never),
        assertCode(ErrorCode.TokenExpired),
    );
});

// ── §4.8 第三层：modeVersion 只影响单玩法拒绝，不参与 core 信封闸 ───────────────────────
// 变异验证：让 modeVersion 参与 `v` 信封闸（或反之）→ 下面「同值不同玩法」的对照转红。
test("版本矩阵：modeVersion 对 catalog 单玩法判定（不匹配拒绝；不影响其他玩法与 core 信封）", async () => {
    const options = gameOptions();
    // 同一 core 信封 v，modeVersion 不匹配 → 单玩法拒绝（ProtocolMismatch：旧玩法包请更新）。
    await assert.rejects(
        GameRoom.onAuth("", { ...options, modeVersion: options.modeVersion + 1 }, undefined as never),
        assertCode(ErrorCode.ProtocolMismatch),
    );
    const room = new GameRoom({ seed: 4803 });
    assert.throws(
        () => room.onCreate({ ...options, modeVersion: options.modeVersion + 1 }),
        assertCode(ErrorCode.ProtocolMismatch),
    );
    // 匹配的 modeVersion 穿过 per-mode 闸落在 token 闸——证明比较的是 catalog 的该玩法整数。
    await assert.rejects(GameRoom.onAuth("", options, undefined as never), assertCode(ErrorCode.TokenExpired));
    // profile 的 admission 双重拒绝（§4.4）：未知/不属该 mode 的 profile 与版本无关，BadRequest。
    await assert.rejects(
        GameRoom.onAuth("", { ...options, profile: "no-such-profile" }, undefined as never),
        assertCode(ErrorCode.BadRequest),
    );
});

test("版本矩阵源码钉：两房间各只比较自己的整数，另一个整数不得参与拒绝（变异即红）", () => {
    const lobbySource = readFileSync(joinPath(SRC_ROOT, "websocket/LobbyRoom.ts"), "utf8");
    const gameSource = readFileSync(joinPath(SRC_ROOT, "rooms/GameRoom.ts"), "utf8");
    const roomAuthSource = readFileSync(joinPath(SRC_ROOT, "rooms/core/RoomAuth.ts"), "utf8");

    // 比较位点：各自的闸只引用自己的常量。
    assert.match(lobbySource, /\(joinOptions\.v \?\? 1\) !== LOBBY_PROTOCOL_VERSION/u);
    // Game join：RoomAuth 比较注入的协议整数，gameRoomAuth 把它绑定为 GAME_ROOM_PROTOCOL_VERSION（MF3-B2）。
    assert.match(roomAuthSource, /\(joinOptions\.v \?\? 1\) !== this\.deps\.protocolVersion/u);
    assert.match(roomAuthSource, /&& version !== this\.deps\.protocolVersion\)/u,
        "legacy preflight 也必须比较注入的协议整数");
    assert.match(roomAuthSource, /protocolVersion: GAME_ROOM_PROTOCOL_VERSION,/u,
        "gameRoomAuth 必须把协议整数绑定为 GAME_ROOM_PROTOCOL_VERSION");
    assert.doesNotMatch(gameSource, /GAME_ROOM_PROTOCOL_VERSION/u,
        "MF3 退出条件：GameRoom.ts 不再出现 GAME_ROOM_PROTOCOL_VERSION（由 RoomAuth 注入）");

    // 「另一个整数参与拒绝」的变异守门：对方常量不得出现在任何比较表达式里。
    const comparesWith = (source: string, name: string): boolean =>
        new RegExp(`${name}\\s*(?:===|!==|==|!=|<=|>=|<|>)|(?:===|!==|==|!=|<=|>=|<|>)\\s*${name}`, "u").test(source);
    assert.equal(comparesWith(lobbySource, "GAME_ROOM_PROTOCOL_VERSION"), false,
        "LobbyRoom 不得把 GAME_ROOM_PROTOCOL_VERSION 用于比较（§4.8：Lobby join 只比较 LOBBY）");
    assert.equal(comparesWith(gameSource, "LOBBY_PROTOCOL_VERSION"), false,
        "GameRoom 不得把 LOBBY_PROTOCOL_VERSION 用于比较（§4.8：Game join 只比较 GAME_ROOM）");
    assert.equal(comparesWith(roomAuthSource, "LOBBY_PROTOCOL_VERSION"), false,
        "RoomAuth 不得把 LOBBY_PROTOCOL_VERSION 用于比较（§4.8）");

    // import 绑定：对方常量连 import 都不允许（注释提及不受限）。旧名必须绝迹。
    const sharedImportOf = (source: string): string => {
        const match = source.match(/import \{([\s\S]*?)\} from "@game\/shared";/u);
        assert.ok(match, "缺少来自 @game/shared 的具名导入块");
        return match![1];
    };
    assert.match(sharedImportOf(lobbySource), /\bLOBBY_PROTOCOL_VERSION\b/u);
    assert.doesNotMatch(sharedImportOf(lobbySource), /\bGAME_ROOM_PROTOCOL_VERSION\b/u);
    assert.match(sharedImportOf(roomAuthSource), /\bGAME_ROOM_PROTOCOL_VERSION\b/u);
    assert.doesNotMatch(sharedImportOf(roomAuthSource), /\bLOBBY_PROTOCOL_VERSION\b/u);
    assert.doesNotMatch(sharedImportOf(gameSource), /\bLOBBY_PROTOCOL_VERSION\b/u);
    // \b 在 `_P` 之间不成立，因此该断言不会误伤两个新常量名，只抓裸旧名。
    assert.doesNotMatch(lobbySource, /\bPROTOCOL_VERSION\b/u, "旧名 PROTOCOL_VERSION 已移除");
    assert.doesNotMatch(gameSource, /\bPROTOCOL_VERSION\b/u, "旧名 PROTOCOL_VERSION 已移除");
    assert.doesNotMatch(roomAuthSource, /\bPROTOCOL_VERSION\b/u, "旧名 PROTOCOL_VERSION 已移除");
});

// ── MMO MF4-B1 / B6：第三个兼容整数 WORLD_ROOM_PROTOCOL_VERSION（比较位点 = RoomAuth 注入，绑定在 rooms/WorldRoom.ts 的 worldRoomAuth）──
test("版本矩阵 World（MF4-B1）：WORLD_ROOM_PROTOCOL_VERSION=1 独立于 GAME_ROOM / LOBBY；既有两房源码零出现；世界 join 信封只认 v 为整数", () => {
    assert.equal(WORLD_ROOM_PROTOCOL_VERSION, 1, "一次定型：首个客户端发版前保持 1");
    assert.notEqual(WORLD_ROOM_PROTOCOL_VERSION, GAME_ROOM_PROTOCOL_VERSION);
    assert.notEqual(WORLD_ROOM_PROTOCOL_VERSION, LOBBY_PROTOCOL_VERSION);
    // 只看代码，不看注释（RoomAuth 的文档注释按设计提到世界整数的注入形态）
    const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    for (const file of ["websocket/LobbyRoom.ts", "rooms/GameRoom.ts", "rooms/core/RoomAuth.ts"]) {
        assert.doesNotMatch(stripComments(readFileSync(joinPath(SRC_ROOT, file), "utf8")), /WORLD_ROOM_PROTOCOL_VERSION/u, `${file} 代码 ⛔ 不得参与世界整数（绑定只在 rooms/WorldRoom.ts）`);
    }
    const envelope = { v: WORLD_ROOM_PROTOCOL_VERSION, sId: 0, mode: "worldFixture", modeVersion: 1, profile: "world", mapId: "m1", personaId: "p_0123456789abcdefXYZ", ticket: "t".repeat(24) };
    assert.equal(validateWorldRoomJoinOptions(envelope).v, 1);
    assert.throws(() => validateWorldRoomJoinOptions({ ...envelope, v: "1" }), "v 必须是整数（形状闸；数值比较在 WorldRoom.onAuth）");
});

test("版本矩阵 World 行为（MF4-B6）：World join 只拿 WORLD_ROOM_PROTOCOL_VERSION 判定；onAuth 与 onCreate 同口径；WorldRoom 源码只绑定世界整数", async () => {
    const worldOptions = (): IWorldRoomJoinOptions => ({
        v: WORLD_ROOM_PROTOCOL_VERSION, sId: 0, mode: WORLD_FIXTURE_MODE_ID, modeVersion: GAMEPLAY_CATALOG.worldFixture.modeVersion,
        profile: "world", mapId: "m1", personaId: "p_0123456789abcdefXYZ", ticket: "t".repeat(24),
    });
    // 错误版本：版本闸先于 mode / token 闸 ⇒ ProtocolMismatch（缺省 v=1 恰是当前世界整数，⛔ 不能拿缺省当反例）
    await assert.rejects(WorldRoom.onAuth("", { ...worldOptions(), v: WORLD_ROOM_PROTOCOL_VERSION + 1 }, undefined as never), assertCode(ErrorCode.ProtocolMismatch));
    await assert.rejects(WorldRoom.onAuth("", { ...worldOptions(), v: GAME_ROOM_PROTOCOL_VERSION }, undefined as never), assertCode(ErrorCode.ProtocolMismatch),
        "GAME_ROOM 的整数对世界 join 就是错误版本（三整数各自演进）");
    // 正确版本穿过版本闸：worldFixture ⛔ 不在生产 worldModeRegistry ⇒ 下一闸 BadRequest（不是 ProtocolMismatch / TokenExpired）
    await assert.rejects(WorldRoom.onAuth("", worldOptions(), undefined as never), assertCode(ErrorCode.BadRequest));
    // onCreate 同口径（注入 mode 的房：信封闸在 mode 校验之前）
    const room = new WorldRoom({ mode: createWorldFixtureMode(), manualTick: true });
    await assert.rejects(room.onCreate({ ...worldOptions(), v: WORLD_ROOM_PROTOCOL_VERSION + 1 }), assertCode(ErrorCode.ProtocolMismatch));

    const worldSource = readFileSync(joinPath(SRC_ROOT, "rooms/WorldRoom.ts"), "utf8");
    assert.match(worldSource, /protocolVersion: WORLD_ROOM_PROTOCOL_VERSION,/u, "worldRoomAuth 必须把协议整数绑定为 WORLD_ROOM_PROTOCOL_VERSION");
    assert.match(worldSource, /validateJoinOptions: validateWorldRoomJoinOptions,/u, "世界信封校验器经 RoomAuth 注入（六步固定序不复制）");
    const comparesWith = (source: string, name: string): boolean =>
        new RegExp(`${name}\\s*(?:===|!==|==|!=|<=|>=|<|>)|(?:===|!==|==|!=|<=|>=|<|>)\\s*${name}`, "u").test(source);
    assert.equal(comparesWith(worldSource, "GAME_ROOM_PROTOCOL_VERSION"), false, "WorldRoom 不得把 GAME_ROOM_PROTOCOL_VERSION 用于比较");
    assert.equal(comparesWith(worldSource, "LOBBY_PROTOCOL_VERSION"), false, "WorldRoom 不得把 LOBBY_PROTOCOL_VERSION 用于比较");
    const sharedImport = worldSource.match(/import \{([\s\S]*?)\} from "@game\/shared";/u);
    assert.ok(sharedImport, "缺少来自 @game/shared 的具名导入块");
    assert.match(sharedImport![1], /\bWORLD_ROOM_PROTOCOL_VERSION\b/u);
    assert.doesNotMatch(sharedImport![1], /\bGAME_ROOM_PROTOCOL_VERSION\b|\bLOBBY_PROTOCOL_VERSION\b/u, "对方常量连 import 都不允许");
    assert.doesNotMatch(worldSource, /\bPROTOCOL_VERSION\b/u, "旧名 PROTOCOL_VERSION 不得出现");
});
