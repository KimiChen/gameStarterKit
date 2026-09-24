import { director, Director, instantiate, isValid, Material, MeshRenderer, Node, Prefab, SkeletalAnimation, SkinnedMeshRenderer } from "cc";
import type { AnimationClip } from "cc";
import type { AssetCatalogData } from "../../logic/scene3d/assetCatalog";
import { AssetRetainer } from "./AssetLease";
import { assetLease } from "./cocosAssetLoader";
import { createCocosEntityPoolEngine } from "./cocosEntityPool";
import { OwnedRenderingRetirement } from "./ownedRendering";
import { SkinnedUnits } from "./SkinnedUnits";
import type { SkinnedUnitsOptions, SkinningMode } from "./SkinnedUnits";

interface Attribute { readonly name: string; readonly format: number; readonly isNormalized: boolean; readonly location: number; }
/** Locked Creator 3.8.8 read-only adapter. Keep engine-private layout inspection here. */
interface SkinModel {
    readonly type: number;
    readonly _jointsMedium?: { readonly texture: { readonly handle: { readonly texture: object } } | null };
    readonly subModels: readonly {
        readonly descriptorSet: { getTexture(binding: number): object | null };
        readonly instancedAttributeBlock: { readonly buffer: Uint8Array; readonly attributes: readonly Attribute[] };
    }[];
}
interface Binding { readonly renderer: MeshRenderer; readonly sources: readonly (Material | null)[]; }
interface SkinNode {
    readonly animation: SkeletalAnimation;
    readonly renderers: SkinnedMeshRenderer[];
    readonly bindings: Binding[];
    readonly realtimeStates: Set<AnimationClip>;
    readonly sockets: Map<string, Node>;
    request?: { clip: AnimationClip; mode: SkinningMode };
    active: boolean;
}
export interface CocosSkinnedUnitsOptions extends SkinnedUnitsOptions {
    /** Already loaded, compatible extra clips. Each live template retains them through AssetLease's reference boundary. */
    readonly clips?: readonly AnimationClip[];
}

/** Actual texture identity + mesh + SOURCE material + complete instanced attribute layout.
 * Creator's InstancedBuffer.merge does not compare joint textures; distinct parent Materials
 * isolate every pass (including planar shadows). Never mutate a source/MaterialInstance.
 */
