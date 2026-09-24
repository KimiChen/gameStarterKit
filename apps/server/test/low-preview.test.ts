import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
// @ts-expect-error Pure ESM preview tool has no TypeScript declaration.
import { assertLowDraws, lowFaultSource, parseLowPerfArgs } from "../../../tools/creator-preview/low-perf.mjs";

function evidence(kind = "realtime", far = false): any {
    const count = kind === "realtime" || kind === "no-instancing" ? 25 : 50;
    return { quality: { tier: "low", maxEffects: 8, shadows: "off", details: false, textureFormat: "png" },
        population: { active: count, pending: 0, failed: 0 }, low: { vfxError: "", effects: far ? 0 : 8, png: "native/checker.png",
            particles: Array.from({ length: far ? 0 : 8 }, () => ({ playing: true, count: 20, scheduled: true })) },
        units: Array.from({ length: count }, () => far && kind === "realtime"
            ? { presentation: "billboard", billboards: [{ enabled: true, scheduled: true,
                passes: [{ instancing: false, direct: true }], width: 1.5, height: 2 }] }
            : { playing: true, baked: kind !== "realtime", clip: "walk", renderers: [{ type: kind === "realtime" ? 1 : 2,
                matrices: [[1]], texture: 7, textureFormat: kind === "rgba8" ? 35 : 44, uploadedClip: "walk",
                subModels: [{ indexBuffer: 9, texture: 7, passes: [{ id: 11, instancing: count === 50, direct: count === 25 }] }] }] }),
        batches: count === 50 ? [{ pass: 11, indexBuffer: 9, texture: 7, count, uploaded: count }] : [] };
}

test("Low preview: rejects unsubmitted billboards, instanced realtime, wrong PNG/limits and wrong actual RGBA8", () => {
    for (const kind of ["baked", "rgba8", "no-instancing", "realtime"]) assert.doesNotThrow(() => assertLowDraws(evidence(kind), kind));
    const realtime = evidence(); realtime.units[0].renderers[0].subModels[0].passes[0].instancing = true;
    assert.throws(() => assertLowDraws(realtime, "realtime"), /Direct fallback/);
    const rgba8 = evidence("rgba8"); rgba8.units[0].renderers[0].textureFormat = 44;
    assert.throws(() => assertLowDraws(rgba8, "rgba8"), /joint texture/);
    const far = evidence("realtime", true); assert.doesNotThrow(() => assertLowDraws(far, "realtime", true));
    far.units[0].billboards[0].passes[0].direct = false; assert.throws(() => assertLowDraws(far, "realtime", true), /real billboards/);
    const count = evidence(); count.low.effects = 50; assert.throws(() => assertLowDraws(count, "realtime"), /budget/);
    const png = evidence(); png.low.png = "native/checker.astc"; assert.throws(() => assertLowDraws(png, "realtime"), /PNG/);
    const notSubmitted = evidence("baked"); notSubmitted.batches[0].uploaded = 0;
    assert.throws(() => assertLowDraws(notSubmitted, "baked"), /upload/);
});

test("Low preview: capability injection is confined to actual extension/parameter queries before boot", () => {
    for (const kind of ["baked", "rgba8", "no-instancing", "realtime"]) {
        class WebGL {
            MAX_VERTEX_TEXTURE_IMAGE_UNITS = 35660;
            getParameter(name: number) { return name === this.MAX_VERTEX_TEXTURE_IMAGE_UNITS ? 16 : 2048; }
            getSupportedExtensions() { return ["WEBGL_compressed_texture_astc", "ANGLE_instanced_arrays", "OES_texture_float", "EXT_unrelated"]; }
            getExtension(name: string) { return this.getSupportedExtensions().includes(name) ? {} : null; }
        }
        const context = vm.createContext({ WebGLRenderingContext: WebGL }); vm.runInContext(lowFaultSource(kind), context);
        const gl = new WebGL(); assert.equal(gl.getExtension("WEBGL_compressed_texture_astc"), null);
        assert.equal(gl.getParameter(123), 2048); assert.ok(gl.getExtension("OES_texture_float")); assert.ok(gl.getExtension("EXT_unrelated"));
        assert.equal(gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS), kind === "realtime" ? 0 : 16);
        assert.equal(gl.getExtension("ANGLE_instanced_arrays") !== null, kind !== "no-instancing");
        assert.equal(context.__sc4LowFault.beforeCocos, true); assert.equal(context.__sc4LowFault.artificial, true);
    }
});

test("Low preview: requires fresh WebGL1 and cannot accept a high stress run as low evidence", () => {
    const args = ["--perf", "--low-case", "rgba8", "--expect-webgl", "1", "--force-webgl1"];
    assert.equal(parseLowPerfArgs(args).quality, "low");
    assert.throws(() => parseLowPerfArgs([...args, "--quality", "high"]), /Low evidence/);
    assert.throws(() => parseLowPerfArgs(["--low-case", "baked"]), /requires --perf/);
    assert.throws(() => parseLowPerfArgs(["--perf", "--low-case", "wechat"]), /requires baked/);
});
