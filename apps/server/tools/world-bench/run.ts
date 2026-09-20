/**
 * world-bench 运行器（docs/MMO.md MF1「基准台」；docs/MMO-PLAN.md MF1-B1）——证据生成器，⛔ 不进 verify:core（同 tools/m0/）。
 *
 * 做什么：在本进程起一个真实 Colyseus server（GameRoom + 剧本登记的 mode），用 `@colyseus/sdk` 起 N 个机器人经真实 WebSocket
 * 加入房间并按种子随机行为发消息；采样窗口内记录
 *  - tick 耗时：包一层 `GameRoom.prototype.stepFixed`（只记 Playing 中的固定步）→ p50 / p95 / p99 / max（ms）；
 *  - 每会话出站字节：包一层 `@colyseus/ws-transport` 的 `WebSocketClient.prototype.raw`（所有出站帧，含 Schema patch）；
 *  - baseline 体积：机器人首次完整 baseline 的分块字节（JSON 长度作代理，由剧本统计）；
 *  - 事件循环延迟（`monitorEventLoopDelay`）与进程 RSS。
 *  - 长跑（MMO MK3-B3 `--sample-every <s>`）：把窗口切成等长采样，每样本记 tick / 出站 / 事件循环 / 内存（rss / heapUsed / external）/ 活动资源按类型
 *    （`process.getActiveResourcesInfo()`：TCPSocketWrap / Timeout / …）/ 在线机器人 / 错误 / 世界探针（k_mmo_world_event pending、两张检查点表行数），
 *    结束时对每条序列做线性回归得「每小时增长」，超出容差 ⇒ verdict growing（内存 / 计时器 / 连接 / 积压无增长 = §10.2 长跑行）。
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
import { GamePhase, RoomName, WorldPhase } from "@game/shared";
import { closeMysql, getPool, type RowDataPacket } from "../../src/core/infra/mysql";
import { MMO_CHARACTER_CHECKPOINT_KEEP, MMO_INSTANCE_CHECKPOINT_KEEP } from "../../src/kits/mmo/persistence/checkpoint";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { GameRoom } from "../../src/rooms/GameRoom";
import { WorldRoom } from "../../src/rooms/WorldRoom";
import { assertRedisUp, cleanupUser, issueSession, sleep, testUid } from "../../test/int/helpers";
import { compareReports, formatDeviations, gitCommit, round, stamp, summarize, writeReport, type Summary } from "./report";
import { emptyBotStats, seededRng, type BotStats, type Scenario } from "./scenario";
import { snakeBaseline } from "./scenarios/snake-baseline";
import { viewRange100, viewRange300 } from "./scenarios/view-range";
import { mmoGreybox } from "./scenarios/mmo-greybox";
import { mmoHotspot } from "./scenarios/mmo-hotspot";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCENARIOS: Readonly<Record<string, Scenario>> = {
  [snakeBaseline.id]: snakeBaseline,
  [viewRange100.id]: viewRange100,
  [viewRange300.id]: viewRange300,
  [mmoGreybox.id]: mmoGreybox,
  [mmoHotspot.id]: mmoHotspot,
};

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    scenario: { type: "string", default: "snake-baseline" },
    bots: { type: "string", default: "40" },
    seconds: { type: "string", default: "20" },
    "sample-every": { type: "string", default: "0" },
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
  /** 长跑（--sample-every > 0）：采样序列 + 每小时增长 + 判定 */
  readonly soak?: SoakReport;
}

export interface SoakSample {
  readonly atSec: number;
  readonly tick: Summary;
  readonly outboundP50BytesPerSessionPerSec: number;
  readonly eventLoopP99Ms: number;
  readonly rssMB: number;
  readonly heapUsedMB: number;
  readonly externalMB: number;
  readonly resources: Readonly<Record<string, number>>;
  readonly resourcesTotal: number;
  readonly botsOpen: number;
  readonly errors: number;
  /** 世界探针：事件积压 + 两张检查点表的行数与主体数（保留策略 ⇒ 行数 ≤ 主体数 × KEEP，有界而非零增长） */
  readonly world?: { readonly pendingEvents: number; readonly instanceCheckpointRows: number; readonly instances: number; readonly characterCheckpointRows: number; readonly characters: number };
}

