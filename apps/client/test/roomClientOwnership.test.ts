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
import {
  C2S,
  GamePhase,
  GameplayModeId,
  GAMEPLAY_CATALOG,
  RoomName,
  GAME_ROOM_PROTOCOL_VERSION,
  S2C,
  type IGameRoomState,
  type IPlayerState,
} from "../src/shared/index";
import { RoomClient, type GameplayRoomAdapter } from "../src/net/RoomClient";
import { createBallMoveRoom, createBallMoveRoomJoiner } from "../src/net/rooms/BallMoveRoom";
import { createIdleRoom, createIdleRoomJoiner } from "../src/net/rooms/IdleRoom";
import {
  createBallMoveRoomAdapter,
  createIdleRoomAdapter,
  type BallMoveRoomAdapter,
  type BallMoveTypedRoom,
  type IdleTypedRoom,
} from "../src/net/rooms/GameRoomTransport";
import { setServerList } from "../src/net/serverSession";
import { clearSession, isLoggedIn, onBattleLost, setSession } from "../src/net/session";
import { getToken } from "../src/core/http";
import { PrivateRoomError, PrivateRoomService, type PrivateRoomLobbyPort } from "../src/net/rooms/PrivateRoomService";
import type { WebSocketClient } from "../src/net/WebSocketClient";
import { RoomRpc } from "../src/shared/index";
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
  state?: () => void;
  drop?: (code?: number, reason?: string) => void;
  reconnect?: () => void;
  leave?: (code?: number, reason?: string) => void;
  error?: (code?: number, message?: string) => void;
};

function validBallMoveState() {
  return { tick: 0, phase: GamePhase.Waiting, matchId: "", players: new Map() };
}

function validIdleState() {
  return {
    tick: 0,
    phase: GamePhase.Waiting,
    matchId: "",
    pulseGoal: 3,
    winnerId: "",
    players: new Map(),
  };
}

function makeFakeRoom(
  name: string,
  leaveResult: Promise<boolean> = Promise.resolve(true),
  state: unknown = validBallMoveState(),
  emitInitialState = true,
) {
  const callbacks: RoomCallbacks = {};
  const sent: Array<{ type: string; data: unknown }> = [];
  const reconnection = {
    enabled: true,
    maxEnqueuedMessages: 10,
    enqueuedMessages: [] as Array<{ data: { type: string; data: unknown } }>,
  };
  let connectionOpen = true;
  let leaveCalls = 0;
  let removeAllCalls = 0;
  const room = {
    roomId: name,
    sessionId: `${name}-session`,
    state,
    reconnection,
    // 与 SDK 一致：socket 判定挂在 room.connection.isOpen 上，随 connectionOpen 变化。
    connection: { get isOpen() { return connectionOpen; } },
    onDrop(cb: RoomCallbacks["drop"]) { callbacks.drop = cb; return () => {}; },
    onReconnect(cb: RoomCallbacks["reconnect"]) { callbacks.reconnect = cb; return () => {}; },
    onLeave(cb: RoomCallbacks["leave"]) { callbacks.leave = cb; return () => {}; },
    onError(cb: RoomCallbacks["error"]) { callbacks.error = cb; return () => {}; },
    onMessage() { return () => {}; },
    onStateChange(cb: RoomCallbacks["state"]) {
      callbacks.state = cb;
      if (emitInitialState) cb?.();
      return () => {};
    },
    send(type: string, data: unknown) {
      const message = { type, data };
      if (connectionOpen) {
        sent.push(message);
        return;
      }
      reconnection.enqueuedMessages.push({ data: message });
      if (reconnection.enqueuedMessages.length > reconnection.maxEnqueuedMessages) {
        reconnection.enqueuedMessages.shift();
      }
    },
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
    emitState() { callbacks.state?.(); },
    setConnectionOpen(open: boolean) { connectionOpen = open; },
    emitReconnect() {
      connectionOpen = true;
      callbacks.reconnect?.();
      for (const message of reconnection.enqueuedMessages) sent.push(message.data);
      reconnection.enqueuedMessages.length = 0;
    },
    get leaveCalls() { return leaveCalls; },
    get removeAllCalls() { return removeAllCalls; },
  };
}

const joinQueue: Array<Deferred<unknown>> = [];
const joinCalls: Array<{
  method: "joinOrCreate" | "create" | "joinById";
  endpoint: string;
  roomName: string;
  options: Record<string, unknown>;
}> = [];

class FakeColyseusClient {
  constructor(private readonly endpoint: string) {}

  auth = { token: "" };

  private take(
    method: "joinOrCreate" | "create" | "joinById",
    roomName: string,
    options: Record<string, unknown>,
  ): Promise<unknown> {
    const next = joinQueue.shift();
    assert.ok(next, "测试必须先准备 join 结果");
    joinCalls.push({ method, endpoint: this.endpoint, roomName, options });
    return next.promise;
  }

  joinOrCreate(roomName: string, options: Record<string, unknown>): Promise<unknown> {
    return this.take("joinOrCreate", roomName, options);
  }

  create(roomName: string, options: Record<string, unknown>): Promise<unknown> {
    return this.take("create", roomName, options);
  }

