/**
 * 机检：`KICK_CLOSE_CODE` 必须与 Colyseus 保留的关闭码/错误码**不相交**。
 *
 * ⚠ 曾误用 4001/4002/4003 —— 恰好是 Colyseus 的 SERVER_SHUTDOWN / WITH_ERROR / FAILED_TO_RECONNECT：
 * **每次优雅重启，全服在线玩家都会看到「账号已被封禁」并被清 token**；重连耗尽误判「强制下线」、
 * 解码失败误判「顶号」。客户端 `onLeave(code)` 兜底判因（WebSocketClient）无法区分框架码与业务码，
 * 故唯一防线是「取值不撞车」——由本测试锁死。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "@colyseus/shared-types";
import { KICK_CLOSE_CODE } from "@game/shared";

test("KICK_CLOSE_CODE ⛔ 不得与 Colyseus CloseCode / ErrorCode 段撞码", () => {
  const reserved = new Set<number>(Object.values(CloseCode) as number[]);
  for (let c = 4210; c <= 4217; c++) { reserved.add(c); } // @colyseus/shared-types ErrorCode 段
  for (const [reason, code] of Object.entries(KICK_CLOSE_CODE)) {
    assert.ok(!reserved.has(code),
      `KICK_CLOSE_CODE.${reason}=${code} 撞上 Colyseus 保留码（${[...reserved].sort((a, b) => a - b).join(",")}）——` +
      `会把框架的正常关闭误判成被踢。请改到 49xx 段。`);
    assert.ok(code >= 4000 && code <= 4999, `${reason}=${code} 必须在 WebSocket 自定义区 4000–4999`);
  }
  assert.equal(new Set(Object.values(KICK_CLOSE_CODE)).size, Object.keys(KICK_CLOSE_CODE).length, "三个码互不相同");
});
