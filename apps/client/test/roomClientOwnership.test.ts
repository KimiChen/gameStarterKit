/**
 * RoomClient 战斗房 ownership 竞态钉子（假 Colyseus，不走真实 ws）：
 *  1. 两代 enterBattle 合流同一个在途 join 时，旧代释放只减自己的 owner，不能关闭共享 room
 *  2. 旧 room 主动 leave 的迟到 onLeave 不能清掉后来创建的新 room，也不能误报 battleLost
 *  3. 当前 room 的非主动 onLeave 仍会失效 ownership 并上报 battleLost
 *  4. Main 的每个旧房业务回调都必须通过 gen + ownership + room 当前性守卫
 *  5. endpoint / token / sId / 未来 join 字段不同均不得合流到旧 slot
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { C2S, RoomName, PROTOCOL_VERSION } from "../src/shared/index";
import { RoomClient } from "../src/net/RoomClient";
import { onBattleLost } from "../src/net/session";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type RoomCallbacks = {
  drop?: (code?: number, reason?: string) => void;
  reconnect?: () => void;
  leave?: (code?: number, reason?: string) => void;
  error?: (code?: number, message?: string) => void;
};

function makeFakeRoom(name: string, leaveResult: Promise<boolean> = Promise.resolve(true)) {
  const callbacks: RoomCallbacks = {};
  const sent: Array<{ type: string; data: unknown }> = [];
  let leaveCalls = 0;
  let removeAllCalls = 0;
  const room = {
    roomId: name,
    sessionId: `${name}-session`,
    state: {},
    reconnection: { enabled: true },
    onDrop(cb: RoomCallbacks["drop"]) { callbacks.drop = cb; return () => {}; },
    onReconnect(cb: RoomCallbacks["reconnect"]) { callbacks.reconnect = cb; return () => {}; },
    onLeave(cb: RoomCallbacks["leave"]) { callbacks.leave = cb; return () => {}; },
    onError(cb: RoomCallbacks["error"]) { callbacks.error = cb; return () => {}; },
    onMessage() { return () => {}; },
    send(type: string, data: unknown) { sent.push({ type, data }); },
    leave() {
      leaveCalls++;
      return leaveResult;
    },
    removeAllListeners() { removeAllCalls++; },
  };
  return {
    room,
    callbacks,
    sent,
    get leaveCalls() { return leaveCalls; },
    get removeAllCalls() { return removeAllCalls; },
  };
}

const joinQueue: Array<Deferred<unknown>> = [];
const joinCalls: Array<{ endpoint: string; roomName: string; options: Record<string, unknown> }> = [];

class FakeColyseusClient {
  constructor(private readonly endpoint: string) {}

  joinOrCreate(roomName: string, options: Record<string, unknown>): Promise<unknown> {
    const next = joinQueue.shift();
    assert.ok(next, "测试必须先准备 join 结果");
    joinCalls.push({ endpoint: this.endpoint, roomName, options });
    return next.promise;
  }
}

(globalThis as any).Colyseus = {
  Client: FakeColyseusClient,
  getStateCallbacks: () => { throw new Error("本组 ownership 测试不应读取状态树"); },
};

function makeClient(...joins: Array<Deferred<unknown>>): RoomClient {
  joinQueue.length = 0;
  joinQueue.push(...joins);
  joinCalls.length = 0;
  const client = new RoomClient();
  client.init("http://game.example");
  return client;
}

test("合流同一在途 join：旧 owner 释放不关闭后来者共享的 room", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("shared");
  const client = makeClient(join);

  const oldGeneration = client.joinGame({ token: "same-session", sId: 7 });
  const newGeneration = client.joinGame({ token: "same-session", sId: 7 });
  assert.equal(joinCalls.length, 1, "两代在 join 在途期必须合流同一个物理连接槽");
  assert.deepEqual(joinCalls[0], {
    endpoint: "http://game.example",
    roomName: RoomName.Game,
    options: { v: PROTOCOL_VERSION, token: "same-session", sId: 7 },
  });

  // 先挂 rejection 断言，避免 resolve join 后旧 ownership 的预期 rejection 成为 unhandled。
  const oldReadyRejected = assert.rejects(oldGeneration.ready, /ownership 已释放/);
  await oldGeneration.leave();
  join.resolve(fake.room);

  await oldReadyRejected;
  assert.equal(await newGeneration.ready, fake.room);
  assert.equal(client.room, fake.room);
  assert.equal(fake.leaveCalls, 0, "旧世代只能释放自己的 owner，不能关闭后来者仍持有的共享 room");

  await newGeneration.leave();
  assert.equal(fake.leaveCalls, 1, "最后一个 owner 释放时才关闭物理 room");
  assert.equal(client.room, null);
});

test("slot 连接 key：endpoint/token/sId/其它 option 任一不同均 fail-fast，且不破坏原 owner", async (t) => {
  const base = { token: "token-a", sId: 7, listHash: "list-a" };
  const cases = [
    {
      name: "endpoint 不同",
      prepare(client: RoomClient) { client.init("http://other-game.example"); },
      options: base,
    },
    {
      name: "token 不同",
      prepare(_client: RoomClient) { /* endpoint 不变 */ },
      options: { ...base, token: "token-b" },
    },
    {
      name: "sId 不同",
      prepare(_client: RoomClient) { /* endpoint 不变 */ },
      options: { ...base, sId: 8 },
    },
    {
      name: "未来其它协议字段不同",
      prepare(_client: RoomClient) { /* endpoint 不变 */ },
      options: { ...base, listHash: "list-b" },
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const join1 = deferred<unknown>();
      const join2 = deferred<unknown>();
      const room1 = makeFakeRoom(`${item.name}-old`);
      const room2 = makeFakeRoom(`${item.name}-new`);
      const client = makeClient(join1, join2);
      const original = client.joinGame(base);

      item.prepare(client);
      assert.throws(
        () => client.joinGame(item.options),
        /参数与本次 join 不一致，请先释放现有 ownership/,
        "身份冲突不得静默合流到旧 slot",
      );
      assert.equal(joinCalls.length, 1, "冲突调用不能发起第二条连接，也不能改写现有 slot");

      join1.resolve(room1.room);
      assert.equal(await original.ready, room1.room, "原 ownership 必须保持可用");
      assert.equal(client.room, room1.room);
      assert.equal(room1.leaveCalls, 0);
      await original.leave();

      const replacement = client.joinGame(item.options);
      assert.equal(joinCalls.length, 2, "显式释放旧 ownership 后才能按新 key 建房");
      join2.resolve(room2.room);
      assert.equal(await replacement.ready, room2.room);
      await replacement.leave();
    });
  }
});

