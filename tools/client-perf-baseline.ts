/**
 * Headless client performance baseline for the ballMove ECS/render path.
 *
 * The Cocos Graphics implementation cannot be loaded in Node, so the render
 * phase uses a deliberately allocation-free Graphics-shaped sink through the
 * same `renderBallMoveWorld` function called by BallMoveView.render.
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
import {
    renderBallMoveWorld,
    type BallMoveGraphicsSink,
    type BallMoveRenderPalette,
} from "../apps/client/src/logic/rooms/ballMove/BallMoveGameplay";
import type { IPlayerState } from "../apps/client/src/shared/gameplays/index";
import { MAP_HEIGHT, MAP_WIDTH } from "../apps/client/src/shared/constants/game";

export const PERF_SCHEMA_VERSION = 2 as const;
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
    readonly renderChecksum: number;
    readonly frameRenderChecksum: number;
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

/**
 * The checked-in baseline deliberately contains only deterministic observations.
 * Host-dependent timing distributions and heap measurements remain available in
 * `PerformanceBaseline`, but are excluded from this projection so verification
 * does not become a machine-specific performance gate.
 */
export interface DeterministicBaselineCase {
    readonly entityCount: number;
    readonly input: {
        readonly checksum: number;
        readonly values: number;
    };
    readonly renderOpsPerFrame: number;
    readonly snapshotAllocationsPerFrame: number;
    readonly snapshotBytesEstimatePerFrame: number;
    readonly renderChecksum: number;
    readonly frameRenderChecksum: number;
    readonly sinkChecksum: number;
}

export interface PerformanceBaselineArtifact {
    readonly schemaVersion: typeof PERF_SCHEMA_VERSION;
    readonly benchmark: "client-ballMove";
    readonly workload: {
        readonly seed: number;
        readonly frames: number;
        readonly warmupFrames: number;
        readonly entityCounts: readonly number[];
    };
    readonly cases: readonly DeterministicBaselineCase[];
}

