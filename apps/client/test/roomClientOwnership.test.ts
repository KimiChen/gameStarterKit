/**
 * RoomClient 战斗房 ownership 竞态钉子（假 Colyseus，不走真实 ws）：
 *  1. 两代 enterBattle 合流同一个在途 join 时，旧代释放只减自己的 owner，不能关闭共享 room
 *  2. 旧 room 主动 leave 的迟到 onLeave 不能清掉后来创建的新 room，也不能误报 battleLost
 *  3. 当前 room 的非主动 onLeave 仍会失效 ownership 并上报 battleLost
 *  4. BallMoveRoom 的消息、Schema 与发送必须绑定捕获 room，Main 只做 controller 装配
 *  5. endpoint / token / sId / 未来 join 字段不同均不得合流到旧 slot
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { C2S, GameplayModeId, RoomName, PROTOCOL_VERSION, S2C, type IGameRoomState, type IPlayerState } from "../src/shared/index";
import { RoomClient } from "../src/net/RoomClient";
import { createBallMoveRoom, createBallMoveRoomJoiner } from "../src/net/rooms/BallMoveRoom";
import { createIdleRoomJoiner } from "../src/net/rooms/IdleRoom";
import { setServerList } from "../src/net/serverSession";
import { onBattleLost } from "../src/net/session";
import type { WebPlatformAreaListResponse } from "../src/shared/index";

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

  auth = { token: "" };

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
    options: { v: PROTOCOL_VERSION, token: "same-session", sId: 7, mode: GameplayModeId.BallMove },
  });
  assert.equal(
    (client as unknown as { client: FakeColyseusClient }).client.auth.token,
    "same-session",
    "战斗 join 必须把固化 token 写入 SDK 标准 auth 字段",
  );

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
  const base = { token: "token-a", sId: 7 };
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
      name: "mode 不同",
      prepare(_client: RoomClient) { /* endpoint 不变 */ },
      options: { ...base, mode: GameplayModeId.Idle },
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

