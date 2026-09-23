/** SC3-B4: production SLG renderers share the host's ordered globals table. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { Stage3D, type Stage3DGlobalsState, type Stage3DScene } from "../src/view/scene3d/Stage3D";
import { cloneGlobals } from "../src/view/scene3d/stage3dGlobals";
import type { ISlgTerrain } from "../src/shared/kits/slg/api/worldmap/index";
import type { SlgTilesData } from "../src/kits/slg/logic/tilemapMesh";
import type { Node, Texture2D } from "cc";

class FakeMaterial {
    static fail = false;
    static all: FakeMaterial[] = [];
    destroyed = false;
    constructor() { FakeMaterial.all.push(this); }
    initialize(): void { if (FakeMaterial.fail) throw new Error("material failed"); }
    setProperty(): void {}
    destroy(): void { this.destroyed = true; }
}
class FakeMesh { destroyed = false; destroy(): void { this.destroyed = true; } }
class FakeRenderer { mesh: FakeMesh | null = null; material: FakeMaterial | null = null; }
class FakeNode {
    static failComponent = false;
    active = true; layer = 1; children: FakeNode[] = []; destroyed = false;
    constructor(readonly name = "root") {}
    addChild(node: FakeNode): void { this.children.push(node); }
    addComponent<T>(Type: new () => T): T { if (FakeNode.failComponent) throw new Error("component failed"); return new Type(); }
    destroy(): void { this.destroyed = true; this.active = false; }
}
let subjects: { chunk: typeof import("../src/kits/slg/view/SlgChunkRenderer"); tile: typeof import("../src/kits/slg/view/SlgTilemapRenderer") } | undefined;
async function load() {
    if (subjects) return subjects;
    const moduleApi = createRequire(import.meta.url)("node:module") as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
    const original = moduleApi._load;
    moduleApi._load = function (request, parent, isMain) {
        if (request === "cc") return {
            EffectAsset: { get: () => ({ techniques: [{ name: "alpha-blend" }] }) }, gfx: { CullMode: { NONE: 0 } },
            Material: FakeMaterial, Mesh: FakeMesh, MeshRenderer: FakeRenderer, Node: FakeNode,
            UIMeshRenderer: class {}, Texture2D: class {}, Vec3: class {},
            utils: { MeshUtils: { createDynamicMesh: () => new FakeMesh() } },
            director: { getScene: () => assert.fail("SLG must consume the injected globals lease") },
        };
        return original.call(this, request, parent, isMain);
    };
    try { subjects = { chunk: await import("../src/kits/slg/view/SlgChunkRenderer"), tile: await import("../src/kits/slg/view/SlgTilemapRenderer") }; return subjects; }
    finally { moduleApi._load = original; }
}
function harness() {
    let state: Stage3DGlobalsState = { toneMapping: "default", fog: { enabled: false, type: "linear", density: 0.1, start: 0, end: 500 },
        ambient: { skyIllum: 10 }, shadows: { enabled: false, kind: "planar" },
        skybox: { enabled: false, envmap: null, diffuseMap: null, reflectionMap: null, lighting: "hemisphere" } };
    const scene = {
        isValid: () => true, isNodeValid: () => true,
        createNode: (name: string) => new FakeNode(name), addCamera: () => ({}), addLight: () => ({}),
        destroyNode: (node: FakeNode) => node.destroy(), setCameraViewport: () => {}, setCameraClear: () => {},
        readViewportMetrics: () => ({ design: { x: 0, y: 0, width: 750, height: 1624 }, screen: { width: 750, height: 1624 }, content: { x: 0, y: 0, width: 750, height: 1624 } }),
        globals: { read: () => state, apply: (next: Stage3DGlobalsState) => { state = cloneGlobals(next); } },
        subscribe: () => () => {},
    } as unknown as Stage3DScene;
    const stage = new Stage3D({ captureScene: () => scene });
    const owner = new AbortController();
    const value = { signal: owner.signal, isActive: () => !owner.signal.aborted };
    const acquire = () => stage.acquireGlobals(value, { toneMapping: "linear" });
    const root = new FakeNode();
    const terrain = { width: 1500, height: 1500, islandRect: { minX: 100, minY: 100, maxX: 1300, maxY: 1300 } } as ISlgTerrain;
    const texture = {} as Texture2D;
    const make = (kind: "chunk" | "tile") => kind === "chunk"
        ? new subjects!.chunk.SlgChunkRenderer(root as unknown as Node, terrain, texture, acquire)
        : new subjects!.tile.SlgTilemapRenderer(root as unknown as Node, terrain, { layers: [] } as unknown as SlgTilesData, new Map(), texture, texture, acquire);
    return { stage, value, owner, acquire, make, tone: () => state.toneMapping, root };
}

test("SLG renderers and the stage preserve live values in every acquisition/release order", async () => {
    await load();
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const acquisition of orders) for (const removal of orders) {
        const h = harness(), leases: { release(): void }[] = [];
        for (const i of acquisition) {
            if (i === 2) { const world = h.stage.acquire(h.value); world.setGlobals({ toneMapping: "default" }); leases[i] = world; }
            else { const renderer = h.make(i === 0 ? "chunk" : "tile"); leases[i] = { release: () => renderer.dispose() }; }
        }
        const alive = new Set([0, 1, 2]);
        for (const i of removal) {
            leases[i].release(); leases[i].release(); alive.delete(i);
            const last = acquisition.filter((n) => alive.has(n)).pop();
            assert.equal(h.tone(), last === undefined || last === 2 ? "default" : "linear");
        }
        assert.equal(h.stage.active, false);
    }
});

test("SLG page abort restores globals even before renderer disposal, without reviving a removed token", async () => {
    await load(); const h = harness(), a = h.make("chunk"), b = h.make("tile");
    assert.equal(h.tone(), "linear"); h.owner.abort(); assert.equal(h.tone(), "default");
    b.dispose(); a.dispose(); assert.equal(h.tone(), "default");
});

test("SLG failed renderer initialization allocates no globals lease and destroys its materials", async () => {
    await load();
    for (const mode of ["chunk", "tile"] as const) {
        const h = harness(); FakeMaterial.all = []; FakeMaterial.fail = true;
        try { assert.throws(() => h.make(mode), /material failed/u); }
        finally { FakeMaterial.fail = false; }
        assert.equal(h.tone(), "default"); assert.ok(FakeMaterial.all.every((m) => m.destroyed));
    }
    const h = harness(); FakeMaterial.all = []; FakeNode.failComponent = true;
    try { assert.throws(() => h.make("tile"), /component failed/u); }
    finally { FakeNode.failComponent = false; }
    assert.equal(h.tone(), "default"); assert.ok(FakeMaterial.all.every((m) => m.destroyed));
});

test("SLG failed globals acquisition cleans the fully constructed renderer", async () => {
    await load();
    for (const mode of ["chunk", "tile"] as const) {
        const h = harness(); h.stage.dispose(); FakeMaterial.all = [];
        assert.throws(() => h.make(mode), /no longer active/u);
        assert.ok(FakeMaterial.all.every((m) => m.destroyed)); assert.equal(h.tone(), "default");
        assert.ok(h.root.children.every((node) => node.destroyed));
    }
});

test("SLG port injection is isolated from stale uninstall of the same host instance", async () => {
    const { setSlgStage3D, getSlgStage3D } = await import("../src/kits/slg/view/slgStage3D");
    const h = harness();
    const old = setSlgStage3D(h.stage), current = setSlgStage3D(h.stage);
    old(); assert.equal(getSlgStage3D(), h.stage);
    current(); current(); assert.throws(getSlgStage3D, /not installed/u);
});