test("slot 连接 key：完整 options 递归稳定比较，键顺序/对象 undefined 不造成误拒", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("stable-key");
  const client = makeClient(join);
  const first = client.joinGame({
    token: "same",
    sId: 3,
    listHash: "h",
    nested: { z: [1, 2], a: { y: true, x: "x" } },
    omitted: undefined,
  });
  const second = client.joinGame({
    nested: { a: { x: "x", y: true }, z: [1, 2] },
    listHash: "h",
    sId: 3,
    token: "same",
  });

  assert.equal(joinCalls.length, 1, "JSON 等价的完整 options 应安全合流");
  join.resolve(fake.room);
  assert.equal(await first.ready, fake.room);
  assert.equal(await second.ready, fake.room);
  await first.leave();
  assert.equal(fake.leaveCalls, 0);
  await second.leave();
  assert.equal(fake.leaveCalls, 1);
});

test("旧 room 的迟到 onLeave 不得清除/上报后来创建的新 room", async () => {
  const join1 = deferred<unknown>();
  const join2 = deferred<unknown>();
  const oldLeave = deferred<boolean>();
  const oldRoom = makeFakeRoom("old", oldLeave.promise);
  const newRoom = makeFakeRoom("new");
  const client = makeClient(join1, join2);
  let battleLost = 0;
  const off = onBattleLost(() => { battleLost++; });

  try {
    const oldOwner = client.joinGame();
    join1.resolve(oldRoom.room);
    assert.equal(await oldOwner.ready, oldRoom.room);

    // leave() 会在等待旧房 LEAVE 完成前同步摘掉旧 slot；后来者必须立刻能建独立的新 slot。
    const closingOld = oldOwner.leave();
    const newOwner = client.joinGame();
    join2.resolve(newRoom.room);
    assert.equal(await newOwner.ready, newRoom.room);
    assert.equal(joinCalls.length, 2);
    assert.equal(client.room, newRoom.room);

    // 模拟旧 SDK 连接稍后才派发 onLeave。它只能命中旧 slot，不能污染当前连接。
    oldRoom.callbacks.leave?.(1000, "late active-leave callback");
    assert.equal(client.room, newRoom.room);
    assert.equal(client.connected, true);
    assert.equal(battleLost, 0, "主动关闭旧 room 的迟到事件不能误报当前战斗死亡");

    oldLeave.resolve(true);
    await closingOld;
    assert.equal(oldRoom.removeAllCalls, 1);
    assert.equal(client.room, newRoom.room);

    await newOwner.leave();
    assert.equal(newRoom.leaveCalls, 1);
  } finally {
    off();
    oldLeave.resolve(true);
  }
});

