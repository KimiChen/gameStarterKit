/**
 * WebSocketClient.subscribeConnection 低层连接事件契约（Non-intrusive §7.3 阶段 5a）：
 * 事件矩阵（joining→ready→dropped→reconnected→closed 三分类）、订阅即回放快照、
 * seq 单调、connGeneration 随 slot 换代、listener 异常隔离、先闸后播。
 * 本文件**不**接 wireConnectionEvents：只测 transport 自身发布面。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ForceLogoutReason, KICK_CLOSE_CODE, LOBBY_MSG_PUSH, LOBBY_MSG_RPC, LobbyPush, UserRpc,
} from "../src/shared/index";
import { RpcError, WebSocketClient } from "../src/net/WebSocketClient";
import type { LobbyConnectionEvent } from "../src/net/connectionEvents";

/** 假房间：捕获回包处理器与连接回调，测试手动驱动（同 webSocketClient.test.ts 形态）。 */
function makeFakeRoom() {
  const sent: { type: string; data: { id: string; type: string; payload?: unknown } }[] = [];
  const handlers = new Map<string, (msg: unknown) => void>();
  const cbs: { drop?: () => void; reconnect?: () => void; leave?: (code?: number) => void } = {};
  let leaveCalls = 0;
  const room = {
    sessionId: "s_conn",
    reconnection: { enabled: true },
    send(type: string, data: never) { sent.push({ type, data }); },
    onMessage(type: string, cb: (msg: unknown) => void) { handlers.set(type, cb); return () => { handlers.delete(type); }; },
    onDrop(cb: () => void) { cbs.drop = cb; return () => {}; },
    onReconnect(cb: () => void) { cbs.reconnect = cb; return () => {}; },
    onLeave(cb: (code?: number) => void) { cbs.leave = cb; return () => {}; },
    leave: async () => { leaveCalls++; return true; },
    removeAllListeners() { /* noop */ },
  };
  const reply = (r: { id: string; ok: boolean; data?: unknown; err?: { code: string; msg: string } }) =>
    handlers.get(LOBBY_MSG_RPC)?.(r);
  const push = (type: string, data: unknown) =>
    handlers.get(LOBBY_MSG_PUSH)?.({ type, data });
  return { room, sent, reply, push, cbs, get leaveCalls() { return leaveCalls; } };
}

async function joinWithFakeRoom(fake: ReturnType<typeof makeFakeRoom>, token = "conn-token"): Promise<void> {
  const internals = WebSocketClient.inst as unknown as { client: unknown; endpoint: string };
  internals.endpoint = "http://conn-events.example";
  internals.client = { auth: { token: "" }, joinOrCreate: async () => fake.room };
  await WebSocketClient.inst.join(token);
}

function record(): { events: LobbyConnectionEvent[]; stop: () => void } {
  const events: LobbyConnectionEvent[] = [];
  const stop = WebSocketClient.inst.subscribeConnection((event) => { events.push(event); });
  return { events, stop };
}

function assertSeqMonotonic(events: readonly LobbyConnectionEvent[]): void {
  for (let index = 1; index < events.length; index++) {
    assert.ok(events[index].seq > events[index - 1].seq,
      `seq 必须单调递增：${events[index - 1].kind}#${events[index - 1].seq} → ${events[index].kind}#${events[index].seq}`);
  }
}

test("事件矩阵：joining→ready→dropped→reconnected→closed{voluntary}，seq 单调、同代同 generation", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const { events, stop } = record();
  try {
    const fake = makeFakeRoom();
    await joinWithFakeRoom(fake);
    assert.deepEqual(events.map((event) => event.kind), ["joining", "ready"]);
    fake.cbs.drop?.();
    fake.cbs.reconnect?.();
    await WebSocketClient.inst.leave();
    assert.deepEqual(events.map((event) => event.kind),
      ["joining", "ready", "dropped", "reconnected", "closed"]);
    const closed = events[4];
    assert.equal(closed.kind === "closed" && closed.reason, "voluntary", "显式 leave() 必须是 closed{voluntary}");
    assertSeqMonotonic(events);
    const generations = new Set(events.map((event) => event.connGeneration));
    assert.equal(generations.size, 1, "同一 slot 的全部事件必须携带同一 connGeneration");
  } finally {
    stop();
  }
});

