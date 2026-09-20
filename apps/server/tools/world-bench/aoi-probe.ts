/**
 * AOI 载体实验（docs/MMO.md MF1「AOI 载体实验」；docs/MMO-PLAN.md MF1-B2）——证据生成器，⛔ 不进 verify:core。
 *
 * 问题：逐观察者同步（MF5）的载体选 Colyseus StateView（`@view()` + `client.view`）还是每会话消息级 delta？
 * 做法：同一份确定性模拟（M 个实体在 W×W 世界里按种子随机游走，N 个机器人各有一个化身，视野半径 R，兴趣集 = 半径内实体）
 * 装进两间**裸 Colyseus 房**（同进程、同传输、同种子），只换同步层：
 *  - 变体 A `view`：Schema `entities: MapSchema<Entity>` 打 `@view()`，兴趣集变化时 `client.view.add / remove(entity)`，位置改动由
 *    encoder 按 patchRate 逐视图编码；
 *  - 变体 B `delta`：房无 Schema 状态，每 tick 对每个机器人发一条 `d` 消息 `{ seq, tick, enter[], update[], leave[] }`（msgpack）。
 * 采样：sim 耗时（移动 + 兴趣集差集）、sync 耗时（A：`broadcastPatch`；B：发送循环）、进程 CPU ms/s、每会话真实出站字节
 * （包 `WebSocketClient.prototype.raw`）、join / 重连首 500 ms 字节（= baseline 重建成本）、事件循环延迟、RSS。
 * ⚠ 两个变体都不走 GameRoom 壳：StateView 在生成的 GameRoomState 上落地需要 codegen 支持 `@view()`（这本身就是「生成器改动面」
 *   这一比较项的结论之一），实验只比载体本身。
 *
 * 用法：npm --workspace @game/server exec tsx -- tools/world-bench/aoi-probe.ts --variant view|delta [--bots 50] [--entities 300]
 *       [--radius 300] [--world 2000] [--tick 50] [--seconds 15] [--seed 7] [--label x] [--no-write]
 * 结果落 docs/perf/world-bench/<时间戳>-aoi-<variant>[-<标签>].json；两份可用 run.ts --compare（KEY_METRICS 不适用，肉眼比 sync / bytes）。
 */
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Room, Server, type Client } from "colyseus";
import { WebSocketClient, WebSocketTransport } from "@colyseus/ws-transport";
import { MapSchema, Schema, StateView, type, view } from "@colyseus/schema";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import { gitCommit, round, stamp, summarize, writeReport, type Summary } from "./report";
import { seededRng, type Rng } from "./scenario";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const { values: args } = parseArgs({
  options: {
    variant: { type: "string", default: "delta" },
    bots: { type: "string", default: "50" },
    entities: { type: "string", default: "300" },
    radius: { type: "string", default: "300" },
    world: { type: "string", default: "2000" },
    tick: { type: "string", default: "50" },
    seconds: { type: "string", default: "15" },
    seed: { type: "string", default: "7" },
    label: { type: "string", default: "" },
    out: { type: "string", default: "docs/perf/world-bench" },
    "no-write": { type: "boolean", default: false },
  },
});

