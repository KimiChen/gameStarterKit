/** One textured terrain mesh per chunk; sparse ownership uses its own translucent overlay. */
import { director, EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, Texture2D, UIMeshRenderer, utils, Vec3 } from "cc";
import { gridFromTileId, type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { buildSlgTerrainMeshes, type SlgMeshGeometry } from "../logic/terrainMesh";

interface MeshBatch { readonly node: Node; readonly mesh: Mesh; readonly model: MeshRenderer }
interface ChunkBatch { readonly ground: MeshBatch; ownership: MeshBatch | null; version: number; lod: number }

export class SlgChunkRenderer {
    private readonly batches = new Map<number, ChunkBatch>();
    private readonly groundMaterial: Material;
    private readonly ownershipMaterial: Material;
    private readonly toneMapping: { readonly post: { toneMappingType: number }; readonly previous: number } | null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly terrain: ISlgTerrain, private readonly texture: Texture2D) {
        const technique = EffectAsset.get("builtin-unlit")?.techniques.findIndex((entry) => entry.name === "alpha-blend") ?? -1;
        if (technique < 0) throw new Error("SLG requires builtin-unlit alpha-blend");
        this.groundMaterial = new Material();
        this.ownershipMaterial = new Material();
        try {
            for (const [material, textured] of [[this.groundMaterial, true], [this.ownershipMaterial, false]] as const) {
                material.initialize({ effectName: "builtin-unlit", technique,
                    defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: textured },
                    states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            }
            this.groundMaterial.setProperty("mainTexture", texture);
        } catch (error) { this.groundMaterial.destroy(); this.ownershipMaterial.destroy(); throw error; }
        const post = director.getScene()?.globals?.postSettings;
        this.toneMapping = post ? { post, previous: post.toneMappingType } : null;
        if (post) post.toneMappingType = 1;
    }

    render(chunks: ReadonlyMap<number, number>, tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, lod: number): void {
        if (this.disposed) return;
        for (const [key, batch] of this.batches) {
            if (chunks.has(key)) continue;
            this.destroyBatch(batch.ground); this.destroyBatch(batch.ownership); this.batches.delete(key);
        }
        for (const [key, version] of chunks) {
            let batch = this.batches.get(key);
            if (batch?.version === version && batch.lod === lod) continue;
            const { x: cx, y: cy } = gridFromTileId(key);
            const data = buildSlgTerrainMeshes(this.terrain, cx, cy, lod, tiles, selfUid, this.texture.width, this.texture.height);
            if (!batch) {
                const ground = this.createBatch("slg-chunk-" + cx + "-" + cy, data.ground, data.quadCapacity, this.groundMaterial);
                batch = { ground, ownership: null, version, lod };
                this.batches.set(key, batch);
            } else this.upload(batch.ground, data.ground);
            if (data.ownership) {
                if (batch.ownership) this.upload(batch.ownership, data.ownership);
                else batch.ownership = this.createBatch("slg-ownership-" + cx + "-" + cy, data.ownership, data.quadCapacity, this.ownershipMaterial);
            } else { this.destroyBatch(batch.ownership); batch.ownership = null; }
            batch.version = version; batch.lod = lod;
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const batch of this.batches.values()) { this.destroyBatch(batch.ground); this.destroyBatch(batch.ownership); }
        this.batches.clear(); this.groundMaterial.destroy(); this.ownershipMaterial.destroy();
        if (this.toneMapping?.post.toneMappingType === 1) this.toneMapping.post.toneMappingType = this.toneMapping.previous;
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
}
