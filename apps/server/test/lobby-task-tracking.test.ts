import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultTasks } from "../src/core/infra/lifecycle";
import { LobbyRoom, type LobbyJoinDependencies } from "../src/websocket/LobbyRoom";
import type { OnlineRegistration } from "../src/websocket/push";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function client(): never {
  return {
    sessionId: "guild-task-session",
    auth: { userId: "guild-task-user", token: "token", sId: 3 },
    send: () => {},
    leave: async () => {},
  } as never;
}

test("Lobby guild warm-up is tracked and a late result cannot mutate a left slot", async () => {
  await defaultTasks.drain();
  const fields = deferred<Record<string, string | null>>();
  const guilds: Array<number | null> = [];
  const registration: OnlineRegistration = { token: Symbol("guild-task") };
  const deps: LobbyJoinDependencies = {
    ensureCharacterReady: async () => {},
    verifySession: async () => {},
    registerOnline: () => registration,
    unregisterOnline: () => {},
    tokenHashOf: () => "hash",
    loadFields: async () => fields.promise,
    setOnlineGuild: (_uid, guildId) => { guilds.push(guildId); },
  };
  const room = new LobbyRoom(deps);
  room.clock.stop();
  const joined = client();

  try {
    await room.onJoin(joined);
    assert.equal(defaultTasks.size, 1, "detached guild read must be admitted to the task tracker");
    room.onLeave(joined);
    fields.resolve({ guildId: "42" });
    await defaultTasks.drain();
    assert.deepEqual(guilds, [], "leave/replacement must invalidate the late guild result");
  } finally {
    room.clock.stop();
    await defaultTasks.drain();
  }
});

test("Lobby guild warm-up cannot overwrite a replacement using the same client key", async () => {
  await defaultTasks.drain();
  const oldFields = deferred<Record<string, string | null>>();
  const newFields = deferred<Record<string, string | null>>();
  const guilds: Array<number | null> = [];
  const oldRegistration: OnlineRegistration = { token: Symbol("old") };
  const newRegistration: OnlineRegistration = { token: Symbol("new") };
  let active = oldRegistration;
  let loadCount = 0;
  const deps: LobbyJoinDependencies = {
    ensureCharacterReady: async () => {},
    verifySession: async () => {},
    registerOnline: () => {
      const registration = loadCount++ === 0 ? oldRegistration : newRegistration;
      active = registration;
      return registration;
    },
    unregisterOnline: () => {},
    tokenHashOf: () => "hash",
    loadFields: async () => (loadCount <= 1 ? oldFields.promise : newFields.promise),
    setOnlineGuild: (_uid, guildId) => { guilds.push(guildId); },
    isOnlineRegistrationCurrent: (_uid, _sessionId, registration) => active === registration,
  };
  const room = new LobbyRoom(deps);
  room.clock.stop();
  const oldClient = {
    sessionId: "same-key",
    auth: { userId: "same-user", token: "old", sId: 1 },
    send: () => {},
    leave: async () => {},
  } as never;
  const newClient = {
    sessionId: "same-key",
    auth: { userId: "same-user", token: "new", sId: 1 },
    send: () => {},
    leave: async () => {},
  } as never;

  try {
    await room.onJoin(oldClient);
    await room.onJoin(newClient);
    assert.equal(defaultTasks.size, 2);
    newFields.resolve({ guildId: "22" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    oldFields.resolve({ guildId: "11" });
    await defaultTasks.drain();
    assert.deepEqual(guilds, [22], "only the current registration may update the index");
  } finally {
    room.clock.stop();
    await defaultTasks.drain();
  }
});
