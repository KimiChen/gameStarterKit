/**
 * Headless client performance baseline contract.
 * Timing and heap values are intentionally treated as observations: host
 * scheduling and garbage collection make exact numbers unsuitable for tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    PERF_SCHEMA_VERSION,
    projectDeterministicBaseline,
    runClientPerformanceBaseline,
    type PerformanceBaselineArtifact,
    type TimingSummary,
} from "../../../tools/client-perf-baseline";

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
        [2, 2_408_549_445],
        [5, 3_032_544_629],
    ]);
    for (const item of first.cases) {
        const expectedValues = (OPTIONS.frames + OPTIONS.warmupFrames) * item.entityCount * 2;
        assert.equal(item.input.values, expectedValues);
        assert.equal(item.input.checksum, expectedChecksums.get(item.entityCount));
        assert.equal(item.renderOpsPerFrame, 3 + 6 * item.entityCount,
            "clear + border(rect/stroke) + six commands per player");
        assert.equal(item.snapshotAllocationsPerFrame, item.entityCount + 1);
        assert.equal(item.snapshotBytesEstimatePerFrame, (item.entityCount + 1) * 64);
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

test("client baseline：入库 deterministic artifact 与当前探针一致", () => {
    const artifact = JSON.parse(readFileSync(CHECKED_IN_ARTIFACT, "utf8")) as PerformanceBaselineArtifact;
    const result = runClientPerformanceBaseline(artifact.workload);
    assert.deepEqual(projectDeterministicBaseline(result), artifact);
});
