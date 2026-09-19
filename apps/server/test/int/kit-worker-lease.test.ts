/**
 * kit worker 争租夹具（真实 MySQL，独立临时库；docs/MMO.md MF7a-B6；docs/MMO-PLAN.md MF7a-B6）：
 * - fixture kit `kfix`：普通 per-zone 表 `k_kfix_tile` + `role:"world-event"` 表 `k_kfix_event`（框架固定列集）+ worker `tick`；
 *   真 INFORMATION_SCHEMA 下 role 列集机检通过、把无列集的表声明成 role ⇒ 拒；
 * - db:bootstrap 预置行 → 同进程两个 worker 实例（holder A / B）争租只一个能写；
 * - 旧持有者暂停（租约过期）→ 顶替者接管 → 旧持有者恢复后**事务前**失租：首句守卫 0 行 ⇒ LeaseLostError，业务表零写入；
 *   写过一轮后再失租（**事务后**）同样被拒；
 * - 提交丢响应可重放：pass 以「先认领（UPDATE … WHERE status = 0）再落地」写成幂等，重放同一事件零副作用；
 * - `runKitWorker` 真跑主循环（真租约 + 真 withKitWorkerTx）消费剩余事件，停止信号后不再提交；
 * - uninstall 闸（tools/plugin/workerGate.ts）真库：在役租约拒、pending 事件行拒、两者皆无放行。
 * 前置：本地 MySQL 栈已启动（npm --workspace @game/server run stack）。⚠ 与其他 int 文件一样只能单文件串行跑（--test-concurrency=1）。
 */
import "./env-setup"; // 必须第一个 import（env 先于 config.ts 模块级读取）
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import mysql from "mysql2/promise";

import { MYSQL_URL } from "../../src/core/infra/config";
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";
import { applyKitMigrations, verifyKitTableShapes } from "../../tools/kit-migrations";
import { presetKitWorkerLeases } from "../../tools/kit-workers";
import { assertKitWorkersQuiescent, inspectKitWorkers } from "../../tools/plugin/workerGate";
import { LeaseLostError, renewLeaseGuard, tryAcquireLease, type SingletonLease } from "../../src/core/infra/lease";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "../../src/core/infra/mysql";
import { defineKitWorker, withKitWorkerTx, type KitWorkerTx, type KitWorkerTxDeps } from "../../src/core/infra/kitApi";
import { creditInTx, debitInTx, invalidateBalanceCache } from "../../src/core/economy/currency";
import { assertOutboxIntentMatches, insertOutboxIntent } from "../../src/core/economy/outbox";
import { KIT_EFFECT_KINDS } from "@game/shared/kits/catalog.generated";
import { runKitWorker } from "../../src/workers/kitWorker";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, "../..");
const bootstrapEntry = join(serverRoot, "tools", "db-bootstrap.ts");
const baseMysqlUrl = new URL(MYSQL_URL());

function connectionOptions(database?: string): mysql.ConnectionOptions {
  return {
    host: baseMysqlUrl.hostname,
    port: Number(baseMysqlUrl.port || 3306),
    user: decodeURIComponent(baseMysqlUrl.username || "root"),
    password: decodeURIComponent(baseMysqlUrl.password || ""),
    multipleStatements: false,
    ...(database === undefined ? {} : { database }),
  };
}

function quoteDatabase(dbName: string): string {
  assert.match(dbName, /^[a-z][a-z0-9_]{0,63}$/, `测试库名非法：${dbName}`);
  return `\`${dbName}\``;
}

function runBootstrap(dbName: string) {
  const url = new URL(baseMysqlUrl);
  url.pathname = `/${dbName}`;
  return spawnSync(process.execPath, ["--import", "tsx", bootstrapEntry], {
    cwd: serverRoot, env: { ...process.env, MYSQL_URL: url.toString() }, encoding: "utf8", timeout: 30_000,
  });
}

const LEASE_NAME = "kit:kfix:tick";

const KFIX: ServerKitCatalogEntry = {
  id: "kfix",
  version: "1.0.0",
  api: { default: { version: 1, minSupported: 1 } },
  modes: [],
  domains: [],
  effects: [],
  sqlFiles: ["sql/001-init.sql"],
  sqlTables: [
    { name: "k_kfix_tile", zone: "per-zone" },
    { name: "k_kfix_event", zone: "per-zone", role: "world-event" },
  ],
  userKeys: [],
  workers: [{ id: "tick", entry: "apps/server/src/kits/kfix/workers/tick.ts" }],
};

