import assert from "node:assert/strict";
import { test } from "node:test";
import {
    rayAabb, rayPlane, unprojectDesignPx,
    type PickAabb, type PickHit, type PickPoint, type PickRay,
} from "../src/logic/scene3d/pickMath";
import { designToScreen, resolveViewport, type RectDesignPx, type ViewportMetrics } from "../src/logic/scene3d/viewport";
import type { Stage3DLease } from "../src/view/scene3d/Stage3D";

// Mutation checks: remove rayPlane's t < 0 or rayAabb's exit < 0 rejection;
// the respective "behind the origin" test must fail (run on temporary copies).
const box: PickAabb = Object.freeze({
    min: Object.freeze({ x: -1, y: -1, z: -1 }), max: Object.freeze({ x: 1, y: 1, z: 1 }),
});
const axes = ["x", "y", "z"] as const;

function near(actual: number, expected: number): void {
    assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

function hit(actual: PickHit | null, t: number, point: PickPoint): void {
    assert.ok(actual, "expected a hit");
    near(actual.t, t);
    for (const axis of axes) near(actual.point[axis], point[axis]);
}

test("pickMath plane: downward/upward rays hit the requested height with unnormalized t", () => {
    hit(rayPlane({ origin: { x: 1, y: 9, z: -3 }, direction: { x: 2, y: -3, z: 4 } }, 3),
        2, { x: 5, y: 3, z: 5 });
    hit(rayPlane({ origin: { x: 3, y: -4, z: 5 }, direction: { x: -2, y: 2, z: 1 } }),
        2, { x: -1, y: 0, z: 7 });
});

test("pickMath plane: crossings behind the origin are misses from either side", () => {
    for (const sign of [-1, 1]) {
        assert.equal(rayPlane({ origin: { x: 2, y: sign * 4, z: 3 }, direction: { x: 1, y: sign, z: 1 } }), null);
    }
});

test("pickMath plane: parallel and coplanar rays have no unique crossing", () => {
    for (const y of [0, 3, -3]) for (const dy of [0, -0]) {
        assert.equal(rayPlane({ origin: { x: 1, y, z: 2 }, direction: { x: 2, y: dy, z: 1 } }), null);
    }
});

test("pickMath plane: an origin on the plane hits at positive zero in either direction", () => {
    for (const dy of [-2, 2]) {
        const origin = Object.freeze({ x: 7, y: 3, z: -4 });
        const result = rayPlane({ origin, direction: { x: 1, y: dy, z: 1 } }, 3);
        assert.deepEqual(result, { t: 0, point: origin });
        assert.notEqual(result?.point, origin, "return a fresh point");
    }
});

test("pickMath plane: a shallow ray is not discarded by an arbitrary parallel epsilon", () => {
    hit(rayPlane({ origin: { x: 0, y: 1, z: 0 }, direction: { x: 1, y: -1e-12, z: 0 } }),
        1e12, { x: 1e12, y: 0, z: 0 });
});

test("pickMath AABB: all six faces and both direction signs use the nearest overlap", () => {
    for (const axis of axes) for (const sign of [-1, 1]) {
        const origin = { x: 0, y: 0, z: 0 }, direction = { x: 0, y: 0, z: 0 }, point = { x: 0, y: 0, z: 0 };
        origin[axis] = sign * 5; direction[axis] = sign * -2; point[axis] = sign;
        hit(rayAabb({ origin, direction }, box), 2, point);
    }
});

test("pickMath AABB: boxes behind the origin are misses for all six directions", () => {
    for (const axis of axes) for (const sign of [-1, 1]) {
        const origin = { x: 0, y: 0, z: 0 }, direction = { x: 0, y: 0, z: 0 };
        origin[axis] = sign * 5; direction[axis] = sign * 2;
        assert.equal(rayAabb({ origin, direction }, box), null);
    }
});

test("pickMath AABB: parallel slab misses and disjoint forward intervals are rejected", () => {
    for (const axis of axes) for (const sign of [-1, 1]) for (const zero of [0, -0]) {
        const origin = { x: 2, y: 2, z: 2 }, direction = { x: -1, y: -1, z: -1 };
        origin[axis] = sign * 2; direction[axis] = zero;
        assert.equal(rayAabb({ origin, direction }, box), null);
    }
    assert.equal(rayAabb({ origin: { x: -3, y: -3, z: 0 }, direction: { x: 1, y: 4, z: 0 } }, box), null);
});

test("pickMath AABB: solid interior and outward surface starts hit at t zero", () => {
    hit(rayAabb({ origin: { x: 0.25, y: -0.5, z: 0.75 }, direction: { x: 2, y: -1, z: 3 } }, box),
        0, { x: 0.25, y: -0.5, z: 0.75 });
    for (const axis of axes) for (const sign of [-1, 1]) {
        const origin = { x: 0, y: 0, z: 0 }, direction = { x: 0, y: 0, z: 0 };
        origin[axis] = sign; direction[axis] = sign;
        assert.deepEqual(rayAabb({ origin, direction }, box), { t: 0, point: origin });
    }
});

test("pickMath AABB: rays along faces/edges and single-corner tangencies count", () => {
    for (const zero of [0, -0]) {
        hit(rayAabb({ origin: { x: -3, y: 1, z: 0 }, direction: { x: 1, y: zero, z: 0 } }, box),
            2, { x: -1, y: 1, z: 0 });
        hit(rayAabb({ origin: { x: -3, y: 1, z: 1 }, direction: { x: 1, y: zero, z: zero } }, box),
            2, { x: -1, y: 1, z: 1 });
    }
    hit(rayAabb({ origin: { x: -2, y: 0, z: 0 }, direction: { x: 1, y: 1, z: 1 } }, box),
        1, { x: -1, y: 1, z: 1 });
});

test("pickMath AABB: zero-thickness and point boxes retain closed boundary semantics", () => {
    const ray = { origin: { x: 0, y: 4, z: 0 }, direction: { x: 0, y: -2, z: 0 } };
    hit(rayAabb(ray, { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 0, z: 1 } }), 2, { x: 0, y: 0, z: 0 });
    const point = { x: 0, y: 0, z: 0 };
    hit(rayAabb(ray, { min: point, max: point }), 2, point);
    assert.equal(rayAabb({ ...ray, origin: { x: 0.01, y: 4, z: 0 } }, { min: point, max: point }), null);
});

