/**
 * world-bench 运行器（docs/MMO.md MF1「基准台」；docs/MMO-PLAN.md MF1-B1）——证据生成器，⛔ 不进 verify:core（同 tools/m0/）。
 *
 * 做什么：在本进程起一个真实 Colyseus server（GameRoom + 剧本登记的 mode），用 `@colyseus/sdk` 起 N 个机器人经真实 WebSocket
 * 加入房间并按种子随机行为发消息；采样窗口内记录
 *  - tick 耗时：包一层 `GameRoom.prototype.stepFixed`（只记 Playing 中的固定步）→ p50 / p95 / p99 / max（ms）；
 *  - 每会话出站字节：包一层 `@colyseus/ws-transport` 的 `WebSocketClient.prototype.raw`（所有出站帧，含 Schema patch）；
 *  - baseline 体积：机器人首次完整 baseline 的分块字节（JSON 长度作代理，由剧本统计）；
 *  - 事件循环延迟（`monitorEventLoopDelay`）与进程 RSS。
 * 结果落 `docs/perf/world-bench/<时间戳>-<剧本>[-<标签>].json`；`--compare a.json b.json` 逐项算主要指标的相对偏差
 * （MF1 退出条件：同剧本两次主要指标偏差 < 10%）。
 *
 * 前置：本地栈已起（npm --workspace @game/server run stack）——会话签发、snake 档水合都走真实 Redis。
 * 用法：
 *   npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --scenario snake-baseline [--bots 40] [--seconds 20] [--seed 7] [--sid 0] [--label x] [--out docs/perf/world-bench] [--no-write]
 *   npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --compare <a.json> <b.json> [--threshold 0.10]
 * 机器人 uid 带运行期前缀，跑完 UNLINK 清理（与 test/int/helpers 同一口径）。
 */
import fs from "node:fs";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { matchMaker, Server } from "colyseus";
import { WebSocketClient, WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import { GamePhase, RoomName } from "@game/shared";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { GameRoom } from "../../src/rooms/GameRoom";
import { assertRedisUp, cleanupUser, issueSession, sleep, testUid } from "../../test/int/helpers";
import { compareReports, formatDeviations, gitCommit, round, stamp, summarize, writeReport, type Summary } from "./report";
import { emptyBotStats, seededRng, type BotStats, type Scenario } from "./scenario";
import { snakeBaseline } from "./scenarios/snake-baseline";
import { viewRange100, viewRange300 } from "./scenarios/view-range";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCENARIOS: Readonly<Record<string, Scenario>> = {
  [snakeBaseline.id]: snakeBaseline,
  [viewRange100.id]: viewRange100,
  [viewRange300.id]: viewRange300,
};

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    scenario: { type: "string", default: "snake-baseline" },
    bots: { type: "string", default: "40" },
    seconds: { type: "string", default: "20" },
    seed: { type: "string", default: "7" },
    sid: { type: "string", default: "0" },
    label: { type: "string", default: "" },
    out: { type: "string", default: "docs/perf/world-bench" },
    compare: { type: "boolean", default: false },
    threshold: { type: "string", default: "0.10" },
    "no-write": { type: "boolean", default: false },
  },
});

interface Bot {
  readonly uid: string;
  readonly room: SDKRoom;
  readonly stats: BotStats;
  readonly stop: () => void;
  errors: number;
}

export interface WorldBenchReport {
  readonly schemaVersion: 1;
  readonly benchmark: "world-bench";
  readonly scenario: string;
  readonly description: string;
  readonly startedAt: string;
  readonly commit: string;
  readonly node: string;
  readonly config: { readonly bots: number; readonly seconds: number; readonly seed: number; readonly sId: number };
  readonly rooms: { readonly count: number; readonly clientsPerRoom: readonly number[] };
  readonly tick: Summary & { readonly fixedStepMs: number };
  readonly outbound: { readonly bytesTotal: number; readonly bytesPerSessionPerSec: Summary };
  readonly clientSide: { readonly deltaMessagesPerSec: Summary; readonly deltaBytesPerSec: Summary; readonly inputsSent: number; readonly relives: number; readonly runResults: number; readonly errors: number };
  readonly baseline: { readonly bytesPerJoin: Summary; readonly begins: number };
  readonly eventLoop: { readonly p50: number; readonly p99: number; readonly max: number };
  readonly memory: { readonly rssStartMB: number; readonly rssEndMB: number };
}

