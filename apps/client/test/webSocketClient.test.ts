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
  const cbs: { drop?: () => void; reconnect?: () => void; leave?: (code?: number) => void } = {};
  let leaveCalls = 0;
  const room = {
    sessionId: "s_fake",
    reconnection: { enabled: true },
    send(type: string, data: any) { sent.push({ type, data }); },
    onMessage(type: string, cb: (msg: any) => void) { handlers.set(type, cb); return () => { handlers.delete(type); }; },
    onDrop(cb: () => void) { cbs.drop = cb; return () => {}; },
    onReconnect(cb: () => void) { cbs.reconnect = cb; return () => {}; },
    onLeave(cb: (code?: number) => void) { cbs.leave = cb; return () => {}; },
    leave: async () => { leaveCalls++; return true; },
    removeAllListeners() { /* noop */ },
  };
  const reply = (r: IRpcReplyLite) => handlers.get(LOBBY_MSG_RPC)?.(r);
  const push = (type: string, data: unknown) => handlers.get(LOBBY_MSG_PUSH)?.({ type, data });
  return { room, sent, reply, push, cbs, get leaveCalls() { return leaveCalls; } };
}

function implicitOwnerCount(): number {
  return (WebSocketClient.inst as unknown as { implicitOwners: Set<unknown> }).implicitOwners.size;
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

test("onDrop/onReconnect：掉线期 RPC fail-fast，恢复后复用 room、owner 与 push 订阅", async () => {
  const fake = makeFakeRoom();
  const c = await joinWithFakeRoom(fake);
  const { onConnLost } = await import("../src/net/session");
  let connLost = 0;
  let notices = 0;
  const stopLost = onConnLost(() => { connLost++; });
  const stopPush = c.onPush(LobbyPush.ServerNotice, () => { notices++; });

  try {
    const pending = c.rpc(UserRpc.GetUserId, {});
    assert.equal(fake.sent.length, 1);
    fake.cbs.drop?.();
    fake.cbs.drop?.();
    await assert.rejects(pending, (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST");
    assert.equal(connLost, 0, "transient drop 不能触发最终断线对账");

    await assert.rejects(c.rpc(UserRpc.GetUserId, {}),
      (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST");
    assert.equal(fake.sent.length, 1, "掉线窗口不得把业务 RPC 排进 SDK 重连队列");

    fake.cbs.reconnect?.();
    fake.cbs.reconnect?.();
    const recovered = c.rpc(UserRpc.GetUserId, {});
    assert.equal(fake.sent.length, 2, "当前代重连后应立即恢复 RPC 可用性");
    fake.reply({ id: fake.sent[1].data.id, ok: true, data: { uid: "recovered" } });
    assert.deepEqual(await recovered, { uid: "recovered" });
    fake.push(LobbyPush.ServerNotice, { text: "after reconnect" });
    assert.equal(notices, 1, "重连不得重建或清空既有 push listener");
    assert.equal(c.room, fake.room);
    assert.equal(implicitOwnerCount(), 1);
  } finally {
    stopPush();
    stopLost();
    await c.leave().catch(() => {});
  }
});

test("drop 后最终 onLeave：只上报一次 connLost；主动 leave 则不误报", async () => {
  const { onConnLost } = await import("../src/net/session");
  let connLost = 0;
  const stopLost = onConnLost(() => { connLost++; });
  try {
    const dead = makeFakeRoom();
    await joinWithFakeRoom(dead);
    dead.cbs.drop?.();
    dead.cbs.leave?.(1006);
    dead.cbs.leave?.(1006);
    assert.equal(connLost, 1, "只有当前 slot 的首次最终 leave 能触发对账");

    const manual = makeFakeRoom();
    await joinWithFakeRoom(manual);
    const lateReconnect = manual.cbs.reconnect;
    const lateLeave = manual.cbs.leave;
    manual.cbs.drop?.();
    await WebSocketClient.inst.leave();
    lateReconnect?.();
    lateLeave?.(1006);
    assert.equal(manual.room.reconnection.enabled, false);
    assert.equal(connLost, 1, "主动释放掉线中的 slot 不得上报最终连接丢失");
  } finally {
    stopLost();
    await WebSocketClient.inst.leave().catch(() => {});
  }
});

test("隐式 ownership：被动 onLeave 后清理，重复掉线/重登不累积旧闭包", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const first = makeFakeRoom();
  const second = makeFakeRoom();
  const third = makeFakeRoom();
  let active = first;
  const internals = WebSocketClient.inst as unknown as {
    client: unknown;
    endpoint: string;
    slot: unknown;
    implicitOwners: Set<unknown>;
  };
  internals.endpoint = "http://implicit-owner-cleanup.example";
  internals.client = {
    auth: { token: "" },
    joinOrCreate: async () => active.room,
  };

  await WebSocketClient.inst.join("token-first");
  assert.equal(internals.implicitOwners.size, 1);
  const firstLeave = first.cbs.leave;
  firstLeave?.(1006);
  firstLeave?.(1006); // SDK adapters can duplicate a terminal callback.
  assert.equal(internals.slot, null, "被动死亡必须摘掉当前 slot");
  assert.equal(implicitOwnerCount(), 0, "被动 onLeave 必须释放隐式 ownership");
  await WebSocketClient.inst.leave(); // no current slot: cleanup must still be a no-op and stay clean.
  assert.equal(implicitOwnerCount(), 0);

  active = second;
  await WebSocketClient.inst.join("token-second");
  assert.equal(implicitOwnerCount(), 1, "重登只应登记新一代 ownership");
  second.cbs.leave?.(1006);
  assert.equal(implicitOwnerCount(), 0, "第二代掉线也必须清理");

  active = third;
  await WebSocketClient.inst.join("token-third");
  assert.equal(implicitOwnerCount(), 1);
  await WebSocketClient.inst.leave();
  assert.equal(implicitOwnerCount(), 0, "主动 leave 必须清理当前隐式 ownership");
  assert.equal(first.leaveCalls, 0, "被动死亡的旧 room 不应被主动 leave 再次关闭");
  assert.equal(second.leaveCalls, 0, "被动死亡的旧 room 不应被主动 leave 再次关闭");
  assert.equal(third.leaveCalls, 1, "主动 leave 只关闭当前 room");
});

test("隐式 ownership：替换后旧 room 的迟到 reconnect/leave 不得改写新一代", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const oldRoom = makeFakeRoom();
  const newRoom = makeFakeRoom();
  let active = oldRoom;
  const internals = WebSocketClient.inst as unknown as {
    client: unknown;
    endpoint: string;
    slot: unknown;
    implicitOwners: Set<unknown>;
    closeSlot: (slot: unknown) => Promise<void>;
  };
  internals.endpoint = "http://implicit-owner-replace.example";
  internals.client = {
    auth: { token: "" },
    joinOrCreate: async () => active.room,
  };

  await WebSocketClient.inst.join("token-old");
  const oldSlot = internals.slot;
  const oldReconnect = oldRoom.cbs.reconnect;
  const oldLeave = oldRoom.cbs.leave;
  assert.equal(implicitOwnerCount(), 1);
  await internals.closeSlot.call(WebSocketClient.inst, oldSlot);
  assert.equal(implicitOwnerCount(), 0, "替换旧 slot 时必须先摘除隐式 ownership");

  active = newRoom;
  await WebSocketClient.inst.join("token-new");
  assert.equal(implicitOwnerCount(), 1);
  newRoom.cbs.drop?.();
  oldReconnect?.();
  await assert.rejects(WebSocketClient.inst.rpc(UserRpc.GetUserId, {}),
    (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST");
  assert.equal(newRoom.sent.length, 0, "旧 reconnect 不得清掉新 slot 的 dropping");
  oldLeave?.(1006); // 迟到旧回调：current() 为 false，但仍会命中旧 slot 过滤。
  assert.equal(implicitOwnerCount(), 1, "旧回调不得清掉新 slot 的 ownership");
  assert.equal(WebSocketClient.inst.room, newRoom.room);
  newRoom.cbs.reconnect?.();
  await WebSocketClient.inst.leave();
  assert.equal(implicitOwnerCount(), 0);
});

test("隐式 ownership：主动 leave 后迟到 join 结果只释放旧 room，不回填记录", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const lateRoom = makeFakeRoom();
  const pending = deferred<typeof lateRoom.room>();
  const internals = WebSocketClient.inst as unknown as {
    client: unknown;
    endpoint: string;
    implicitOwners: Set<unknown>;
  };
  internals.endpoint = "http://implicit-owner-late.example";
  internals.client = {
    auth: { token: "" },
    joinOrCreate: async () => pending.promise,
  };

  const joining = WebSocketClient.inst.join("token-late");
  const rejected = assert.rejects(joining, /ownership 已释放/);
  assert.equal(internals.implicitOwners.size, 1, "在途 join 应先登记本代 ownership");
  await WebSocketClient.inst.leave();
  assert.equal(implicitOwnerCount(), 0);
  await rejected;

  pending.resolve(lateRoom.room);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(implicitOwnerCount(), 0, "迟到 ready continuation 不得重新登记旧 ownership");
  assert.equal(lateRoom.leaveCalls, 1, "迟到 room 必须物理释放一次");
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
  setSession({ userId: "u_1", accessToken: "token-1", isNewAccount: false }); // 必须已登录，否则迟到上报被幂等吞掉
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

test("强制下线·掉线窗口关闭码兜底：最终 onLeave 仍判出被踢（⛔ 不当成普通掉线）", async () => {
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  const { got, stop } = await collectAuthInvalid();
  try {
    fake.cbs.drop?.();
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

test("非法 join control 在分配大厅 slot 前失败，不遗留 owner", async () => {
  const client = WebSocketClient.inst as unknown as {
    client: { auth: { token: string }; joinOrCreate: () => Promise<unknown> } | null;
    endpoint: string;
    slot: unknown;
  };
  await WebSocketClient.inst.leave().catch(() => {});
  let calls = 0;
  client.endpoint = "http://lobby.example";
  client.client = {
    auth: { token: "" },
    joinOrCreate: async () => { calls++; return makeFakeRoom().room; },
  };
  assert.throws(
    () => WebSocketClient.inst.joinOwned("token-1", undefined, { timeoutMs: 1.5 } as never),
    /安全整数/,
  );
  assert.equal(calls, 0);
  assert.equal(client.slot, null, "非法 control 不得留下大厅 slot");
});

test("hostile AbortSignal：读取 aborted 在分配大厅 slot 前失败", async () => {
  const client = WebSocketClient.inst as unknown as {
    client: { auth: { token: string }; joinOrCreate: () => Promise<unknown> } | null;
    endpoint: string;
    slot: unknown;
  };
  await WebSocketClient.inst.leave().catch(() => {});
  let calls = 0;
  client.endpoint = "http://lobby-hostile-signal.example";
  client.client = {
    auth: { token: "" },
    joinOrCreate: async () => { calls++; return makeFakeRoom().room; },
  };
  const signal = new Proxy({
    aborted: false,
    addEventListener() { /* noop */ },
    removeEventListener() { /* noop */ },
  }, {
    get(target, property, receiver) {
      if (property === "aborted") throw new Error("hostile aborted getter");
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => WebSocketClient.inst.joinOwned("token-hostile", undefined, signal as never),
    /有效的 AbortSignal/,
  );
  assert.equal(calls, 0);
  assert.equal(client.slot, null);
});

test("hostile AbortSignal：addEventListener 抛错时大厅 owner/slot 清理，迟到 room 释放", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const pending = deferred<ReturnType<typeof makeFakeRoom>["room"]>();
  const fake = makeFakeRoom();
  const internals = WebSocketClient.inst as unknown as {
    client: unknown;
    endpoint: string;
    slot: unknown;
  };
  internals.endpoint = "http://lobby-add-hostile.example";
  internals.client = { auth: { token: "" }, joinOrCreate: async () => pending.promise };
  const signal = {
    aborted: false,
    addEventListener() { throw new Error("hostile add listener"); },
    removeEventListener() { /* noop */ },
  } as unknown as AbortSignal;

  assert.throws(
    () => WebSocketClient.inst.joinOwned("token-add-hostile", undefined, signal),
    /hostile add listener/,
  );
  assert.equal(internals.slot, null);
  pending.resolve(fake.room);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fake.leaveCalls, 1);
});

test("hostile AbortSignal：removeEventListener 抛错不阻断大厅成功 leave", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const pending = deferred<ReturnType<typeof makeFakeRoom>["room"]>();
  const fake = makeFakeRoom();
  const internals = WebSocketClient.inst as unknown as {
    client: unknown;
    endpoint: string;
  };
  internals.endpoint = "http://lobby-remove-hostile.example";
  internals.client = { auth: { token: "" }, joinOrCreate: async () => pending.promise };
  const signal = {
    aborted: false,
    addEventListener() { /* noop */ },
    removeEventListener() { throw new Error("hostile remove listener"); },
  } as unknown as AbortSignal;
  const owner = WebSocketClient.inst.joinOwned("token-remove-hostile", undefined, signal);
  pending.resolve(fake.room);
  await owner.ready;
  await owner.leave();
  assert.equal(fake.leaveCalls, 1);
});

test("joinOrCreate 同步抛错：迟到大厅 owner 立即失败并释放失败槽", async () => {
  const internals = WebSocketClient.inst as unknown as {
    client: { auth: { token: string }; joinOrCreate: (...args: unknown[]) => Promise<unknown> } | null;
    endpoint: string;
    slot: unknown;
    closeSlot: (slot: unknown) => Promise<void>;
  };
  await WebSocketClient.inst.leave().catch(() => {});
  const failure = new Error("sync lobby join failure");
  internals.endpoint = "http://lobby-sync-failure.example";
  internals.client = {
    auth: { token: "" },
    joinOrCreate() { throw failure; },
  };
  const originalCloseSlot = internals.closeSlot;
  let closeCalls = 0;
  internals.closeSlot = (slot) => {
    closeCalls++;
    return originalCloseSlot.call(WebSocketClient.inst, slot);
  };

  try {
    const owner = WebSocketClient.inst.joinOwned("token-sync-failure", undefined, { timeoutMs: 60_000 });
    await assert.rejects(owner.ready, (error: unknown) => error === failure);
    assert.equal(internals.slot, null, "同步失败后大厅 slot 必须摘除");
    assert.equal(closeCalls, 1, "迟到 owner 必须触发失败槽清理");
    await owner.leave();
  } finally {
    internals.closeSlot = originalCloseSlot;
  }
});

test("主动 leave 立即拒绝旧 slot 的 pending RPC", async () => {
  const fake = makeFakeRoom();
  const c = await joinWithFakeRoom(fake);
  const pending = c.rpc(UserRpc.GetUserId, {});
  const leaving = c.leave();
  await assert.rejects(pending, (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST");
  await leaving;
});

/**
 * 忠实建模 0.17 SDK 的离线重放队列：socket 关闭时 send 入队而不抛，重连时先跑
 * onReconnect 回调、再同步 flush 队列并**整体重新赋值**（与 colyseus.js 的
 * `enqueuedMessages = []` 一致，不是原地截断），否则持有旧数组引用的实现会被掩盖。
 */
function makeQueueingFakeRoom() {
  const sent: { type: string; data: any }[] = [];
  const handlers = new Map<string, (msg: any) => void>();
  const cbs: { drop?: () => void; reconnect?: () => void; leave?: (code?: number) => void } = {};
  const room: any = {
    sessionId: "s_queue",
    connectionOpen: true,
    reconnection: { enabled: true, maxEnqueuedMessages: 10, enqueuedMessages: [] as { data: any }[] },
    send(type: string, data: any) {
      if (!room.connectionOpen) {
        room.reconnection.enqueuedMessages.push({ data: { type, data } });
        if (room.reconnection.enqueuedMessages.length > room.reconnection.maxEnqueuedMessages) {
          room.reconnection.enqueuedMessages.shift();
        }
        return;
      }
      sent.push({ type, data });
    },
    onMessage(type: string, cb: (msg: any) => void) { handlers.set(type, cb); return () => { handlers.delete(type); }; },
    onDrop(cb: () => void) { cbs.drop = cb; return () => {}; },
    onReconnect(cb: () => void) { cbs.reconnect = cb; return () => {}; },
    onLeave(cb: (code?: number) => void) { cbs.leave = cb; return () => {}; },
    leave: async () => true,
    removeAllListeners() { /* noop */ },
  };
  return {
    room,
    sent,
    closeSocket: () => { room.connectionOpen = false; },
    emitDrop: () => cbs.drop?.(),
    emitLeave: (code?: number) => cbs.leave?.(code),
    emitReconnect: () => {
      room.connectionOpen = true;
      cbs.reconnect?.();
      // SDK 的 flush 在 onReconnect 回调返回之后同步执行；reconnection 被换掉时无队列可 flush。
      if (!room.reconnection) return;
      for (const message of room.reconnection.enqueuedMessages) sent.push(message.data);
      room.reconnection.enqueuedMessages = [];
    },
  };
}

test("close→onDrop 间隙发出的写 RPC 不得进入 SDK 队列并在重连后重放", async () => {
  const fake = makeQueueingFakeRoom();
  const c = WebSocketClient.inst as unknown as { client: unknown };
  c.client = { auth: { token: "" }, joinOrCreate: async () => fake.room };
  await WebSocketClient.inst.join("token-queue");

  // 装闸必须在 bindRoom 就生效：max=0 让 SDK 的 push-then-shift 变成空操作。
  assert.equal(fake.room.reconnection.maxEnqueuedMessages, 0, "bindRoom 必须关闭 SDK 离线队列");

  // 竞态窗口：底层 socket 已关，但 onDrop 尚未回调，slot.dropping 仍是 false，
  // 因此 rpc() 的本地闸放行并真的调用了 room.send()。
  fake.closeSocket();
  const pending = WebSocketClient.inst.rpc(UserRpc.GetUserId, {});
  assert.equal(
    fake.room.reconnection.enqueuedMessages.length,
    0,
    "间隙内发出的 RPC 不得留在 SDK 队列里",
  );

  fake.emitDrop();
  await assert.rejects(pending, (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST");

  fake.emitReconnect();
  assert.equal(
    fake.sent.filter((message) => message.type === LOBBY_MSG_RPC).length,
    0,
    "调用方已收到 CONN_LOST 的写 RPC 不得在重连后被 SDK 重放",
  );
  await WebSocketClient.inst.leave();
});

test("掉线/重连时若 SDK 重放队列不可控则主动断开大厅连接", async () => {
  for (const phase of ["drop", "reconnect"] as const) {
    const fake = makeQueueingFakeRoom();
    const c = WebSocketClient.inst as unknown as { client: unknown };
    c.client = { auth: { token: "" }, joinOrCreate: async () => fake.room };
    await WebSocketClient.inst.join(`token-guard-${phase}`);

    const pending = WebSocketClient.inst.rpc(UserRpc.GetUserId, {});
    // 房间对象在 bind 之后被换成不可控形状：闸再也装不上，只能失败关闭。
    fake.room.reconnection = null;
    if (phase === "drop") fake.emitDrop();
    else fake.emitReconnect();

    await assert.rejects(
      pending,
      (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST",
      `${phase} 阶段闸失效必须让在途 RPC 判 CONN_LOST`,
    );
    assert.equal(
      (WebSocketClient.inst as unknown as { slot: unknown }).slot,
      null,
      `${phase} 阶段闸失效必须摘除大厅 slot`,
    );
    await WebSocketClient.inst.leave();
  }
});

test("装闸部分失败时仍必须同步清空已入队消息，重连不得 flush 旧 RPC", async () => {
  // 敌意形状：maxEnqueuedMessages 的 setter 在 hostile 置位后抛错，enqueuedMessages
  // 仍是普通可写数组。SDK 在 onReconnect 回调返回后同步 flush，所以「清队列」必须
  // 先于「设上限」，且不能被上限赋值的异常吞掉。
  const fake = makeQueueingFakeRoom();
  let hostile = false;
  let backing = 10;
  Object.defineProperty(fake.room.reconnection, "maxEnqueuedMessages", {
    configurable: true,
    get: () => backing,
    set: (value: number) => {
      if (hostile) throw new Error("hostile maxEnqueuedMessages");
      backing = value;
    },
  });

  const c = WebSocketClient.inst as unknown as { client: unknown };
  c.client = { auth: { token: "" }, joinOrCreate: async () => fake.room };
  await WebSocketClient.inst.join("token-hostile");
  assert.equal(fake.room.reconnection.maxEnqueuedMessages, 0, "bindRoom 期装闸必须成功");

  // 之后队列被重新武装，且上限再也写不进去。
  hostile = true;
  backing = 10;
  fake.closeSocket();
  const pending = WebSocketClient.inst.rpc(UserRpc.GetUserId, {});
  assert.equal(
    fake.room.reconnection.enqueuedMessages.length,
    1,
    "夹具必须真的预置了一条队列消息，否则本用例是空跑",
  );

  fake.emitReconnect();
  assert.equal(
    fake.sent.filter((message) => message.type === LOBBY_MSG_RPC).length,
    0,
    "装闸部分失败也不得让旧 RPC 在重连后被 flush",
  );
  await assert.rejects(pending, (e: unknown) => e instanceof RpcError && e.code === "CONN_LOST");
  await WebSocketClient.inst.leave();
});

test("清队列失败也不得吞掉设上限：三步中和必须各自独立", async () => {
  // 冻结数组让 `length = 0` 抛错（严格模式）。此时唯一还能阻止**后续**入队的动作
  // 就是把上限设为 0——三步共用一个 try 时它会被前一步的异常吞掉。
  const fake = makeQueueingFakeRoom();
  // 必须非空：空的冻结数组本身就是已中和状态，清理步骤根本不会尝试写入。
  const frozen = Object.freeze([{ data: "stale" }] as { data: unknown }[]);
  Object.defineProperty(fake.room.reconnection, "enqueuedMessages", {
    configurable: true,
    get: () => frozen,
    set: () => { throw new Error("hostile enqueuedMessages"); },
  });

  const c = WebSocketClient.inst as unknown as { client: unknown };
  c.client = { auth: { token: "" }, joinOrCreate: async () => fake.room };
  await assert.rejects(
    WebSocketClient.inst.join("token-frozen"),
    /无法关闭 SDK 离线重放队列/,
    "队列不可中和时 join 必须失败关闭",
  );
  assert.equal(
    fake.room.reconnection.maxEnqueuedMessages,
    0,
    "清队列失败不得吞掉设上限——它是唯一还能阻止后续入队的动作",
  );
});

test("闸失效放弃连接：释放全部 owner 并只上报一次最终断线", async () => {
  const { onConnLost } = await import("../src/net/session");
  for (const phase of ["drop", "reconnect"] as const) {
    const fake = makeQueueingFakeRoom();
    const c = WebSocketClient.inst as unknown as { client: unknown };
    c.client = { auth: { token: "" }, joinOrCreate: async () => fake.room };
    const owner = WebSocketClient.inst.joinOwned(`token-abandon-${phase}`, undefined, { timeoutMs: 60_000 });
    await owner.ready;

    let connLost = 0;
    const un = onConnLost(() => { connLost++; });
    try {
      const owners = (WebSocketClient.inst as unknown as {
        slot: { owners: Set<{ active: boolean }> } | null;
      }).slot?.owners;
      assert.ok(owners && owners.size > 0, `${phase}：前置条件——slot 必须持有 owner`);
      const held = [...owners];

      fake.room.reconnection = null;
      if (phase === "drop") fake.emitDrop();
      else fake.emitReconnect();

      assert.equal(owners.size, 0, `${phase}：闸失效必须释放全部 owner`);
      assert.ok(held.every((o) => o.active === false), `${phase}：owner 不得停在 active`);
      assert.equal(connLost, 1, `${phase}：闸失效必须上报一次最终断线`);

      // 迟到的 onLeave 会被 current() 挡掉，不得重复上报。
      fake.emitLeave(1006);
      assert.equal(connLost, 1, `${phase}：迟到 onLeave 不得二次上报`);
    } finally {
      un();
    }
    await owner.leave();
  }
});
