/** One textured terrain mesh per chunk; sparse ownership uses its own translucent overlay.
 *  地表 = 世界格 64 块真地表贴图（ground-tiles 懒加载）；未就绪/海块回退 palette 顶点色。 */
import { director, EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, Texture2D, UIMeshRenderer, utils, Vec3 } from "cc";
import { gridFromTileId, type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { ChunkFadeTracker } from "../logic/chunkFade";
import { slgMapDebug } from "../logic/mapDebug";
import { buildSlgTerrainMeshes, type SlgMeshGeometry } from "../logic/terrainMesh";
import type { SlgGroundTileCache, SlgGroundTileIndex } from "./SlgArtResources";

interface MeshBatch { readonly node: Node; readonly mesh: Mesh; readonly model: MeshRenderer }
type SlgGroundMode = "tile" | "island" | "sea";
interface ChunkBatch {
    key: number;
    ground: MeshBatch; ownership: MeshBatch | null; version: number; lod: number;
    blockKey: string; textured: boolean; groundMode: SlgGroundMode;
}
interface LastArgs { tiles: ReadonlyMap<number, ISlgTile>; selfUid: string; lod: number }

export class SlgChunkRenderer {
    private readonly batches = new Map<number, ChunkBatch>();
    private readonly dying = new Map<number, ChunkBatch>();
    private readonly fades = new ChunkFadeTracker();
    private readonly tileMaterials = new Map<string, Material>();
    private readonly blockSet: ReadonlySet<string>;
    private readonly fallbackMaterial: Material;
    private readonly seaFallbackMaterial: Material;
    private readonly ownershipMaterial: Material;
    private readonly toneMapping: { readonly post: { toneMappingType: number }; readonly previous: number } | null;
    private lastArgs: LastArgs | null = null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly terrain: ISlgTerrain,
        private readonly tileIndex: SlgGroundTileIndex, private readonly tileCache: SlgGroundTileCache,
        islandTexture: Texture2D, seaTexture: Texture2D) {
        const technique = EffectAsset.get("builtin-unlit")?.techniques.findIndex((entry) => entry.name === "alpha-blend") ?? -1;
        if (technique < 0) throw new Error("SLG requires builtin-unlit alpha-blend");
        this.blockSet = new Set(tileIndex.blocks.map(([bx, by]) => `${bx}-${by}`));
        this.fallbackMaterial = new Material();
        this.seaFallbackMaterial = new Material();
        this.ownershipMaterial = new Material();
        try {
            this.fallbackMaterial.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: true }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            this.fallbackMaterial.setProperty("mainTexture", islandTexture);
            this.seaFallbackMaterial.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: true }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            this.seaFallbackMaterial.setProperty("mainTexture", seaTexture);
            this.ownershipMaterial.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: false }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
        } catch (error) { this.fallbackMaterial.destroy(); this.seaFallbackMaterial.destroy(); this.ownershipMaterial.destroy(); throw error; }
        const post = director.getScene()?.globals?.postSettings;
        this.toneMapping = post ? { post, previous: post.toneMappingType } : null;
        if (post) post.toneMappingType = 1;
    }

    private blockOf(cx: number, cy: number): { bx: number; by: number; key: string } {
        const tile = this.tileIndex.tile / 16;  // 块边长（chunk 数）= 64/16 = 4
        const bx = Math.floor(cx / tile), by = Math.floor(cy / tile);
        return { bx, by, key: `${bx}-${by}` };
    }

    private materialFor(key: string, texture: Texture2D): Material {
        let material = this.tileMaterials.get(key);
        if (!material) {
            const technique = EffectAsset.get("builtin-unlit")?.techniques.findIndex((entry) => entry.name === "alpha-blend") ?? -1;
            material = new Material();
            material.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: true }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            material.setProperty("mainTexture", texture);
            this.tileMaterials.set(key, material);
        }
        return material;
    }

    render(chunks: ReadonlyMap<number, number>, tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, lod: number): void {
        if (this.disposed) return;
        this.lastArgs = { tiles, selfUid, lod };
        for (const [key, batch] of this.batches) {
            if (chunks.has(key)) continue;
            // 淡出超限（整档切换/大幅刷新）退化为硬销；否则转入 dying 渐隐。
            if (this.fades.beginOut(key)) { this.dying.set(key, batch); }
            else { this.destroyChunkBatch(batch); }
            this.batches.delete(key);
        }
        for (const [key, version] of chunks) {
            let batch = this.batches.get(key);
            const resurrect = this.dying.get(key);
            if (!batch && resurrect) {
                // 淡出半途重回视野：掉头淡入，不跳变。
                this.dying.delete(key);
                batch = resurrect;
                this.batches.set(key, batch);
                this.fades.beginIn(key);
            }
            const { x: cx, y: cy } = gridFromTileId(key);
            const block = this.blockOf(cx, cy);
            const hasBlock = this.blockSet.has(block.key);
            const texture = hasBlock ? this.tileCache.textureOf(block.bx, block.by) : null;
            const textured = !!texture;
            // 三态：块贴图（陆地块就绪）/ island 回退（陆地块未就绪）/ sea 平铺（全海块，注册表无块）
            const groundMode = textured ? "tile" : hasBlock ? "island" : "sea";
            if (!batch && hasBlock) {
                // 陆地块随 chunk 生命周期 retain/release（销毁在 destroyChunkBatch）。
                void this.tileCache.retain(block.bx, block.by);
            }
            if (batch?.version === version && batch.lod === lod && batch.textured === textured
                && (textured || batch.groundMode === groundMode) && !this.fading(key)) continue;
            const data = this.buildGeometry(key, lod, tiles, selfUid, this.fades.alphaOf(key), groundMode);
            if (!batch) {
                const ground = this.createBatch(`slg-chunk-${cx}-${cy}`, data.ground, data.quadCapacity,
                    this.materialOf(groundMode, block.key, texture));
                batch = { key, ground, ownership: null, version, lod, blockKey: block.key, textured, groundMode };
                this.batches.set(key, batch);
                this.fades.beginIn(key);
            } else {
                this.upload(batch.ground, data.ground);
                if (batch.textured !== textured || batch.groundMode !== groundMode) {
                    batch.ground.model.material = this.materialOf(groundMode, block.key, texture);
                }
            }
            if (data.ownership) {
                if (batch.ownership) this.upload(batch.ownership, data.ownership);
                else batch.ownership = this.createBatch(`slg-ownership-${cx}-${cy}`,
                    data.ownership, data.quadCapacity, this.ownershipMaterial);
            } else { this.destroyBatch(batch.ownership); batch.ownership = null; }
            batch.version = version; batch.lod = lod; batch.textured = textured; batch.groundMode = groundMode;
        }
    }

    /** 帧驱动：fade 推进 + 块贴图就绪后的 chunk 换肤（无需用户动相机）。 */
    update(dtMs: number): void {
        if (this.disposed) return;
        // 块贴图就绪翻转：未 textured 的在册 chunk 重查一次（贴图加载是异步的）。
        if (this.lastArgs) {
            for (const batch of this.batches.values()) {
                if (batch.textured || !this.blockSet.has(batch.blockKey)) continue;
                const [bx, by] = batch.blockKey.split("-").map(Number);
                const texture = this.tileCache.textureOf(bx, by);
                if (texture) {
                    const data = this.buildGeometry(batch.key, batch.lod, this.lastArgs.tiles, this.lastArgs.selfUid,
                        this.fades.alphaOf(batch.key), "tile");
                    this.upload(batch.ground, data.ground);
                    batch.ground.model.material = this.materialOf("tile", batch.blockKey, texture);
                    batch.textured = true; batch.groundMode = "tile";
                }
            }
        }
        if (this.fades.size === 0 || !this.lastArgs) return;
        const { changed, finishedOut } = this.fades.advance(dtMs);
        for (const { key, alpha } of changed) {
            const batch = this.batches.get(key) ?? this.dying.get(key);
            if (!batch) continue;
            const data = this.buildGeometry(key, batch.lod, this.lastArgs.tiles, this.lastArgs.selfUid, alpha, batch.groundMode);
            this.upload(batch.ground, data.ground);
            if (data.ownership) {
                if (batch.ownership) this.upload(batch.ownership, data.ownership);
                else batch.ownership = this.createBatch(`slg-ownership-${gridFromTileId(key).x}-${gridFromTileId(key).y}`,
                    data.ownership, data.quadCapacity, this.ownershipMaterial);
            } else { this.destroyBatch(batch.ownership); batch.ownership = null; }
        }
        for (const key of finishedOut) {
            const batch = this.dying.get(key);
            if (batch) { this.destroyChunkBatch(batch); this.dying.delete(key); }
        }
    }

    /** 销毁全部批（远档切换/刷新）；材质与 renderer 本体保留可继续用。 */
    clear(): void {
        for (const batch of this.batches.values()) this.destroyChunkBatch(batch);
        for (const batch of this.dying.values()) this.destroyChunkBatch(batch);
        this.batches.clear(); this.dying.clear(); this.fades.clear();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        for (const material of this.tileMaterials.values()) material.destroy();
        this.tileMaterials.clear();
        this.fallbackMaterial.destroy(); this.seaFallbackMaterial.destroy(); this.ownershipMaterial.destroy();
        if (this.toneMapping?.post.toneMappingType === 1) this.toneMapping.post.toneMappingType = this.toneMapping.previous;
    }

    private fading(key: number): boolean { return this.fades.alphaOf(key) < 1; }

    private materialOf(groundMode: SlgGroundMode, blockKey: string, texture: Texture2D | null): Material {
        if (groundMode === "tile" && texture) return this.materialFor(blockKey, texture);
        return groundMode === "sea" ? this.seaFallbackMaterial : this.fallbackMaterial;
    }

    private buildGeometry(key: number, lod: number, tiles: ReadonlyMap<number, ISlgTile>, selfUid: string,
        alpha: number, groundMode: SlgGroundMode) {
        const { x: cx, y: cy } = gridFromTileId(key);
        const mode = groundMode === "tile" ? { kind: "tile" as const, tile: this.tileIndex.tile }
            : groundMode === "sea" ? { kind: "sea" as const, span: 64 }
            : { kind: "island" as const, rect: this.terrain.islandRect };
        return buildSlgTerrainMeshes(this.terrain, cx, cy, lod, tiles, selfUid,
            this.tileIndex.image, this.tileIndex.image, alpha, slgMapDebug.hiddenLayers, mode);
    }

    private geometry(data: SlgMeshGeometry) {
        return { ...data, minPos: new Vec3(data.minX, data.minY, 0), maxPos: new Vec3(data.maxX, data.maxY, 0) };
    }
    private createBatch(name: string, data: SlgMeshGeometry, capacity: number, material: Material): MeshBatch {
        const mesh = utils.MeshUtils.createDynamicMesh(0, this.geometry(data), undefined,
            { maxSubMeshes: 1, maxSubMeshVertices: capacity * 4, maxSubMeshIndices: capacity * 6 });
        const node = new Node(name);
        try {
            node.layer = this.root.layer; this.root.addChild(node);
            const model = node.addComponent(MeshRenderer); model.mesh = mesh; model.material = material;
            node.addComponent(UIMeshRenderer);
            return { node, mesh, model };
        } catch (error) { node.destroy(); mesh.destroy(); throw error; }
    }
    private upload(batch: MeshBatch, data: SlgMeshGeometry): void {
        batch.mesh.updateSubMesh(0, this.geometry(data)); batch.model.onGeometryChanged();
    }
    private destroyBatch(batch: MeshBatch | null): void {
        if (!batch) return;
        batch.node.destroy(); batch.mesh.destroy();
    }
    private destroyChunkBatch(batch: ChunkBatch): void {
        this.destroyBatch(batch.ground);
        this.destroyBatch(batch.ownership);
        // 块贴图引用配对释放（render 里 chunk 创建时的 retain）
        if (this.blockSet.has(batch.blockKey)) {
            const [bx, by] = batch.blockKey.split("-").map(Number);
            this.tileCache.release(bx, by);
        }
    }
}
