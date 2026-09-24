import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Pure ESM preview tool has no TypeScript declaration.
import { assertVfxDraws, parseVfxPerfArgs } from "../../../tools/creator-preview/vfx-perf.mjs";

function evidence() {
    return { vfx: { error: "", productionMaxEffects: 48, stressMaxEffects: 50,
        population: { active: 50, pending: 0 }, particles: Array.from({ length: 50 }, () => ({
            active: true, playing: true, count: 30, capacity: 50, scheduled: true,
            authored: { size: 0.25, speed: 2, rate: 30, lifetime: 1 },
        })) }, skinPopulation: { active: 100, failed: 0 }, gfx: {},
        units: Array.from({ length: 100 }, (_, i) => {
            const texture = i === 99 ? 2 : 1;
            return { baked: true, playing: true, clip: "walk", renderers: [{ type: 2, texture, textureFormat: 44, uploadedClip: "walk",
                subModels: [{ indexBuffer: 8, texture, passes: [{ id: texture + 10, instancing: true }] }] }] };
        }), batches: [
            { pass: 11, texture: 1, indexBuffer: 8, count: 99, uploaded: 99, stride: 80 },
            { pass: 12, texture: 2, indexBuffer: 8, count: 1, uploaded: 1, stride: 80 },
        ],
    };
}
test("Vfx preview: explicit high stress load, existing WebGL options and unknown options fail closed", () => {
    assert.equal(parseVfxPerfArgs(["--perf", "--vfx", "--expect-webgl", "1", "--force-webgl1"]).forceWebgl1, true);
    assert.throws(() => parseVfxPerfArgs(["--vfx"]), /requires --perf/);
    assert.throws(() => parseVfxPerfArgs(["--perf", "--vfx", "--quality", "low"]), /stress/);
    assert.throws(() => parseVfxPerfArgs(["--perf", "--vfx", "--skinned"]), /Unknown/);
});
test("Vfx preview: pacing override is explicit, bounded and rejects duplicate options", () => {
    assert.equal(parseVfxPerfArgs(["--perf", "--vfx"]).frameRate, null);
    for (const rate of [60, 120]) assert.equal(parseVfxPerfArgs(["--perf", "--vfx", "--frame-rate", String(rate)]).frameRate, rate);
    for (const rate of ["0", "30", "61", "Infinity", "120fps", "--new-window"]) {
        assert.throws(() => parseVfxPerfArgs(["--perf", "--vfx", "--frame-rate", rate]), /requires 60 or 120/);
    }
    assert.throws(() => parseVfxPerfArgs(["--perf", "--vfx", "--frame-rate"]), /requires 60 or 120/);
    assert.throws(() => parseVfxPerfArgs(["--perf", "--vfx", "--frame-rate", "120", "--frame-rate", "60"]), /Unknown/);
});
test("Vfx preview: requires actual populated particle draws and a simultaneous 100-unit skinned load", () => {
    assert.equal(assertVfxDraws(evidence()).particles, 1500);
    for (const property of ["active", "playing", "scheduled"] as const) {
        const state = evidence(); state.vfx.particles[0][property] = false;
        assert.throws(() => assertVfxDraws(state), /playing, populated and submitted/);
    }
    const empty = evidence(); empty.vfx.particles[0].count = 0; assert.throws(() => assertVfxDraws(empty), /populated/);
    const count = evidence(); count.vfx.population.active--; assert.throws(() => assertVfxDraws(count), /population/);
    const missing = evidence(); missing.skinPopulation.active = 0; assert.throws(() => assertVfxDraws(missing), /alongside/);
    const budget = evidence(); budget.vfx.productionMaxEffects = 50; assert.throws(() => assertVfxDraws(budget), /budgets/);
    const ignored = evidence(); ignored.vfx.particles[0].authored.size = 1;
    assert.throws(() => assertVfxDraws(ignored), /author prefab/);
});