  joinById(roomId: string, options: Record<string, unknown>): Promise<unknown> {
    return this.take("joinById", roomId, options);
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

function physicalRoomOf(client: RoomClient): unknown | null {
  return (client as unknown as { slot: { room: unknown } | null }).slot?.room ?? null;
}

const clientBallAdapters = new WeakMap<RoomClient, BallMoveRoomAdapter>();
function ballAdapter(client: RoomClient): BallMoveRoomAdapter {
  let adapter = clientBallAdapters.get(client);
  if (!adapter) {
    adapter = createBallMoveRoomAdapter();
    clientBallAdapters.set(client, adapter);
  }
  return adapter;
}

/** v8 必填信封（§4.4）：与生产 joinGameRoom 同口径的注入（modeVersion 取 catalog 单源）。 */
const BALL_WIRE = { modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion, profile: "default" } as const;
const IDLE_WIRE = { modeVersion: GAMEPLAY_CATALOG.idle.modeVersion, profile: "default" } as const;

function joinBall(
  client: RoomClient,
  options?: Record<string, unknown>,
  control?: Parameters<RoomClient["joinGame"]>[2],
) {
  return client.joinGame(ballAdapter(client), { ...BALL_WIRE, ...(options ?? {}) }, control);
}

test("合流同一在途 join：旧 owner 释放不关闭后来者共享的 room", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("shared");
  const client = makeClient(join);

  const oldGeneration = joinBall(client, { token: "same-session", sId: 7 });
  const newGeneration = joinBall(client, { token: "same-session", sId: 7 });
  assert.equal(joinCalls.length, 1, "两代在 join 在途期必须合流同一个物理连接槽");
  assert.deepEqual(joinCalls[0], {
    method: "joinOrCreate",
    endpoint: "http://game.example",
    roomName: RoomName.Game,
    options: {
      v: GAME_ROOM_PROTOCOL_VERSION,
      token: "same-session",
      sId: 7,
      mode: GameplayModeId.BallMove,
      ...BALL_WIRE,
    },
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
  await newGeneration.ready;
  assert.equal(physicalRoomOf(client), fake.room);
  assert.equal(fake.leaveCalls, 0, "旧世代只能释放自己的 owner，不能关闭后来者仍持有的共享 room");

  await newGeneration.leave();
  assert.equal(fake.leaveCalls, 1, "最后一个 owner 释放时才关闭物理 room");
  assert.equal(physicalRoomOf(client), null);
});

test("slot 连接 key：endpoint/token/sId 任一不同均 fail-fast，且不破坏原 owner", async (t) => {
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
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const join1 = deferred<unknown>();
      const join2 = deferred<unknown>();
      const room1 = makeFakeRoom(`${item.name}-old`);
      const room2 = makeFakeRoom(`${item.name}-new`);
      const client = makeClient(join1, join2);
      const original = joinBall(client, base);

      item.prepare(client);
      assert.throws(
        () => joinBall(client, item.options),
        /参数与本次 join 不一致，请先释放现有 ownership/,
        "身份冲突不得静默合流到旧 slot",
      );
      assert.equal(joinCalls.length, 1, "冲突调用不能发起第二条连接，也不能改写现有 slot");

      join1.resolve(room1.room);
      await original.ready;
      assert.equal(physicalRoomOf(client), room1.room, "原 ownership 必须保持可用");
      assert.equal(room1.leaveCalls, 0);
      await original.leave();

      const replacement = joinBall(client, item.options);
      assert.equal(joinCalls.length, 2, "显式释放旧 ownership 后才能按新 key 建房");
      join2.resolve(room2.room);
      await replacement.ready;
      assert.equal(physicalRoomOf(client), room2.room);
      await replacement.leave();
    });
  }
});

test("join mode 与 adapter 不匹配时在 SDK join 前 fail-closed", () => {
  const client = makeClient();
  const idleAdapter = createIdleRoomAdapter();
  assert.throws(
    () => client.joinGame(idleAdapter, { mode: GameplayModeId.BallMove, token: "same", sId: 7 }),
    /mode 与 gameplay adapter 不匹配/,
  );
  assert.equal(joinCalls.length, 0, "mode/adapter mismatch 不能分配物理连接");
  assert.equal(physicalRoomOf(client), null);
});

test("GameplayRoomAdapter：state 类型由 mode 映射，不能独立拼接异构 validator", () => {
  const idleAdapter = createIdleRoomAdapter();
  const invalid: GameplayRoomAdapter<typeof GameplayModeId.BallMove, typeof C2S.Move> = {
    mode: GameplayModeId.BallMove,
    outbound: [C2S.Move],
    // @ts-expect-error ballMove adapter 的 validator 必须返回 RoomStateByMode["ballMove"]。
    validateState: (input) => idleAdapter.validateState(input),
  };
  assert.equal(invalid.mode, GameplayModeId.BallMove);
});

test("玩法 transport API：不暴露原始 SDK room/send", () => {
  const typed = {} as BallMoveTypedRoom;
  const client = new RoomClient();
  if (false) {
    // @ts-expect-error gameplay capability 不能取得原始 SDK room 绕过 send allowlist。
    void typed.room;
    // @ts-expect-error RoomClient 也不能公开当前原始 SDK room。
    void client.room;
  }
  assert.equal("room" in client, false);
});

test("Idle adapter：直接 exact 校验 reflected Schema，不洗掉 root/player 额外 wire 字段", () => {
  class ReflectedIdleState {
    constructor(private readonly extraAt: "none" | "root" | "player") {
      Object.defineProperties(this, {
        "~changes": { value: {}, enumerable: false },
        "~refId": { value: 1, enumerable: false },
      });
    }
    toJSON() {
      const player = { id: "idle-session", name: "Idle", pulses: 2 } as Record<string, unknown>;
      if (this.extraAt === "player") player.extraPlayer = true;
      const state = {
        tick: 7,
        phase: GamePhase.Playing,
        matchId: "idle-match",
        pulseGoal: 3,
        winnerId: "",
        players: { "idle-session": player },
      } as Record<string, unknown>;
      if (this.extraAt === "root") state.extraRoot = true;
      return state;
    }
  }
  const adapter = createIdleRoomAdapter();
  const parsed = adapter.validateState(new ReflectedIdleState("none"));
  assert.equal(parsed.players.get("idle-session")?.pulses, 2);
  assert.throws(() => adapter.validateState(new ReflectedIdleState("root")), /WIRE_KEYS at idleState/);
  assert.throws(
    () => adapter.validateState(new ReflectedIdleState("player")),
    /WIRE_KEYS at idleState\.players\.idle-session/,
  );
});

test("Idle ownership：初始 root 畸形时 ready fail-closed 并关闭物理房", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("idle-invalid-state", Promise.resolve(true), {});
  const client = makeClient(join);
  const owner = client.joinGame(createIdleRoomAdapter(), { token: "idle-token", sId: 8, ...IDLE_WIRE });
  join.resolve(fake.room);
  await assert.rejects(owner.ready, /GameRoom state 非法/);
  assert.equal(fake.leaveCalls, 1);
  assert.equal(physicalRoomOf(client), null);
});

