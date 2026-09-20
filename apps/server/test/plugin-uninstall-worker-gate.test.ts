/**
 * 卸载 kit 的 worker 闸（tools/plugin/workerGate.ts；docs/MMO.md MF7a-B5）单测：假 MySQL 连接按剧本作答，⛔ 不连真库；
 * 真库回归（COUNT status=0 / 在役租约谓词 / 孤儿行）在 test/int/kit-worker-lease.test.ts。
 *
 * 变异验证（改哪一行 → 哪条用例转红）：
 *  - assertKitWorkersQuiescent 的 pending 判定改成恒空 → 「带 pending 事件行卸载被拒」转红；
 *  - 删在役租约判定 → 「租约在役卸载被拒」转红；
 *  - 删「连不上库即拒」的 catch → 「连不上库 fail-closed」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerKitCatalogEntry } from "../src/kits/catalogTypes";
import {
  HELD_KIT_WORKER_LEASES_SQL, assertKitWorkersQuiescent, describeKitWorkerBacklog, inspectKitWorkers, kitWorkerLeasePattern,
  pendingWorldEventSql, worldEventTablesOf, type WorkerGateSqlConnection,
} from "../tools/plugin/workerGate";

interface Call { sql: string; params: unknown[] | undefined }
interface Script {
  readonly pending?: Record<string, number>;
  /** 在役租约（假连接不判过期，剧本里的就是在役的）。 */
  readonly held?: { leaseName: string; holder: string }[];
  /** 库里存在的全部 kit:% 行（孤儿判定用；缺省 = held 的名字）。 */
  readonly allLeases?: string[];
  readonly fail?: boolean;
}

