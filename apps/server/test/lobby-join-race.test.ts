import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "@colyseus/core";
import {
  ErrorCode as SharedErrorCode,
  ForceLogoutReason,
  KICK_CLOSE_CODE,
  LOBBY_MSG_PUSH,
  LobbyPush,
} from "@game/shared";
import { AuthRequiredError } from "../src/core/errors";
import {
  LobbyRoom,
  LOBBY_RECONNECT_GRACE_S,
  type LobbyJoinDependencies,
} from "../src/websocket/LobbyRoom";
import type { OnlineRegistration } from "../src/websocket/push";
import { beginShutdown, resetAdmission } from "../src/core/infra/lifecycle";

type CapturedOnlineConn = Parameters<LobbyJoinDependencies["registerOnline"]>[2];

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeClient(token: string, options: {
  sessionId?: string;
  onSend?: (type: string, data: unknown) => void;
  onLeave?: (code?: number) => void;
} = {}): never {
  return {
    sessionId: options.sessionId ?? "stale-seat",
    auth: { userId: "race-user", token, sId: 7 },
    send: (type: string, data: unknown) => options.onSend?.(type, data),
    leave: async (code?: number) => { options.onLeave?.(code); },
  } as never;
}

function roomWith(
  overrides: Partial<LobbyJoinDependencies>,
): { room: LobbyRoom; registered: string[]; unregistered: string[] } {
  const registered: string[] = [];
  const unregistered: string[] = [];
  const deps: LobbyJoinDependencies = {
    ensureCharacterReady: async () => {},
    verifySession: async () => {},
    registerOnline: (_uid, sessionId): OnlineRegistration => {
      registered.push(sessionId);
      return { token: Symbol(sessionId) };
    },
    unregisterOnline: (_uid, sessionId) => { unregistered.push(sessionId); },
    tokenHashOf: (value) => `hash:${value}`,
    loadFields: async () => ({}),
    setOnlineGuild: () => {},
    ...overrides,
  };
  const room = new LobbyRoom(deps);
  // Direct unit tests invoke onJoin without Colyseus owning the room clock.
  room.clock.stop();
  return { room, registered, unregistered };
}

test("Lobby onJoin rejects a token replaced while character ready is pending", async () => {
  const ready = deferred<void>();
  let currentToken = "old-token";
  const verified: string[] = [];
  const { room, registered, unregistered } = roomWith({
    ensureCharacterReady: async () => ready.promise,
    verifySession: async (_uid, token) => {
      verified.push(token);
      if (token !== currentToken) { throw new AuthRequiredError("stale session"); }
    },
  });

  try {
    const joining = room.onJoin(fakeClient("old-token"));
    // Simulate a newer login replacing the group session while the slow
    // character initializer is pending. Registration already exists, so a
    // real replacement kick can see this connection.
    currentToken = "new-token";
    ready.resolve();

    await assert.rejects(
      joining,
      (error: unknown) => error instanceof Error && error.message.includes("AUTH_REQUIRED"),
    );
    assert.deepEqual(verified, ["old-token"]);
    assert.deepEqual(registered, ["stale-seat"]);
    assert.deepEqual(unregistered, ["stale-seat"]);
  } finally {
    room.clock.stop();
  }
});

test("Lobby onJoin fails closed when the client has no auth context", async () => {
  const { room, registered, unregistered } = roomWith({});
  const client = {
    sessionId: "unauthenticated-seat",
    auth: undefined,
    send: () => {},
    leave: async () => {},
  } as never;

  try {
    await assert.rejects(
      room.onJoin(client),
      (error: unknown) => error instanceof Error && error.message === "AUTH_REQUIRED",
    );
    assert.deepEqual(registered, []);
    assert.deepEqual(unregistered, []);
  } finally {
    room.clock.stop();
  }
});