test("GameRoom ownership：SDK 已 join 但首个 state 黑洞时 timeout 关闭精确物理房", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("state-blackhole", Promise.resolve(true), {}, false);
  const client = makeClient(join);
  const owner = client.joinGame(
    createIdleRoomAdapter(),
    { token: "idle-token", sId: 8, ...IDLE_WIRE },
    { timeoutMs: 5 },
  );
  join.resolve(fake.room);

  await assert.rejects(owner.ready, (error: unknown) =>
    (error as { code?: string })?.code === "TIMEOUT");
  await owner.leave();
  assert.equal(fake.leaveCalls, 1);
  assert.equal(physicalRoomOf(client), null);
  assert.equal(
    (client as unknown as { slot: unknown }).slot,
    null,
    "首 state 等待取消后不得遗留 slot",
  );
});

test("GameRoom ownership：首个 exact state 前公共发送 API 保持只读", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("state-write-barrier", Promise.resolve(true), {}, false);
  const client = makeClient(join);
  const owner = joinBall(client, undefined, { timeoutMs: 1_000 });
  join.resolve(fake.room);
  await new Promise<void>((resolve) => setImmediate(resolve));

  // 两极都断言：只断 false 的话，一个恒返回 false 的退化实现也能全绿。
  assert.equal(client.ping(), false, "state 屏障前 ping() 必须返回 false");
  assert.equal(client.castSkill(1), false, "state 屏障前 castSkill() 必须返回 false");
  assert.equal(client.chat("before-state"), false, "state 屏障前 chat() 必须返回 false");
  assert.equal(fake.sent.length, 0, "SDK JOIN_ROOM 后、首个有效 state 前不得发送任何 C2S");

  fake.room.state = validBallMoveState();
  fake.emitState();
  await owner.ready;
  assert.equal(client.ping(), true, "state 屏障放开后 ping() 必须返回 true");
  assert.equal(client.castSkill(1), true, "state 屏障放开后 castSkill() 必须返回 true");
  assert.equal(client.chat("after-state"), true, "state 屏障放开后 chat() 必须返回 true");
  assert.deepEqual(fake.sent.map((message) => message.type), [C2S.Ping, C2S.CastSkill, C2S.Chat]);
  await owner.leave();
});

test("GameRoom ownership：首个 state 前物理离场立即拒绝 owner，不等待二次 leave 超时", async () => {
  const neverLeaves = new Promise<boolean>(() => {});
  const join = deferred<unknown>();
  const fake = makeFakeRoom("leave-before-state", neverLeaves, {}, false);
  const client = makeClient(join);
  let battleLost = 0;
  const off = onBattleLost(() => { battleLost++; });
  try {
    const owner = client.joinGame(
      createIdleRoomAdapter(),
      { token: "idle-token", sId: 8, ...IDLE_WIRE },
      { timeoutMs: 60_000 },
    );
    join.resolve(fake.room);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(fake.callbacks.leave, "测试必须等到 lifecycle callbacks 已登记");

    fake.callbacks.leave?.(1006, "left before initial state");
    await assert.rejects(
      Promise.race([
        owner.ready,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("owner.ready 未即时拒绝")), 50);
        }),
      ]),
      /首个 state 前离开/,
    );
    assert.equal(fake.leaveCalls, 0, "已死亡的物理房不能再次调用 room.leave");
    assert.equal(physicalRoomOf(client), null);
    assert.equal(battleLost, 1);
    await owner.leave();
  } finally {
    off();
  }
});

test("GameRoom ownership：非法后续 patch/reconnect state 均销毁房间且不执行 reconcile", async (t) => {
  for (const reconnect of [false, true]) {
    await t.test(reconnect ? "reconnect full state" : "ordinary patch", async () => {
      const join = deferred<unknown>();
      const fake = makeFakeRoom(`invalid-${reconnect ? "reconnect" : "patch"}`);
      const client = makeClient(join);
      const adapter = ballAdapter(client);
      let battleLost = 0;
      const off = onBattleLost(() => { battleLost++; });
      try {
        const owner = joinBall(client);
        join.resolve(fake.room);
        const capability = createBallMoveRoom(await owner.ready, adapter);
        capability.move(1, 0);
        fake.sent.length = 0;
        if (reconnect) {
          fake.callbacks.drop?.(1006, "temporary");
          capability.move(0, 1);
          fake.callbacks.reconnect?.();
        }

        fake.room.state = {};
        fake.emitState();
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(physicalRoomOf(client), null);
        assert.equal(capability.dropping, false);
        assert.equal(fake.leaveCalls, 1);
        assert.equal(battleLost, 1);
        assert.deepEqual(fake.sent, [], "非法 state 不能触发重连输入 reconcile");
        await owner.leave();
      } finally {
        off();
      }
    });
  }
});

test("Idle ownership：join/drop/reconnect 不发送 Move，pulse 只发送 exact 空对象", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("idle-transport", Promise.resolve(true), validIdleState());
  const client = makeClient(join);
  const adapter = createIdleRoomAdapter();
  const owner = client.joinGame(adapter, { token: "idle-token", sId: 8, ...IDLE_WIRE });
  join.resolve(fake.room);
  const room = await owner.ready;
  assert.deepEqual(fake.sent, [], "idle initial join 不能构造 ballMove desired input");

  const capability = createIdleRoom(room, adapter);
  fake.callbacks.drop?.(1006, "temporary");
  capability.pulse();
  assert.deepEqual(fake.sent, [], "dropping 窗口不得发送 pulse 或 Move");
  fake.callbacks.reconnect?.();
  capability.pulse();
  assert.deepEqual(fake.sent, [], "reconnect 后首个有效 state 前仍不得发送 pulse 或 Move");
  fake.emitState();
  assert.deepEqual(fake.sent, [], "idle reconnect 不得自动重放 Move");
  capability.pulse();
  assert.deepEqual(fake.sent, [{ type: C2S.IdlePulse, data: {} }]);
  await owner.leave();
});

