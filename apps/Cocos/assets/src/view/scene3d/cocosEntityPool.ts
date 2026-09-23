import { Billboard, director, Director, instantiate, isValid, Material, MeshRenderer, Node, Prefab, SkinnedMeshRenderer } from "cc";
import type { AssetCatalogData } from "../../logic/scene3d/assetCatalog";
import { EntityPool } from "./EntityPool";
import type { EntityPoolEngine, EntityPoolOptions } from "./EntityPool";
import { assetLease } from "./cocosAssetLoader";
import { captureOwnedBillboard, OwnedRenderingRetirement } from "./ownedRendering";

/** Creator 3.8.8: instantiate preserves shared mesh/material identity. Never use getMaterialInstance.
 * One material per source + instancing mode is shared across this pool's prefab templates.
 * Source Prefabs/materials are borrowed; only pool-owned copies and leases are retired.
 */
export function createCocosEntityPool(catalog: AssetCatalogData, parent: Node, options: EntityPoolOptions): EntityPool<Node> {
    const materials = new Map<Material, Map<boolean, { material: Material; users: number }>>();
    let pool: EntityPool<Node>;
    const engine: EntityPoolEngine<Node> = {
        subscribeFrames: (step) => {
            let frame = 0;
            const update = () => { if (!isValid(parent, true)) pool.close(); else step(++frame); };
            director.on(Director.EVENT_AFTER_UPDATE, update);
            return () => director.off(Director.EVENT_AFTER_UPDATE, update);
        },
        async load(address, instancing, signal) {
            const batch = await assetLease.acquire([{ ...address, type: Prefab }], { signal });
            const retirement = new OwnedRenderingRetirement();
            const borrowed = new Map<Material, Set<boolean>>();
            const billboards = new Map<Node, Map<Billboard, () => void>>();
            let released = false;
            const materialFor = (source: Material, enabled: boolean) => {
                let modes = materials.get(source);
                if (!modes) { modes = new Map(); materials.set(source, modes); }
                let shared = modes.get(enabled);
                if (!shared) {
                    const material = new Material();
                    try { material.copy(source, { defines: { USE_INSTANCING: enabled } }); }
                    catch (error) { material.destroy(); throw error; }
                    shared = { material, users: 0 }; modes.set(enabled, shared);
                }
                let used = borrowed.get(source);
                if (!used) { used = new Set(); borrowed.set(source, used); }
                if (!used.has(enabled)) { used.add(enabled); shared.users++; }
                return shared.material;
            };
            const hide = (node: Node) => { node.active = false; node.removeFromParent(); };
            const retire = (node: Node) => {
                const cleanup = billboards.get(node);
                billboards.delete(node);
                // Queue before retirement.finish can return the borrowed texture lease.
                if (cleanup?.size) director.once(Director.EVENT_AFTER_DRAW, () => { for (const release of cleanup.values()) release(); });
                retirement.capture(node);
                hide(node); node.destroy();
            };
            return {
                create() {
                    if (released) throw new Error("EntityPool template released");
                    const node = instantiate(batch.assets[0]);
                    node.active = false;
                    try {
                        const visit = (child: Node) => { child.layer = parent.layer; for (const c of child.children) visit(c); };
                        visit(node);
                        for (const renderer of node.getComponentsInChildren(MeshRenderer)) {
                            // SC4 owns baked-skinning compatibility. Never enable instancing on realtime skinning here.
                            const enabled = instancing && !(renderer instanceof SkinnedMeshRenderer);
                            renderer.sharedMaterials.forEach((source, slot) => {
                                if (source) renderer.setMaterial(materialFor(source, enabled), slot);
                            });
                        }
                        return node;
                    } catch (error) { retire(node); throw error; }
                },
                activate(node) {
                    if (!isValid(parent, true)) throw new Error("EntityPool parent destroyed");
                    parent.addChild(node); node.active = true;
                    // Billboard owns extra allocations outside Component.onDestroy in this locked engine.
                    let captured = billboards.get(node);
                    if (!captured) { captured = new Map(); billboards.set(node, captured); }
                    for (const billboard of node.getComponentsInChildren(Billboard)) {
                        if (billboard.enabledInHierarchy && !captured.has(billboard)) captured.set(billboard, captureOwnedBillboard(billboard));
                    }
                },
                deactivate: hide,
                retire,
                release() {
                    if (released) return;
                    released = true;
                    retirement.finish(() => {
                        for (const [source, modes] of borrowed) for (const mode of modes) {
                            const shared = materials.get(source)!.get(mode)!;
                            if (--shared.users === 0) {
                                shared.material.destroy(); materials.get(source)!.delete(mode);
                                if (!materials.get(source)!.size) materials.delete(source);
                            }
                        }
                        borrowed.clear(); batch.release();
                    });
                },
            };
        },
    };
    pool = new EntityPool(catalog, engine, options);
    return pool;
}
