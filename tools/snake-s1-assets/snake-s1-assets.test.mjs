import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  assertContentVersionTransition,
  assertPresentationVersionTransition,
  buildArtifacts,
  convertMagnetAtlasSource,
  convertSkinSource,
  decodeCocos2PackedDocument,
  HISTORICAL_CLIENT_PRESENTATION_HASH,
  HISTORICAL_PUBLIC_CATALOG_HASH,
  HISTORICAL_SERVER_BUSINESS_HASH,
  inspectMp3,
  normalizeFrameDuration,
  SNAKE_PRESENTATION_VERSION,
  validateMagnetAtlas,
  validateMagnetAuraRecipe,
  validateMagnetPresentation,
  validateFrameBounds,
  validateRegisteredResource,
} from "./core.mjs";

const MAGNET_ATLAS = JSON.parse(fs.readFileSync(new URL("source/presentation/magnet.atlas.json", import.meta.url), "utf8"));
const MAGNET_AURA = JSON.parse(fs.readFileSync(new URL("source/presentation/magnet-aura.json", import.meta.url), "utf8"));

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

test("magnet atlas extracts only 10001 and rejects entry, rect, dimension and bounds drift", () => {
  const source = {
    unrelated: { name: "10002", rect: [0, 0, 2, 2] },
    nested: { name: "10001", rect: [346, 256, 84, 92] },
  };
  assert.deepEqual(convertMagnetAtlasSource(source), MAGNET_ATLAS);
  assert.deepEqual(validateMagnetAtlas(MAGNET_ATLAS).rect, { x: 346, y: 256, width: 84, height: 92 });
  const clone = () => structuredClone(MAGNET_ATLAS);
  {
    const value = clone();
    value.frames.push(structuredClone(value.frames[0]));
    assert.throws(() => validateMagnetAtlas(value), /exactly frame 10001/);
  }
  {
    const value = clone();
    value.frames = [];
    assert.throws(() => validateMagnetAtlas(value), /exactly frame 10001/);
  }
  {
    const value = clone();
    value.frames[0].rect[2] = 85;
    assert.throws(() => validateMagnetAtlas(value), /differs from the frozen/);
  }
  {
    const value = clone();
    value.texture.width = 467;
    assert.throws(() => validateMagnetAtlas(value), /expected 468x769/);
  }
  {
    const value = clone();
    value.frames[0].rect[0] = 450;
    assert.throws(() => validateMagnetAtlas(value), /lies outside/);
  }
});

test("magnet presentation enforces one world item, a byte-sharing passive alias and a direct aura fallback", () => {
  const built = buildArtifacts();
  assert.doesNotThrow(() => validateMagnetPresentation(built.presentationCatalog.tools, MAGNET_AURA));
  const clone = () => structuredClone(built.presentationCatalog.tools);
  {
    const value = clone();
    value.extra = value.magnet;
    assert.throws(() => validateMagnetPresentation(value, MAGNET_AURA), /exact keys/);
  }
  {
    const value = clone();
    delete value.magnet;
    assert.throws(() => validateMagnetPresentation(value, MAGNET_AURA), /exact keys/);
  }
  {
    const value = clone();
    value.magnet.statusIcon.frame.rect.x += 1;
    assert.throws(() => validateMagnetPresentation(value, MAGNET_AURA), /passive alias/);
  }
  {
    const value = clone();
    value.magnet.statusIcon.interactive = true;
    assert.throws(() => validateMagnetPresentation(value, MAGNET_AURA), /non-interactive/);
  }
  {
    const value = clone();
    value.magnet.statusIcon.activeButtonSlot = 1;
    assert.throws(() => validateMagnetPresentation(value, MAGNET_AURA), /exact keys/);
  }
  {
    const value = clone();
    value.magnet.activeEffect.fallback.logicalName = "magnet-active";
    assert.throws(() => validateMagnetPresentation(value, MAGNET_AURA), /fallback/);
  }
});

