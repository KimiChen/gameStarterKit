/** 1030 个常驻食物的单 atlas / 单 material 批渲染；不为单个食物创建 Node。 */
import { Material, Mesh, MeshRenderer, Node, Texture2D } from "cc";
import type { ISnakeSnapshotFood } from "../../../shared/index";
import { SNAKE_RULESET } from "../../../shared/gameplays/snake/ruleset";
import { SNAKE_ENTITY_PRESENTATION_CATALOG, type FrameDefinition } from "../../../logic/rooms/snake/SnakePresentationCatalog";
import {
    allocateQuadBuffers,
    attachQuadMesh,
    createQuadMaterial,
    createQuadMesh,
    uploadQuads,
    type QuadBuffers,
} from "./snakeQuadMesh";

export class SnakeFoodMeshRenderer {
    private readonly node: Node;
    private readonly mesh: Mesh;
    private readonly material: Material;
    private readonly model: MeshRenderer;
    private readonly buffers: QuadBuffers;
    private failed = false;

    constructor(parent: Node, uiLayer: number, private readonly texture: Texture2D) {
        const capacity = SNAKE_RULESET.snapshotMaxFoods;
        this.buffers = allocateQuadBuffers(capacity);
        this.mesh = createQuadMesh(this.buffers, capacity);
        this.material = createQuadMaterial(texture);
        this.node = new Node("snake-food-batch");
        this.node.layer = uiLayer;
        // ⚠ 先入场景再挂组件：UIMeshRenderer 的 onLoad 只查一次 ModelRenderer，见 snakeQuadMesh 文件头。
        parent.addChild(this.node);
        this.model = attachQuadMesh(this.node, this.mesh, this.material);
    }

    get available(): boolean { return !this.failed; }
    get batchNodeCount(): 1 { return 1; }

    render(foods: readonly ISnakeSnapshotFood[]): boolean {
        if (this.failed) return false;
        if (foods.length > SNAKE_RULESET.snapshotMaxFoods) {
            // ⚠ 必须先熄灭本批：调用方接到 false 会改用 Graphics 全量补画，留着上一帧的四边形会重影。
            this.node.active = false;
            return false;
        }
        try {
            let vertex = 0;
            for (const food of foods) {
                const presentation = food.kind === 0
                    ? SNAKE_ENTITY_PRESENTATION_CATALOG.food.dots[food.variant - 1]
                    : SNAKE_ENTITY_PRESENTATION_CATALOG.food.star;
                if (!presentation) throw new Error(`missing food presentation kind=${food.kind} variant=${food.variant}`);
                vertex = this.writeQuad(vertex, food.x, food.y, presentation.displaySize, presentation.frame);
            }
            this.node.active = foods.length > 0;
            uploadQuads(this.model, this.mesh, this.buffers, foods.length);
            return true;
        } catch (error) {
            console.warn("[snake] food atlas batch failed; using graphics fallback", error);
            this.failed = true;
            this.node.active = false;
            return false;
        }
    }

    dispose(): void {
        this.node.destroy();
        // ⚠ Node.destroy 不回收网格与材质持有的 GPU 缓冲；每次 mount 都会重建本渲染器。
        this.mesh.destroy();
        this.material.destroy();
    }

    private writeQuad(vertex: number, x: number, y: number, displaySize: number, frame: FrameDefinition): number {
        const half = displaySize / 2;
        const u0 = frame.rect.x / this.texture.width;
        const u1 = (frame.rect.x + frame.rect.width) / this.texture.width;
        const v0 = frame.rect.y / this.texture.height;
        const v1 = (frame.rect.y + frame.rect.height) / this.texture.height;
        vertex = this.writeVertex(vertex, x - half, y + half, u0, v0);
        vertex = this.writeVertex(vertex, x + half, y + half, u1, v0);
        vertex = this.writeVertex(vertex, x - half, y - half, u0, v1);
        vertex = this.writeVertex(vertex, x + half, y - half, u1, v1);
        return vertex;
    }

    private writeVertex(vertex: number, x: number, y: number, u: number, v: number): number {
        this.buffers.positions.set([x, y, 0], vertex * 3);
        this.buffers.uvs.set([u, v], vertex * 2);
        this.buffers.colors.set([1, 1, 1, 1], vertex * 4);
        return vertex + 1;
    }
}
