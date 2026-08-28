import assert from "node:assert/strict";
import { test } from "node:test";
import { ErrorCode, PROTOCOL_VERSION } from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import { LobbyRoom } from "../src/websocket/LobbyRoom";

const invalidTokenCases = [
  ["", "options-only", "缺失标准 token"],
  ["standard-token", "different-token", "options.token 与标准 token 不一致"],
] as const;

for (const [standardToken, optionToken, label] of invalidTokenCases) {
  test(`GameRoom auth：${label}时拒绝`, async () => {
    await assert.rejects(
      GameRoom.onAuth(standardToken, {
        v: PROTOCOL_VERSION,
        sId: 0,
        token: optionToken,
      }, undefined as never),
      (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.TokenExpired)),
    );
  });

  test(`LobbyRoom auth：${label}时拒绝`, async () => {
    await assert.rejects(
      LobbyRoom.onAuth(standardToken, {
        v: PROTOCOL_VERSION,
        sId: 0,
        token: optionToken,
      }, undefined as never),
      (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.TokenExpired)),
    );
  });
}
