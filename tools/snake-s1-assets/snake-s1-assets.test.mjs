import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertContentVersionTransition,
  convertSkinSource,
  normalizeFrameDuration,
  validateFrameBounds,
} from "./core.mjs";

function frame(name, rect, extra = {}) {
  return { name, rect, offset: [0, 0], originalSize: rect.slice(2), pivot: [0.5, 0.5], ...extra };
}

function fixture() {
  return {
    body: {
      skinId: 99,
      skin: {
        body_render_type: 2,
        body_render_width_rate: "1.250",
        body_distance: -18,
        body_speed_distance: -21,
        wreck_name: "wreck.png",
        head_frame: { level: 0, distance: 0, frame: [{ texture_name: "head.png", frame_time: 0 }] },
        body_frame: [
          { level: 4, distance: -16, frame: [{ texture_name: "body-a.png", frame_time: 6 }] },
          { level: 3, distance: -12, frame: [{ texture_name: "body-b.png", frame_time: 0 }] },
        ],
        tail_frame: { level: 0, distance: -6, frame: [{ texture_name: "tail.png", frame_time: 0 }] },
        head_speed_frame: { level: 0, distance: -1, frame: [{ texture_name: "head-boost.png", frame_time: 2 }] },
        body_speed_frame: [{ level: 4, distance: -17, frame: [{ texture_name: "body-a.png", frame_time: 3 }] }],
        tail_speed_frame: { level: 0, distance: -7, frame: [{ texture_name: "tail.png", frame_time: 4 }] },
      },
    },
    atlas: {
      texture: { width: 173, height: 119 },
      frames: [
        frame("head", [1, 1, 41, 37]),
        frame("body-a", [43, 1, 29, 31], { offset: [-2, 1], originalSize: [35, 35] }),
        frame("body-b", [73, 1, 27, 33]),
        frame("tail", [101, 1, 23, 17], { rotated: true }),
        frame("head-boost", [1, 39, 39, 35]),
        frame("wreck", [41, 39, 13, 13]),
      ],
    },
  };
}

test("converter preserves non-216 atlas rects, source ordering, trim, rotation and signed distances", () => {
  const { body, atlas } = fixture();
  const converted = convertSkinSource(99, body, atlas);
  assert.equal(converted.bodyRenderType, 2);
  assert.equal(converted.bodyRenderWidthRate, 1.25);
  assert.equal(converted.normal.sourceBodyOffset, -18);
  assert.deepEqual(converted.normal.bodySequence, [0, 1]);
  assert.equal(converted.normal.body[0].sourceDistance, -16);
  assert.equal(converted.normal.body[0].frames[0].durationFrames, 6);
  assert.equal(converted.normal.body[1].frames[0].durationFrames, 1);
  assert.equal(converted.normal.body[0].frames[0].trimmed, true);
  assert.deepEqual(converted.normal.body[0].frames[0].trimOffset, { x: -2, y: 1 });
  assert.equal(converted.normal.tail.frames[0].rotated, true);
  assert.equal(converted.boost.sourceBodyOffset, -21);
});

test("frame_time normalization is max(1, source value) and never milliseconds", () => {
  assert.equal(normalizeFrameDuration(0), 1);
  assert.equal(normalizeFrameDuration(6), 6);
  assert.equal(normalizeFrameDuration(0.5), 1);
});

test("missing boost group inherits a complete independent normal snapshot", () => {
  const { body, atlas } = fixture();
  delete body.skin.head_speed_frame;
  body.skin.body_speed_frame = [];
  delete body.skin.tail_speed_frame;
  const converted = convertSkinSource(99, body, atlas);
  assert.equal(converted.boostSource, "inherit-normal");
  assert.deepEqual(converted.boost, converted.normal);
  assert.notEqual(converted.boost, converted.normal);
});

test("partial boost definitions, unknown render types and invalid rects fail with context", () => {
  {
    const { body, atlas } = fixture();
    delete body.skin.head_speed_frame;
    assert.throws(() => convertSkinSource(99, body, atlas), /skin 99.*partially defined/);
  }
  {
    const { body, atlas } = fixture();
    body.skin.body_render_type = 7;
    assert.throws(() => convertSkinSource(99, body, atlas), /skin 99 .*body_render_type.*unsupported render type 7/);
  }
  {
    const { body, atlas } = fixture();
    atlas.frames[0].rect = [160, 110, 41, 37];
    assert.throws(() => convertSkinSource(99, body, atlas), /skin 99.*lies outside/);
  }
});

test("rotated bounds use packed width/height while retaining logical rect dimensions", () => {
  const logical = {
    sourceFrameName: "rotated",
    rect: { x: 70, y: 60, width: 30, height: 20 },
    pivot: { x: 0.5, y: 0.5 },
    trimOffset: { x: 0, y: 0 },
    originalSize: { width: 30, height: 20 },
    rotated: true,
    trimmed: false,
  };
  assert.doesNotThrow(() => validateFrameBounds(logical, { width: 90, height: 90 }, "fixture"));
  assert.throws(() => validateFrameBounds(logical, { width: 89, height: 90 }, "fixture"), /lies outside/);
});

test("atlas input ordering does not alter converted output", () => {
  const { body, atlas } = fixture();
  const forward = convertSkinSource(99, body, atlas);
  const reverse = convertSkinSource(99, body, { ...atlas, frames: [...atlas.frames].reverse() });
  assert.deepEqual(reverse, forward);
});

test("missing source head anchor deterministically normalizes to 0.5", () => {
  const { body, atlas } = fixture();
  delete body.skin.head_anchor_y_pos;
  delete body.skin.head_speed_anchor_y_pos;
  const converted = convertSkinSource(99, body, atlas);
  assert.equal(converted.headAnchorY, 0.5);
  assert.equal(converted.boostHeadAnchorY, 0.5);
});

test("resource interpretation changes require a contentVersion increase", () => {
  const before = { skinId: 1, contentVersion: 1, presentation: { rect: [0, 0, 16, 16] } };
  assert.throws(() => assertContentVersionTransition(before, { ...before, presentation: { rect: [0, 0, 17, 16] } }), /without a version bump/);
  assert.doesNotThrow(() => assertContentVersionTransition(before, { skinId: 1, contentVersion: 2, presentation: { rect: [0, 0, 17, 16] } }));
});