test("pickMath: direction scaling preserves the hit point and inversely scales t", () => {
    for (const scale of [1e-14, 0.25, 1, 4, 1e14]) {
        const ray = { origin: { x: -5, y: 4, z: 0 }, direction: { x: scale, y: -scale, z: 0 } };
        hit(rayPlane(ray), 4 / scale, { x: -1, y: 0, z: 0 });
        hit(rayAabb(ray, box), 4 / scale, { x: -1, y: 0, z: 0 });
    }
});

test("pickMath: translation preserves intersections and frozen inputs are never mutated", () => {
    const origin = Object.freeze({ x: 100, y: 24, z: -40 }), direction = Object.freeze({ x: 1, y: -1, z: 0 });
    const ray = Object.freeze({ origin, direction });
    const translatedBox = Object.freeze({
        min: Object.freeze({ x: 104, y: 19, z: -41 }), max: Object.freeze({ x: 106, y: 21, z: -39 }),
    });
    hit(rayPlane(ray, 20), 4, { x: 104, y: 20, z: -40 });
    hit(rayAabb(ray, translatedBox), 4, { x: 104, y: 20, z: -40 });
    assert.deepEqual(ray, { origin: { x: 100, y: 24, z: -40 }, direction: { x: 1, y: -1, z: 0 } });
});

test("pickMath: nonfinite ray components and zero directions are invalid, not misses", () => {
    const valid: PickRay = { origin: { x: 1, y: 4, z: 2 }, direction: { x: 1, y: -1, z: 1 } };
    for (const value of [NaN, Infinity, -Infinity]) for (const part of ["origin", "direction"] as const) for (const axis of axes) {
        const ray = { ...valid, [part]: { ...valid[part], [axis]: value } };
        assert.throws(() => rayPlane(ray), RangeError);
        assert.throws(() => rayAabb(ray, box), RangeError);
    }
    for (const zero of [0, -0]) {
        const ray = { ...valid, direction: { x: zero, y: zero, z: zero } };
        assert.throws(() => rayPlane(ray), /direction must be nonzero/);
        assert.throws(() => rayAabb(ray, box), /direction must be nonzero/);
    }
});

test("pickMath: invalid heights/bounds fail before an early geometric miss", () => {
    const ray = { origin: { x: 2, y: 4, z: 2 }, direction: { x: 0, y: 0, z: 1 } };
    for (const value of [NaN, Infinity, -Infinity]) {
        assert.throws(() => rayPlane(ray, value), /height must be finite/);
        for (const side of ["min", "max"] as const) for (const axis of axes) {
            assert.throws(() => rayAabb(ray, { ...box, [side]: { ...box[side], [axis]: value } }), RangeError);
        }
    }
    for (const axis of axes) {
        assert.throws(() => rayAabb(ray, { ...box, min: { ...box.min, [axis]: 2 } }), /must not exceed/);
    }
});

