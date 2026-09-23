/**
 * SC2-B2: projection-independent gestures and follow lifecycle.
 * Mutation: remove the new-zoom offset subtraction in zoomBy's commit →
 * "pinch keeps the old world anchor under the moving midpoint" must fail.
 * Existing slg-input / slg-map / slg-map-lod tests remain unchanged.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    CameraRig, type CameraRigOptions, type CameraRigPoint, type CameraRigState,
} from "../src/logic/scene3d/cameraRig";
import { MapCamera } from "../src/kits/slg/logic/mapCamera";

function rig(overrides: Partial<CameraRigOptions> = {}): CameraRig {
    return new CameraRig({
        center: { x: 100, y: 200 }, zoom: 1, minZoom: 0.25, maxZoom: 4,
        bounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
        projection: {
            offsetAt: (x, y, zoom) => ({ x: x / (10 * zoom), y: y / (20 * zoom) }),
            halfExtents: (zoom) => ({ x: 10 / zoom, y: 20 / zoom }),
        },
        motion: { dragThresholdPx: 8, minPinchDistancePx: 1, minMoveMs: 8, inertiaReleaseMs: 100,
            inertiaMinSpeedPx: 5, inertiaDecay: 8, maxStepSeconds: 0.05 },
        ...overrides,
    });
}

function near(actual: number, expected: number): void {
    assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}
function nearPoint(actual: CameraRigPoint, expected: CameraRigPoint): void {
    near(actual.x, expected.x); near(actual.y, expected.y);
}
function drag(camera: CameraRig, releaseAt = 27): void {
    camera.start(1, 0, 0, 10);
    camera.move(1, 80, 40, 26);
    assert.equal(camera.end(1, releaseAt), null);
}

test("CameraRig: pan uses the injected projection and reports only actual changes", () => {
    const changes: CameraRigState[] = [];
    const camera = rig({ onChange: ({ center, zoom, version }) => { changes.push({ center, zoom, version }); } });
    assert.deepEqual(camera.center, { x: 100, y: 200 });
    assert.equal(camera.touched, false);
    camera.pan(20, -40);
    assert.deepEqual(camera.center, { x: 98, y: 202 });
    assert.deepEqual(changes, [{ center: { x: 98, y: 202 }, zoom: 1, version: 1 }]);
    assert.equal(camera.touched, true);
    camera.pan(0, 0); camera.zoomBy(1); camera.locate(98, 202);
    camera.pan(Infinity, 0); camera.zoomBy(NaN); camera.locate(NaN, 0);
    assert.equal(camera.version, 1);
    assert.equal(changes.length, 1);
});

test("CameraRig: wheel factors keep the anchor through both zoom limits", () => {
    const camera = rig();
    const anchor = camera.worldAt(120, -80);
    for (const [factor, zoom] of [[2, 2], [100, 4], [0.001, 0.25]]) {
        camera.zoomBy(factor, 120, -80);
        nearPoint(camera.worldAt(120, -80), anchor);
        assert.equal(camera.zoom, zoom);
    }
    const version = camera.version;
    camera.zoomBy(0.5, 120, -80);
    assert.equal(camera.version, version, "a clamped zoom with the same anchor is stationary");
    for (const factor of [NaN, Infinity, -Infinity, 0, -1]) camera.zoomBy(factor, 120, -80);
    assert.equal(camera.version, version);
});

test("CameraRig: pinch keeps the old world anchor under the moving midpoint", () => {
    const camera = rig();
    camera.start(1, 40, -20, 0); camera.start(2, 140, 60, 0);
    const anchor = camera.worldAt(90, 20);
    camera.move(2, 220, 100, 16);
    near(camera.zoom, Math.hypot(180, 120) / Math.hypot(100, 80));
    nearPoint(camera.worldAt(130, 40), anchor);
    assert.equal(camera.version, 2, "zoom and moving midpoint each commit an actual change");
    assert.equal(camera.end(1, 17), null);
    assert.equal(camera.end(2, 18), null, "both pinch participants are ineligible for taps");
    const center = camera.center;
    camera.step(0.05);
    assert.deepEqual(camera.center, center, "pinch does not leave drag inertia");
});

test("CameraRig: zoom mapping and movement-plane axes belong to the projection", () => {
    const camera = rig({ bounds: undefined, projection: {
        offsetAt: (x, y, zoom) => ({ x: (x + y) / (zoom * zoom), y: (y - x) / (2 * zoom * zoom) }),
        halfExtents: () => { throw new Error("an unbounded rig needs no footprint"); },
    } });
    camera.pan(10, 30);
    assert.deepEqual(camera.center, { x: 60, y: 190 });
    const anchor = camera.worldAt(50, 20);
    camera.zoomBy(2, 50, 20);
    nearPoint(camera.worldAt(50, 20), anchor);
    camera.start(1, 30, 10, 0); camera.start(2, 70, 30, 0);
    const midpoint = camera.worldAt(50, 20);
    camera.move(2, 90, 50, 16);
    nearPoint(camera.worldAt(60, 30), midpoint);
});

test("CameraRig: two-pointer cap, duplicate starts, tap slop and pinch-to-drag transition", () => {
    const camera = rig();
    camera.move(99, 400, 400, 0);
    assert.equal(camera.end(99, 0), null);
    camera.start(1, 0, 0, 0); camera.start(1, 500, 500, 0);
    camera.move(1, 8, 0, 16);
    assert.equal(camera.version, 0, "slop equality is still a tap");
    assert.deepEqual(camera.end(1, 17), { x: 100.8, y: 200 });
    assert.equal(camera.touched, false);
    camera.start(1, 0, 0, 20); camera.start(2, 40, 0, 20); camera.start(3, 80, 0, 20);
    assert.equal(camera.pointerCount, 2);
    assert.equal(camera.end(3, 21), null);
    assert.equal(camera.end(1, 22), null);
    camera.move(2, 45, 0, 30);
    assert.deepEqual(camera.center, { x: 99.5, y: 200 }, "remaining pinch finger pans without a fresh slop threshold");
    assert.equal(camera.end(2, 31), null);
});

test("CameraRig: nonlinear screen projection preserves off-center drag and pinch anchors", () => {
    const camera = rig({ bounds: undefined, projection: {
        // A tilted-plane perspective mapping; offsets are not additive in screen y.
        offsetAt: (x, y, zoom) => ({ x: x / (zoom * (1 + y / 1000)), y: y / (zoom * (1 + y / 1000)) }),
        halfExtents: () => ({ x: 100, y: 100 }),
    } });
    camera.start(1, 100, 50, 0);
    const dragAnchor = camera.worldAt(100, 50);
    camera.move(1, 150, 80, 16);
    nearPoint(camera.worldAt(150, 80), dragAnchor);
    camera.start(2, 300, 200, 16);
    const pinchAnchor = camera.worldAt(225, 140);
    camera.move(2, 360, 260, 32);
    nearPoint(camera.worldAt(255, 170), pinchAnchor);
});

test("CameraRig: coincident or near-coincident pinch points pan without unstable zoom", () => {
    for (const separation of [0, 0.5, 1]) {
        const camera = rig();
        camera.start(1, 20, 30, 0); camera.start(2, 20 + separation, 30, 0);
        const anchor = camera.worldAt(20 + separation / 2, 30);
        camera.move(2, 80, 50, 16);
        assert.equal(camera.zoom, 1);
        nearPoint(camera.worldAt(50, 40), anchor);
    }
});

test("CameraRig: inertia decays with explicit time, caps long frames and eventually stops", () => {
    const camera = rig();
    drag(camera);
    const start = camera.center;
    camera.step(0.016);
    near(camera.x, start.x - 8); near(camera.y, start.y - 2);
    const first = camera.center;
    camera.step(0.016);
    near(first.x - camera.x, 8 * Math.exp(-8 * 0.016));
    near(first.y - camera.y, 2 * Math.exp(-8 * 0.016));

    const capped = rig(), longFrame = rig();
    drag(capped); drag(longFrame);
    capped.step(0.05); longFrame.step(10);
    assert.deepEqual(longFrame.center, capped.center);
    for (let i = 0; i < 100; i += 1) camera.step(0.05);
    const version = camera.version;
    camera.step(0.05);
    assert.equal(camera.version, version, "below the configured speed floor, inertia is fully cleared");
});

test("CameraRig: invalid time, live pointers and stale release cannot advance inertia", () => {
    const camera = rig();
    drag(camera);
    const center = camera.center;
    for (const dt of [0, -1, NaN, Infinity]) camera.step(dt);
    assert.deepEqual(camera.center, center);
    camera.start(2, 0, 0, 30); camera.move(2, 20, 20, 46);
    const dragging = camera.center;
    camera.step(0.05);
    assert.deepEqual(camera.center, dragging);
    camera.end(2, 147); camera.step(0.05);
    assert.deepEqual(camera.center, dragging, "a release over 100ms after movement drops stale velocity");

    const boundary = rig();
    drag(boundary, 126);
    const before = boundary.x;
    boundary.step(0.016);
    assert.ok(boundary.x < before, "release at exactly the grace boundary preserves inertia");
});

test("CameraRig: cancel and locate discard old pointers and inertia without marking touched", () => {
    for (const stop of [(camera: CameraRig) => camera.cancel(), (camera: CameraRig) => camera.locate(120, 240)]) {
        const inertial = rig();
        drag(inertial);
        stop(inertial);
        const stopped = inertial.center;
        inertial.step(0.05);
        assert.deepEqual(inertial.center, stopped, "stop clears velocity even after all pointers have left");
        const camera = rig();
        drag(camera);
        camera.start(2, 0, 0, 30); camera.start(3, 50, 0, 30);
        camera.touched = false;
        stop(camera);
        const center = camera.center, version = camera.version;
        camera.move(2, 200, 200, 50); camera.move(3, 400, 400, 50);
        assert.equal(camera.end(2, 51), null); assert.equal(camera.end(3, 51), null);
        camera.step(0.05);
        assert.equal(camera.pointerCount, 0);
        assert.equal(camera.version, version);
        assert.deepEqual(camera.center, center);
        assert.equal(camera.touched, false);
    }
    const camera = rig();
    camera.start(1, 0, 0, 0); camera.locate(Infinity, 0);
    assert.equal(camera.pointerCount, 1, "invalid navigation does not cancel a valid gesture");
});

test("CameraRig: bounds include the full zoom-dependent footprint and arbitrary origins", () => {
    const camera = rig({ center: { x: -150, y: 350 }, bounds: { minX: -200, minY: 300, maxX: -100, maxY: 400 } });
    camera.locate(-1000, 1000);
    assert.deepEqual(camera.center, { x: -190, y: 380 });
    camera.pan(10000, -10000);
    assert.equal(camera.version, 1, "attempts to move beyond a reached bound do not change version");
    camera.zoomBy(0.25);
    assert.deepEqual(camera.center, { x: -160, y: 350 }, "oversized height centers only that axis");
    camera.locate(1000, -1000);
    assert.deepEqual(camera.center, { x: -140, y: 350 });
    const small = rig({ center: { x: 1, y: 2 }, bounds: { minX: -9, minY: -8, maxX: 11, maxY: 12 } });
    small.pan(100, 100);
    assert.deepEqual(small.center, { x: 1, y: 2 });
    assert.equal(small.version, 0, "equal/oversized footprint remains centered");
    assert.equal(small.touched, true);
});

test("CameraRig: version and touched distinguish user intent from movement", () => {
    const camera = rig();
    camera.zoomBy(NaN); camera.locate(Infinity, 0); camera.cancel(); camera.step(0.1);
    assert.equal(camera.touched, false); assert.equal(camera.version, 0);
    camera.locate(120, 250);
    assert.equal(camera.touched, false); assert.equal(camera.version, 1);
    camera.pan(0, 0);
    assert.equal(camera.touched, true); assert.equal(camera.version, 1);
    camera.touched = false;
    camera.zoomBy(1);
    assert.equal(camera.touched, true); assert.equal(camera.version, 1);
    camera.zoomBy(2);
    assert.equal(camera.version, 2, "zoom alone is a state change even with a stationary center");
});

test("CameraRig: follow samples a live target, clamps, preserves zoom and ignores invalid samples", () => {
    const camera = rig();
    const target = { x: 120, y: 240 };
    camera.follow(target);
    assert.equal(camera.following, true);
    assert.deepEqual(camera.center, target);
    assert.equal(camera.version, 1); assert.equal(camera.touched, false);
    camera.step(0.016);
    assert.equal(camera.version, 1, "unchanged target does not invalidate the view");
    target.x = 130; target.y = 260;
    camera.step(0); camera.step(NaN);
    assert.equal(camera.version, 1);
    camera.step(0.016);
    assert.deepEqual(camera.center, target); assert.equal(camera.version, 2);
    target.x = NaN; camera.step(0.016);
    assert.deepEqual(camera.center, { x: 130, y: 260 }); assert.equal(camera.following, true);
    target.x = 2000; target.y = -2000; camera.step(0.016);
    assert.deepEqual(camera.center, { x: 990, y: -980 });
    assert.equal(camera.zoom, 1); assert.equal(camera.touched, false);
    const replacement = { x: -100, y: 100 };
    camera.follow(replacement);
    target.x = 0; camera.step(0.016);
    assert.deepEqual(camera.center, replacement);
});

test("CameraRig: entering follow discards old drag/inertia; stopping or manual input releases the target", () => {
    const inertial = rig();
    drag(inertial);
    inertial.follow({ x: 150, y: 250 });
    inertial.follow(null); inertial.step(0.05);
    assert.deepEqual(inertial.center, { x: 150, y: 250 }, "stopping follow cannot resume pre-follow inertia");
    for (const interrupt of [
        (camera: CameraRig) => camera.follow(null), (camera: CameraRig) => camera.cancel(),
        (camera: CameraRig) => camera.locate(150, 250), (camera: CameraRig) => camera.pan(20, 10),
        (camera: CameraRig) => camera.zoomBy(2, 40, 20), (camera: CameraRig) => camera.start(9, 0, 0, 50),
    ]) {
        const camera = rig();
        drag(camera);
        camera.start(2, 0, 0, 30); camera.start(3, 50, 0, 30);
        const target = { x: 120, y: 240 };
        camera.follow(target);
        assert.equal(camera.pointerCount, 0);
        camera.move(2, 500, 500, 40);
        assert.equal(camera.end(2, 41), null); assert.equal(camera.end(3, 41), null);
        camera.step(0.016);
        assert.deepEqual(camera.center, target);
        interrupt(camera);
        assert.equal(camera.following, false);
        camera.end(9, 51);
        const center = camera.center;
        target.x += 50; camera.step(0.05);
        assert.deepEqual(camera.center, center, "neither the old target nor old inertia can resume");
    }
});

test("MapCamera adapter: initialization and writable legacy fields keep their semantics", () => {
    const defaults = new MapCamera(800, 600, 1500, 1200);
    assert.deepEqual([defaults.x, defaults.y, defaults.scale, defaults.version, defaults.touched], [750, 600, 0.85, 0, false]);
    const initial = new MapCamera(800, 600, 1500, 1200, 500, 700);
    assert.deepEqual([initial.x, initial.y, initial.version, initial.touched], [500, 700, 1, false]);
    const partial = new MapCamera(800, 600, 1500, 1200, 500);
    assert.deepEqual([partial.x, partial.y, partial.version], [750, 600, 0]);
    defaults.x = 400; defaults.y = 450; defaults.scale = 0.3; defaults.version = 7; defaults.touched = true;
    assert.deepEqual([defaults.x, defaults.y, defaults.scale, defaults.version, defaults.touched, defaults.lod], [400, 450, 0.3, 7, true, 0]);
    defaults.pan(0, 0);
    assert.equal(defaults.version, 7); assert.equal(defaults.lod, 0, "direct assignment historically bypasses commit/LOD");
    defaults.pan(48, 0);
    assert.equal(defaults.version, 8); assert.equal(defaults.lod, 2);
});
