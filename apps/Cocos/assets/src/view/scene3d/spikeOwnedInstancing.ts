/** SC0 compatibility for the locked Creator 3.8.8 WebPipeline, not a framework pool API. */
import { director, MeshRenderer, Node } from "cc";

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
interface SpikePipeline { readonly _executor?: { readonly _context?: { readonly culling?: Culling } }; }

export interface SpikeInstancingCleanup {
    readonly releasedItems: number;
    readonly releasedBytes: number;
    /** Nonzero means the caller ran before the owner stopped rendering; call again after a draw. */
    readonly pendingItems: number;
}

function releaseOwnedItems(owned: Set<object>, capturedCulling: Culling | null): () => SpikeInstancingCleanup {
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
 * Capture BEFORE destroying/replacing this fixture's models; run the returned cleanup
 * AFTER_DRAW after the old models stop rendering, before releasing their materials/assets.
 * Capture again before each model replacement (for example baked -> realtime).
 *
 * Creator 3.8.8 custom/web-pipeline-types.ts caches independent InstancedBuffers in
 * RenderInstancingQueue. Their clear() retains the VB/IA, even after source meshes and
 * materials are destroyed. Remove only this owner's idle items, never source mesh buffers.
 * Do not call InstancedBuffer.destroy(): it also resets the engine-wide shared PassPool.
 * These private shapes are deliberately confined to this version-locked SC0 experiment.
 */
export function captureSpikeOwnedInstancing(world: Node): () => SpikeInstancingCleanup {
    const owned = new Set<object>();
    for (const component of world.getComponentsInChildren(MeshRenderer)) {
        const renderer = component as unknown as OwnedRenderer;
        for (const subModel of renderer.model?.subModels ?? []) {
            if (subModel.descriptorSet) owned.add(subModel.descriptorSet);
        }
    }
    if (owned.size === 0) return releaseOwnedItems(owned, null);
    const root = director.root as unknown as { readonly pipeline: SpikePipeline } | null;
    const culling = root?.pipeline?._executor?._context?.culling;
    if (!culling || !Array.isArray(culling.renderQueues)
        || !Number.isInteger(culling.numRenderQueues) || culling.numRenderQueues < 0
        || culling.numRenderQueues > culling.renderQueues.length
        || !Array.isArray(culling.cullingPools?.renderQueueRecycle?.data)) {
        throw new Error("SC0 owned instancing cleanup requires Creator 3.8.8 WebPipeline culling queues");
    }
    return releaseOwnedItems(owned, culling);
}
