/** Framework-internal retirement for the locked Creator 3.8.8 WebPipeline. */
import { director, Director, MeshRenderer, Node } from "cc";
import type { Billboard } from "cc";

/** Creator 3.8.8 Billboard.onDisable only detaches its model and has no
 * onDestroy. Capture its exclusively owned allocations while alive; retire
 * after node destruction/AFTER_DRAW, never its borrowed texture.
 */
export function captureOwnedBillboard(billboard: Billboard): () => void {
    const owned = billboard as unknown as {
        readonly _model: object;
        readonly _mesh: { destroy(): void };
        readonly _material: { destroy(): void };
    };
    const model = owned._model, mesh = owned._mesh, material = owned._material;
    const root = director.root as unknown as { destroyModel(model: object): void } | null;
    if (!root || !model || !mesh || !material) throw new Error("Stage3D requires an initialized Creator 3.8.8 Billboard");
    let released = false;
    return () => {
        if (released) return;
        released = true;
        root.destroyModel(model);
        mesh.destroy();
        material.destroy();
    };
}

interface OwnedRenderer {
    readonly model: { readonly subModels: readonly { readonly descriptorSet: object | null }[] } | null;
}
interface InstancedItem {
    readonly descriptorSet: object;
    readonly count: number;
    readonly vb: { readonly size: number; destroy(): void };
    readonly ia: { destroy(): void };
}
interface InstancingQueue { readonly instanceBuffers: readonly { readonly instances: InstancedItem[] }[]; }
interface RenderQueue {
    readonly opaqueInstancingQueue: InstancingQueue;
    readonly transparentInstancingQueue: InstancingQueue;
}
interface Culling {
    readonly renderQueues: readonly RenderQueue[];
    readonly numRenderQueues: number;
    readonly cullingPools: { readonly renderQueueRecycle: { readonly data: readonly RenderQueue[] } };
}
interface OwnedPipeline { readonly _executor?: { readonly _context?: { readonly culling?: Culling } }; }

export interface OwnedInstancingCleanup {
    readonly releasedItems: number;
    readonly releasedBytes: number;
    /** Nonzero means the caller ran before the owner stopped rendering; call again after a draw. */
    readonly pendingItems: number;
}

function releaseOwnedItems(owned: Set<object>, capturedCulling: Culling | null): () => OwnedInstancingCleanup {
    let culling = capturedCulling;
    return () => {
        let releasedItems = 0;
        let releasedBytes = 0;
        let pendingItems = 0;
        if (!culling || owned.size === 0) return { releasedItems, releasedBytes, pendingItems };
        // SceneCulling.clear resets only the pool length. A removed camera's
        // cached queue keeps its old count until that queue is reused/update()d.
        // At AFTER_DRAW, only this frame's active queues can still own draws.
        const activeQueues = new Set(culling.renderQueues.slice(0, culling.numRenderQueues));
        const queues = new Set([...culling.renderQueues, ...culling.cullingPools.renderQueueRecycle.data]);
        const visited = new Set<InstancedItem>();
        for (const queue of queues) {
            for (const group of [queue.opaqueInstancingQueue, queue.transparentInstancingQueue]) {
                for (const buffer of group.instanceBuffers) {
                    for (let index = buffer.instances.length - 1; index >= 0; index--) {
                        const item = buffer.instances[index]!;
                        // merge updates descriptorSet on reuse. Recheck its current identity;
                        // a different owner may now occupy the previously observed cache slot.
                        if (!owned.has(item.descriptorSet)) continue;
                        if (activeQueues.has(queue) && item.count !== 0) { pendingItems++; continue; }
                        if (!visited.has(item)) {
                            visited.add(item);
                            releasedBytes += item.vb.size;
                            item.vb.destroy();
                            item.ia.destroy();
                            releasedItems++;
                        }
                        buffer.instances.splice(index, 1);
                    }
                }
            }
        }
        if (pendingItems === 0) { owned.clear(); culling = null; }
        return { releasedItems, releasedBytes, pendingItems };
    };
}

/**
 * Capture BEFORE destroying/replacing this owner's models; run the returned cleanup
 * AFTER_DRAW after the old models stop rendering, before releasing their materials/assets.
 * Capture again before each model replacement (for example baked -> realtime).
 *
 * Creator 3.8.8 custom/web-pipeline-types.ts caches independent InstancedBuffers in
 * RenderInstancingQueue. Their clear() retains the VB/IA, even after source meshes and
 * materials are destroyed. Remove only this owner's idle items, never source mesh buffers.
 * Do not call InstancedBuffer.destroy(): it also resets the engine-wide shared PassPool.
 * These private shapes are deliberately confined to this version-locked engine adapter.
 */
export function captureOwnedInstancing(world: Node): () => OwnedInstancingCleanup {
    const owned = new Set<object>();
    for (const component of world.getComponentsInChildren(MeshRenderer)) {
        const renderer = component as unknown as OwnedRenderer;
        for (const subModel of renderer.model?.subModels ?? []) {
            if (subModel.descriptorSet) owned.add(subModel.descriptorSet);
        }
    }
    if (owned.size === 0) return releaseOwnedItems(owned, null);
    const root = director.root as unknown as { readonly pipeline: OwnedPipeline } | null;
    const culling = root?.pipeline?._executor?._context?.culling;
    if (!culling || !Array.isArray(culling.renderQueues)
        || !Number.isInteger(culling.numRenderQueues) || culling.numRenderQueues < 0
        || culling.numRenderQueues > culling.renderQueues.length
        || !Array.isArray(culling.cullingPools?.renderQueueRecycle?.data)) {
        throw new Error("Stage3D owned instancing cleanup requires Creator 3.8.8 WebPipeline culling queues");
    }
    return releaseOwnedItems(owned, culling);
}

/** One owner may replace several models before close. All old batches must retire
 * before any shared material or Prefab hold is returned. Never tied to owner.signal:
 * cancellation ends rendering, whereas AFTER_DRAW ends renderer references.
 */
export class OwnedRenderingRetirement {
    private readonly pending = new Set<() => OwnedInstancingCleanup>();
    private readonly cleanup = new Set<() => void>();
    private scheduled = false;
    private finished = false;
    private done: (() => void) | undefined;

    capture(root: Node): void {
        if (this.finished) throw new Error("Rendering retirement already finished");
        this.pending.add(captureOwnedInstancing(root));
        this.schedule();
    }

    /** Renderer-owned allocations retire before the template's shared materials/assets,
     * even when a model switch already scheduled this same frame's callback.
     */
    defer(cleanup: () => void): void {
        if (this.finished) throw new Error("Rendering retirement already finished");
        this.cleanup.add(cleanup); this.schedule();
    }

    finish(done: () => void): void {
        if (this.finished || this.done) return;
        this.done = done;
        // Even an empty/no-instancing tree is destroyed at the frame boundary.
        this.schedule();
    }

    private schedule(): void {
        if (this.scheduled) return;
        this.scheduled = true;
        director.once(Director.EVENT_AFTER_DRAW, () => {
            this.scheduled = false;
            for (const release of this.pending) {
                if (release().pendingItems === 0) this.pending.delete(release);
            }
            if (this.pending.size) { this.schedule(); return; }
            for (const cleanup of [...this.cleanup]) { this.cleanup.delete(cleanup); cleanup(); }
            if (this.done) {
                const done = this.done;
                this.done = undefined;
                this.finished = true;
                done();
            }
        });
    }
}
