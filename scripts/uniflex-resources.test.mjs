import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createImageResourceEntry,
    normalizeImportedImageResource,
} from "./lib/uniflex-resources.mjs";

test("UniFlex image resource preserves nine-slice insets", () => {
    assert.deepEqual(createImageResourceEntry({
        id: "panel-bg",
        path: "assets/panel-bg.png",
        width: 200,
        height: 100,
        nineSlice: [16, 12, 18, 14],
        sha256: "abc",
    }, "Example"), {
        id: "panel-bg",
        kind: "image",
        file: "imported/Example/assets/panel-bg.png",
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

test("UniFlex resource manifest entries use file while legacy entries use path", () => {
    assert.equal(normalizeImportedImageResource({ file: "assets/panel.png" }).path,
        "assets/panel.png");
    assert.equal(normalizeImportedImageResource({ path: "assets/legacy.png" }).path,
        "assets/legacy.png");
});
