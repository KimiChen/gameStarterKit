/**
 * 城址件渲染：一个批、一张城址图集。
 *
 * ★ 城是**建筑层**（原版 `MAP_ZORDER.BUILD_TOP = 3900`，MAPORIGINAL-2D §2）——
 *   在资源件（RES 3400）之上、在旗标之下。
 * ⚠ 图集按 0.4× 缩存：件的世界尺寸走 `native`，**⛔ 不是图集里的像素**。
 * ⚠ 一座大城 245 个 sprite ⇒ **必须有一屏上限**，⛔ 别无限展开。
 */
import { Material, Node } from "cc";
import { mapoCitiesIn, mapoHasCities } from "../logic/mapoCities";
import { buildMapoSpriteMesh } from "../logic/mapoMesh";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique,
    uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

/** 一屏最多展开多少件。⚠ 洛阳一座就有 218 个，⛔ 必须有上限。 */
export const MAPO_CITY_MAX_SPRITES = 4_000;

/**
 * 视口外扩多少世界像素再挑城。
 * ⚠ 城的锚点在**底部中心**、件往上长 ⇒ 只按格心裁会让边上的城「整座消失」。
 * 取原版最大件的高度量级（约 1,500 原版 px ≈ 320 世界像素）。
 */
export const MAPO_CITY_MARGIN = 360;

export class MapoCityRenderer {
    private batch: MapoBatch | null = null;
    private material: Material | null = null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    /** @returns 真的建出来的件数。@param view 视口的世界包围盒。 */
    render(view: { left: number; right: number; bottom: number; top: number },
           enabled: boolean): number {
        if (this.disposed) return 0;
        const texture = this.art?.cityAtlas ?? null;
        if (!texture || !enabled || !mapoHasCities()) {
            this.clear();
            return 0;
        }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true);
            this.material.setProperty("mainTexture", texture);
        }
        const m = MAPO_CITY_MARGIN;
        const sprites = mapoCitiesIn(view.left - m, view.right + m, view.bottom - m,
                                     view.top + m, MAPO_CITY_MAX_SPRITES);
        if (sprites.length === 0) { this.clear(); return 0; }
        const geometry = buildMapoSpriteMesh(sprites);
        if (!this.batch) {
            this.batch = createMapoBatch(this.root, "mapo-city", geometry, this.material);
        } else {
            uploadMapoBatch(this.batch, geometry);
        }
        return sprites.length;
    }

    clear(): void {
        destroyMapoBatch(this.batch);
        this.batch = null;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.material?.destroy();
        this.material = null;
    }
}
