import assert from "node:assert/strict";
import { test } from "node:test";
import { ErrorCode as SharedErrorCode } from "@game/shared";
import { AuthRequiredError } from "../src/core/errors";
import {
  LobbyRoom,
  type LobbyJoinDependencies,
} from "../src/websocket/LobbyRoom";
import type { OnlineRegistration } from "../src/websocket/push";
import { beginShutdown, resetAdmission } from "../src/core/infra/lifecycle";

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

function fakeClient(token: string): never {
  return {
    sessionId: "stale-seat",
    auth: { userId: "race-user", token, sId: 7 },
    send: () => {},
    leave: async () => {},
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
