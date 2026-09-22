import assert from "node:assert/strict";
import { test } from "node:test";
import { designToScreen, resolveViewport, type RectDesignPx, type ViewportMetrics } from "../src/logic/scene3d/viewport";

const portrait: ViewportMetrics = {
    design: { x: 0, y: 0, width: 750, height: 1500 },
    screen: { width: 1500, height: 3000 },
    content: { x: 0, y: 0, width: 1500, height: 3000 },
};

function near(actual: number, expected: number): void {
    assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
}

test("Stage3D viewport: full design maps to the full camera and screen corners", () => {
    assert.deepEqual(resolveViewport(portrait.design, portrait), {
        rect: { x: 0, y: 0, width: 1, height: 1 }, aspect: 0.5,
    });
    assert.deepEqual(designToScreen(0, 0, portrait), { x: 0, y: 0 });
    assert.deepEqual(designToScreen(750, 1500, portrait), { x: 1500, y: 3000 });
    assert.deepEqual(designToScreen(375, 750, portrait), { x: 750, y: 1500 });
});

test("Stage3D viewport: asymmetric header/footer reserves use the lower-left origin", () => {
    // A 200 px footer and a 100 px header leave y=200, height=1200.
    const result = resolveViewport({ x: 0, y: 200, width: 750, height: 1200 }, portrait);
    near(result.rect.y, 2 / 15);
    near(result.rect.height, 0.8);
    assert.equal(result.rect.x, 0);
    assert.equal(result.rect.width, 1);
    assert.equal(result.aspect, 0.625);
    assert.deepEqual(designToScreen(0, 200, portrait), { x: 0, y: 400 });
    assert.deepEqual(designToScreen(750, 1400, portrait), { x: 1500, y: 2800 });
});

test("Stage3D viewport: a non-fullscreen rectangle is normalized against screen size", () => {
    const result = resolveViewport({ x: 150, y: 300, width: 300, height: 600 }, portrait);
    assert.deepEqual(result, { rect: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }, aspect: 0.5 });
});

test("Stage3D viewport: nonzero design origin and letterbox offsets map both axes", () => {
    const metrics: ViewportMetrics = {
        design: { x: -100, y: 50, width: 400, height: 800 },
        screen: { width: 1000, height: 2000 },
        content: { x: 100, y: 200, width: 800, height: 1600 },
    };
    assert.deepEqual(resolveViewport(metrics.design, metrics), {
        rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, aspect: 0.5,
    });
    assert.deepEqual(resolveViewport({ x: 0, y: 250, width: 200, height: 400 }, metrics), {
        rect: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 }, aspect: 0.5,
    });
    assert.deepEqual(designToScreen(-100, 50, metrics), { x: 100, y: 200 });
    assert.deepEqual(designToScreen(300, 850, metrics), { x: 900, y: 1800 });
});

