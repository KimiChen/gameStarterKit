/** 四档共用的静态地貌：L1 原件分块缓存，L2 地貌分块缓存，L3 单张同源概览。 */
import { Material, Node, RenderTexture } from "cc";
import { mapoPlateBounds } from "../logic/mapoFar";
import { buildMapoPlateMesh } from "../logic/mapoMesh";
import { mapoCacheTiles, MapoLodCache, type MapoCacheTile } from "../logic/mapoLodCache";
import { mapoDecorEnabledFor } from "../logic/mapoSettings";
import type { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";
import { createMapoBatch, createMapoMaterial, destroyMapoBatch, type MapoBatch } from "./MapoMeshBatch";
import { MapoChunkBaker } from "./MapoChunkBaker";
import type { MapoArtResources } from "./MapoArtResources";

interface TileEntry { texture: RenderTexture; material: Material; batch: MapoBatch }
export class MapoFarRenderer {
    private plate: MapoBatch | null = null;
    private plateMaterial: Material | null = null;
    private baker: MapoChunkBaker | null = null;
    private readonly cache = new MapoLodCache<TileEntry>((entry) => {
        destroyMapoBatch(entry.batch); entry.material.destroy(); entry.texture.destroy();
    });
    private disposed = false;
    private key = "";
    private wanted: MapoCacheTile[] = [];
    private pinned = new Set<string>();
    readyCount = 0;
    get tileCount(): number { return this.wanted.length; }
    get bytes(): number { return this.cache.bytes; }
    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    /** 每帧推进至多一个烘焙任务；L0 提前准备第一次切到 L1 时的可见块。 */
    render(logic: MapOriginalWorldLogic): void {
        if (this.disposed || !this.art?.overview || !this.art.spriteEffect) return;
        const cam = logic.camera;
        this.root.active = cam.lod > 0;
        if (!this.plateMaterial) {
            this.plateMaterial = createMapoMaterial(0, true, this.art.spriteEffect);
            this.plateMaterial.setProperty("mainTexture", this.art.overview);
            this.plate = createMapoBatch(this.root, "mapo-overview", buildMapoPlateMesh(mapoPlateBounds()), this.plateMaterial, 0);
        }
        if (cam.lod === 3) {
            this.baker?.dispose(); this.baker = null;
            this.cache.clear(); this.wanted = []; this.pinned.clear(); this.key = "";
            this.readyCount = 0;
            return;
        }
        const key = `${cam.version}|${cam.lod}|${logic.graphics.quality}`;
        if (key !== this.key) {
            this.key = key;
            const scale = cam.lod === 0 ? 0.50 : cam.scale;
            const hw = cam.width / scale / 2, hh = cam.height / scale / 2;
            const lod = cam.lod === 2 ? 2 : 1;
            this.wanted = mapoCacheTiles({ left: cam.x - hw, right: cam.x + hw, bottom: cam.y - hh, top: cam.y + hh },
                lod, scale, lod === 2 || mapoDecorEnabledFor(logic.graphics.quality));
            this.pinned = new Set(this.wanted.map((t) => t.key));
        }
        this.readyCount = 0;
        this.cache.forEach((entry, entryKey) => { entry.batch.node.active = this.pinned.has(entryKey); });
        let next: MapoCacheTile | undefined;
        for (const tile of this.wanted) {
            if (this.cache.get(tile.key)) this.readyCount++;
            else if (!next) next = tile;
        }
        if (next && !this.baker?.busy && this.cache.reserve(next.bytes, this.pinned)) {
            const tile = next;
            this.baker ??= new MapoChunkBaker(this.art);
            this.baker.bake(tile, (texture) => {
                if (this.disposed) { texture.destroy(); return; }
                const material = createMapoMaterial(0, true, this.art!.spriteEffect, true);
                material.setProperty("mainTexture", texture);
                const b = mapoPlateBounds(), r = tile.rect, c = tile.capture;
                const bounds = { minX: Math.max(b.minX, r.left), maxX: Math.min(b.maxX, r.right),
                    minY: Math.max(b.minY, r.bottom), maxY: Math.min(b.maxY, r.top) };
                const geometry = buildMapoPlateMesh(bounds);
                // 只显示内块；周围 2 texel 的真实邻域防止线性采样出现接缝。
                const u0 = (bounds.minX - c.left) / (c.right - c.left), u1 = (bounds.maxX - c.left) / (c.right - c.left);
                const v0 = (c.top - bounds.maxY) / (c.top - c.bottom), v1 = (c.top - bounds.minY) / (c.top - c.bottom);
                // 顶边沿用图像 UV；SAMPLE_FROM_RT 负责各图形后端的纹理原点差异。
                geometry.uvs.set([u0, v0, u1, v0, u1, v1, u0, v1]);
                const batch = createMapoBatch(this.root, `mapo-cache-${tile.key}`, geometry, material);
                batch.node.active = this.pinned.has(tile.key);
                this.cache.put(tile.key, { texture, material, batch }, tile.bytes);
            });
        }
    }

    clear(): void { this.root.active = false; }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.baker?.dispose(); this.baker = null;
        this.cache.clear();
        destroyMapoBatch(this.plate); this.plate = null;
        this.plateMaterial?.destroy(); this.plateMaterial = null;
    }
}
