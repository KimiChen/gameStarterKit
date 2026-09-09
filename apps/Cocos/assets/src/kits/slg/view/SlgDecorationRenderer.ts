/** Sparse, deterministic decoration quads; one UI mesh per visible nonempty chunk. */
import { EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, Texture2D, UIMeshRenderer, utils, Vec3 } from "cc";
import { gridFromTileId, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";
import { SLG_MAX_DECORATIONS_PER_CHUNK, slgAtlasUv, slgDecorationsForChunk } from "../logic/mapArt";
import { SLG_GRID_PIXELS } from "../logic/mapCamera";
import { visibleMapLayers } from "../logic/mapLayers";

interface DecorationBatch { readonly node: Node; readonly mesh: Mesh; readonly model: MeshRenderer }
interface RenderedChunk { readonly lod: number; readonly batch: DecorationBatch | null }

export class SlgDecorationRenderer {
    // Remember empty chunks as well: ownership revisions never change static art.
    private readonly chunks = new Map<number, RenderedChunk>();
    private readonly material: Material;
    private readonly insetU: number;
    private readonly insetV: number;
    private disposed = false;

    constructor(private readonly root: Node, private readonly terrain: ISlgTerrain, texture: Texture2D) {
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
        const layers = visibleMapLayers(lod);
        for (const [key, rendered] of this.chunks) {
            if (chunks.has(key)) continue;
            this.destroyBatch(rendered.batch);
            this.chunks.delete(key);
        }
        for (const key of chunks.keys()) {
            const previous = this.chunks.get(key);
            if (previous?.lod === lod) continue;
            const { x: cx, y: cy } = gridFromTileId(key);
            // Farther north is painted first; the helper confines quads to their own chunk.
            const decorations = [...slgDecorationsForChunk(this.terrain, cx, cy, lod)]
                .filter((entry) => layers.includes(entry.landmark ? "landmarks" : "decorations"))
                .sort((a, b) => b.y - a.y || a.x - b.x);
            if (decorations.length > SLG_MAX_DECORATIONS_PER_CHUNK) throw new Error("SLG decoration chunk exceeds its mesh capacity");
            if (decorations.length === 0) {
                this.destroyBatch(previous?.batch ?? null);
                this.chunks.set(key, { lod, batch: null });
                continue;
            }

            const positions = new Float32Array(decorations.length * 12);
            const uvs = new Float32Array(decorations.length * 8);
            const colors = new Float32Array(decorations.length * 16).fill(1);
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
            let batch = previous?.batch ?? null;
            if (batch) {
                batch.mesh.updateSubMesh(0, geometry);
                batch.model.onGeometryChanged();
            } else {
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
                    batch = { node, mesh, model };
                } catch (error) { node.destroy(); mesh.destroy(); throw error; }
            }
            this.chunks.set(key, { lod, batch });
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const rendered of this.chunks.values()) this.destroyBatch(rendered.batch);
        this.chunks.clear(); this.material.destroy();
        // The view owns the shared texture and releases it after all renderers are disposed.
    }

    private destroyBatch(batch: DecorationBatch | null): void {
        if (!batch) return;
        batch.node.destroy(); batch.mesh.destroy();
    }
}