test("先闸后播：dropped 事件送达时发送闸已关（listener 栈内 rpc 立即拒 CONN_LOST）", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  let observed: Promise<unknown> | null = null;
  const stop = WebSocketClient.inst.subscribeConnection((event) => {
    if (event.kind === "dropped") {
      observed = WebSocketClient.inst.rpc(UserRpc.GetUserId, {}).then(
        () => "resolved",
        (error: unknown) => (error instanceof RpcError ? error.code : "other"),
      );
    }
  });
  try {
    fake.cbs.drop?.();
    assert.ok(observed, "dropped 事件必须被发布");
    assert.equal(await observed, "CONN_LOST", "发布 dropped 前必须已关闭发送闸（先闸后播）");
  } finally {
    stop();
    await WebSocketClient.inst.leave().catch(() => {});
  }
});

test("closed 三分类：普通关闭码→final-loss；强踢关闭码→auth-invalid+authReason", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  {
    const { events, stop } = record();
    const dead = makeFakeRoom();
    await joinWithFakeRoom(dead);
    dead.cbs.drop?.();
    dead.cbs.leave?.(1006);
    dead.cbs.leave?.(1006); // 重复终局回调必须被 current() 挡掉
    const closedEvents = events.filter((event) => event.kind === "closed");
    assert.equal(closedEvents.length, 1, "final-loss 每代只发布一次");
    assert.equal(closedEvents[0].kind === "closed" && closedEvents[0].reason, "final-loss");
    stop();
  }
  {
    const { events, stop } = record();
    const kicked = makeFakeRoom();
    await joinWithFakeRoom(kicked);
    kicked.cbs.leave?.(KICK_CLOSE_CODE[ForceLogoutReason.Banned]);
    const closed = events.find((event) => event.kind === "closed");
    assert.ok(closed && closed.kind === "closed" && closed.reason === "auth-invalid"
      && closed.authReason === "FORCE_BANNED", "强踢关闭码必须规约成 auth-invalid（绝不触发重连）");
    stop();
  }
});

test("RPC 鉴权错误码路径：err AUTH_REQUIRED → closed{auth-invalid, AUTH_REQUIRED}", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  const { events, stop } = record();
  try {
    const pending = WebSocketClient.inst.rpc(UserRpc.GetUserId, {});
    fake.reply({ id: fake.sent[0].data.id, ok: false, err: { code: "AUTH_REQUIRED", msg: "" } });
    await assert.rejects(pending, (e: unknown) => e instanceof RpcError && e.code === "AUTH_REQUIRED");
    const closed = events.find((event) => event.kind === "closed");
    assert.ok(closed && closed.kind === "closed" && closed.reason === "auth-invalid"
      && closed.authReason === "AUTH_REQUIRED");
  } finally {
    stop();
    await WebSocketClient.inst.leave().catch(() => {});
  }
});

test("ForceLogout 推送 → closed{auth-invalid}；随后的物理 leave 不再补发第二个 closed", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  const events: LobbyConnectionEvent[] = [];
  const stop = WebSocketClient.inst.subscribeConnection((event) => {
    if (event.kind === "closed") events.push(event);
  });
  try {
    fake.push(LobbyPush.ForceLogout, { reason: ForceLogoutReason.Replaced });
    assert.equal(events.length, 1, "ForceLogout 推送必须发布一条 closed");
    const first = events[0];
    assert.ok(first.kind === "closed" && first.reason === "auth-invalid"
      && first.authReason === "FORCE_REPLACED", "顶号推送 → auth-invalid + FORCE_REPLACED");
    // 回登录 transition 随后会显式 leave()；同代 closed 已发布，voluntary 不再补发。
    await WebSocketClient.inst.leave();
    assert.equal(events.length, 1, "auth-invalid 之后的主动 leave 不得补发第二个 closed");
  } finally {
    stop();
    await WebSocketClient.inst.leave().catch(() => {});
  }
});

