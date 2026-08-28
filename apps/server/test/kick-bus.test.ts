import assert from "node:assert/strict";
import { test } from "node:test";
import { ForceLogoutReason } from "@game/shared";
import { broadcastKick, normalizeKickStoredIssuedAt, parseKickFields } from "../src/core/auth/kickBus";
import { kickUser, registerOnline, unregisterOnline } from "../src/websocket/push";

const HASH = "a".repeat(64);

test("kick stream parser preserves legacy omission semantics", () => {
  assert.deepEqual(parseKickFields(["uid", "u1"]), {
    uid: "u1",
    reason: ForceLogoutReason.Banned,
  });
  assert.deepEqual(parseKickFields(["uid", "u1", "reason", "replaced", "sId", "7", "issuedAt", "42", "exceptHash", HASH]), {
    uid: "u1",
    reason: ForceLogoutReason.Replaced,
    sId: 7,
    issuedAt: 42,
    exceptHash: HASH,
  });
  assert.deepEqual(parseKickFields(["uid", "u1", "reason", "revoked"]), {
    uid: "u1",
    reason: ForceLogoutReason.Revoked,
  });
});

test("kick stream parser drops malformed scoped fields instead of widening the kick", () => {
  for (const bad of ["", "-1", "65536", "1.5", "1junk", "NaN", "Infinity"]) {
    assert.equal(
      parseKickFields(["uid", "u1", "reason", "replaced", "sId", bad]),
      null,
      `非法 sId=${bad} 必须整条丢弃，不能降级成账号级踢人`,
    );
  }
  for (const bad of ["", "BANNED", "unknown", " banned "]) {
    assert.equal(
      parseKickFields(["uid", "u1", "reason", bad]),
      null,
      `非法 reason=${bad} 必须整条丢弃，不能默认成 banned`,
    );
  }
  assert.equal(parseKickFields(["uid", "u1", "sId", "1", "issuedAt", "not-a-number"]), null);
  assert.equal(parseKickFields(["uid", "u1", "issuedAt", "42"]), null, "issuedAt 缺 sId 不得降级为账号级踢人");
  assert.equal(parseKickFields(["uid", "u1", "sId", "1", "issuedAt", "42"]), null,
    "issuedAt 缺 exceptHash 不得失去顶号自踢保护");
  for (const badHash of ["", "h", "g".repeat(64), HASH.toUpperCase()]) {
    assert.equal(parseKickFields(["uid", "u1", "exceptHash", badHash]), null,
      `非法 exceptHash=${badHash} 必须整条丢弃，不能失去自踢保护`);
  }
});

test("kick stream parser keeps replacement and account-wide events disjoint", () => {
  assert.equal(parseKickFields(["uid", "u1", "reason", "replaced"]), null,
    "缺失 scope 的 replaced 不得扩大成账号级踢人");
  assert.equal(parseKickFields(["uid", "u1", "reason", "replaced", "exceptHash", HASH]), null);
  assert.equal(parseKickFields(["uid", "u1", "reason", "replaced", "sId", "1", "exceptHash", HASH]), null);
  assert.equal(parseKickFields(["uid", "u1", "reason", "banned", "sId", "1"]), null,
    "账号级封号不得被畸形 scope 收窄到单区");
  assert.equal(parseKickFields([
    "uid", "u1", "reason", "revoked", "sId", "1", "issuedAt", "42", "exceptHash", HASH,
  ]), null, "账号级撤销不得携带 replacement fence");
});

test("kick session fence fails closed on missing or corrupt storage values", () => {
  assert.equal(normalizeKickStoredIssuedAt("42"), 42);
  for (const bad of [null, undefined, "", "1junk", "-1", "1.5", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(normalizeKickStoredIssuedAt(bad), null);
  }
});

test("kick producer rejects malformed unions without touching Redis or stringifying hostile values", async () => {
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  const hostileUid = {
    [Symbol.toPrimitive](): never { throw new Error("hostile uid stringify"); },
  };
  try {
    await broadcastKick("u1", ForceLogoutReason.Replaced);
    await broadcastKick("u1", ForceLogoutReason.Banned, HASH);
    await broadcastKick(hostileUid as unknown as string, ForceLogoutReason.Banned);
  } finally {
    console.error = originalError;
  }
  assert.equal(logs.length, 3);
  assert.ok(logs.every((args) => args.length === 1 && args[0] === "[kick] 拒绝发布非法踢人事件"));
});

test("kickUser acknowledges only a close call that returns successfully", () => {
  const failedUid = "kick-ack-failed";
  registerOnline(failedUid, "failed", {
    sink: () => { throw new Error("push failed"); },
    kick: () => { throw new Error("close failed"); },
    tokenHash: "failed",
    sId: 1,
  });
  try {
    assert.equal(kickUser(failedUid, ForceLogoutReason.Banned), false);
  } finally {
    unregisterOnline(failedUid, "failed");
  }

  const deliveredUid = "kick-ack-delivered";
  let closeCode = 0;
  registerOnline(deliveredUid, "delivered", {
    sink: () => { throw new Error("push failed"); },
    kick: (code) => { closeCode = code; },
    tokenHash: "delivered",
    sId: 1,
  });
  try {
    assert.equal(kickUser(deliveredUid, ForceLogoutReason.Banned), true);
    assert.ok(closeCode > 0);
  } finally {
    unregisterOnline(deliveredUid, "delivered");
  }
});

test("kick stream parser rejects ambiguous field layouts", () => {
  assert.equal(parseKickFields([]), null);
  assert.equal(parseKickFields(["uid"]), null);
  assert.equal(parseKickFields(["uid", "u1", "uid", "u2"]), null);
  assert.equal(parseKickFields(["uid", "u1", "unexpected", "x"]), null);
  assert.equal(parseKickFields(["uid", "", "reason", "banned"]), null);
  assert.equal(parseKickFields(["uid", "u".repeat(129)]), null);
});

test("kick stream parser contains hostile arrays and revoked Proxies", () => {
  assert.equal(parseKickFields({ length: 2, 0: "uid", 1: "u1" } as never), null);

  const hostile = new Proxy(["uid", "u1"], {
    get(target, property, receiver) {
      if (property === "length") { throw new Error("hostile length"); }
      return Reflect.get(target, property, receiver);
    },
  });
  assert.doesNotThrow(() => parseKickFields(hostile));
  assert.equal(parseKickFields(hostile), null);

  const revoked = Proxy.revocable(["uid", "u1"], {});
  revoked.revoke();
  assert.doesNotThrow(() => parseKickFields(revoked.proxy));
  assert.equal(parseKickFields(revoked.proxy), null);
});
