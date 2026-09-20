/** ChatLogic 无头单测（MMO MF6a-B4）：订阅 / 去重 / 有界缓冲 / 本地预检 / stop 解绑。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatLogic } from "../src/logic/page/ChatLogic";
import type { IChatMessagePush } from "../src/shared/protocol/lobbyRpc/domains/chat";

function harness(bufferSize = 3) {
  let cb: ((m: IChatMessagePush) => void) | null = null;
  const sent: Array<[string, string]> = [];
  const logic = new ChatLogic({
    send: async (channel, text) => { sent.push([channel, text]); return { msgId: `m${sent.length}`, at: 1 }; },
    onPush: (_t, callback) => { cb = callback; return () => { cb = null; }; },
  }, bufferSize);
  const push = (msgId: string, channel = "realm:1"): void => {
    cb?.({ channel, msgId, from: { uid: "u1", name: "甲" }, text: msgId, at: 1 });
  };
  return { logic, push, sent, isBound: () => cb !== null };
}

test("订阅后按频道缓冲、按 msgId 去重、超过 bufferSize 丢最老", () => {
  const h = harness(3);
  const got: string[] = [];
  h.logic.onMessage = (m) => got.push(m.msgId);
  h.logic.start();
  h.push("a"); h.push("b"); h.push("a"); h.push("c"); h.push("d");
  h.push("p1", "party:9");
  assert.deepEqual(got, ["a", "b", "c", "d", "p1"], "重复 msgId 只回调一次");
  assert.deepEqual(h.logic.messagesOf("realm:1").map((m) => m.msgId), ["b", "c", "d"], "有界缓冲丢最老");
  assert.deepEqual(h.logic.messagesOf("party:9").map((m) => m.msgId), ["p1"]);
  assert.deepEqual(h.logic.messagesOf("realm:2"), []);
});

test("send：本地预检 trim 非空 / 上限；回显 ⛔ 不本地插入；stop 解绑、重复 start 不叠订阅", async () => {
  const h = harness();
  h.logic.start();
  await assert.rejects(h.logic.send("realm:1", "   "), /非空/u);
  await assert.rejects(h.logic.send("realm:1", "x".repeat(201)), /200/u);
  const res = await h.logic.send("realm:1", "  hi  ");
  assert.deepEqual(h.sent, [["realm:1", "hi"]]);
  assert.equal(res.msgId, "m1");
  assert.deepEqual(h.logic.messagesOf("realm:1"), [], "回显经推送到达前本地不插入");
  h.logic.start();
  assert.equal(h.isBound(), true);
  h.logic.stop();
  assert.equal(h.isBound(), false);
  h.push("late");
  assert.deepEqual(h.logic.messagesOf("realm:1"), [], "stop 后不再收");
});
