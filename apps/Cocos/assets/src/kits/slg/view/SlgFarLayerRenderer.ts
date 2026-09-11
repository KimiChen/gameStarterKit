/** 远档整图层：一张静态地表 + 一张静态地标 + 一张稀疏归属，替代逐 chunk 网格（LOD >= SLG_FAR_LOD）。 */
import { EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, Texture2D, UIMeshRenderer, utils, Vec3 } from "cc";
import { type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { buildSlgFarGround, buildSlgFarLandmarks, buildSlgFarOwnership } from "../logic/farLayerMesh";
import { slgMapDebug } from "../logic/mapDebug";
import type { SlgLayoutIndex } from "../logic/mapArt";
import type { SlgMeshGeometry } from "../logic/terrainMesh";

interface MeshBatch { readonly node: Node; readonly mesh: Mesh; readonly model: MeshRenderer; capacity: number }

/** 归属网格初始容量；稀疏增长超出时按实际数量重建（远档归属写入低频，重建稀有）。 */
const OWNERSHIP_BASE_CAPACITY = 256;

export class SlgFarLayerRenderer {
    readonly node: Node;
    private readonly untextured: Material;
    private readonly textured: Material;
    private readonly islandMaterial: Material;
    private readonly seaMaterial: Material;
    private readonly sea: MeshBatch;
    private readonly island: MeshBatch;
    private readonly landmarks: MeshBatch;
    private readonly terrain: ISlgTerrain;
    private ownership: MeshBatch | null = null;
    private ownershipVersion = -1;
    private disposed = false;

    constructor(parent: Node, terrain: ISlgTerrain, layout: SlgLayoutIndex, decorationTexture: Texture2D, islandTexture: Texture2D, seaTexture: Texture2D) {
        const technique = EffectAsset.get("builtin-unlit")?.techniques.findIndex((entry) => entry.name === "alpha-blend") ?? -1;
        if (technique < 0) throw new Error("SLG far layer requires builtin-unlit alpha-blend");
        this.untextured = new Material();
        this.textured = new Material();
        this.islandMaterial = new Material();
        this.seaMaterial = new Material();
        try {
            this.untextured.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: false }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            for (const material of [this.textured, this.islandMaterial, this.seaMaterial]) {
                material.initialize({ effectName: "builtin-unlit", technique,
                    defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: true }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
            }
            this.textured.setProperty("mainTexture", decorationTexture);
            this.islandMaterial.setProperty("mainTexture", islandTexture);
            this.seaMaterial.setProperty("mainTexture", seaTexture);
        } catch (error) { this.untextured.destroy(); this.textured.destroy(); this.islandMaterial.destroy(); this.seaMaterial.destroy(); throw error; }
        this.node = new Node("slg-far-layer");
        try {
            this.node.layer = parent.layer;
            this.terrain = terrain;
            parent.addChild(this.node);
            const ground = buildSlgFarGround(terrain);
            this.sea = this.createBatch("slg-far-sea", ground.sea, this.seaMaterial);
            this.island = this.createBatch("slg-far-island", ground.island, this.islandMaterial);
            this.landmarks = this.createBatch("slg-far-landmarks",
                buildSlgFarLandmarks(decorationTexture.width, decorationTexture.height, terrain, layout.landmarks), this.textured);
            this.node.active = false;
        } catch (error) { this.dispose(); throw error; }
    }

    /** 稀疏归属按数据版次重建；版次不变零成本。调试隐藏层每次调用都生效。 */
    render(tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, version: number): void {
        if (this.disposed) return;
        const hidden = slgMapDebug.hiddenLayers;
        this.sea.node.active = !hidden.has("terrain");
        this.island.node.active = !hidden.has("terrain");
        this.landmarks.node.active = !hidden.has("landmarks");
        if (this.ownership) this.ownership.node.active = !hidden.has("ownership");
        if (version === this.ownershipVersion) return;
        this.ownershipVersion = version;
        const data = buildSlgFarOwnership(this.terrain, tiles, selfUid);
        if (!data) {
            if (this.ownership) { this.destroyBatch(this.ownership); this.ownership = null; }
            return;
        }
        const quadCount = data.indices16.length / 6;
        if (this.ownership && quadCount <= this.ownership.capacity) {
            this.ownership.mesh.updateSubMesh(0, this.geometry(data));
            this.ownership.model.onGeometryChanged();
            this.ownership.node.active = !hidden.has("ownership");
            return;
        }
        if (this.ownership) this.destroyBatch(this.ownership);
        this.ownership = this.createBatch("slg-far-ownership", data, this.untextured, Math.max(OWNERSHIP_BASE_CAPACITY, quadCount));
        this.ownership.node.active = !hidden.has("ownership");
    }

    setVisible(visible: boolean): void {
        if (!this.disposed) this.node.active = visible;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.destroyBatch(this.sea); this.destroyBatch(this.island); this.destroyBatch(this.landmarks);
        if (this.ownership) this.destroyBatch(this.ownership);
        this.ownership = null;
        this.untextured.destroy(); this.textured.destroy(); this.islandMaterial.destroy(); this.seaMaterial.destroy();
        this.node.destroy();
    }

    private geometry(data: SlgMeshGeometry) {
        return { ...data, minPos: new Vec3(data.minX, data.minY, 0), maxPos: new Vec3(data.maxX, data.maxY, 0) };
    }

    private createBatch(name: string, data: SlgMeshGeometry, material: Material, capacity?: number): MeshBatch {
        const quadCount = data.indices16.length / 6;
        const mesh = utils.MeshUtils.createDynamicMesh(0, this.geometry(data), undefined,
            { maxSubMeshes: 1, maxSubMeshVertices: (capacity ?? quadCount) * 4, maxSubMeshIndices: (capacity ?? quadCount) * 6 });
        const node = new Node(name);
        try {
            node.layer = this.node.layer;
            this.node.addChild(node);
            const model = node.addComponent(MeshRenderer);
            model.mesh = mesh; model.material = material;
            node.addComponent(UIMeshRenderer);
            return { node, mesh, model, capacity: capacity ?? quadCount };
        } catch (error) { node.destroy(); mesh.destroy(); throw error; }
    }

    private destroyBatch(batch: MeshBatch): void {
        batch.node.destroy(); batch.mesh.destroy();
    }
}
