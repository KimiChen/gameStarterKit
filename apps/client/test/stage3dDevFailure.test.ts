import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
const moduleApi = createRequire(import.meta.url)("node:module") as { _load(request: string, parent: unknown, main: boolean): unknown };
const original = moduleApi._load, draws: (() => void)[] = [];
let Scene: any;
try {
    moduleApi._load = function(request, parent, main) {
        if (request === "cc") return { Component: class {}, _decorator: {
            ccclass: () => (Type: unknown) => Type, property: () => () => {} } };
        if (request === "cc/env") return { DEV: true };
        if (request === "./ownedRendering") return { OwnedRenderingRetirement: class {
            finish(callback: () => void) { draws.push(callback); }
        } };
        if (["./cocosAssetLoader", "./Stage3D", "./cocosStage3DEngine", "./quality", "./cocosEntityPool", "./SkinnedUnitsFixture", "./VfxFixture"].includes(request)) return {};
        return original.call(this, request, parent, main);
    };
    Scene = createRequire(import.meta.url)("../src/view/scene3d/Stage3dDevScene").Stage3dDevScene;
} finally { moduleApi._load = original; }

test("Developer stage: an asynchronous required-pool failure closes all content and the stage lease before another draw", () => {
    for (const kind of ["skinned", "vfx"]) {
        const scene = new Scene(), closed: string[] = [];
        scene.status = "ready";
        scene.skinned = { status: kind === "skinned" ? "failed" : "ready", error: kind === "skinned" ? "remote cache failure" : "", close: () => closed.push("skinned") };
        scene.vfx = { error: kind === "vfx" ? "remote cache failure" : "", close: () => closed.push("vfx") };
        scene.entityPool = { close: () => closed.push("entities") };
        scene.stage = { dispose: () => closed.push("stage") };
        scene.assets = { release: () => closed.push("assets") };
        scene.update();
        assert.equal(scene.status, "failed"); assert.match(scene.error, /cache failure/);
        assert.equal(scene.owner.signal.aborted, true); assert.deepEqual(closed, ["vfx", "skinned", "entities", "stage"]);
        for (const draw of draws.splice(0)) draw(); assert.equal(closed.at(-1), "assets");
        scene.update(); scene.onDestroy(); assert.equal(closed.length, 5, "failure cleanup is idempotent");
    }
});
