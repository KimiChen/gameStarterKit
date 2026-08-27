/**
 * Headless client performance baseline for the ballMove ECS/render path.
 *
 * The Cocos Graphics implementation cannot be loaded in Node, so the render
 * phase uses a deliberately allocation-free Graphics-shaped sink and mirrors
 * Main.draw's clear + border + per-player circle/health-bar command sequence.
 * The ECS tick and self lookup call the production GameECS implementation.
 *
 * The workload is deterministic (seeded player state and Float64 input tape),
 * while timings are reported as distributions because host scheduling is not.
 * Use `npm run --silent perf:client -- --json --output baseline.json` for a machine
 * readable artifact; no timestamp is included so two artifacts can be diffed.
 */
import { parseArgs } from "node:util";
import { basename } from "node:path";
import { writeFileSync } from "node:fs";
import { GameECS } from "../apps/client/src/logic/rooms/ballMove/GameECS";
import { PlayerModel } from "../apps/client/src/logic/rooms/ballMove/GameComps";
import type { IPlayerState } from "../apps/client/src/shared/protocol/state";
import { MAP_HEIGHT, MAP_WIDTH } from "../apps/client/src/shared/constants/game";

export const PERF_SCHEMA_VERSION = 1 as const;
export const DEFAULT_PERF_SEED = 0x51_7e_eda1;
export const DEFAULT_PERF_FRAMES = 240;
export const DEFAULT_PERF_WARMUP_FRAMES = 60;
export const DEFAULT_ENTITY_COUNTS = [100, 500] as const;
const MAX_INPUT_VALUES = 25_000_000;

export interface PerformanceBaselineOptions {
    readonly seed?: number;
    readonly frames?: number;
    readonly warmupFrames?: number;
    readonly entityCounts?: readonly number[];
}

export interface TimingSummary {
    readonly samples: number;
    readonly totalMs: number;
    readonly meanMs: number;
    readonly minMs: number;
    readonly p50Ms: number;
    readonly p95Ms: number;
    readonly p99Ms: number;
    readonly maxMs: number;
}

export interface BaselineCase {
    readonly entityCount: number;
    readonly seed: number;
    readonly frames: number;
    readonly warmupFrames: number;
    readonly input: {
        readonly checksum: number;
        readonly values: number;
    };
    readonly inputSync: TimingSummary;
    readonly tick: TimingSummary;
    readonly selfLookup: TimingSummary;
    readonly snapshot: TimingSummary;
    readonly render: TimingSummary;
    readonly frame: TimingSummary;
    readonly renderOpsPerFrame: number;
    readonly snapshotAllocationsPerFrame: number;
    readonly snapshotBytesEstimatePerFrame: number;
    readonly heapDeltaBytes: number | null;
    readonly sinkChecksum: number;
}

export interface PerformanceBaseline {
    readonly schemaVersion: typeof PERF_SCHEMA_VERSION;
    readonly benchmark: "client-ballMove";
    readonly runtime: {
        readonly node: string;
        readonly platform: string;
        readonly arch: string;
    };
    readonly seed: number;
    readonly frames: number;
    readonly warmupFrames: number;
    readonly entityCounts: readonly number[];
    readonly cases: readonly BaselineCase[];
}

/** Small deterministic PRNG; zero is a valid input seed but never an internal state. */
class SeededInput {
    private state: number;

    constructor(seed: number) {
        this.state = (seed >>> 0) || 0x6d2b79f5;
    }

    next(): number {
        // Keep the state in uint32 space. Letting the JS number grow without
        // wrapping eventually loses integer precision on large tapes.
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
    }
}

function assertPositiveInteger(value: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
        throw new Error(`[perf] ${label} must be a positive safe integer`);
    }
    return value;
}

function normalizeOptions(options: PerformanceBaselineOptions): Required<PerformanceBaselineOptions> {
    const seed = options.seed === undefined
        ? DEFAULT_PERF_SEED
        : Number.isSafeInteger(options.seed)
            ? options.seed >>> 0
            : (() => { throw new Error("[perf] seed must be a safe integer"); })();
    const frames = assertPositiveInteger(options.frames ?? DEFAULT_PERF_FRAMES, "frames");
    const warmupFrames = assertPositiveInteger(options.warmupFrames ?? DEFAULT_PERF_WARMUP_FRAMES, "warmupFrames");
    const entityCounts = [...(options.entityCounts ?? DEFAULT_ENTITY_COUNTS)]
        .map((count) => assertPositiveInteger(count, "entity count"));
    if (entityCounts.length === 0) throw new Error("[perf] entityCounts must not be empty");
    if (new Set(entityCounts).size !== entityCounts.length) throw new Error("[perf] entityCounts must be unique");
    const totalFrames = frames + warmupFrames;
    for (const entityCount of entityCounts) {
        const inputValues = totalFrames * entityCount * 2;
        if (inputValues > MAX_INPUT_VALUES) {
            throw new Error(`[perf] workload too large: ${inputValues} input values (max ${MAX_INPUT_VALUES})`);
        }
    }
    return { seed, frames, warmupFrames, entityCounts };
}

