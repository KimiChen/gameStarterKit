import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(SERVER_ROOT, "../..");

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