test("订阅即回放：晚到订阅者立即拿到 ready 快照（不会永远错过 ready）", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  const { events, stop } = record();
  try {
    assert.equal(events.length, 1, "订阅时必须立即回放一条合成事件");
    assert.equal(events[0].kind, "ready");
    const snapshot = WebSocketClient.inst.getConnectionState();
    assert.equal(snapshot.state, "ready");
    assert.equal(events[0].connGeneration, snapshot.connGeneration);
    assert.equal(events[0].seq, snapshot.lastSeq, "回放事件的 seq 必须来自快照 lastSeq");
  } finally {
    stop();
    await WebSocketClient.inst.leave().catch(() => {});
  }
});

test("idle 状态订阅不回放；leave 后快照回到 idle", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const { events, stop } = record();
  try {
    assert.deepEqual(events, [], "idle 状态没有可回放的连接事实");
    assert.equal(WebSocketClient.inst.getConnectionState().state, "idle");
  } finally {
    stop();
  }
});

test("listener 异常不中断后续 listener 与主流程", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const seen: string[] = [];
  const stopThrowing = WebSocketClient.inst.subscribeConnection((event) => {
    seen.push(`throw:${event.kind}`);
    throw new Error("listener boom");
  });
  const stopTail = WebSocketClient.inst.subscribeConnection((event) => {
    seen.push(`tail:${event.kind}`);
  });
  try {
    const fake = makeFakeRoom();
    await joinWithFakeRoom(fake);
    assert.deepEqual(seen, ["throw:joining", "tail:joining", "throw:ready", "tail:ready"],
      "前一个 listener 抛错，后一个照常收到，join 主流程不受影响");
    assert.equal(WebSocketClient.inst.connected, true);
  } finally {
    stopThrowing();
    stopTail();
    await WebSocketClient.inst.leave().catch(() => {});
  }
});

test("connGeneration 随 slot 换代递增，seq 跨代单调", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const { events, stop } = record();
  try {
    const first = makeFakeRoom();
    await joinWithFakeRoom(first, "gen-token-1");
    await WebSocketClient.inst.leave();
    const second = makeFakeRoom();
    await joinWithFakeRoom(second, "gen-token-2");
    await WebSocketClient.inst.leave();
    const kinds = events.map((event) => event.kind);
    assert.deepEqual(kinds, ["joining", "ready", "closed", "joining", "ready", "closed"]);
    assert.ok(events[3].connGeneration > events[0].connGeneration, "新 slot 必须换代");
    assertSeqMonotonic(events);
  } finally {
    stop();
  }
});

test("replay 闸失守放弃连接：closed{final-loss}，不再补发 dropped/voluntary", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  // 忠实建模 SDK 队列的假房间（同 webSocketClient.test.ts）——bind 后把 reconnection
  // 换成不可控形状，onDrop 里闸装不回去只能放弃连接。
  const handlers: { drop?: () => void } = {};
  const room: Record<string, unknown> = {
    sessionId: "s_guard",
    reconnection: { enabled: true, maxEnqueuedMessages: 10, enqueuedMessages: [] },
    send() { /* noop */ },
    onMessage() { return () => {}; },
    onDrop(cb: () => void) { handlers.drop = cb; return () => {}; },
    onReconnect() { return () => {}; },
    onLeave() { return () => {}; },
    leave: async () => true,
    removeAllListeners() { /* noop */ },
  };
  const internals = WebSocketClient.inst as unknown as { client: unknown; endpoint: string };
  internals.endpoint = "http://conn-guard.example";
  internals.client = { auth: { token: "" }, joinOrCreate: async () => room };
  await WebSocketClient.inst.join("guard-token");
  const { events, stop } = record();
  try {
    (room as { reconnection: unknown }).reconnection = null;
    handlers.drop?.();
    const published = events.filter((event) => event.kind !== "ready"); // 回放的 ready 除外
    assert.equal(published.length, 1, "闸失守只发布一条终局事件");
    assert.ok(published[0].kind === "closed" && published[0].reason === "final-loss",
      "闸失守是非自愿最终断线：closed{final-loss}");
  } finally {
    stop();
    await WebSocketClient.inst.leave().catch(() => {});
  }
});
