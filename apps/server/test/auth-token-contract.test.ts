import assert from "node:assert/strict";
import { test } from "node:test";
import { ErrorCode, GAME_ROOM_PROTOCOL_VERSION, GameplayModeId, LOBBY_PROTOCOL_VERSION } from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import { registerBallMoveGameMode } from "../src/rooms/modes/ballMove/index";
import { LobbyRoom } from "../src/websocket/LobbyRoom";

// GameRoom.onAuth 先验 mode 已登记再验 token；玩法登记在组合根，测试进程自行补齐。
registerBallMoveGameMode();

const invalidTokenCases = [
  ["", "options-only", "缺失标准 token"],
  ["standard-token", "different-token", "options.token 与标准 token 不一致"],
] as const;

for (const [standardToken, optionToken, label] of invalidTokenCases) {
  test(`GameRoom auth：${label}时拒绝`, async () => {
    await assert.rejects(
      GameRoom.onAuth(standardToken, {
        v: GAME_ROOM_PROTOCOL_VERSION,
        sId: 0,
        token: optionToken,
        mode: GameplayModeId.BallMove,
      }, undefined as never),
      (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.TokenExpired)),
    );
  });

  test(`LobbyRoom auth：${label}时拒绝`, async () => {
    await assert.rejects(
      LobbyRoom.onAuth(standardToken, {
        v: LOBBY_PROTOCOL_VERSION,
        sId: 0,
        token: optionToken,
      }, undefined as never),
      (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.TokenExpired)),
    );
  });
}

test("LobbyRoom auth：拒绝只属于 GameRoom 的 mode 撮合字段", async () => {
  await assert.rejects(
    LobbyRoom.onAuth("", {
      v: LOBBY_PROTOCOL_VERSION,
      sId: 0,
      mode: GameplayModeId.Idle,
    } as never, undefined as never),
    (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
  );
});
