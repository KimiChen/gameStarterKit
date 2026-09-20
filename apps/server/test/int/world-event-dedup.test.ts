/**
 * MMO MF7b-B3 世界事件 outbox 真库（独立临时库 + kfix role:"world-event" 表；docs/MMO.md §5.4 MF7b / §7.3 原子规则）：
 *  - 门：`checkpoint_rev ≤ world_instance.checkpoint_rev` 才被认领（检查点未落库的事件 ⛔ 执行；落库后按 seq 认领）；
 *  - 至少一次 + 回执去重：认领与效果（credit，opId = eventId）同一事务——崩溃（事务抛出）⇒ 回滚重放只发一次；重复投递 ⇒ credit "DUP" 余额不变；
 *  - release：单事件失败放回 pending（attempts 累加），达上限 ⇒ dead 且不再认领；deadLetter 直接死信；
 *  - Recovering：`supersedeWorldEvents` 把 pending 且 checkpoint_rev > 恢复点 rev 的行标 superseded（3），此后不可认领；stats；
 *  - worker 事务（withKitWorkerTx，真租约）同样带消费口。
 * 前置：本地 Redis / MySQL 栈已启动（credit 会失效余额缓存）。⚠ int 文件只能单文件串行跑。
 * 变异验证：kitApi.claimWorldEventsSql 删门 `e.checkpoint_rev <= w.checkpoint_rev` → 「检查点未落库 ⇒ 认领 0 行」转红。
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
import { CUR_GOLD } from "../../src/core/infra/config";
import { creditInTx, debitInTx, invalidateBalanceCache } from "../../src/core/economy/currency";
import { assertOutboxIntentMatches, insertOutboxIntent } from "../../src/core/economy/outbox";
import { withKitTx, withKitWorkerTx, type KitTxDeps, type KitWorkerTxDeps } from "../../src/core/infra/kitApi";
import { renewLeaseGuard, tryAcquireLease } from "../../src/core/infra/lease";
import type { PoolConnection, RowDataPacket } from "../../src/core/infra/mysql";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { acquireAuthority, findOrCreateInstance } from "../../src/rooms/core/control";
import { WORLD_EVENT_MAX_ATTEMPTS, WORLD_EVENT_STATUS, supersedeWorldEvents, worldEventStats } from "../../src/rooms/core/WorldEventPort";
import { withWorldTx, type WorldTxDeps } from "../../src/rooms/core/WorldTx";
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";
import { applyKitMigrations, verifyKitTableShapes } from "../../tools/kit-migrations";
import { presetKitWorkerLeases } from "../../tools/kit-workers";
import { assertRedisUp, testUid } from "./helpers";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, "../..");
const baseMysqlUrl = new URL(MYSQL_URL());
const SID = 1;
const TABLE = "k_kfix_event";

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
    sqlTables: [{ name: TABLE, zone: "per-zone", role: "world-event" }],
    userKeys: [], workers: [{ id: "grant", entry: "apps/server/src/kits/kfix/workers/grant.ts" }],
};
const INIT_SQL = `CREATE TABLE ${TABLE} (
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

interface EventRow extends RowDataPacket { event_id: string; status: number; attempts: number }
interface BalanceRow extends RowDataPacket { balance: number | string }

let admin: mysql.Connection | null = null;
let dbName = "";
after(async () => {
    if (admin && dbName) await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await admin?.end();
    await closeRedis();
});

test("世界事件 outbox：checkpoint_rev 门、至少一次 + 回执去重、release / dead、Recovering superseded、worker 事务消费口", { timeout: 90_000 }, async () => {
    await assertRedisUp();
    dbName = `game_wevent_${process.pid}_${Date.now().toString(36)}`;
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
    const eventTables = (kitId: string): readonly string[] => (kitId === "kfix" ? [TABLE] : []);
    const worldDeps: WorldTxDeps = { ...kitDeps, worldEventTables: eventTables };
    const workerDeps: KitWorkerTxDeps = { ...kitDeps, renewLeaseGuard, worldEventTables: eventTables };
    const eventRows = async (): Promise<[string, number, number][]> => {
        const [rows] = await conn.query<EventRow[]>(`SELECT event_id, status, attempts FROM ${TABLE} WHERE server_id = ? ORDER BY seq`, [SID]);
        return rows.map((r) => [String(r.event_id), Number(r.status), Number(r.attempts)]);
    };
    try {
        await applyKitMigrations({ conn, dbName, catalog: [KFIX], holder: "int-test", readSqlFile: () => INIT_SQL });
        await verifyKitTableShapes({ conn, dbName, catalog: [KFIX] });
        const instance = await findOrCreateInstance(SID, "m1", 0, pool as never);
        assert.equal(await acquireAuthority(SID, instance.instanceId, "node-a", 0, pool as never), 1);
        const uid = testUid("wev").slice(0, 32);
        const personaId = await withKitTx("kfix", SID, (tx) => tx.createPersona(uid, 0), kitDeps);
        const owner = { kind: "persona", personaId } as const;
        const balance = async (): Promise<number> => {
            const [rows] = await conn.query<BalanceRow[]>(
                "SELECT balance FROM user_currency WHERE user_id = ? AND server_id = ? AND owner_kind = 1 AND owner_id = ? AND currency = ?", [uid, SID, personaId, CUR_GOLD]);
            return rows.length === 0 ? 0 : Number(rows[0]!.balance);
        };
        const scope = { instanceId: instance.instanceId, authorityEpoch: 1 };
        const setCheckpointRev = async (rev: number): Promise<void> => {
            await conn.query("UPDATE world_instance SET checkpoint_rev = ? WHERE server_id = ? AND instance_id = ?", [rev, SID, instance.instanceId]);
        };
        const evt = (n: number): string => `evt_${String(n).padStart(12, "0")}`;
        // 写侧：e1 属检查点 1，e2 属检查点 2（同一世界事务）
        await withWorldTx("kfix", SID, scope, async (tx) => {
            await tx.appendWorldEvent(TABLE, { eventId: evt(1), seq: 1, kind: "grantCurrency", payload: { amount: 5 }, checkpointRev: 1 });
            await tx.appendWorldEvent(TABLE, { eventId: evt(2), seq: 2, kind: "grantCurrency", payload: { amount: 7 }, checkpointRev: 2 });
        }, worldDeps);

        // ① 门：分线检查点 rev 0（未落库）⇒ 认领 0 行
        assert.deepEqual(await withWorldTx("kfix", SID, scope, (tx) => tx.claimWorldEvents(TABLE), worldDeps), [], "检查点未落库 ⇒ 认领 0 行");
        assert.equal((await worldEventStats(conn, TABLE, SID, instance.instanceId)).executable, 0);
        await setCheckpointRev(1);
        // ② 认领 + 效果同一事务；「崩溃」= 事务抛出 ⇒ 回滚，事件仍 pending、余额 0
        await assert.rejects(withWorldTx("kfix", SID, scope, async (tx) => {
            const claimed = await tx.claimWorldEvents(TABLE);
            assert.deepEqual(claimed.map((e) => [e.eventId, e.seq, e.attempts, e.checkpointRev]), [[evt(1), 1, 1, 1]], "只认领门内的 e1");
            for (const event of claimed) await tx.credit(uid, CUR_GOLD, (event.payload as { amount: number }).amount, event.eventId, "world-event", owner);
            throw new Error("simulated crash before commit");
        }, worldDeps), /simulated crash/u);
        assert.deepEqual(await eventRows(), [[evt(1), 0, 0], [evt(2), 0, 0]], "回滚：认领与效果一起撤销");
        assert.equal(await balance(), 0);
        // ③ 重放：认领 + credit 提交 ⇒ done、余额 5；再投递（同 opId）⇒ credit DUP、余额不变、认领 0 行（已 done）
        const first = await withWorldTx("kfix", SID, scope, async (tx) => {
            const claimed = await tx.claimWorldEvents(TABLE, { instanceId: instance.instanceId });
            const results: string[] = [];
            for (const event of claimed) results.push(String(await tx.credit(uid, CUR_GOLD, (event.payload as { amount: number }).amount, event.eventId, "world-event", owner)));
            return { ids: claimed.map((e) => e.eventId), results };
        }, worldDeps);
        assert.deepEqual(first, { ids: [evt(1)], results: ["5"] });
        assert.equal(await balance(), 5);
        assert.deepEqual(await eventRows(), [[evt(1), 1, 1], [evt(2), 0, 0]]);
        const replay = await withWorldTx("kfix", SID, scope, async (tx) => ({
            claimed: (await tx.claimWorldEvents(TABLE)).length,
            dup: await tx.credit(uid, CUR_GOLD, 5, evt(1), "world-event", owner),
        }), worldDeps);
        assert.deepEqual(replay, { claimed: 0, dup: "DUP" }, "重复投递：opId = eventId ⇒ DUP 零副作用");
        assert.equal(await balance(), 5, "0 重复发奖");
        // ④ 检查点 2 落库 ⇒ e2 可认领；worker 事务（真租约）同样有消费口
        await setCheckpointRev(2);
        assert.deepEqual(await presetKitWorkerLeases(conn, [KFIX]), { inserted: ["kit:kfix:grant"], existing: [] });
        const lease = await tryAcquireLease("kit:kfix:grant", "W", 15, pool as never);
        assert.ok(lease);
        const viaWorker = await withKitWorkerTx("kfix", "grant", SID, lease, async (tx) => {
            const claimed = await tx.claimWorldEvents(TABLE);
            for (const event of claimed) await tx.credit(uid, CUR_GOLD, (event.payload as { amount: number }).amount, event.eventId, "world-event", owner);
            return claimed.map((e) => e.eventId);
        }, workerDeps);
        assert.deepEqual(viaWorker, [evt(2)]);
        assert.equal(await balance(), 12);
        // ⑤ release：达上限 ⇒ dead 且不再认领；deadLetter 直接死信
        await withWorldTx("kfix", SID, scope, async (tx) => {
            await tx.appendWorldEvent(TABLE, { eventId: evt(3), seq: 3, kind: "grantCurrency", payload: { amount: 1 }, checkpointRev: 2 });
            await tx.appendWorldEvent(TABLE, { eventId: evt(4), seq: 4, kind: "grantCurrency", payload: { amount: 1 }, checkpointRev: 2 });
        }, worldDeps);
        const outcomes: string[] = [];
        for (let attempt = 1; attempt <= WORLD_EVENT_MAX_ATTEMPTS; attempt += 1) {
            outcomes.push(await withWorldTx("kfix", SID, scope, async (tx) => {
                const claimed = await tx.claimWorldEvents(TABLE, { limit: 1 });
                assert.equal(claimed[0]?.eventId, evt(3));
                assert.equal(claimed[0]?.attempts, attempt);
                return tx.releaseWorldEvent(TABLE, evt(3));
            }, worldDeps));
        }
        assert.deepEqual(outcomes, [...Array(WORLD_EVENT_MAX_ATTEMPTS - 1).fill("pending"), "dead"], "第 N 次放回即 dead");
        await withWorldTx("kfix", SID, scope, async (tx) => {
            const claimed = await tx.claimWorldEvents(TABLE);
            assert.deepEqual(claimed.map((e) => e.eventId), [evt(4)], "dead 不再认领");
            await tx.deadLetterWorldEvent(TABLE, evt(4));
            await assert.rejects(tx.releaseWorldEvent(TABLE, evt(4)), /不在本事务认领态/u);
        }, worldDeps);
        assert.deepEqual(await eventRows(), [[evt(1), 1, 1], [evt(2), 1, 1], [evt(3), 2, WORLD_EVENT_MAX_ATTEMPTS], [evt(4), 2, 1]]);
        // ⑥ Recovering superseded：e5 属未落库的检查点 3（模拟绕过同事务规则的残留）；恢复点 rev 2 ⇒ 标 3，此后不可认领
        await withWorldTx("kfix", SID, scope, async (tx) => {
            await tx.appendWorldEvent(TABLE, { eventId: evt(5), seq: 5, kind: "grantCurrency", payload: { amount: 1 }, checkpointRev: 3 });
        }, worldDeps);
        assert.equal(await supersedeWorldEvents(conn, TABLE, SID, instance.instanceId, 2), 1);
        assert.equal(await supersedeWorldEvents(conn, TABLE, SID, instance.instanceId, 2), 0, "幂等");
        await setCheckpointRev(3);
        assert.deepEqual(await withWorldTx("kfix", SID, scope, (tx) => tx.claimWorldEvents(TABLE), worldDeps), [], "superseded 永不认领");
        const stats = await worldEventStats(conn, TABLE, SID, instance.instanceId);
        assert.deepEqual(stats, { pending: 0, done: 2, dead: 2, superseded: 1, executable: 0 });
        assert.equal(WORLD_EVENT_STATUS.Superseded, 3);
        assert.equal(await balance(), 12, "死信 / superseded 不发奖");
    } finally {
        await pool.end();
        await conn.end();
    }
});