test("pickMath: unrepresentable forward hits fail without returning NaN/infinity", () => {
    const huge = { origin: { x: Number.MAX_VALUE, y: 2, z: 0 }, direction: { x: Number.MAX_VALUE, y: -1, z: 0 } };
    assert.throws(() => rayPlane(huge), /intersection.x must be finite/);
    assert.throws(() => rayPlane({ ...huge, direction: { x: 0, y: -Number.MIN_VALUE, z: 0 } }), /intersection t must be finite/);
    assert.throws(() => rayAabb({ origin: { x: -5, y: 0, z: 0 }, direction: { x: Number.MIN_VALUE, y: 0, z: 0 } }, box),
        /intersection t must be finite/);
});

const metrics: ViewportMetrics = {
    design: { x: -100, y: 50, width: 400, height: 800 },
    screen: { width: 1600, height: 1800 },
    content: { x: 80, y: 200, width: 1440, height: 1400 },
};
const viewport: RectDesignPx = { x: 0, y: 200, width: 200, height: 400 };

/** Same viewport.ts conversion as Stage3D, then an analytic downward perspective camera. */
function stageRay(readMetrics: () => ViewportMetrics): Stage3DLease["screenToRay"] {
    return (x, y) => {
        const current = readMetrics(), screen = designToScreen(x, y, current);
        const { rect } = resolveViewport(viewport, current);
        return {
            origin: { x: 10, y: 10, z: 30 },
            direction: {
                x: 2 * (screen.x / current.screen.width - rect.x) / rect.width - 1,
                y: -2,
                z: 2 * (screen.y / current.screen.height - rect.y) / rect.height - 1,
            },
        };
    };
}

test("pickMath unproject: stage design pixels respect letterboxing, viewport offsets and lower-left Y", () => {
    const screenToRay = stageRay(() => metrics);
    hit(unprojectDesignPx(0, 200, screenToRay), 5, { x: 5, y: 0, z: 25 });
    hit(unprojectDesignPx(100, 400, screenToRay), 5, { x: 10, y: 0, z: 30 });
    hit(unprojectDesignPx(200, 600, screenToRay), 5, { x: 15, y: 0, z: 35 });
    hit(unprojectDesignPx(200, 600, screenToRay, 4), 3, { x: 13, y: 4, z: 33 });
});

test("pickMath unproject: owned drags outside design/viewport remain unclamped", () => {
    hit(unprojectDesignPx(-100, 0, stageRay(() => metrics)), 5, { x: 0, y: 0, z: 20 });
    hit(unprojectDesignPx(300, 800, stageRay(() => metrics)), 5, { x: 20, y: 0, z: 40 });
});

test("pickMath unproject: each call reads the latest viewport and camera without caching", () => {
    let current = metrics;
    const screenToRay = stageRay(() => current);
    hit(unprojectDesignPx(200, 200, screenToRay), 5, { x: 15, y: 0, z: 25 });
    current = { design: metrics.design, screen: { width: 1200, height: 2400 }, content: { x: 0, y: 0, width: 1200, height: 2400 } };
    hit(unprojectDesignPx(200, 200, screenToRay), 5, { x: 15, y: 0, z: 25 });
    let cameraY = 10, calls = 0;
    const camera: Stage3DLease["screenToRay"] = (x, y) => {
        calls += 1;
        assert.deepEqual([x, y], [200, 200], "design pixels reach the stage unchanged");
        return { origin: { x: 0, y: cameraY, z: 0 }, direction: { x: 1, y: -2, z: 1 } };
    };
    hit(unprojectDesignPx(200, 200, camera), 5, { x: 5, y: 0, z: 5 });
    cameraY = 20;
    hit(unprojectDesignPx(200, 200, camera), 10, { x: 10, y: 0, z: 10 });
    assert.equal(calls, 2);
});

test("pickMath unproject: orthographic rays, misses, invalid arguments and lease errors retain their meaning", () => {
    hit(unprojectDesignPx(7, 9, (x, y) => ({ origin: { x, y: 10, z: y }, direction: { x: 0, y: -1, z: 0 } })),
        10, { x: 7, y: 0, z: 9 });
    for (const direction of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]) {
        assert.equal(unprojectDesignPx(0, 0, () => ({ origin: { x: 0, y: 10, z: 0 }, direction })), null);
    }
    const invalidCamera = () => ({ origin: { x: NaN, y: 10, z: 0 }, direction: { x: 0, y: -1, z: 0 } });
    assert.throws(() => unprojectDesignPx(0, 0, invalidCamera), RangeError);
    const inactive = new Error("lease is inactive");
    const fail = () => { throw inactive; };
    assert.throws(() => unprojectDesignPx(0, 0, fail), (error) => error === inactive);
    for (const value of [NaN, Infinity, -Infinity]) {
        assert.throws(() => unprojectDesignPx(value, 0, fail), /design x must be finite/);
        assert.throws(() => unprojectDesignPx(0, value, fail), /design y must be finite/);
        assert.throws(() => unprojectDesignPx(0, 0, fail, value), /height must be finite/);
    }
});