test("Lobby onJoin rejects when the client leaves while character ready is pending", async () => {
  const ready = deferred<void>();
  const verified: string[] = [];
  const { room, registered, unregistered } = roomWith({
    ensureCharacterReady: async () => ready.promise,
    verifySession: async () => { verified.push("unexpected"); },
  });
  const client = fakeClient("leave-token");

  try {
    const joining = room.onJoin(client);
    while (registered.length === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    // A transport close can invoke onLeave before the awaited onJoin callback
    // resumes. The callback must not publish a seat after this cleanup.
    room.onLeave(client);
    ready.resolve();

    await assert.rejects(
      joining,
      (error: unknown) => error instanceof Error
        && error.message.startsWith(`${SharedErrorCode.CharCreateFailed}|`),
    );
    assert.deepEqual(verified, [], "a departed client must not reach the session fence");
    assert.deepEqual(unregistered, ["stale-seat"], "leave and late join cleanup are idempotent");
  } finally {
    room.clock.stop();
  }
});

test("Lobby onJoin unregisters the exact slot when replacement wins after registration", async () => {
  const secondCheck = deferred<void>();
  let verifyCount = 0;
  let currentToken = "old-token";
  const { room, registered, unregistered } = roomWith({
    verifySession: async (_uid, token) => {
      verifyCount++;
      if (verifyCount === 2) {
        await secondCheck.promise;
        if (token !== currentToken) { throw new AuthRequiredError("stale session"); }
      }
    },
  });

  try {
    const joining = room.onJoin(fakeClient("old-token"));
    // Wait until registerOnline has run and the second fence check is held.
    while (registered.length === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    currentToken = "new-token";
    secondCheck.resolve();

    await assert.rejects(
      joining,
      (error: unknown) => error instanceof Error && error.message.includes("AUTH_REQUIRED"),
    );
    assert.deepEqual(registered, ["stale-seat"]);
    assert.deepEqual(unregistered, ["stale-seat"], "only the just-registered stale slot is removed");
  } finally {
    room.clock.stop();
  }
});

test("Lobby onJoin rejects and unregisters when shutdown closes admission before completion", async () => {
  const secondCheckStarted = deferred<void>();
  const secondCheck = deferred<void>();
  let verifyCount = 0;
  const { room, registered, unregistered } = roomWith({
    verifySession: async () => {
      verifyCount++;
      if (verifyCount === 2) {
        secondCheckStarted.resolve();
        await secondCheck.promise;
      }
    },
  });

  try {
    const joining = room.onJoin(fakeClient("shutdown-token"));
    await secondCheckStarted.promise;
    beginShutdown();
    secondCheck.resolve();

    await assert.rejects(
      joining,
      (error: unknown) => error instanceof Error
        && error.message.startsWith(`${SharedErrorCode.CharCreateFailed}|`),
    );
    assert.deepEqual(registered, ["stale-seat"]);
    assert.deepEqual(unregistered, ["stale-seat"], "shutdown cleanup must remove only this registration");
  } finally {
    resetAdmission();
    room.clock.stop();
  }
});

test("Lobby kick observes an asynchronous leave rejection without losing sync errors", async () => {
  let kick: ((closeCode: number) => void) | undefined;
  const { room } = roomWith({
    registerOnline: (_uid, _sessionId, conn) => {
      kick = conn.kick;
      return { token: Symbol("kick-rejection") };
    },
  });
  const client = {
    sessionId: "kick-rejection-seat",
    auth: { userId: "kick-rejection-user", token: "token", sId: 7 },
    send: () => {},
    leave: async () => { throw new Error("close failed asynchronously"); },
  } as never;
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  try {
    await room.onJoin(client);
    assert.ok(kick, "onJoin must expose the registered kick callback");
    kick(4001);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(rejections, []);
  } finally {
    process.off("unhandledRejection", onRejection);
    room.onLeave(client);
    room.clock.stop();
  }
});

test("a late stale join cannot unregister a replacement using the same session key", async () => {
  const oldReady = deferred<void>();
  const newReady = deferred<void>();
  const readyFlights = [oldReady.promise, newReady.promise];
  const registrations: OnlineRegistration[] = [];
  const unregistered: OnlineRegistration[] = [];
  let active: OnlineRegistration | undefined;

  const deps: LobbyJoinDependencies = {
    ensureCharacterReady: async () => {
      const flight = readyFlights.shift();
      assert.ok(flight, "each injected join must receive one ready flight");
      await flight;
    },
    verifySession: async (_uid, token) => {
      if (token === "old-token") { throw new AuthRequiredError("stale session"); }
    },
    registerOnline: (_uid, _sessionId): OnlineRegistration => {
      const registration = { token: Symbol("join") };
      registrations.push(registration);
      active = registration;
      return registration;
    },
    unregisterOnline: (_uid, _sessionId, expected) => {
      if (expected === undefined) { return; }
      unregistered.push(expected);
      if (active === expected) { active = undefined; }
    },
    tokenHashOf: (value) => `hash:${value}`,
    loadFields: async () => ({}),
    setOnlineGuild: () => {},
  };
  const room = new LobbyRoom(deps);
  room.clock.stop();
  const oldClient = fakeClient("old-token");
  const newClient = fakeClient("new-token");

  try {
    const oldJoin = room.onJoin(oldClient);
    // The second admission intentionally reuses uid/sessionId.  A real
    // Colyseus adapter normally gives unique session IDs, but testing this
    // collision proves cleanup relies on registration identity, not the key.
    const newJoin = room.onJoin(newClient);
    newReady.resolve();
    await newJoin;
    assert.equal(active, registrations[1], "new registration should be active");

    oldReady.resolve();
    await assert.rejects(
      oldJoin,
      (error: unknown) => error instanceof Error && error.message.includes("AUTH_REQUIRED"),
    );
    assert.deepEqual(unregistered, [registrations[0]], "stale cleanup must target only its own token");
    assert.equal(active, registrations[1], "stale cleanup must leave replacement online");

    room.onLeave(newClient);
    assert.deepEqual(unregistered, [registrations[0], registrations[1]]);
    assert.equal(active, undefined);
  } finally {
    room.clock.stop();
  }
});

test("Lobby reconnect keeps one registration and rebinds push/kick to the new physical client", async () => {
  const registration: OnlineRegistration = { token: Symbol("reconnect-success") };
  let onlineConn: CapturedOnlineConn | undefined;
  let ensureCalls = 0;
  let verifyCalls = 0;
  const unregistered: OnlineRegistration[] = [];
  const oldSends: string[] = [];
  const newSends: string[] = [];
  const newLeaves: number[] = [];
  const reconnect = deferred<never>();
  const graceCalls: number[] = [];
  const { room } = roomWith({
    ensureCharacterReady: async () => { ensureCalls++; },
    verifySession: async () => { verifyCalls++; },
    registerOnline: (_uid, _sessionId, conn) => {
      onlineConn = conn;
      return registration;
    },
    unregisterOnline: (_uid, _sessionId, expected) => {
      if (expected) unregistered.push(expected);
    },
    isOnlineRegistrationCurrent: (_uid, _sessionId, expected) => expected === registration,
  });
  (room as unknown as {
    allowReconnection: (client: unknown, seconds: number) => Promise<unknown>;
  }).allowReconnection = async (_client, seconds) => {
    graceCalls.push(seconds);
    return reconnect.promise;
  };
  const oldClient = fakeClient("same-token", {
    onSend: (type) => oldSends.push(type),
  });
  const newClient = fakeClient("adapter-token-is-overwritten", {
    onSend: (type) => newSends.push(type),
    onLeave: (code) => { if (code !== undefined) newLeaves.push(code); },
  });

  try {
    await room.onJoin(oldClient);
    const dropping = room.onDrop(oldClient, CloseCode.ABNORMAL_CLOSURE);
    assert.deepEqual(graceCalls, [LOBBY_RECONNECT_GRACE_S]);
    reconnect.resolve(newClient);
    await room.onReconnect(newClient);
    await dropping;

    assert.equal(ensureCalls, 1, "transport reconnect must not rerun character initialization");
    assert.equal(verifyCalls, 3, "join has two fences and reconnect adds exactly one fresh fence");
    assert.deepEqual((newClient as unknown as { auth: unknown }).auth, {
      userId: "race-user", token: "same-token", sId: 7,
    });
    assert.ok(onlineConn);
    onlineConn.sink(LobbyPush.ServerNotice, { text: "recovered" });
    onlineConn.kick(KICK_CLOSE_CODE[ForceLogoutReason.Revoked]);
    assert.deepEqual(oldSends, [], "logical registration must not keep sending through RECONNECTED old client");
    assert.deepEqual(newSends, [LOBBY_MSG_PUSH]);
    assert.deepEqual(newLeaves, [KICK_CLOSE_CODE[ForceLogoutReason.Revoked]]);

    room.onLeave(oldClient);
    assert.deepEqual(unregistered, [], "old physical leave after handoff must be stale");
    room.onLeave(newClient);
    room.onLeave(newClient);
    assert.deepEqual(unregistered, [registration], "final logical leave unregisters the exact token once");
  } finally {
    room.clock.stop();
  }
});

test("Lobby reconnect grace timeout unregisters the exact registration once", async () => {
  const reconnect = deferred<never>();
  const registration: OnlineRegistration = { token: Symbol("reconnect-timeout") };
  const unregistered: OnlineRegistration[] = [];
  const { room } = roomWith({
    registerOnline: () => registration,
    unregisterOnline: (_uid, _sessionId, expected) => {
      if (expected) unregistered.push(expected);
    },
    isOnlineRegistrationCurrent: (_uid, _sessionId, expected) => expected === registration,
  });
  (room as unknown as {
    allowReconnection: (_client: unknown, _seconds: number) => Promise<unknown>;
  }).allowReconnection = async () => reconnect.promise;
  const client = fakeClient("timeout-token");

  try {
    await room.onJoin(client);
    const dropping = room.onDrop(client, CloseCode.ABNORMAL_CLOSURE);
    reconnect.reject(new Error("grace expired"));
    await dropping;
    room.onLeave(client);
    room.onLeave(client);
    assert.deepEqual(unregistered, [registration]);
  } finally {
    room.clock.stop();
  }
});

test("Lobby drop without a close code fails open into the same grace window", async () => {
  const reconnect = deferred<never>();
  const graceSeconds: number[] = [];
  const { room, unregistered } = roomWith({});
  (room as unknown as {
    allowReconnection: (_client: unknown, seconds: number) => Promise<unknown>;
  }).allowReconnection = async (_client: unknown, seconds: number) => {
    graceSeconds.push(seconds);
    return reconnect.promise;
  };
  const client = fakeClient("no-close-code-token", { sessionId: "no-close-code-seat" });

  try {
    await room.onJoin(client);
    // 框架没给关闭码：第五个 fail-open 分支必须开放与四个可重试关闭码相同的宽限窗口。
    const dropping = room.onDrop(client);
    assert.deepEqual(graceSeconds, [LOBBY_RECONNECT_GRACE_S],
      "无关闭码的 drop 必须 fail-open 进入既有 10 秒宽限窗口");
    assert.deepEqual(unregistered, [], "宽限窗口内不得提前注销 seat / online registration");
    reconnect.reject(new Error("grace expired"));
    await dropping;
    room.onLeave(client);
    assert.deepEqual(unregistered, ["no-close-code-seat"], "宽限过期后才做最终注销");
  } finally {
    room.clock.stop();
  }
});

test("Lobby replacement during grace wins over old timeout cleanup", async () => {
  const reconnect = deferred<never>();
  const registrations: OnlineRegistration[] = [];
  const unregistered: OnlineRegistration[] = [];
  let active: OnlineRegistration | undefined;
  const { room } = roomWith({
    registerOnline: () => {
      const registration = { token: Symbol("grace-generation") };
      registrations.push(registration);
      active = registration;
      return registration;
    },
    unregisterOnline: (_uid, _sessionId, expected) => {
      if (!expected) return;
      unregistered.push(expected);
      if (active === expected) active = undefined;
    },
    isOnlineRegistrationCurrent: (_uid, _sessionId, expected) => active === expected,
  });
  (room as unknown as {
    allowReconnection: (_client: unknown, _seconds: number) => Promise<unknown>;
  }).allowReconnection = async () => reconnect.promise;
  const oldClient = fakeClient("old-token");
  const replacement = fakeClient("new-token");

  try {
    await room.onJoin(oldClient);
    const dropping = room.onDrop(oldClient, CloseCode.ABNORMAL_CLOSURE);
    await room.onJoin(replacement);
    assert.equal(active, registrations[1]);

    reconnect.reject(new Error("old grace expired"));
    await dropping;
    room.onLeave(oldClient);
    assert.deepEqual(unregistered, [registrations[0]]);
    assert.equal(active, registrations[1], "old exact cleanup must leave replacement online");

    room.onLeave(replacement);
    assert.deepEqual(unregistered, [registrations[0], registrations[1]]);
  } finally {
    room.clock.stop();
  }
});

test("Lobby replacement wins while the reconnect session fence is pending", async () => {
  const verifyStarted = deferred<void>();
  const verifyRelease = deferred<void>();
  const oldRegistration: OnlineRegistration = { token: Symbol("reconnect-old") };
  const replacementRegistration: OnlineRegistration = { token: Symbol("reconnect-replacement") };
  const unregistered: OnlineRegistration[] = [];
  let active: OnlineRegistration | undefined = oldRegistration;
  let verifyCalls = 0;
  const { room } = roomWith({
    verifySession: async () => {
      verifyCalls++;
      if (verifyCalls === 3) {
        verifyStarted.resolve();
        await verifyRelease.promise;
      }
    },
    registerOnline: () => oldRegistration,
    unregisterOnline: (_uid, _sessionId, expected) => {
      if (!expected) return;
      unregistered.push(expected);
      if (active === expected) active = undefined;
    },
    isOnlineRegistrationCurrent: (_uid, _sessionId, expected) => active === expected,
  });
  const oldClient = fakeClient("old-token");
  const reconnectedClient = fakeClient("old-token");
  (room as unknown as {
    allowReconnection: (_client: unknown, _seconds: number) => Promise<unknown>;
  }).allowReconnection = async () => reconnectedClient;

  try {
    await room.onJoin(oldClient);
    const dropping = room.onDrop(oldClient, CloseCode.ABNORMAL_CLOSURE);
    const reconnecting = room.onReconnect(reconnectedClient);
    await verifyStarted.promise;
    active = replacementRegistration;
    verifyRelease.resolve();

    await assert.rejects(
      reconnecting,
      (error: unknown) => error instanceof Error && error.message.includes("AUTH_REQUIRED"),
    );
    await dropping;
    room.onLeave(reconnectedClient);
    assert.deepEqual(unregistered, [oldRegistration]);
    assert.equal(active, replacementRegistration, "old continuation must not unregister the winning generation");
  } finally {
    room.clock.stop();
  }
});

test("Lobby reconnect rejects a token fence replaced during grace", async () => {
  const registration: OnlineRegistration = { token: Symbol("reconnect-stale-token") };
  const unregistered: OnlineRegistration[] = [];
  let currentToken = "old-token";
  const { room } = roomWith({
    verifySession: async (_uid, token) => {
      if (token !== currentToken) throw new AuthRequiredError("stale reconnect token");
    },
    registerOnline: () => registration,
    unregisterOnline: (_uid, _sessionId, expected) => {
      if (expected) unregistered.push(expected);
    },
    isOnlineRegistrationCurrent: (_uid, _sessionId, expected) => expected === registration,
  });
  const newClient = fakeClient("old-token");
  (room as unknown as {
    allowReconnection: (_client: unknown, _seconds: number) => Promise<unknown>;
  }).allowReconnection = async () => newClient;
  const oldClient = fakeClient("old-token");

  try {
    await room.onJoin(oldClient);
    const dropping = room.onDrop(oldClient, CloseCode.ABNORMAL_CLOSURE);
    currentToken = "replacement-token";
    await assert.rejects(
      room.onReconnect(newClient),
      (error: unknown) => error instanceof Error && error.message.includes("AUTH_REQUIRED"),
    );
    await dropping;
    room.onLeave(newClient);
    assert.deepEqual(unregistered, [registration]);
  } finally {
    room.clock.stop();
  }
});

test("Lobby forced, consented and shutdown leaves bypass reconnect grace", async (t) => {
  const cases = [
    { name: "forced", code: KICK_CLOSE_CODE[ForceLogoutReason.Banned], viaDrop: true },
    { name: "server shutdown", code: CloseCode.SERVER_SHUTDOWN, viaDrop: true },
    { name: "consented", code: CloseCode.CONSENTED, viaDrop: false },
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      let graceCalls = 0;
      const { room, unregistered } = roomWith({});
      (room as unknown as {
        allowReconnection: (_client: unknown, _seconds: number) => Promise<unknown>;
      }).allowReconnection = async () => { graceCalls++; return undefined; };
      const client = fakeClient(`${item.name}-token`, { sessionId: `${item.name}-seat` });
      try {
        await room.onJoin(client);
        if (item.viaDrop) await room.onDrop(client, item.code);
        room.onLeave(client);
        assert.equal(graceCalls, 0);
        assert.deepEqual(unregistered, [`${item.name}-seat`]);
      } finally {
        room.clock.stop();
      }
    });
  }
});