export interface SoakReport {
  readonly sampleEverySeconds: number;
  readonly samples: readonly SoakSample[];
  /** 线性回归斜率（每小时）；样本 ≥ 4 时跳过首个（预热） */
  readonly growthPerHour: { readonly rssMB: number; readonly heapUsedMB: number; readonly resourcesTotal: number; readonly pendingEvents: number | null; readonly tickP99Ms: number; readonly outboundP50: number };
  /** 检查点表有界检查（最后一个样本）：行数 ≤ 主体数 × KEEP */
  readonly checkpointRowsBounded: boolean | null;
  readonly verdict: "stable" | "growing" | "insufficient";
  readonly reasons: readonly string[];
}

/** 长跑容差（§10.2「内存 / 计时器 / 连接 / 积压无增长」的机检口径；只许收紧）。 */
export const SOAK_TOLERANCE = Object.freeze({ rssMBPerHour: 20, heapUsedMBPerHour: 10, resourcesPerHour: 2, pendingEventsPerHour: 1, tickP99MsPerHour: 2, minSamples: 3, instanceKeep: MMO_INSTANCE_CHECKPOINT_KEEP, characterKeep: MMO_CHARACTER_CHECKPOINT_KEEP });

/** 最小二乘斜率（y 对 x 小时）；点数 < 2 ⇒ 0。 */
export function slopePerHour(points: readonly { readonly atSec: number; readonly value: number }[]): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const meanX = points.reduce((acc, point) => acc + point.atSec / 3600, 0) / n;
  const meanY = points.reduce((acc, point) => acc + point.value, 0) / n;
  let cov = 0;
  let variance = 0;
  for (const point of points) {
    const dx = point.atSec / 3600 - meanX;
    cov += dx * (point.value - meanY);
    variance += dx * dx;
  }
  return variance === 0 ? 0 : cov / variance;
}

