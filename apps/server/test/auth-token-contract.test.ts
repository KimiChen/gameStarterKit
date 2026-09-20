import assert from "node:assert/strict";
import { test } from "node:test";
import { ErrorCode, GAME_ROOM_PROTOCOL_VERSION, GAMEPLAY_CATALOG, GameplayModeId, LOBBY_PROTOCOL_VERSION } from "@game/shared";
import { consumeKickEntry, revokePersonaSessions, type KickConsumerDependencies } from "../src/core/auth/kickBus";
import { GameRoom } from "../src/rooms/GameRoom";
import { registerBallMoveGameMode } from "../src/rooms/modes/ballMove/index";
import { LobbyRoom } from "../src/websocket/LobbyRoom";

// GameRoom.onAuth 先验 mode 已登记再验 token；玩法登记在组合根，测试进程自行补齐。
registerBallMoveGameMode();

const invalidTokenCases = [
  ["", "options-only", "缺失标准 token"],
  ["standard-token", "different-token", "options.token 与标准 token 不一致"],
] as const;

for (const [standardToken, optionToken, label] of invalidTokenCases) {
  test(`GameRoom auth：${label}时拒绝`, async () => {
    await assert.rejects(
      GameRoom.onAuth(standardToken, {
        v: GAME_ROOM_PROTOCOL_VERSION,
        sId: 0,
        token: optionToken,
        mode: GameplayModeId.BallMove,
        modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
        profile: "default",
      }, undefined as never),
      (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.TokenExpired)),
    );
  });

  test(`LobbyRoom auth：${label}时拒绝`, async () => {
    await assert.rejects(
      LobbyRoom.onAuth(standardToken, {
        v: LOBBY_PROTOCOL_VERSION,
        sId: 0,
        token: optionToken,
      }, undefined as never),
      (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.TokenExpired)),
    );
  });
}

test("LobbyRoom auth：拒绝只属于 GameRoom 的 mode 撮合字段", async () => {
  await assert.rejects(
    LobbyRoom.onAuth("", {
      v: LOBBY_PROTOCOL_VERSION,
      sId: 0,
      mode: GameplayModeId.Idle,
    } as never, undefined as never),
    (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
  );
});

// ── MMO MF2-B5 会话撤销覆盖 persona（docs/MMO.md §5 MF2；真库 / 真 Redis 链路在 test/int/persona-session.test.ts 与 gateway.test.ts）──
// 变异验证：顶号形态删 `AND server_id = ?` → 「只抬该区」转红；消费侧账号级不抬代 → 「先抬再踢」转红。

function fakePersonaPool() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    execute: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      // 假库：带区谓词命中 2 行、账号级命中 5 行（只为证明返回值就是 affectedRows）
      return [{ affectedRows: sql.includes("server_id") ? 2 : 5 }, []];
    },
  };
  return { calls, pool: pool as unknown as Parameters<typeof revokePersonaSessions>[2] };
}

test("撤销覆盖 persona：账号级抬全部区、顶号只抬该区（谓词与参数逐字钉）；非法入参触库前拒", async () => {
  const { calls, pool } = fakePersonaPool();
  assert.equal(await revokePersonaSessions("u1", undefined, pool), 5);
  assert.equal(await revokePersonaSessions("u1", 3, pool), 2);
  assert.deepEqual(calls.map((c) => [c.sql, c.params]), [
    ["UPDATE persona SET session_generation = session_generation + 1 WHERE user_id = ?", ["u1"]],
    ["UPDATE persona SET session_generation = session_generation + 1 WHERE user_id = ? AND server_id = ?", ["u1", 3]],
  ]);
  const bad: [unknown, unknown][] = [["", undefined], ["x".repeat(129), undefined], [42, undefined], ["u1", -1], ["u1", 1.5], ["u1", 65536], ["u1", Number.NaN]];
  for (const [uid, sId] of bad) {
    await assert.rejects(
      revokePersonaSessions(uid as string, sId as number | undefined, pool),
      (error: unknown) => error instanceof TypeError || error instanceof RangeError,
      `非法入参 ${JSON.stringify([uid, sId])} 应拒`,
    );
  }
  assert.equal(calls.length, 2, "非法入参 ⛔ 不触库");
});

const HASH = "a".repeat(64);
function kickConsumerHarness(options: { stored?: unknown; revoke?: "ok" | "throw" } = {}) {
  const log: string[] = [];
  const dependencies: KickConsumerDependencies = {
    readStoredIssuedAt: async () => { log.push("read"); return options.stored ?? null; },
    revokePersonaSessions: async (uid, sId) => {
      log.push(`revoke:${uid}:${String(sId)}`);
      if (options.revoke === "throw") { throw new Error("injected mysql failure"); }
      return 1;
    },
    kickLocal: (uid, reason, hash, sId) => { log.push(`kick:${uid}:${reason}:${String(hash)}:${String(sId)}`); },
  };
  return { log, dependencies };
}

test("踢人流消费：账号级先抬 persona 会话代再踢，抬代失败照踢；顶号事件不抬（发起方已抬）、陈旧顶号整条丢弃；非法条目不动", async () => {
  const originalWarn = console.warn;
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.warn = () => {};
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    const banned = kickConsumerHarness();
    await consumeKickEntry(["uid", "u1", "reason", "banned"], banned.dependencies);
    assert.deepEqual(banned.log, ["revoke:u1:undefined", "kick:u1:banned:undefined:undefined"], "封号：先抬全部区（无 sId）再踢");

    const legacy = kickConsumerHarness();
    await consumeKickEntry(["uid", "u1"], legacy.dependencies);
    assert.deepEqual(legacy.log, ["revoke:u1:undefined", "kick:u1:banned:undefined:undefined"], "缺 reason 的旧版条目 = banned 账号级，同样先抬再踢");

    const failing = kickConsumerHarness({ revoke: "throw" });
    await consumeKickEntry(["uid", "u2", "reason", "revoked"], failing.dependencies);
    assert.deepEqual(failing.log, ["revoke:u2:undefined", "kick:u2:revoked:undefined:undefined"], "抬代失败 ⛔ 不漏踢（best-effort 通道）");
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]?.[0]), /抬高 persona 会话代失败 uid=u2/u);

    const replaced = ["uid", "u3", "reason", "replaced", "sId", "1", "issuedAt", "42", "exceptHash", HASH];
    const fresh = kickConsumerHarness({ stored: "42" });
    await consumeKickEntry(replaced, fresh.dependencies);
    assert.deepEqual(fresh.log, ["read", `kick:u3:replaced:${HASH}:1`], "顶号：只踢该区、⛔ 不在消费侧抬代（writeGroupSess 已按区抬）");

    const stale = kickConsumerHarness({ stored: "43" });
    await consumeKickEntry(replaced, stale.dependencies);
    assert.deepEqual(stale.log, ["read"], "陈旧顶号事件整条丢弃：不抬、不踢");

    const unverifiable = kickConsumerHarness();
    unverifiable.dependencies = { ...unverifiable.dependencies, readStoredIssuedAt: async () => { throw new Error("redis down"); } };
    await consumeKickEntry(replaced, unverifiable.dependencies);
    assert.deepEqual(unverifiable.log, [], "栅栏无法验证：丢弃");

    const malformed = kickConsumerHarness();
    await consumeKickEntry(["uid", "u4", "reason", "banned", "sId", "1"], malformed.dependencies);
    assert.deepEqual(malformed.log, [], "账号级条目带 sId 属非法：整条丢弃（⛔ 不降级成账号级踢）");
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
});
