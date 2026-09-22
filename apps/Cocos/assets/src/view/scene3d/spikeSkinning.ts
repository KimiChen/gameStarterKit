/** SC0 fixed greybox experiment only. This is not the SC4 SkinnedUnits API. */
import { director, Node, SkeletalAnimation, SkinnedMeshRenderer } from "cc";
import type { AnimationClip, Material, Prefab, Skeleton } from "cc";

type ClipPair = readonly [AnimationClip, AnimationClip];
type ClipSummary = readonly { readonly name: string; readonly hash: number }[];

export interface SpikeSkinningPlan {
    readonly mainClips: ClipPair;
    readonly atlasBClips: ClipPair;
    /** Asset-free diagnostics; actual GPU texture identities must still be inspected in Creator. */
    readonly summary: {
        readonly key: string;
        readonly registeredNow: boolean;
        readonly textureLength: number;
        readonly skeletonHash: number;
        readonly mainClips: ClipSummary;
        readonly atlasBClips: ClipSummary;
        readonly layoutCount: number;
        /** Creator routes a shared skeleton's default pose to the last registered layout. */
        readonly defaultPoseLayout: number;
    };
}

// Store hashes only, never Prefabs/clips. Reloading the same assets across 20 opens must
// reuse the pool's two custom chunks; a new engine pool receives its own registration.
const registrations = new WeakMap<object, Map<string, "ready" | "failed">>();
// Custom createChunk bypasses the engine's default ceil(length / 12) * 12.
// The shader reads each joint's 3 float / 12 byte pixels within one row, so
// both the float width and Creator's doubled RGBA8 width must preserve rows.
const TEXTURE_LENGTH = 72;

function skeletonOf(node: Node): Skeleton {
    const renderers = node.getComponentsInChildren(SkinnedMeshRenderer);
    const skeleton = renderers[0]?.skeleton;
    if (!skeleton || renderers.some((renderer) => renderer.skeleton?.hash !== skeleton.hash)) {
        throw new Error("SC0 biped must have one shared skeleton");
    }
    return skeleton;
}

function animationOf(node: Node): SkeletalAnimation {
    const animations = node.getComponentsInChildren(SkeletalAnimation);
    if (animations.length !== 1) throw new Error("SC0 biped must have exactly one SkeletalAnimation");
    return animations[0]!;
}

function clipsOf(node: Node): ClipPair {
    const clips = animationOf(node).clips.filter((clip): clip is AnimationClip => clip !== null);
    if (clips.length !== 2) throw new Error("SC0 biped must import exactly two animation clips");
    return [clips[0]!, clips[1]!];
}

/**
 * Call after both resource loads and BEFORE the first instantiate of either Prefab.
 * Creator 3.8.8 skeletal-animation-utils.ts: registerCustomTextureLayouts appends
 * chunks and indexes skeleton ^ clip.hash; it does not migrate already baked handles.
 * 72 is the RGBA32F length; Creator doubles it to 144 for RGBA8 on WebGL1.
 * Both widths align complete joint records; a power-of-two width can split them.
 */
