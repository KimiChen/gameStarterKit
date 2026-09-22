import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const project = fileURLToPath(new URL("../../Cocos", import.meta.url));
const json = (path: string) => JSON.parse(readFileSync(`${project}/${path}`, "utf8"));
const toolUrl = new URL("../../../tools/art3d/quality-assets.mjs", import.meta.url).href;

test("both Creator presets resolve ASTC plus PNG fallback on every target platform", async () => {
    const { verifyQualityPresets, resolveTexturePreset, texturePlatforms } = await import(toolUrl);
    const builder = json("settings/v2/packages/builder.json");
    verifyQualityPresets(builder);
    for (const id of ["3d-default", "3d-alpha"]) for (const platform of texturePlatforms) {
        assert.equal(resolveTexturePreset(builder, id, platform, false), "png");
        assert.equal(resolveTexturePreset(builder, id, platform, true), id === "3d-default" ? "astc_8x8" : "astc_6x6");
    }
    const meta = json("assets/resources/stage3d/T_Greybox_Checker_BC.png.meta");
    assert.equal(meta.userData.compressSettings.useCompressTexture, true);
    assert.equal(resolveTexturePreset(builder, meta.userData.compressSettings.presetId, "web", false), "png");
    assert.equal(meta.subMetas["6c48a"].userData.mipfilter, "linear");
    const lightmap = json("assets/resources/stage3d/lightmaps/LightFX/output/LFX_Mesh_0000.png.meta");
    assert.notEqual(lightmap.userData.compressSettings?.useCompressTexture, true);
});

test("presets reject missing ID/platform/PNG, incorrect ASTC and disabled mipmaps", async () => {
    const { verifyQualityPresets } = await import(toolUrl);
    for (const mutate of [
        (b: any) => { delete b.textureCompressConfig.userPreset["3d-default"]; },
        (b: any) => { delete b.textureCompressConfig.userPreset["3d-alpha"].options.miniGame; },
        (b: any) => { delete b.textureCompressConfig.userPreset["3d-default"].options.web.png; },
        (b: any) => { b.textureCompressConfig.userPreset["3d-default"].options.web.astc_8x8.quality = "fast"; },
        (b: any) => { b.textureCompressConfig.genMipmaps = false; },
        (b: any) => { b.textureCompressConfig.userPreset["3d-default"].overwrite = { web: { astc_8x8: { quality: "medium" } } }; },
    ]) {
        const builder = json("settings/v2/packages/builder.json"); mutate(builder);
        assert.throws(() => verifyQualityPresets(builder));
    }
});

test("independent dev scene serializes only its loader and no workbench/Prefab dependencies", () => {
    const scene = json("assets/stage3d-dev.scene");
    const nodes = scene.filter((x: any) => x.__type__ === "cc.Node");
    assert.deepEqual(nodes.map((x: any) => x._name), ["Stage3dDev"]);
    assert.equal(nodes[0]._components.length, 1);
    assert.equal(JSON.stringify(scene).includes("__uuid__"), false, "Prefab loads by path at runtime, no author-scene dependency");
});

test("build hook excludes developer scenes by either UUID or URL on every platform, rejects dev entry", () => {
    const require = createRequire(import.meta.url);
    const manifest = json("extensions/stage3d-build/package.json");
    const config = require(`${project}/extensions/stage3d-build/${manifest.contributions.builder}`);
    const hooks = require(`${project}/extensions/stage3d-build/${config.configs["*"].hooks}`);
    assert.equal(hooks.throwError, true);
    const main = json("assets/scene.scene.meta").uuid, dev = json("assets/stage3d-dev.scene.meta").uuid;
    const bake = json("assets/stage3d-bake-workbench.scene.meta").uuid;
    for (const platform of ["web-desktop", "web-mobile", "wechatgame", "android", "ios"]) {
        const options = { platform, startScene: main, scenes: [{ uuid: main }, { uuid: dev }, { uuid: bake },
            { url: "db://assets/stage3d-dev.scene" }, { url: "db://assets/other.scene" }] };
        hooks.excludeDevScenes(options, project);
        assert.deepEqual(options.scenes, [{ uuid: main }, { url: "db://assets/other.scene" }]);
        hooks.excludeDevScenes(options, project);
        assert.equal(options.scenes.length, 2, "idempotent");
    }
    assert.throws(() => hooks.excludeDevScenes({ startScene: dev, scenes: [] }, project), /entry scenes/);
    assert.throws(() => hooks.excludeDevScenes({ startScene: "db://assets/stage3d-bake-workbench.scene", scenes: [] }, project), /entry scenes/);
});