test("slot 连接 key：契约允许字段稳定比较，键顺序/undefined 不造成误拒", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("stable-key");
  const client = makeClient(join);
  const first = client.joinGame({
    token: "same",
    sId: 3,
    omitted: undefined,
  });
  const second = client.joinGame({
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

test("slot 连接 key：未知 join option 在发送前拒绝", () => {
  const client = makeClient();
  assert.throws(
    () => client.joinGame({ token: "same", sId: 3, nested: { x: 1 } }),
    /未知字段|unknown|options/i,
  );
});

test("非法 join control 在分配 slot 前失败，不遗留 owner", async () => {
  const join = deferred<unknown>();
  const client = makeClient(join);
  assert.throws(
    () => client.joinGame({ token: "same", sId: 3 }, { timeoutMs: 1.5 } as never),
    /安全整数/,
  );
  assert.equal(joinCalls.length, 0, "非法 timeout 不应启动底层 join");

  const owner = client.joinGame({ token: "same", sId: 3 });
  assert.equal(joinCalls.length, 1, "失败调用不得占住后续合法 join 的 slot");
  const room = makeFakeRoom("after-invalid");
  join.resolve(room.room);
  await owner.ready;
  await owner.leave();
});

test("hostile AbortSignal：读取 aborted 在分配 slot 前失败", () => {
  const join = deferred<unknown>();
  const client = makeClient(join);
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
    () => client.joinGame({ token: "same", sId: 3 }, signal as never),
    /有效的 AbortSignal/,
  );
  assert.equal(joinCalls.length, 0, "signal shape failure must precede transport slot allocation");
  assert.equal(client.room, null);
});

test("hostile AbortSignal：addEventListener 抛错时 owner/slot 清理，迟到 room 释放", async () => {
  const join = deferred<unknown>();
  const client = makeClient(join);
  const fake = makeFakeRoom("late-after-signal");
  const signal = {
    aborted: false,
    addEventListener() { throw new Error("hostile add listener"); },
    removeEventListener() { /* noop */ },
  } as unknown as AbortSignal;

  assert.throws(
    () => client.joinGame({ token: "same", sId: 3 }, signal),
    /hostile add listener/,
  );
  assert.equal((client as unknown as { slot: unknown }).slot, null);
  join.resolve(fake.room);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fake.leaveCalls, 1, "迟到 room must be physically released after signal setup failure");
});

test("hostile AbortSignal：removeEventListener 抛错不阻断成功 join/leave", async () => {
  const join = deferred<unknown>();
  const client = makeClient(join);
  const fake = makeFakeRoom("remove-throws");
  const signal = {
    aborted: false,
    addEventListener() { /* noop */ },
    removeEventListener() { throw new Error("hostile remove listener"); },
  } as unknown as AbortSignal;
  const owner = client.joinGame({ token: "same", sId: 3 }, signal);
  join.resolve(fake.room);
  assert.equal(await owner.ready, fake.room);
  await owner.leave();
  assert.equal(fake.leaveCalls, 1);
});

test("joinOrCreate 同步抛错：迟到 owner 立即失败并释放失败槽", async () => {
  const client = makeClient();
  const failure = new Error("sync game join failure");
  const internals = client as unknown as {
    client: { auth: { token: string }; joinOrCreate: (...args: unknown[]) => Promise<unknown> };
    slot: unknown;
    closeSlot: (slot: unknown) => Promise<void>;
  };
  internals.client = { auth: { token: "" }, joinOrCreate() { throw failure; } };
  const originalCloseSlot = internals.closeSlot;
  let closeCalls = 0;
  internals.closeSlot = (slot) => {
    closeCalls++;
    return originalCloseSlot.call(client, slot);
  };

  try {
    // A long timeout makes a leaked control timer observable as a hanging test;
    // the failed slot must cancel before installing it.
    const owner = client.joinGame(undefined, { timeoutMs: 60_000 });
    await assert.rejects(owner.ready, (error: unknown) => error === failure);
    assert.equal(internals.slot, null, "同步失败后当前 slot 必须摘除");
    assert.equal(closeCalls, 1, "迟到 owner 必须触发失败槽清理");
    await owner.leave();
  } finally {
    internals.closeSlot = originalCloseSlot;
  }
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

test("BallMoveRoom：消息、Schema 与发送都绑定捕获的物理 room", () => {
  const source = readFileSync(new URL("../src/net/rooms/BallMoveRoom.ts", import.meta.url), "utf8");
  assert.match(source, /const isCurrent = \(\) => client\.room === room/,
    "capability 必须核对捕获 room，不能把操作发给全局后来者");
  assert.match(source, /client\.onMessage\(room, type/,
    "消息监听必须登记在捕获 room 上");
  assert.match(source, /if \(isCurrent\(\)\) callback\(message\)/,
    "所有消息回调必须经过统一 current-room 守卫");
  const stateSection = source.slice(source.indexOf("function observePlayers("));
  assert.equal((stateSection.match(/if \(!isActive\(\)\) return;/g) ?? []).length, 2,
    "players add/remove 入口必须拒绝旧 room");
  assert.match(stateSection, /if \(isActive\(\)\) observer\.change\(player\)/,
    "player change 的迟到回调也必须拒绝旧 room");
  assert.equal((source.match(/if \(isCurrent\(\)\) client\.(?:move|ping)/g) ?? []).length, 2,
    "move/ping 必须核对捕获 room");
  assert.match(source, /const inputGeneration = client\.inputGeneration/);
  assert.match(source, /client\.clearDesiredMove\(inputGeneration\)/,
    "stop 发生在 leave 摘槽后，clear 必须按输入世代精确生效");
});

test("BallMoveRoom capability：切到后来 room 后，迟到消息/Schema/发送全部失效", () => {
  const captured = {
    roomId: "captured",
    sessionId: "self",
    state: {},
  } as unknown as Colyseus.Room<IGameRoomState>;
  const later = {
    roomId: "later",
    sessionId: "later-self",
    state: {},
  } as unknown as Colyseus.Room<IGameRoomState>;
  let current: Colyseus.Room<IGameRoomState> | null = captured;
  const messages = new Map<string, (payload: unknown) => void>();
  const playerCallbacks: {
    add?: (player: IPlayerState, sessionId: string) => void;
    remove?: (player: IPlayerState, sessionId: string) => void;
    change?: () => void;
  } = {};
  const moves: Array<[number, number]> = [];
  const clears: number[] = [];
  let pings = 0;
  const transport = {
    get room() { return current; },
    dropping: false,
    inputGeneration: 17,
    onMessage(_room: unknown, type: string, callback: (payload: unknown) => void) {
      messages.set(type, callback);
      return () => { messages.delete(type); };
    },
    state$() {
      return (target: unknown) => target === captured.state
        ? {
            players: {
              onAdd(callback: NonNullable<typeof playerCallbacks.add>) {
                playerCallbacks.add = callback;
                return () => { delete playerCallbacks.add; };
              },
              onRemove(callback: NonNullable<typeof playerCallbacks.remove>) {
                playerCallbacks.remove = callback;
                return () => { delete playerCallbacks.remove; };
              },
            },
          }
        : {
            onChange(callback: () => void) {
              playerCallbacks.change = callback;
              return () => { delete playerCallbacks.change; };
            },
          };
    },
    move(x: number, y: number) { moves.push([x, y]); },
    clearDesiredMove(generation: number) { clears.push(generation); return true; },
    ping() { pings++; },
  } as unknown as RoomClient;
  const capability = createBallMoveRoom(captured, transport);
  let welcomes = 0;
  let adds = 0;
  let changes = 0;
  let removes = 0;
  const offMessage = capability.onWelcome(() => { welcomes++; });
  const offPlayers = capability.observePlayers({
    add: () => { adds++; },
    change: () => { changes++; },
    remove: () => { removes++; },
  });
  const self: IPlayerState = {
    id: "self", name: "self", x: 1, y: 2, hp: 100, maxHp: 100, alive: true,
  };

  messages.get(S2C.Welcome)?.({ sessionId: "self", tickRate: 20, motd: "ok" });
  playerCallbacks.add?.(self, "self");
  playerCallbacks.change?.();
  capability.move(1, 0);
  capability.ping();
  assert.deepEqual({ welcomes, adds, changes, removes, moves, pings }, {
    welcomes: 1, adds: 1, changes: 1, removes: 0, moves: [[1, 0]], pings: 1,
  });

  current = later;
  messages.get(S2C.Welcome)?.({ sessionId: "self", tickRate: 20, motd: "late" });
  playerCallbacks.add?.(self, "self");
  playerCallbacks.change?.();
  playerCallbacks.remove?.(self, "self");
  capability.move(0, 1);
  capability.ping();
  capability.clearMove();
  assert.deepEqual({ welcomes, adds, changes, removes, moves, pings }, {
    welcomes: 1, adds: 1, changes: 1, removes: 0, moves: [[1, 0]], pings: 1,
  });
  assert.deepEqual(clears, [17], "leave 已摘槽时仍按捕获的 input generation 清理");
  offMessage();
  offPlayers();
  assert.equal(messages.size, 0);
  assert.deepEqual(playerCallbacks, {});
});

test("BallMoveRoom joiner：连接端点直接取当前区的 gameWsUrl", async () => {
  const directory: WebPlatformAreaListResponse = {
    isOps: false,
    hash: "ws-contract",
    myServerIds: [92],
    servers: [{
      serverId: 92,
      name: "区92",
      tag: "normal",
      status: "smooth",
      openTime: 1,
      gameHttpUrl: "https://http-zone-92.example",
      gameWsUrl: "wss://ws-zone-92.example",
    }],
  };
  setServerList(directory);
  const calls: { endpoint?: string; options?: Record<string, unknown> } = {};
  const room = { roomId: "room-92", sessionId: "self-92" };
  const fakeClient = {
    init(endpoint: string) { calls.endpoint = endpoint; },
    joinGame(options: Record<string, unknown>) {
      calls.options = options;
      return { ready: Promise.resolve(room), leave: async () => {} };
    },
  } as unknown as RoomClient;
  try {
    const ownership = createBallMoveRoomJoiner(fakeClient).join(new AbortController().signal);
    assert.equal((await ownership.ready).roomId, "room-92");
    assert.equal(calls.endpoint, "wss://ws-zone-92.example");
    assert.deepEqual(calls.options, { token: "", sId: 92, mode: GameplayModeId.BallMove });
    await ownership.leave();
  } finally {
    setServerList({ isOps: false, hash: "reset", myServerIds: [], servers: [] });
  }
});

test("IdleRoom joiner：复用同一区服 transport 并显式选择 idle mode", async () => {
  const directory: WebPlatformAreaListResponse = {
    isOps: false,
    hash: "idle-ws-contract",
    myServerIds: [93],
    servers: [{
      serverId: 93,
      name: "区93",
      tag: "normal",
      status: "smooth",
      openTime: 1,
      gameHttpUrl: "https://http-zone-93.example",
      gameWsUrl: "wss://ws-zone-93.example",
    }],
  };
  setServerList(directory);
  const calls: { endpoint?: string; options?: Record<string, unknown> } = {};
  const physical = { roomId: "idle-room-93", sessionId: "idle-self-93" };
  const fakeClient = {
    init(endpoint: string) { calls.endpoint = endpoint; },
    joinGame(options: Record<string, unknown>) {
      calls.options = options;
      return { ready: Promise.resolve(physical), leave: async () => {} };
    },
  } as unknown as RoomClient;
  try {
    const ownership = createIdleRoomJoiner(fakeClient).join(new AbortController().signal);
    assert.deepEqual(await ownership.ready, {
      kind: "idle",
      roomId: "idle-room-93",
      sessionId: "idle-self-93",
    });
    assert.equal(calls.endpoint, "wss://ws-zone-93.example");
    assert.deepEqual(calls.options, { token: "", sId: 93, mode: GameplayModeId.Idle });
    await ownership.leave();
  } finally {
    setServerList({ isOps: false, hash: "reset", myServerIds: [], servers: [] });
  }
});

test("Main：只装配 registry/controller/catalog，不再内联 RoomClient、ECS 或玩法回调", () => {
  const source = readFileSync(new URL("../src/Main.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bRoomClient\b|\bGameECS\b|\bPlayerModel\b|bindRoom\(/);
  assert.match(source, /registerDefaultGameplays\(registry,/);
  assert.match(source, /controller\.startRegistered\(registry, requestedId, signal\)/);
  assert.match(source, /controller\.tick\(dt\)/);
  assert.match(source, /roomController\?\.stop\(\{ kind \}\)/);
  assert.doesNotMatch(source, /createIdleRoomJoiner|registerIdleGameplay/,
    "第二玩法的 joiner/登记应归 catalog，而不是重新侵入 Main");
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

test("输入 generation：leave 摘槽后本局可清零，旧局迟到 stop 不覆盖新局方向", async () => {
  const firstJoin = deferred<unknown>();
  const firstRoom = makeFakeRoom("input-generation-old");
  const client = makeClient(firstJoin);
  const oldOwner = client.joinGame();
  firstJoin.resolve(firstRoom.room);
  await oldOwner.ready;
  client.move(1, 0);
  const oldInputGeneration = client.inputGeneration;
  await oldOwner.leave();

  assert.equal(client.clearDesiredMove(oldInputGeneration), true,
    "RoomController 先 leave 再 stop plugin 时，本局 generation 仍应能清零 desired");
  assert.deepEqual(client.desiredMove, { dirX: 0, dirY: 0, seq: 2 });

  const nextJoin = deferred<unknown>();
  const nextRoom = makeFakeRoom("input-generation-new");
  joinQueue.push(nextJoin);
  const newOwner = client.joinGame();
  nextJoin.resolve(nextRoom.room);
  await newOwner.ready;
  client.move(0, 1);
  const desired = client.desiredMove;
  assert.equal(client.clearDesiredMove(oldInputGeneration), false,
    "旧插件迟到清理必须被新 input generation 拒绝");
  assert.strictEqual(client.desiredMove, desired);
  assert.deepEqual(client.desiredMove, { dirX: 0, dirY: 1, seq: 3 });
  await newOwner.leave();
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