/** 从采样序列算增长与判定（纯函数，单测可钉）。 */
export function judgeSoak(samples: readonly SoakSample[], sampleEverySeconds: number, tolerance = SOAK_TOLERANCE): SoakReport {
  const used = samples.length >= 4 ? samples.slice(1) : samples;
  const series = (pick: (sample: SoakSample) => number | null): { atSec: number; value: number }[] => used.flatMap((sample) => { const value = pick(sample); return value === null ? [] : [{ atSec: sample.atSec, value }]; });
  const hasWorld = used.some((sample) => sample.world !== undefined);
  const growthPerHour = {
    rssMB: round(slopePerHour(series((sample) => sample.rssMB)), 2),
    heapUsedMB: round(slopePerHour(series((sample) => sample.heapUsedMB)), 2),
    resourcesTotal: round(slopePerHour(series((sample) => sample.resourcesTotal)), 2),
    pendingEvents: hasWorld ? round(slopePerHour(series((sample) => sample.world?.pendingEvents ?? null)), 2) : null,
    tickP99Ms: round(slopePerHour(series((sample) => sample.tick.p99)), 2),
    outboundP50: round(slopePerHour(series((sample) => sample.outboundP50BytesPerSessionPerSec)), 0),
  };
  const lastWorld = used.length > 0 ? used[used.length - 1]!.world : undefined;
  const checkpointRowsBounded = lastWorld === undefined ? null
    : lastWorld.instanceCheckpointRows <= lastWorld.instances * tolerance.instanceKeep && lastWorld.characterCheckpointRows <= lastWorld.characters * tolerance.characterKeep;
  const reasons: string[] = [];
  if (used.length < tolerance.minSamples) return { sampleEverySeconds, samples, growthPerHour, checkpointRowsBounded, verdict: "insufficient", reasons: [`样本 ${used.length} < ${tolerance.minSamples}`] };
  if (growthPerHour.rssMB > tolerance.rssMBPerHour) reasons.push(`RSS +${growthPerHour.rssMB} MB/h > ${tolerance.rssMBPerHour}`);
  if (growthPerHour.heapUsedMB > tolerance.heapUsedMBPerHour) reasons.push(`heapUsed +${growthPerHour.heapUsedMB} MB/h > ${tolerance.heapUsedMBPerHour}`);
  if (growthPerHour.resourcesTotal > tolerance.resourcesPerHour) reasons.push(`活动资源 +${growthPerHour.resourcesTotal}/h > ${tolerance.resourcesPerHour}`);
  if (growthPerHour.pendingEvents !== null && growthPerHour.pendingEvents > tolerance.pendingEventsPerHour) reasons.push(`世界事件积压 +${growthPerHour.pendingEvents}/h > ${tolerance.pendingEventsPerHour}`);
  if (checkpointRowsBounded === false) reasons.push(`检查点表越界：分线 ${lastWorld!.instanceCheckpointRows} > ${lastWorld!.instances} × ${tolerance.instanceKeep} 或角色 ${lastWorld!.characterCheckpointRows} > ${lastWorld!.characters} × ${tolerance.characterKeep}（保留策略失效）`);
  if (growthPerHour.tickP99Ms > tolerance.tickP99MsPerHour) reasons.push(`tick p99 +${growthPerHour.tickP99Ms} ms/h > ${tolerance.tickP99MsPerHour}`);
  const last = used[used.length - 1]!;
  const first = used[0]!;
  if (last.botsOpen < first.botsOpen) reasons.push(`在线机器人 ${first.botsOpen} → ${last.botsOpen}（连接掉了）`);
  if (last.errors > first.errors) reasons.push(`机器人错误 ${first.errors} → ${last.errors}`);
  return { sampleEverySeconds, samples, growthPerHour, checkpointRowsBounded, verdict: reasons.length === 0 ? "stable" : "growing", reasons };
}

