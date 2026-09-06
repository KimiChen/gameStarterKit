/**
 * Headless client performance baseline contract.
 * Timing and heap values are intentionally treated as observations: host
 * scheduling and garbage collection make exact numbers unsuitable for tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    GraphicsSink,
    PERF_SCHEMA_VERSION,
    projectDeterministicBaseline,
    renderBallMoveHeadless,
    runClientPerformanceBaseline,
    type PerformanceBaselineArtifact,
    type TimingSummary,
} from "../../../tools/client-perf-baseline";
import type { BallMoveGraphicsSink } from "../src/logic/rooms/ballMove/BallMoveGameplay";
import { GameECS } from "../src/logic/rooms/ballMove/GameECS";

const CHECKED_IN_ARTIFACT = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../docs/perf/client-ballMove-baseline.json",
);
const OPTIONS = {
    seed: 12_345,
    frames: 4,
    warmupFrames: 2,
    entityCounts: [2, 5],
} as const;

type RenderTrace = Array<readonly [operation: string, ...values: number[]]>;
type LoaderModule = {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
interface RgbaColor {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
}

class TraceGraphics<TColor> implements BallMoveGraphicsSink<TColor> {
    readonly trace: RenderTrace = [];
    private currentLineWidth = 0;
    private currentStrokeColor!: TColor;
    private currentFillColor!: TColor;

    constructor(private readonly colorValues: (color: TColor) => readonly number[]) {}

    get lineWidth(): number { return this.currentLineWidth; }
    set lineWidth(value: number) {
        this.currentLineWidth = value;
        this.trace.push(["lineWidth", value]);
    }

    get strokeColor(): TColor { return this.currentStrokeColor; }
    set strokeColor(value: TColor) {
        this.currentStrokeColor = value;
        this.trace.push(["strokeColor", ...this.colorValues(value)]);
    }

    get fillColor(): TColor { return this.currentFillColor; }
    set fillColor(value: TColor) {
        this.currentFillColor = value;
        this.trace.push(["fillColor", ...this.colorValues(value)]);
    }

    clear(): void { this.trace.push(["clear"]); }
    rect(x: number, y: number, width: number, height: number): void {
        this.trace.push(["rect", x, y, width, height]);
    }
    circle(x: number, y: number, radius: number): void {
        this.trace.push(["circle", x, y, radius]);
    }
    stroke(): void { this.trace.push(["stroke"]); }
    fill(): void { this.trace.push(["fill"]); }
}

function packedRgbaValues(value: number): readonly number[] {
    return [
        Math.floor(value / 0x1_000000) % 256,
        Math.floor(value / 0x1_0000) % 256,
        Math.floor(value / 0x100) % 256,
        value % 256,
    ];
}

function graphicsChecksum(run: (graphics: GraphicsSink) => void): number {
    const graphics = new GraphicsSink();
    run(graphics);
    return graphics.checksum;
}

async function loadBallMoveViewRuntime(): Promise<{
    BallMoveView: new (host: any, dispatchInput: (input: unknown) => void) => {
        mount(): void;
        render(world: GameECS): void;
        unmount(): void;
    };
    createHost(): any;
    getGraphics(): TraceGraphics<RgbaColor>;
}> {
    class FakeColor implements RgbaColor {
        constructor(
            readonly r: number,
            readonly g: number,
            readonly b: number,
            readonly a: number,
        ) {}
    }

    class FakeVec3 {
        x = 0;
        y = 0;
        z = 0;
        set(x: number, y: number, z: number): this {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }
    }

    class FakeUITransform {
        convertToNodeSpaceAR(value: FakeVec3): FakeVec3 { return value; }
    }

    let mountedGraphics: FakeGraphics | null = null;
    class FakeGraphics extends TraceGraphics<FakeColor> {
        node!: FakeNode;
        constructor() { super((color) => [color.r, color.g, color.b, color.a]); }
    }

    class FakeNode {
        layer = 0;
        destroyed = false;
        readonly children: FakeNode[] = [];
        readonly components: unknown[] = [];
        readonly position = { x: 0, y: 0, z: 0 };
        constructor(readonly name = "node") {}

        addChild(child: FakeNode): void { this.children.push(child); }
        addComponent<T>(Component: new () => T): T {
            const component = new Component();
            if (component instanceof FakeGraphics) {
                component.node = this;
                mountedGraphics = component;
            }
            this.components.push(component);
            return component;
        }
        /** 视图会给「离开」按钮取 host 的 UITransform 并摆位；桩要覆盖到这两个面。 */
        getComponent<T>(Component: new () => T): T | null {
            return (this.components.find((component) => component instanceof Component) as T | undefined) ?? null;
        }
        setPosition(x: number, y: number, z = 0): void {
            this.position.x = x; this.position.y = y; this.position.z = z;
        }
        on(): void {}
        off(): void {}
        destroy(): void { this.destroyed = true; }
    }

    class FakeLabel {
        string = "";
        fontSize = 0;
        lineHeight = 0;
        color: FakeColor | null = null;
    }

    const fakeCc = {
        Color: FakeColor,
        EventTouch: class {},
        Graphics: FakeGraphics,
        Input: {
            EventType: {
                TOUCH_START: "touch-start",
                TOUCH_MOVE: "touch-move",
                TOUCH_END: "touch-end",
                TOUCH_CANCEL: "touch-cancel",
            },
        },
        Label: FakeLabel,
        Node: Object.assign(FakeNode, { EventType: { TOUCH_END: "touch-end" } }),
        UITransform: FakeUITransform,
        Vec3: FakeVec3,
        input: { on(): void {}, off(): void {} },
    };

    const require = createRequire(import.meta.url);
    const moduleApi = require("node:module") as LoaderModule;
    const originalLoad = moduleApi._load;
    moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
        if (request === "cc") return fakeCc;
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const { BallMoveView } = await import("../src/view/rooms/ballMove/BallMoveView");
        return {
            BallMoveView,
            createHost: () => new FakeNode("host"),
            getGraphics: () => {
                if (!mountedGraphics) throw new Error("BallMoveView did not mount Graphics");
                return mountedGraphics;
            },
        };
    } finally {
        moduleApi._load = originalLoad;
    }
}

