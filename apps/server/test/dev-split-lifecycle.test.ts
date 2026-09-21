import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { markFaultPoint } from "./faultMatrix";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const modules = resolve(serverRoot, "../../node_modules");
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function waitFor(check: () => boolean | Promise<boolean>, message: () => string, timeout = 8_000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await check()) return;
        await pause(40);
    }
    assert.fail(message());
}
interface Event { role: string; event: string; pid: number; ppid: number; signal?: string; code?: string }

/** 复制真实监督器/预载，角色替换为仅占有临时 TCP 端口的进程；不连接数据库或用户服务。 */
async function fixture(t: TestContext, options: {
    watch?: boolean; occupied?: boolean; fail?: boolean; stubborn?: boolean; slowInit?: boolean;
} = {}) {
    const root = await mkdtemp(join(tmpdir(), "dev-split-lifecycle-"));
    const dir = join(root, "apps/server");
    const reservations = await Promise.all([0, 1, 2].map(async () => {
        const server = createServer((socket) => { socket.on("error", () => {}); socket.end(); });
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        return server;
    }));
    const ports = reservations.map((server) => {
        const address = server.address();
        assert.ok(address && typeof address === "object");
        return address.port;
    });
    for (const [index, server] of reservations.entries()) {
        if (!options.occupied || index !== 1) await new Promise<void>((done) => server.close(() => done()));
    }
    for (const path of ["tools", "src/entries", "src/core/infra"]) await mkdir(join(dir, path), { recursive: true });
    await mkdir(join(root, "apps/shared/src"), { recursive: true });
    await writeFile(join(dir, "package.json"), '{"type":"module"}');
    await symlink(modules, join(dir, "node_modules"), "dir");
    for (const file of ["dev-split.ts", "dev-split-parent.mjs"]) {
        await copyFile(join(serverRoot, "tools", file), join(dir, "tools", file));
    }
    await writeFile(join(dir, "src/core/infra/config.ts"), "export const PORT = Number(process.env.PORT);\n");
    await writeFile(join(dir, "src/unimported.ts"), "export const value = 1;\n");
    await writeFile(join(root, "apps/shared/src/unimported.ts"), "export const sharedValue = 1;\n");
    const logfile = join(dir, "events.jsonl");
    await writeFile(logfile, "");
    const roleSource = `import { createServer } from 'node:net';
import { appendFileSync } from 'node:fs';
const role = process.env.NODE_ID.split('.')[1].split(':')[0];
const log = (event, extra = {}) => appendFileSync(process.env.PROBE_LOG, JSON.stringify({role,event,pid:process.pid,ppid:process.ppid,...extra})+'\\n');
log('spawn');
if (process.env.PROBE_SLOW_INIT === '1') await new Promise(done => setTimeout(done, 30_000));
if (process.env.PROBE_FAIL === '1' && role === 'game') throw new Error('fixture startup failure');
const server = createServer(socket => { socket.on('error', () => {}); socket.end(); });
server.on('error', error => { log('error', {code:error.code}); process.exitCode = 1; });
server.listen(Number(process.env[role.toUpperCase()+'_PORT']), '127.0.0.1', () => log('listening'));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => {
    log('signal', {signal});
    if (process.env.PROBE_STUBBORN !== '1') server.close(() => process.exit(0));
});
`;
    for (const role of ["lobby", "game", "world"]) await writeFile(join(dir, "src/entries", `${role}.ts`), roleSource);
    const env: NodeJS.ProcessEnv = {
        ...process.env, PORT: String(ports[0]), LOBBY_PORT: String(ports[0]), GAME_PORT: String(ports[1]), WORLD_PORT: String(ports[2]),
        NODE_ID: "fixture", PROBE_LOG: logfile, PROBE_STUBBORN: options.stubborn ? "1" : "0",
        PROBE_SLOW_INIT: options.slowInit ? "1" : "0", PROBE_FAIL: options.fail ? "1" : "0",
    };
    delete env.COLYSEUS_CLOUD;
    const args = options.watch
        ? [join(modules, "tsx/dist/cli.mjs"), "watch", "--clear-screen=false", "--include", "src/**", "--include", "../shared/src/**", "--include", "tools/dev-split-parent.mjs", "tools/dev-split.ts"]
        : ["--import", "tsx", "tools/dev-split.ts"];
    const child = spawn(process.execPath, args, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    const events = async (): Promise<Event[]> => (await readFile(logfile, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const stopped = (process: ChildProcess) => process.exitCode !== null || process.signalCode !== null;
    t.after(async () => {
        // 只操作该 fixture 已记录的 PID / 独占进程组，即使用例中途失败也不遗留进程。
        const records = await events();
        const pids = new Set(records.filter((event) => event.event === "spawn").flatMap((event) => [event.pid, event.ppid]));
        if (child.pid !== undefined) pids.add(child.pid);
        for (const pid of pids) {
            try { process.kill(-pid, "SIGKILL"); } catch {}
            try { process.kill(pid, "SIGKILL"); } catch {}
        }
        if (!stopped(child)) await once(child, "close");
        for (const server of reservations) if (server.listening) await new Promise<void>((done) => server.close(() => done()));
        await rm(root, { recursive: true, force: true });
    });
    return {
        child, dir, events, output: () => output,
        ready: () => waitFor(async () => (await events()).filter((event) => event.event === "listening").length === 3, () => output),
        stopped: () => waitFor(() => stopped(child), () => `监督器未退出\n${output}`),
        rolesStopped: (timeout = 8_000) => waitFor(async () => (await events()).filter((event) => event.event === "spawn").every((event) => !alive(event.pid)), () => `角色进程残留\n${output}`, timeout),
    };
}

const posix = { skip: process.platform === "win32", timeout: 35_000 };

test("dev:split 实际角色端口占用或启动异常立即整组退出，保留非零状态", posix, async (t) => {
    for (const options of [{ occupied: true }, { fail: true }]) {
        const f = await fixture(t, options);
        await f.stopped();
        assert.equal(f.child.exitCode, 1, f.output());
        await f.rolesStopped();
        assert.match(f.output(), /game 进程意外退出 \(1\)/);
    }
    markFaultPoint("dev-supervisor-child-failure");
});

test("dev:split SIGTERM 正常清理，重复 Ctrl-C 强制清理卡住的角色", posix, async (t) => {
    for (const stubborn of [false, true]) {
        const f = await fixture(t, { stubborn });
        await f.ready();
        f.child.kill(stubborn ? "SIGINT" : "SIGTERM");
        if (stubborn) {
            await waitFor(async () => (await f.events()).some((event) => event.event === "signal"), f.output);
            f.child.kill("SIGINT");
        }
        await f.stopped();
        await f.rolesStopped();
        assert.equal(f.child.exitCode, 0, f.output());
        if (stubborn) markFaultPoint("dev-supervisor-force-stop");
    }
});

test("dev:split 单 watcher 覆盖未 import 的 server/shared 源码与预载文件并整体重启", posix, async (t) => {
    const f = await fixture(t, { watch: true });
    await f.ready();
    for (const [index, file] of ["src/unimported.ts", "../shared/src/unimported.ts", "tools/dev-split-parent.mjs"].entries()) {
        const oldPids = (await f.events()).filter((event) => event.event === "spawn").map((event) => event.pid);
        await appendFile(join(f.dir, file), "// trigger restart\n");
        await waitFor(async () => (await f.events()).filter((event) => event.event === "listening").length === (index + 2) * 3, f.output);
        assert.ok(oldPids.every((pid) => !alive(pid)), f.output());
    }
    f.child.kill("SIGTERM");
    await f.stopped();
    await f.rolesStopped();
});

test("dev:split 外层 watcher 重复 Ctrl-C 强杀监督器，IPC 断连使卡住的角色有界退出", posix, async (t) => {
    const f = await fixture(t, { watch: true, stubborn: true });
    await f.ready();
    f.child.kill("SIGINT");
    await waitFor(async () => (await f.events()).filter((event) => event.event === "signal").length >= 3, f.output);
    f.child.kill("SIGINT");
    await f.stopped();
    assert.match(f.output(), /Force killing/);
    // 原监督器只发一次 TERM；断连守卫应再次触发每个角色的停服回调。
    await waitFor(async () => {
        const signals = (await f.events()).filter((event) => event.event === "signal");
        return ["lobby", "game", "world"].every((role) => signals.filter((event) => event.role === role).length >= 2);
    }, f.output);
    await f.rolesStopped(18_000);
    markFaultPoint("dev-supervisor-ipc-disconnect");
});

test("dev:split 初始化前监督器消失，预载守卫仍能清掉全部角色", posix, async (t) => {
    const f = await fixture(t, { slowInit: true });
    await waitFor(async () => (await f.events()).filter((event) => event.event === "spawn").length === 3, f.output);
    f.child.kill("SIGKILL");
    await f.stopped();
    await f.rolesStopped();
    markFaultPoint("dev-supervisor-before-init-disconnect");
});