function positiveInt(raw: string | undefined, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${label} 须为正整数：${raw}`);
  return value;
}

const VARIANT = args.variant === "view" || args.variant === "delta" ? args.variant : (() => { throw new Error(`--variant 只能是 view | delta：${args.variant}`); })();
const BOTS = positiveInt(args.bots, "bots");
const ENTITIES = positiveInt(args.entities, "entities");
const RADIUS = positiveInt(args.radius, "radius");
const WORLD = positiveInt(args.world, "world");
const TICK_MS = positiveInt(args.tick, "tick");
const SECONDS = positiveInt(args.seconds, "seconds");
const SEED = positiveInt(args.seed, "seed");
const JOIN_WINDOW_MS = 500;

// ── 确定性模拟（两个变体共用）────────────────────────────────────────────────

interface Mover { id: number; x: number; y: number; vx: number; vy: number; kind: number }

class Simulation {
  readonly movers: Mover[] = [];
  private readonly rng: Rng;
  tick = 0;

  constructor(seed: number, total: number) {
    this.rng = seededRng(seed);
    for (let id = 0; id < total; id += 1) {
      const angle = this.rng() * Math.PI * 2;
      this.movers.push({ id, x: this.rng() * WORLD, y: this.rng() * WORLD, vx: Math.cos(angle) * 60, vy: Math.sin(angle) * 60, kind: id % 5 });
    }
  }

  /** 每 tick 以 dt 积分；约每秒 1 次按种子换向；出界反弹。 */
  step(dtMs: number): void {
    this.tick += 1;
    const dt = dtMs / 1000;
    for (const mover of this.movers) {
      if (this.rng() < dt) {
        const angle = this.rng() * Math.PI * 2;
        mover.vx = Math.cos(angle) * 60;
        mover.vy = Math.sin(angle) * 60;
      }
      mover.x += mover.vx * dt;
      mover.y += mover.vy * dt;
      if (mover.x < 0 || mover.x > WORLD) { mover.vx = -mover.vx; mover.x = Math.min(WORLD, Math.max(0, mover.x)); }
      if (mover.y < 0 || mover.y > WORLD) { mover.vy = -mover.vy; mover.y = Math.min(WORLD, Math.max(0, mover.y)); }
    }
  }

  /** 兴趣集：以化身 avatar 为中心、半径 R 内的实体 id（含自己）。 */
  visibleFrom(avatar: Mover): Set<number> {
    const out = new Set<number>();
    const r2 = RADIUS * RADIUS;
    for (const mover of this.movers) {
      const dx = mover.x - avatar.x;
      const dy = mover.y - avatar.y;
      if (dx * dx + dy * dy <= r2) out.add(mover.id);
    }
    return out;
  }
}

interface Observer { avatar: Mover; visible: Set<number>; seq: number }

/** 差集：返回 enter / leave，并把 next 写回 observer。 */
function diffInterest(observer: Observer, next: Set<number>): { enter: number[]; leave: number[] } {
  const enter: number[] = [];
  const leave: number[] = [];
  for (const id of next) if (!observer.visible.has(id)) enter.push(id);
  for (const id of observer.visible) if (!next.has(id)) leave.push(id);
  observer.visible = next;
  return { enter, leave };
}

// ── 采样（进程级）────────────────────────────────────────────────────────────

const sample = {
  on: false,
  simMs: [] as number[],
  syncMs: [] as number[],
  bytesBySession: new Map<string, number>(),
  joinAt: new Map<string, number>(),
  joinBytes: new Map<string, number>(),
  visibleCounts: [] as number[],
};

const originalRaw = WebSocketClient.prototype.raw;
WebSocketClient.prototype.raw = function patchedRaw(this: WebSocketClient, ...rawArgs: Parameters<WebSocketClient["raw"]>): void {
  const bytes = rawArgs[0].byteLength;
  const joinedAt = sample.joinAt.get(this.sessionId);
  if (joinedAt !== undefined && performance.now() - joinedAt <= JOIN_WINDOW_MS) sample.joinBytes.set(this.sessionId, (sample.joinBytes.get(this.sessionId) ?? 0) + bytes);
  if (sample.on) sample.bytesBySession.set(this.sessionId, (sample.bytesBySession.get(this.sessionId) ?? 0) + bytes);
  originalRaw.apply(this, rawArgs);
};

// ── 变体 A：StateView ────────────────────────────────────────────────────────

class Entity extends Schema {
  @type("uint16") id = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") kind = 0;
}

class ViewState extends Schema {
  @view() @type({ map: Entity }) entities = new MapSchema<Entity>();
}

class AoiViewRoom extends Room<{ state: ViewState }> {
  private readonly sim = new Simulation(SEED, ENTITIES + BOTS);
  private readonly observers = new Map<string, Observer>();
  private nextAvatar = ENTITIES;

  onCreate(): void {
    this.maxClients = 1024;
    this.autoDispose = false;
    this.patchRate = TICK_MS;
    const state = new ViewState();
    for (const mover of this.sim.movers) {
      const entity = new Entity();
      entity.id = mover.id; entity.x = mover.x; entity.y = mover.y; entity.kind = mover.kind;
      state.entities.set(String(mover.id), entity);
    }
    this.setState(state);
    this.setSimulationInterval(() => this.step(), TICK_MS);
  }

  onJoin(client: Client): void {
    client.view = new StateView();
    sample.joinAt.set(client.sessionId, performance.now());
    const avatar = this.sim.movers[this.nextAvatar % this.sim.movers.length];
    this.nextAvatar += 1;
    const observer: Observer = { avatar, visible: new Set(), seq: 0 };
    this.observers.set(client.sessionId, observer);
    this.applyInterest(client, observer);
  }

  onLeave(client: Client): void {
    this.observers.delete(client.sessionId);
  }

  private applyInterest(client: Client, observer: Observer): void {
    const { enter, leave } = diffInterest(observer, this.sim.visibleFrom(observer.avatar));
    for (const id of enter) { const entity = this.state.entities.get(String(id)); if (entity) client.view?.add(entity); }
    for (const id of leave) { const entity = this.state.entities.get(String(id)); if (entity) client.view?.remove(entity); }
  }

  private step(): void {
    const startedAt = performance.now();
    this.sim.step(TICK_MS);
    for (const mover of this.sim.movers) {
      const entity = this.state.entities.get(String(mover.id));
      if (entity) { entity.x = mover.x; entity.y = mover.y; }
    }
    for (const client of this.clients) {
      const observer = this.observers.get(client.sessionId);
      if (observer) { this.applyInterest(client, observer); if (sample.on) sample.visibleCounts.push(observer.visible.size); }
    }
    if (sample.on) sample.simMs.push(performance.now() - startedAt);
  }

  override broadcastPatch(): boolean {
    const startedAt = performance.now();
    const result = super.broadcastPatch();
    if (sample.on) sample.syncMs.push(performance.now() - startedAt);
    return result;
  }
}

// ── 变体 B：每会话消息级 delta ───────────────────────────────────────────────

class AoiDeltaRoom extends Room {
  private readonly sim = new Simulation(SEED, ENTITIES + BOTS);
  private readonly observers = new Map<string, Observer>();
  private nextAvatar = ENTITIES;

  onCreate(): void {
    this.maxClients = 1024;
    this.autoDispose = false;
    this.patchRate = null; // 无 Schema 状态，⛔ 不空跑 patch
    this.setSimulationInterval(() => this.step(), TICK_MS);
  }

  onJoin(client: Client): void {
    sample.joinAt.set(client.sessionId, performance.now());
    const avatar = this.sim.movers[this.nextAvatar % this.sim.movers.length];
    this.nextAvatar += 1;
    const observer: Observer = { avatar, visible: new Set(), seq: 0 };
    this.observers.set(client.sessionId, observer);
    this.emit(client, observer, true);
  }

  onLeave(client: Client): void {
    this.observers.delete(client.sessionId);
  }

  /** enter 带完整名片，update 只带位置，leave 只带 id；updateAll = 首帧把可见实体全当 enter。 */
  private emit(client: Client, observer: Observer, initial: boolean): void {
    const { enter, leave } = diffInterest(observer, this.sim.visibleFrom(observer.avatar));
    const update: number[][] = [];
    for (const id of observer.visible) {
      if (initial || !enter.includes(id)) { const mover = this.sim.movers[id]; update.push([id, round(mover.x, 1), round(mover.y, 1)]); }
    }
    const enterCards = (initial ? [...observer.visible] : enter).map((id) => { const mover = this.sim.movers[id]; return { id, x: round(mover.x, 1), y: round(mover.y, 1), kind: mover.kind }; });
    if (enterCards.length === 0 && leave.length === 0 && update.length === 0) return;
    observer.seq += 1;
    client.send("d", { seq: observer.seq, tick: this.sim.tick, enter: enterCards, update: initial ? [] : update, leave });
  }

  private step(): void {
    const startedAt = performance.now();
    this.sim.step(TICK_MS);
    const simDone = performance.now();
    for (const client of this.clients) {
      const observer = this.observers.get(client.sessionId);
      if (observer) { this.emit(client, observer, false); if (sample.on) sample.visibleCounts.push(observer.visible.size); }
    }
    if (sample.on) { sample.simMs.push(simDone - startedAt); sample.syncMs.push(performance.now() - simDone); }
  }
}

// ── 运行 ─────────────────────────────────────────────────────────────────────

interface AoiReport {
  readonly schemaVersion: 1;
  readonly benchmark: "aoi-probe";
  readonly variant: "view" | "delta";
  readonly startedAt: string;
  readonly commit: string;
  readonly node: string;
  readonly config: { readonly bots: number; readonly entities: number; readonly radius: number; readonly world: number; readonly tickMs: number; readonly seconds: number; readonly seed: number };
  readonly interest: { readonly visiblePerObserver: Summary };
  readonly sim: Summary;
  readonly sync: Summary;
  readonly cpu: { readonly msPerSec: number };
  readonly outbound: { readonly bytesTotal: number; readonly bytesPerSessionPerSec: Summary };
  readonly join: { readonly bytesFirst500ms: Summary; readonly rejoinBytesFirst500ms: number };
  readonly clientSide: { readonly deltaMessagesPerSec: Summary; readonly errors: number };
  readonly eventLoop: { readonly p50: number; readonly p99: number; readonly max: number };
  readonly memory: { readonly rssStartMB: number; readonly rssEndMB: number };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const mb = (bytes: number): number => round(bytes / (1024 * 1024), 1);

async function main(): Promise<number> {
  const roomName = VARIANT === "view" ? "aoi_view" : "aoi_delta";
  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
  if (VARIANT === "view") server.define(roomName, AoiViewRoom);
  else server.define(roomName, AoiDeltaRoom);
  const startedAt = new Date();
  const rssStart = process.memoryUsage().rss;
  const bots: { sdk: SDKClient; room: SDKRoom; messages: number; errors: number }[] = [];
  const loop = monitorEventLoopDelay({ resolution: 10 });
  let listening = false;
  try {
    await server.listen(0);
    listening = true;
    const address = server.transport.server?.address();
    if (!address || typeof address !== "object") throw new Error("server 未拿到监听端口");
    const endpoint = `http://127.0.0.1:${address.port}`;
    console.log(`—— aoi-probe ${VARIANT}：bots=${BOTS} entities=${ENTITIES} radius=${RADIUS} world=${WORLD} tick=${TICK_MS}ms seconds=${SECONDS} seed=${SEED} ——`);
    const attach = (room: SDKRoom, bot: { messages: number; errors: number }): void => {
      room.onMessage("d", () => { bot.messages += 1; });
      room.onMessage("*", () => undefined);
      room.onError(() => { bot.errors += 1; });
    };
    for (let index = 0; index < BOTS; index += 1) {
      const sdk = new SDKClient(endpoint);
      const room = await sdk.joinOrCreate(roomName, {});
      const bot = { sdk, room, messages: 0, errors: 0 };
      attach(room, bot);
      bots.push(bot);
    }
    await sleep(JOIN_WINDOW_MS + 200);
    const joinBytes = bots.map((bot) => sample.joinBytes.get(bot.room.sessionId) ?? 0);

    // 采样窗口
    sample.bytesBySession.clear();
    sample.simMs.length = 0; sample.syncMs.length = 0; sample.visibleCounts.length = 0;
    for (const bot of bots) bot.messages = 0;
    const cpuStart = process.cpuUsage();
    loop.enable();
    sample.on = true;
    const windowStart = performance.now();
    await sleep(SECONDS * 1000);
    sample.on = false;
    loop.disable();
    const windowSeconds = (performance.now() - windowStart) / 1000;
    const cpu = process.cpuUsage(cpuStart);
    const rssEnd = process.memoryUsage().rss;

    // 重连基线：第一个机器人离开再进（新 session），量首 500 ms 字节
    const first = bots[0];
    const roomId = first.room.roomId;
    await first.room.leave(true);
    const rejoined = await first.sdk.joinById(roomId, {});
    attach(rejoined, first);
    bots[0] = { ...first, room: rejoined };
    await sleep(JOIN_WINDOW_MS + 200);
    const rejoinBytes = sample.joinBytes.get(rejoined.sessionId) ?? 0;

    const botSessions = new Set(bots.map((bot) => bot.room.sessionId));
    const perSession = [...sample.bytesBySession.entries()].filter(([sessionId]) => botSessions.has(sessionId) || sessionId === first.room.sessionId).map(([, bytes]) => round(bytes / windowSeconds, 0));
    const report: AoiReport = {
      schemaVersion: 1,
      benchmark: "aoi-probe",
      variant: VARIANT,
      startedAt: startedAt.toISOString(),
      commit: gitCommit(REPO_ROOT),
      node: process.version,
      config: { bots: BOTS, entities: ENTITIES, radius: RADIUS, world: WORLD, tickMs: TICK_MS, seconds: SECONDS, seed: SEED },
      interest: { visiblePerObserver: summarize(sample.visibleCounts) },
      sim: summarize(sample.simMs),
      sync: summarize(sample.syncMs),
      cpu: { msPerSec: round((cpu.user + cpu.system) / 1000 / windowSeconds, 1) },
      outbound: { bytesTotal: [...sample.bytesBySession.values()].reduce((acc, value) => acc + value, 0), bytesPerSessionPerSec: summarize(perSession) },
      join: { bytesFirst500ms: summarize(joinBytes), rejoinBytesFirst500ms: rejoinBytes },
      clientSide: { deltaMessagesPerSec: summarize(bots.map((bot) => round(bot.messages / windowSeconds, 2))), errors: bots.reduce((acc, bot) => acc + bot.errors, 0) },
      eventLoop: { p50: round(loop.percentile(50) / 1e6), p99: round(loop.percentile(99) / 1e6), max: round(loop.max / 1e6) },
      memory: { rssStartMB: mb(rssStart), rssEndMB: mb(rssEnd) },
    };
    console.log(`    可见实体/观察者 p50 ${report.interest.visiblePerObserver.p50} / max ${report.interest.visiblePerObserver.max}；窗口 ${windowSeconds.toFixed(1)} s`);
    console.log(`    sim ms  p50 ${report.sim.p50} / p95 ${report.sim.p95} / p99 ${report.sim.p99}；sync ms p50 ${report.sync.p50} / p95 ${report.sync.p95} / p99 ${report.sync.p99}（${report.sync.count} 次）`);
    console.log(`    CPU ${report.cpu.msPerSec} ms/s；出站 B/s/会话 p50 ${report.outbound.bytesPerSessionPerSec.p50} / p95 ${report.outbound.bytesPerSessionPerSec.p95}；总 ${mb(report.outbound.bytesTotal)} MB`);
    console.log(`    join 首 500 ms 字节 p50 ${report.join.bytesFirst500ms.p50} / max ${report.join.bytesFirst500ms.max}；重连 ${report.join.rejoinBytesFirst500ms}`);
    console.log(`    事件循环 ms p50 ${report.eventLoop.p50} / p99 ${report.eventLoop.p99}；RSS ${report.memory.rssStartMB} → ${report.memory.rssEndMB} MB；delta msg/s p50 ${report.clientSide.deltaMessagesPerSec.p50}；errors ${report.clientSide.errors}`);
    if (!args["no-write"]) {
      const file = writeReport(path.resolve(REPO_ROOT, args.out ?? "docs/perf/world-bench"), `${stamp(startedAt)}-aoi-${VARIANT}${args.label ? `-${args.label}` : ""}`, report);
      console.log(`    报告 → ${path.relative(REPO_ROOT, file)}`);
    }
    return 0;
  } finally {
    await Promise.allSettled(bots.filter((bot) => bot.room.connection?.isOpen).map((bot) => Promise.race([bot.room.leave(true), sleep(2_000)])));
    if (listening) await server.gracefullyShutdown(false);
    WebSocketClient.prototype.raw = originalRaw;
  }
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error: unknown) => {
      console.error("[aoi-probe] 失败", error);
      process.exitCode = 1;
    });
}