function assertTimingSummary(summary: TimingSummary, frames: number): void {
    assert.equal(summary.samples, frames);
    for (const value of [
        summary.totalMs,
        summary.meanMs,
        summary.minMs,
        summary.p50Ms,
        summary.p95Ms,
        summary.p99Ms,
        summary.maxMs,
    ]) {
        assert.ok(Number.isFinite(value) && value >= 0, `invalid timing value: ${value}`);
    }
    assert.ok(summary.minMs <= summary.p50Ms);
    assert.ok(summary.p50Ms <= summary.p95Ms);
    assert.ok(summary.p95Ms <= summary.p99Ms);
    assert.ok(summary.p99Ms <= summary.maxMs);
}

function stableProjection(result: ReturnType<typeof runClientPerformanceBaseline>): unknown {
    return projectDeterministicBaseline(result).cases;
}

test("client baseline：固定 seed/input 的结构结果可重复，且覆盖 ECS/渲染/分配探针", () => {
    const first = runClientPerformanceBaseline(OPTIONS);
    const second = runClientPerformanceBaseline(OPTIONS);

    assert.equal(first.schemaVersion, PERF_SCHEMA_VERSION);
    assert.equal(first.benchmark, "client-ballMove");
    assert.equal(first.seed, OPTIONS.seed);
    assert.equal(first.frames, OPTIONS.frames);
    assert.equal(first.warmupFrames, OPTIONS.warmupFrames);
    assert.deepEqual(first.entityCounts, [...OPTIONS.entityCounts]);
    assert.deepEqual(stableProjection(first), stableProjection(second));

    const expectedChecksums = new Map([
        [2, 2_324_180_182],
        [5, 4_190_023_200],
    ]);
    for (const item of first.cases) {
        const expectedValues = (OPTIONS.frames + OPTIONS.warmupFrames) * item.entityCount * 2;
        assert.equal(item.input.values, expectedValues);
        assert.equal(item.input.checksum, expectedChecksums.get(item.entityCount));
        assert.equal(item.renderOpsPerFrame, 5 + 9 * item.entityCount,
            "clear + border style/geometry + color and geometry commands per player");
        assert.equal(item.snapshotAllocationsPerFrame, item.entityCount + 1);
        assert.equal(item.snapshotBytesEstimatePerFrame, (item.entityCount + 1) * 64);
        assert.ok(Number.isSafeInteger(item.renderChecksum) && item.renderChecksum >= 0);
        assert.ok(Number.isSafeInteger(item.frameRenderChecksum) && item.frameRenderChecksum >= 0);
        assert.ok(Number.isSafeInteger(item.sinkChecksum) && item.sinkChecksum >= 0);
        assert.notEqual(item.frameRenderChecksum, item.renderChecksum,
            "combined frame must project its own post-tick render trace");
        assert.ok(item.heapDeltaBytes === null || Number.isFinite(item.heapDeltaBytes));
        assertTimingSummary(item.inputSync, OPTIONS.frames);
        assertTimingSummary(item.tick, OPTIONS.frames);
        assertTimingSummary(item.selfLookup, OPTIONS.frames);
        assertTimingSummary(item.snapshot, OPTIONS.frames);
        assertTimingSummary(item.render, OPTIONS.frames);
        assertTimingSummary(item.frame, OPTIONS.frames);
    }
});