test("aura recipe is UUID-free, consumes exactly five textures and rejects unknown or incomplete structures", () => {
  assert.doesNotThrow(() => validateMagnetAuraRecipe(MAGNET_AURA));
  assert.deepEqual(MAGNET_AURA.textureDependencies.map((entry) => entry.logicalName), [
    "x_lighting01", "x_lighting02", "x_lighting03", "xt_s_lighting", "xt_s_lighting02",
  ]);
  const clone = () => structuredClone(MAGNET_AURA);
  {
    const value = clone();
    value.textureDependencies.pop();
    assert.throws(() => validateMagnetAuraRecipe(value), /five frozen/);
  }
  {
    const value = clone();
    value.root.components.push({ type: "unknown-source-component" });
    assert.throws(() => validateMagnetAuraRecipe(value), /unknown recipe component/);
  }
  {
    const value = clone();
    value.animation.tracks[0].properties[0].property = "rotation";
    assert.throws(() => validateMagnetAuraRecipe(value), /unknown or empty animation property/);
  }
  {
    const value = clone();
    value.textureDependencies[0].textureAsset = "cae4c893-2179-4fca-9b76-44472a335923";
    assert.throws(() => validateMagnetAuraRecipe(value), /UUID leaked/);
  }
  assert.throws(() => decodeCocos2PackedDocument([
    1,
    [],
    [],
    [["unknown.SourceComponent", ["node"], 1, 1]],
    [[0, 0, 1]],
    [[[[0, 0]], 0, 0, [], [], []]],
  ]), /unsupported class/);
});

test("S1-12 presentation version changes only the client hash while skin versions remain one", () => {
  const before = { presentation: { tools: null } };
  const after = { presentationVersion: 2, presentation: { tools: { magnet: true } } };
  assert.doesNotThrow(() => assertPresentationVersionTransition(before, after));
  assert.throws(() => assertPresentationVersionTransition({ presentationVersion: 1, presentation: {} }, { presentationVersion: 1, presentation: { changed: true } }), /must migrate/);
  const first = buildArtifacts();
  const second = buildArtifacts();
  assert.equal(SNAKE_PRESENTATION_VERSION, 2);
  assert.equal(first.hashes.publicCatalogHash, HISTORICAL_PUBLIC_CATALOG_HASH);
  assert.equal(first.hashes.serverBusinessHash, HISTORICAL_SERVER_BUSINESS_HASH);
  assert.notEqual(first.hashes.clientPresentationHash, HISTORICAL_CLIENT_PRESENTATION_HASH);
  assert.deepEqual(second.hashes, first.hashes);
  assert.ok(first.publicCatalog.every((entry) => entry.contentVersion === 1));
  assert.equal(first.artifacts.get("apps/Cocos/assets/resources/snakeoff/snake_magnet_aura.json").equals(second.artifacts.get("apps/Cocos/assets/resources/snakeoff/snake_magnet_aura.json")), true);
});

test("registered resource guards reject deletion/mutation and collect-magnet remains 44.1 kHz mono", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("source/manifest.json", import.meta.url), "utf8"));
  const record = manifest.copiedResources.find((entry) => entry.logicalName === "audio/collect-magnet");
  const data = fs.readFileSync(new URL("../../apps/Cocos/assets/resources/snakeoff/snake_sfx_collect_magnet.mp3", import.meta.url));
  assert.equal(validateRegisteredResource(record, data), record.outputSha256);
  assert.deepEqual(inspectMp3(data), { codec: "MPEG Layer III", sampleRateHz: 44100, channels: 1 });
  assert.throws(() => validateRegisteredResource(record, null), /resource is missing/);
  const changed = Buffer.from(data);
  changed[changed.length - 1] ^= 1;
  assert.throws(() => validateRegisteredResource(record, changed), /SHA mismatch/);
});