/** Project a run onto fields that are expected to be stable across hosts. */
export function projectDeterministicBaseline(result: PerformanceBaseline): PerformanceBaselineArtifact {
    return {
        schemaVersion: result.schemaVersion,
        benchmark: result.benchmark,
        workload: {
            seed: result.seed,
            frames: result.frames,
            warmupFrames: result.warmupFrames,
            entityCounts: [...result.entityCounts],
        },
        cases: result.cases.map((item) => ({
            entityCount: item.entityCount,
            input: { ...item.input },
            renderOpsPerFrame: item.renderOpsPerFrame,
            snapshotAllocationsPerFrame: item.snapshotAllocationsPerFrame,
            snapshotBytesEstimatePerFrame: item.snapshotBytesEstimatePerFrame,
            renderChecksum: item.renderChecksum,
            frameRenderChecksum: item.frameRenderChecksum,
            sinkChecksum: item.sinkChecksum,
        })),
    };
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

const CHECKSUM_OFFSET_BASIS = 0x811c9dc5;
const CHECKSUM_PRIME = 0x01000193;

const ChecksumOpcode = {
    GraphicsClear: 1,
    GraphicsLineWidth: 2,
    GraphicsStrokeColor: 3,
    GraphicsFillColor: 4,
    GraphicsRect: 5,
    GraphicsCircle: 6,
    GraphicsStroke: 7,
    GraphicsFill: 8,
    InputX: 9,
    InputY: 10,
    SelfLookup: 11,
    SnapshotLength: 12,
    FrameSelfLookup: 13,
    ProbeRender: 64,
    ProbeSelf: 65,
    ProbeSnapshot: 66,
    ProbeFrameRender: 67,
    ProbeFrameSelf: 68,
} as const;

/** FNV-1a over tagged events and canonical little-endian Float64 arguments. */
class StreamChecksum {
    private current = CHECKSUM_OFFSET_BASIS;
    private readonly bytes = new Uint8Array(8);
    private readonly view = new DataView(this.bytes.buffer);

    get value(): number {
        return this.current >>> 0;
    }

    writeOpcode(opcode: number): void {
        this.writeByte(opcode);
    }

    writeFloat64(value: number): void {
        this.view.setFloat64(0, value, true);
        for (let index = 0; index < this.bytes.length; index++) this.writeByte(this.bytes[index]);
    }

    private writeByte(value: number): void {
        this.current = Math.imul(this.current ^ (value & 0xff), CHECKSUM_PRIME) >>> 0;
    }
}

function writeNumberEvent(checksum: StreamChecksum, opcode: number, value: number): void {
    checksum.writeOpcode(opcode);
    checksum.writeFloat64(value);
}

function combineProbeChecksums(parts: ReadonlyArray<readonly [number, number]>): number {
    const checksum = new StreamChecksum();
    for (const [opcode, value] of parts) writeNumberEvent(checksum, opcode, value);
    return checksum.value;
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
    const inputChecksum = new StreamChecksum();
    for (let frame = 0; frame < totalFrames; frame++) {
        for (let i = 0; i < entityCount; i++) {
            const offset = (frame * entityCount + i) * 2;
            const x = rng.next() * MAP_WIDTH;
            const y = rng.next() * MAP_HEIGHT;
            inputs[offset] = x;
            inputs[offset + 1] = y;
            writeNumberEvent(inputChecksum, ChecksumOpcode.InputX, x);
            writeNumberEvent(inputChecksum, ChecksumOpcode.InputY, y);
        }
    }
    return { ecs, states, inputs, inputChecksum: inputChecksum.value };
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
 * BallMoveView.render currently iterates the ECS directly; this probe keeps the
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

/** Minimal Graphics-shaped sink used by the production render command function. */
export class GraphicsSink implements BallMoveGraphicsSink<number> {
    operations = 0;
    private readonly digest = new StreamChecksum();
    private currentLineWidth = 0;
    private currentStrokeColor = 0;
    private currentFillColor = 0;

    get checksum(): number { return this.digest.value; }

    get lineWidth(): number { return this.currentLineWidth; }
    set lineWidth(value: number) {
        this.currentLineWidth = value;
        this.begin(ChecksumOpcode.GraphicsLineWidth);
        this.digest.writeFloat64(value);
    }

    get strokeColor(): number { return this.currentStrokeColor; }
    set strokeColor(value: number) {
        this.currentStrokeColor = value;
        this.begin(ChecksumOpcode.GraphicsStrokeColor);
        this.digest.writeFloat64(value);
    }

    get fillColor(): number { return this.currentFillColor; }
    set fillColor(value: number) {
        this.currentFillColor = value;
        this.begin(ChecksumOpcode.GraphicsFillColor);
        this.digest.writeFloat64(value);
    }

    clear(): void { this.begin(ChecksumOpcode.GraphicsClear); }
    rect(x: number, y: number, width: number, height: number): void {
        this.begin(ChecksumOpcode.GraphicsRect);
        this.digest.writeFloat64(x);
        this.digest.writeFloat64(y);
        this.digest.writeFloat64(width);
        this.digest.writeFloat64(height);
    }
    circle(x: number, y: number, radius: number): void {
        this.begin(ChecksumOpcode.GraphicsCircle);
        this.digest.writeFloat64(x);
        this.digest.writeFloat64(y);
        this.digest.writeFloat64(radius);
    }
    stroke(): void { this.begin(ChecksumOpcode.GraphicsStroke); }
    fill(): void { this.begin(ChecksumOpcode.GraphicsFill); }

    private begin(opcode: number): void {
        this.operations++;
        this.digest.writeOpcode(opcode);
    }
}

function rgba(r: number, g: number, b: number, a: number): number {
    return (((r * 256) + g) * 256 + b) * 256 + a;
}

const HEADLESS_PALETTE: BallMoveRenderPalette<number> = {
    border: rgba(120, 120, 120, 255),
    dead: rgba(100, 100, 100, 255),
    self: rgba(60, 200, 120, 255),
    other: rgba(240, 150, 60, 255),
    hpBackground: rgba(40, 40, 40, 255),
    hp: rgba(220, 60, 60, 255),
};

/** Execute BallMoveView.render's production geometry without loading Cocos. */
export function renderBallMoveHeadless(ecs: GameECS, graphics: BallMoveGraphicsSink<number>): void {
    renderBallMoveWorld(ecs, graphics, HEADLESS_PALETTE);
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
    const selfSink = new StreamChecksum();
    const selfLookup = runMeasured(options.frames, options.warmupFrames,
        (frame) => applyInput(selfWorld, frame), () => {
            writeNumberEvent(selfSink, ChecksumOpcode.SelfLookup, selfWorld.ecs.getSelfPlayer() ?? -1);
        });
    selfWorld.ecs.clear();

    const snapshotWorld = build();
    const snapshotSink = new StreamChecksum();
    maybeGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const snapshot = runMeasured(options.frames, options.warmupFrames,
        (frame) => applyInput(snapshotWorld, frame), () => {
            writeNumberEvent(snapshotSink, ChecksumOpcode.SnapshotLength, snapshotPlayers(snapshotWorld.ecs).length);
        });
    maybeGc();
    const heapAfter = process.memoryUsage().heapUsed;
    snapshotWorld.ecs.clear();

    const renderWorld = build();
    const gfx = new GraphicsSink();
    const render = runMeasured(options.frames, options.warmupFrames,
        (frame) => applyInput(renderWorld, frame), () => renderBallMoveHeadless(renderWorld.ecs, gfx));
    const renderOpsPerFrame = gfx.operations / totalFrames;
    const renderChecksum = gfx.checksum;
    renderWorld.ecs.clear();

    const frameWorld = build();
    const frameGfx = new GraphicsSink();
    const frameSelfSink = new StreamChecksum();
    const frame = runMeasured(options.frames, options.warmupFrames, () => {}, (frameIndex) => {
        applyInput(frameWorld, frameIndex);
        frameWorld.ecs.update(1 / 60);
        writeNumberEvent(frameSelfSink, ChecksumOpcode.FrameSelfLookup, frameWorld.ecs.getSelfPlayer() ?? -1);
        // Keep the lookup and full rebuild in the same sample without changing
        // the production ECS state or allocating a second snapshot.
        renderBallMoveHeadless(frameWorld.ecs, frameGfx);
    });
    const frameRenderChecksum = frameGfx.checksum;
    frameWorld.ecs.clear();

    const sinkChecksum = combineProbeChecksums([
        [ChecksumOpcode.ProbeRender, renderChecksum],
        [ChecksumOpcode.ProbeSelf, selfSink.value],
        [ChecksumOpcode.ProbeSnapshot, snapshotSink.value],
        [ChecksumOpcode.ProbeFrameRender, frameRenderChecksum],
        [ChecksumOpcode.ProbeFrameSelf, frameSelfSink.value],
    ]);

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
        renderChecksum,
        frameRenderChecksum,
        sinkChecksum,
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
            deterministic: { type: "boolean", default: false },
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
    const payload = values.deterministic ? projectDeterministicBaseline(result) : result;
    const json = `${JSON.stringify(payload, null, 2)}\n`;
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
