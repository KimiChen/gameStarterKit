/**
 * MMO MF7b-B2 世界事务真库（独立临时库 + 夹具 kit kfix 的 role:"world-event" 表；docs/MMO.md §5.4 MF7b / §4.6 不变量 1）：
 *  - `withWorldTx` 首句 CAS：write_seq 逐事务 +1、回调拿到 writeSeq；旧 owner（旧 authorityEpoch）的迟到写 0 行 ⇒ AuthorityLostError 且
 *    业务表零写入（kit 表 + 事件表都回滚）；权威被接管后原持有者的后续写全部拒；
 *  - personas：assertControl 逐个 CAS（升序），旧 controlEpoch ⇒ ControlConflictError 整体回滚；
 *  - appendWorldEvent：只许本 kit 的 role:"world-event" 表（普通 kit 表 / 别的 kit / 框架表拒）；同 event_id 重放 ⇒ "DUP" 零副作用；
 *    形状闸（seq ≥ 1 / checkpointRev ≥ 1 / kind）；
 *  - 回调内 ⛔ 取 .conn、⛔ 套 withKitTx。
 * 前置：本地 MySQL 栈已启动。⚠ int 文件只能单文件串行跑。
 * 变异验证：kitApi.withKitWorldTx 删首句谓词 `AND authority_epoch = ?` → 「旧 owner 迟到写 0 行」转红。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import mysql from "mysql2/promise";
import { KIT_EFFECT_KINDS } from "@game/shared/kits/catalog.generated";
import { MYSQL_URL } from "../../src/core/infra/config";
import { creditInTx, debitInTx, invalidateBalanceCache } from "../../src/core/economy/currency";
import { assertOutboxIntentMatches, insertOutboxIntent } from "../../src/core/economy/outbox";
import { KitTableAccessError, withKitTx, type KitTxDeps } from "../../src/core/infra/kitApi";
import type { PoolConnection, RowDataPacket } from "../../src/core/infra/mysql";
import { ControlConflictError } from "../../src/core/errors";
import { acquireAuthority, findOrCreateInstance, readInstance } from "../../src/rooms/core/control";
import { AuthorityLostError, withWorldTx, type WorldTxDeps } from "../../src/rooms/core/WorldTx";
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";
import { applyKitMigrations, verifyKitTableShapes } from "../../tools/kit-migrations";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { testUid } from "./helpers";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, "../..");
const baseMysqlUrl = new URL(MYSQL_URL());
const SID = 1;

function connectionOptions(database?: string): mysql.ConnectionOptions {
    return {
        host: baseMysqlUrl.hostname, port: Number(baseMysqlUrl.port || 3306),
        user: decodeURIComponent(baseMysqlUrl.username || "root"), password: decodeURIComponent(baseMysqlUrl.password || ""),
        multipleStatements: false, ...(database === undefined ? {} : { database }),
    };
}
function runBootstrap(dbName: string): void {
    const url = new URL(baseMysqlUrl);
    url.pathname = `/${dbName}`;
    const result = spawnSync(process.execPath, ["--import", "tsx", join(serverRoot, "tools", "db-bootstrap.ts")], {
        cwd: serverRoot, env: { ...process.env, MYSQL_URL: url.toString() }, encoding: "utf8", timeout: 60_000,
    });
    assert.equal(result.status, 0, `bootstrap 临时库失败\n${result.stdout}\n${result.stderr}`);
}

const KFIX: ServerKitCatalogEntry = {
    id: "kfix", version: "1.0.0", api: { default: { version: 1, minSupported: 1 } }, modes: [], domains: [], effects: [],
    sqlFiles: ["sql/001-init.sql"],
    sqlTables: [{ name: "k_kfix_tile", zone: "per-zone" }, { name: "k_kfix_event", zone: "per-zone", role: "world-event" }],
    userKeys: [], workers: [],
};
const INIT_SQL = `CREATE TABLE k_kfix_tile (
  server_id SMALLINT UNSIGNED NOT NULL,
  x         INT NOT NULL,
  hits      INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, x)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE k_kfix_event (
  server_id      SMALLINT UNSIGNED NOT NULL,
  event_id       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  instance_id    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  seq            BIGINT UNSIGNED NOT NULL,
  kind           VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload        JSON NOT NULL,
  status         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  attempts       INT UNSIGNED NOT NULL DEFAULT 0,
  checkpoint_rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, event_id),
  UNIQUE KEY uk_kfix_event_seq (server_id, instance_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`;

interface TileRow extends RowDataPacket { x: number; hits: number }
interface EventRow extends RowDataPacket { event_id: string; seq: number; kind: string; status: number; checkpoint_rev: number }

let admin: mysql.Connection | null = null;
let dbName = "";
after(async () => {
    if (admin && dbName) await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await admin?.end();
    await closeRedis();
});

test("withWorldTx：首句权威 CAS（write_seq）、旧 owner 迟到写 0 行整体回滚、persona 控制权 CAS、appendWorldEvent 表闸与 DUP", { timeout: 60_000 }, async () => {
    dbName = `game_worldtx_${process.pid}_${Date.now().toString(36)}`;
    admin = await mysql.createConnection(connectionOptions());
    runBootstrap(dbName);
    const conn = await mysql.createConnection(connectionOptions(dbName));
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
    const kitDeps: KitTxDeps = { withRcTx, debitInTx, creditInTx, insertOutboxIntent, assertOutboxIntentMatches, invalidateBalanceCache, kinds: KIT_EFFECT_KINDS };
    const deps: WorldTxDeps = { ...kitDeps, worldEventTables: (kitId) => (kitId === "kfix" ? ["k_kfix_event"] : []) };
    const tiles = async (): Promise<[number, number][]> => {
        const [rows] = await conn.query<TileRow[]>("SELECT x, hits FROM k_kfix_tile WHERE server_id = ? ORDER BY x", [SID]);
        return rows.map((r) => [Number(r.x), Number(r.hits)]);
    };
    const events = async (): Promise<[string, number, number, number][]> => {
        const [rows] = await conn.query<EventRow[]>("SELECT event_id, seq, status, checkpoint_rev FROM k_kfix_event WHERE server_id = ? ORDER BY seq", [SID]);
        return rows.map((r) => [String(r.event_id), Number(r.seq), Number(r.status), Number(r.checkpoint_rev)]);
    };
    try {
        await applyKitMigrations({ conn, dbName, catalog: [KFIX], holder: "int-test", readSqlFile: () => INIT_SQL });
        await verifyKitTableShapes({ conn, dbName, catalog: [KFIX] });
        // 分线行 + 权威（node-a 取 epoch 1）；persona 行由**同一 kit**（kfix）的门面建——persona 是 kit 作用域的（kit_id 列），别的 kit 的世界事务看不到它
        const instance = await findOrCreateInstance(SID, "m1", 0, pool as never);
        const epoch = await acquireAuthority(SID, instance.instanceId, "node-a", 0, pool as never);
        assert.equal(epoch, 1);
        const uid = testUid("wtx").slice(0, 32);
        const personaId = await withKitTx("kfix", SID, (tx) => tx.createPersona(uid, 0), kitDeps);
        await assert.rejects(withWorldTx("arena", SID, { instanceId: instance.instanceId, authorityEpoch: 1, personas: [{ id: personaId, controlEpoch: 0 }] },
            async () => undefined, deps), /persona not found/u, "别的 kit 的世界事务 ⛔ 拿这个 persona 的控制权");
        const scope = { instanceId: instance.instanceId, authorityEpoch: 1, personas: [{ id: personaId, controlEpoch: 0 }] };

        // ① 正常事务：writeSeq 1 → 2；业务表 + 事件表同事务落地
        const seq1 = await withWorldTx("kfix", SID, scope, async (tx) => {
            assert.equal(tx.instanceId, instance.instanceId);
            assert.equal(tx.authorityEpoch, 1);
            await tx.query("INSERT INTO k_kfix_tile (server_id, x, hits) VALUES (?, 1, 1)", [SID]);
            assert.equal(await tx.appendWorldEvent("k_kfix_event", { eventId: "evt_000000000001", seq: 1, kind: "grant", payload: { gold: 5 }, checkpointRev: 1 }), "INSERTED");
            assert.throws(() => (tx as unknown as { conn: unknown }).conn, /取原始连接/u, "⛔ .conn");
            await assert.rejects(withKitTx("kfix", SID, async () => undefined, kitDeps), /另开 withKitTx/u, "⛔ 套事务");
            return tx.writeSeq;
        }, deps);
        assert.equal(seq1, 1);
        assert.equal(await withWorldTx("kfix", SID, scope, async (tx) => tx.writeSeq, deps), 2, "write_seq 逐事务 +1");
        assert.equal((await readInstance(SID, instance.instanceId, pool as never))?.writeSeq, 2);
        assert.deepEqual(await tiles(), [[1, 1]]);
        assert.deepEqual(await events(), [["evt_000000000001", 1, 0, 1]]);

        // ② 重放同一事件 ⇒ DUP 零副作用；形状闸
        await withWorldTx("kfix", SID, scope, async (tx) => {
            assert.equal(await tx.appendWorldEvent("k_kfix_event", { eventId: "evt_000000000001", seq: 9, kind: "grant", payload: {}, checkpointRev: 1 }), "DUP");
            await assert.rejects(tx.appendWorldEvent("k_kfix_event", { eventId: "evt_000000000002", seq: 0, kind: "grant", payload: {}, checkpointRev: 1 }), TypeError, "seq ≥ 1");
            await assert.rejects(tx.appendWorldEvent("k_kfix_event", { eventId: "evt_000000000002", seq: 2, kind: "grant", payload: {}, checkpointRev: 0 }), TypeError, "checkpointRev ≥ 1");
            await assert.rejects(tx.appendWorldEvent("k_kfix_event", { eventId: "bad id", seq: 2, kind: "grant", payload: {}, checkpointRev: 1 }), TypeError);
            await assert.rejects(tx.appendWorldEvent("k_kfix_tile", { eventId: "evt_000000000002", seq: 2, kind: "grant", payload: {}, checkpointRev: 1 }), KitTableAccessError, "普通 kit 表 ⛔");
            await assert.rejects(tx.appendWorldEvent("k_arena_board", { eventId: "evt_000000000002", seq: 2, kind: "grant", payload: {}, checkpointRev: 1 }), KitTableAccessError, "别的 kit ⛔");
            await assert.rejects(tx.appendWorldEvent("world_instance", { eventId: "evt_000000000002", seq: 2, kind: "grant", payload: {}, checkpointRev: 1 }), KitTableAccessError, "框架表 ⛔");
        }, deps);
        assert.deepEqual(await events(), [["evt_000000000001", 1, 0, 1]]);

        // ③ 旧 controlEpoch ⇒ ControlConflictError 整体回滚（分线 write_seq 也回滚：首句在同一事务）
        await assert.rejects(withWorldTx("kfix", SID, { ...scope, personas: [{ id: personaId, controlEpoch: 7 }] }, async (tx) => {
            await tx.query("INSERT INTO k_kfix_tile (server_id, x, hits) VALUES (?, 2, 1)", [SID]);
        }, deps), ControlConflictError);
        assert.deepEqual(await tiles(), [[1, 1]], "控制权 CAS 失败 ⇒ 零写入");
        assert.equal((await readInstance(SID, instance.instanceId, pool as never))?.writeSeq, 3, "ROLLBACK 撤销首句的 +1（① ② ②′ 三个提交事务 ⇒ 3；③ 回滚不计）");

        // ④ 权威被接管（node-b 以 epoch 1 取 ⇒ 2）：旧 owner 的迟到写 0 行 ⇒ AuthorityLostError，回调零执行、业务表零写入
        assert.equal(await acquireAuthority(SID, instance.instanceId, "node-b", 1, pool as never), 2);
        let ran = false;
        await assert.rejects(withWorldTx("kfix", SID, scope, async (tx) => {
            ran = true;
            await tx.query("INSERT INTO k_kfix_tile (server_id, x, hits) VALUES (?, 3, 1)", [SID]);
            await tx.appendWorldEvent("k_kfix_event", { eventId: "evt_000000000003", seq: 3, kind: "grant", payload: {}, checkpointRev: 2 });
        }, deps), AuthorityLostError, "旧 owner 迟到写 0 行");
        assert.equal(ran, false, "首句 0 行 ⇒ 回调零执行");
        assert.deepEqual(await tiles(), [[1, 1]]);
        assert.deepEqual(await events(), [["evt_000000000001", 1, 0, 1]]);
        // 新权威照常写
        assert.equal(await withWorldTx("kfix", SID, { ...scope, authorityEpoch: 2 }, async (tx) => {
            await tx.query("INSERT INTO k_kfix_tile (server_id, x, hits) VALUES (?, 3, 1)", [SID]);
            return tx.writeSeq;
        }, deps), 4, "新权威接着编号（旧 owner 的失败事务不占号）");
        assert.deepEqual(await tiles(), [[1, 1], [3, 1]]);
        // 形状闸
        await assert.rejects(withWorldTx("kfix", SID, { ...scope, authorityEpoch: 0 }, async () => undefined, deps), TypeError, "authorityEpoch ≥ 1");
        await assert.rejects(withWorldTx("kfix", SID, { instanceId: "", authorityEpoch: 2 }, async () => undefined, deps), TypeError);
    } finally {
        await pool.end();
        await conn.end();
    }
});