test("client baseline：不同 seed 会改变输入 tape 校验和", () => {
    const first = runClientPerformanceBaseline({ ...OPTIONS, seed: 1, entityCounts: [2] });
    const second = runClientPerformanceBaseline({ ...OPTIONS, seed: 2, entityCounts: [2] });
    assert.notEqual(first.cases[0].input.checksum, second.cases[0].input.checksum);
});

test("client baseline：Graphics checksum 锁定 Float64、opcode、顺序与样式", () => {
    assert.notEqual(
        graphicsChecksum((graphics) => graphics.rect(1, 2, 3, 4)),
        graphicsChecksum((graphics) => graphics.rect(2, 2, 3, 4)),
        "integer geometry must contribute its complete Float64 bytes",
    );
    assert.notEqual(
        graphicsChecksum((graphics) => graphics.rect(1.25, 2.5, 3.75, 4.125)),
        graphicsChecksum((graphics) => graphics.rect(2.5, 1.25, 3.75, 4.125)),
        "parameter positions must not collapse into a sum",
    );
    assert.notEqual(
        graphicsChecksum((graphics) => graphics.clear()),
        graphicsChecksum((graphics) => graphics.stroke()),
        "zero-argument command identity must enter the checksum",
    );
    assert.notEqual(
        graphicsChecksum((graphics) => { graphics.clear(); graphics.fill(); }),
        graphicsChecksum((graphics) => { graphics.fill(); graphics.clear(); }),
        "command order must be non-commutative",
    );
    assert.notEqual(
        graphicsChecksum((graphics) => { graphics.lineWidth = 2; graphics.strokeColor = 1; graphics.fillColor = 2; }),
        graphicsChecksum((graphics) => { graphics.lineWidth = 3; graphics.strokeColor = 2; graphics.fillColor = 1; }),
        "lineWidth and both colors must enter the checksum",
    );
});

test("client baseline：动态执行真实 BallMoveView 并与无头探针比较完整有序 trace", async () => {
    const runtime = await loadBallMoveViewRuntime();
    const ecs = new GameECS();
    ecs.addPlayer({ id: "self", name: "Self", x: 100.5, y: 200.25, hp: 75, maxHp: 100, alive: true }, true);
    ecs.addPlayer({ id: "other", name: "Other", x: 500.75, y: 600.5, hp: 50, maxHp: 200, alive: true }, false);
    ecs.addPlayer({ id: "dead", name: "Dead", x: 300, y: 400, hp: 10, maxHp: 0, alive: false }, false);

    const view = new runtime.BallMoveView(runtime.createHost(), () => {});
    view.mount();
    view.render(ecs);
    const viewTrace = runtime.getGraphics().trace;

    const headless = new TraceGraphics<number>(packedRgbaValues);
    renderBallMoveHeadless(ecs, headless);
    assert.deepEqual(viewTrace, headless.trace);
    assert.deepEqual(viewTrace, [
        ["clear"],
        ["lineWidth", 2],
        ["strokeColor", 120, 120, 120, 255],
        ["rect", -350, -750, 700, 1500],
        ["stroke"],
        ["fillColor", 60, 200, 120, 255],
        ["circle", -249.5, -549.75, 20],
        ["fill"],
        ["fillColor", 40, 40, 40, 255],
        ["rect", -274.5, -521.75, 50, 6],
        ["fill"],
        ["fillColor", 220, 60, 60, 255],
        ["rect", -274.5, -521.75, 37.5, 6],
        ["fill"],
        ["fillColor", 240, 150, 60, 255],
        ["circle", 150.75, -149.5, 20],
        ["fill"],
        ["fillColor", 40, 40, 40, 255],
        ["rect", 125.75, -121.5, 50, 6],
        ["fill"],
        ["fillColor", 220, 60, 60, 255],
        ["rect", 125.75, -121.5, 12.5, 6],
        ["fill"],
        ["fillColor", 100, 100, 100, 255],
        ["circle", -50, -350, 20],
        ["fill"],
        ["fillColor", 40, 40, 40, 255],
        ["rect", -75, -322, 50, 6],
        ["fill"],
        ["fillColor", 220, 60, 60, 255],
        ["rect", -75, -322, 0, 6],
        ["fill"],
    ]);

    view.unmount();
    ecs.clear();
});

test("client baseline：入库 deterministic artifact 与当前探针一致", () => {
    const artifact = JSON.parse(readFileSync(CHECKED_IN_ARTIFACT, "utf8")) as PerformanceBaselineArtifact;
    const result = runClientPerformanceBaseline(artifact.workload);
    assert.deepEqual(projectDeterministicBaseline(result), artifact);
});