export function prepareSpikeSkinningLayouts(main: Prefab, atlasB: Prefab): SpikeSkinningPlan {
    const mainNode: Node = main.data;
    const alternateNode: Node = atlasB.data;
    if (!mainNode || !alternateNode) throw new Error("SC0 skinning requires loaded Prefab.data");
    const skeleton = skeletonOf(mainNode);
    const alternateSkeleton = skeletonOf(alternateNode);
    if (skeleton.hash !== alternateSkeleton.hash
        || JSON.stringify(skeleton.joints) !== JSON.stringify(alternateSkeleton.joints)) {
        throw new Error("SC0 alternate clips must target the main biped skeleton and joint paths");
    }
    const mainClips = clipsOf(mainNode);
    const atlasBClips = clipsOf(alternateNode);
    const allClips = [...mainClips, ...atlasBClips];
    const hashes = allClips.map((clip) => clip.hash);
    if (hashes.some((hash) => !Number.isInteger(hash) || hash === 0)
        || new Set(hashes.map((hash) => hash | 0)).size !== 4) {
        throw new Error("SC0 needs four distinct nonzero clip hashes for two texture layouts");
    }
    if (new Set(allClips.map((clip) => clip.name)).size !== 4) {
        throw new Error("SC0 main and alternate clip names must be distinct");
    }
    const pool = director.root?.dataPoolManager.jointTexturePool;
    if (!pool) throw new Error("SC0 skinning requires a live joint texture pool");
    const key = JSON.stringify([
        TEXTURE_LENGTH, skeleton.hash,
        mainClips.map((clip) => clip.hash).sort((a, b) => a - b),
        atlasBClips.map((clip) => clip.hash).sort((a, b) => a - b),
    ]);
    let keys = registrations.get(pool);
    if (!keys) { keys = new Map(); registrations.set(pool, keys); }
    const previous = keys.get(key);
    if (previous === "failed") throw new Error("SC0 layout registration failed previously; restart the engine pool");
    const registeredNow = previous !== "ready";
    if (registeredNow) {
        // A partial engine failure can already allocate a chunk. Do not silently retry
        // into the same pool or call clear(), which would disturb unrelated renderers.
        keys.set(key, "failed");
        pool.registerCustomTextureLayouts([
            { textureLength: TEXTURE_LENGTH, contents: [{ skeleton: skeleton.hash, clips: mainClips.map((clip) => clip.hash) }] },
            { textureLength: TEXTURE_LENGTH, contents: [{ skeleton: skeleton.hash, clips: atlasBClips.map((clip) => clip.hash) }] },
        ]);
        keys.set(key, "ready");
    }
    return {
        mainClips, atlasBClips,
        summary: {
            key, registeredNow, textureLength: TEXTURE_LENGTH, skeletonHash: skeleton.hash,
            mainClips: mainClips.map((clip) => ({ name: clip.name, hash: clip.hash })),
            atlasBClips: atlasBClips.map((clip) => ({ name: clip.name, hash: clip.hash })),
            layoutCount: 2, defaultPoseLayout: 1,
        },
    };
}

/** Attach alternate clips to an instance of the MAIN prefab, without changing the source Prefab. */
export function attachSpikeSkinningClips(node: Node, plan: SpikeSkinningPlan): SkeletalAnimation {
    if (skeletonOf(node).hash !== plan.summary.skeletonHash) {
        throw new Error("SC0 texture switch must use the configured main skeleton");
    }
    const animation = animationOf(node);
    if (!plan.mainClips.every((clip) => animation.clips.some((existing) => existing?.hash === clip.hash))) {
        throw new Error("SC0 texture switch must use an instance of the main biped");
    }
    animation.useBakedAnimation = true;
    for (const clip of plan.atlasBClips) {
        const existing = animation.clips.find((candidate) => candidate?.name === clip.name);
        if (existing && existing.hash !== clip.hash) throw new Error("SC0 alternate clip name conflicts with an existing clip");
        if (!existing) animation.addClip(clip);
    }
    return animation;
}

export type SpikeSkinningSwitch = (group: "main" | "atlasB", index: 0 | 1) => void;
export type SpikeRealtimeSwitch = (enabled: boolean) => void;