function round(value: number): number {
    return Number(value.toFixed(6));
}

function percentile(sorted: readonly number[], p: number): number {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p / 100) - 1));
    return sorted[index];
}

function summarize(samples: number[]): TimingSummary {
    if (samples.length === 0) throw new Error("[perf] no timing samples");
    samples.sort((a, b) => a - b);
    const totalMs = samples.reduce((sum, sample) => sum + sample, 0);
    return {
        samples: samples.length,
        totalMs: round(totalMs),
        meanMs: round(totalMs / samples.length),
        minMs: round(samples[0]),
        p50Ms: round(percentile(samples, 50)),
        p95Ms: round(percentile(samples, 95)),
        p99Ms: round(percentile(samples, 99)),
        maxMs: round(samples[samples.length - 1]),
    };
}

function elapsedMs(start: bigint): number {
    return Number(process.hrtime.bigint() - start) / 1e6;
}

function checksumStep(checksum: number, value: number): number {
    // Keep the checksum in uint32 space so it is stable across JS engines.
    const quantized = Math.floor(value * 0x1_0000_0000) >>> 0;
    return Math.imul(checksum ^ quantized, 0x45d9f3b) >>> 0;
}

interface BenchWorld {
    readonly ecs: GameECS;
    readonly states: IPlayerState[];
    readonly inputs: Float64Array;
    readonly inputChecksum: number;
}

function buildWorld(entityCount: number, seed: number, totalFrames: number): BenchWorld {
    const rng = new SeededInput(seed ^ Math.imul(entityCount, 0x9e3779b9));
    const ecs = new GameECS();
    const states: IPlayerState[] = [];
    for (let i = 0; i < entityCount; i++) {
        const state: IPlayerState = {
            id: `perf-${entityCount}-${i}`,
            name: `P${i}`,
            x: rng.next() * MAP_WIDTH,
            y: rng.next() * MAP_HEIGHT,
            hp: 1 + Math.floor(rng.next() * 100),
            maxHp: 100,
            alive: true,
        };
        states.push(state);
        ecs.addPlayer(state, i === 0);
    }

    const inputs = new Float64Array(totalFrames * entityCount * 2);
    let inputChecksum = 0x811c9dc5;
    for (let frame = 0; frame < totalFrames; frame++) {
        for (let i = 0; i < entityCount; i++) {
            const offset = (frame * entityCount + i) * 2;
            const x = rng.next() * MAP_WIDTH;
            const y = rng.next() * MAP_HEIGHT;
            inputs[offset] = x;
            inputs[offset + 1] = y;
            inputChecksum = checksumStep(inputChecksum, x);
            inputChecksum = checksumStep(inputChecksum, y);
        }
    }
    return { ecs, states, inputs, inputChecksum: inputChecksum >>> 0 };
}

function applyInput(world: BenchWorld, frame: number): void {
    const count = world.states.length;
    const base = (frame % (world.inputs.length / (count * 2))) * count * 2;
    for (let i = 0; i < count; i++) {
        const state = world.states[i];
        state.x = world.inputs[base + i * 2];
        state.y = world.inputs[base + i * 2 + 1];
        world.ecs.syncPlayer(state);
    }
}

/**
 * Allocation probe for a temporary per-frame player snapshot.
 * Main.draw currently iterates the ECS directly; this probe keeps the
 * allocation cost visible when evaluating a snapshot/cache optimization.
 */
export function snapshotPlayers(ecs: GameECS): Array<{ x: number; y: number; hp: number; maxHp: number; alive: boolean; isSelf: boolean }> {
    const snapshot: Array<{ x: number; y: number; hp: number; maxHp: number; alive: boolean; isSelf: boolean }> = [];
    ecs.forEachPlayer((eid) => {
        snapshot.push({
            x: PlayerModel.x[eid],
            y: PlayerModel.y[eid],
            hp: PlayerModel.hp[eid],
            maxHp: PlayerModel.maxHp[eid],
            alive: PlayerModel.alive[eid],
            isSelf: PlayerModel.isSelf[eid],
        });
    });
    return snapshot;
}

