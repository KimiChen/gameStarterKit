import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

test("Cocos quality adapter reads real capability bits, vertex texture units, platform and DEV only", async () => {
    const require = createRequire(import.meta.url);
    const loader = require("node:module") as { _load: (name: string, parent: unknown, main: boolean) => unknown };
    const original = loader._load;
    const env = { DEV: true };
    const gfx = {
        API: { UNKNOWN: 0, GLES2: 1, GLES3: 2, METAL: 3, VULKAN: 4, WEBGL: 6, WEBGL2: 7 },
        Feature: { INSTANCED_ARRAYS: 1 }, Format: { RGBA8: 35, RGBA32F: 44, ASTC_RGBA_6X6: 93, ASTC_RGBA_8X8: 96 },
        FormatFeatureBit: { SAMPLED_TEXTURE: 2, RENDER_TARGET: 1 },
    };
    const formats = new Map<number, number>([[35, 3], [44, 2], [93, 2], [96, 2]]);
    const device = { gfxAPI: 7, renderer: "Apple M4", capabilities: { maxVertexTextureUnits: 16 },
        hasFeature: (feature: number) => feature === 1, getFormatFeatures: (format: number) => formats.get(format) ?? 0 };
    const sys = { isMobile: false, isBrowser: true, isNative: false, platform: "DESKTOP_BROWSER", Platform: { WECHAT_GAME: "WECHAT_GAME" } };
    const director: { root: { device: typeof device } | null } = { root: null };
    const locationBefore = Object.getOwnPropertyDescriptor(globalThis, "location");
    loader._load = function (name, parent, main) {
        if (name === "cc") return { director, gfx, sys };
        if (name === "cc/env") return env;
        return original.call(this, name, parent, main);
    };
    try {
        const { readStage3DQuality: quality } = await import("../src/view/scene3d/quality");
        assert.equal(quality().tier, "low", "before renderer initialization");
        director.root = { device };
        assert.equal(quality().tier, "high", "no cached startup fallback");
        assert.equal(quality().textureFormat, "astc");
        sys.platform = "WECHAT_GAME";
        assert.equal(quality().tier, "low", "desktop WeChat tools also default low");
        sys.platform = "MOBILE_BROWSER"; sys.isMobile = true; device.renderer = "Adreno (TM) 640";
        assert.equal(quality().tier, "medium");
        device.gfxAPI = 6;
        assert.equal(quality().tier, "low");
        formats.set(44, 0); formats.set(96, 0);
        Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "?quality=high&shadows=1&gpu=Apple%20M4&astc=1" } });
        assert.equal(quality().tier, "high"); assert.equal(quality().device.renderer, "Adreno (TM) 640");
        assert.equal(quality().jointTexture, "rgba8"); assert.equal(quality().textureFormat, "png");
        formats.set(35, 2); // sampled but not a render target
        assert.equal(quality().shadows, "off");
        device.capabilities.maxVertexTextureUnits = 0;
        assert.equal(quality().jointTexture, "unavailable"); assert.equal(quality().bakedSkinningInstancing, false);
        env.DEV = false;
        assert.equal(quality().tier, "low");
        Object.defineProperty(globalThis, "location", { configurable: true, get: () => { throw new Error("production must not read URL"); } });
        assert.equal(quality().tier, "low");
    } finally {
        loader._load = original;
        if (locationBefore) Object.defineProperty(globalThis, "location", locationBefore);
        else Reflect.deleteProperty(globalThis, "location");
    }
});