test("当前 room 非主动 onLeave：失效 owner、清当前槽并且只上报一次 battleLost", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("dropped");
  const client = makeClient(join);
  let battleLost = 0;
  const off = onBattleLost(() => { battleLost++; });

  try {
    const owner = client.joinGame();
    join.resolve(fake.room);
    await owner.ready;

    fake.callbacks.leave?.(1006, "network lost");
    assert.equal(client.room, null);
    assert.equal(client.connected, false);
    assert.equal(battleLost, 1);

    await owner.leave();
    assert.equal(fake.leaveCalls, 0, "物理 room 已非主动死亡，失效 owner 再 leave 必须是幂等空操作");
    fake.callbacks.leave?.(1006, "duplicate callback");
    assert.equal(battleLost, 1, "重复旧回调不得重复上报");
  } finally {
    off();
  }
});

test("Main：每个旧房 message/schema 回调都经过 gen + ownership + room 当前性守卫", () => {
  const source = readFileSync(new URL("../src/Main.ts", import.meta.url), "utf8");
  const helperStart = source.indexOf("    private isCurrentBattleBinding(");
  const bindStart = source.indexOf("    private bindRoom(", helperStart);
  const bindEnd = source.indexOf("\n    update(dt:", bindStart);
  assert.ok(helperStart >= 0 && bindStart > helperStart && bindEnd > bindStart, "Main 必须保留精确房绑定守卫与 bindRoom");

  const helper = source.slice(helperStart, bindStart);
  assert.match(helper, /this\.battleGen === gen/, "守卫必须核对 enterBattle 世代");
  assert.match(helper, /this\.battleRoom === ownership/, "守卫必须核对精确 ownership");
  assert.match(helper, /RoomClient\.inst\.room === room/, "守卫必须核对当前物理 room");

  const bind = source.slice(bindStart, bindEnd);
  assert.match(bind, /const isCurrent = \(\) => this\.isCurrentBattleBinding\(gen, ownership, room\)/);
  const callbackCount = (bind.match(/\.(?:onMessage|onAdd|onChange|onRemove)\(/g) ?? []).length;
  const guardCount = (bind.match(/if \(!isCurrent\(\)\) \{ return; \}/g) ?? []).length;
  assert.equal(callbackCount, 8, "新增/删除异步 room 回调时必须同步审计守卫");
  assert.equal(guardCount, callbackCount, "每个 message/schema 回调入口都必须先拒绝旧世代");
});

test("掉线输入 reconcile：松手后的 stop/最新方向成为重连后的第一条有效输入", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("input-reconcile");
  const client = makeClient(join);
  const owner = client.joinGame();
  join.resolve(fake.room);
  await owner.ready;

  // join 建立时会先对账一次初始 stop；后续断线断言只关注本段输入。
  fake.sent.length = 0;
  client.move(1, 0);
  assert.deepEqual(fake.sent.at(-1), { type: C2S.Move, data: { dirX: 1, dirY: 0 } });
  fake.callbacks.drop?.(1006, "temporary");

  // dropping 窗口中不发旧方向，但必须更新 desired seq；用户随后松手写入 stop。
  client.move(0, 0);
  assert.equal(fake.sent.length, 1, "掉线期间不应把输入排进旧连接");
  fake.callbacks.reconnect?.();
  assert.deepEqual(fake.sent.at(-1), { type: C2S.Move, data: { dirX: 0, dirY: 0 } });

  await owner.leave();
});

test("RoomClient join 黑洞：超时/AbortSignal 不阻塞 leave，迟到 room 会被释放", async () => {
  const pending = deferred<unknown>();
  const late = makeFakeRoom("late-game");
  const client = makeClient(pending);
  const owner = client.joinGame(undefined, { timeoutMs: 10 });
  await assert.rejects(owner.ready, (e: unknown) => (e as { code?: string })?.code === "TIMEOUT");
  await owner.leave();
  pending.resolve(late.room);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(late.leaveCalls, 1);

  const pendingCancel = deferred<unknown>();
  const lateCancel = makeFakeRoom("late-game-cancel");
  const controller = new AbortController();
  const client2 = makeClient(pendingCancel);
  const owner2 = client2.joinGame(undefined, controller.signal);
  controller.abort();
  await assert.rejects(owner2.ready, (e: unknown) => (e as { code?: string })?.code === "CANCELLED");
  await owner2.leave();
  pendingCancel.resolve(lateCancel.room);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(lateCancel.leaveCalls, 1);
});