/** Minimal Graphics-shaped sink used to count the exact Main.draw command pattern. */
export class GraphicsSink {
    operations = 0;
    checksum = 0;

    clear(): void { this.operations++; }
    rect(x: number, y: number, width: number, height: number): void {
        this.operations++;
        this.checksum = checksumStep(this.checksum, x + y + width + height);
    }
    circle(x: number, y: number, radius: number): void {
        this.operations++;
        this.checksum = checksumStep(this.checksum, x + y + radius);
    }
    stroke(): void { this.operations++; }
    fill(): void { this.operations++; }
}

/** Mirrors Main.draw geometry while remaining runnable without the Cocos runtime. */
export function drawHeadless(ecs: GameECS, gfx: GraphicsSink): void {
    gfx.clear();
    const ox = -MAP_WIDTH / 2;
    const oy = -MAP_HEIGHT / 2;
    gfx.rect(ox, oy, MAP_WIDTH, MAP_HEIGHT);
    gfx.stroke();
    ecs.forEachPlayer((eid) => {
        const px = ox + PlayerModel.x[eid];
        const py = oy + PlayerModel.y[eid];
        gfx.circle(px, py, 20);
        gfx.fill();
        const ratio = PlayerModel.maxHp[eid] > 0 ? PlayerModel.hp[eid] / PlayerModel.maxHp[eid] : 0;
        gfx.rect(px - 25, py + 28, 50, 6);
        gfx.fill();
        gfx.rect(px - 25, py + 28, 50 * ratio, 6);
        gfx.fill();
    });
}

function runMeasured(
    frames: number,
    warmupFrames: number,
    before: (frame: number) => void,
    operation: (frame: number) => void,
): TimingSummary {
    for (let frame = 0; frame < warmupFrames; frame++) {
        before(frame);
        operation(frame);
    }
    const samples: number[] = new Array(frames);
    for (let frame = 0; frame < frames; frame++) {
        before(frame + warmupFrames);
        const start = process.hrtime.bigint();
        operation(frame + warmupFrames);
        samples[frame] = elapsedMs(start);
    }
    return summarize(samples);
}

function maybeGc(): void {
    const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
    gc?.();
}

function runCase(entityCount: number, options: ReturnType<typeof normalizeOptions>): BaselineCase {
    const totalFrames = options.frames + options.warmupFrames;
    const build = (): BenchWorld => buildWorld(entityCount, options.seed, totalFrames);

    const syncWorld = build();
    const sync = runMeasured(options.frames, options.warmupFrames,
        () => {}, (frame) => applyInput(syncWorld, frame));
    const input = { checksum: syncWorld.inputChecksum, values: totalFrames * entityCount * 2 };
    syncWorld.ecs.clear();

    const tickWorld = build();
    const tick = runMeasured(options.frames, options.warmupFrames,
        (frame) => applyInput(tickWorld, frame), () => tickWorld.ecs.update(1 / 60));
    tickWorld.ecs.clear();

    const selfWorld = build();
    let selfSink = 0;
    const selfLookup = runMeasured(options.frames, options.warmupFrames,
        (frame) => applyInput(selfWorld, frame), () => {
            selfSink ^= selfWorld.ecs.getSelfPlayer() ?? 0;
        });
    selfWorld.ecs.clear();

    const snapshotWorld = build();
    let snapshotSink = 0;
    maybeGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const snapshot = runMeasured(options.frames, options.warmupFrames,
        (frame) => applyInput(snapshotWorld, frame), () => {
            snapshotSink += snapshotPlayers(snapshotWorld.ecs).length;
        });
    maybeGc();
    const heapAfter = process.memoryUsage().heapUsed;
    snapshotWorld.ecs.clear();

    const renderWorld = build();
    const gfx = new GraphicsSink();
    const render = runMeasured(options.frames, options.warmupFrames,
        (frame) => applyInput(renderWorld, frame), () => drawHeadless(renderWorld.ecs, gfx));
    const renderOpsPerFrame = gfx.operations / totalFrames;
    const sinkChecksum = (gfx.checksum ^ selfSink ^ snapshotSink) >>> 0;
    renderWorld.ecs.clear();

    const frameWorld = build();
    const frameGfx = new GraphicsSink();
    let frameSelfSink = 0;
    const frame = runMeasured(options.frames, options.warmupFrames, () => {}, (frameIndex) => {
        applyInput(frameWorld, frameIndex);
        frameWorld.ecs.update(1 / 60);
        frameSelfSink ^= frameWorld.ecs.getSelfPlayer() ?? 0;
        // Keep the lookup and full rebuild in the same sample without changing
        // the production ECS state or allocating a second snapshot.
        drawHeadless(frameWorld.ecs, frameGfx);
    });
    frameWorld.ecs.clear();

    // The sync metric is intentionally retained in the JSON as an explicit
    // input/update baseline, even though the plan's primary comparisons are
    // tick/self/snapshot/render/frame.
    return {
        entityCount,
        seed: options.seed,
        frames: options.frames,
        warmupFrames: options.warmupFrames,
        input,
        inputSync: sync,
        tick,
        selfLookup,
        snapshot,
        render,
        frame,
        renderOpsPerFrame: round(renderOpsPerFrame),
        snapshotAllocationsPerFrame: entityCount + 1,
        // One object literal per entity plus the result array slot; this is an
        // estimate for comparisons, not a V8 allocator guarantee.
        snapshotBytesEstimatePerFrame: (entityCount + 1) * 64,
        heapDeltaBytes: heapAfter - heapBefore,
        sinkChecksum: (sinkChecksum ^ frameSelfSink) >>> 0,
    };
}

