/** One dynamic mesh per loaded chunk, shared unlit material; no per-tile nodes or foreign kit imports. */
import { director, EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, UIMeshRenderer, utils, Vec3 } from "cc";
import { SLG_CHUNK_SIZE, SLG_MAP_H, SLG_MAP_W, gridFromTileId, tileIdFromGrid, terrainAt, type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { SLG_GRID_PIXELS } from "../logic/mapCamera";
import { visibleMapLayers } from "../logic/mapLayers";

interface Batch { readonly node: Node; readonly mesh: Mesh; readonly model: MeshRenderer; version: number; lod: number }

export class SlgChunkRenderer {
    private readonly batches = new Map<number, Batch>();
    private readonly material: Material;
    private readonly toneMapping: { readonly post: { toneMappingType: number }; readonly previous: number } | null;
    private disposed = false;
    constructor(private readonly root: Node, private readonly terrain: ISlgTerrain) {
        const technique = EffectAsset.get("builtin-unlit")?.techniques.findIndex((entry) => entry.name === "alpha-blend") ?? -1;
        if (technique < 0) throw new Error("SLG requires builtin-unlit alpha-blend");
        this.material = new Material();
        try {
            this.material.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: false }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
        } catch (error) { this.material.destroy(); throw error; }
        const post = director.getScene()?.globals?.postSettings;
        this.toneMapping = post ? { post, previous: post.toneMappingType } : null;
        if (post) post.toneMappingType = 1;
    }
    render(chunks: ReadonlyMap<number, number>, tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, lod: number): void {
        for (const [key, batch] of this.batches) {
            if (chunks.has(key)) continue;
            batch.node.destroy(); batch.mesh.destroy(); this.batches.delete(key);
        }
        for (const [key, version] of chunks) {
            let batch = this.batches.get(key);
            if (batch && batch.version === version && batch.lod === lod) continue;
            const { x: cx, y: cy } = gridFromTileId(key);
            const minX = cx * SLG_CHUNK_SIZE;
            const minY = cy * SLG_CHUNK_SIZE;
            const width = Math.min(SLG_CHUNK_SIZE, SLG_MAP_W - minX);
            const height = Math.min(SLG_CHUNK_SIZE, SLG_MAP_H - minY);
            const quadCount = width * height;
            const positions = new Float32Array(quadCount * 12);
            const colors = new Float32Array(quadCount * 16);
            const indices16 = new Uint16Array(quadCount * 6);
            const gap = visibleMapLayers(lod).includes("grid") ? 0.65 : 0;
            let quad = 0;
            for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
                const x = minX + dx, y = minY + dy;
                const tile = tiles.get(tileIdFromGrid(x, y));
                const ground = terrainAt(this.terrain, x, y).color;
                const tint = !tile?.ownerUid ? null : tile.ownerUid === selfUid ? [65, 148, 236] : [220, 91, 78];
                const color = ground.map((value, channel) => (tint ? value * 0.35 + tint[channel] * 0.65 : value) / 255);
                const left = x * SLG_GRID_PIXELS + gap, right = (x + 1) * SLG_GRID_PIXELS - gap;
                const bottom = y * SLG_GRID_PIXELS + gap, top = (y + 1) * SLG_GRID_PIXELS - gap;
                positions.set([left, top, 0, right, top, 0, left, bottom, 0, right, bottom, 0], quad * 12);
                for (let vertex = 0; vertex < 4; vertex++) colors.set([color[0], color[1], color[2], 1], quad * 16 + vertex * 4);
                const v = quad * 4;
                indices16.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], quad * 6);
                quad += 1;
            }
            const geometry = { positions, colors, indices16,
                minPos: new Vec3(minX * SLG_GRID_PIXELS, minY * SLG_GRID_PIXELS, 0),
                maxPos: new Vec3((minX + width) * SLG_GRID_PIXELS, (minY + height) * SLG_GRID_PIXELS, 0) };
            if (!batch) {
                const mesh = utils.MeshUtils.createDynamicMesh(0, geometry, undefined,
                    { maxSubMeshes: 1, maxSubMeshVertices: quadCount * 4, maxSubMeshIndices: quadCount * 6 });
                const node = new Node(`slg-chunk-${cx}-${cy}`);
                node.layer = this.root.layer;
                this.root.addChild(node);
                const model = node.addComponent(MeshRenderer);
                model.mesh = mesh; model.material = this.material;
                node.addComponent(UIMeshRenderer);
                batch = { node, mesh, model, version, lod };
                this.batches.set(key, batch);
            } else {
                batch.mesh.updateSubMesh(0, geometry);
                batch.model.onGeometryChanged();
                batch.version = version; batch.lod = lod;
            }
        }
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const batch of this.batches.values()) { batch.node.destroy(); batch.mesh.destroy(); }
        this.batches.clear(); this.material.destroy();
        // Restore only our own setting; another scene/render consumer may have changed it meanwhile.
        if (this.toneMapping?.post.toneMappingType === 1) this.toneMapping.post.toneMappingType = this.toneMapping.previous;
    }
}
