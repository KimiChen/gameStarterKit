/** PS 真进程测试资源：只创建/停止自己的进程，只删除本次随机命名的数据库。 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, mkdtempSync, openSync, readFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Redis } from "ioredis";
import mysql from "mysql2/promise";
import { MYSQL_URL } from "../../src/core/infra/config";

export type SplitRole = "lobby" | "game" | "world";
const ROLES: readonly SplitRole[] = ["lobby", "game", "world"];
const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function eventually(
    predicate: () => boolean | Promise<boolean>, label: string, timeoutMs = 15_000,
): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        if (await predicate()) return;
        await delay(30);
    }
    assert.ok(await predicate(), label);
}

async function ports(count: number): Promise<number[]> {
    // 一起保留到全部分配完成，避免 listen(0) 连续复用同一个端口。
    const servers = Array.from({ length: count }, () => createServer());
    try {
        await Promise.all(servers.map((server) => new Promise<void>((ok, fail) => {
            server.once("error", fail);
            server.listen(0, "127.0.0.1", ok);
        })));
        return servers.map((server) => {
            const address = server.address();
            assert.ok(address && typeof address === "object");
            return address.port;
        });
    } finally {
        await Promise.all(servers.map((server) => new Promise<void>((ok) => server.close(() => ok()))));
    }
}

interface OwnedProcess {
    readonly child: ChildProcess;
    readonly done: Promise<void>;
    readonly log: string;
    error?: Error;
}

function launch(command: string, args: string[], env: NodeJS.ProcessEnv, log: string): OwnedProcess {
    const fd = openSync(log, "w");
    let child: ChildProcess;
    try {
        child = spawn(command, args, { cwd: SERVER_ROOT, env, stdio: ["ignore", fd, fd] });
    } finally {
        closeSync(fd);
    }
    const entry: OwnedProcess = { child, log, done: new Promise<void>((ok) => {
        child.once("exit", () => ok());
        child.once("error", () => ok());
    }) };
    child.once("error", (error) => { entry.error = error; });
    return entry;
}

function assertRunning(entry: OwnedProcess): void {
    if (entry.error) throw entry.error;
    assert.equal(entry.child.exitCode, null, `子进程提前退出：${entry.log}\n${readFileSync(entry.log, "utf8").slice(-6000)}`);
    assert.equal(entry.child.signalCode, null, `子进程被信号终止：${entry.log}`);
}

async function stop(entry: OwnedProcess): Promise<void> {
    if (entry.error || entry.child.exitCode !== null || entry.child.signalCode !== null) return;
    entry.child.kill("SIGTERM");
    const exited = await Promise.race([entry.done.then(() => true), delay(12_000, false, { ref: false })]);
    if (!exited) {
        entry.child.kill("SIGKILL");
        await entry.done;
        throw new Error(`子进程未在 12 秒内正常退出（已终止）：${entry.log}`);
    }
}

/** 不启动 fixture Server；所有角色都是仓库正式入口、实际装配与生产 catalog。 */
export class ProcessSplitStack {
    readonly runId = randomUUID().replace(/-/g, "").slice(0, 12);
    readonly database = `ps_split_${this.runId}`;
    readonly logDir = mkdtempSync(join(tmpdir(), "ps-process-split-"));
    readonly endpoint: Record<SplitRole, string> = { lobby: "", game: "", world: "" };
    readonly nodeId: Record<SplitRole, string> = { lobby: "", game: "", world: "" };
    private readonly owned: OwnedProcess[] = [];
    private redisClient: Redis | null = null;
    private sqlClient: mysql.Connection | null = null;
    private admin: mysql.Connection | null = null;

    get redis(): Redis { assert.ok(this.redisClient); return this.redisClient; }
    get sql(): mysql.Connection { assert.ok(this.sqlClient); return this.sqlClient; }

