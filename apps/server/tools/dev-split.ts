/** 本地三进程监督器；外层单个 tsx watch 负责整体重启。 */
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PORT } from "../src/core/infra/config";

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PARENT_GUARD = pathToFileURL(resolve(SERVER_ROOT, "tools/dev-split-parent.mjs")).href;
const ROLES = ["lobby", "game", "world"] as const;
type SplitRole = typeof ROLES[number];

export function splitProcessPlan(env: NodeJS.ProcessEnv, basePort: number) {
    const ports = ROLES.map((role, index) => {
        const key = `${role.toUpperCase()}_PORT`;
        const raw = env[key] || String(basePort + index);
        const port = /^\d+$/.test(raw) ? Number(raw) : NaN;
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${key} 须为 1–65535 纯整数`);
        return port;
    });
    if (new Set(ports).size !== ROLES.length) throw new Error("dev:split 的三个端口必须互异");
    const shared: NodeJS.ProcessEnv = { ...env, NODE_APP_INSTANCE: "0" };
    for (const [index, role] of ROLES.entries()) {
        shared[`${role.toUpperCase()}_PORT`] = String(ports[index]);
        const key = `${role.toUpperCase()}_PUBLIC_WS_URL`;
        shared[key] = env[key]?.trim() || `ws://127.0.0.1:${ports[index]}`;
    }
    return ROLES.map((role, index) => ({
        role, port: ports[index],
        env: { ...shared, NODE_ID: `${env.NODE_ID || "dev"}.${role}:${ports[index]}` } as NodeJS.ProcessEnv,
    }));
}

async function run(): Promise<void> {
    if (process.env.COLYSEUS_CLOUD !== undefined) throw new Error("dev:split 仅用于本地开发，不接受 COLYSEUS_CLOUD 端口覆盖");
    const plan = splitProcessPlan(process.env, PORT);
    const children: { role: SplitRole; child: ChildProcess }[] = [];
    let stopping = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const signalChild = (child: ChildProcess, signal: NodeJS.Signals) => {
        if (child.pid === undefined) return;
        try {
            // 只发送到本次 spawn 的独占组；角色进程没有中间 watcher。
            if (process.platform === "win32") child.kill(signal);
            else process.kill(-child.pid, signal);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") console.error(error);
        }
    };
    const stop = (code: number) => {
        if (stopping) {
            for (const { child } of children) signalChild(child, "SIGKILL");
            return;
        }
        stopping = true;
        process.exitCode = code;
        for (const { child } of children) signalChild(child, "SIGTERM");
        forceTimer = setTimeout(() => {
            for (const { child } of children) signalChild(child, "SIGKILL");
        }, 15_000);
        forceTimer.unref();
    };
    process.on("SIGINT", () => stop(0));
    process.on("SIGTERM", () => stop(0));
    await Promise.all(plan.map(({ role, port, env }) => new Promise<void>((resolveChild) => {
        const child = spawn(process.execPath, ["--import", "tsx", "--import", PARENT_GUARD, `src/entries/${role}.ts`], {
            cwd: SERVER_ROOT, env, stdio: ["inherit", "inherit", "inherit", "ipc"], detached: process.platform !== "win32",
        });
        children.push({ role, child });
        console.info(`[dev:split] ${role} port=${port}`);
        child.on("error", (error) => { console.error(`[dev:split] ${role}`, error); stop(1); });
        child.on("exit", (code) => {
            if (!stopping) { console.error(`[dev:split] ${role} 进程意外退出 (${code})`); stop(code || 1); }
        });
        // close 覆盖 spawn error，并确保所有子进程及其 IPC 已关闭才取消强杀计时。
        child.on("close", () => resolveChild());
    })));
    if (forceTimer) clearTimeout(forceTimer);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
