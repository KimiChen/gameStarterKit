/**
 * P7 联合验证：**同一份客户端代码**分别连接旧 `apps/server`（Colyseus）与新
 * `apps/serverNew`（原生 WebSocket Lobby），并在同一进程内让两条链并存。
 *
 * 与既有证据的分工：
 *  - `apps/serverNew/server/scripts/verify/native-lobby-live.cjs` 用**裸 ws** 只打新链，
 *    证明服务端侧协议正确；本脚本不重复它。
 *  - `apps/client/test/lobbyTransportHub.test.ts` 用假 socket 覆盖选择点的单元行为；
 *    本脚本把它放到**两个真实服务进程**上跑。
 * 本脚本要回答的是单元测试与单链脚本都答不了的那个问题：同一个客户端进程里，
 * 旧通道与新通道能不能各自连上、各自正确，并且互不串扰。
 *
 * ⛔ 不使用任何假 socket：旧链走客户端自己的 `WebSocketClient`（配仓内 Colyseus UMD），
 * 新链走客户端自己的 `NativeLobbyTransport`/`LobbyTransportHub`。两条链都是真连。
 *
 * 前置：旧 dev-stack 已启动（`cd apps/server && npm run stack`，redis 6401/6402 + MySQL 3316）。
 * 两个服务进程都由本脚本自己 fork，退出时一并回收。
 *
 * 用法（仓库根）：
 *   npm run verify:dual-lobby
 * 退出码 0 = 全部场景通过。
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(HERE, "..", "..");
const APPS_ROOT = path.resolve(CLIENT_ROOT, "..");
const OLD_SERVER_ROOT = path.join(APPS_ROOT, "server");
const NEW_SERVER_ROOT = process.env.DUAL_LOBBY_NATIVE_ROOT
    ? path.resolve(process.env.DUAL_LOBBY_NATIVE_ROOT)
    : path.join(APPS_ROOT, "serverNew", "server");
const require_ = createRequire(import.meta.url);

const RUN_ID = `${Date.now().toString(36)}`;

/**
 * 未处理拒绝/未捕获异常一律记录并在末尾判失败。
 *
 * ⛔ 不要只 console.log 了事：这个进程里跑的正是「断线 + 重连 + 幂等重放」这些最容易留下
 * 悬空 Promise 的路径。静默吞掉它们，等于把最需要看见的故障类型变成绿灯。
 */
const harnessFaults: string[] = [];
const describeFault = (label: string, error: unknown): string => {
    const name = (error as Error)?.name ?? typeof error;
    const message = (error as Error)?.message ?? String(error);
    const site = ((error as Error)?.stack ?? "").split("\n").slice(1, 4).join(" | ").trim();
    return `${label}: ${name}: ${message}${site ? `  \u2190 ${site}` : ""}`;
};
process.on("unhandledRejection", (reason) => {
    harnessFaults.push(describeFault("unhandledRejection", reason));
});
process.on("uncaughtException", (error) => {
    harnessFaults.push(describeFault("uncaughtException", error));
});
/** 与子进程继承的连接配置一致；未指定时使用旧 dev-stack 的默认端口。 */
const STACK_ENDPOINTS = [
    [process.env.REDIS_DURABLE_URL ?? "redis://127.0.0.1:6401", 6379, "旧 durable Redis"],
    [process.env.REDIS_CACHE_URL ?? "redis://127.0.0.1:6402", 6379, "旧 cache Redis"],
    [process.env.MYSQL_URL ?? "mysql://127.0.0.1:3316", 3306, "旧 MySQL"],
] as const;
/** 新线路 fixture 固定绑定的两个端口（`config/platforms/bearjoylive/platform.json5`）。 */
const NEW_CLIENT_PORT = 18090;
const NEW_INTERNAL_PORT = 28090;
const NEW_SID = 1;
/** 旧服务的 dev 目录把整服暴露成 serverId=0（`http/_support/devPublic.ts`）。 */
const OLD_SID = 0;
/** 新旧两链的生产公会目录都是固定集合 {1,2,3,4}，取同一个值便于对称比较。 */
const GUILD_ID = 4;

// ---------------------------------------------------------------- 断言与结果收集

interface Result {
    name: string;
    ok: boolean;
    detail: string;
    ms: number;
}