test("独立 reconnect 与 SDK 离线队列：下一有效 state 前均不得越过发送屏障", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("idle-reconnect-barrier", Promise.resolve(true), validIdleState());
  const client = makeClient(join);
  const adapter = createIdleRoomAdapter();
  const owner = client.joinGame(adapter, { token: "idle-token", sId: 8, ...IDLE_WIRE });
  join.resolve(fake.room);
  const capability = createIdleRoom(await owner.ready, adapter);

  assert.equal(fake.room.reconnection.maxEnqueuedMessages, 0);
  fake.setConnectionOpen(false);
  capability.pulse();
  assert.equal(fake.room.reconnection.enqueuedMessages.length, 0,
    "socket close 到 onDrop 之间的 send 也不能进入 SDK 自动重放队列");
  assert.deepEqual(fake.sent, []);

  fake.room.reconnection.enqueuedMessages.push({
    data: { type: C2S.IdlePulse, data: {} },
  });
  fake.emitReconnect();
  capability.pulse();
  assert.deepEqual(fake.sent, [],
    "无先行 onDrop 的 onReconnect 必须清队列并立即阻断发送");
  fake.emitState();
  capability.pulse();
  assert.deepEqual(fake.sent, [{ type: C2S.IdlePulse, data: {} }]);
  await owner.leave();
});

test("玩法 capability：ballMove typed room 不能构造 IdleRoom", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("ball-capability");
  const client = makeClient(join);
  const owner = joinBall(client);
  join.resolve(fake.room);
  const ballRoom = await owner.ready;
  const idleAdapter = createIdleRoomAdapter();
  assert.throws(
    // @ts-expect-error mode discriminator 在编译期拒绝跨玩法 capability。
    () => createIdleRoom(ballRoom, idleAdapter),
    /mode 与 adapter 不匹配/,
  );
  await owner.leave();
});

test("玩法 capability：旧 typed room 在提升 input generation 前 fail-closed", () => {
  const adapter = createBallMoveRoomAdapter();
  const staleBall = {
    kind: "typed-game-room",
    mode: GameplayModeId.BallMove,
    state: validBallMoveState(),
    roomId: "stale-ball",
    sessionId: "stale-ball-session",
    current: false,
    dropping: false,
    state$: () => () => ({}),
    onMessage: () => () => {},
    send: () => true,
  } as unknown as BallMoveTypedRoom;
  const before = adapter.inputGeneration;
  assert.throws(() => createBallMoveRoom(staleBall, adapter), /room 已失效/);
  assert.equal(adapter.inputGeneration, before,
    "迟到旧 room 不能使当前 capability 的 generation 失效");

  const staleIdle = {
    ...staleBall,
    mode: GameplayModeId.Idle,
    state: validIdleState(),
  } as unknown as IdleTypedRoom;
  assert.throws(() => createIdleRoom(staleIdle, createIdleRoomAdapter()), /room 已失效/);
});

test("slot 连接 key：契约允许字段稳定比较，键顺序/undefined 不造成误拒", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("stable-key");
  const client = makeClient(join);
  const first = joinBall(client, {
    token: "same",
    sId: 3,
    omitted: undefined,
  });
  const second = joinBall(client, {
    sId: 3,
    token: "same",
  });

  assert.equal(joinCalls.length, 1, "JSON 等价的完整 options 应安全合流");
  join.resolve(fake.room);
  const firstRoom = await first.ready;
  assert.strictEqual(await second.ready, firstRoom);
  assert.equal(physicalRoomOf(client), fake.room);
  await first.leave();
  assert.equal(fake.leaveCalls, 0);
  await second.leave();
  assert.equal(fake.leaveCalls, 1);
});

test("slot 连接 key：未知 join option 在发送前拒绝", () => {
  const client = makeClient();
  assert.throws(
    () => joinBall(client, { token: "same", sId: 3, nested: { x: 1 } }),
    /未知字段|unknown|options/i,
  );
});