const INIT_SQL = `CREATE TABLE k_kfix_tile (
  server_id SMALLINT UNSIGNED NOT NULL,
  x         INT NOT NULL,
  hits      INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, x)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE k_kfix_event (
  server_id      SMALLINT UNSIGNED NOT NULL,
  event_id       BIGINT UNSIGNED NOT NULL,
  instance_id    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  seq            BIGINT UNSIGNED NOT NULL,
  kind           VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload        JSON NOT NULL,
  status         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  attempts       INT UNSIGNED NOT NULL DEFAULT 0,
  checkpoint_rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO k_kfix_event (server_id, event_id, instance_id, seq, kind, payload) VALUES
  (1, 1, 'i1', 1, 'hit', JSON_OBJECT('x', 1)),
  (1, 2, 'i1', 2, 'hit', JSON_OBJECT('x', 2)),
  (2, 3, 'i2', 1, 'hit', JSON_OBJECT('x', 3));
`;

interface EventRow extends RowDataPacket { event_id: number; payload: unknown }
interface TileRow extends RowDataPacket { x: number; hits: number }
interface StatusRow extends RowDataPacket { event_id: number; status: number; attempts: number }

/** 幂等的一轮：先认领（status 0 → 1，0 行 = 已被处理 / 重放）再落地；一轮只吃一条，报 more 让入口同区再跑。 */
const tick = defineKitWorker({
  idleMs: 100,
  async pass(tx, ctx) {
    const rows = await tx.query<EventRow[]>(
      "SELECT event_id, payload FROM k_kfix_event WHERE server_id = ? AND status = 0 ORDER BY seq LIMIT 1", [ctx.sId]);
    if (rows.length === 0) { return undefined; }
    const event = rows[0] as EventRow;
    const claimed = await tx.query<ResultSetHeader>(
      "UPDATE k_kfix_event SET status = 1, attempts = attempts + 1 WHERE server_id = ? AND event_id = ? AND status = 0",
      [ctx.sId, event.event_id]);
    if (claimed.affectedRows !== 1) { return undefined; }
    const payload = typeof event.payload === "string" ? JSON.parse(event.payload) as { x: number } : event.payload as { x: number };
    await tx.query("INSERT INTO k_kfix_tile (server_id, x, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1", [ctx.sId, payload.x]);
    return { more: true };
  },
});

