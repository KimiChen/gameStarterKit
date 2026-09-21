import assert from "node:assert/strict";
import { test } from "node:test";
import {
    assertSpriteFrameImageMeta,
    createSpriteFrameImageMeta,
} from "./lib/uniflex-cocos-image-meta.mjs";
import { createImageResourceEntry } from "./lib/uniflex-resources.mjs";

test("UniFlex image resource preserves nine-slice insets", () => {
    assert.deepEqual(createImageResourceEntry({
        id: "panel-bg",
        file: "assets/panel-bg.png",
        width: 200,
        height: 100,
        nineSlice: [16, 12, 18, 14],
        sha256: "abc",
    }, "Example"), {
        id: "panel-bg",
        kind: "image",
        file: "ui/Example/assets/panel-bg.png",
        width: 200,
        height: 100,
        nineSlice: [16, 12, 18, 14],
        sha256: "abc",
    });
});

test("UniFlex image resource omits unset nine-slice metadata", () => {
    assert.equal(Object.hasOwn(createImageResourceEntry({
        id: "icon",
        path: "assets/icon.png",
        sha256: "def",
    }, "Example"), "nineSlice"), false);
});

test("UniFlex resource manifest entries use file", () => {
    assert.equal(createImageResourceEntry({
        id: "panel-bg",
        file: "assets/panel.png",
        sha256: "abc",
    }, "Example").file, "ui/Example/assets/panel.png");
});

test("Cocos UniFlex PNG meta exposes spriteFrame and nine-slice borders", () => {
    const uuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const meta = createSpriteFrameImageMeta({
        uuid,
        displayName: "panel-bg",
        width: 200,
        height: 100,
        nineSlice: [16, 12, 18, 14],
    });
    assert.equal(meta.userData.type, "sprite-frame");
    assert.equal(meta.subMetas.f9941.name, "spriteFrame");
    assert.equal(meta.subMetas.f9941.userData.borderLeft, 16);
    assert.equal(meta.subMetas.f9941.userData.borderTop, 12);
    assert.equal(meta.subMetas.f9941.userData.borderRight, 18);
    assert.equal(meta.subMetas.f9941.userData.borderBottom, 14);
    assert.equal(meta.subMetas.f9941.userData.trimType, "custom");
    assert.equal(meta.subMetas["6c48a"].userData.wrapModeS, "clamp-to-edge");
    assertSpriteFrameImageMeta(meta, { width: 200, height: 100, nineSlice: [16, 12, 18, 14] });
});

test("Cocos UniFlex PNG meta check rejects texture-only imports", () => {
    assert.throws(() => assertSpriteFrameImageMeta({
        userData: { type: "texture" },
        subMetas: { "6c48a": { name: "texture" } },
    }), /sprite-frame/);
});
