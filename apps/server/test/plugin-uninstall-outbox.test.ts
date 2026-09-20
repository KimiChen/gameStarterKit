/**
 * 卸载 kit 的 outbox 闸（tools/plugin/outboxGate.ts；docs/KIT.md §5 K1 待做项；docs/MMO-PLAN.md MF0-B3）单测：
 * 假 MySQL 连接按剧本作答，⛔ 不连真库；真库回归（JSON_SEARCH 路径 / 冒号边界 / status 过滤）在 test/int/kit-migrations.test.ts。
 *
 * 变异验证（改哪一行 → 哪条用例转红）：
 *  - countPendingKitOutbox 返回改常量 0 → 「带 pending 卸载被拒」转红；
 *  - assertKitOutboxDrained 删「连不上库即拒」的 catch → 「连不上库 fail-closed」转红；
 *  - 删 NODE_ENV=production 分支 → 「生产环境拒 flag」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCli } from "../tools/plugin/cli";
import {
  PENDING_KIT_OUTBOX_SQL,
  assertKitOutboxDrained,
  countPendingKitOutbox,
  describeKitOutboxBacklog,
  kitEffectKindPattern,
  type OutboxSqlConnection,
} from "../tools/plugin/outboxGate";

interface Call { sql: string; params: unknown[] | undefined }

function fakeConn(pendingByPattern: Record<string, number>, options: { readonly fail?: boolean } = {}): OutboxSqlConnection & { calls: Call[]; ended: number } {
  const conn = {
    calls: [] as Call[],
    ended: 0,
    async query(sql: string, params?: unknown[]): Promise<[unknown, unknown]> {
      conn.calls.push({ sql, params });
      if (options.fail) { throw new Error("ER_NO_SUCH_TABLE"); }
      const pattern = String(params?.[0] ?? "");
      return [[{ n: pendingByPattern[pattern] ?? 0 }], []];
    },
    async end(): Promise<void> { conn.ended += 1; },
  };
  return conn;
}

test("kitEffectKindPattern：冒号是边界；非法 id 拒", () => {
  assert.equal(kitEffectKindPattern("kfix"), "kit:kfix:%");
  assert.equal(kitEffectKindPattern("arenaShop"), "kit:arenaShop:%");
  assert.throws(() => kitEffectKindPattern("k_fix"), /kit id 非法/u);
  assert.throws(() => kitEffectKindPattern("Kfix"), /kit id 非法/u);
  assert.throws(() => kitEffectKindPattern(""), /kit id 非法/u);
});

test("countPendingKitOutbox：只数 status=0，按 $.grants[*].kind 前缀 JSON_SEARCH；返回形状异常即抛", async () => {
  const conn = fakeConn({ "kit:kfix:%": 3 });
  assert.equal(await countPendingKitOutbox(conn, "kfix"), 3);
  assert.equal(conn.calls.length, 1);
  assert.equal(conn.calls[0].sql, PENDING_KIT_OUTBOX_SQL);
  assert.match(conn.calls[0].sql, /status = 0/u);
  assert.match(conn.calls[0].sql, /JSON_SEARCH\(effect, 'one', \?, NULL, '\$\.grants\[\*\]\.kind'\)/u);
  assert.deepEqual(conn.calls[0].params, ["kit:kfix:%"]);
  assert.equal(await countPendingKitOutbox(conn, "other"), 0);
  const weird: OutboxSqlConnection = { async query() { return [[{ n: "x" }], []]; }, async end() { /* noop */ } };
  await assert.rejects(countPendingKitOutbox(weird, "kfix"), /计数返回异常/u);
});

test("assertKitOutboxDrained：空放行并关连接；带 pending 卸载被拒并点名条数与 kind 前缀", async () => {
  const clean = fakeConn({});
  assert.deepEqual(await assertKitOutboxDrained({ kitId: "kfix", connect: async () => clean, nodeEnv: "development" }), { pending: 0, bypassed: false });
  assert.equal(clean.ended, 1, "闸用完必须关连接");

  const dirty = fakeConn({ "kit:kfix:%": 2 });
  await assert.rejects(
    assertKitOutboxDrained({ kitId: "kfix", connect: async () => dirty, nodeEnv: "development" }),
    (error: unknown) => error instanceof Error && /拒绝卸载 kit "kfix"/u.test(error.message) && /2 条 status=0 的 kit:kfix:\* intent/u.test(error.message) && /relayer/u.test(error.message),
  );
  assert.equal(dirty.ended, 1, "拒绝路径同样关连接");
});

