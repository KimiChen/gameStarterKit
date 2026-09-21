/** PS：角色归属与真实生命周期行为；不借用本地 Redis/MySQL。 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import type { Server } from "colyseus";
import { bootstrapProcess, type BootstrapDependencies } from "../src/bootstrapProcess";
import { markFaultPoint } from "./faultMatrix";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

function harness() {
    const events: string[] = [];
    const active = new Set<string>();
    let before: (() => void | Promise<unknown>) | undefined;
    let after: (() => void | Promise<unknown>) | undefined;
    const start = (name: string) => { events.push(`start:${name}`); active.add(name); };
    const stop = async (name: string) => { events.push(`stop:${name}`); active.delete(name); };
    const app = {
        onBeforeShutdown: (callback: typeof before) => { before = callback; },
        onShutdown: (callback: typeof after) => { after = callback; },
        gracefullyShutdown: async (exit: boolean) => {
            assert.equal(exit, false, "失败清理不得调用 process.exit 抹掉原始异常");
            events.push("server-stop");
            await before?.();
            events.push("rooms-disposed");
            await after?.();
        },
    } as unknown as Server;
    const deps: BootstrapDependencies = {
        registerResources: () => { events.push("register-resources"); },
        registerAllRoutes: async () => { events.push("routes-ready"); },
        installLobbyHandlers: () => { events.push("handlers:lobby"); },
        clearLobbyHandlers: () => { events.push("handlers:clear"); },
        startInfraMonitors: () => { start("infra"); return () => stop("infra"); },
        startStreamDepthAlert: () => start("depth"), stopStreamDepthAlert: () => stop("depth"),
        startKickConsumer: () => start("kick"), stopKickConsumer: () => stop("kick"),
        startCharacterRepairWorker: () => start("repair"), stopCharacterRepairWorker: () => stop("repair"),
        startPushConsumer: (scope) => { events.push(`scope:${scope}`); start("push"); },
        stopPushConsumer: () => stop("push"), stopMailWakeLoop: () => stop("mailwake"),
        beginShutdown: () => { events.push("admission-closed"); return 1; },
        clearCharacterReadyFlights: () => { events.push("ready-cancelled"); },
        drainCharacterReadyFlights: async () => { events.push("ready-drained"); },
        drainTasks: async () => { events.push("tasks-drained"); },
        disposeResources: async () => {
            assert.equal(active.size, 0, "连接必须保持到所有消息生产者停止");
            events.push("resources-closed");
        },
        listen: async () => { events.push("listening"); },
        stopServer: async (server) => { await server.gracefullyShutdown(false); },
    };
    return { app, deps, events, active,
        before: () => { assert.ok(before); return before(); },
        after: () => { assert.ok(after); return after(); } };
}

function order(events: readonly string[], first: string, second: string): void {
    assert.ok(events.includes(first), `缺少事件 ${first}: ${events.join(",")}`);
    assert.ok(events.includes(second), `缺少事件 ${second}: ${events.join(",")}`);
    assert.ok(events.indexOf(first) < events.indexOf(second), `${first} 应先于 ${second}`);
}

for (const [role, producers, scope] of [
    ["combined", ["depth", "infra", "kick", "push", "repair"], "all"],
    ["lobby", ["infra", "kick", "push", "repair"], "lobby"],
    ["game", ["depth", "infra"], null],
    ["world", ["infra", "push"], "room"],
] as const) {
    test(`PS ${role}：只启动本角色后台服务，清理残留大厅 handler 后才监听`, async () => {
        const h = harness();
        await bootstrapProcess(h.app, role, 1234, h.deps);
        assert.deepEqual([...h.active].sort(), [...producers]);
        assert.deepEqual(h.events.filter((event) => event.startsWith("scope:")), scope ? [`scope:${scope}`] : []);
        if (role === "combined" || role === "lobby") {
            order(h.events, "routes-ready", "handlers:lobby");
            order(h.events, "handlers:lobby", "start:kick");
            assert.equal(h.events.includes("handlers:clear"), false);
        } else {
            order(h.events, "handlers:clear", "listening");
            assert.equal(h.events.includes("routes-ready"), false);
            assert.equal(h.events.includes("handlers:lobby"), false);
        }
        await h.before();
        assert.equal(h.active.size, 0);
        assert.equal(h.events.includes("resources-closed"), false, "before 不得在 Colyseus 排房前关连接");
        await h.after();
        assert.equal(h.events.filter((event) => event === "resources-closed").length, 1);
    });
}

test("PS shutdown：异步 producer 真正结束后才允许排房，房间结束后才排任务和连接", async () => {
    const h = harness();
    const gate = deferred();
    h.deps.startInfraMonitors = () => {
        h.active.add("infra");
        return async () => {
            h.events.push("infra-stopping");
            await gate.promise;
            h.active.delete("infra");
            h.events.push("infra-stopped");
        };
    };
    await bootstrapProcess(h.app, "combined", 1234, h.deps);
    let completed = false;
    const stopping = Promise.resolve(h.before()).then(() => { completed = true; });
    assert.equal(h.events.includes("admission-closed"), true, "准入必须同步封闭");
    assert.equal(h.events.includes("ready-cancelled"), true);
    await Promise.resolve();
    assert.equal(completed, false, "before callback 必须等待 producer 的异步 stop");
    assert.equal(h.events.includes("resources-closed"), false);
    gate.resolve();
    await stopping;
    assert.equal(h.active.size, 0);
    h.events.push("rooms-disposed");
    await h.after();
    await h.after();
    order(h.events, "infra-stopped", "rooms-disposed");
    order(h.events, "rooms-disposed", "ready-drained");
    order(h.events, "ready-drained", "tasks-drained");
    order(h.events, "tasks-drained", "resources-closed");
    assert.equal(h.events.filter((event) => event === "resources-closed").length, 1, "重复回调不得二次关资源");
});

for (const failureAt of ["routes", "producer", "listen"] as const) {
    test(`PS ${failureAt} 启动失败：清理已启动 producer / Server / 连接，并保留最初异常`, async () => {
        const h = harness();
        const fault = new Error(`startup-${failureAt}`);
        if (failureAt === "routes") h.deps.registerAllRoutes = async () => { throw fault; };
        if (failureAt === "producer") h.deps.startCharacterRepairWorker = () => { throw fault; };
        if (failureAt === "listen") h.deps.listen = async () => { throw fault; };
        await assert.rejects(bootstrapProcess(h.app, "combined", 1234, h.deps), (error) => error === fault);
        assert.equal(h.active.size, 0);
        order(h.events, "admission-closed", "server-stop");
        for (const event of h.events.filter((event) => event.startsWith("stop:"))) order(h.events, event, "server-stop");
        order(h.events, "rooms-disposed", "resources-closed");
        assert.equal(h.events.filter((event) => event === "resources-closed").length, 1,
            "listen 失败的 onShutdown 和 catch 共享同一次清理");
        markFaultPoint("process-startup-half-failure");
    });
}

test("PS 失败清理：单个 producer / Server / drain 抛错仍关闭其余资源，不替换启动异常", async () => {
    const h = harness();
    const original = new Error("listen failed");
    h.deps.listen = async () => { throw original; };
    h.deps.stopKickConsumer = async () => { h.active.delete("kick"); throw new Error("kick stop failed"); };
    h.deps.stopServer = async () => { h.events.push("server-stop-failed"); throw new Error("server stop failed"); };
    h.deps.drainCharacterReadyFlights = async () => { throw new Error("ready drain failed"); };
    const logs: unknown[] = [];
    const previous = console.error;
    console.error = (...args) => { logs.push(args); };
    try {
        await assert.rejects(bootstrapProcess(h.app, "combined", 1234, h.deps), (error) => error === original);
    } finally {
        console.error = previous;
    }
    assert.equal(h.active.size, 0);
    assert.equal(h.events.includes("resources-closed"), true);
    order(h.events, "server-stop-failed", "tasks-drained");
    order(h.events, "tasks-drained", "resources-closed");
    assert.equal(logs.length, 3, "清理失败必须被观察并逐项继续");
    markFaultPoint("process-cleanup-failure");
});

for (const scenario of ["normal", "after-listen", "address-in-use"] as const) {
    const failsAfterListen = scenario === "after-listen";
    const addressInUse = scenario === "address-in-use";
    const label = addressInUse ? "EADDRINUSE" : failsAfterListen ? "监听后启动抛错" : "正常停服";
    test(`PS 真实 Colyseus：${label}均释放 transport / driver / presence`, () => {
        const moduleUrl = new URL("../src/bootstrapProcess.ts", import.meta.url).href;
        const script = `
            import assert from "node:assert/strict";
            import { Server, Room, LocalDriver, LocalPresence, matchMaker } from "@colyseus/core";
            import { WebSocketTransport } from "@colyseus/ws-transport";
            import { createServer } from "node:net";
            const { bootstrapProcess, listenProcessServer } = await import(${JSON.stringify(moduleUrl)});
            const events = [];
            const blocker = ${addressInUse} ? createServer() : null;
            if (blocker) await new Promise((resolve) => blocker.listen(0, resolve));
            const port = blocker ? blocker.address().port : 0;
            class Driver extends LocalDriver { shutdown() { events.push("driver"); super.shutdown(); } }
            class Presence extends LocalPresence { shutdown() { events.push("presence"); super.shutdown(); } }
            class ProbeRoom extends Room {
                onCreate() { this.autoDispose = false; }
                onDispose() { events.push("room-disposed"); }
            }
            const app = new Server({ driver: new Driver(), presence: new Presence(),
                transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false });
            app.define("bootstrap-probe", ProbeRoom);
            let roomId;
            const fault = new Error("after-listen fault");
            const deps = {
                registerResources() {}, registerAllRoutes: async () => {}, installLobbyHandlers() {}, clearLobbyHandlers() {},
                startInfraMonitors: () => async () => { events.push("producers-stopped"); },
                startStreamDepthAlert() {}, stopStreamDepthAlert: async () => {},
                startKickConsumer() {}, stopKickConsumer: async () => {},
                startCharacterRepairWorker() {}, stopCharacterRepairWorker: async () => {},
                startPushConsumer() {}, stopPushConsumer: async () => {}, stopMailWakeLoop: async () => {},
                beginShutdown: () => { events.push("admission-closed"); return 1; }, clearCharacterReadyFlights() {},
                drainCharacterReadyFlights: async () => {}, drainTasks: async () => {},
                disposeResources: async () => { events.push("resources-closed"); },
                stopServer: async (server) => { await server.gracefullyShutdown(false); },
                listen: async (server) => {
                    await listenProcessServer(server, port);
                    assert.ok(server.transport.server.listening);
                    roomId = (await matchMaker.createRoom("bootstrap-probe", {})).roomId;
                    assert.ok(matchMaker.getLocalRoomById(roomId));
                    if (${failsAfterListen}) throw fault;
                },
            };
            let timeout;
            try {
                if (${addressInUse}) {
                    await assert.rejects(Promise.race([
                        bootstrapProcess(app, "world", port, deps),
                        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("bootstrap still pending")), 2_000); }),
                    ]), (error) => error.code === "EADDRINUSE");
                } else if (${failsAfterListen}) await assert.rejects(bootstrapProcess(app, "world", 0, deps), (error) => error === fault);
                else { await bootstrapProcess(app, "world", 0, deps); await app.gracefullyShutdown(false); }
                assert.equal(app.transport.server.listening, false, "HTTP listener must close");
                assert.equal(app.transport.server.address(), null);
                for (const name of ["presence", "driver", "resources-closed"])
                    assert.equal(events.filter((event) => event === name).length, 1, name + " must close once");
                assert.ok(events.indexOf("producers-stopped") < events.indexOf("resources-closed"));
                if (!${addressInUse}) {
                    assert.equal(matchMaker.getLocalRoomById(roomId), undefined);
                    assert.equal(events.filter((event) => event === "room-disposed").length, 1);
                    assert.ok(events.indexOf("producers-stopped") < events.indexOf("room-disposed"));
                    assert.ok(events.indexOf("room-disposed") < events.indexOf("resources-closed"));
                }
                console.log("COLYSEUS_CLEANUP_OK");
            } finally {
                clearTimeout(timeout);
                await app.gracefullyShutdown(false);
                if (blocker) await new Promise((resolve) => blocker.close(resolve));
            }
        `;
        const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
            cwd: process.cwd(), encoding: "utf8", timeout: 15_000, env: { ...process.env, NODE_ENV: "test" },
        });
        assert.equal(result.signal, null, result.stderr);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /COLYSEUS_CLEANUP_OK/);
        if (addressInUse) markFaultPoint("process-listen-address-in-use");
        if (failsAfterListen) markFaultPoint("process-after-listen-failure");
    });
}
