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
import {
  ForceLogoutReason, GuildRpc, KICK_CLOSE_CODE, LOBBY_MSG_PUSH, LOBBY_MSG_RPC,
  LobbyPush, PROTOCOL_VERSION, RoomName, UserRpc,
} from "../src/shared/index";
import { JoinError, RpcError, WebSocketClient } from "../src/net/WebSocketClient";

interface IRpcReplyLite { id: string; ok: boolean; data?: unknown; err?: { code: string; msg: string } }

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** 假房间：捕获 send 与回包处理器，测试手动驱动回包/连接事件。 */
function makeFakeRoom() {
  const sent: { type: string; data: { id: string; type: string; payload?: any } }[] = [];
  const handlers = new Map<string, (msg: any) => void>();
  const cbs: { drop?: () => void; leave?: (code?: number) => void } = {};
  let leaveCalls = 0;
  const room = {
    sessionId: "s_fake",
    reconnection: { enabled: true },
    send(type: string, data: any) { sent.push({ type, data }); },
    onMessage(type: string, cb: (msg: any) => void) { handlers.set(type, cb); return () => { handlers.delete(type); }; },
    onDrop(cb: () => void) { cbs.drop = cb; return () => {}; },
    onLeave(cb: (code?: number) => void) { cbs.leave = cb; return () => {}; },
    leave: async () => { leaveCalls++; return true; },
    removeAllListeners() { /* noop */ },
  };
  const reply = (r: IRpcReplyLite) => handlers.get(LOBBY_MSG_RPC)?.(r);
  const push = (type: string, data: unknown) => handlers.get(LOBBY_MSG_PUSH)?.({ type, data });
  return { room, sent, reply, push, cbs, get leaveCalls() { return leaveCalls; } };
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

test("join 透传 options.sId 进 joinOrCreate（区服路由）：带 sId 带上、缺省不带", async () => {
  const calls: { room: string; options: any }[] = [];
  const fake = makeFakeRoom();
  const c = WebSocketClient.inst as unknown as { client: unknown };
  c.client = {
    auth: { token: "" },
    joinOrCreate: async (room: string, options: any) => { calls.push({ room, options }); return fake.room; },
  };

  // 区服形态：带上所选区 sId → onAuth 据此建区上下文（大厅落 s{sId}_ 前缀，与战斗房同区）
  await WebSocketClient.inst.join("tok-z1", { sId: 1 });
  assert.equal(calls[0].room, RoomName.Lobby);
  assert.deepEqual(calls[0].options, { v: PROTOCOL_VERSION, sId: 1 }, "带 sId → join options 带 sId");
  await WebSocketClient.inst.leave();

  // 缺省不带 sId → 单形态/大混服（服务端 auth.sId=0），向后兼容修复前老客户端
  await WebSocketClient.inst.join("tok-z0");
  assert.deepEqual(calls[1].options, { v: PROTOCOL_VERSION }, "缺省 → join options 不含 sId（大混服向后兼容）");
  await WebSocketClient.inst.leave();
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

// ── 强制下线（M12d-g）：推送判因 + 关闭码兜底 ───────────────────────────────

/** 订阅 session 的鉴权失效广播，返回收集器（用后即解绑）。 */
async function collectAuthInvalid(): Promise<{ got: string[]; stop: () => void }> {
  const { onAuthInvalid, setSession } = await import("../src/net/session");
  setSession({ userId: "u_1", token: "token-1", isNew: false }); // 必须已登录，否则迟到上报被幂等吞掉
  const got: string[] = [];
  const stop = onAuthInvalid((r) => { got.push(r); });
  return { got, stop };
}

test("强制下线·推送路径：收到 auth.forceLogout{reason} → 上报对应 FORCE_* 原因", async () => {
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  const { got, stop } = await collectAuthInvalid();
  try {
    fake.push(LobbyPush.ForceLogout, { reason: ForceLogoutReason.Replaced });
    assert.deepEqual(got, ["FORCE_REPLACED"], "顶号 → FORCE_REPLACED（UI 弹「账号在其他设备登录」）");
  } finally { stop(); await WebSocketClient.inst.leave().catch(() => {}); }
});

test("强制下线·关闭码兜底：推送没赶上时 onLeave(code) 仍判出被踢（⛔ 不当成掉线）", async () => {
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  const { got, stop } = await collectAuthInvalid();
  try {
    fake.cbs.leave?.(KICK_CLOSE_CODE[ForceLogoutReason.Banned]); // 只有关闭码、无推送
    assert.deepEqual(got, ["FORCE_BANNED"], "关闭码兜底判因");
  } finally { stop(); }
});

test("⛔ 普通掉线不误判被踢：非踢人关闭码 → connLost（登录态保留）", async () => {
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  const { onConnLost } = await import("../src/net/session");
  const { got, stop } = await collectAuthInvalid();
  let connLost = 0;
  const stopLost = onConnLost(() => { connLost++; });
  try {
    fake.cbs.leave?.(1006); // ABNORMAL_CLOSURE：普通掉线
    assert.deepEqual(got, [], "⛔ 不报鉴权失效");
    assert.equal(connLost, 1, "走 connLost（UI 提示重连，登录态不清）");
  } finally { stop(); stopLost(); }
});

test("推送先到 + onLeave 随后：只弹一次（notifyAuthInvalid 幂等，⛔ 不重复弹窗）", async () => {
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  const { got, stop } = await collectAuthInvalid();
  try {
    fake.push(LobbyPush.ForceLogout, { reason: ForceLogoutReason.Banned }); // 先推（清会话）
    fake.cbs.leave?.(KICK_CLOSE_CODE[ForceLogoutReason.Banned]);            // 再关（迟到）
    assert.deepEqual(got, ["FORCE_BANNED"], "只上报一次");
  } finally { stop(); }
});

test("join 在途固定 client/endpoint：A 被取消后迟到 room 只释放 A，不会污染 B", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const aJoin = deferred<ReturnType<typeof makeFakeRoom>["room"]>();
  const bJoin = deferred<ReturnType<typeof makeFakeRoom>["room"]>();
  const a = makeFakeRoom();
  const b = makeFakeRoom();
  const calls: Array<{ endpoint: string; options: unknown }> = [];
  const clientA = {
    auth: { token: "" },
    joinOrCreate: async (_name: string, options: unknown) => { calls.push({ endpoint: "A", options }); return aJoin.promise; },
  };
  const clientB = {
    auth: { token: "" },
    joinOrCreate: async (_name: string, options: unknown) => { calls.push({ endpoint: "B", options }); return bJoin.promise; },
  };
  const internals = WebSocketClient.inst as unknown as { client: unknown; endpoint: string };
  internals.endpoint = "http://game-a.example";
  internals.client = clientA;
  const ownerA = WebSocketClient.inst.joinOwned("token-a", { sId: 1 });
  const stale = assert.rejects(ownerA.ready, /ownership 已释放/);

  // 切换端点前释放 A；leave 必须不等待黑洞握手。随后 B 只能使用 B client/endpoint。
  await ownerA.leave();
  internals.endpoint = "http://game-b.example";
  internals.client = clientB;
  const ownerB = WebSocketClient.inst.joinOwned("token-b", { sId: 2 });
  assert.deepEqual(calls, [
    { endpoint: "A", options: { v: PROTOCOL_VERSION, sId: 1 } },
    { endpoint: "B", options: { v: PROTOCOL_VERSION, sId: 2 } },
  ]);

  aJoin.resolve(a.room);
  await stale;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(a.leaveCalls, 1, "迟到 A room 必须物理释放");
  bJoin.resolve(b.room);
  assert.equal(await ownerB.ready, undefined);
  assert.equal(WebSocketClient.inst.room, b.room);
  await ownerB.leave();
  assert.equal(b.leaveCalls, 1);
});

test("join 黑洞：timeout/cancel 立即结束 ownership，迟到 room 在后台释放", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const pending = deferred<ReturnType<typeof makeFakeRoom>["room"]>();
  const fake = makeFakeRoom();
  const internals = WebSocketClient.inst as unknown as { client: unknown; endpoint: string };
  internals.endpoint = "http://game-timeout.example";
  internals.client = {
    auth: { token: "" },
    joinOrCreate: async () => pending.promise,
  };
  const owner = WebSocketClient.inst.joinOwned("token-timeout", undefined, { timeoutMs: 10 });
  await assert.rejects(owner.ready, (e: unknown) => e instanceof JoinError && e.code === "TIMEOUT");
  assert.equal(WebSocketClient.inst.connected, false);
  await owner.leave();

  pending.resolve(fake.room);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fake.leaveCalls, 1, "超时后迟到 room 不能成为无主连接");

  const cancelled = deferred<ReturnType<typeof makeFakeRoom>["room"]>();
  const fakeCancelled = makeFakeRoom();
  internals.endpoint = "http://game-cancel.example";
  internals.client = { auth: { token: "" }, joinOrCreate: async () => cancelled.promise };
  const controller = new AbortController();
  const cancelledOwner = WebSocketClient.inst.joinOwned("token-cancel", undefined, controller.signal);
  controller.abort();
  await assert.rejects(cancelledOwner.ready, (e: unknown) => e instanceof JoinError && e.code === "CANCELLED");
  await cancelledOwner.leave();
  cancelled.resolve(fakeCancelled.room);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fakeCancelled.leaveCalls, 1, "取消后迟到 room 也必须释放");
});

test("主动 leave 立即拒绝旧 slot 的 pending RPC", async () => {
  const fake = makeFakeRoom();
  const c = await joinWithFakeRoom(fake);
  const pending = c.rpc(UserRpc.GetUserId, {});
  const leaving = c.leave();
  await assert.rejects(pending, (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST");
  await leaving;
});
