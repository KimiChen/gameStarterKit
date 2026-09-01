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
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join as joinPath } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
    ErrorCode,
    GAME_ROOM_PROTOCOL_VERSION,
    GameplayModeId,
    LOBBY_PROTOCOL_VERSION,
} from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import { registerBallMoveGameMode } from "../src/rooms/modes/ballMove/index";
import { LobbyRoom } from "../src/websocket/LobbyRoom";

// GameRoom.onAuth 先验 mode 已登记再验 token；玩法登记在组合根，测试进程自行补齐。
registerBallMoveGameMode();

const SRC_ROOT = joinPath(fileURLToPath(import.meta.url), "../../src");
const assertCode = (code: number) => (error: unknown): boolean =>
    error instanceof Error && error.message.includes(String(code));

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
    const mode = GameplayModeId.BallMove;
    await assert.rejects(
        GameRoom.onAuth("", { v: GAME_ROOM_PROTOCOL_VERSION + 1, sId: 0, mode }, undefined as never),
        assertCode(ErrorCode.ProtocolMismatch),
    );
    await assert.rejects(
        GameRoom.onAuth("", { v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode }, undefined as never),
        assertCode(ErrorCode.TokenExpired),
    );
    const room = new GameRoom({ seed: 4801 });
    assert.throws(
        () => room.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION + 1, sId: 0, mode }),
        assertCode(ErrorCode.ProtocolMismatch),
    );
});

test("版本矩阵源码钉：两房间各只比较自己的整数，另一个整数不得参与拒绝（变异即红）", () => {
    const lobbySource = readFileSync(joinPath(SRC_ROOT, "websocket/LobbyRoom.ts"), "utf8");
    const gameSource = readFileSync(joinPath(SRC_ROOT, "rooms/GameRoom.ts"), "utf8");

    // 比较位点：各自的闸只引用自己的常量。
    assert.match(lobbySource, /\(joinOptions\.v \?\? 1\) !== LOBBY_PROTOCOL_VERSION/u);
    assert.match(gameSource, /\(joinOptions\.v \?\? 1\) !== GAME_ROOM_PROTOCOL_VERSION/u);
    assert.match(gameSource, /&& version !== GAME_ROOM_PROTOCOL_VERSION\)/u,
        "legacy preflight 也必须比较 GAME_ROOM_PROTOCOL_VERSION");

    // 「另一个整数参与拒绝」的变异守门：对方常量不得出现在任何比较表达式里。
    const comparesWith = (source: string, name: string): boolean =>
        new RegExp(`${name}\\s*(?:===|!==|==|!=|<=|>=|<|>)|(?:===|!==|==|!=|<=|>=|<|>)\\s*${name}`, "u").test(source);
    assert.equal(comparesWith(lobbySource, "GAME_ROOM_PROTOCOL_VERSION"), false,
        "LobbyRoom 不得把 GAME_ROOM_PROTOCOL_VERSION 用于比较（§4.8：Lobby join 只比较 LOBBY）");
    assert.equal(comparesWith(gameSource, "LOBBY_PROTOCOL_VERSION"), false,
        "GameRoom 不得把 LOBBY_PROTOCOL_VERSION 用于比较（§4.8：Game join 只比较 GAME_ROOM）");

    // import 绑定：对方常量连 import 都不允许（注释提及不受限）。旧名必须绝迹。
    const sharedImportOf = (source: string): string => {
        const match = source.match(/import \{([\s\S]*?)\} from "@game\/shared";/u);
        assert.ok(match, "缺少来自 @game/shared 的具名导入块");
        return match![1];
    };
    assert.match(sharedImportOf(lobbySource), /\bLOBBY_PROTOCOL_VERSION\b/u);
    assert.doesNotMatch(sharedImportOf(lobbySource), /\bGAME_ROOM_PROTOCOL_VERSION\b/u);
    assert.match(sharedImportOf(gameSource), /\bGAME_ROOM_PROTOCOL_VERSION\b/u);
    assert.doesNotMatch(sharedImportOf(gameSource), /\bLOBBY_PROTOCOL_VERSION\b/u);
    // \b 在 `_P` 之间不成立，因此该断言不会误伤两个新常量名，只抓裸旧名。
    assert.doesNotMatch(lobbySource, /\bPROTOCOL_VERSION\b/u, "旧名 PROTOCOL_VERSION 已移除");
    assert.doesNotMatch(gameSource, /\bPROTOCOL_VERSION\b/u, "旧名 PROTOCOL_VERSION 已移除");
});
