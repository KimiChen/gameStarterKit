/** 1030 个常驻食物的单 atlas / 单 material 批渲染；不为单个食物创建 Node。 */
import { gfx, Material, Mesh, Node, Texture2D, UIMeshRenderer, utils } from "cc";
import type { ISnakeSnapshotFood } from "../../../shared/index";
import { SNAKE_RULESET } from "../../../shared/gameplays/snake/ruleset";
import { SNAKE_ENTITY_PRESENTATION_CATALOG, type FrameDefinition } from "../../../logic/rooms/snake/SnakePresentationCatalog";

const VERTICES_PER_QUAD = 4;
const INDICES_PER_QUAD = 6;

function flushMesh(mesh: Mesh): void {
    const sub = (mesh as unknown as { subMeshes?: Array<{ update?: () => void }> }).subMeshes?.[0];
    if (sub && typeof sub.update === "function") sub.update();
    else (mesh as unknown as { updateSubMesh?: (index: number) => void }).updateSubMesh?.(0);
}

export class SnakeFoodMeshRenderer {
    private readonly node: Node;
    private readonly mesh: Mesh;
    private readonly positions: Float32Array;
    private readonly uvs: Float32Array;
    private readonly colors: Float32Array;
    private failed = false;

    constructor(parent: Node, uiLayer: number, private readonly texture: Texture2D) {
        const capacity = SNAKE_RULESET.snapshotMaxFoods;
        this.positions = new Float32Array(capacity * VERTICES_PER_QUAD * 3);
        this.uvs = new Float32Array(capacity * VERTICES_PER_QUAD * 2);
        this.colors = new Float32Array(capacity * VERTICES_PER_QUAD * 4);
        const indices = new Uint16Array(capacity * INDICES_PER_QUAD);
        for (let index = 0; index < capacity; index += 1) {
            const vertex = index * VERTICES_PER_QUAD;
            indices.set([vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3],
                index * INDICES_PER_QUAD);
        }
        this.mesh = utils.createMesh({
            attributes: [
                new gfx.Attribute(gfx.AttributeName.ATTR_POSITION, gfx.Format.RGB32F),
                new gfx.Attribute(gfx.AttributeName.ATTR_TEX_COORD, gfx.Format.RG32F),
                new gfx.Attribute(gfx.AttributeName.ATTR_COLOR, gfx.Format.RGBA32F),
            ],
            positions: this.positions,
            uvs: this.uvs,
            colors: this.colors,
            indices,
        });
        this.node = new Node("snake-food-batch");
        this.node.layer = uiLayer;
        parent.addChild(this.node);
        const renderer = this.node.addComponent(UIMeshRenderer);
        (renderer as unknown as { mesh?: unknown }).mesh = this.mesh;
        const material = new Material();
        material.initialize({ effectName: "builtin-ui", defines: { USE_TEXTURE: true } });
        material.setProperty("mainTexture", texture);
        (renderer as unknown as { material?: unknown }).material = material;
    }

    get available(): boolean { return !this.failed; }
    get batchNodeCount(): 1 { return 1; }

    render(foods: readonly ISnakeSnapshotFood[]): boolean {
        if (this.failed || foods.length > SNAKE_RULESET.snapshotMaxFoods) return false;
        try {
            let vertex = 0;
            for (const food of foods) {
                const presentation = food.kind === 0
                    ? SNAKE_ENTITY_PRESENTATION_CATALOG.food.dots[food.variant - 1]
                    : SNAKE_ENTITY_PRESENTATION_CATALOG.food.star;
                if (!presentation) throw new Error(`missing food presentation kind=${food.kind} variant=${food.variant}`);
                vertex = this.writeQuad(vertex, food.x, food.y, presentation.displaySize, presentation.frame);
            }
            const capacityVertices = SNAKE_RULESET.snapshotMaxFoods * VERTICES_PER_QUAD;
            for (let index = vertex; index < capacityVertices; index += 1) {
                this.positions[index * 3] = 0;
                this.positions[index * 3 + 1] = 0;
                this.positions[index * 3 + 2] = 0;
                this.colors[index * 4 + 3] = 0;
            }
            this.node.active = foods.length > 0;
            flushMesh(this.mesh);
            return true;
        } catch (error) {
            console.warn("[snake] food atlas batch failed; using graphics fallback", error);
            this.failed = true;
            this.node.active = false;
            return false;
        }
    }

    dispose(): void { this.node.destroy(); }

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
        this.positions.set([x, y, 0], vertex * 3);
        this.uvs.set([u, v], vertex * 2);
        this.colors.set([1, 1, 1, 1], vertex * 4);
        return vertex + 1;
    }
}
