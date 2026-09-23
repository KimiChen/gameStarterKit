import { director, Director, instantiate, isValid, Material, Node, ParticleSystem, Prefab } from "cc";
import type { AssetCatalogData } from "../../logic/scene3d/assetCatalog";
import type { EntityPoolOptions } from "./EntityPool";
import { assetLease } from "./cocosAssetLoader";
import { Vfx } from "./Vfx";

/** Creator 3.8.8 ParticleSystem prefab adapter. Never changes source materials or capacity. */
export function createCocosVfx(catalog: AssetCatalogData, parent: Node, options: EntityPoolOptions): Vfx<Node> {
    let vfx: Vfx<Node>;
    vfx = new Vfx(catalog, {
        subscribeFrames(step) {
            let frame = 0;
            const update = () => { if (!isValid(parent, true)) vfx.close(); else step(++frame, performance.now()); };
            director.on(Director.EVENT_AFTER_UPDATE, update);
            return () => director.off(Director.EVENT_AFTER_UPDATE, update);
        },
        place(node, position) {
            if (!isValid(parent, true)) throw new Error("Vfx parent destroyed");
            if (node.parent !== parent) parent.addChild(node);
            node.setWorldPosition(position.x, position.y, position.z);
        },
        async load(address, _instancing, signal) {
            const batch = await assetLease.acquire([{ ...address, type: Prefab }], { signal });
            const fallbackMaterials = new Set<Material>();
            let released = false;
            const hide = (node: Node) => {
                // clear() only clears the processor while enabledInHierarchy in 3.8.8.
                for (const particle of node.getComponentsInChildren(ParticleSystem)) if (particle.enabledInHierarchy) {
                    particle.stop(); particle.clear();
                }
                node.active = false; node.removeFromParent();
            };
            return {
                create() {
                    if (released) throw new Error("Vfx template released");
                    const node = instantiate(batch.assets[0]); node.active = false;
                    try {
                        const particles = node.getComponentsInChildren(ParticleSystem);
                        if (!particles.length) throw new Error("Vfx prefab requires a ParticleSystem");
                        const visit = (child: Node) => { child.layer = parent.layer; for (const c of child.children) visit(c); }; visit(node);
                        for (const particle of particles) particle.playOnAwake = false;
                        return node;
                    } catch (error) { node.destroy(); throw error; }
                },
                activate(node) {
                    if (!isValid(parent, true)) throw new Error("Vfx parent destroyed");
                    try {
                        node.active = true;
                        if (!node.activeInHierarchy || released) return; // component onEnable may close the lease.
                        for (const particle of node.getComponentsInChildren(ParticleSystem)) if (particle.enabledInHierarchy) {
                            particle.stop(); particle.clear(); particle.play();
                        }
                    } finally {
                        // Processor-owned fallback is omitted by ParticleSystem.onDestroy in this locked engine.
                        // Retain identities even when an onEnable callback synchronously closes the pool.
                        for (const particle of node.getComponentsInChildren(ParticleSystem)) {
                            const material = particle.processor?.getDefaultMaterial();
                            if (material) fallbackMaterials.add(material);
                        }
                    }
                },
                deactivate: hide,
                retire(node) { hide(node); node.destroy(); },
                release() {
                    if (released) return; released = true;
                    director.once(Director.EVENT_AFTER_DRAW, () => {
                        for (const material of fallbackMaterials) material.destroy();
                        fallbackMaterials.clear(); batch.release();
                    });
                },
            };
        },
    }, options);
    return vfx;
}
