/** SC1-B8 mutation: remove the capability clamp on textureFormat → dev-high-without-ASTC fails. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDetailLayersTable, parsePoolTable, parseQualityTable } from "../src/logic/scene3d/qualityData";
import { DEFAULT_QUALITY_TABLE, detectQualityTier, resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../src/logic/scene3d/qualityTiers";
import type { QualityDevice } from "../src/logic/scene3d/qualityTiers";
import { Stage3D } from "../src/view/scene3d/Stage3D";

const capable = { instancing: true, floatJointTexture: true, rgba8JointTexture: true, shadowMap: true, astc: true };
const desktop: QualityDevice = { platform: "desktop", api: "webgl2", renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)", capabilities: capable };
const load = (name: string) => JSON.parse(readFileSync(new URL(`../../Cocos/assets/resources/stage3d/data/${name}.json`, import.meta.url), "utf8"));

for (const [platform, api, renderer, tier] of [
    ["wechat", "webgl2", "Apple A18", "low"], ["desktop", "webgl1", "Apple M4", "low"],
    ["mobile", "native", "unknown", "low"], ["desktop", "webgl2", "WebKit WebGL", "low"],
    ["unknown", "webgl2", "Apple M4", "low"], ["desktop", "unknown", "Apple M4", "low"],
    ["mobile", "webgl2", "Adreno (TM) 640", "medium"], ["mobile", "native", "Mali-G76", "medium"],
    ["mobile", "webgl2", "Apple A12 GPU", "medium"], ["mobile", "native", "Adreno 730", "high"],
    ["mobile", "native", "Mali-G715", "high"], ["mobile", "native", "Apple A16 GPU", "high"],
    ["mobile", "webgl2", "Apple A11", "low"], ["mobile", "webgl2", "Mali-T880", "low"],
    ["mobile", "webgl2", "Adreno 540", "low"], ["desktop", "webgl2", "ANGLE SwiftShader NVIDIA GeForce", "low"],
    ["desktop", "native", "AMD Radeon RX 6800", "high"], ["desktop", "webgl2", "NVIDIA GeForce RTX 3060", "high"],
    ["desktop", "webgl2", "Intel Iris Xe Graphics", "high"], ["desktop", "native", "Apple M4", "high"],
] as const) test(`quality: ${platform}/${api}/${renderer} → ${tier}`, () => {
    assert.equal(detectQualityTier({ platform, api, renderer, capabilities: capable }), tier);
});

test("SC0 frozen low/medium/high policy is consumed from JSON", () => {
    assert.deepEqual(DEFAULT_QUALITY_TABLE, parseQualityTable(load("quality")));
    for (const [tier, effects, units] of [["low", 8, 50], ["medium", 24, 100], ["high", 48, 100]] as const) {
        const q = resolveQuality(desktop, true, { quality: tier });
        assert.equal(q.maxEffects, effects); assert.equal(q.maxUnits, units); assert.equal(q.minTextureSize, 256);
        assert.equal(q.details, tier !== "low"); assert.equal(q.textureStepDown, tier === "low" ? 1 : 0);
    }
    assert.equal(resolveQuality(desktop, true, { quality: "low", shadows: "1" }).shadows, "off");
});

test("development accepts exact tiers and disable-shadows; production ignores every override", () => {
    assert.equal(resolveQuality(desktop, true, { quality: "medium", shadows: "0" }).shadows, "off");
    assert.equal(resolveQuality(desktop, true, { quality: "HIGH" }).tier, "high");
    assert.equal(resolveQuality({ ...desktop, platform: "wechat" }, true, { quality: "HIGH" }).tier, "low");
    assert.deepEqual(resolveQuality(desktop, false, { quality: "low", shadows: "0" }), resolveQuality(desktop));
    assert.equal(resolveQuality({ ...desktop, api: "webgl1" }, true, { quality: "high" }).tier, "high");
});

test("dev high without ASTC/instancing/shadows cannot invent capabilities", () => {
    const device: QualityDevice = { ...desktop, api: "webgl1", capabilities: { ...capable, astc: false, instancing: false, shadowMap: false, floatJointTexture: false } };
    const q = resolveQuality(device, true, { quality: "high", shadows: "1" });
    assert.equal(q.tier, "high"); assert.equal(q.detectedTier, "low"); assert.equal(q.textureFormat, "png");
    assert.equal(q.instancing, false); assert.equal(q.bakedSkinningInstancing, false); assert.equal(q.shadows, "off");
    assert.equal(q.jointTexture, "rgba8"); assert.ok(q.maxUnits < DEFAULT_QUALITY_TABLE.tiers.high.maxUnits);
});

test("WebGL1 keeps proven RGBA8 baked path; realtime never enables instancing", () => {
    const d = { ...desktop, api: "webgl1" as const, capabilities: { ...capable, floatJointTexture: false } };
    const q = resolveQuality(d);
    assert.equal(q.tier, "low"); assert.equal(q.jointTexture, "rgba8"); assert.equal(q.bakedSkinningInstancing, true);
    assert.equal(q.realtimeSkinningInstancing, false); assert.equal(q.maxUnits, 50);
    const noVertexTextures = resolveQuality({ ...d, capabilities: { ...d.capabilities, rgba8JointTexture: false } });
    assert.equal(noVertexTextures.jointTexture, "unavailable"); assert.equal(noVertexTextures.bakedSkinningInstancing, false);
    assert.ok(noVertexTextures.maxUnits < 50);
});

test("Stage3D exposes lazy quality without acquiring a scene, and snapshots cannot mutate policy/device", () => {
    let device = UNKNOWN_QUALITY_DEVICE, reads = 0;
    const port = new Stage3D({ captureScene: () => { throw new Error("must not capture scene"); } }, undefined,
        () => { reads++; return resolveQuality(device); });
    assert.equal(reads, 0); assert.equal(port.quality.tier, "low");
    device = desktop;
    assert.equal(port.quality.tier, "high"); assert.equal(reads, 2);
    const q = port.quality;
    assert.equal(Reflect.set(q.device.capabilities, "astc", false), false);
    assert.equal(Reflect.set(q, "maxUnits", 999), false);
    assert.equal(capable.astc, true); assert.equal(DEFAULT_QUALITY_TABLE.tiers.high.maxUnits, 100);
});

test("quality generated default stays byte-identical to the JSON source", async () => {
    const toolUrl = new URL("../../../tools/art3d/sync-quality-defaults.mjs", import.meta.url).href;
    const { renderQualityDefaults } = await import(toolUrl);
    assert.equal(readFileSync(new URL("../src/logic/scene3d/qualityDefaults.generated.ts", import.meta.url), "utf8"), renderQualityDefaults(load("quality")));
});

test("framework quality/pool/detail-layers tables validate with complete quality × LOD addresses", () => {
    const pool = parsePoolTable(load("pool"));
    const detail = parseDetailLayersTable(load("detail-layers"), pool);
    assert.deepEqual(pool.maxActivationsPerFrame, { low: 4, medium: 8, high: 16 });
    assert.equal(detail.layers[0]!.textures[0]!.variants.length, 9);
    assert.equal(detail.layers.find((l) => l.id === "details")!.pools[0], "cubes");
    assert.ok(Object.isFrozen(detail.layers[0]!.textures[0]!.variants[0]!.asset));
});

for (const [name, mutate, message] of [
    ["unknown tier", (x: any) => { x.tiers.ultra = x.tiers.high; }, /unknown field/],
    ["missing tier", (x: any) => { delete x.tiers.low; }, /missing field/],
    ["fractional budget", (x: any) => { x.tiers.low.maxUnits = 1.5; }, /integer/],
    ["nonfinite budget", (x: any) => { x.tiers.high.maxUnits = Infinity; }, /integer/],
    ["invalid boolean", (x: any) => { x.tiers.low.details = "false"; }, /boolean/],
    ["unknown shadow", (x: any) => { x.tiers.low.shadows = "ultra"; }, /off/],
    ["raising fallback", (x: any) => { x.tiers.low.maxUnitsWithoutInstancing = 100; }, /cannot raise/],
    ["unsupported texture size", (x: any) => { x.tiers.low.minTextureSize = 255; }, /POT/],
] as const) test(`quality schema rejects ${name}`, () => {
    const data = load("quality"); mutate(data); assert.throws(() => parseQualityTable(data), message);
});

for (const [name, mutate, message] of [
    ["missing pool", (x: any) => { x.layers[1].pools = ["absent"]; }, /unknown pool/],
    ["unassigned pool", (x: any) => { x.layers[1].pools = []; }, /no layer/],
    ["duplicate pool ownership", (x: any) => { x.layers[0].pools = ["cubes"]; }, /duplicate/],
    ["missing base", (x: any) => { x.layers.shift(); }, /base layer/],
    ["missing variant", (x: any) => { x.layers[0].textures[0].variants.pop(); }, /every quality/],
    ["duplicate variant", (x: any) => { x.layers[0].textures[0].variants[1] = x.layers[0].textures[0].variants[0]; }, /duplicate/],
    ["invalid LOD", (x: any) => { x.layers[0].textures[0].variants[0].lod = 3; }, /0 \/ 1/],
    ["path traversal", (x: any) => { x.layers[0].prefabs[0].path = "stage3d/../secret"; }, /relative/],
    ["remote path", (x: any) => { x.layers[0].prefabs[0].path = "https://example.org/prefab"; }, /relative/],
    ["bundle path", (x: any) => { x.layers[0].prefabs[0].bundle = "kit-foo/../kit-bar"; }, /bundle/],
] as const) test(`detail-layers schema rejects ${name}`, () => {
    const data = load("detail-layers"); mutate(data); assert.throws(() => parseDetailLayersTable(data, parsePoolTable(load("pool"))), message);
});

test("pool schema rejects nonpositive activation budgets and duplicate IDs", () => {
    const data = load("pool"); data.maxActivationsPerFrame.low = 0;
    assert.throws(() => parsePoolTable(data), /integer >= 1/);
    data.maxActivationsPerFrame.low = 4; data.entries.push(data.entries[0]);
    assert.throws(() => parsePoolTable(data), /duplicate/);
});

test("detail-layers hideAtLod snapshots registered pool and plain prefab gates", () => {
    const data = load("detail-layers"), pool = parsePoolTable(load("pool"));
    data.hideAtLod = [{ prefab: pool.entries[0].prefab, lod: 2 }, { prefab: data.layers[0].prefabs[0], lod: 1 }];
    const parsed = parseDetailLayersTable(data, pool);
    data.hideAtLod[0].lod = 0;
    assert.equal(parsed.hideAtLod![0].lod, 2); assert.ok(Object.isFrozen(parsed.hideAtLod![0].prefab));
});
for (const [name, mutate] of [
    ["unknown prefab", (x: any) => { x.hideAtLod[0].prefab.path = "missing"; }],
    ["duplicate prefab", (x: any) => { x.hideAtLod.push(x.hideAtLod[0]); }],
    ["out of range", (x: any) => { x.hideAtLod[0].lod = 3; }],
    ["fraction", (x: any) => { x.hideAtLod[0].lod = 0.5; }],
    ["missing lod", (x: any) => { delete x.hideAtLod[0].lod; }],
    ["unknown field", (x: any) => { x.hideAtLod[0].lods = [1]; }],
] as const) test(`detail-layers hideAtLod rejects ${name}`, () => {
    const data = load("detail-layers"), pool = parsePoolTable(load("pool"));
    data.hideAtLod = [{ prefab: { ...pool.entries[0].prefab }, lod: 2 }]; mutate(data);
    assert.throws(() => parseDetailLayersTable(data, pool), /hideAtLod/);
});