export function runClientPerformanceBaseline(options: PerformanceBaselineOptions = {}): PerformanceBaseline {
    const normalized = normalizeOptions(options);
    const cases = normalized.entityCounts.map((entityCount) => runCase(entityCount, normalized));
    return {
        schemaVersion: PERF_SCHEMA_VERSION,
        benchmark: "client-ballMove",
        runtime: { node: process.version, platform: process.platform, arch: process.arch },
        seed: normalized.seed,
        frames: normalized.frames,
        warmupFrames: normalized.warmupFrames,
        entityCounts: [...normalized.entityCounts],
        cases,
    };
}

function parseEntityCounts(raw: string): number[] {
    const values = raw.split(",").map((part) => Number(part.trim()));
    if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) {
        throw new Error("[perf] --entities expects comma-separated positive integers");
    }
    return values;
}

function printHuman(result: PerformanceBaseline): void {
    console.log(`client-ballMove baseline seed=${result.seed} frames=${result.frames} warmup=${result.warmupFrames}`);
    console.log("entities | tick p50/p99 ms | self p50/p99 ms | snapshot p50/p99 ms | render p50/p99 ms | frame p50/p99 ms");
    for (const item of result.cases) {
        const pair = (summary: TimingSummary): string => `${summary.p50Ms.toFixed(3)}/${summary.p99Ms.toFixed(3)}`;
        console.log(`${String(item.entityCount).padStart(8)} | ${pair(item.tick).padStart(17)} | ${pair(item.selfLookup).padStart(17)} | ${pair(item.snapshot).padStart(23)} | ${pair(item.render).padStart(20)} | ${pair(item.frame).padStart(19)}`);
    }
    console.log("Use --json (and optionally --output <file>) for a diffable artifact.");
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
    const { values } = parseArgs({
        args: argv,
        options: {
            seed: { type: "string", default: String(DEFAULT_PERF_SEED) },
            frames: { type: "string", default: String(DEFAULT_PERF_FRAMES) },
            warmup: { type: "string", default: String(DEFAULT_PERF_WARMUP_FRAMES) },
            entities: { type: "string", default: DEFAULT_ENTITY_COUNTS.join(",") },
            json: { type: "boolean", default: false },
            output: { type: "string" },
        },
        allowPositionals: false,
    });
    const result = runClientPerformanceBaseline({
        seed: Number(values.seed),
        frames: Number(values.frames),
        warmupFrames: Number(values.warmup),
        entityCounts: parseEntityCounts(values.entities),
    });
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (values.output) writeFileSync(values.output, json, "utf8");
    if (values.json) process.stdout.write(json);
    else printHuman(result);
}

const entry = basename(process.argv[1] ?? "");
if (entry === "client-perf-baseline.ts" || entry === "client-perf-baseline.js") {
    runCli().catch((error: unknown) => {
        console.error("[perf] baseline failed", error);
        process.exitCode = 1;
    });
}