function fakeConn(script: Script = {}): WorkerGateSqlConnection & { calls: Call[]; ended: number } {
  const conn = {
    calls: [] as Call[],
    ended: 0,
    async query(sql: string, params?: unknown[]): Promise<[unknown, unknown]> {
      conn.calls.push({ sql, params });
      if (script.fail) { throw new Error("ER_NO_SUCH_TABLE"); }
      const count = /^SELECT COUNT\(\*\) AS n FROM `([^`]+)` WHERE status = 0$/u.exec(sql);
      if (count !== null) { return [[{ n: script.pending?.[count[1] as string] ?? 0 }], []]; }
      const prefix = String(params?.[0] ?? "").replace(/%$/u, "").replace(/\\(.)/gu, "$1");
      if (sql === HELD_KIT_WORKER_LEASES_SQL) {
        return [(script.held ?? []).filter((row) => row.leaseName.startsWith(prefix)).map((row) => ({ lease_name: row.leaseName, holder: row.holder })), []];
      }
      if (sql.startsWith("SELECT lease_name FROM singleton_lease WHERE lease_name LIKE ?")) {
        const names = script.allLeases ?? (script.held ?? []).map((row) => row.leaseName);
        return [names.filter((name) => name.startsWith(prefix)).sort().map((lease_name) => ({ lease_name })), []];
      }
      throw new Error(`fake: 未知 SQL ${sql}`);
    },
    async end(): Promise<void> { conn.ended += 1; },
  };
  return conn;
}

const kit = (id: string, tables: ServerKitCatalogEntry["sqlTables"], workers: string[] = []): ServerKitCatalogEntry => ({
  id, version: "1.0.0", api: {}, modes: [], domains: [], effects: [], sqlFiles: [], sqlTables: tables, userKeys: [],
  workers: workers.map((w) => ({ id: w, entry: `apps/server/src/kits/${id}/workers/${w}.ts` })),
});
const KFIX = kit("kfix", [{ name: "k_kfix_tile", zone: "per-zone" }, { name: "k_kfix_event", zone: "per-zone", role: "world-event" }], ["tick"]);

test("模式 / 表名 / role 过滤：冒号边界、kit 表形态闸（⛔ 框架表 / backtick / 多语句）", () => {
  assert.equal(kitWorkerLeasePattern("kfix"), "kit:kfix:%");
  assert.throws(() => kitWorkerLeasePattern("k_fix"), /kit id 非法/u);
  assert.equal(pendingWorldEventSql("k_kfix_event"), "SELECT COUNT(*) AS n FROM `k_kfix_event` WHERE status = 0");
  for (const bad of ["user_currency", "k_kfix_event; DROP TABLE x", "k_kfix_`event`", "game.k_kfix_event", "kfix_event"]) {
    assert.throws(() => pendingWorldEventSql(bad), /world-event 表名非法/u, bad);
  }
  assert.deepEqual(worldEventTablesOf(KFIX), ["k_kfix_event"]);
  assert.deepEqual(worldEventTablesOf(undefined), []);
});

test("inspectKitWorkers：逐表数 status=0；在役租约按 kit:<id>:% 模式（kit:kfi:% 不吃 kit:kfix:*）；计数形状异常即抛", async () => {
  const conn = fakeConn({ pending: { k_kfix_event: 2 }, held: [{ leaseName: "kit:kfix:tick", holder: "h1" }, { leaseName: "kit:kfi:x", holder: "h2" }] });
  assert.deepEqual(await inspectKitWorkers(conn, "kfix", ["k_kfix_event"]), {
    pendingEvents: [{ table: "k_kfix_event", n: 2 }], heldLeases: [{ leaseName: "kit:kfix:tick", holder: "h1" }],
  });
  assert.deepEqual(await inspectKitWorkers(conn, "kfi", []), { pendingEvents: [], heldLeases: [{ leaseName: "kit:kfi:x", holder: "h2" }] });
  assert.equal(conn.calls[1]?.sql, HELD_KIT_WORKER_LEASES_SQL);
  assert.deepEqual(conn.calls[1]?.params, ["kit:kfix:%"]);
  const weird: WorkerGateSqlConnection = { async query() { return [[{ n: "x" }], []]; }, async end() { /* noop */ } };
  await assert.rejects(inspectKitWorkers(weird, "kfix", ["k_kfix_event"]), /pending 计数返回异常/u);
});

test("assertKitWorkersQuiescent：空放行并关连接；带 pending 事件行卸载被拒并点名表与条数；租约在役卸载被拒并点名 holder", async () => {
  const clean = fakeConn({ held: [{ leaseName: "kit:other:tick", holder: "h9" }] });
  assert.deepEqual(await assertKitWorkersQuiescent({ kitId: "kfix", worldEventTables: ["k_kfix_event"], connect: async () => clean }),
    { pendingEvents: [{ table: "k_kfix_event", n: 0 }], heldLeases: [] });
  assert.equal(clean.ended, 1, "闸用完必须关连接");

  const pending = fakeConn({ pending: { k_kfix_event: 3 } });
  await assert.rejects(
    assertKitWorkersQuiescent({ kitId: "kfix", worldEventTables: ["k_kfix_event"], connect: async () => pending }),
    (error: unknown) => error instanceof Error && /拒绝卸载 kit "kfix"/u.test(error.message) && /k_kfix_event: 3/u.test(error.message) && /无 bypass/u.test(error.message),
  );
  assert.equal(pending.ended, 1, "拒绝路径同样关连接");

  const held = fakeConn({ held: [{ leaseName: "kit:kfix:tick", holder: "host:42:ab" }] });
  await assert.rejects(
    assertKitWorkersQuiescent({ kitId: "kfix", worldEventTables: [], connect: async () => held }),
    /worker 租约在役（kit:kfix:tick holder=host:42:ab）.*SIGTERM/u,
  );
});

test("assertKitWorkersQuiescent：连不上库 / 查询失败一律 fail-closed", async () => {
  await assert.rejects(
    assertKitWorkersQuiescent({ kitId: "kfix", worldEventTables: [], connect: async () => { throw new Error("ECONNREFUSED 127.0.0.1:3316"); } }),
    /连不上 MySQL.*fail-closed.*ECONNREFUSED/u,
  );
  const broken = fakeConn({ fail: true });
  await assert.rejects(assertKitWorkersQuiescent({ kitId: "kfix", worldEventTables: ["k_kfix_event"], connect: async () => broken }), /查询失败.*fail-closed.*ER_NO_SUCH_TABLE/u);
  assert.equal(broken.ended, 1);
});

test("describeKitWorkerBacklog（check）：pending / 在役 / 目录缺 kit / 孤儿租约行各一条提示；连不上库只给「未核」", async () => {
  const conn = fakeConn({
    pending: { k_kfix_event: 1 },
    held: [{ leaseName: "kit:kfix:tick", holder: "h1" }],
    allLeases: ["kit:kfix:tick", "kit:gone:old"],
  });
  assert.deepEqual(await describeKitWorkerBacklog(["kfix", "nope"], [KFIX], async () => conn), [
    "⚠ kit \"kfix\" 的 world-event 表还有 pending 事件行（k_kfix_event: 1）：uninstall 会拒绝，先让 worker 消费完",
    "⚠ kit \"kfix\" 的 worker 租约在役（kit:kfix:tick holder=h1）：uninstall 会拒绝，先停 worker",
    "⚠ kit \"nope\" 不在生成目录（codegen:plugins 未刷新？）：world-event 表未核，只核了租约行",
    "⚠ singleton_lease 有 kit worker 租约行 'kit:gone:old' 而目录无该 worker（删 kit 后行保留；确认弃用后可手工 DELETE）",
  ]);
  assert.equal(conn.ended, 1);
  assert.deepEqual(await describeKitWorkerBacklog([], [KFIX], async () => { throw new Error("不该连"); }), []);
  assert.deepEqual(await describeKitWorkerBacklog(["kfix"], [KFIX], async () => { throw new Error("ECONNREFUSED"); }),
    ["⚠ 未核 kit worker（连不上 MySQL：ECONNREFUSED）——卸载 kit 时会再次核对并 fail-closed"]);
  assert.deepEqual(await describeKitWorkerBacklog(["kfix"], [KFIX], async () => fakeConn({ fail: true })), ["⚠ 未核 kit worker（查询失败：ER_NO_SUCH_TABLE）"]);
});
