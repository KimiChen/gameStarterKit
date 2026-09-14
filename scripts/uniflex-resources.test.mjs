import assert from "node:assert/strict";
import { test } from "node:test";
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