test("kit worker 争租夹具：两实例只一个能写、失租写被存储边界拒、重放零副作用、停止后不再提交、卸载闸", { timeout: 120_000 }, async () => {
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const dbName = `game_kitworker_${suffix}`;
  const admin = await mysql.createConnection(connectionOptions());
  try {
    const bootstrap = runBootstrap(dbName);
    assert.equal(bootstrap.status, 0, `bootstrap 应成功\n${bootstrap.stdout}\n${bootstrap.stderr}`);
    const conn = await mysql.createConnection(connectionOptions(dbName));
    // 临时库的池：-FOUND_ROWS 与生产池同口径；withRcTx 同 core/infra/mysql.ts runTx（RC + begin/commit/rollback + release）
    const pool = mysql.createPool({ ...connectionOptions(dbName), flags: ["-FOUND_ROWS"], connectionLimit: 4 });
    const withRcTx = async <T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> => {
      const c = await pool.getConnection();
      try {
        await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
        await c.beginTransaction();
        try { const r = await fn(c); await c.commit(); return r; }
        catch (e) { await c.rollback().catch(() => undefined); throw e; }
      } finally { c.release(); }
    };
    const deps: KitWorkerTxDeps = {
      withRcTx, renewLeaseGuard, debitInTx, creditInTx, insertOutboxIntent, assertOutboxIntentMatches, invalidateBalanceCache, kinds: KIT_EFFECT_KINDS,
    };
    const acquire = (holder: string): Promise<SingletonLease | null> => tryAcquireLease(LEASE_NAME, holder, 15, pool);
    const expire = async (): Promise<void> => {
      await conn.query("UPDATE singleton_lease SET expires_at = NOW(3) - INTERVAL 1 SECOND WHERE lease_name = ?", [LEASE_NAME]);
    };
    const workerTx = <T>(lease: SingletonLease, sId: number, fn: (tx: KitWorkerTx) => Promise<T>): Promise<T> =>
      withKitWorkerTx("kfix", "tick", sId, lease, fn, deps);
    const passOnce = (lease: SingletonLease, sId: number) =>
      workerTx(lease, sId, (tx) => tick.pass(tx, { kitId: "kfix", workerId: "tick", sId, now: Date.now(), signal: new AbortController().signal }));
    const tiles = async (sId: number): Promise<[number, number][]> => {
      const [rows] = await conn.query<TileRow[]>("SELECT x, hits FROM k_kfix_tile WHERE server_id = ? ORDER BY x", [sId]);
      return rows.map((r) => [Number(r.x), Number(r.hits)]);
    };
    const events = async (): Promise<[number, number, number][]> => {
      const [rows] = await conn.query<StatusRow[]>("SELECT event_id, status, attempts FROM k_kfix_event ORDER BY event_id");
      return rows.map((r) => [Number(r.event_id), Number(r.status), Number(r.attempts)]);
    };
    const connect = async (): Promise<mysql.Connection> => mysql.createConnection(connectionOptions(dbName));
    try {
      // ① 夹具表 + role 列集机检（真 INFORMATION_SCHEMA）
      const applied = await applyKitMigrations({
        conn, dbName, catalog: [KFIX], holder: "int-test",
        readSqlFile: (kitId, file) => { assert.equal(`${kitId}/${file}`, "kfix/sql/001-init.sql"); return INIT_SQL; },
      });
      assert.deepEqual(applied.applied, [{ kitId: "kfix", file: "sql/001-init.sql" }]);
      await verifyKitTableShapes({ conn, dbName, catalog: [KFIX] });
      await assert.rejects(
        verifyKitTableShapes({ conn, dbName, catalog: [{ ...KFIX, sqlTables: [{ name: "k_kfix_tile", zone: "per-zone", role: "world-event" }, { name: "k_kfix_event", zone: "per-zone", role: "world-event" }] }] }),
        /role=world-event 表 k_kfix_tile 缺少框架固定列：event_id, instance_id, seq, kind, payload, status, attempts, checkpoint_rev/u,
      );
      // ② 预置租约行（bootstrap 步；目录里没有 kfix ⇒ 这里直接调）
      assert.deepEqual(await presetKitWorkerLeases(conn, [KFIX]), { inserted: [LEASE_NAME], existing: [] });

      // ③ 两实例争租：A 抢到（fence 1），B 抢不到
      const leaseA = await acquire("A");
      assert.ok(leaseA !== null && leaseA.fenceToken === 1, "A 抢到 fence 1");
      assert.equal(await acquire("B"), null, "B 抢不到未过期的租约");
      // A 写一轮：区 1 事件 1 → tile (1,1)
      assert.deepEqual(await passOnce(leaseA, 1), { more: true });
      assert.deepEqual(await tiles(1), [[1, 1]]);
      assert.deepEqual(await events(), [[1, 1, 1], [2, 0, 0], [3, 0, 0]]);

      // ④ A 暂停（租约过期）→ B 接管（fence 2）→ A 恢复：事务前失租，首句守卫 0 行，业务表零写入
      await expire();
      const leaseB = await acquire("B");
      assert.ok(leaseB !== null && leaseB.fenceToken === 2, "B 接管 fence 2");
      await assert.rejects(passOnce(leaseA, 1), LeaseLostError, "旧持有者 A 的写被守卫首句拒");
      assert.deepEqual(await events(), [[1, 1, 1], [2, 0, 0], [3, 0, 0]], "事件 2 仍 pending：A 的事务零写入");
      assert.deepEqual(await tiles(1), [[1, 1]]);
      // B 正常写事件 2
      assert.deepEqual(await passOnce(leaseB, 1), { more: true });
      assert.deepEqual(await tiles(1), [[1, 1], [2, 1]]);
      // A 再来（事务后失租、同 holder 旧 fence 的残留对象亦然）：仍拒
      await assert.rejects(passOnce(leaseA, 2), LeaseLostError);
      await assert.rejects(passOnce({ ...leaseB, fenceToken: 1 }, 2), LeaseLostError, "同 holder 旧 fence 也拒");
      assert.deepEqual(await events(), [[1, 1, 1], [2, 1, 1], [3, 0, 0]]);

      // ⑤ 提交丢响应 ⇒ 重放同一事件：认领 0 行 ⇒ 零副作用（tile hits 不双加、attempts 不变）
      const replay = await workerTx(leaseB, 1, async (tx) => {
        const claimed = await tx.query<ResultSetHeader>(
          "UPDATE k_kfix_event SET status = 1, attempts = attempts + 1 WHERE server_id = 1 AND event_id = 2 AND status = 0");
        if (claimed.affectedRows !== 1) { return "already-done"; }
        await tx.query("INSERT INTO k_kfix_tile (server_id, x, hits) VALUES (1, 2, 1) ON DUPLICATE KEY UPDATE hits = hits + 1");
        return "applied";
      });
      assert.equal(replay, "already-done");
      assert.deepEqual(await tiles(1), [[1, 1], [2, 1]]);
      assert.deepEqual(await events(), [[1, 1, 1], [2, 1, 1], [3, 0, 0]]);

      // ⑥ 真跑入口主循环（真租约 + 真 withKitWorkerTx）：B 停了（过期）→ C 抢到 → 吃完区 2 的事件 3 → 空闲一次即停止
      await expire();
      const controller = new AbortController();
      const logs: string[] = [];
      let idles = 0;
      const report = await runKitWorker({ kitId: "kfix", workerId: "tick" }, {
        catalog: [KFIX],
        importEntry: async (entry) => { assert.equal(entry, "apps/server/src/kits/kfix/workers/tick.ts"); return { default: tick }; },
        zones: [1, 2],
        holder: "C",
        tryAcquireLease: (leaseName, holder) => tryAcquireLease(leaseName, holder, 15, pool),
        withWorkerTx: (kitId, workerId, sId, lease, fn) => withKitWorkerTx(kitId, workerId, sId, lease, fn, deps),
        sleep: async () => { idles += 1; controller.abort(); },
        now: Date.now,
        log: (line) => { logs.push(line); },
        signal: controller.signal,
        acquireRetryMs: 50,
        maxIdleMs: 50,
      });
      assert.equal(report.outcome, "stopped");
      assert.equal(idles, 1, "全部区无积压后空闲一次，停止信号即停");
      assert.ok(report.passes >= 3, `区 1 空扫 + 区 2 事件 3 + 区 2 空扫（passes=${report.passes}）`);
      assert.deepEqual(await tiles(2), [[3, 1]]);
      assert.deepEqual(await events(), [[1, 1, 1], [2, 1, 1], [3, 1, 1]]);
      assert.ok(logs.some((line) => /lease acquired holder=C fence=3/u.test(line)), logs.join("\n"));
      // 停止后不再提交：再塞一条 pending，状态保持不动
      await conn.query("INSERT INTO k_kfix_event (server_id, event_id, instance_id, seq, kind, payload) VALUES (1, 4, 'i1', 3, 'hit', JSON_OBJECT('x', 4))");
      await new Promise((r) => setTimeout(r, 150));
      assert.deepEqual(await events(), [[1, 1, 1], [2, 1, 1], [3, 1, 1], [4, 0, 0]], "停止后的 worker 不再消费");

      // ⑦ 卸载闸（真库）：C 的租约仍在役 ⇒ 拒；过期后 pending 事件行 ⇒ 拒；消费完 + 租约过期 ⇒ 放行
      assert.deepEqual(await inspectKitWorkers(conn, "kfix", ["k_kfix_event"]), {
        pendingEvents: [{ table: "k_kfix_event", n: 1 }], heldLeases: [{ leaseName: LEASE_NAME, holder: "C" }],
      });
      await assert.rejects(assertKitWorkersQuiescent({ kitId: "kfix", worldEventTables: ["k_kfix_event"], connect }), /pending 事件行（k_kfix_event: 1）/u);
      const leaseD = await acquire("D");
      assert.equal(leaseD, null, "C 未过期时 D 抢不到");
      await expire();
      const leaseE = await acquire("E");
      assert.ok(leaseE !== null && leaseE.fenceToken === 4);
      assert.deepEqual(await passOnce(leaseE, 1), { more: true });
      await assert.rejects(assertKitWorkersQuiescent({ kitId: "kfix", worldEventTables: ["k_kfix_event"], connect }), /worker 租约在役（kit:kfix:tick holder=E）/u);
      await expire();
      assert.deepEqual(await assertKitWorkersQuiescent({ kitId: "kfix", worldEventTables: ["k_kfix_event"], connect }), {
        pendingEvents: [{ table: "k_kfix_event", n: 0 }], heldLeases: [],
      });
      assert.deepEqual(await tiles(1), [[1, 1], [2, 1], [4, 1]]);
    } finally {
      await pool.end();
      await conn.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteDatabase(dbName)}`);
    await admin.end();
  }
});
