/**
 * WebSocketClient 无头单测（假房间注入，不走真实 ws）——大厅 RPC 通道的核心语义：
 *  1. rpc 信封按 id 配对：ok 回包 resolve data、错回包按 code 抛 RpcError
 *  2. rpc 超时判 TIMEOUT；迟到回包静默丢弃（不是协议错误）
 *  3. onLeave：在途请求全判 CONN_LOST，之后 rpc 立即拒（未加入）
 *  4. rpcIdem：BUSY/STALE_FENCE 自动短退避重试，全程复用同一 clientReqId（09·I2）
 *  5. rpcIdem：非 BUSY 错误立即抛且回填 clientReqId（跨调用重试必须回传同一个）
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { GuildRpc, LOBBY_MSG_RPC, UserRpc } from "../assets/src/shared/index";
import { RpcError, WebSocketClient } from "../assets/src/net/WebSocketClient";

interface IRpcReplyLite { id: string; ok: boolean; data?: unknown; err?: { code: string; msg: string } }

/** 假房间：捕获 send 与回包处理器，测试手动驱动回包/连接事件。 */
function makeFakeRoom() {
  const sent: { type: string; data: { id: string; type: string; payload?: any } }[] = [];
  const handlers = new Map<string, (msg: any) => void>();
  const cbs: { drop?: () => void; leave?: () => void } = {};
  const room = {
    sessionId: "s_fake",
    reconnection: { enabled: true },
    send(type: string, data: any) { sent.push({ type, data }); },
    onMessage(type: string, cb: (msg: any) => void) { handlers.set(type, cb); return () => { handlers.delete(type); }; },
    onDrop(cb: () => void) { cbs.drop = cb; return () => {}; },
    onLeave(cb: () => void) { cbs.leave = cb; return () => {}; },
    leave: async () => true,
    removeAllListeners() { /* noop */ },
  };
  const reply = (r: IRpcReplyLite) => handlers.get(LOBBY_MSG_RPC)?.(r);
  return { room, sent, reply, cbs };
}

/** 假 Colyseus.Client + 假房间装进单例，走真 join/doJoin 路径装好全部消息处理器。 */
async function joinWithFakeRoom(fake: ReturnType<typeof makeFakeRoom>): Promise<WebSocketClient> {
  const c = WebSocketClient.inst as unknown as { client: unknown };
  c.client = { auth: { token: "" }, joinOrCreate: async () => fake.room };
  await WebSocketClient.inst.join("token-1");
  return WebSocketClient.inst;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("rpc 按信封 id 配对：ok resolve data、err 按 code 抛 RpcError", async () => {
  const fake = makeFakeRoom();
  const c = await joinWithFakeRoom(fake);

  const p = c.rpc(UserRpc.GetUserId, {});
  const env = fake.sent[0].data;
  assert.equal(env.type, "user.getUserId");
  fake.reply({ id: "someone-else", ok: true, data: { uid: "x" } }); // 别的 id：不配对
  fake.reply({ id: env.id, ok: true, data: { uid: "u1" } });
  assert.deepEqual(await p, { uid: "u1" });

  const p2 = c.rpc(UserRpc.GetUserId, {});
  fake.reply({ id: fake.sent[1].data.id, ok: false, err: { code: "RATE_LIMITED", msg: "" } });
  await assert.rejects(p2, (e: unknown) => e instanceof RpcError && e.code === "RATE_LIMITED");
  await c.leave();
});

test("rpc 超时判 TIMEOUT；迟到回包静默丢弃", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const fake = makeFakeRoom();
    const c = await joinWithFakeRoom(fake);
    const p = c.rpc(UserRpc.GetUserId, {});
    const env = fake.sent[0].data;
    const rejected = assert.rejects(p, (e: unknown) => e instanceof RpcError && e.code === "TIMEOUT");
    mock.timers.tick(15_000); // 快进客户端等待上限
    await rejected;
    mock.timers.reset(); // 恢复真实定时器（后续 sleep/leave 需要；finally 兜底双保险）
    // 迟到回包：pending 已清，静默丢弃（不抛、不产生 unhandledRejection）
    fake.reply({ id: env.id, ok: true, data: { uid: "late" } });
    await c.leave();
  } finally {
    mock.timers.reset();
  }
});

test("onLeave：在途请求全判 CONN_LOST，之后 rpc 立即拒（未加入）", async () => {
  const fake = makeFakeRoom();
  const c = await joinWithFakeRoom(fake);
  const p = c.rpc(UserRpc.GetUserId, {});
  fake.cbs.leave?.();
  await assert.rejects(p, (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST");
  await assert.rejects(c.rpc(UserRpc.GetUserId, {}),
    (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST");
});

test("rpcIdem：BUSY/STALE_FENCE 自动重试，全程复用同一 clientReqId", async () => {
  const fake = makeFakeRoom();
  const c = await joinWithFakeRoom(fake);
  const p = c.rpcIdem(GuildRpc.Join, { guildId: 7 }, "cr-fixed");

  for (const code of ["BUSY", "STALE_FENCE"]) {
    await sleep(600); // 等 300ms 退避后的下一发
    fake.reply({ id: fake.sent[fake.sent.length - 1].data.id, ok: false, err: { code, msg: "" } });
  }
  await sleep(600);
  fake.reply({ id: fake.sent[fake.sent.length - 1].data.id, ok: true, data: { ok: true, seq: 3 } });
  assert.deepEqual(await p, { ok: true, seq: 3 });

  assert.equal(fake.sent.length, 3, "BUSY/STALE_FENCE 触发自动重试");
  for (const m of fake.sent) {
    assert.equal(m.data.payload.clientReqId, "cr-fixed", "重试必须复用同一 clientReqId（09·I2）");
  }
  await c.leave();
});

test("rpcIdem：非 BUSY 错误立即抛且回填 clientReqId，不重试", async () => {
  const fake = makeFakeRoom();
  const c = await joinWithFakeRoom(fake);
  const p = c.rpcIdem(GuildRpc.Join, { guildId: 7 }, "cr-x");
  fake.reply({ id: fake.sent[0].data.id, ok: false, err: { code: "INVALID_PAYLOAD", msg: "bad" } });
  const e = (await p.catch((err: unknown) => err)) as RpcError;
  assert.ok(e instanceof RpcError && e.code === "INVALID_PAYLOAD");
  assert.equal(e.clientReqId, "cr-x", "跨调用重试必须回传同一个 clientReqId（换新 id = 新操作）");
  assert.equal(fake.sent.length, 1, "非 BUSY 不重试");
  await c.leave();
});