const results: Result[] = [];

function fail(message: string): never {
    throw new Error(message);
}

function check(condition: unknown, message: string): void {
    if (!condition) fail(message);
}

function equal(actual: unknown, expected: unknown, label: string): void {
    if (actual !== expected) {
        fail(`${label}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    }
}

async function scenario(name: string, fn: () => Promise<string | void> | string | void): Promise<void> {
    const started = Date.now();
    try {
        const detail = await fn();
        results.push({ name, ok: true, detail: detail ?? "", ms: Date.now() - started });
        console.log(`  \u2714 ${name}${detail ? `  \u2014 ${detail}` : ""}`);
    } catch (error) {
        // 失败明细必须自带异常名与调用点：`Error('')` 这类空消息会把真正的原因吞掉，
        // 只留一个看不懂的 `— `（实测踩到过）。有栈才定位得到是哪一次等待/断言。
        const errorName = (error as Error)?.name ?? typeof error;
        const message = (error as Error)?.message ?? String(error);
        const stack = ((error as Error)?.stack ?? "").split("\n").slice(1, 4).join(" | ").trim();
        const detail = `${errorName}: ${message}${stack ? `  \u2190 ${stack}` : ""}`;
        results.push({ name, ok: false, detail, ms: Date.now() - started });
        console.log(`  \u2718 ${name}  \u2014 ${detail}`);
    }
}

// ---------------------------------------------------------------- 平台桩（唯一非真实件）

/**
 * 新链的 WebPlatform 身份服务桩。路径取自**契约**（`generated/lobby-contract`），
 * ⛔ 不手写字符串——手写会让桩与契约各自漂移而测试仍然绿。
 */
class StubWebPlatform {
    private readonly sessions = new Map<string, { userId: string; valid: boolean; reason: string }>();
    private server: http.Server | undefined;
    origin = "";

    issue(token: string, serverId: number, userId: string): void {
        this.sessions.set(`${serverId}:${token}`, { userId, valid: true, reason: "NOT_FOUND" });
    }

    async start(): Promise<void> {
        const server = http.createServer((request, response) => void this.handle(request, response));
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        this.server = server;
        const address = server.address();
        this.origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    }

    async stop(): Promise<void> {
        const server = this.server;
        this.server = undefined;
        if (!server) return;
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk as Buffer));
        const map = (require_(path.join(NEW_SERVER_ROOT, "generated/lobby-contract/protocol/http")) as {
            WebPlatformHttpContractMap: {
                VerifySession: { method: string; path: string };
                RegisterCharacter: { method: string; path: string };
            };
        }).WebPlatformHttpContractMap;

        if (request.method === map.VerifySession.method && request.url === map.VerifySession.path) {
            const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                serverId: number;
                accessToken: string;
            };
            const session = this.sessions.get(`${payload.serverId}:${payload.accessToken}`);
            this.reply(
                response,
                session && session.valid === true
                    ? { valid: true, userId: session.userId, issuedAtMs: 1000 }
                    : { valid: false, reason: session?.reason ?? "NOT_FOUND" },
            );
            return;
        }
        if (
            request.method === map.RegisterCharacter.method &&
            /^\/v1\/internal\/characters\/[^/]+\/\d+$/.test(request.url ?? "")
        ) {
            this.reply(response, { registered: true });
            return;
        }
        response.writeHead(404, { "content-type": "application/json" });
        response.end("{}");
    }

    private reply(response: http.ServerResponse, payload: unknown): void {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
    }
}

// ---------------------------------------------------------------- 进程与端口

async function freePort(): Promise<number> {
    const probe = net.createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
    const address = probe.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
    return port;
}

async function assertPortFree(port: number, label: string): Promise<void> {
    const probe = net.createServer();
    try {
        await new Promise<void>((resolve, reject) => {
            probe.once("error", reject);
            probe.listen(port, "127.0.0.1", () => resolve());
        });
    } catch (error) {
        fail(`${label} 端口 ${port} 已被占用：${(error as Error).message}`);
    }
    await new Promise<void>((resolve) => probe.close(() => resolve()));
}

async function tcpReachable(port: number, host = "127.0.0.1"): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const socket = net.connect({ port, host });
        const done = (ok: boolean) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(ok);
        };
        socket.once("connect", () => done(true));
        socket.once("error", () => done(false));
        socket.setTimeout(1500, () => done(false));
    });
}

interface ServerHandle {
    child: ChildProcess;
    tail: string[];
    logPath: string;
}

function startProcess(label: string, command: string, args: string[], cwd: string, env: Record<string, string>): ServerHandle {
    const logDir = path.join(CLIENT_ROOT, "log", "verify");
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `dual-lobby.${label}.${RUN_ID}.log`);
    const stream = fs.createWriteStream(logPath, { flags: "a" });
    const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const tail: string[] = [];
    const mirror = (chunk: Buffer) => {
        stream.write(chunk);
        for (const line of String(chunk).split("\n")) {
            if (!line.trim()) continue;
            tail.push(line);
            if (tail.length > 60) tail.shift();
        }
    };
    child.stdout?.on("data", mirror);
    child.stderr?.on("data", mirror);
    return { child, tail, logPath };
}

async function stopProcess(handle: ServerHandle | undefined): Promise<void> {
    if (!handle || handle.child.exitCode !== null) return;
    handle.child.kill("SIGTERM");
    const deadline = Date.now() + 8000;
    while (handle.child.exitCode === null && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (handle.child.exitCode === null) handle.child.kill("SIGKILL");
}

async function waitForOldServer(port: number, server: ServerHandle, devKey: string): Promise<void> {
    const deadline = Date.now() + 90_000;
    let lastError = "未开始";
    while (Date.now() < deadline) {
        if (server.child.exitCode !== null) {
            fail(`旧服务提前退出（code=${server.child.exitCode}），日志尾部：\n${server.tail.slice(-25).join("\n")}`);
        }
        try {
            const response = await fetch(`http://127.0.0.1:${port}/v1/sessions/dev`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ devKey, serverId: OLD_SID }),
            });
            if (response.status === 200) return;
            lastError = `dev 登录返回 ${response.status}`;
        } catch (error) {
            lastError = (error as Error).message;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    fail(
        `等待旧服务就绪超时，最后错误：${lastError}\n日志尾部：\n${server.tail.slice(-25).join("\n")}`,
    );
}