function countResources(): { readonly byType: Record<string, number>; readonly total: number } {
  const byType: Record<string, number> = {};
  const info = typeof process.getActiveResourcesInfo === "function" ? process.getActiveResourcesInfo() : [];
  for (const type of info) byType[type] = (byType[type] ?? 0) + 1;
  return { byType, total: info.length };
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
  // 世界房（MMO MK0-B6）：采样接 WorldRoom.advance（Active 时的一次推进 = 一或多个固定步）
  const originalAdvance = WorldRoom.prototype.advance;
  WorldRoom.prototype.advance = function patchedAdvance(this: WorldRoom, dtMs: number): number {
    const active = (this.state as { phase?: string } | undefined)?.phase === WorldPhase.Active;
    const startedAt = performance.now();
    const steps = originalAdvance.call(this, dtMs);
    if (sampling && active) tickSamples.push(performance.now() - startedAt);
    return steps;
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
  if (scenario.world) server.define(RoomName.World, WorldRoom).filterBy(["sId", "mode", "profile", "mapId", "line"]);
  const roomName = scenario.world ? RoomName.World : RoomName.Game;
  const isReady = (state: unknown): boolean => (scenario.ready ? scenario.ready(state) : (state as { phase?: string } | undefined)?.phase === GamePhase.Playing);
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
      const prepared = scenario.world ? await scenario.world.prepare(uid, sId, index) : undefined;
      const room = await sdk.joinOrCreate(roomName, scenario.joinOptions(sId, prepared));
      const stats = emptyBotStats();
      const bot: Bot = { uid, room, stats, stop: scenario.attach(room, stats, seededRng(seed * 1_000_003 + index)), errors: 0 };
      room.onError(() => { bot.errors += 1; });
      live.push(bot);
    }
    await waitFor(() => live.every((bot) => bot.stats.firstBaselineAtMs > 0), "全部机器人收到首个 baseline", 15_000);
    const roomIds = [...new Set(live.map((bot) => bot.room.roomId))];
    const serverRooms = roomIds.map((roomId) => matchMaker.getLocalRoomById(roomId)).filter((room): room is NonNullable<typeof room> => Boolean(room));
    fixedStepMs = (serverRooms[0] as unknown as { fixedStepMs?: number } | undefined)?.fixedStepMs ?? 0;
    await waitFor(() => serverRooms.every((room) => isReady(room.state)), "全部房间就绪（Playing / Active）", 10_000);

    // ── 采样窗口 ─────────────────────────────────────────────────────────────────
    bytesBySession.clear();
    tickSamples.length = 0;
    for (const bot of live) { bot.stats.deltaBytes = 0; bot.stats.deltaMessages = 0; }
    loop.enable();
    sampling = true;
    const windowStart = performance.now();
    const sampleEvery = Number(args["sample-every"] ?? 0);
    if (!Number.isFinite(sampleEvery) || sampleEvery < 0) throw new Error(`--sample-every 非法：${args["sample-every"]}`);
    const soakSamples: SoakSample[] = [];
    let soakWindowStart = windowStart;
    let bytesTotalBeforeWindow = 0;
    if (sampleEvery > 0 && seconds > sampleEvery) {
      // 长跑：等长采样窗口；每窗口后清空 tick / 出站 / 事件循环累计（有界内存，⛔ 采样本身制造「增长」）
      const worldProbe = async (): Promise<SoakSample["world"] | undefined> => {
        if (!scenario.world) return undefined;
        try {
          const [rows] = await getPool().query<RowDataPacket[]>(
            "SELECT (SELECT COUNT(*) FROM k_mmo_world_event WHERE server_id = ? AND status = 0) AS pending, (SELECT COUNT(*) FROM k_mmo_instance_checkpoint WHERE server_id = ?) AS icp, "
            + "(SELECT COUNT(DISTINCT instance_id) FROM k_mmo_instance_checkpoint WHERE server_id = ?) AS instances, (SELECT COUNT(*) FROM k_mmo_character_checkpoint WHERE server_id = ?) AS ccp, "
            + "(SELECT COUNT(DISTINCT character_id) FROM k_mmo_character_checkpoint WHERE server_id = ?) AS characters",
            [sId, sId, sId, sId, sId]);
          const row = rows[0] ?? {};
          return { pendingEvents: Number(row.pending ?? 0), instanceCheckpointRows: Number(row.icp ?? 0), instances: Number(row.instances ?? 0), characterCheckpointRows: Number(row.ccp ?? 0), characters: Number(row.characters ?? 0) };
        } catch { return undefined; }
      };
      while ((performance.now() - windowStart) / 1000 < seconds) {
        const remaining = seconds - (performance.now() - windowStart) / 1000;
        await sleep(Math.max(1, Math.min(sampleEvery, remaining)) * 1000);
        const windowSecondsNow = (performance.now() - soakWindowStart) / 1000;
        const sessionIds = new Set(live.map((bot) => bot.room.sessionId));
        const perSession = [...bytesBySession.entries()].filter(([sessionId]) => sessionIds.has(sessionId)).map(([, bytes]) => round(bytes / windowSecondsNow, 0));
        const memory = process.memoryUsage();
        const resources = countResources();
        const sample: SoakSample = {
          atSec: round((performance.now() - windowStart) / 1000, 1),
          tick: summarize(tickSamples),
          outboundP50BytesPerSessionPerSec: summarize(perSession).p50,
          eventLoopP99Ms: round(loop.percentile(99) / 1e6),
          rssMB: mb(memory.rss), heapUsedMB: mb(memory.heapUsed), externalMB: mb(memory.external),
          resources: resources.byType, resourcesTotal: resources.total,
          botsOpen: live.filter((bot) => bot.room.connection?.isOpen).length,
          errors: live.reduce((acc, bot) => acc + bot.errors, 0),
          ...(scenario.world ? { world: await worldProbe() } : {}),
        };
        soakSamples.push(sample);
        console.log(`    [soak ${sample.atSec}s] tick p99 ${sample.tick.p99} ms | 出站 p50 ${sample.outboundP50BytesPerSessionPerSec} B/s | 循环 p99 ${sample.eventLoopP99Ms} ms | RSS ${sample.rssMB} MB heap ${sample.heapUsedMB} MB | 资源 ${sample.resourcesTotal} | bots ${sample.botsOpen} err ${sample.errors}${sample.world ? ` | pending ${sample.world.pendingEvents} icp ${sample.world.instanceCheckpointRows}/${sample.world.instances} ccp ${sample.world.characterCheckpointRows}/${sample.world.characters}` : ""}`);
        tickSamples.length = 0;
        bytesTotalBeforeWindow += [...bytesBySession.values()].reduce((acc, value) => acc + value, 0);
        bytesBySession.clear();
        loop.reset();
        soakWindowStart = performance.now();
      }
    } else {
      await sleep(seconds * 1000);
    }
    sampling = false;
    loop.disable();
    const windowSeconds = (performance.now() - (soakSamples.length > 0 ? soakWindowStart : windowStart)) / 1000;
    const rssEnd = process.memoryUsage().rss;
    const soak = soakSamples.length > 0 ? judgeSoak(soakSamples, sampleEvery) : undefined;

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
      // 长跑：headline 取最后一个采样窗口（窗口间累计已清空）
      tick: { ...(soak ? soak.samples[soak.samples.length - 1]!.tick : summarize(tickSamples)), fixedStepMs },
      outbound: {
        bytesTotal: bytesTotalBeforeWindow + [...bytesBySession.values()].reduce((acc, value) => acc + value, 0),
        bytesPerSessionPerSec: soak ? summarize(soak.samples.map((sample) => sample.outboundP50BytesPerSessionPerSec)) : summarize(perSessionBytesPerSec.map((value) => round(value, 0))),
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
      ...(soak ? { soak } : {}),
    };
    if (soak) {
      const growth = soak.growthPerHour;
      console.log(`    长跑 ${soak.samples.length} 样本 × ${soak.sampleEverySeconds} s：RSS ${growth.rssMB > 0 ? "+" : ""}${growth.rssMB} MB/h、heap ${growth.heapUsedMB} MB/h、活动资源 ${growth.resourcesTotal}/h、tick p99 ${growth.tickP99Ms} ms/h${growth.pendingEvents === null ? "" : `、事件积压 ${growth.pendingEvents}/h、检查点表有界 ${soak.checkpointRowsBounded}`} ⇒ ${soak.verdict}${soak.reasons.length > 0 ? `（${soak.reasons.join("；")}）` : ""}`);
    }

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
    if (scenario.world) {
      // 世界房：离座 / 关房的强制检查点是异步落盘，等房全部 dispose 再清角色 / 分线行（否则清理与落盘竞态 ⇒ PersonaNotFound / AuthorityLost 噪音）
      const ids = [...new Set(live.map((bot) => bot.room.roomId))];
      await waitFor(() => ids.every((roomId) => !matchMaker.getLocalRoomById(roomId)), "世界房全部 dispose", 30_000).catch(() => undefined);
      await sleep(1_500);
    }
    unregister();
    GameRoom.prototype.stepFixed = originalStep;
    WorldRoom.prototype.advance = originalAdvance;
    WebSocketClient.prototype.raw = originalRaw;
    await Promise.allSettled(live.map((bot) => cleanupUser(bot.uid)));
    if (scenario.world) {
      await Promise.allSettled(live.map((bot) => scenario.world!.cleanup(bot.uid, sId)));
      await scenario.world.cleanupAll?.(sId);
    }
    await closeRedis();
    if (scenario.world) await closeMysql(); // 世界房剧本碰了 MySQL 池（角色 / 凭据 / 检查点）：不关池进程不退出
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
