import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(SERVER_ROOT, "../..");

function writeSandboxFile(sandbox: string, relativePath: string, source: string): void {
  const path = join(sandbox, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve());
  });
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function waitForListening(
  child: ReturnType<typeof spawn>,
  port: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`入口在监听前退出（code=${String(child.exitCode)} signal=${String(child.signalCode)}）${lastError}`);
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        const fail = (error: Error): void => {
          socket.destroy();
          reject(error);
        };
        socket.once("connect", () => {
          socket.end();
          resolve();
        });
        socket.once("error", fail);
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? `：${error.message}` : "";
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`入口未在 ${timeoutMs}ms 内监听${lastError}`);
}

function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs = 10_000,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`入口停服超时（${timeoutMs}ms）`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test("index 顶层启动失败：进程退出前等待 lifecycle cleanup，并保留原始异常", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "game-index-startup-"));
  const cleanupMarker = join(sandbox, "cleanup-complete");
  try {
    cpSync(join(SERVER_ROOT, "src"), join(sandbox, "src"), { recursive: true });
    symlinkSync(join(REPO_ROOT, "node_modules"), join(sandbox, "node_modules"), "dir");
    writeFileSync(join(sandbox, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(sandbox, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Bundler",
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    }));

    // Fail registerAllRoutes before any Redis/MySQL work starts. The preloaded
    // disposer proves index.ts caught that startup error and awaited the real
    // default registry, rather than merely exiting on an unhandled top-level
    // rejection.
    const invalidDomain = join(sandbox, "src/websocket/00_startup_fault");
    mkdirSync(invalidDomain);
    writeFileSync(join(invalidDomain, "broken.ts"), "export default null;\n");
    writeFileSync(join(sandbox, "register-cleanup.mjs"), `
      import { writeFile } from "node:fs/promises";
      import { defaultLifecycle } from "./src/core/infra/lifecycle.ts";
      defaultLifecycle.register("startup-test-marker", async () => {
        await writeFile(process.env.STARTUP_CLEANUP_MARKER, "disposed\\n");
      });
    `);

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--import", "./register-cleanup.mjs", "src/index.ts"],
      {
        cwd: sandbox,
        encoding: "utf8",
        timeout: 15_000,
        env: {
          ...process.env,
          NODE_ENV: "test",
          PROJECT_ID: "gono",
          FREEZE_ENABLED: "0",
          PAY_ENABLED: "0",
          STARTUP_CLEANUP_MARKER: cleanupMarker,
        },
      },
    );

    assert.equal(result.signal, null, `启动失败 cleanup 不应超时：${result.stderr.slice(-1_000)}`);
    assert.equal(result.status, 1, `原始启动异常必须让进程失败：${result.stderr.slice(-1_000)}`);
    assert.match(result.stderr, /00_startup_fault\/broken\.ts 缺少 defineRpc 的 default 导出/);
    assert.equal(existsSync(cleanupMarker), true, "顶层 catch 必须 await 已登记资源的 cleanup");
    assert.equal(readFileSync(cleanupMarker, "utf8"), "disposed\n");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("index 默认入口：真实监听后收到 SIGTERM 按序释放并以 0 正常退出", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "game-index-shutdown-"));
  const logPath = join(sandbox, "lifecycle.log");
  const port = await freePort();
  let child: ReturnType<typeof spawn> | null = null;
  let stderr = "";
  try {
    // Keep the production entry and shutdown aggregator intact.  Only the
    // external adapters are replaced in this child so the test is deterministic
    // and does not borrow the developer's Redis/MySQL/WebPlatform processes.
    cpSync(join(SERVER_ROOT, "src/index.ts"), join(sandbox, "src/index.ts"));
    cpSync(join(SERVER_ROOT, "src/shutdown.ts"), join(sandbox, "src/shutdown.ts"));
    cpSync(
      join(SERVER_ROOT, "src/core/infra/lifecycle.ts"),
      join(sandbox, "src/core/infra/lifecycle.ts"),
    );
    symlinkSync(join(REPO_ROOT, "node_modules"), join(sandbox, "node_modules"), "dir");
    writeFileSync(join(sandbox, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(sandbox, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Bundler",
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    }));

    writeSandboxFile(sandbox, "src/probe.ts", `
      import { appendFileSync } from "node:fs";
      import { isAdmissionOpen } from "./core/infra/lifecycle";
      let readyDrainResolve!: () => void;
      const readyDrained = new Promise<void>((resolve) => { readyDrainResolve = resolve; });
      export function record(name: string): void {
        appendFileSync(process.env.LIFECYCLE_LOG!, name + "|admission=" + String(isAdmissionOpen()) + "\\n");
      }
      export function markReadyDrained(): void {
        record("drain-ready");
        readyDrainResolve();
      }
      export function waitForReadyDrain(): Promise<void> { return readyDrained; }
    `);
    writeSandboxFile(sandbox, "src/app.config.ts", `
      import { Server } from "@colyseus/core";
      import { WebSocketTransport } from "@colyseus/ws-transport";
      import { record } from "./probe";
      record("app-loaded");
      const server = new Server({
        transport: new WebSocketTransport(),
        gracefullyShutdown: true,
        greet: false,
      });
      export default server;
    `);
    writeSandboxFile(sandbox, "src/core/infra/config.ts", `
      export const PORT = Number(process.env.PORT);
    `);
    writeSandboxFile(sandbox, "src/websocket/loader.ts", `
      import { record } from "../probe";
      export async function registerAllRoutes(): Promise<void> { record("routes-ready"); }
    `);
    writeSandboxFile(sandbox, "src/core/infra/loopMonitor.ts", `
      import { record } from "../../probe";
      export function startInfraMonitors(): () => Promise<void> {
        record("start-infra");
        return async () => { record("stop-infra"); };
      }
    `);
    writeSandboxFile(sandbox, "src/core/match/matchConsumer.ts", `
      import { record } from "../../probe";
      export function startStreamDepthAlert(): void { record("start-depth"); }
      export async function stopStreamDepthAlert(): Promise<void> { record("stop-depth"); }
    `);
    writeSandboxFile(sandbox, "src/core/auth/kickBus.ts", `
      import { record } from "../../probe";
      export function setKickHandler(_handler: unknown): void { record("set-kick"); }
      export function startKickConsumer(): void { record("start-kick"); }
      export async function stopKickConsumer(): Promise<void> { record("stop-kick"); }
    `);
    writeSandboxFile(sandbox, "src/player/characterRepair.ts", `
      import { record } from "../probe";
      export function startCharacterRepairWorker(): void { record("start-repair"); }
      export async function stopCharacterRepairWorker(): Promise<void> { record("stop-repair"); }
    `);
    writeSandboxFile(sandbox, "src/player/character.ts", `
      import { markReadyDrained, record } from "../probe";
      export function clearCharacterReadyFlights(): void { record("clear-ready"); }
      export async function drainCharacterReadyFlights(): Promise<void> { markReadyDrained(); }
    `);
    writeSandboxFile(sandbox, "src/websocket/push.ts", `
      import { record } from "../probe";
      export function kickUser(): boolean { return false; }
      export async function stopMailWakeLoop(): Promise<void> { record("stop-mailwake"); }
    `);
    writeSandboxFile(sandbox, "src/core/infra/redisRoute.ts", `
      import { record } from "../../probe";
      export async function closeRedis(): Promise<void> { record("close-redis"); }
    `);
    writeSandboxFile(sandbox, "src/core/infra/mysql.ts", `
      import { record } from "../../probe";
      export async function closeMysql(): Promise<void> { record("close-mysql"); }
    `);
    writeSandboxFile(sandbox, "src/platform/webPlatformClient.ts", `
      import { record } from "../probe";
      export function closeWebPlatformClient(): void { record("close-webplatform"); }
    `);
    writeSandboxFile(sandbox, "register-cleanup.mjs", `
      import { appendFileSync } from "node:fs";
      import { defaultLifecycle, defaultTasks, isAdmissionOpen } from "./src/core/infra/lifecycle.ts";
      import { waitForReadyDrain } from "./src/probe.ts";
      const log = (name) => appendFileSync(process.env.LIFECYCLE_LOG, name + "|admission=" + String(isAdmissionOpen()) + "\\n");
      defaultLifecycle.register("probe-marker", () => { log("marker"); });
      void defaultTasks.track("probe-task", waitForReadyDrain().then(() => { log("task-settled"); }));
    `);

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      PROJECT_ID: "gono",
      PORT: String(port),
      LIFECYCLE_LOG: logPath,
    };
    delete childEnv.COLYSEUS_CLOUD;
    child = spawn(
      process.execPath,
      ["--import", "tsx", "--import", "./register-cleanup.mjs", "src/index.ts"],
      {
        cwd: sandbox,
        env: childEnv,
        // The real tools package has a separate cloud path; this probe must
        // exercise the ordinary TCP listener used by local development.
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    try {
      await waitForListening(child, port);
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\\nstderr: ${stderr.slice(-4_000)}`);
    }
    assert.equal(child.kill("SIGTERM"), true, "监听成功后必须能向入口发送停服信号");
    const exit = await waitForExit(child);
    child = null;

    assert.deepEqual(
      exit,
      { code: 0, signal: null },
      `正常停服必须以 0 退出（stderr 尾部：${stderr.slice(-2_000)}）`,
    );
    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    const events = lines.map((line) => line.split("|", 1)[0]);
    assert.deepEqual(events, [
      "app-loaded",
      "routes-ready",
      "start-infra",
      "start-depth",
      "set-kick",
      "start-kick",
      "start-repair",
      "clear-ready",
      "stop-infra",
      "stop-depth",
      "stop-kick",
      "stop-repair",
      "stop-mailwake",
      "drain-ready",
      "task-settled",
      "close-webplatform",
      "close-mysql",
      "close-redis",
      "marker",
    ], `事件序列异常；stderr=${stderr.slice(-4_000)} lines=${JSON.stringify(lines)}`);
    for (const line of lines.slice(7)) {
      assert.match(line, /admission=false$/, `停服阶段必须已关闭 admission：${line}`);
    }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await waitForExit(child, 2_000).catch(() => {});
    }
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("index 默认入口：真实依赖装配、停服列表与 listen(app, PORT) 均有显式接缝", () => {
  const source = readFileSync(join(SERVER_ROOT, "src/index.ts"), "utf8");
  for (const registration of [
    'defaultLifecycle.register("redis", closeRedis)',
    'defaultLifecycle.register("mysql", closeMysql)',
    'defaultLifecycle.register("webplatform", closeWebPlatformClient)',
    'infraMonitorStop = startInfraMonitors()',
    'startStreamDepthAlert()',
    'setKickHandler(kickUser)',
    'startKickConsumer()',
    'startCharacterRepairWorker()',
  ]) {
    assert.ok(source.includes(registration), `默认入口缺少真实依赖装配：${registration}`);
  }

  const stopBlock = source.match(/const stopBackgroundProducers = createOrderedProducerStopper\(\[([\s\S]*?)\]\);/)?.[1];
  assert.ok(stopBlock, "默认入口必须通过有序 producer stopper 汇总停止项");
  const stopNames = [...stopBlock.matchAll(/name: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(stopNames, [
    "infra-monitors",
    "stream-depth-alert",
    "kick-consumer",
    "character-repair",
    "mailwake",
  ]);

  const cleanupBlock = source.match(/await runShutdownCleanup\(stopBackgroundProducers, \[([\s\S]*?)\]\);/)?.[1];
  assert.ok(cleanupBlock, "默认入口必须通过最终 cleanup 编排器收口");
  const cleanupNames = [...cleanupBlock.matchAll(/name: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(cleanupNames, ["character-ready", "detached-tasks", "registered-resources"]);
  assert.match(source, /await listen\(app, PORT\)/, "端口必须由 config.PORT 传入 listen");
  assert.equal(
    (source.match(/installShutdownAggregator\(app/g) ?? []).length,
    1,
    "默认入口不得再次注册第二个 shutdown aggregator",
  );
});
