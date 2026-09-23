import assert from "node:assert/strict";
import { test } from "node:test";
import {
    cloneGlobals,
    normalizeGlobalsPatch,
    resolveGlobals,
    type Stage3DGlobalsPatch,
    type Stage3DGlobalsState,
} from "../src/view/scene3d/stage3dGlobals";

function baseline(): Stage3DGlobalsState {
    return {
        skybox: { enabled: false, envmap: null, diffuseMap: null, reflectionMap: null, lighting: "hemisphere" },
        toneMapping: "default",
        fog: { enabled: false, type: "linear", density: 0.1, start: -10, end: -20 },
        ambient: { skyIllum: 20000 },
        shadows: { enabled: false, kind: "planar" },
    };
}

function normalizeUnknown(value: unknown): unknown {
    return Reflect.apply(normalizeGlobalsPatch, undefined, [value]);
}

function cloneUnknown(value: unknown): unknown {
    return Reflect.apply(cloneGlobals, undefined, [value]);
}

test("globals merge each nested field in token order without replacing its siblings", () => {
    const original = baseline();
    const patches: Stage3DGlobalsPatch[] = [
        { toneMapping: "linear", fog: { enabled: true, density: 0.4 }, shadows: { enabled: true } },
        { fog: { type: "exp", start: -30 }, shadows: { kind: "shadowMap" } },
        { fog: { density: 0.8 }, ambient: { skyIllum: 5000 } },
    ];
    const actual = resolveGlobals(original, patches);
    assert.deepEqual(actual, {
        skybox: baseline().skybox,
        toneMapping: "linear",
        fog: { enabled: true, type: "exp", density: 0.8, start: -30, end: -20 },
        ambient: { skyIllum: 5000 },
        shadows: { enabled: true, kind: "shadowMap" },
    });
    assert.deepEqual(original, baseline());
    assert.deepEqual(patches[1], { fog: { type: "exp", start: -30 }, shadows: { kind: "shadowMap" } });
});

test("replacing or removing a patch withdraws omitted fields back to earlier tokens or baseline", () => {
    const original = baseline();
    const first: Stage3DGlobalsPatch = { fog: { enabled: true, density: 0.4 } };
    const last: Stage3DGlobalsPatch = { fog: { density: 0.8, end: 50 } };
    assert.equal(resolveGlobals(original, [first, last]).fog.density, 0.8);
    const replacement: Stage3DGlobalsPatch = { fog: { end: 70 } };
    assert.deepEqual(resolveGlobals(original, [first, replacement]).fog,
        { enabled: true, type: "linear", density: 0.4, start: -10, end: 70 });
    assert.deepEqual(resolveGlobals(original, [replacement]).fog,
        { enabled: false, type: "linear", density: 0.1, start: -10, end: 70 });
    assert.deepEqual(resolveGlobals(original, []), original);
});

test("snapshot, normalized patch and resolved state own all nested objects", () => {
    const original = baseline();
    const snapshot = cloneGlobals(original);
    const patch: Stage3DGlobalsPatch = {
        fog: { density: 0.7 }, ambient: { skyIllum: 8000 }, shadows: { enabled: true },
    };
    const normalized = normalizeGlobalsPatch(patch);
    const resolved = resolveGlobals(original, [patch]);
    for (const field of ["fog", "ambient", "shadows"] as const) {
        assert.notEqual(snapshot[field], original[field]);
        assert.notEqual(resolved[field], original[field]);
        assert.notEqual(normalized[field], patch[field]);
        assert.notEqual(resolved[field], patch[field]);
    }
    original.fog.start = 99;
    patch.fog!.density = 99;
    patch.ambient!.skyIllum = 99;
    patch.shadows!.enabled = false;
    assert.equal(snapshot.fog.start, -10);
    assert.equal(normalized.fog!.density, 0.7);
    assert.equal(resolved.fog.density, 0.7);
    assert.equal(resolved.ambient.skyIllum, 8000);
    assert.equal(resolved.shadows.enabled, true);
    resolved.fog.density = 2;
    assert.equal(normalized.fog!.density, 0.7);
});

test("undefined patch fields are omitted but false and zero remain explicit overrides", () => {
    const patch: Stage3DGlobalsPatch = {
        toneMapping: undefined,
        fog: { enabled: false, density: 0, start: undefined },
        ambient: { skyIllum: 0 },
        shadows: undefined,
    };
    assert.deepEqual(normalizeGlobalsPatch(patch), {
        fog: { enabled: false, density: 0 }, ambient: { skyIllum: 0 },
    });
    const resolved = resolveGlobals(baseline(), [patch]);
    assert.equal(resolved.fog.start, -10);
    assert.equal(resolved.fog.end, -20);
    assert.equal(resolved.ambient.skyIllum, 0);
});

test("globals retain finite negative or reversed fog distances from the engine baseline", () => {
    assert.deepEqual(cloneGlobals(baseline()), baseline());
    const resolved = resolveGlobals(baseline(), [{ fog: { start: -1, end: -100 } }]);
    assert.equal(resolved.fog.start, -1);
    assert.equal(resolved.fog.end, -100);
});

test("globals reject unsupported color, resource and unknown fields even when their value is undefined", () => {
    for (const invalid of [
        { skybox: { unsupported: {} } },
        { fog: { color: {} } },
        { ambient: { skyLightingColor: {} } },
        { shadows: { shadowColor: {} } },
        { fog: { densityy: undefined } },
        { [Symbol("asset")]: undefined },
    ]) assert.throws(() => normalizeUnknown(invalid), /unsupported field/u);
    assert.throws(() => cloneUnknown({ ...baseline(), skybox: undefined }), /baseline is missing/u);
});

test("globals reject null, invalid shapes, enums, booleans and non-finite or negative policy values", () => {
    for (const invalid of [
        null, undefined, [], new Date(),
        { fog: null }, { ambient: null }, { shadows: null },
        { toneMapping: null }, { toneMapping: "aces" }, { fog: { type: "EXP" } },
        { shadows: { kind: "map" } }, { fog: { enabled: 1 } }, { shadows: { enabled: "false" } },
        { fog: { density: -1 } }, { ambient: { skyIllum: -1 } },
        { fog: { density: NaN } }, { fog: { start: Infinity } }, { fog: { end: -Infinity } },
        { ambient: { skyIllum: "20000" } },
    ]) assert.throws(() => normalizeUnknown(invalid), TypeError);
});

test("baseline requires every managed field, including nested members and undefined omissions", () => {
    for (const invalid of [
        {}, { ...baseline(), toneMapping: undefined }, { ...baseline(), fog: undefined },
        { ...baseline(), fog: { ...baseline().fog, density: undefined } },
        { ...baseline(), ambient: {} }, { ...baseline(), shadows: { enabled: false } },
    ]) assert.throws(() => cloneUnknown(invalid), /baseline is missing/u);
    assert.throws(() => resolveGlobals(baseline(), [{ fog: { density: NaN } }]), /finite/u);
});