test("Stage3D viewport: aspect follows actual pixel dimensions under nonuniform scaling", () => {
    const metrics: ViewportMetrics = {
        design: { x: 0, y: 0, width: 400, height: 800 },
        screen: { width: 1600, height: 1200 },
        content: { x: 0, y: 0, width: 1600, height: 1200 },
    };
    const result = resolveViewport({ x: 100, y: 200, width: 200, height: 400 }, metrics);
    assert.deepEqual(result.rect, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    near(result.aspect, 4 / 3);
    assert.deepEqual(designToScreen(200, 400, metrics), { x: 800, y: 600 });
});

test("Stage3D viewport: recomputation uses resized metrics without stale dimensions or input mutation", () => {
    const rect = Object.freeze({ x: 150, y: 300, width: 300, height: 600 });
    const original = resolveViewport(rect, portrait);
    const resized: ViewportMetrics = Object.freeze({
        design: Object.freeze({ x: 0, y: 0, width: 750, height: 1600 }),
        screen: Object.freeze({ width: 1000, height: 2200 }),
        content: Object.freeze({ x: 125, y: 300, width: 750, height: 1600 }),
    });
    const result = resolveViewport(rect, resized);
    near(result.rect.x, 0.275);
    near(result.rect.y, 3 / 11);
    near(result.rect.width, 0.3);
    near(result.rect.height, 3 / 11);
    assert.equal(result.aspect, 0.5);
    assert.deepEqual(designToScreen(150, 300, resized), { x: 275, y: 600 });
    assert.deepEqual(resolveViewport(rect, portrait), original);
    assert.notEqual(result.rect, rect);
});

test("Stage3D viewport: finite points outside design remain extrapolated for an owned drag", () => {
    assert.deepEqual(designToScreen(-75, -150, portrait), { x: -150, y: -300 });
    const beyond = designToScreen(825, 1650, portrait);
    near(beyond.x, 1650);
    near(beyond.y, 3300);
    assert.deepEqual(designToScreen(375, 50, portrait), { x: 750, y: 100 }, "points in a reserved footer are not clamped");
});

test("Stage3D viewport: invalid viewports fail instead of clamping or flipping coordinates", () => {
    const invalid: RectDesignPx[] = [
        { x: -1, y: 0, width: 100, height: 100 },
        { x: 0, y: -1, width: 100, height: 100 },
        { x: 700, y: 0, width: 100, height: 100 },
        { x: 0, y: 1450, width: 100, height: 100 },
        { x: 0, y: 0, width: 0, height: 100 },
        { x: 0, y: 0, width: 100, height: -100 },
        { x: Number.NaN, y: 0, width: 100, height: 100 },
        { x: 0, y: Number.POSITIVE_INFINITY, width: 100, height: 100 },
        { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 100 },
        { x: 0, y: 0, width: 100, height: Number.NaN },
    ];
    for (const rect of invalid) assert.throws(() => resolveViewport(rect, portrait), /Stage3D viewport.*viewport/u);
});

test("Stage3D viewport: both conversion paths reject invalid design, content and screen metrics", () => {
    const invalid: ViewportMetrics[] = [
        { ...portrait, design: { ...portrait.design, width: 0 } },
        { ...portrait, design: { ...portrait.design, y: Number.NaN } },
        { ...portrait, design: { ...portrait.design, x: Number.MAX_VALUE, width: Number.MAX_VALUE } },
        { ...portrait, design: { ...portrait.design, x: 1, width: Number.MIN_VALUE } },
        { ...portrait, screen: { width: Number.POSITIVE_INFINITY, height: 3000 } },
        { ...portrait, screen: { width: 1500, height: 0 } },
        { ...portrait, content: { ...portrait.content, x: -1 } },
        { ...portrait, content: { ...portrait.content, y: -1 } },
        { ...portrait, content: { ...portrait.content, width: 1501 } },
        { ...portrait, content: { ...portrait.content, height: 3001 } },
        { ...portrait, content: { ...portrait.content, height: 0 } },
        { ...portrait, content: { ...portrait.content, x: Number.NaN } },
        { ...portrait, content: { ...portrait.content, width: Number.NEGATIVE_INFINITY } },
    ];
    for (const metrics of invalid) {
        assert.throws(() => resolveViewport({ x: 0, y: 0, width: 100, height: 100 }, metrics), /Stage3D viewport.*metrics/u);
        assert.throws(() => designToScreen(0, 0, metrics), /Stage3D viewport.*metrics/u);
    }
});

test("Stage3D viewport: nonfinite points and unrepresentable conversion results fail explicitly", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        assert.throws(() => designToScreen(value, 0, portrait), /design x must be finite/u);
        assert.throws(() => designToScreen(0, value, portrait), /design y must be finite/u);
    }
    assert.throws(() => designToScreen(Number.MAX_VALUE, 0, portrait), /mapped screen x must be finite/u);
    const metrics: ViewportMetrics = {
        design: { x: 0, y: 0, width: 1, height: 1 },
        screen: { width: Number.MAX_VALUE, height: 1 },
        content: { x: 0, y: 0, width: 1, height: 1 },
    };
    assert.throws(() => resolveViewport({ x: 0, y: 0, width: Number.MIN_VALUE, height: 1 }, metrics), /normalized viewport width/u);
});