// ---------------------------------------------------------------- 客户端模块装载

/** 旧通道的 SDK 是仓内 UMD（Cocos 里以插件加载）；无头环境把它挂到全局即可，⛔ 不换实现。 */
function installColyseusUmd(): string {
    const file = path.join(CLIENT_ROOT, "src", "lib", "colyseus", "colyseus.js");
    const source = fs.readFileSync(file, "utf8");
    const module_ = { exports: {} as Record<string, unknown> };
    new Function("module", "exports", source)(module_, module_.exports);
    (globalThis as Record<string, unknown>).Colyseus = module_.exports;
    const version = /colyseus\.js@([\d.]+)/.exec(source);
    return version ? version[1]! : "unknown";
}

const clientModule = (relative: string): string => new URL(`../../src/${relative}`, import.meta.url).href;

// ---------------------------------------------------------------- 主流程

async function main(): Promise<void> {
    console.log(`双链联合验证：run=${RUN_ID}`);

    for (const [connectionUrl, defaultPort, label] of STACK_ENDPOINTS) {
        const endpoint = new URL(connectionUrl);
        const port = Number(endpoint.port || defaultPort);
        if (!(await tcpReachable(port, endpoint.hostname))) {
            fail(`前置不成立：${label} (${endpoint.hostname}:${port}) 不可达。请启动所配置的测试栈；默认栈使用 cd apps/server && npm run stack`);
        }
    }

    const colyseusVersion = installColyseusUmd();
    const { WebSocketClient } = (await import(clientModule("net/WebSocketClient.ts"))) as {
        WebSocketClient: typeof import("../../src/net/WebSocketClient").WebSocketClient;
    };
    const { LobbyTransportHub } = (await import(clientModule("net/LobbyTransportHub.ts"))) as {
        LobbyTransportHub: typeof import("../../src/net/LobbyTransportHub").LobbyTransportHub;
    };
    const { LobbyPush } = (await import(clientModule("shared/index.ts"))) as {
        LobbyPush: typeof import("../../src/shared/index").LobbyPush;
    };
    const { RoomClient } = (await import(clientModule("net/RoomClient.ts"))) as {
        RoomClient: typeof import("../../src/net/RoomClient").RoomClient;
    };
    const { createIdleRoomAdapter } = (await import(clientModule("net/rooms/GameRoomTransport.ts"))) as {
        createIdleRoomAdapter: typeof import("../../src/net/rooms/GameRoomTransport").createIdleRoomAdapter;
    };
    const { gameRoomModeVersion, DEFAULT_GAME_ROOM_PROFILE } = (await import(clientModule("net/rooms/matchmaking.ts"))) as {
        gameRoomModeVersion: typeof import("../../src/net/rooms/matchmaking").gameRoomModeVersion;
        DEFAULT_GAME_ROOM_PROFILE: typeof import("../../src/net/rooms/matchmaking").DEFAULT_GAME_ROOM_PROFILE;
    };

    const oldPort = await freePort();
    const nativePort = await freePort();
    await assertPortFree(NEW_CLIENT_PORT, "新线路客户端端口");
    await assertPortFree(NEW_INTERNAL_PORT, "新线路内网 HTTP");

    const platform = new StubWebPlatform();
    await platform.start();

    let oldServer: ServerHandle | undefined;
    let newServer: ServerHandle | undefined;

    const login = async (devKey: string): Promise<{ token: string; userId: string }> => {
        const response = await fetch(`http://127.0.0.1:${oldPort}/v1/sessions/dev`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ devKey, serverId: OLD_SID }),
        });
        check(response.status === 200, `旧服务 dev 登录应 200，实际 ${response.status}`);
        const body = (await response.json()) as { accessToken: string; userId: string };
        return { token: body.accessToken, userId: body.userId };
    };

    try {
        console.log(`  启动旧 apps/server…`);
        oldServer = startProcess(
            "old",
            process.execPath,
            ["--import", "tsx", "src/index.ts"],
            OLD_SERVER_ROOT,
            {
                PORT: String(oldPort),
                NODE_ENV: "development",
                AUTH_PROVIDER: "dev",
                CODEBUDDY_SAFE_DELETE_ENABLED: "0",
            },
        );
        await waitForOldServer(oldPort, oldServer, `dual-warmup-${RUN_ID}`);
        console.log(`  旧服务就绪：ws://127.0.0.1:${oldPort}（日志 ${oldServer.logPath}）`);

        console.log(`  启动新 apps/serverNew…`);
        newServer = startProcess(
            "new",
            process.execPath,
            [path.join("deploy", "dev", "entrypoint.cjs"), "-p", "bearjoy", "-v", "live", "--sid", String(NEW_SID)],
            NEW_SERVER_ROOT,
            {
                NATIVE_LOBBY_HOST: "127.0.0.1",
                NATIVE_LOBBY_PORT: String(nativePort),
                WEBPLATFORM_INTERNAL_ORIGIN: platform.origin,
                WEBPLATFORM_SERVICE_ID: "game-dual-check",
                WEBPLATFORM_SERVICE_SECRET: `dual-secret-${RUN_ID}`,
                ALLOY_MULTI_PROCESS_ENABLED: "0",
                CODEBUDDY_SAFE_DELETE_ENABLED: "0",
            },
        );
        const newEndpoint = `ws://127.0.0.1:${nativePort}`;
        await waitForNewServer(newServer, platform, newEndpoint);
        console.log(`  新服务就绪：${newEndpoint}（日志 ${newServer.logPath}）`);

        // ------------------------------------------------------------ 场景

        const hub = new LobbyTransportHub();
        const oldUrl = `ws://127.0.0.1:${oldPort}`;

        /**
         * 每个场景前把两条链都归零。
         *
         * ⛔ 不是可选的洁癖：`WebSocketClient` 是单例，`LobbyTransportHub.configure` 又要求
         * 「切换前必须先释放当前连接」。任一场景在中途失败而没走完 `leave()`，残留连接会把
         * **后续所有场景**变成同一条 `必须先释放当前连接` 的假失败——真实故障被这条噪音掩盖。
         */
        const resetTransports = async (): Promise<void> => {
            try {
                await hub.current.leave();
            } catch {
                /* 已经断开 */
            }
            try {
                await WebSocketClient.inst.leave();
            } catch {
                /* 已经断开 */
            }
            try {
                hub.configure({ kind: "colyseus" });
            } catch {
                /* 归零失败留给场景自身报错 */
            }
        };
        const run = async (name: string, fn: () => Promise<string | void> | string | void): Promise<void> => {
            await resetTransports();
            await scenario(name, fn);
        };

        await run("默认配置保持旧通道：未显式配置时连旧 apps/server 并完成鉴权与查询", async () => {
            equal(hub.currentConfig.kind, "colyseus", "未配置时的默认通道");
            equal(hub.current, WebSocketClient.inst, "默认通道必须是旧 WebSocketClient 单例");
            const session = await login(`dual-default-${RUN_ID}`);
            await hub.connect({ serverId: OLD_SID, gameWsUrl: oldUrl }, session.token);
            equal(hub.current.getConnectionState().state, "ready", "旧通道连接状态");
            const info = (await hub.current.rpc("user.getInfo", {} as never)) as { user: { uid: string } };
            equal(info.user.uid, session.userId, "旧通道 user.getInfo 的 uid");
            await hub.current.leave();
            equal(hub.current.getConnectionState().state, "idle", "释放后的连接状态");
            return `uid=${session.userId} 来自真实旧服务存储`;
        });

        await run("旧通道幂等写：guild.join 同 clientReqId 重放只生效一次，且收到领域推送", async () => {
            const session = await login(`dual-old-idem-${RUN_ID}`);
            await hub.connect({ serverId: OLD_SID, gameWsUrl: oldUrl }, session.token);
            const pushes: Array<{ seq: number; guildId: number }> = [];
            hub.current.onPush(LobbyPush.GuildEvent, (data) => {
                pushes.push(data as { seq: number; guildId: number });
            });
            const clientReqId = `dual-${RUN_ID}-old`;
            const first = (await hub.current.rpcIdem("guild.join", { guildId: GUILD_ID } as never, clientReqId)) as {
                seq: number;
                guildId: number;
            };
            const replay = (await hub.current.rpcIdem("guild.join", { guildId: GUILD_ID } as never, clientReqId)) as {
                seq: number;
                guildId: number;
            };
            equal(replay.seq, first.seq, "同 clientReqId 重放应返回同一 seq（未产生第二次副作用）");
            const events = (await hub.current.rpc("guild.getEvents", { sinceSeq: 0 } as never)) as {
                guildId: number;
                latestSeq: number;
            };
            equal(events.guildId, GUILD_ID, "旧通道入会后的 guildId");
            equal(events.latestSeq, first.seq, "旧通道事件流水位应与入会 seq 一致");
            await waitFor(() => pushes.length >= 1, 5000, "旧通道领域推送");
            equal(pushes[0]!.guildId, GUILD_ID, "推送的 guildId");
            equal(pushes[0]!.seq, first.seq, "推送的 seq 应与回包一致");
            await hub.current.leave();
            return `seq=${first.seq}，推送 ${pushes.length} 条`;
        });

        await run("旧通道断线：硬关底层连接后状态离开 ready，且后续 RPC 立即拒绝", async () => {
            const session = await login(`dual-old-drop-${RUN_ID}`);
            await hub.connect({ serverId: OLD_SID, gameWsUrl: oldUrl }, session.token);
            equal(hub.current.getConnectionState().state, "ready", "断线前的连接状态");
            const room = (WebSocketClient.inst as unknown as { room: { connection?: { close(): void } } | null }).room;
            check(room, "旧通道应暴露已加入的 room");
            check(typeof room.connection?.close === "function", "旧通道 room 应暴露底层 connection");
            room.connection!.close();
            await waitFor(
                () => hub.current.getConnectionState().state !== "ready",
                8000,
                "旧通道硬断线后离开 ready",
            );
            let rejected = false;
            try {
                await hub.current.rpc("user.getInfo", {} as never);
            } catch {
                rejected = true;
            }
            check(rejected, "断线后旧通道 RPC 必须立即拒绝，而不是挂起等超时");
            await hub.current.leave();
            return `断线后状态=${hub.current.getConnectionState().state}`;
        });

        await run("旧通道重连：硬断线后 SDK 自动重连回到 ready，且身份与请求能力保持", async () => {
            const session = await login(`dual-old-reconnect-${RUN_ID}`);
            await hub.connect({ serverId: OLD_SID, gameWsUrl: oldUrl }, session.token);
            equal(hub.current.getConnectionState().state, "ready", "重连前的连接状态");
            const room = (WebSocketClient.inst as unknown as { room: { connection?: { close(): void } } | null }).room;
            check(typeof room?.connection?.close === "function", "旧通道 room 应暴露底层 connection");
            // Colyseus SDK 的自动重连要求房间已存活 ≥ `min uptime`（默认 5000ms）。不过这个门槛就断，
            // 测到的是 SDK 的「不允许重连」而不是重连本身——必须等够，否则这是一条假绿灯。
            let phase = "sleep";
            const started = Date.now();
            const timeline: string[] = [];
            const off = hub.current.subscribeConnection((event) => {
                timeline.push(`${Date.now() - started}ms:${event.kind}${"reason" in event ? `/${event.reason}` : ""}`);
            });
            try {
                await new Promise((resolve) => setTimeout(resolve, 5500));
                phase = "close";
                room!.connection!.close();
                // ⛔ 不能直接等「state === ready」：`close()` 到 `dropped` 事件之间有实测约 6ms 的
                // 传播窗口，谓词在这个窗口里**已经为真**，waitFor 会立刻返回，随后的请求就正好撞在
                // 断线处理器上被判 CONN_LOST——那测到的是竞态，不是重连。必须先看到断线，再等回来。
                phase = "wait-dropped";
                await waitFor(
                    () => hub.current.getConnectionState().state !== "ready",
                    8000,
                    "硬断线事件到达客户端",
                );
                phase = "wait-ready";
                await waitFor(
                    () => hub.current.getConnectionState().state === "ready",
                    20_000,
                    "旧通道自动重连回到 ready",
                );
                phase = "rpc";
                const info = (await hub.current.rpc("user.getInfo", {} as never)) as { user: { uid: string } };
                equal(info.user.uid, session.userId, "重连后的身份应与断线前一致");
                await hub.current.leave();
                return `重连后 uid=${info.user.uid}`;
            } catch (error) {
                // 保留原始异常为 cause，同时把「卡在哪一步」和状态迁移时序一起带出来：
                // 这一项曾因为只打印空消息的 RpcError 而完全不可诊断。
                throw new Error(
                    `phase=${phase} :: ${(error as Error)?.name}: ${(error as Error)?.message} :: 事件时序 ${timeline.join(" -> ")}`,
                    { cause: error },
                );
            } finally {
                off();
            }
        });

        await run("显式新配置：native-websocket 只读显式端点，完成鉴权、查询、幂等写与领域推送", async () => {
            hub.configure({ kind: "native-websocket", endpoint: newEndpoint });
            const token = `dual-new-${RUN_ID}`;
            const uid = `dual-new-uid-${RUN_ID}`;
            platform.issue(token, NEW_SID, uid);
            // 刻意给一个**不存在的** gameWsUrl：新通道必须只用显式端点，读了旧目录就会连到黑洞。
            await hub.connect({ serverId: NEW_SID, gameWsUrl: "ws://127.0.0.1:1" }, token);
            equal(hub.current.getConnectionState().state, "ready", "新通道连接状态");
            const info = (await hub.current.rpc("user.getInfo", {} as never)) as { user: { uid: string } };
            equal(info.user.uid, uid, "新通道 user.getInfo 的 uid");

            const pushes: Array<{ seq: number; guildId: number }> = [];
            hub.current.onPush(LobbyPush.GuildEvent, (data) => {
                pushes.push(data as { seq: number; guildId: number });
            });
            const clientReqId = `dual-${RUN_ID}-new`;
            const first = (await hub.current.rpcIdem("guild.join", { guildId: GUILD_ID } as never, clientReqId)) as {
                seq: number;
            };
            const replay = (await hub.current.rpcIdem("guild.join", { guildId: GUILD_ID } as never, clientReqId)) as {
                seq: number;
            };
            equal(replay.seq, first.seq, "新通道同 clientReqId 重放应返回同一 seq");
            await waitFor(() => pushes.length >= 1, 5000, "新通道领域推送");
            equal(pushes[0]!.seq, first.seq, "新通道推送的 seq 应与回包一致");
            await hub.current.leave();
            return `uid=${uid}，seq=${first.seq}，推送 ${pushes.length} 条`;
        });

        await run("非法配置被拒，且拒绝后当前通道与配置都不变", async () => {
            hub.configure({ kind: "colyseus" });
            const rejected: unknown[] = [
                undefined,
                null,
                "colyseus",
                [],
                {},
                { kind: "colyseus", endpoint: "wss://x" },
                { kind: "native-websocket" },
                { kind: "native-websocket", endpoint: "http://x" },
                { kind: "native-websocket", endpoint: "wss://x/path" },
                { kind: "unknown" },
            ];
            for (const input of rejected) {
                let threw = false;
                try {
                    hub.configure(input);
                } catch {
                    threw = true;
                }
                check(threw, `必须拒绝非法配置：${JSON.stringify(input)}`);
                equal(hub.currentConfig.kind, "colyseus", `拒绝 ${JSON.stringify(input)} 后的通道`);
                equal(hub.current, WebSocketClient.inst, `拒绝 ${JSON.stringify(input)} 后的实现`);
            }
            return `拒绝 ${rejected.length} 种非法输入`;
        });

        await run("已有连接时拒绝切换通道，释放后才允许切换", async () => {
            hub.configure({ kind: "native-websocket", endpoint: newEndpoint });
            const token = `dual-switch-${RUN_ID}`;
            platform.issue(token, NEW_SID, `dual-switch-uid-${RUN_ID}`);
            await hub.connect({ serverId: NEW_SID, gameWsUrl: "ws://127.0.0.1:1" }, token);
            equal(hub.current.getConnectionState().state, "ready", "切换前的连接状态");
            let threw = false;
            try {
                hub.configure({ kind: "colyseus" });
            } catch (error) {
                threw = true;
                check(
                    /必须先释放当前连接/.test((error as Error).message),
                    `拒绝原因应是「必须先释放当前连接」，实际：${(error as Error).message}`,
                );
            }
            check(threw, "有连接时切换通道必须被拒");
            equal(hub.currentConfig.kind, "native-websocket", "被拒后配置不得改动");
            await hub.current.leave();
            hub.configure({ kind: "colyseus" });
            equal(hub.current, WebSocketClient.inst, "释放后应允许切回旧通道");
            return "连接中被拒、释放后放行";
        });

        await run("双通道共存：同一进程同时保持旧 Colyseus 与新原生连接，互不串扰", async () => {
            const oldSession = await login(`dual-coexist-old-${RUN_ID}`);
            const newToken = `dual-coexist-new-${RUN_ID}`;
            const newUid = `dual-coexist-uid-${RUN_ID}`;
            platform.issue(newToken, NEW_SID, newUid);

            // 顺序有讲究：hub 是应用**唯一**的 Lobby 通道选择点，它的「切换前必须先释放当前连接」
            // 闸管的是**切换**。这里要的是两条链**并存**（验证用配置），所以先把 hub 钉到新通道
            // （此刻空闲），再绕过 hub 直接持有旧单例——⛔ 不要反过来：先连旧单例会让 hub 认为
            // 「有连接时想切换」而被正确拒绝，那时失败的是场景设计而不是产品行为。
            hub.configure({ kind: "native-websocket", endpoint: newEndpoint });
            WebSocketClient.inst.init(oldUrl);
            await WebSocketClient.inst.join(oldSession.token, { sId: OLD_SID });
            await hub.connect({ serverId: NEW_SID, gameWsUrl: "ws://127.0.0.1:1" }, newToken);

            equal(WebSocketClient.inst.getConnectionState().state, "ready", "共存时旧通道状态");
            equal(hub.current.getConnectionState().state, "ready", "共存时新通道状态");

            const [oldInfo, newInfo] = await Promise.all([
                WebSocketClient.inst.rpc("user.getInfo", {} as never) as Promise<{ user: { uid: string } }>,
                hub.current.rpc("user.getInfo", {} as never) as Promise<{ user: { uid: string } }>,
            ]);
            equal(oldInfo.user.uid, oldSession.userId, "共存时旧通道身份");
            equal(newInfo.user.uid, newUid, "共存时新通道身份");
            check(oldInfo.user.uid !== newInfo.user.uid, "两条链的身份必须互相独立");

            await hub.current.leave();
            await WebSocketClient.inst.leave();
            hub.configure({ kind: "colyseus" });
            return `旧=${oldInfo.user.uid} 新=${newInfo.user.uid}`;
        });

        // GameRoom 只存在于旧服务（新入口目前只到 Lobby），所以本场景是**旧通道回归**：
        // 证明 P6 删除旧协议链后，GameRoom 仍走它自己的端点与 v8 信封，没有被顺手改掉。
        await run("GameRoom 回归（旧通道）：以 v8 信封加入真实 GameRoom，端点与既有协议未变", async () => {
            const session = await login(`dual-gameroom-${RUN_ID}`);
            const adapter = createIdleRoomAdapter();
            RoomClient.inst.init(oldUrl);
            const ownership = RoomClient.inst.joinGame(adapter, {
                token: session.token,
                sId: OLD_SID,
                mode: adapter.mode,
                modeVersion: gameRoomModeVersion(adapter.mode),
                profile: DEFAULT_GAME_ROOM_PROFILE,
            });
            let sessionId = "";
            try {
                const room = await ownership.ready;
                check(room, "GameRoom 应返回已就绪的房间");
                equal(RoomClient.inst.getBattleConnectionState().state, "ready", "GameRoom 连接状态");
                sessionId = RoomClient.inst.sessionId;
                check(sessionId.length > 0, "GameRoom 应持有 sessionId");
            } finally {
                await ownership.leave();
            }
            await waitFor(
                () => RoomClient.inst.getBattleConnectionState().state === "idle",
                8000,
                "GameRoom ownership 释放后回到 idle",
            );
            return `mode=${adapter.mode} modeVersion=${gameRoomModeVersion(adapter.mode)} sessionId=${sessionId}`;
        });
    } finally {
        await stopProcess(newServer);
        await stopProcess(oldServer);
        await platform.stop();
    }

    // ---------------------------------------------------------------- 汇总

    const failed = results.filter((result) => !result.ok);
    console.log(`\n${"=".repeat(72)}`);
    for (const result of results) {
        console.log(`${result.ok ? "\u2714" : "\u2718"} ${result.name}  (${result.ms}ms)`);
        if (!result.ok) console.log(`    ${result.detail}`);
    }
    for (const fault of harnessFaults) console.log(`\u26a0 ${fault}`);
    console.log(`${"=".repeat(72)}`);
    console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
    console.log(`未处理拒绝/未捕获异常：${harnessFaults.length}`);
    console.log(`旧通道 SDK：colyseus.js@${colyseusVersion}（仓内 UMD，未被替换）`);
    if (failed.length > 0 || harnessFaults.length > 0) process.exit(1);
}

