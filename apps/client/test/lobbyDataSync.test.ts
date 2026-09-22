import assert from "node:assert/strict";
import { test } from "node:test";
import { LobbyDataSyncStore } from "../src/net/LobbyDataSync";

test("LobbyDataSyncStore：reply.sync 与主动 sync 共用模块状态入口", () => {
  const store = new LobbyDataSyncStore();
  const seen: unknown[] = [];
  store.subscribeModule("nativeUser", (value) => seen.push(value));

  store.apply({
    mods: {
      versions: { nativeUser: 1 },
      nativeUser: { uid: "u1", copper: 200, ver: 1 },
    },
  });
  store.apply({
    mods: {
      versions: { nativeUser: 2 },
      nativeUser: { uid: "u1", copper: 250, ver: 2 },
    },
  });

  assert.equal(store.version("nativeUser"), 2);
  assert.deepEqual(store.module("nativeUser"), {
    uid: "u1",
    copper: 250,
    ver: 2,
  });
  assert.equal(seen.length, 3); // initial replay + two committed changes
});

test("LobbyDataSyncStore：同版本/倒退忽略，跳号标记 stale", () => {
  const store = new LobbyDataSyncStore();
  let notifications = 0;
  store.subscribeModule("nativeUser", () => {
    notifications += 1;
  });

  store.apply({
    mods: { versions: { nativeUser: 1 }, nativeUser: { copper: 1 } },
  });
  store.apply({
    mods: { versions: { nativeUser: 1 }, nativeUser: { copper: 9 } },
  });
  store.apply({
    mods: { versions: { nativeUser: 0 }, nativeUser: { copper: 0 } },
  });
  assert.equal(store.module<{ copper: number }>("nativeUser")?.copper, 1);
  assert.equal(notifications, 2); // initial replay + version 1

  store.apply({
    mods: { versions: { nativeUser: 3 }, nativeUser: { copper: 3 } },
  });
  assert.equal(store.isStale("nativeUser"), true);
  assert.equal(store.module<{ copper: number }>("nativeUser")?.copper, 3);
});

test("LobbyDataSyncStore：会话 reset 清空模块、版本和 stale 状态", () => {
  const store = new LobbyDataSyncStore();
  store.apply({
    mods: { versions: { nativeUser: 1 }, nativeUser: { copper: 1 } },
  });
  store.apply({
    mods: { versions: { nativeUser: 3 }, nativeUser: { copper: 3 } },
  });
  store.reset();
  assert.equal(store.latest(), null);
  assert.equal(store.module("nativeUser"), undefined);
  assert.equal(store.version("nativeUser"), undefined);
  assert.equal(store.isStale("nativeUser"), false);
});