test("非法 join control 在分配 slot 前失败，不遗留 owner", async () => {
  const join = deferred<unknown>();
  const client = makeClient(join);
  assert.throws(
    () => joinBall(client, { token: "same", sId: 3 }, { timeoutMs: 1.5 } as never),
    /安全整数/,
  );
  assert.equal(joinCalls.length, 0, "非法 timeout 不应启动底层 join");

  const owner = joinBall(client, { token: "same", sId: 3 });
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
    () => joinBall(client, { token: "same", sId: 3 }, signal as never),
    /有效的 AbortSignal/,
  );
  assert.equal(joinCalls.length, 0, "signal shape failure must precede transport slot allocation");
  assert.equal(physicalRoomOf(client), null);
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
    () => joinBall(client, { token: "same", sId: 3 }, signal),
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
  const owner = joinBall(client, { token: "same", sId: 3 }, signal);
  join.resolve(fake.room);
  await owner.ready;
  assert.equal(physicalRoomOf(client), fake.room);
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
    const owner = joinBall(client, undefined, { timeoutMs: 60_000 });
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
    const oldOwner = joinBall(client);
    join1.resolve(oldRoom.room);
    await oldOwner.ready;
    assert.equal(physicalRoomOf(client), oldRoom.room);

    // leave() 会在等待旧房 LEAVE 完成前同步摘掉旧 slot；后来者必须立刻能建独立的新 slot。
    const closingOld = oldOwner.leave();
    const newOwner = joinBall(client);
    join2.resolve(newRoom.room);
    await newOwner.ready;
    assert.equal(joinCalls.length, 2);
    assert.equal(physicalRoomOf(client), newRoom.room);

    // 模拟旧 SDK 连接稍后才派发 onLeave。它只能命中旧 slot，不能污染当前连接。
    oldRoom.callbacks.leave?.(1000, "late active-leave callback");
    assert.equal(physicalRoomOf(client), newRoom.room);
    assert.equal(client.connected, true);
    assert.equal(battleLost, 0, "主动关闭旧 room 的迟到事件不能误报当前战斗死亡");

    oldLeave.resolve(true);
    await closingOld;
    assert.equal(oldRoom.removeAllCalls, 1);
    assert.equal(physicalRoomOf(client), newRoom.room);

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
    const owner = joinBall(client);
    join.resolve(fake.room);
    await owner.ready;

    fake.callbacks.leave?.(1006, "network lost");
    assert.equal(physicalRoomOf(client), null);
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
  assert.match(source, /const isCurrent = \(\) => room\.current/,
    "capability 必须核对捕获 room，不能把操作发给全局后来者");
  assert.match(source, /room\.onMessage\(type/,
    "消息监听必须登记在捕获 room 上");
  assert.match(source, /if \(isCurrent\(\)\) callback\(message\)/,
    "所有消息回调必须经过统一 current-room 守卫");
  const stateSection = source.slice(source.indexOf("function observePlayers("));
  assert.equal((stateSection.match(/if \(!isActive\(\)\) return;/g) ?? []).length, 2,
    "players add/remove 入口必须拒绝旧 room");
  assert.match(stateSection, /if \(isActive\(\)\) observer\.change\(player\)/,
    "player change 的迟到回调也必须拒绝旧 room");
  assert.match(source, /adapter\.move\(inputGeneration, room, dirX, dirY\)/,
    "Move 必须同时绑定 input generation 与捕获 room");
  assert.match(source, /if \(isCurrent\(\)\) room\.send\(C2S\.Ping/,
    "Ping 必须核对捕获 room");
  assert.match(source, /const inputGeneration = adapter\.beginInputLease\(\)/);
  assert.ok(
    source.indexOf("if (!room.current)") < source.indexOf("adapter.beginInputLease()"),
    "旧 room 必须在提升 adapter input generation 前拒绝",
  );
  assert.match(source, /adapter\.clearMove\(inputGeneration, room\)/,
    "stop 发生在 leave 摘槽后，clear 必须按输入世代精确生效");
});

test("BallMoveRoom capability：切到后来 room 后，迟到消息/Schema/发送全部失效", () => {
  const captured = {
    roomId: "captured",
    sessionId: "self",
    state: {
      tick: 1,
      phase: GamePhase.Playing,
      matchId: "captured-match",
      players: new Map(),
    },
  } as unknown as Colyseus.Room<IGameRoomState>;
  let current = true;
  const messages = new Map<string, (payload: unknown) => void>();
  const playerCallbacks: {
    add?: (player: IPlayerState, sessionId: string) => void;
    remove?: (player: IPlayerState, sessionId: string) => void;
    change?: () => void;
  } = {};
  const sent: Array<{ type: string; data: unknown }> = [];
  const typedRoom = {
    kind: "typed-game-room",
    mode: GameplayModeId.BallMove,
    state: captured.state,
    roomId: captured.roomId,
    sessionId: captured.sessionId,
    get current() { return current; },
    get dropping() { return false; },
    onMessage(type: string, callback: (payload: unknown) => void) {
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
    send(type: string, data: unknown) {
      if (!current) return false;
      sent.push({ type, data });
      return true;
    },
  } as unknown as BallMoveTypedRoom;
  const adapter = createBallMoveRoomAdapter();
  const capability = createBallMoveRoom(typedRoom, adapter);
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
  assert.deepEqual({ welcomes, adds, changes, removes }, {
    welcomes: 1, adds: 1, changes: 1, removes: 0,
  });
  assert.deepEqual(sent[0], { type: C2S.Move, data: { dirX: 1, dirY: 0 } });
  assert.equal(sent[1]?.type, C2S.Ping);
  assert.equal(Number.isFinite((sent[1]?.data as { clientTime?: number }).clientTime), true);

  current = false;
  messages.get(S2C.Welcome)?.({ sessionId: "self", tickRate: 20, motd: "late" });
  playerCallbacks.add?.(self, "self");
  playerCallbacks.change?.();
  playerCallbacks.remove?.(self, "self");
  capability.move(0, 1);
  capability.ping();
  capability.clearMove();
  assert.deepEqual({ welcomes, adds, changes, removes }, {
    welcomes: 1, adds: 1, changes: 1, removes: 0,
  });
  assert.equal(sent.length, 2, "失效 capability 不得向后来 room 发消息");
  assert.deepEqual(adapter.desiredMove, { dirX: 0, dirY: 0, seq: 2 },
    "leave 已摘槽时仍按捕获的 input generation 清理 desired");
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
  const calls: { endpoint?: string; options?: Record<string, unknown>; adapterMode?: string } = {};
  const adapter = createBallMoveRoomAdapter();
  const room = {
    kind: "typed-game-room",
    mode: GameplayModeId.BallMove,
    state: validBallMoveState(),
    roomId: "room-92",
    sessionId: "self-92",
    current: true,
    dropping: false,
    state$: () => () => ({}),
    onMessage: () => () => {},
    send: () => true,
  } as unknown as BallMoveTypedRoom;
  const fakeClient = {
    init(endpoint: string) { calls.endpoint = endpoint; },
    joinGame(inputAdapter: BallMoveRoomAdapter, options: Record<string, unknown>) {
      calls.adapterMode = inputAdapter.mode;
      calls.options = options;
      return { ready: Promise.resolve(room), leave: async () => {} };
    },
  } as unknown as RoomClient;
  try {
    const ownership = createBallMoveRoomJoiner(adapter, fakeClient).join(new AbortController().signal);
    assert.equal((await ownership.ready).roomId, "room-92");
    assert.equal(calls.endpoint, "wss://ws-zone-92.example");
    assert.equal(calls.adapterMode, GameplayModeId.BallMove);
    assert.deepEqual(calls.options, { token: "", sId: 92, mode: GameplayModeId.BallMove, ...BALL_WIRE });
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
  const calls: { endpoint?: string; options?: Record<string, unknown>; adapterMode?: string } = {};
  const adapter = createIdleRoomAdapter();
  const physical = { roomId: "idle-room-93", sessionId: "idle-self-93" };
  const room = {
    kind: "typed-game-room",
    mode: GameplayModeId.Idle,
    state: validIdleState(),
    roomId: physical.roomId,
    sessionId: physical.sessionId,
    current: true,
    dropping: false,
    state$: () => () => ({}),
    onMessage: () => () => {},
    send: () => true,
  } as unknown as IdleTypedRoom;
  const fakeClient = {
    init(endpoint: string) { calls.endpoint = endpoint; },
    joinGame(inputAdapter: ReturnType<typeof createIdleRoomAdapter>, options: Record<string, unknown>) {
      calls.adapterMode = inputAdapter.mode;
      calls.options = options;
      return { ready: Promise.resolve(room), leave: async () => {} };
    },
  } as unknown as RoomClient;
  try {
    const ownership = createIdleRoomJoiner(adapter, fakeClient).join(new AbortController().signal);
    const capability = await ownership.ready;
    assert.equal(capability.kind, "idle");
    assert.equal(capability.roomId, "idle-room-93");
    assert.equal(capability.sessionId, "idle-self-93");
    assert.equal(typeof capability.pulse, "function");
    assert.equal(calls.endpoint, "wss://ws-zone-93.example");
    assert.equal(calls.adapterMode, GameplayModeId.Idle);
    assert.deepEqual(calls.options, { token: "", sId: 93, mode: GameplayModeId.Idle, ...IDLE_WIRE });
    await ownership.leave();
  } finally {
    setServerList({ isOps: false, hash: "reset", myServerIds: [], servers: [] });
  }
});

test("AppRuntime：只装配 registry/controller/catalog，不再内联 RoomClient、ECS 或玩法回调", () => {
  // 阶段 5b：Main 的装配逻辑逐字迁入 app/AppRuntime.ts，边界钉随迁（同批改写）。
  const source = readFileSync(new URL("../src/app/AppRuntime.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bRoomClient\b|\bGameECS\b|\bPlayerModel\b|bindRoom\(/);
  assert.doesNotMatch(source, /\bBallMoveView\b|ballMovePresentation/,
    "presentation adapter 应由 gameplay catalog entry 归属，AppRuntime 只提供通用 host");
  // 阶段 9：装配点切到 generated catalog 的 registerGeneratedGameplays（services 注入）。
  assert.match(source, /registerGeneratedGameplays\(registry, services\)/);
  assert.match(source, /presentationHost/);
  assert.match(source, /controller\.startRegistered\(registry, requestedId, signal\)/);
  assert.match(source, /controller\.tick\(dt\)/);
  assert.match(source, /roomController\?\.stop\(\{ kind \}\)/);
  assert.doesNotMatch(source, /createIdleRoomJoiner|registerIdleGameplay|createBallMoveRoomJoiner|ballMoveJoiner|idleJoiner/,
    "玩法的 joiner/登记应归各 gameplay module，而不是重新侵入宿主");

  const main = readFileSync(new URL("../src/Main.ts", import.meta.url), "utf8");
  assert.doesNotMatch(main, /\bRoomClient\b|\bGameECS\b|\bPlayerModel\b|bindRoom\(/,
    "Main 已收敛为 bootstrap/update/dispose，不得回流网络/ECS 细节");
  assert.doesNotMatch(main, /registerDefaultGameplays|registerGeneratedGameplays|\bBallMoveView\b|startRegistered\(/,
    "gameplay 装配归 AppRuntime，Main ⛔ 不得重新持有");
  assert.match(main, /runtime\?\.tick\(dt\)/, "Main.update 必须只转发 runtime.tick");
  assert.match(main, /runtime\?\.dispose\(\)/, "Main.onDestroy 必须只转发 runtime.dispose");
});

test("掉线输入 reconcile：松手后的 stop/最新方向成为重连后的第一条有效输入", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("input-reconcile");
  const client = makeClient(join);
  const adapter = ballAdapter(client);
  const owner = joinBall(client);
  join.resolve(fake.room);
  const capability = createBallMoveRoom(await owner.ready, adapter);

  fake.sent.length = 0;
  capability.move(1, 0);
  assert.deepEqual(fake.sent.at(-1), { type: C2S.Move, data: { dirX: 1, dirY: 0 } });
  fake.callbacks.drop?.(1006, "temporary");

  // dropping 窗口中不发旧方向，但必须更新 desired seq；用户随后松手写入 stop。
  capability.move(0, 0);
  assert.equal(fake.sent.length, 1, "掉线期间不应把输入排进旧连接");
  fake.callbacks.reconnect?.();
  assert.equal(fake.sent.length, 1, "reconnect full state 校验前不得恢复发送");
  fake.emitState();
  assert.deepEqual(fake.sent.at(-1), { type: C2S.Move, data: { dirX: 0, dirY: 0 } });

  await owner.leave();
});

test("输入 generation：leave 摘槽后本局可清零，旧局迟到 stop 不覆盖新局方向", async () => {
  const firstJoin = deferred<unknown>();
  const firstRoom = makeFakeRoom("input-generation-old");
  const client = makeClient(firstJoin);
  const adapter = ballAdapter(client);
  const oldOwner = joinBall(client);
  firstJoin.resolve(firstRoom.room);
  const oldCapability = createBallMoveRoom(await oldOwner.ready, adapter);
  oldCapability.move(1, 0);
  const oldInputGeneration = adapter.inputGeneration;
  await oldOwner.leave();

  const desiredAtLeave = adapter.desiredMove;
  oldCapability.move(-1, 0);
  assert.strictEqual(adapter.desiredMove, desiredAtLeave,
    "leave 到下一 capability 创建之间，旧 move 也必须被 room.current 拒绝");
  oldCapability.clearMove();
  assert.deepEqual(adapter.desiredMove, { dirX: 0, dirY: 0, seq: 2 },
    "RoomController 先 leave 再 stop plugin 时，本局 generation 仍应能清零 desired");

  const nextJoin = deferred<unknown>();
  const nextRoom = makeFakeRoom("input-generation-new");
  joinQueue.push(nextJoin);
  const newOwner = joinBall(client);
  nextJoin.resolve(nextRoom.room);
  const newCapability = createBallMoveRoom(await newOwner.ready, adapter);
  newCapability.move(0, 1);
  const desired = adapter.desiredMove;
  const sentBeforeStaleMove = nextRoom.sent.length;
  oldCapability.move(-1, 0);
  assert.strictEqual(adapter.desiredMove, desired,
    "旧 capability 的 move 不得改写新 generation desired input");
  assert.equal(nextRoom.sent.length, sentBeforeStaleMove);
  nextRoom.callbacks.drop?.(1006, "temporary");
  nextRoom.callbacks.reconnect?.();
  assert.equal(nextRoom.sent.length, sentBeforeStaleMove, "reconnect state 校验前不得重放输入");
  nextRoom.emitState();
  assert.deepEqual(nextRoom.sent.at(-1), { type: C2S.Move, data: { dirX: 0, dirY: 1 } },
    "新房重连必须重放自己的最新方向，不能重放旧 capability 输入");
  oldCapability.clearMove();
  assert.strictEqual(adapter.desiredMove, desired,
    "旧插件迟到清理必须被新 input generation 拒绝");
  assert.equal(adapter.clearMove(oldInputGeneration), false);
  assert.deepEqual(adapter.desiredMove, { dirX: 0, dirY: 1, seq: 3 });
  await newOwner.leave();
});

test("RoomClient join 黑洞：超时/AbortSignal 不阻塞 leave，迟到 room 会被释放", async () => {
  const pending = deferred<unknown>();
  const late = makeFakeRoom("late-game");
  const client = makeClient(pending);
  const owner = joinBall(client, undefined, { timeoutMs: 10 });
  await assert.rejects(owner.ready, (e: unknown) => (e as { code?: string })?.code === "TIMEOUT");
  await owner.leave();
  pending.resolve(late.room);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(late.leaveCalls, 1);

  const pendingCancel = deferred<unknown>();
  const lateCancel = makeFakeRoom("late-game-cancel");
  const controller = new AbortController();
  const client2 = makeClient(pendingCancel);
  const owner2 = joinBall(client2, undefined, controller.signal);
  controller.abort();
  await assert.rejects(owner2.ready, (e: unknown) => (e as { code?: string })?.code === "CANCELLED");
  await owner2.leave();
  pendingCancel.resolve(lateCancel.room);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(lateCancel.leaveCalls, 1);
});

test("发送屏障：socket 已关而 onDrop 未到达时 send 必须返回 false", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("closed-socket-send");
  const client = makeClient(join);
  const owner = joinBall(client);
  join.resolve(fake.room);
  const ballRoom = await owner.ready;

  // 正例先钉住极性：socket 开着时确实跨 wire 且返回 true。
  assert.equal(client.ping(), true, "socket 开启时 ping() 必须返回 true");
  assert.equal(fake.sent.length, 1, "socket 开启时必须真的跨 wire");

  // 竞态窗口：底层 socket 已关，但 onDrop 尚未回调，本地 dropping 闸还没合上。
  fake.setConnectionOpen(false);
  assert.equal(client.ping(), false, "socket 已关时 ping() 不得对被丢弃的包报 true");
  assert.equal(ballRoom.send(C2S.Move, { dirX: 1, dirY: 0 }), false,
    "socket 已关时 typed send 同样必须返回 false");
  assert.equal(fake.sent.length, 1, "窗口内不得有新包跨 wire");
  assert.equal(fake.room.reconnection.enqueuedMessages.length, 0,
    "窗口内的包也不得留在 SDK 队列里");
  await owner.leave();
});

test("SDK 升级绊线：读不到 socket 状态时 join 必须失败而不是静默哑火", async () => {
  const join = deferred<unknown>();
  const fake = makeFakeRoom("missing-connection");
  delete (fake.room as { connection?: unknown }).connection;
  const client = makeClient(join);
  const owner = joinBall(client);
  join.resolve(fake.room);
  await assert.rejects(owner.ready, /无法读取 SDK socket 状态/);
  await owner.leave();
});

// ── 阶段 8b（Non-intrusive §4.4/§6.9/§10.2）：matchmaking strategy 与私房客户端流程 ────────

test("ownership key：strategy（含 roomName/roomId）参与连接身份——同 options 不同 strategy fail-fast", async () => {
  const join1 = deferred<unknown>();
  const room1 = makeFakeRoom("strategy-key");
  const client = makeClient(join1);
  const base = { token: "same", sId: 3 };
  const original = joinBall(client, base); // 缺省 strategy = join-or-create("game")
  // 同 endpoint + 同 options，但 strategy 不同：⛔ 不得静默合流到旧 slot。
  assert.throws(
    () => client.joinGame(ballAdapter(client), { ...BALL_WIRE, ...base }, undefined,
      { kind: "create", roomName: RoomName.Game }),
    /参数与本次 join 不一致/,
  );
  assert.throws(
    () => client.joinGame(ballAdapter(client), { ...BALL_WIRE, ...base }, undefined,
      { kind: "join-by-id", roomId: "room-x" }),
    /参数与本次 join 不一致/,
  );
  assert.equal(joinCalls.length, 1, "身份冲突不得发起第二条连接");
  join1.resolve(room1.room);
  await original.ready;
  await original.leave();
});

test("strategy 三形态分别映射 SDK joinOrCreate/create/joinById，roomName/roomId 逐字生效", async () => {
  const cases = [
    { strategy: undefined, method: "joinOrCreate", target: RoomName.Game },
    { strategy: { kind: "create", roomName: RoomName.Game } as const, method: "create", target: RoomName.Game },
    { strategy: { kind: "join-by-id", roomId: "room-42" } as const, method: "joinById", target: "room-42" },
  ] as const;
  for (const item of cases) {
    const join = deferred<unknown>();
    const fake = makeFakeRoom(`strategy-${item.method}`);
    const client = makeClient(join);
    const owner = client.joinGame(
      ballAdapter(client),
      { ...BALL_WIRE, token: "t", sId: 1, mode: GameplayModeId.BallMove },
      undefined,
      item.strategy as never,
    );
    assert.equal(joinCalls.length, 1);
    assert.equal(joinCalls[0]!.method, item.method);
    assert.equal(joinCalls[0]!.roomName, item.target);
    join.resolve(fake.room);
    await owner.ready;
    await owner.leave();
  }
});

const PRIVATE_DIRECTORY: WebPlatformAreaListResponse = {
  isOps: false,
  hash: "private-ws-contract",
  myServerIds: [95],
  servers: [{
    serverId: 95,
    name: "区95",
    tag: "normal",
    status: "smooth",
    openTime: 1,
    gameHttpUrl: "https://http-zone-95.example",
    gameWsUrl: "wss://ws-zone-95.example",
  }],
};

function resetPrivateSession(): void {
  setServerList({ isOps: false, hash: "reset", myServerIds: [], servers: [] });
  clearSession();
}

test("PrivateRoomService：prepareCreate → create('game')，creationTicket 只进 access（§6.9 房主流程）", async () => {
  setServerList(PRIVATE_DIRECTORY);
  setSession({ userId: "u-private-owner", accessToken: "private-token", isNewAccount: false });
  try {
    const join = deferred<unknown>();
    const fake = makeFakeRoom("private-created");
    const client = makeClient(join);
    const lobbyCalls: Array<{ entry: string; payload: unknown }> = [];
    const lobby: PrivateRoomLobbyPort = {
      async rpc() { throw new Error("createRoom 不应走 query rpc"); },
      async rpcIdem(type, payload) {
        lobbyCalls.push({ entry: type, payload });
        return { creationTicket: "CREATIONTICKET_0000000000000001", expiresAt: 123 } as never;
      },
    };
    const service = new PrivateRoomService(lobby, client);
    const ownership = await service.createRoom(ballAdapter(client), "private");
    assert.deepEqual(lobbyCalls, [{
      entry: RoomRpc.PrepareCreate,
      payload: { mode: GameplayModeId.BallMove, modeVersion: BALL_WIRE.modeVersion, profile: "private" },
    }]);
    assert.equal(joinCalls.length, 1);
    assert.equal(joinCalls[0]!.method, "create", "房主必须 create——⛔ 不是 joinOrCreate");
    assert.equal(joinCalls[0]!.roomName, RoomName.Game);
    assert.equal(joinCalls[0]!.endpoint, "wss://ws-zone-95.example");
    assert.deepEqual(joinCalls[0]!.options, {
      v: GAME_ROOM_PROTOCOL_VERSION,
      token: "private-token",
      sId: 95,
      mode: GameplayModeId.BallMove,
      modeVersion: BALL_WIRE.modeVersion,
      profile: "private",
      access: { kind: "create", ticket: "CREATIONTICKET_0000000000000001" },
    });
    join.resolve(fake.room);
    await ownership.ready;
    await ownership.leave();
  } finally {
    resetPrivateSession();
  }
});

test("PrivateRoomService：resolve(code) → joinById(roomId)，joinTicket 只进 access（§6.9 好友流程）", async () => {
  setServerList(PRIVATE_DIRECTORY);
  setSession({ userId: "u-private-friend", accessToken: "friend-token", isNewAccount: false });
  try {
    const join = deferred<unknown>();
    const fake = makeFakeRoom("private-resolved");
    const client = makeClient(join);
    const resolveCalls: unknown[] = [];
    const lobby: PrivateRoomLobbyPort = {
      async rpc(type, payload) {
        resolveCalls.push([type, payload]);
        return {
          roomId: "room-77",
          mode: GameplayModeId.BallMove,
          modeVersion: BALL_WIRE.modeVersion,
          profile: "private",
          joinTicket: "JOINTICKET_00000000000000000001",
          expiresAt: 456,
        } as never;
      },
      async rpcIdem() { throw new Error("joinByCode 不应走 idempotent write"); },
    };
    const service = new PrivateRoomService(lobby, client);
    const ownership = await service.joinByCode("000123", ballAdapter(client));
    assert.deepEqual(resolveCalls, [[RoomRpc.Resolve, { code: "000123" }]]);
    assert.equal(joinCalls.length, 1);
    assert.equal(joinCalls[0]!.method, "joinById", "好友必须 joinById——⛔ 不是 joinOrCreate");
    assert.equal(joinCalls[0]!.roomName, "room-77");
    assert.deepEqual(joinCalls[0]!.options, {
      v: GAME_ROOM_PROTOCOL_VERSION,
      token: "friend-token",
      sId: 95,
      mode: GameplayModeId.BallMove,
      modeVersion: BALL_WIRE.modeVersion,
      profile: "private",
      access: { kind: "join", ticket: "JOINTICKET_00000000000000000001" },
    });
    join.resolve(fake.room);
    await ownership.ready;
    await ownership.leave();
  } finally {
    resetPrivateSession();
  }
});

// §10.2 行 22（变异验证：让输错码回退 joinOrCreate → 「不发起任何 SDK join」断言转红）。
test("PrivateRoomService：输错码停留可重试——不误创建房间、不清登录态（§10.2 行 22）", async () => {
  setServerList(PRIVATE_DIRECTORY);
  setSession({ userId: "u-private-retry", accessToken: "retry-token", isNewAccount: false });
  try {
    const client = makeClient(); // ⛔ 不预备任何 join 结果：任何 SDK join 都会被 fake 断言拒绝
    let resolveAttempts = 0;
    const lobby: PrivateRoomLobbyPort = {
      async rpc() {
        resolveAttempts++;
        const { RpcError } = await import("../src/net/WebSocketClient");
        throw new RpcError("ROOM_CODE_UNAVAILABLE", "邀请码不可用");
      },
      async rpcIdem() { throw new Error("不应触发"); },
    };
    const service = new PrivateRoomService(lobby, client);

    // ① 格式非法：本地闸直接停留（不消费 resolve 速率预算）。
    await assert.rejects(
      service.joinByCode("12345", ballAdapter(client)),
      (error: unknown) => error instanceof PrivateRoomError
        && error.code === "ROOM_CODE_FORMAT" && error.retryable === true,
    );
    assert.equal(resolveAttempts, 0, "格式非法不得发起 resolve RPC");

    // ② 码不可用（折叠类）：可重试停留。
    await assert.rejects(
      service.joinByCode("654321", ballAdapter(client)),
      (error: unknown) => error instanceof PrivateRoomError
        && error.code === "ROOM_CODE_UNAVAILABLE" && error.retryable === true,
    );
    assert.equal(resolveAttempts, 1);

    // 核心断言（§10.2 行 22）：⛔ 不回退 joinOrCreate/create/joinById 误创建房间。
    assert.equal(joinCalls.length, 0, "输错码不得发起任何 SDK join（回退 joinOrCreate 即误创建新房）");
    assert.equal(physicalRoomOf(client), null);
    // ⛔ 不清登录态：会话与 bearer 原样保留，玩家可原地重输。
    assert.equal(isLoggedIn(), true, "输错码不得清除仍然有效的登录态");
    assert.equal(getToken(), "retry-token", "bearer 必须原样保留");
  } finally {
    resetPrivateSession();
  }
});

// 编译期钉：生产 WebSocketClient 结构满足 PrivateRoomLobbyPort（阶段 9 接线不需要适配层）。
type ProductionLobbyPortSatisfied = WebSocketClient extends PrivateRoomLobbyPort ? true : never;
const _productionLobbyPortSatisfied: ProductionLobbyPortSatisfied = true;
void _productionLobbyPortSatisfied;