    async start(): Promise<void> {
        const [redisPort, lobbyPort, gamePort, worldPort] = await ports(4);
        const selected = { lobby: lobbyPort, game: gamePort, world: worldPort };
        for (const role of ROLES) {
            this.endpoint[role] = `ws://127.0.0.1:${selected[role]}`;
            this.nodeId[role] = `ps-${this.runId}-${role}`;
        }
        const mysqlUrl = new URL(MYSQL_URL());
        mysqlUrl.pathname = "/";
        this.admin = await mysql.createConnection(mysqlUrl.toString());
        mysqlUrl.pathname = `/${this.database}`;
        const redisUrl = `redis://127.0.0.1:${redisPort}`;
        const env: NodeJS.ProcessEnv = {
            ...process.env, NODE_ENV: "development", AUTH_PROVIDER: "dev", GROUP_ZONES: "0",
            MYSQL_URL: mysqlUrl.toString(),
            REDIS_DURABLE_URL: `${redisUrl}/0`, REDIS_COORD_URL: `${redisUrl}/0`, REDIS_CACHE_URL: `${redisUrl}/1`,
            REDIS_ROUTE_FILE: "", WORLD_MULTI_PROCESS: "0", REDIS_COLYSEUS_URL: "", WORLD_PUBLIC_ADDRESS: "",
            LOBBY_PORT: String(lobbyPort), GAME_PORT: String(gamePort), WORLD_PORT: String(worldPort),
            LOBBY_PUBLIC_WS_URL: this.endpoint.lobby, GAME_PUBLIC_WS_URL: this.endpoint.game, WORLD_PUBLIC_WS_URL: this.endpoint.world,
            RPC_RATE_CAPACITY: "200", RPC_RATE_REFILL_PER_S: "100", NO_COLOR: "1",
        };
        const redis = launch(process.env.REDIS_SERVER_BIN ?? "redis-server", [
            "--bind", "127.0.0.1", "--port", String(redisPort), "--save", "", "--appendonly", "no",
            "--dir", this.logDir,
        ], env, join(this.logDir, "redis.log"));
        this.owned.push(redis);
        await eventually(async () => {
            assertRunning(redis);
            return new Promise<boolean>((ok) => {
                const socket = createConnection({ host: "127.0.0.1", port: redisPort });
                socket.once("connect", () => { socket.destroy(); ok(true); });
                socket.once("error", () => { socket.destroy(); ok(false); });
            });
        }, "独立 Redis 必须监听");
        this.redisClient = new Redis(`${redisUrl}/0`, { maxRetriesPerRequest: 1 });
        await this.redisClient.ping();

        const bootstrap = launch(process.execPath, ["--import", "tsx", "tools/db-bootstrap.ts"], {
            ...env, PORT: String(lobbyPort), NODE_ID: `ps-${this.runId}-bootstrap`,
        }, join(this.logDir, "db-bootstrap.log"));
        this.owned.push(bootstrap);
        await Promise.race([
            bootstrap.done,
            delay(45_000, undefined, { ref: false }).then(() => { throw new Error(`DB bootstrap 超时：${bootstrap.log}`); }),
        ]);
        if (bootstrap.error) throw bootstrap.error;
        assert.equal(bootstrap.child.exitCode, 0, `DB bootstrap 必须成功：${bootstrap.log}`);
        this.sqlClient = await mysql.createConnection(mysqlUrl.toString());

        await Promise.all(ROLES.map(async (role) => {
            const entry = launch(process.execPath, ["--import", "tsx", `src/entries/${role}.ts`], {
                ...env, PORT: String(selected[role]), NODE_ID: this.nodeId[role],
            }, join(this.logDir, `${role}.log`));
            this.owned.push(entry);
            await eventually(async () => {
                assertRunning(entry);
                try {
                    const response = await fetch(`${this.http(role)}/version`, { signal: AbortSignal.timeout(1000) });
                    return response.ok;
                } catch { return false; }
            }, `${role} 正式入口必须启动：${entry.log}`, 45_000);
        }));
    }

    http(role: SplitRole): string { return this.endpoint[role].replace(/^ws:/, "http:"); }

    async close(): Promise<void> {
        const errors: unknown[] = [];
        // 先停应用，连接/后台循环排空后再删自有库；Redis 留到最后。
        for (const entry of this.owned.slice().reverse()) {
            if (entry.log.endsWith("redis.log")) continue;
            try { await stop(entry); } catch (error) { errors.push(error); }
        }
        try { await this.sqlClient?.end(); } catch (error) { errors.push(error); }
        try {
            if (this.admin) {
                assert.match(this.database, /^ps_split_[a-f0-9]{12}$/);
                await this.admin.query(`DROP DATABASE IF EXISTS \`${this.database}\``);
                const [rows] = await this.admin.query<mysql.RowDataPacket[]>(
                    "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [this.database]);
                assert.equal(rows.length, 0, "测试临时库必须删除");
            }
        } catch (error) { errors.push(error); }
        try { await this.admin?.end(); } catch (error) { errors.push(error); }
        try { await this.redisClient?.quit(); } catch (error) { errors.push(error); }
        for (const entry of this.owned.filter((item) => item.log.endsWith("redis.log"))) {
            try { await stop(entry); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, `PS 测试资源清理失败：${this.logDir}`);
    }
}
