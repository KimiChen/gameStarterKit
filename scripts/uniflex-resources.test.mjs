import assert from "node:assert/strict";
import { test } from "node:test";
import { createImageResourceEntry, cocosSpriteFrameMeta } from "./lib/uniflex-resources.mjs";

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

test("Cocos image generation upgrades Texture imports without replacing UUIDs or importer settings", () => {
    const prior = { importer: "image", uuid: "original", subMetas: { texture: { filter: "linear" } },
        userData: { type: "texture", redirect: "original@6c48a", hasAlpha: true } };
    const next = cocosSpriteFrameMeta(prior, "unused");
    assert.equal(next.uuid, "original");
    assert.deepEqual(next.subMetas.texture, prior.subMetas.texture);
    assert.deepEqual(next.userData, { type: "sprite-frame", redirect: "original@6c48a", hasAlpha: true });
    assert.equal(prior.userData.type, "texture");
    assert.deepEqual(cocosSpriteFrameMeta(next, "unused"), next);
    assert.equal(cocosSpriteFrameMeta(undefined, "fresh").userData.redirect, "fresh@6c48a");
    const sliced = cocosSpriteFrameMeta(next, "unused", [26, 32, 52, 39]);
    assert.deepEqual(sliced.subMetas.f9941.userData, {
        borderLeft: 26, borderTop: 32, borderRight: 52, borderBottom: 39,
    });
    assert.deepEqual(cocosSpriteFrameMeta(sliced, "unused").subMetas.f9941.userData,
        next.subMetas.f9941.userData);
});
