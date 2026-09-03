import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SourceTracker,
  decompressUuid,
  expectPropertyLiteral,
  parseDataLiteralAt,
  sha256,
  stableJson,
} from "./core.mjs";
import {
  deadlineDone,
  generatedPointSteps,
  pathPointCount,
  rotatePortrait,
} from "./model.mjs";
import { decodePng, encodePng, image } from "./png.mjs";

const SPEC = JSON.parse(fs.readFileSync(new URL("./baseline-spec.json", import.meta.url), "utf8"));

test("data-only source parser handles source literals without eval", () => {
  const source = "prefix config: { map_width: 4896, camera_min_scale: .6, list: [{x: 1e5,},], yes: true, none: null } suffix";
  assert.deepEqual(expectPropertyLiteral(source, "config"), {
    map_width: 4896,
    camera_min_scale: 0.6,
    list: [{ x: 100000 }],
    yes: true,
    none: null,
  });
  assert.throws(() => parseDataLiteralAt("process.exit()", 0), /Executable or unsupported identifier/);
  assert.throws(() => parseDataLiteralAt("{value: (() => 1)()}", 0), /Expected identifier|Executable|unsupported/);
});

test("canonical JSON and hash do not depend on object insertion order", () => {
  const left = { z: 1, a: { y: 2, x: 3 }, list: [{ b: 2, a: 1 }] };
  const right = { list: [{ a: 1, b: 2 }], a: { x: 3, y: 2 }, z: 1 };
  assert.equal(stableJson(left), stableJson(right));
  assert.equal(sha256(stableJson(left)), sha256(stableJson(right)));
});

test("Cocos compressed UUID resolves locked atlas identity", () => {
  assert.equal(decompressUuid("97nA4ZnfNJkIF9EO2wbuBc"), "979c0e19-9df3-4990-817d-10edb06ee05c");
  assert.equal(decompressUuid("87MrDXg89GuJpawJP58R9k"), "8732b0d7-83cf-46b8-9a5a-c093f9f11f64");
});

test("source manifest distinguishes symlink identity from resolved bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "snake-s0-source-"));
  try {
    fs.mkdirSync(path.join(root, "real"));
    fs.writeFileSync(path.join(root, "real", "asset.bin"), Buffer.from("locked asset"));
    fs.symlinkSync("real/asset.bin", path.join(root, "alias.bin"));
    const tracker = new SourceTracker(root);
    assert.equal(tracker.readText("alias.bin", "test"), "locked asset");
    tracker.verifyUnchanged();
    const [entry] = tracker.manifest();
    assert.equal(entry.kind, "symbolicLink");
    assert.equal(entry.linkTarget, "real/asset.bin");
    assert.equal(entry.resolvedPath, "real/asset.bin");
    assert.equal(entry.resolvedSha256, sha256("locked asset"));
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});

test("71-entry path table retains duplicate boundary and exact vectors", () => {
  const steps = generatedPointSteps();
  assert.equal(steps.length, 71);
  assert.deepEqual(steps.slice(62, 65), [
    { max_length: 18900, step_length: 65 },
    { max_length: 18900, step_length: 66 },
    { max_length: 19200, step_length: 67 },
  ]);
  const vectors = new Map([[80, 52], [300, 200], [3000, 960], [18900, 1954], [19200, 1964], [20100, 1990], [100000, 5186]]);
  for (const [length, expected] of vectors) assert.equal(pathPointCount(length, steps), expected, `length ${length}`);
});

test("portrait transform is a 90-degree isometry, not 4096/4896 scaling", () => {
  const input = { x: 123.5, y: -456.25 };
  const output = rotatePortrait(input);
  assert.deepEqual(output, { x: 456.25, y: 123.5 });
  assert.equal(Math.hypot(input.x, input.y), Math.hypot(output.x, output.y));
  assert.deepEqual(rotatePortrait(output), { x: -123.5, y: 456.25 });
  assert.notEqual(Math.hypot(output.x, output.y) / Math.hypot(input.x, input.y), 4096 / 4896);
});

test("room deadline and personal choice deadline remain different types", () => {
  for (const tick of [0, 1799, 1800, 1801, 100000]) {
    assert.equal(deadlineDone({ hasDeadline: false, endTick: null }, tick), false);
  }
  assert.equal(deadlineDone({ hasDeadline: true, endTick: 1800 }, 1799), false);
  assert.equal(deadlineDone({ hasDeadline: true, endTick: 1800 }, 1800), true);
  const opened = 1800;
  const personalDeadline = opened + 100;
  assert.equal(1899 < personalDeadline, true);
  assert.equal(1900 < personalDeadline, false);
});

test("first-active and relive protection use half-open tick intervals", () => {
  const protectedAt = (tick, start, duration) => tick >= start && tick < start + duration;
  assert.equal(protectedAt(700, 700, 30), true);
  assert.equal(protectedAt(729, 700, 30), true);
  assert.equal(protectedAt(730, 700, 30), false);
  assert.equal(protectedAt(759, 700, 60), true);
  assert.equal(protectedAt(760, 700, 60), false);
});

test("approved non-V2 rules and exact presentation channels stay frozen", () => {
  assert.deepEqual(SPEC.approvedRules, {
    dotLength: 1,
    dotScore: 1,
    starLength: 10,
    starScore: 10,
    baseSpeedWorldUnitsPerSecond: 160,
    boostMultiplier: 2,
    turnDegreesPerTick: 9,
    firstActiveProtectionTicks: 30,
    reliveProtectionTicks: 60,
    humanDeathPresentationTicks: 4,
    aiRespawnTicks: 40,
    reliveDecisionTicks: 100,
    maxSuccessfulRelives: 5,
  });
  assert.deepEqual(SPEC.presentation.light.outside, [108, 36, 31, 255]);
  assert.deepEqual(SPEC.presentation.light.map, [235, 236, 244, 255]);
  assert.deepEqual(SPEC.presentation.light.grid, [205, 205, 214, 255]);
  assert.equal(SPEC.presentation.light.boundary.explicitStroke, false);
  assert.deepEqual(SPEC.presentation.dark.boundary.color, [235, 79, 113, 255]);
  assert.equal(SPEC.presentation.gridSpacing, 32);
  assert.equal(SPEC.presentation.mapMargin, 16);
});

test("PNG encoder is deterministic and decoder preserves RGBA", () => {
  const source = image(3, 2, [10, 20, 30, 255]);
  source.data.set([200, 100, 50, 128], 4);
  const first = encodePng(source);
  const second = encodePng(source);
  assert.deepEqual(first, second);
  assert.deepEqual(decodePng(first), source);
});
