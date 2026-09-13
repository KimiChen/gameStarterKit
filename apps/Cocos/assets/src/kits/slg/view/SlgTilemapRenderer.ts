/** 瓦片地表渲染器（替代块图切块）：每 chunk 一张 tileset 图集瓦片网格 + 稀疏归属 overlay。
 *  与原版同构：同纹理瓦片全图复用；文件 = tileset 单页图集 + tiles.json 引用表。
 *  海面 = 整张静态 sea-tile 平铺底（原版 CustomWater 的静态近似），永远垫在瓦片之下。 */
import { director, EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, Texture2D, UIMeshRenderer, utils, Vec3 } from "cc";
import { gridFromTileId, type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { ChunkFadeTracker } from "../logic/chunkFade";
import { buildSlgFarGround } from "../logic/farLayerMesh";
import type { SlgMeshGeometry } from "../logic/terrainMesh";
import { buildSlgTilemapMeshes, type SlgTilesData, type SlgChunkTileBucket } from "../logic/tilemapMesh";

interface MeshBatch { readonly node: Node; readonly mesh: Mesh; readonly model: MeshRenderer }
interface ChunkBatch { ground: MeshBatch; ownership: MeshBatch | null; version: number; lod: number }
interface LastArgs { tiles: ReadonlyMap<number, ISlgTile>; selfUid: string; lod: number }

export class SlgTilemapRenderer {
    private readonly batches = new Map<number, ChunkBatch>();
    private readonly dying = new Map<number, ChunkBatch>();
    private readonly fades = new ChunkFadeTracker();
    private readonly groundMaterial: Material;
    private readonly ownershipMaterial: Material;
    private readonly seaMaterial: Material;
    private readonly sea: MeshBatch;
    private readonly toneMapping: { readonly post: { toneMappingType: number }; readonly previous: number } | null;
    private lastArgs: LastArgs | null = null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly terrain: ISlgTerrain,
        private readonly data: SlgTilesData,
        private readonly tileIndex: ReadonlyMap<number, readonly SlgChunkTileBucket[]>,
        tilesetTexture: Texture2D, seaTexture: Texture2D) {
        const technique = EffectAsset.get("builtin-unlit")?.techniques.findIndex((entry) => entry.name === "alpha-blend") ?? -1;
        if (technique < 0) throw new Error("SLG tilemap requires builtin-unlit alpha-blend");
        this.groundMaterial = new Material();
        this.ownershipMaterial = new Material();
        this.seaMaterial = new Material();
        try {
            this.groundMaterial.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: true }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            this.ownershipMaterial.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: false }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            this.seaMaterial.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: true }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            this.groundMaterial.setProperty("mainTexture", tilesetTexture);
            this.seaMaterial.setProperty("mainTexture", seaTexture);
        } catch (error) { this.groundMaterial.destroy(); this.ownershipMaterial.destroy(); this.seaMaterial.destroy(); throw error; }
        // 海底色最先入树（兄弟序 = 绘制序），瓦片/归属永远压在海上。
        this.sea = this.createBatch("slg-sea-base", buildSlgFarGround(terrain).sea, 1, this.seaMaterial);
        const post = director.getScene()?.globals?.postSettings;
        this.toneMapping = post ? { post, previous: post.toneMappingType } : null;
        if (post) post.toneMappingType = 1;
    }

    render(chunks: ReadonlyMap<number, number>, tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, lod: number): void {
        if (this.disposed) return;
        this.lastArgs = { tiles, selfUid, lod };
        for (const [key, batch] of this.batches) {
            if (chunks.has(key)) continue;
            if (this.fades.beginOut(key)) { this.dying.set(key, batch); }
            else { this.destroyChunkBatch(batch); }
            this.batches.delete(key);
        }
        for (const [key, version] of chunks) {
            let batch = this.batches.get(key);
            const resurrect = this.dying.get(key);
            if (!batch && resurrect) {
                this.dying.delete(key);
                batch = resurrect;
                this.batches.set(key, batch);
                this.fades.beginIn(key);
            }
            if (batch?.version === version && batch.lod === lod && !this.fading(key)) continue;
            const { x: cx, y: cy } = gridFromTileId(key);
            const data = this.buildGeometry(cx, cy, lod, tiles, selfUid, this.fades.alphaOf(key));
            if (!batch) {
                if (data.ground) {
                    const ground = this.createBatch(`slg-chunk-${cx}-${cy}`, data.ground, data.quadCapacity, this.groundMaterial);
                    batch = { ground, ownership: null, version, lod };
                    this.batches.set(key, batch);
                }
            } else {
                if (data.ground) this.upload(batch.ground, data.ground);
            }
            if (batch) {
                if (data.ownership) {
                    if (batch.ownership) this.upload(batch.ownership, data.ownership);
                    else batch.ownership = this.createBatch(`slg-ownership-${cx}-${cy}`,
                        data.ownership, Math.max(1, data.quadCapacity), this.ownershipMaterial);
                } else { this.destroyBatch(batch.ownership); batch.ownership = null; }
                batch.version = version; batch.lod = lod;
            }
        }
    }

    /** 帧驱动淡入淡出：只有 alpha 变化的 chunk 重建网格。 */
    update(dtMs: number): void {
        if (this.disposed || this.fades.size === 0 || !this.lastArgs) return;
        const { changed, finishedOut } = this.fades.advance(dtMs);
        for (const { key, alpha } of changed) {
            const batch = this.batches.get(key) ?? this.dying.get(key);
            if (!batch) continue;
            const { x: cx, y: cy } = gridFromTileId(key);
            const data = this.buildGeometry(cx, cy, batch.lod, this.lastArgs.tiles, this.lastArgs.selfUid, alpha);
            if (data.ground) this.upload(batch.ground, data.ground);
            if (data.ownership) {
                if (batch.ownership) this.upload(batch.ownership, data.ownership);
                else batch.ownership = this.createBatch(`slg-ownership-${cx}-${cy}`,
                    data.ownership, Math.max(1, data.quadCapacity), this.ownershipMaterial);
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

    /** 远档整图层接管时藏掉近档海底（远档有自己的 slg-far-sea）。 */
    setSeaVisible(visible: boolean): void {
        if (!this.disposed) this.sea.node.active = visible;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.destroyBatch(this.sea);
        this.groundMaterial.destroy(); this.ownershipMaterial.destroy(); this.seaMaterial.destroy();
        if (this.toneMapping?.post.toneMappingType === 1) this.toneMapping.post.toneMappingType = this.toneMapping.previous;
    }

    private fading(key: number): boolean { return this.fades.alphaOf(key) < 1; }

    private buildGeometry(cx: number, cy: number, lod: number, tiles: ReadonlyMap<number, ISlgTile>,
        selfUid: string, alpha: number) {
        return buildSlgTilemapMeshes(this.terrain, this.data, this.tileIndex, cx, cy, lod, tiles, selfUid, alpha);
    }

    private geometry(data: SlgMeshGeometry) {
        return { ...data, minPos: new Vec3(data.minX, data.minY, 0), maxPos: new Vec3(data.maxX, data.maxY, 0) };
    }
    private createBatch(name: string, data: SlgMeshGeometry, capacity: number, material: Material): MeshBatch {
        const mesh = utils.MeshUtils.createDynamicMesh(0, this.geometry(data), undefined,
            { maxSubMeshes: 1, maxSubMeshVertices: Math.max(4, capacity * 4), maxSubMeshIndices: Math.max(6, capacity * 6) });
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
        // node.destroy 延迟到帧末，而共享材质可能已同步销毁——先摘除激活态，当帧即对场景遍历不可见。
        batch.node.active = false;
        batch.node.destroy(); batch.mesh.destroy();
    }
    private destroyChunkBatch(batch: ChunkBatch): void {
        this.destroyBatch(batch.ground);
        this.destroyBatch(batch.ownership);
    }
}