async function waitForNewServer(
    server: ServerHandle,
    platform: StubWebPlatform,
    endpoint: string,
): Promise<void> {
    const deadline = Date.now() + 120_000;
    let lastError = "未开始";
    const token = `dual-ready-${RUN_ID}`;
    platform.issue(token, NEW_SID, `dual-ready-uid-${RUN_ID}`);
    while (Date.now() < deadline) {
        if (server.child.exitCode !== null) {
            fail(`新服务提前退出（code=${server.child.exitCode}），日志尾部：\n${server.tail.slice(-25).join("\n")}`);
        }
        try {
            const { NativeLobbyTransport } = (await import(clientModule("net/NativeLobbyTransport.ts"))) as {
                NativeLobbyTransport: typeof import("../../src/net/NativeLobbyTransport").NativeLobbyTransport;
            };
            const transport = new NativeLobbyTransport();
            transport.init(endpoint);
            await transport.join(token, { sId: NEW_SID }, { timeoutMs: 4000 });
            await transport.leave();
            return;
        } catch (error) {
            lastError = (error as Error).message;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    fail(
        `等待新服务就绪超时，最后错误：${lastError}\n日志尾部：\n${server.tail.slice(-25).join("\n")}`,
    );
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    fail(`等待超时：${label}`);
}

main().catch((error) => {
    console.error(`\n联合验证中断：${(error as Error)?.message ?? String(error)}`);
    process.exit(1);
});
