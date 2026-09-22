import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

type LoaderModule = { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
class FakeMeshRenderer {
    model: { subModels: { descriptorSet: object }[] } | null;
    constructor(descriptorSet: object) { this.model = { subModels: [{ descriptorSet }] }; }
}
class FakeNode {
    constructor(readonly components: FakeMeshRenderer[]) {}
    getComponentsInChildren(Type: unknown): FakeMeshRenderer[] {
        assert.equal(Type, FakeMeshRenderer);
        return this.components;
    }
}
class FakeBuffer {
    destroys = 0;
    constructor(readonly size: number) {}
    destroy(): void { this.destroys++; assert.equal(this.destroys, 1, "owned GFX buffer must be destroyed once"); }
}
class FakeIA {
    destroys = 0;
    // InputAssembler references source mesh buffers but does not own their lifetime.
    constructor(readonly vertexBuffers: FakeBuffer[], readonly indexBuffer = new FakeBuffer(72)) {}
    destroy(): void { this.destroys++; assert.equal(this.destroys, 1); }
}
function item(descriptorSet: object, count = 0, bytes = 32768) {
    const vb = new FakeBuffer(bytes);
    return { descriptorSet, count, vb, ia: new FakeIA([new FakeBuffer(1344), vb]) };
}
type FakeItem = ReturnType<typeof item>;
function queue(opaque: FakeItem[] = [], transparent: FakeItem[] = []) {
    const buffer = (instances: FakeItem[]) => ({
        instances, hasPendingModels: instances.some((entry) => entry.count > 0),
        destroy(): never { throw new Error("must never reset the engine-wide PassPool"); },
    });
    return {
        opaqueInstancingQueue: { instanceBuffers: [buffer(opaque)], passInstances: new Map() },
        transparentInstancingQueue: { instanceBuffers: [buffer(transparent)], passInstances: new Map() },
    };
}
let engineRoot: unknown = null;
function installQueues(active: ReturnType<typeof queue>[], cached = active) {
    const culling = {
        renderQueues: active, numRenderQueues: active.length, cullingPools: { renderQueueRecycle: { data: cached } },
    };
    engineRoot = { pipeline: { _executor: { _context: { culling } } } };
    return culling;
}
const moduleApi = createRequire(import.meta.url)("node:module") as LoaderModule;
const originalLoad = moduleApi._load;
let capture!: (node: FakeNode) => { (): { releasedItems: number; releasedBytes: number; pendingItems: number } };
try {
    moduleApi._load = (request, parent, isMain) => request === "cc"
        ? { MeshRenderer: FakeMeshRenderer, Node: FakeNode, director: { get root() { return engineRoot; } } }
        : originalLoad(request, parent, isMain);
    capture = createRequire(import.meta.url)("../src/view/scene3d/spikeOwnedInstancing").captureSpikeOwnedInstancing;
} finally { moduleApi._load = originalLoad; }

test("SC0 releases only its exact idle queue items, including cached transparent queues", () => {
    const owned = {}, foreign = {};
    const ours = item(owned), theirs = item(foreign), alternate = item(owned, 0, 2560);
    const active = queue([ours, theirs]);
    const cached = queue([], [alternate]);
    installQueues([active], [active, cached]);
    const renderer = new FakeMeshRenderer(owned);
    const cleanup = capture(new FakeNode([renderer]));
    renderer.model = null; // Models may already be destroyed when AFTER_DRAW fires.
    assert.deepEqual(cleanup(), { releasedItems: 2, releasedBytes: 35328, pendingItems: 0 });
    assert.deepEqual(active.opaqueInstancingQueue.instanceBuffers[0]!.instances, [theirs]);
    assert.deepEqual(cached.transparentInstancingQueue.instanceBuffers[0]!.instances, []);
    assert.equal(ours.vb.destroys, 1);
    assert.equal(ours.ia.destroys, 1);
    assert.equal(ours.ia.vertexBuffers[0]!.destroys, 0);
    assert.equal(ours.ia.indexBuffer.destroys, 0);
    assert.equal(theirs.vb.destroys, 0);
    assert.deepEqual(cleanup(), { releasedItems: 0, releasedBytes: 0, pendingItems: 0 });
});

test("SC0 rechecks ownership at cleanup and leaves a foreign owner's reused item intact", () => {
    const owned = {}, foreign = {};
    const reused = item(owned);
    const active = queue([reused]);
    installQueues([active]);
    const cleanup = capture(new FakeNode([new FakeMeshRenderer(owned)]));
    reused.descriptorSet = foreign;
    reused.count = 1;
    assert.deepEqual(cleanup(), { releasedItems: 0, releasedBytes: 0, pendingItems: 0 });
    assert.equal(reused.vb.destroys, 0);
    assert.equal(active.opaqueInstancingQueue.instanceBuffers[0]!.instances[0], reused);
});

test("SC0 refuses active items and permits retry after the engine clears their count", () => {
    const owned = {};
    const busy = item(owned, 500);
    installQueues([queue([busy])]);
    const cleanup = capture(new FakeNode([new FakeMeshRenderer(owned)]));
    assert.deepEqual(cleanup(), { releasedItems: 0, releasedBytes: 0, pendingItems: 1 });
    assert.equal(busy.vb.destroys, 0);
    busy.count = 0;
    assert.deepEqual(cleanup(), { releasedItems: 1, releasedBytes: 32768, pendingItems: 0 });
});

test("SC0 releases a removed camera's cached queue despite its stale nonzero counts", () => {
    const owned = {}, foreign = {};
    const visible = item(foreign, 1), ours = item(owned, 500), cachedForeign = item(foreign, 3);
    const currentCamera = queue([visible]);
    const removedCamera = queue([ours], [cachedForeign]);
    const culling = installQueues([currentCamera, removedCamera], [currentCamera, removedCamera]);
    const cleanup = capture(new FakeNode([new FakeMeshRenderer(owned)]));
    assert.deepEqual(cleanup(), { releasedItems: 0, releasedBytes: 0, pendingItems: 1 });

    // Next AFTER_DRAW: closing the camera reduced the active queues. Creator
    // did not take the removed queue from the pool again, so update() never ran.
    culling.renderQueues.splice(1);
    culling.numRenderQueues = 1;
    assert.equal(ours.count, 500);
    assert.deepEqual(cleanup(), { releasedItems: 1, releasedBytes: 32768, pendingItems: 0 });
    assert.equal(ours.vb.destroys, 1);
    assert.equal(ours.ia.destroys, 1);
    assert.equal(ours.ia.vertexBuffers[0]!.destroys, 0);
    assert.equal(visible.vb.destroys, 0);
    assert.equal(cachedForeign.vb.destroys, 0, "cached foreign descriptors are never released");
    assert.deepEqual(removedCamera.opaqueInstancingQueue.instanceBuffers[0]!.instances, []);
    assert.deepEqual(removedCamera.transparentInstancingQueue.instanceBuffers[0]!.instances, [cachedForeign]);
    assert.deepEqual(cleanup(), { releasedItems: 0, releasedBytes: 0, pendingItems: 0 });
});

test("SC0 uses numRenderQueues rather than retained renderQueues array capacity", () => {
    const owned = {};
    const retired = item(owned, 100);
    const culling = installQueues([queue(), queue([retired])]);
    const cleanup = capture(new FakeNode([new FakeMeshRenderer(owned)]));
    culling.numRenderQueues = 1;
    assert.deepEqual(cleanup(), { releasedItems: 1, releasedBytes: 32768, pendingItems: 0 });
    assert.equal(retired.vb.destroys, 1);
});

test("SC0 snapshots old model ownership before replacement and preserves the new model", () => {
    const previous = {}, current = {};
    const oldItem = item(previous), newItem = item(current, 1);
    const active = queue([oldItem, newItem]);
    installQueues([active]);
    const renderer = new FakeMeshRenderer(previous);
    const cleanup = capture(new FakeNode([renderer]));
    renderer.model = { subModels: [{ descriptorSet: current }] };
    assert.deepEqual(cleanup(), { releasedItems: 1, releasedBytes: 32768, pendingItems: 0 });
    assert.equal(newItem.vb.destroys, 0);
    assert.deepEqual(active.opaqueInstancingQueue.instanceBuffers[0]!.instances, [newItem]);
});

test("SC0 repeated 20 owners release their two buffers without clearing shared queues", () => {
    const foreign = item({}, 1);
    const active = queue([foreign]);
    installQueues([active]);
    for (let cycle = 0; cycle < 20; cycle++) {
        const owned = {};
        active.opaqueInstancingQueue.instanceBuffers[0]!.instances.push(item(owned), item(owned, 0, 10240));
        const cleanup = capture(new FakeNode([new FakeMeshRenderer(owned)]));
        assert.deepEqual(cleanup(), { releasedItems: 2, releasedBytes: 43008, pendingItems: 0 });
        assert.deepEqual(active.opaqueInstancingQueue.instanceBuffers[0]!.instances, [foreign]);
    }
    assert.equal(foreign.vb.destroys, 0);
});

test("SC0 unloaded owners need no pipeline; loaded owners reject an unsupported pipeline", () => {
    engineRoot = null;
    assert.deepEqual(capture(new FakeNode([]))(), { releasedItems: 0, releasedBytes: 0, pendingItems: 0 });
    assert.throws(() => capture(new FakeNode([new FakeMeshRenderer({})])), /Creator 3.8.8 WebPipeline/);
    const culling = installQueues([queue()]);
    culling.numRenderQueues = 2;
    assert.throws(() => capture(new FakeNode([new FakeMeshRenderer({})])), /Creator 3.8.8 WebPipeline/);
});
