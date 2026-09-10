/** Sparse, deterministic decoration quads; one UI mesh per visible nonempty chunk. */
import { EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, Texture2D, UIMeshRenderer, utils, Vec3 } from "cc";
import { gridFromTileId, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";
import { ChunkFadeTracker } from "../logic/chunkFade";
import { SLG_MAX_DECORATIONS_PER_CHUNK, slgAtlasUv, slgDecorationsForChunk, type SlgDecoration } from "../logic/mapArt";
import { SLG_GRID_PIXELS } from "../logic/mapCamera";
import { slgMapDebug } from "../logic/mapDebug";
import { visibleMapLayers } from "../logic/mapLayers";

interface DecorationBatch { readonly node: Node; readonly mesh: Mesh; readonly model: MeshRenderer }
interface RenderedChunk { readonly lod: number; readonly batch: DecorationBatch | null }

export class SlgDecorationRenderer {
    // Remember empty chunks as well: ownership revisions never change static art.
    private readonly chunks = new Map<number, RenderedChunk>();
    private readonly dying = new Map<number, RenderedChunk>();
    private readonly fades = new ChunkFadeTracker();
    private readonly material: Material;
    private readonly insetU: number;
    private readonly insetV: number;
    private disposed = false;

    constructor(private readonly root: Node, private readonly terrain: ISlgTerrain, texture: Texture2D,
        private readonly layout?: ReadonlyMap<number, readonly SlgDecoration[]>) {
        if (!(texture.width > 0 && texture.height > 0)) throw new Error("SLG decoration atlas must be loaded before rendering");
        this.insetU = 0.5 / texture.width;
        this.insetV = 0.5 / texture.height;
        const technique = EffectAsset.get("builtin-unlit")?.techniques.findIndex((entry) => entry.name === "alpha-blend") ?? -1;
        if (technique < 0) throw new Error("SLG decorations require builtin-unlit alpha-blend");
        this.material = new Material();
        try {
            this.material.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: true },
                states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            this.material.setProperty("mainTexture", texture);
        } catch (error) { this.material.destroy(); throw error; }
    }

    render(chunks: ReadonlyMap<number, number>, lod: number): void {
        if (this.disposed) return;
        for (const [key, rendered] of this.chunks) {
            if (chunks.has(key)) continue;
            if (rendered.batch && this.fades.beginOut(key)) { this.dying.set(key, rendered); }
            else this.destroyBatch(rendered.batch);
            this.chunks.delete(key);
        }
        for (const key of chunks.keys()) {
            const resurrect = this.dying.get(key);
            if (resurrect) {
                this.dying.delete(key);
                this.chunks.set(key, resurrect);
                this.fades.beginIn(key);
                continue;
            }
            const previous = this.chunks.get(key);
            // lod 未变即无事可做：未淡出的保持原样，淡入中的交给 update() 逐帧重建。
            if (previous?.lod === lod) continue;
            const { x: cx, y: cy } = gridFromTileId(key);
            const decorations = this.decorationsFor(cx, cy, lod);
            if (decorations.length === 0) {
                this.destroyBatch(previous?.batch ?? null);
                this.chunks.set(key, { lod, batch: null });
                continue;
            }
            // 先登记淡入（alpha 归零）再建首帧，避免「先弹出来再淡入」的跳变。
            if (!previous) this.fades.beginIn(key);
            const batch = this.writeBatch(key, previous?.batch ?? null, decorations, this.fades.alphaOf(key));
            this.chunks.set(key, { lod, batch });
        }
    }

    /** 帧驱动淡入淡出：dying 淡出销毁、淡入按当前 alpha 重建。 */
    update(dtMs: number): void {
        if (this.disposed || this.fades.size === 0) return;
        const { changed, finishedOut } = this.fades.advance(dtMs);
        for (const { key, alpha } of changed) {
            const rendered = this.chunks.get(key) ?? this.dying.get(key);
            if (!rendered?.batch) continue;
            const { x: cx, y: cy } = gridFromTileId(key);
            this.writeBatch(key, rendered.batch, this.decorationsFor(cx, cy, rendered.lod), alpha);
        }
        for (const key of finishedOut) {
            const rendered = this.dying.get(key);
            if (rendered) { this.destroyBatch(rendered.batch); this.dying.delete(key); }
        }
    }

    /** 销毁全部批（远档切换/刷新）；材质与 renderer 本体保留可继续用。 */
    clear(): void {
        for (const rendered of this.chunks.values()) this.destroyBatch(rendered.batch);
        for (const rendered of this.dying.values()) this.destroyBatch(rendered.batch);
        this.chunks.clear(); this.dying.clear(); this.fades.clear();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.material.destroy();
        // The view owns the shared texture and releases it after all renderers are disposed.
    }

    /** 内容枚举（含调试隐藏层覆写）；远东先绘制的顺序与块内封界由 mapArt 保证。 */
    private decorationsFor(cx: number, cy: number, lod: number): readonly SlgDecoration[] {
        const layers = visibleMapLayers(lod, slgMapDebug.hiddenLayers);
        const decorations = [...slgDecorationsForChunk(this.terrain, cx, cy, lod, this.layout)]
            .filter((entry) => layers.includes(entry.landmark ? "landmarks" : "decorations"))
            .sort((a, b) => b.y - a.y || a.x - b.x);
        if (decorations.length > SLG_MAX_DECORATIONS_PER_CHUNK) throw new Error("SLG decoration chunk exceeds its mesh capacity");
        return decorations;
    }

    /** 把一组装饰按 alpha 写进既有/新建批。 */
    private writeBatch(key: number, batch: DecorationBatch | null,
        decorations: readonly SlgDecoration[], alpha: number): DecorationBatch {
        const { x: cx, y: cy } = gridFromTileId(key);
        const positions = new Float32Array(decorations.length * 12);
        const uvs = new Float32Array(decorations.length * 8);
        const colors = new Float32Array(decorations.length * 16).fill(1);
        for (let channel = 3; channel < colors.length; channel += 4) colors[channel] = alpha;
        const indices16 = new Uint16Array(decorations.length * 6);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        decorations.forEach((decoration, quad) => {
            const left = (decoration.x - decoration.width / 2) * SLG_GRID_PIXELS;
            const right = (decoration.x + decoration.width / 2) * SLG_GRID_PIXELS;
            const bottom = (decoration.y - decoration.height / 2) * SLG_GRID_PIXELS;
            const top = (decoration.y + decoration.height / 2) * SLG_GRID_PIXELS;
            // Half-texel inset prevents neighbouring atlas cells from bleeding into the quad.
            // The top of the world quad samples the top of the PNG: V increases downwards.
            const uv = slgAtlasUv(decoration.atlasIndex);
            const u0 = uv.u0 + this.insetU, v0 = uv.v0 + this.insetV;
            const u1 = uv.u1 - this.insetU, v1 = uv.v1 - this.insetV;
            positions.set([left, top, 0, right, top, 0, left, bottom, 0, right, bottom, 0], quad * 12);
            uvs.set([u0, v0, u1, v0, u0, v1, u1, v1], quad * 8);
            const v = quad * 4;
            indices16.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], quad * 6);
            minX = Math.min(minX, left); minY = Math.min(minY, bottom);
            maxX = Math.max(maxX, right); maxY = Math.max(maxY, top);
        });
        const geometry = { positions, uvs, colors, indices16,
            minPos: new Vec3(minX, minY, 0), maxPos: new Vec3(maxX, maxY, 0) };
        if (batch) {
            batch.mesh.updateSubMesh(0, geometry);
            batch.model.onGeometryChanged();
            return batch;
        }
        const mesh = utils.MeshUtils.createDynamicMesh(0, geometry, undefined,
            { maxSubMeshes: 1, maxSubMeshVertices: SLG_MAX_DECORATIONS_PER_CHUNK * 4,
                maxSubMeshIndices: SLG_MAX_DECORATIONS_PER_CHUNK * 6 });
        const node = new Node(`slg-decorations-${cx}-${cy}`);
        try {
            node.layer = this.root.layer;
            this.root.addChild(node);
            // UIMeshRenderer looks up its ModelRenderer once, during onLoad.
            const model = node.addComponent(MeshRenderer);
            model.mesh = mesh; model.material = this.material;
            node.addComponent(UIMeshRenderer);
            return { node, mesh, model };
        } catch (error) { node.destroy(); mesh.destroy(); throw error; }
    }

    private destroyBatch(batch: DecorationBatch | null): void {
        if (!batch) return;
        batch.node.destroy(); batch.mesh.destroy();
    }
}
