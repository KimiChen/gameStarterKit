/** The production fixture owns its entire transaction; a late pool failure closes partial content. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { DEFAULT_QUALITY_TABLE, resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../src/logic/scene3d/qualityTiers";
import { AssetLease } from "../src/view/scene3d/AssetLease";
import type { AssetType } from "../src/view/scene3d/AssetLease";
import { SkinnedUnits } from "../src/view/scene3d/SkinnedUnits";
import type { AssetCatalogData } from "../src/logic/scene3d/assetCatalog";
import type { Node } from "cc";

class Animation {}
class Renderer {}
class FakeNode { name = ""; retired = false; setPosition() {} }
class Prefab {
    refs = 0; isValid = true;
    constructor(readonly suffix: string) {}
    addRef() { this.refs++; return this; } decRef() { assert.ok(this.refs > 0); this.refs--; return this; }
    data = { getComponentsInChildren: (Type: unknown) => Type === Animation
        ? [{ clips: [{ name: `idle-${this.suffix}`, hash: this.suffix === "a" ? 1 : 4 }, { name: `walk-${this.suffix}`, hash: this.suffix === "a" ? 2 : 8 }] }]
        : [{ skeleton: { hash: 17, joints: ["Root"] } }] };
}
const prefabA = new Prefab("a"), prefabB = new Prefab("b"), draws: (() => void)[] = [], nodes: FakeNode[] = [];
let activations = 0, failAfter = Infinity, templateRefs = 0;
const resources = new AssetLease({ addRef: (asset) => asset.addRef(), decRef: (asset) => asset.decRef(),
    load: (_bundle, path, _type, callback) => callback(null, (path.includes("atlas-b") ? prefabB : prefabA) as never) });
const moduleApi = createRequire(import.meta.url)("node:module") as { _load(request: string, parent: unknown, main: boolean): unknown };
const original = moduleApi._load;
let Fixture: typeof import("../src/view/scene3d/SkinnedUnitsFixture").SkinnedUnitsFixture;
try {
    moduleApi._load = function(request, parent, main) {
        if (request === "cc") return { Prefab, SkeletalAnimation: Animation, SkinnedMeshRenderer: Renderer,
            director: { once: (_event: unknown, callback: () => void) => draws.push(callback) }, Director: { EVENT_AFTER_DRAW: "draw" } };
        if (request === "./cocosAssetLoader") return { assetLease: resources };
        if (request === "./jointTextureLayouts") return { registerJointTextureLayouts: () => {} };
        if (request === "./cocosSkinnedUnits") return { createCocosSkinnedUnits: (catalog: AssetCatalogData, _parent: Node,
            options: ConstructorParameters<typeof SkinnedUnits<FakeNode>>[2]) => new SkinnedUnits<FakeNode>(catalog, {
                async load() {
                    templateRefs++;
                    return { create: () => { const node = new FakeNode(); nodes.push(node); return node; },
                        activate: () => { if (++activations > failAfter) throw new Error("remote dependency unavailable"); },
                        deactivate: () => {}, retire: node => { node.retired = true; }, release: () => { templateRefs--; },
                        play: () => {}, socket: node => node };
                },
            }, options) };
        return original.call(this, request, parent, main);
    };
    Fixture = createRequire(import.meta.url)("../src/view/scene3d/SkinnedUnitsFixture").SkinnedUnitsFixture;
} finally { moduleApi._load = original; }
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const draw = () => { for (const callback of draws.splice(0)) callback(); };
test("Skinned fixture: failure after partial activation releases all nodes/leases and a fresh enable succeeds", async (t) => {
    const address = { bundle: "resources", path: "stage3d/greybox-biped/greybox-biped" };
    const catalog: AssetCatalogData = { quality: DEFAULT_QUALITY_TABLE,
        pool: { version: 1, maxActivationsPerFrame: { low: 4, medium: 8, high: 16 }, entries: [
            { id: "bipeds", prefab: address, capacity: { low: 50, medium: 100, high: 100 } },
        ] }, layers: { version: 1, layers: [{ id: "base", prefabs: [], pools: ["bipeds"], textures: [] }] } };
    const quality = resolveQuality({ ...UNKNOWN_QUALITY_DEVICE, capabilities: { ...UNKNOWN_QUALITY_DEVICE.capabilities,
        instancing: true, rgba8JointTexture: true } });
    const owner = new AbortController(), fixture = new Fixture(catalog, new FakeNode() as unknown as Node, quality, owner.signal);
    const other = await resources.acquire([{ bundle: "resources", path: address.path, type: Prefab as unknown as AssetType }]);
    t.after(() => { owner.abort(); draw(); other.release(); });
    failAfter = 1; await fixture.setEnabled(true); await settle();
    fixture.pool!.step(0); await settle(); draw();
    assert.equal(fixture.status, "failed");
    assert.equal(fixture.pool === undefined, true, "failure must close the entire pool");
    assert.equal(fixture.entities.length, 0);
    assert.equal(templateRefs, 0); assert.ok(nodes.every(node => node.retired));
    assert.equal(prefabA.refs, 1); assert.equal(prefabB.refs, 0); assert.match(fixture.error, /remote dependency/);
    failAfter = Infinity; await fixture.setEnabled(true); await settle();
    for (let frame = 1; frame < 14; frame++) fixture.pool!.step(frame);
    assert.equal(fixture.entities.filter(unit => unit.state === "active").length, 50);
    owner.abort(); draw(); assert.equal(templateRefs, 0); assert.equal(prefabB.refs, 0);
    other.release(); assert.equal(prefabA.refs, 0); assert.ok(nodes.every(node => node.retired));
});