/** One controlled SC0 instance; runtime quality/fallback policy remains SC4. */
export function createSpikeRealtimeSwitcher(
    node: Node, plan: SpikeSkinningPlan, cloneMaterial: (source: Material) => Material,
    beforeModelSwap: () => void,
): SpikeRealtimeSwitch {
    const animation = animationOf(node);
    if (!animation.useBakedAnimation || skeletonOf(node).hash !== plan.summary.skeletonHash) {
        throw new Error("SC0 realtime sample must start from the configured baked biped");
    }
    const realtimeClip = animation.clips.find((clip): clip is AnimationClip => clip !== null
        && clip.hash === plan.mainClips[0].hash && clip.name === plan.mainClips[0].name);
    if (!realtimeClip) throw new Error("SC0 realtime sample requires its existing main animation clip");
    const clones = new Map<Material, Material>();
    const bindings: { renderer: SkinnedMeshRenderer; index: number; baked: Material; realtime: Material }[] = [];
    for (const renderer of node.getComponentsInChildren(SkinnedMeshRenderer)) {
        renderer.sharedMaterials.forEach((source, index) => {
            if (!source) throw new Error("SC0 realtime sample requires assigned materials");
            let material = clones.get(source);
            if (!material) {
                material = cloneMaterial(source);
                if (material === source) throw new Error("SC0 realtime sample requires an independent non-instanced parent Material");
                clones.set(source, material);
            }
            bindings.push({ renderer, index, baked: source, realtime: material });
        });
    }
    if (!bindings.length) throw new Error("SC0 realtime sample has no material bindings");
    let realtimeStateInitialized = false;
    return (enabled) => {
        if (typeof enabled !== "boolean" || !node.isValid) throw new Error("Invalid or expired SC0 realtime switch");
        beforeModelSwap();
        animation.stop();
        if (enabled) {
            // SkinningModel only warns about instancing; it does not disable it.
            // The replacement model must therefore receive safe materials first.
            for (const binding of bindings) binding.renderer.setMaterial(binding.realtime, binding.index);
            animation.useBakedAnimation = false;
            if (!realtimeStateInitialized) {
                // Creator 3.8.8 setUseBaked(false) leaves a previously baked state's
                // _doNotCreateEval=true. Recreate this one state through the public
                // API after changing mode, so initialize() creates a real curve
                // evaluator. addClip deduplicates the existing clip, replaces its
                // old evaluator-free state, and preserves the source Prefab/clip.
                // Reuse it thereafter; repeatedly replacing live PoseOutputs would
                // unnecessarily retain animation bindings in this engine version.
                animation.addClip(realtimeClip);
                realtimeStateInitialized = true;
            }
        } else {
            // Rebuild the baked model while the safe non-instanced material is still
            // attached; only then restore the shared baked Pass before playing.
            animation.useBakedAnimation = true;
            for (const binding of bindings) binding.renderer.setMaterial(binding.baked, binding.index);
        }
        animation.play(plan.mainClips[0].name);
    };
}

/**
 * Bind AFTER the main instance has received its shared instancing materials.
 * Creator 3.8.8 WebPipeline groups instances by Pass, but InstancedBuffer.merge
 * does not compare their joint textures. The fixed second atlas therefore needs
 * its own parent Material/Pass group, even though mesh and material properties match.
 *
 * cloneMaterial must return an owner-retained `new Material()`, initialized via
 * `material.copy(source, { defines: { USE_INSTANCING: true } })`. The caller releases all clones after
 * node destruction and clears its switch callback on close. No globals retain this
 * callback, nodes, or materials; repeated clip switches allocate nothing here.
 */
export function createSpikeSkinningSwitcher(
    node: Node, plan: SpikeSkinningPlan, cloneMaterial: (source: Material) => Material,
): SpikeSkinningSwitch {
    const animation = attachSpikeSkinningClips(node, plan);
    const bindings: { renderer: SkinnedMeshRenderer; index: number; main: Material; atlasB: Material }[] = [];
    const originals = new Set<Material>();
    for (const renderer of node.getComponentsInChildren(SkinnedMeshRenderer)) {
        for (const material of renderer.sharedMaterials) {
            if (!material) throw new Error("SC0 cross-atlas renderer requires assigned shared materials");
            originals.add(material);
        }
    }
    if (originals.size === 0) throw new Error("SC0 cross-atlas renderer has no material slots");
    const clones = new Map<Material, Material>();
    for (const source of originals) {
        const clone = cloneMaterial(source);
        if (originals.has(clone)) throw new Error("SC0 atlas B requires an independent parent Material");
        clones.set(source, clone);
    }
    for (const renderer of node.getComponentsInChildren(SkinnedMeshRenderer)) {
        renderer.sharedMaterials.forEach((material, index) => {
            const main = material!;
            bindings.push({ renderer, index, main, atlasB: clones.get(main)! });
        });
    }
    return (group, index) => {
        if (!node.isValid) throw new Error("SC0 skinning switch called after node destruction");
        if ((group !== "main" && group !== "atlasB") || (index !== 0 && index !== 1)) {
            throw new Error("SC0 skinning switch only supports two fixed atlases with two clips each");
        }
        // Change Pass identity before the animation updates the bound joint texture.
        for (const binding of bindings) {
            binding.renderer.setMaterial(group === "main" ? binding.main : binding.atlasB, binding.index);
        }
        animation.play((group === "main" ? plan.mainClips : plan.atlasBClips)[index].name);
    };
}