test("assertKitOutboxDrained：连不上库 / 计数失败一律 fail-closed", async () => {
  await assert.rejects(
    assertKitOutboxDrained({ kitId: "kfix", nodeEnv: "development", connect: async () => { throw new Error("ECONNREFUSED 127.0.0.1:3316"); } }),
    /连不上 MySQL.*fail-closed.*ECONNREFUSED/u,
  );
  const broken = fakeConn({}, { fail: true });
  await assert.rejects(assertKitOutboxDrained({ kitId: "kfix", nodeEnv: "development", connect: async () => broken }), /计数失败.*fail-closed.*ER_NO_SUCH_TABLE/u);
  assert.equal(broken.ended, 1);
});

test("assertKitOutboxDrained：--allow-pending-outbox 非生产放行并告警；生产环境连 flag 都拒且不碰库", async () => {
  const dirty = fakeConn({ "kit:kfix:%": 5 });
  const logs: string[] = [];
  assert.deepEqual(
    await assertKitOutboxDrained({ kitId: "kfix", connect: async () => dirty, nodeEnv: "development", allowPendingOutbox: true, log: (line) => logs.push(line) }),
    { pending: 5, bypassed: true },
  );
  assert.equal(logs.length, 1);
  assert.match(logs[0], /⚠ kit "kfix" 仍有 5 条 pending/u);
  assert.match(logs[0], /EFFECT_UNKNOWN_KIND/u);

  let connected = 0;
  await assert.rejects(
    assertKitOutboxDrained({ kitId: "kfix", nodeEnv: "production", allowPendingOutbox: true, connect: async () => { connected += 1; return dirty; } }),
    /只在非生产环境可用/u,
  );
  assert.equal(connected, 0, "生产环境的拒绝发生在开连接之前");
  // 不带 flag 的生产卸载仍走正常闸（空放行）。
  const clean = fakeConn({});
  assert.deepEqual(await assertKitOutboxDrained({ kitId: "kfix", nodeEnv: "production", connect: async () => clean }), { pending: 0, bypassed: false });
});

test("describeKitOutboxBacklog（check）：只对有积压的 kit 出提示；连不上库 / 计数失败给「未核」提示而不抛", async () => {
  const conn = fakeConn({ "kit:arena:%": 4 });
  assert.deepEqual(await describeKitOutboxBacklog(["arena", "slg"], async () => conn), [
    "⚠ kit \"arena\" 仍有 4 条 pending outbox intent（kind kit:arena:*）：uninstall 会拒绝，先让 relayer 排空",
  ]);
  assert.equal(conn.ended, 1);
  assert.deepEqual(await describeKitOutboxBacklog([], async () => { throw new Error("must not connect"); }), []);
  const unreachable = await describeKitOutboxBacklog(["arena"], async () => { throw new Error("ECONNREFUSED"); });
  assert.equal(unreachable.length, 1);
  assert.match(unreachable[0], /未核 gameplay_outbox（连不上 MySQL：ECONNREFUSED）/u);
  const broken = fakeConn({}, { fail: true });
  const failed = await describeKitOutboxBacklog(["arena"], async () => broken);
  assert.match(failed[0], /未核 gameplay_outbox（计数失败/u);
  assert.equal(broken.ended, 1);
});

test("parseCli：uninstall 接受 --allow-pending-outbox，其他子命令拒", () => {
  const parsed = parseCli(["uninstall", "kfix", "--allow-pending-outbox", "--dry-run"]);
  assert.equal(parsed.command, "uninstall");
  if (parsed.command === "uninstall") {
    assert.equal(parsed.allowPendingOutbox, true);
    assert.equal(parsed.dryRun, true);
  }
  const plain = parseCli(["uninstall", "kfix"]);
  if (plain.command === "uninstall") { assert.equal(plain.allowPendingOutbox, false); }
  assert.throws(() => parseCli(["check", "--allow-pending-outbox"]), /unknown argument: --allow-pending-outbox/u);
  assert.throws(() => parseCli(["install", "x.zip", "--allow-pending-outbox"]), /unknown argument: --allow-pending-outbox/u);
});
