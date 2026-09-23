/** 瓦片地表渲染器（替代块图切块）：**每层一张合并 tileset 瓦片网格** + 稀疏归属 overlay。
 *  与原版同构：原版 = 每层一个整图 Tilemap（层内全局 y 降 x 升）；合并网格让高/宽瓦片
 *  （树/崖沿 2-3 格）与相邻 chunk 的内容按基格 y 正确互叠——per-chunk 网格在 chunk 边界
 *  只有 chunk 粒度的绘制序，平移补块时相对序随机，会短暂穿插（slg.md §10.6）。
 *  归属 overlay 是 chunk 内整格 quad、不跨 chunk，保留 per-chunk 建销 + 淡出。
 *  海面 = 整张静态 sea-tile 平铺底（原版 CustomWater 的静态近似），永远垫在瓦片之下。 */
import { EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, Texture2D, UIMeshRenderer, utils, Vec3 } from "cc";
import { gridFromTileId, type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { ChunkFadeTracker } from "../logic/chunkFade";
import { buildSlgFarGround } from "../logic/farLayerMesh";
import type { SlgMeshGeometry } from "../logic/terrainMesh";
import { buildSlgOwnershipMesh, buildSlgTileLayerMeshes, type SlgTilesData, type SlgChunkTileBucket } from "../logic/tilemapMesh";

import type { Stage3DGlobalsLease } from "../../../view/scene3d/Stage3D";

interface MeshBatch { node: Node; mesh: Mesh; model: MeshRenderer; capacity: number }
interface OwnershipBatch { batch: MeshBatch; version: number; lod: number }
interface LastArgs { tiles: ReadonlyMap<number, ISlgTile>; selfUid: string; lod: number }

export class SlgTilemapRenderer {
    /** 层节点（key = data.layers 下标），兄弟序 = 层 seq 序（= 绘制序）。 */
    private readonly layerBatches = new Map<number, MeshBatch>();
    /** 入树的层下标，恒按 data.layers 序排列（sea 之后、归属节点之前）。 */
    private readonly layerOrder: number[] = [];
    private readonly ownershipBatches = new Map<number, OwnershipBatch>();
    private readonly dyingOwnership = new Map<number, OwnershipBatch>();
    private readonly fades = new ChunkFadeTracker();
    private readonly groundMaterial: Material;
    private readonly ownershipMaterial: Material;
    private readonly seaMaterial: Material;
    private readonly sea: MeshBatch;
    private readonly globalsLease: Stage3DGlobalsLease;
    private lastArgs: LastArgs | null = null;
    private visibleKeys: readonly number[] = [];
    private lod = -1;
    private layersDirty = true;
    private disposed = false;

    constructor(private readonly root: Node, private readonly terrain: ISlgTerrain,
        private readonly data: SlgTilesData,
        private readonly tileIndex: ReadonlyMap<number, readonly SlgChunkTileBucket[]>,
        tilesetTexture: Texture2D, seaTexture: Texture2D, acquireGlobals: () => Stage3DGlobalsLease) {
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
        try { this.sea = this.createBatch("slg-sea-base", buildSlgFarGround(terrain).sea, 1, this.seaMaterial); }
        catch (error) { this.groundMaterial.destroy(); this.ownershipMaterial.destroy(); this.seaMaterial.destroy(); throw error; }
        try { this.globalsLease = acquireGlobals(); }
        catch (error) { this.destroyBatch(this.sea); this.groundMaterial.destroy(); this.ownershipMaterial.destroy(); this.seaMaterial.destroy(); throw error; }
    }

    render(chunks: ReadonlyMap<number, number>, tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, lod: number): void {
        if (this.disposed) return;
        this.lastArgs = { tiles, selfUid, lod };
        const keys = [...chunks.keys()].sort((a, b) => a - b);
        if (!sameKeys(keys, this.visibleKeys) || lod !== this.lod) {
            this.visibleKeys = keys; this.lod = lod; this.layersDirty = true;
        }
        // 归属 overlay 按 chunk 建销（淡出失败的硬销）。
        for (const [key, entry] of this.ownershipBatches) {
            if (chunks.has(key)) continue;
            if (this.fades.beginOut(key)) { this.dyingOwnership.set(key, entry); }
            else { this.destroyBatch(entry.batch); }
            this.ownershipBatches.delete(key);
        }
        for (const [key, version] of chunks) {
            let entry = this.ownershipBatches.get(key);
            const resurrect = this.dyingOwnership.get(key);
            if (!entry && resurrect) {
                this.dyingOwnership.delete(key); entry = resurrect;
                this.ownershipBatches.set(key, entry);
                this.fades.beginIn(key);
            }
            if (entry && entry.version === version && entry.lod === lod && this.fades.alphaOf(key) >= 1) continue;
            const { x: cx, y: cy } = gridFromTileId(key);
            const geometry = buildSlgOwnershipMesh(this.terrain, cx, cy, tiles, selfUid, this.fades.alphaOf(key));
            if (geometry) {
                if (entry) this.upload(entry.batch, geometry);
                else {
                    const capacity = Math.max(1, geometry.positions.length / 12);
                    entry = { batch: this.createBatch(`slg-ownership-${cx}-${cy}`, geometry, capacity, this.ownershipMaterial), version, lod };
                    this.ownershipBatches.set(key, entry);
                }
                entry.version = version; entry.lod = lod;
            } else if (entry) { this.destroyBatch(entry.batch); this.ownershipBatches.delete(key); }
        }
        // 新入列/淡入中的 chunk 需要立刻以当前 alpha 上屏（alpha=0 也算——占据顶点位置）。
        if (this.layersDirty || this.fades.size > 0) this.rebuildLayers();
    }

    /** 帧驱动淡入淡出：alpha 变化的帧整层重建（顶点色携带各 chunk 的 fade alpha）。 */
    update(dtMs: number): void {
        if (this.disposed || this.fades.size === 0 || !this.lastArgs) return;
        const { changed, finishedOut } = this.fades.advance(dtMs);
        if (changed.length > 0) this.rebuildLayers();
        const { tiles, selfUid } = this.lastArgs;
        for (const { key, alpha } of changed) {
            const entry = this.ownershipBatches.get(key) ?? this.dyingOwnership.get(key);
            if (!entry) continue;
            const { x: cx, y: cy } = gridFromTileId(key);
            const geometry = buildSlgOwnershipMesh(this.terrain, cx, cy, tiles, selfUid, alpha);
            if (geometry) this.upload(entry.batch, geometry);
        }
        for (const key of finishedOut) {
            const entry = this.dyingOwnership.get(key);
            if (entry) { this.destroyBatch(entry.batch); this.dyingOwnership.delete(key); }
        }
    }

    /** 销毁全部批（远档切换/刷新）；材质与 renderer 本体保留可继续用。 */
    clear(): void {
        for (const batch of this.layerBatches.values()) this.destroyBatch(batch);
        this.layerBatches.clear(); this.layerOrder.length = 0;
        for (const entry of this.ownershipBatches.values()) this.destroyBatch(entry.batch);
        this.ownershipBatches.clear();
        for (const entry of this.dyingOwnership.values()) this.destroyBatch(entry.batch);
        this.dyingOwnership.clear();
        this.fades.clear();
        this.visibleKeys = []; this.lod = -1; this.layersDirty = true;
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
        this.globalsLease.release();
    }

    private rebuildLayers(): void {
        if (this.disposed) return;
        this.layersDirty = false;
        const lod = this.lastArgs?.lod ?? 0;
        const built = buildSlgTileLayerMeshes(this.data, this.tileIndex, this.visibleKeys, lod,
            (key) => this.fades.alphaOf(key));
        const alive = new Set<number>();
        for (const entry of built) {
            const index = this.data.layers.indexOf(entry.layer);
            if (index < 0) continue;
            alive.add(index);
            let batch = this.layerBatches.get(index);
            if (!batch) { batch = this.createLayerBatch(index, entry.geometry, entry.quadCount); this.layerBatches.set(index, batch); }
            else this.upload(batch, entry.geometry, entry.quadCount);
        }
        for (const [index, batch] of this.layerBatches) {
            if (alive.has(index)) continue;
            this.destroyBatch(batch);
            this.layerBatches.delete(index);
            const at = this.layerOrder.indexOf(index);
            if (at >= 0) this.layerOrder.splice(at, 1);
        }
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
            return { node, mesh, model, capacity };
        } catch (error) { node.destroy(); mesh.destroy(); throw error; }
    }
    /** 层节点按 data.layers 序插入 sea 之后（兄弟序 = 绘制序）。 */
    private createLayerBatch(index: number, data: SlgMeshGeometry, quads: number): MeshBatch {
        const layer = this.data.layers[index];
        const capacity = Math.max(1, quads);
        const mesh = utils.MeshUtils.createDynamicMesh(0, this.geometry(data), undefined,
            { maxSubMeshes: 1, maxSubMeshVertices: Math.max(4, capacity * 4), maxSubMeshIndices: Math.max(6, capacity * 6) });
        const node = new Node(`slg-tiles-${layer.seq}-${layer.name}`);
        try {
            node.layer = this.root.layer;
            let at = 1; // 0 = slg-sea-base
            while (at - 1 < this.layerOrder.length && this.layerOrder[at - 1] < index) at += 1;
            this.root.insertChild(node, at);
            this.layerOrder.splice(at - 1, 0, index);
            const model = node.addComponent(MeshRenderer); model.mesh = mesh; model.material = this.groundMaterial;
            node.addComponent(UIMeshRenderer);
            return { node, mesh, model, capacity };
        } catch (error) { node.destroy(); mesh.destroy(); throw error; }
    }
    private upload(batch: MeshBatch, data: SlgMeshGeometry, quads?: number): void {
        const need = quads ?? data.positions.length / 12;
        if (need > batch.capacity) {
            // 可见集增长超容量：换一张更大的动态网格（旧网格延迟销毁，Cocos destroy 均为帧末回收）。
            const fresh = utils.MeshUtils.createDynamicMesh(0, this.geometry(data), undefined,
                { maxSubMeshes: 1, maxSubMeshVertices: need * 4, maxSubMeshIndices: need * 6 });
            const old = batch.mesh;
            batch.model.mesh = fresh; batch.mesh = fresh; batch.capacity = need;
            old.destroy();
            return;
        }
        batch.mesh.updateSubMesh(0, this.geometry(data)); batch.model.onGeometryChanged();
    }
    private destroyBatch(batch: MeshBatch | null): void {
        if (!batch) return;
        // node.destroy 延迟到帧末，而共享材质可能已同步销毁——先摘除激活态，当帧即对场景遍历不可见。
        batch.node.active = false;
        batch.node.destroy(); batch.mesh.destroy();
    }
}

function sameKeys(a: readonly number[], b: readonly number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
}
