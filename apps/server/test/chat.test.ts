/**
 * chat（docs/MMO.md §6.5 / §6.6；MF6a-B4）单测：sendChat 固定序用假依赖逐条观察；请求 validator 拒 `from`。
 * 变异验证（手工）：sendChat 删 ZSCORE（isPartyMember）校验 → 「非成员」转红；删 realm sId 比较 → 「跨区」转红；
 * 桶失败改放行 → 「CHAT_UNAVAILABLE」转红。真实令牌桶在 test/int/chat.test.ts。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateLobbyRpcRequest } from "@game/shared";
import { validateChatSendReq } from "@game/shared/protocol/lobbyRpc/domains/chat";
import { RateLimitedError, RpcFault } from "../src/core/errors";
import { sendChat, type ChatSendDeps } from "../src/core/chat/send";
import { getChatPolicy, setChatPolicy } from "../src/core/chat/policy";

function deps(overrides: Partial<ChatSendDeps> = {}) {
  const buckets = new Map<string, number>();
  const log: string[] = [];
  const base: ChatSendDeps = {
    now: () => 1_700_000_000_000,
    newMsgId: () => `m${log.length + 1}`,
    bucket: async (scope, capacity) => {
      const used = (buckets.get(scope) ?? 0) + 1;
      buckets.set(scope, used);
      log.push(`bucket:${scope}`);
      return used <= capacity ? capacity - used : -1;
    },
    isPartyMember: async (pid, uid) => { log.push(`member:${pid}:${uid}`); return pid === 5 && uid === "u1"; },
    displayName: async (uid) => `name-of-${uid}`,
    policy: getChatPolicy,
    ...overrides,
  };
  return { deps: base, log };
}
const faultCode = (code: string) => (e: unknown): boolean => e instanceof RpcFault && e.rpcCode === code;

test("授权：跨区 realm 与非成员 party 都是 CHAT_CHANNEL_FORBIDDEN，且拒绝发生在限流之前（不扣桶）", async () => {
  const d = deps();
  await assert.rejects(sendChat("u1", 1, { channel: "realm:2", text: "x" }, d.deps), faultCode("CHAT_CHANNEL_FORBIDDEN"));
  await assert.rejects(sendChat("u1", 1, { channel: "party:6", text: "x" }, d.deps), faultCode("CHAT_CHANNEL_FORBIDDEN"));
  await assert.rejects(sendChat("u2", 1, { channel: "party:5", text: "x" }, d.deps), faultCode("CHAT_CHANNEL_FORBIDDEN"));
  assert.deepEqual(d.log.filter((l) => l.startsWith("bucket:")), [], "被拒的发言不消耗令牌");
});

test("成功：from 服务端盖章（uid = 发送者、name 取档）；realm 走 user 桶 + realm 桶；party 只走 user 桶", async () => {
  const d = deps();
  const realm = await sendChat("u1", 1, { channel: "realm:1", text: "hi" }, d.deps);
  assert.deepEqual(realm.message, { channel: "realm:1", msgId: "m3", from: { uid: "u1", name: "name-of-u1" }, text: "hi", at: 1_700_000_000_000 });
  assert.deepEqual(realm.audience, { kind: "realm", sId: 1 });
  assert.deepEqual(d.log, ["bucket:chat:send:u1", "bucket:chat:realm:s1"]);
  d.log.length = 0;
  const party = await sendChat("u1", 1, { channel: "party:5", text: "yo" }, d.deps);
  assert.deepEqual(party.audience, { kind: "party", partyId: 5 });
  assert.deepEqual(d.log, ["member:5:u1", "bucket:chat:send:u1"]);
});

test("限流：第 4 条连发 RATE_LIMITED；桶基础设施失败 → CHAT_UNAVAILABLE（fail-closed）", async () => {
  const d = deps();
  for (let i = 0; i < 3; i++) await sendChat("u1", 1, { channel: "party:5", text: `n${i}` }, d.deps);
  await assert.rejects(sendChat("u1", 1, { channel: "party:5", text: "n4" }, d.deps), (e: unknown) => e instanceof RateLimitedError);
  const broken = deps({ bucket: async () => { throw new Error("redis down"); } });
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(sendChat("u1", 1, { channel: "realm:1", text: "x" }, broken.deps), faultCode("CHAT_UNAVAILABLE"));
  } finally {
    console.error = originalError;
  }
});

test("策略注入点：canSend=false → CHAT_CHANNEL_FORBIDDEN；transform 生效且越界即拒", async () => {
  try {
    setChatPolicy({ canSend: (ctx) => ctx.channel !== "party:5", transform: (text) => text.replace("bad", "***") });
    const d = deps();
    await assert.rejects(sendChat("u1", 1, { channel: "party:5", text: "x" }, d.deps), faultCode("CHAT_CHANNEL_FORBIDDEN"));
    const r = await sendChat("u1", 1, { channel: "realm:1", text: "so bad" }, d.deps);
    assert.equal(r.message.text, "so ***");
    setChatPolicy({ transform: () => "   " });
    await assert.rejects(sendChat("u1", 1, { channel: "realm:1", text: "x" }, deps().deps), faultCode("CHAT_CHANNEL_FORBIDDEN"));
  } finally {
    setChatPolicy(null);
  }
});

test("请求 validator：含 from → WIRE_KEYS（INVALID_PAYLOAD）；控制字符 / 空白 / 超长拒；文本 trim", () => {
  assert.throws(() => validateChatSendReq({ channel: "realm:1", text: "x", from: { uid: "u9", name: "x" } }), /WIRE_KEYS/u);
  assert.throws(() => validateLobbyRpcRequest("chat.send", { channel: "realm:1", text: "x", from: {} }), /WIRE_KEYS/u);
  assert.throws(() => validateChatSendReq({ channel: "realm:1", text: `a${String.fromCharCode(0)}b` }), /CHAT_TEXT_CONTROL/u);
  assert.throws(() => validateChatSendReq({ channel: "realm:1", text: `a${String.fromCharCode(27)}b` }), /CHAT_TEXT_CONTROL/u);
  assert.throws(() => validateChatSendReq({ channel: "realm:1", text: "   " }), /CHAT_TEXT_EMPTY/u);
  assert.throws(() => validateChatSendReq({ channel: "realm:1", text: "x".repeat(201) }), /WIRE_STRING/u);
  assert.throws(() => validateChatSendReq({ channel: "nearby:1", text: "x" }), /CHAT_CHANNEL/u);
  assert.throws(() => validateChatSendReq({ channel: "party:0", text: "x" }), /CHAT_CHANNEL/u);
  assert.deepEqual(validateChatSendReq({ channel: "party:12", text: "  hi  " }), { channel: "party:12", text: "hi" });
});
