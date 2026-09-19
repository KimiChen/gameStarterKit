/**
 * MMO MF5a-B5 SQL 视图房真栈（真 Server + 真 Redis + @colyseus/sdk + 独立临时 MySQL 库里的 kitfix 表 `k_kitfix_view`；
 * docs/MMO.md §5.4 MF5a「SQL 视图房夹具」/ docs/MMO-PLAN.md MF5a-B5）：
 *  ① 两间 dropIn GameRoom（roster.max=1 ⇒ 第二人开第二房）各自从 SQL 恢复投影与兴趣集；
 *  ② 超视距两会话互不收到；私有字段只到本人、⛔ 不进 enter / update / baseline；baseline checksum 客户端可复算；
 *  ③ SQL 提交（UPDATE 行）后经轮询进入视野 ⇒ enter 恰一次；客户端 resync 请求 ⇒ 只含兴趣集的 baseline。
 * 前置：本地 Redis / MySQL 栈已启动。⚠ int 文件只能单文件串行跑。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import mysql from "mysql2/promise";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    C2S, GAMEPLAY_CATALOG, GAME_ROOM_PROTOCOL_VERSION, RoomName, S2C, wireChecksum,
    type IGameRoomJoinOptions, type IViewFixtureBaselineBegin, type IViewFixtureBaselineChunk, type IViewFixtureBaselineEnd,
    type IViewFixtureEnter, type IViewFixturePrivate,
} from "@game/shared";
import { MYSQL_URL } from "../../src/core/infra/config";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { GameRoom } from "../../src/rooms/GameRoom";
import { gameModeRegistry } from "../../src/rooms/GameMode";
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";
import { applyKitMigrations, verifyKitTableShapes } from "../../tools/kit-migrations";
import { VIEW_FIXTURE_MODE_ID, createViewFixtureMode, type ViewRow, type ViewSource } from "../fixtures/viewFixtureMode";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, "../..");
const baseMysqlUrl = new URL(MYSQL_URL());
const SID = 0;

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

const KITFIX: ServerKitCatalogEntry = {
    id: "kitfix", version: "1.0.0", api: { default: { version: 1, minSupported: 1 } }, modes: [], domains: [], effects: [],
    sqlFiles: ["sql/001-init.sql"], sqlTables: [{ name: "k_kitfix_view", zone: "per-zone" }], userKeys: [], workers: [],
};
const INIT_SQL = `CREATE TABLE k_kitfix_view (
  server_id SMALLINT UNSIGNED NOT NULL,
  entity_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  x         INT NOT NULL,
  y         INT NOT NULL,
  rev       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  owner_uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  note      VARCHAR(256) NOT NULL DEFAULT '',
  note_rev  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`;

interface ViewSqlRow extends mysql.RowDataPacket { entity_id: string; x: number; y: number; rev: number; owner_uid: string | null; note: string; note_rev: number }

const joinOptions = (): IGameRoomJoinOptions =>
    ({ v: GAME_ROOM_PROTOCOL_VERSION, sId: SID, mode: VIEW_FIXTURE_MODE_ID, modeVersion: GAMEPLAY_CATALOG.viewFixture.modeVersion, profile: "dropIn" });

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await sleep(20);
    }
    assert.ok(predicate(), label);
}

type Captured = { readonly type: string; readonly payload: unknown };
function capture(room: SDKRoom): Captured[] {
    const log: Captured[] = [];
    for (const type of [S2C.ViewFixtureEnter, S2C.ViewFixtureUpdate, S2C.ViewFixtureLeave, S2C.ViewFixturePrivate,
        S2C.ViewFixtureBaselineBegin, S2C.ViewFixtureBaselineChunk, S2C.ViewFixtureBaselineEnd]) {
        room.onMessage(type, (payload: unknown) => { log.push({ type, payload }); });
    }
    return log;
}
function lastBaselineItems(log: Captured[]): readonly { readonly id: string }[] {
    const begins = log.filter((entry) => entry.type === S2C.ViewFixtureBaselineBegin).map((entry) => entry.payload as IViewFixtureBaselineBegin);
    const begin = begins[begins.length - 1];
    assert.ok(begin, "应有 baseline");
    const chunks = log.filter((entry) => entry.type === S2C.ViewFixtureBaselineChunk).map((entry) => entry.payload as IViewFixtureBaselineChunk)
        .filter((chunk) => chunk.baselineId === begin.baselineId).sort((left, right) => left.index - right.index);
    const end = log.filter((entry) => entry.type === S2C.ViewFixtureBaselineEnd).map((entry) => entry.payload as IViewFixtureBaselineEnd)
        .find((candidate) => candidate.baselineId === begin.baselineId);
    assert.ok(end, "baseline 以 End 收尾");
    assert.equal(chunks.length, begin.chunkCount);
    const items = chunks.flatMap((chunk) => chunk.items);
    assert.equal(wireChecksum(items), end.checksum, "SDK 侧复算 checksum 通过");
    return items;
}

after(async () => { await closeRedis(); });

test("SQL 视图房真栈：两房各自从 k_kitfix_view 恢复投影；超视距互不收到 / 私有字段零泄露；SQL 提交后 enter；resync ⇒ baseline", { timeout: 90_000 }, async () => {
    await assertRedisUp();
    const dbName = `game_view_${process.pid}_${Date.now().toString(36)}`;
    const admin = await mysql.createConnection(connectionOptions());
    await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARSET utf8mb4`);
    let conn: mysql.Connection | null = null;
    const uidA = testUid("view-a").slice(0, 32);
    const uidB = testUid("view-b").slice(0, 32);
    let unregister: (() => void) | null = null;
    let server: Server | null = null;
    const rooms: SDKRoom[] = [];
    try {
        runBootstrap(dbName);
        conn = await mysql.createConnection(connectionOptions(dbName));
        await applyKitMigrations({ conn, dbName, catalog: [KITFIX], readSqlFile: () => INIT_SQL });
        await verifyKitTableShapes({ conn, dbName, catalog: [KITFIX] });
        await conn.query(
            "INSERT INTO k_kitfix_view (server_id, entity_id, x, y, owner_uid, note) VALUES (?, 'v1', 10, 10, ?, 'secret-a'), (?, 'v2', 900, 900, ?, 'secret-b'), (?, 'v3', 500, 500, NULL, '')",
            [SID, uidA, SID, uidB, SID]);
        const sqlConn = conn;
        const source: ViewSource = {
            async load(): Promise<readonly ViewRow[]> {
                const [rows] = await sqlConn.query<ViewSqlRow[]>(
                    "SELECT entity_id, x, y, rev, owner_uid, note, note_rev FROM k_kitfix_view WHERE server_id = ?", [SID]);
                return rows.map((row) => ({ id: row.entity_id, x: Number(row.x), y: Number(row.y), rev: Number(row.rev), ownerUid: row.owner_uid, note: row.note, noteRev: Number(row.note_rev) }));
            },
        };
        // 每房一个 mode 实例（各自从 SQL 恢复投影与兴趣集）；roster.max=1 ⇒ 第二人开第二房；每 2 tick 轮询 SQL
        unregister = gameModeRegistry.register(VIEW_FIXTURE_MODE_ID, () =>
            createViewFixtureMode({ source, roster: { min: 1, max: 1, autoStart: 1 }, pollTicks: 2 }) as never);
        server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
        server.define(RoomName.Game, GameRoom).filterBy(["sId", "mode", "profile"]);
        await server.listen(0);
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;

        const connect = async (uid: string): Promise<{ room: SDKRoom; log: Captured[] }> => {
            const { token } = await issueSession(uid, null, "", SID);
            const sdk = new SDKClient(endpoint);
            sdk.auth.token = token;
            const room = await sdk.joinOrCreate(RoomName.Game, joinOptions());
            rooms.push(room);
            return { room, log: capture(room) };
        };
        const a = await connect(uidA);
        const b = await connect(uidB);
        assert.notEqual(a.room.roomId, b.room.roomId, "roster.max=1 ⇒ 第二人开第二房");
        assert.ok(matchMaker.getLocalRoomById(a.room.roomId) instanceof GameRoom);
        b.room.send(C2S.ViewFixtureLook, { x: 900, y: 900 });

        await waitFor(() => a.log.some((entry) => entry.type === S2C.ViewFixtureBaselineEnd), "A 收到首发 baseline");
        await waitFor(() => {
            const begins = b.log.filter((entry) => entry.type === S2C.ViewFixtureBaselineEnd).length;
            return begins >= 1 && (() => { try { return lastBaselineItems(b.log).some((item) => item.id === "v2"); } catch { return false; } })();
        }, "B 视口移到 (900,900) 后收到含 v2 的 baseline");
        assert.deepEqual(lastBaselineItems(a.log).map((item) => item.id), ["v1"], "A 的 baseline 只含 A 视野（从 SQL 恢复）");
        assert.deepEqual(lastBaselineItems(b.log).map((item) => item.id), ["v2"], "B 的 baseline 只含 B 视野（第二房独立恢复）");
        await waitFor(() => a.log.some((entry) => entry.type === S2C.ViewFixturePrivate), "A 收到自己的私有流");
        await waitFor(() => b.log.some((entry) => entry.type === S2C.ViewFixturePrivate), "B 收到自己的私有流");
        assert.deepEqual(a.log.filter((entry) => entry.type === S2C.ViewFixturePrivate).map((entry) => (entry.payload as IViewFixturePrivate).note), ["secret-a"]);
        assert.deepEqual(b.log.filter((entry) => entry.type === S2C.ViewFixturePrivate).map((entry) => (entry.payload as IViewFixturePrivate).note), ["secret-b"]);

        // SQL 提交：v3 移入 A 视野 ⇒ 轮询后 A 收到 enter 恰一次；B 不受影响
        await sqlConn.query("UPDATE k_kitfix_view SET x = 40, y = 40, rev = rev + 1 WHERE server_id = ? AND entity_id = 'v3'", [SID]);
        await waitFor(() => a.log.some((entry) => entry.type === S2C.ViewFixtureEnter && (entry.payload as IViewFixtureEnter).entity.id === "v3"), "SQL 提交后 A 收到 v3 enter");
        await sleep(300);
        assert.equal(a.log.filter((entry) => entry.type === S2C.ViewFixtureEnter).length, 1, "enter 恰一次");

        // 客户端 resync ⇒ 只含兴趣集的 baseline（v1 + v3）
        const baselinesBefore = a.log.filter((entry) => entry.type === S2C.ViewFixtureBaselineEnd).length;
        a.room.send(C2S.ViewFixtureResync, {});
        await waitFor(() => a.log.filter((entry) => entry.type === S2C.ViewFixtureBaselineEnd).length > baselinesBefore, "resync ⇒ 新 baseline");
        assert.deepEqual(lastBaselineItems(a.log).map((item) => item.id), ["v1", "v3"]);

        // 零泄露：A 看不到 v2 / secret-b，B 看不到 v1 / v3 / secret-a；非私有流不带 note
        assert.doesNotMatch(JSON.stringify(a.log), /"v2"|secret-b/u);
        assert.doesNotMatch(JSON.stringify(b.log), /"v1"|"v3"|secret-a/u);
        for (const entry of [...a.log, ...b.log]) {
            if (entry.type === S2C.ViewFixturePrivate) continue;
            assert.doesNotMatch(JSON.stringify(entry.payload), /note|secret/u, `${entry.type} 不得携带私有字段`);
        }
    } finally {
        await Promise.allSettled(rooms.filter((room) => room.connection?.isOpen).map((room) => Promise.race([room.leave(true), sleep(2_000)])));
        if (server) await server.gracefullyShutdown(false);
        unregister?.();
        await conn?.end();
        await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await admin.end();
    }
});
