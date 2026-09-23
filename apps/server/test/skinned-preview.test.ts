import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Pure ESM preview tool has no TypeScript declaration.
import { assertSkinnedDraws, parseSkinnedPerfArgs } from "../../../tools/creator-preview/skinned-perf.mjs";

function evidence() {
    const units = Array.from({ length: 100 }, (_, i) => {
        const texture = i === 99 ? 2 : 1;
        return { baked: true, playing: true, clip: i % 2 ? "walk" : "idle", renderers: [{ type: 2, texture, textureFormat: 44,
            uploadedClip: i % 2 ? "walk" : "idle", subModels: [{ indexBuffer: 8, texture,
                passes: [{ id: texture + 10, instancing: true, direct: false }] }] }] };
    });
    return { population: { active: 100, failed: 0 }, units, gfx: {}, batches: [
        { pass: 11, texture: 1, indexBuffer: 8, count: 99, uploaded: 99, stride: 80 },
        { pass: 12, texture: 2, indexBuffer: 8, count: 1, uploaded: 1, stride: 80 },
    ] };
}

test("Skinned preview: requires explicit RGBA8 fault mode and exact 100-unit high fixture", () => {
    assert.equal(parseSkinnedPerfArgs(["--perf", "--skinned"]).rgba8, false);
    assert.equal(parseSkinnedPerfArgs(["--perf", "--skinned", "--rgba8", "--force-webgl1", "--expect-webgl", "1"]).rgba8, true);
    assert.throws(() => parseSkinnedPerfArgs(["--skinned"]), /requires --perf/);
    assert.throws(() => parseSkinnedPerfArgs(["--perf", "--rgba8"]), /force-webgl1/);
    assert.throws(() => parseSkinnedPerfArgs(["--perf", "--quality", "low"]), /100-unit/);
});

test("Skinned preview: verifies submitted texture bindings and uploaded counts, rejects culled or merged units", () => {
    assert.equal(assertSkinnedDraws(evidence()).groups.length, 2);
    const wrongTexture = evidence(); wrongTexture.batches[1].texture = 1;
    assert.throws(() => assertSkinnedDraws(wrongTexture), /grouping/);
    const wrongBinding = evidence(); wrongBinding.units[99].renderers[0].subModels[0].texture = 1;
    assert.throws(() => assertSkinnedDraws(wrongBinding), /bound joint texture/);
    const culled = evidence(); culled.units[90].renderers[0].subModels[0].passes = [];
    assert.throws(() => assertSkinnedDraws(culled), /color draw queues/);
    const counts = evidence(); counts.batches[0].uploaded--;
    assert.throws(() => assertSkinnedDraws(counts), /not uploaded/);
    const format = evidence(); format.units[0].renderers[0].textureFormat = 35;
    assert.throws(() => assertSkinnedDraws(format), /format/);
});

test("Skinned preview: playing wrong uploaded clip and realtime instancing cannot pass", () => {
    const wrong = evidence(); wrong.units[0].renderers[0].uploadedClip = "unrelated";
    assert.throws(() => assertSkinnedDraws(wrong), /uploaded clip/);
    const realtime = evidence(); realtime.units[99].baked = false;
    Object.assign(realtime.units[99].renderers[0], { type: 1, matrices: [[1, 2, 3]] });
    assert.throws(() => assertSkinnedDraws(realtime, { realtime: 1, textures: 1 }), /non-instanced/);
});