function positiveInt(raw: string | undefined, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${label} 须为正整数：${raw}`);
  return value;
}

function mb(bytes: number): number {
  return round(bytes / (1024 * 1024), 1);
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  if (!predicate()) throw new Error(`world-bench 等待超时：${label}`);
}

function runCompare(): number {
  const [left, right] = positionals;
  if (!left || !right) throw new Error("--compare 需要两个报告文件路径");
  // npm --workspace 的 cwd 是 apps/server：相对路径先按 cwd 找，找不到再按仓根找。
  const locate = (file: string): string => (path.isAbsolute(file) || fs.existsSync(path.resolve(file)) ? path.resolve(file) : path.resolve(REPO_ROOT, file));
  const load = (file: string): unknown => JSON.parse(fs.readFileSync(locate(file), "utf8"));
  const threshold = Number(args.threshold);
  const deviations = compareReports(load(left), load(right));
  console.log(`—— world-bench 比对：${left} vs ${right}（阈值 ${(threshold * 100).toFixed(0)}%）——`);
  for (const line of formatDeviations(deviations, threshold)) console.log(line);
  const worst = Math.max(...deviations.map((d) => (Number.isNaN(d.relative) ? Number.POSITIVE_INFINITY : d.relative)));
  const ok = worst <= threshold;
  console.log(ok ? `✅ 主要指标偏差最大 ${(worst * 100).toFixed(1)}% ≤ ${(threshold * 100).toFixed(0)}%` : `❌ 主要指标偏差最大 ${Number.isFinite(worst) ? `${(worst * 100).toFixed(1)}%` : "n/a"} > ${(threshold * 100).toFixed(0)}%`);
  return ok ? 0 : 1;
}

async function runScenario(): Promise<number> {
  const scenario = SCENARIOS[args.scenario ?? ""];
  if (!scenario) throw new Error(`未知剧本 ${args.scenario}；可选：${Object.keys(SCENARIOS).join(", ")}`);
  const bots = positiveInt(args.bots, "bots");
  const seconds = positiveInt(args.seconds, "seconds");
  const seed = positiveInt(args.seed, "seed");
  const sId = Number(args.sid);
  if (!Number.isInteger(sId) || sId < 0) throw new Error(`--sid 非法：${args.sid}`);
  await assertRedisUp();

  // ── 采样接缝（bench 进程内的原型包装，⛔ 不进生产代码）────────────────────────
  let sampling = false;
  const tickSamples: number[] = [];
  const originalStep = GameRoom.prototype.stepFixed;
  GameRoom.prototype.stepFixed = function patchedStepFixed(this: GameRoom): void {
    const playing = this.state?.phase === GamePhase.Playing;
    const startedAt = performance.now();
    originalStep.call(this);
    if (sampling && playing) tickSamples.push(performance.now() - startedAt);
  };
  const bytesBySession = new Map<string, number>();
  const originalRaw = WebSocketClient.prototype.raw;
  WebSocketClient.prototype.raw = function patchedRaw(this: WebSocketClient, ...rawArgs: Parameters<WebSocketClient["raw"]>): void {
    if (sampling) bytesBySession.set(this.sessionId, (bytesBySession.get(this.sessionId) ?? 0) + rawArgs[0].byteLength);
    originalRaw.apply(this, rawArgs);
  };
  const loop = monitorEventLoopDelay({ resolution: 10 });

  const unregister = scenario.register();
  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
  server.define(RoomName.Game, GameRoom).filterBy(["sId", "mode", "profile"]);
  const startedAt = new Date();
  const rssStart = process.memoryUsage().rss;
  const live: Bot[] = [];
  let listening = false;
  let fixedStepMs = 0;
  try {
    await server.listen(0);
    listening = true;
    const address = server.transport.server?.address();
    if (!address || typeof address !== "object") throw new Error("server 未拿到监听端口");
    const endpoint = `http://127.0.0.1:${address.port}`;
    console.log(`—— world-bench ${scenario.id}：bots=${bots} seconds=${seconds} seed=${seed} sId=${sId} @ ${endpoint} ——`);

    for (let index = 0; index < bots; index += 1) {
      const uid = testUid(`wb${index}`);
      const { token } = await issueSession(uid, null, "", sId);
      const sdk = new SDKClient(endpoint);
      sdk.auth.token = token;
      const room = await sdk.joinOrCreate(RoomName.Game, scenario.joinOptions(sId));
      const stats = emptyBotStats();
      const bot: Bot = { uid, room, stats, stop: scenario.attach(room, stats, seededRng(seed * 1_000_003 + index)), errors: 0 };
      room.onError(() => { bot.errors += 1; });
      live.push(bot);
    }
    await waitFor(() => live.every((bot) => bot.stats.firstBaselineAtMs > 0), "全部机器人收到首个 baseline", 15_000);
    const roomIds = [...new Set(live.map((bot) => bot.room.roomId))];
    const serverRooms = roomIds.map((roomId) => matchMaker.getLocalRoomById(roomId)).filter((room): room is NonNullable<typeof room> => Boolean(room));
    fixedStepMs = (serverRooms[0] as unknown as { fixedStepMs?: number } | undefined)?.fixedStepMs ?? 0;
    await waitFor(() => serverRooms.every((room) => (room.state as { phase?: string }).phase === GamePhase.Playing), "全部房间 Playing", 10_000);

    // ── 采样窗口 ─────────────────────────────────────────────────────────────────
    bytesBySession.clear();
    tickSamples.length = 0;
    for (const bot of live) { bot.stats.deltaBytes = 0; bot.stats.deltaMessages = 0; }
    loop.enable();
    sampling = true;
    const windowStart = performance.now();
    await sleep(seconds * 1000);
    sampling = false;
    loop.disable();
    const windowSeconds = (performance.now() - windowStart) / 1000;
    const rssEnd = process.memoryUsage().rss;

    const botSessionIds = new Set(live.map((bot) => bot.room.sessionId));
    const perSessionBytesPerSec = [...bytesBySession.entries()].filter(([sessionId]) => botSessionIds.has(sessionId)).map(([, bytes]) => bytes / windowSeconds);
    const report: WorldBenchReport = {
      schemaVersion: 1,
      benchmark: "world-bench",
      scenario: scenario.id,
      description: scenario.description,
      startedAt: startedAt.toISOString(),
      commit: gitCommit(REPO_ROOT),
      node: process.version,
      config: { bots, seconds, seed, sId },
      rooms: { count: serverRooms.length, clientsPerRoom: serverRooms.map((room) => room.clients.length) },
      tick: { ...summarize(tickSamples), fixedStepMs },
      outbound: {
        bytesTotal: [...bytesBySession.values()].reduce((acc, value) => acc + value, 0),
        bytesPerSessionPerSec: summarize(perSessionBytesPerSec.map((value) => round(value, 0))),
      },
      clientSide: {
        deltaMessagesPerSec: summarize(live.map((bot) => round(bot.stats.deltaMessages / windowSeconds, 2))),
        deltaBytesPerSec: summarize(live.map((bot) => round(bot.stats.deltaBytes / windowSeconds, 0))),
        inputsSent: live.reduce((acc, bot) => acc + bot.stats.inputsSent, 0),
        relives: live.reduce((acc, bot) => acc + bot.stats.relives, 0),
        runResults: live.reduce((acc, bot) => acc + bot.stats.runResults, 0),
        errors: live.reduce((acc, bot) => acc + bot.errors, 0),
      },
      baseline: { bytesPerJoin: summarize(live.map((bot) => bot.stats.firstBaselineBytes)), begins: live.reduce((acc, bot) => acc + bot.stats.baselineBegins, 0) },
      eventLoop: { p50: round(loop.percentile(50) / 1e6), p99: round(loop.percentile(99) / 1e6), max: round(loop.max / 1e6) },
      memory: { rssStartMB: mb(rssStart), rssEndMB: mb(rssEnd) },
    };

    console.log(`    rooms ${report.rooms.count}（clients ${report.rooms.clientsPerRoom.join("/")}），fixedStep ${fixedStepMs} ms，窗口 ${windowSeconds.toFixed(1)} s`);
    console.log(`    tick ms      p50 ${report.tick.p50} / p95 ${report.tick.p95} / p99 ${report.tick.p99} / max ${report.tick.max}（${report.tick.count} 步）`);
    console.log(`    出站 B/s/会话 p50 ${report.outbound.bytesPerSessionPerSec.p50} / p95 ${report.outbound.bytesPerSessionPerSec.p95} / max ${report.outbound.bytesPerSessionPerSec.max}；总 ${mb(report.outbound.bytesTotal)} MB`);
    console.log(`    delta/s/会话 p50 ${report.clientSide.deltaMessagesPerSec.p50}（JSON B/s p50 ${report.clientSide.deltaBytesPerSec.p50}）；baseline B/join p50 ${report.baseline.bytesPerJoin.p50} / max ${report.baseline.bytesPerJoin.max}`);
    console.log(`    事件循环 ms  p50 ${report.eventLoop.p50} / p99 ${report.eventLoop.p99} / max ${report.eventLoop.max}；RSS ${report.memory.rssStartMB} → ${report.memory.rssEndMB} MB；inputs ${report.clientSide.inputsSent} relives ${report.clientSide.relives} errors ${report.clientSide.errors}`);
    if (!args["no-write"]) {
      const name = `${stamp(startedAt)}-${scenario.id}${args.label ? `-${args.label}` : ""}`;
      const file = writeReport(path.resolve(REPO_ROOT, args.out ?? "docs/perf/world-bench"), name, report);
      console.log(`    报告 → ${path.relative(REPO_ROOT, file)}`);
    }
    return 0;
  } finally {
    for (const bot of live) bot.stop();
    await Promise.allSettled(live.filter((bot) => bot.room.connection?.isOpen).map((bot) => Promise.race([bot.room.leave(true), sleep(2_000)])));
    if (listening) await server.gracefullyShutdown(false);
    unregister();
    GameRoom.prototype.stepFixed = originalStep;
    WebSocketClient.prototype.raw = originalRaw;
    await Promise.allSettled(live.map((bot) => cleanupUser(bot.uid)));
    await closeRedis();
  }
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  (args.compare ? Promise.resolve(runCompare()) : runScenario())
    .then((code) => { process.exitCode = code; })
    .catch((error: unknown) => {
      console.error("[world-bench] 失败", error);
      process.exitCode = 1;
    });
}