export function createCocosSkinnedUnits(catalog: AssetCatalogData, parent: Node, options: CocosSkinnedUnitsOptions): SkinnedUnits<Node> {
    const groups = new Map<string, { material: Material; users: number }>();
    const ids = new WeakMap<object, number>();
    let nextId = 0;
    const identity = (object: object) => { let id = ids.get(object); if (id === undefined) { id = ++nextId; ids.set(object, id); } return id; };
    let units: SkinnedUnits<Node>;
    const billboardEngine = createCocosEntityPoolEngine(parent, () => units.close());
    units = new SkinnedUnits(catalog, {
        loadBillboard: (address, _instancing, signal) => billboardEngine.load(address, false, signal),
        subscribeFrames: (step) => {
            let frame = 0;
            const update = () => { if (!isValid(parent, true)) units.close(); else step(++frame); };
            director.on(Director.EVENT_AFTER_UPDATE, update);
            return () => director.off(Director.EVENT_AFTER_UPDATE, update);
        },
        async load(address, instancing, signal) {
            const batch = await assetLease.acquire([{ ...address, type: Prefab }], { signal });
            const retained: { release(): void }[] = [];
            try { for (const clip of new Set(options.clips ?? [])) retained.push(new AssetRetainer().retain(clip)); }
            catch (error) { for (const hold of retained) hold.release(); batch.release(); throw error; }
            const retirement = new OwnedRenderingRetirement(), nodes = new Map<Node, SkinNode>(), borrowed = new Set<string>();
            let released = false;
            const materialFor = (source: Material, mesh: object, enabled: boolean, texture: object | null, layout: string) => {
                const key = JSON.stringify([identity(mesh), identity(source), enabled, texture ? identity(texture) : null, layout]);
                let group = groups.get(key);
                if (!group) {
                    const material = new Material();
                    try { material.copy(source, { defines: { USE_INSTANCING: enabled } }); }
                    catch (error) { material.destroy(); throw error; }
                    group = { material, users: 0 }; groups.set(key, group);
                }
                if (!borrowed.has(key)) { borrowed.add(key); group.users++; }
                return group.material;
            };
            const setSafeMaterials = (state: SkinNode) => {
                for (const { renderer, sources } of state.bindings) sources.forEach((source, slot) => {
                    if (source) renderer.setMaterial(materialFor(source, renderer.mesh!, false, null, "direct"), slot);
                });
            };
            const regroup = (state: SkinNode) => {
                const baked = state.request!.mode === "baked";
                for (const { renderer, sources } of state.bindings) {
                    if (!(renderer instanceof SkinnedMeshRenderer) || !baked || !instancing) continue;
                    const model = (renderer as unknown as { model: SkinModel | null }).model;
                    const texture = model?._jointsMedium?.texture?.handle.texture;
                    if (!model || model.type !== 2 || !texture || !model.subModels.length) throw new Error("Creator baked skinning model/texture unavailable");
                    sources.forEach((source, slot) => {
                        if (!source) return;
                        // First enable instanced attributes on a private, texture-isolated probe material.
                        // Its Pass is never shared with the final batch, so initialization cannot reset a live batch.
                        renderer.setMaterial(materialFor(source, renderer.mesh!, true, texture, "probe"), slot);
                        const subModel = model.subModels[slot], block = subModel?.instancedAttributeBlock;
                        if (!block?.buffer.length || !block.attributes.some((attr) => attr.name === "a_jointAnimInfo")
                            || subModel.descriptorSet.getTexture(7) !== texture) throw new Error("Creator joint texture/instance layout mismatch");
                        const layout = JSON.stringify([slot, block.buffer.length, block.attributes.map((attr) =>
                            [attr.name, attr.format, attr.isNormalized, attr.location])]);
                        renderer.setMaterial(materialFor(source, renderer.mesh!, true, texture, layout), slot);
                    });
                }
            };
            const apply = (node: Node, state: SkinNode) => {
                if (!state.request) throw new Error("SkinnedUnits activation requires play");
                const { animation } = state, { clip, mode } = state.request;
                const baked = mode === "baked";
                if (animation.useBakedAnimation !== baked) retirement.capture(node);
                animation.stop();
                // Safe before any model replacement, including inactive-node reuse from realtime.
                setSafeMaterials(state);
                animation.useBakedAnimation = baked;
                if (!baked && !state.realtimeStates.has(clip)) {
                    // 3.8.8 baked state's _doNotCreateEval survives setUseBaked(false).
                    // Recreate each state once AFTER selecting realtime; reuse the evaluator thereafter.
                    animation.addClip(clip); state.realtimeStates.add(clip);
                }
                animation.play(clip.name);
                if (!state.active || !isValid(node, true) || nodes.get(node) !== state) return;
                if (baked) for (const renderer of state.renderers) renderer.uploadAnimation(clip);
                regroup(state);
            };
            const hide = (node: Node) => {
                const state = nodes.get(node);
                if (state) { state.active = false; state.animation.stop(); }
                node.active = false; node.removeFromParent();
            };
            const retire = (node: Node) => {
                // 3.8.8 SkinnedMeshRenderer.setSharedMaterial creates a per-renderer MaterialInstance
                // in realtime mode; MeshRenderer.onDestroy does not destroy that instance's passes.
                // Read without getMaterialInstance (which would allocate), and own only instances
                // whose owner AND parent identify this renderer and one of this pool's copies.
                const instances = new Set<Material>();
                for (const { renderer } of nodes.get(node)?.bindings ?? []) renderer.sharedMaterials.forEach((source, slot) => {
                    const actual = renderer.getRenderMaterial(slot) as (Material & { owner?: MeshRenderer; parent?: Material }) | null;
                    if (actual && actual !== source && actual.owner === renderer && actual.parent === source
                        && [...groups.values()].some((group) => group.material === source)) instances.add(actual);
                });
                if (instances.size) retirement.defer(() => { for (const material of instances) material.destroy(); });
                retirement.capture(node); hide(node); nodes.delete(node); node.destroy();
            };
            return {
                create() {
                    if (released) throw new Error("SkinnedUnits template released");
                    const node = instantiate(batch.assets[0]); node.active = false;
                    try {
                        const animations = node.getComponentsInChildren(SkeletalAnimation), renderers = node.getComponentsInChildren(SkinnedMeshRenderer);
                        if (animations.length !== 1 || !renderers.length) throw new Error("SkinnedUnits requires one SkeletalAnimation and skinned renderers");
                        const animation = animations[0]!;
                        if (renderers.some((renderer) => !renderer.mesh || !renderer.skeleton || renderer.skinningRoot !== animation.node)) {
                            throw new Error("SkinnedUnits renderers must share their animation root and have mesh/skeleton");
                        }
                        const bindings = node.getComponentsInChildren(MeshRenderer).map((renderer) => ({ renderer, sources: renderer.sharedMaterials.slice() }));
                        if (bindings.some((binding) => !binding.renderer.mesh || !binding.sources.length || binding.sources.some((source) => !source))) {
                            throw new Error("SkinnedUnits requires explicit source materials");
                        }
                        const state: SkinNode = { animation, renderers, bindings, realtimeStates: new Set(), sockets: new Map(), active: false };
                        nodes.set(node, state);
                        const visit = (child: Node) => { child.layer = parent.layer; for (const c of child.children) visit(c); }; visit(node);
                        setSafeMaterials(state); animation.playOnLoad = false;
                        // Select before onLoad: a device without vertex texture sampling must never initialize a baked state.
                        animation.useBakedAnimation = options.quality.jointTexture !== "unavailable"
                            && units.policy.mode === "baked";
                        // Set clips before onLoad creates/initializes states; only this instance is changed.
                        const clips = animation.clips.filter((clip): clip is AnimationClip => clip !== null);
                        for (const clip of options.clips ?? []) {
                            const existing = clips.find((item) => item.name === clip.name);
                            if (existing && existing !== clip) throw new Error(`Conflicting animation clip: ${clip.name}`);
                            if (!existing) clips.push(clip);
                        }
                        if (new Set(clips.map((clip) => clip.name)).size !== clips.length) throw new Error("Duplicate animation clip names");
                        animation.clips = clips;
                        return node;
                    } catch (error) { retire(node); throw error; }
                },
                play(node, name, mode) {
                    const state = nodes.get(node)!;
                    const clip = state.animation.clips.find((candidate) => candidate?.name === name);
                    if (!clip) throw new Error(`Unknown animation clip: ${name}`);
                    const previous = state.request;
                    state.request = { clip, mode };
                    if (state.active) {
                        try { apply(node, state); }
                        catch (error) {
                            state.request = previous;
                            try { apply(node, state); } catch { hide(node); }
                            throw error;
                        }
                    }
                },
                activate(node) {
                    if (!isValid(parent, true)) throw new Error("SkinnedUnits parent destroyed");
                    const state = nodes.get(node)!;
                    parent.addChild(node); node.active = true;
                    // A prefab component can close/despawn its owner from onEnable.
                    if (!node.active || !isValid(node, true) || nodes.get(node) !== state) return;
                    state.active = true; apply(node, state);
                },
                socket(node, path) {
                    const state = nodes.get(node)!;
                    let socket = state.sockets.get(path);
                    if (!socket) {
                        if (!state.animation.node.getChildByPath(path)) throw new Error(`Unknown socket joint: ${path}`);
                        socket = state.animation.createSocket(path) ?? undefined;
                        if (!socket) throw new Error(`Cannot create socket: ${path}`);
                        // createSocket does not register late realtime sockets with AnimationManager in 3.8.8.
                        state.animation.sockets = state.animation.sockets.slice();
                        socket.layer = parent.layer; state.sockets.set(path, socket);
                    }
                    return socket;
                },
                deactivate: hide, retire,
                release() {
                    if (released) return; released = true;
                    retirement.finish(() => {
                        for (const key of borrowed) { const group = groups.get(key)!; if (--group.users === 0) { group.material.destroy(); groups.delete(key); } }
                        borrowed.clear(); for (const hold of retained) hold.release(); batch.release();
                    });
                },
            };
        },
    }, options);
    return units;
}