test("Lobby reconnect continuation after shutdown cannot restore registration", async () => {
  const verifyStarted = deferred<void>();
  const verifyRelease = deferred<void>();
  const registration: OnlineRegistration = { token: Symbol("reconnect-shutdown") };
  const unregistered: OnlineRegistration[] = [];
  let verifyCalls = 0;
  const { room } = roomWith({
    verifySession: async () => {
      verifyCalls++;
      if (verifyCalls === 3) {
        verifyStarted.resolve();
        await verifyRelease.promise;
      }
    },
    registerOnline: () => registration,
    unregisterOnline: (_uid, _sessionId, expected) => {
      if (expected) unregistered.push(expected);
    },
    isOnlineRegistrationCurrent: (_uid, _sessionId, expected) => expected === registration,
  });
  const oldClient = fakeClient("shutdown-reconnect-token");
  const newClient = fakeClient("shutdown-reconnect-token");
  (room as unknown as {
    allowReconnection: (_client: unknown, _seconds: number) => Promise<unknown>;
  }).allowReconnection = async () => newClient;

  try {
    await room.onJoin(oldClient);
    const dropping = room.onDrop(oldClient, CloseCode.ABNORMAL_CLOSURE);
    const reconnecting = room.onReconnect(newClient);
    await verifyStarted.promise;
    beginShutdown();
    verifyRelease.resolve();
    await assert.rejects(
      reconnecting,
      (error: unknown) => error instanceof Error
        && error.message.startsWith(`${SharedErrorCode.CharCreateFailed}|`),
    );
    await dropping;
    room.onLeave(newClient);
    assert.deepEqual(unregistered, [registration]);
  } finally {
    resetAdmission();
    room.clock.stop();
  }
});
