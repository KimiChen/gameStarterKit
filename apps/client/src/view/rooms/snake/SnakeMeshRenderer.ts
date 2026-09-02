/**
 * SnakeMeshRenderer：蛇身 GL 四边形带渲染（对齐原游戏 SnakeGLNode 的渲染经济：
 * 每蛇一条网格、一次提交、顶点数据逐帧覆写零分配）。
 *
 * 机制（与 SnakeGLNode 同构）：
 *  - 每条蛇一个 `UIMeshRenderer` 节点，网格按 maxBodyPoints 预分配容量（⛔ 不随
 *    帧新建/销毁 GPU 缓冲）；逐帧只把当前路径点写进预分配的 positions/uvs/colors
 *    数组，然后 flush 子网格——热路径零对象分配；
 *  - 相邻路径点之间按法线展开一个四边形（4 顶点 / 2 三角形），段间共享拓扑，
 *    空段用 alpha=0 顶点退化（索引缓冲建网时一次写好，永不改）；
 *  - 皮肤贴图横排条带里的 body 帧（classic atlas 左 1/3）作为每段的 UV 全帧
 *    （当前素材是圆珠皮肤；将来换成连续条带皮肤时只改 UV 映射，网格机制不变）；
 *  - 席位色/AI 灰走**顶点色**（builtin-ui 材质的 color attribute × texture），
 *    所有蛇共享每纹理一份材质——材质零 per-snake 实例。
 *
 * 回退契约：构造/更新任一步抛错 → `available=false`，调用方回退 Graphics 圆节
 * （材质/effect 在预览构建缺失时的安全网，⛔ 不做半残渲染）。
 */
import {
    Color,
    gfx,
    Material,
    Mesh,
    Node,
    Texture2D,
    UIMeshRenderer,
    utils,
} from "cc";
import { SNAKE_RULESET } from "../../../shared/gameplays/snake/ruleset";

/** 每段四边形的顶点/索引数。 */
const VERTS_PER_SEGMENT = 4;
const INDICES_PER_SEGMENT = 6;
const HALF_WIDTH = SNAKE_RULESET.bodyWidth / 2;
/** classic atlas（216×72）body 帧的 UV 横向跨度（左 1/3）。 */
const BODY_UV_SPAN = 72 / 216;

interface SnakeMeshRecord {
    readonly node: Node;
    readonly mesh: Mesh;
    readonly positions: Float32Array;
    readonly uvs: Float32Array;
    readonly colors: Float32Array;
    /** 预分配段容量。 */
    readonly capacity: number;
}

function flushMesh(mesh: Mesh): void {
    // 动态网格 flush：Cocos 3.x 不同小版本的 API 形不同，逐个探测（探测失败静默——
    // 上层按 available 回退，⛔ 不抛进渲染帧循环）。
    const subMeshes = (mesh as unknown as { subMeshes?: Array<{ update?: () => void }> }).subMeshes;
    const sub = subMeshes?.[0];
    if (sub && typeof sub.update === "function") {
        sub.update();
        return;
    }
    const dyn = mesh as unknown as { updateSubMesh?: (index: number) => void };
    if (typeof dyn.updateSubMesh === "function") dyn.updateSubMesh(0);
}

export class SnakeMeshRenderer {
    private readonly records = new Map<string, SnakeMeshRecord>();
    private readonly materials = new Map<number, Material>();
    private failed = false;

    constructor(
        private readonly parent: Node,
        private readonly uiLayer: number,
        private readonly bodyTextures: readonly Texture2D[],
    ) {}

    get available(): boolean {
        return !this.failed && this.bodyTextures.length > 0;
    }

    /** 逐帧重写一条蛇的网格带；返回 false 时调用方应回退 Graphics 圆节。 */
    renderSnake(id: string, points: readonly { readonly x: number; readonly y: number }[], tint: Color): boolean {
        if (!this.available) return false;
        try {
            const record = this.ensureRecord(id);
            this.writeSnake(record, points, tint);
            record.node.active = points.length >= 2;
            return true;
        } catch (error) {
            console.warn("[snake] 网格带渲染失败，回退 Graphics 圆节：", error);
            this.failed = true;
            for (const record of this.records.values()) record.node.destroy();
            this.records.clear();
            return false;
        }
    }

    /** 蛇消失（死亡/离场）时摘除网格节点。 */
    removeSnake(id: string): void {
        const record = this.records.get(id);
        if (!record) return;
        record.node.destroy();
        this.records.delete(id);
    }

    dispose(): void {
        for (const record of this.records.values()) record.node.destroy();
        this.records.clear();
        this.materials.clear();
    }

    private ensureRecord(id: string): SnakeMeshRecord {
        const existing = this.records.get(id);
        if (existing) return existing;

        const skin = this.skinIndexOf(id) % this.bodyTextures.length;
        const capacity = SNAKE_RULESET.maxBodyPoints;
        const vertCount = capacity * VERTS_PER_SEGMENT;
        const positions = new Float32Array(vertCount * 3);
        const uvs = new Float32Array(vertCount * 2);
        const colors = new Float32Array(vertCount * 4);
        const indices = new Uint16Array(capacity * INDICES_PER_SEGMENT);
        for (let segment = 0; segment < capacity; segment++) {
            const vert = segment * VERTS_PER_SEGMENT;
            const idx = segment * INDICES_PER_SEGMENT;
            indices[idx] = vert;
            indices[idx + 1] = vert + 1;
            indices[idx + 2] = vert + 2;
            indices[idx + 3] = vert + 2;
            indices[idx + 4] = vert + 1;
            indices[idx + 5] = vert + 3;
        }
        const mesh = utils.createMesh({
            attributes: [
                new gfx.Attribute(gfx.AttributeName.ATTR_POSITION, gfx.Format.RGB32F),
                new gfx.Attribute(gfx.AttributeName.ATTR_TEX_COORD, gfx.Format.RG32F),
                new gfx.Attribute(gfx.AttributeName.ATTR_COLOR, gfx.Format.RGBA32F),
            ],
            positions,
            uvs,
            colors,
            indices,
        });
        const node = new Node(`snake-mesh-${id}`);
        node.layer = this.uiLayer;
        this.parent.addChild(node);
        node.addComponent(UIMeshRenderer);
        const renderer = node.getComponent(UIMeshRenderer) ?? node.addComponent(UIMeshRenderer);
        (renderer as unknown as { mesh?: unknown }).mesh = mesh;
        (renderer as unknown as { material?: unknown }).material = this.materialOf(skin);
        const record: SnakeMeshRecord = { node, mesh, positions, uvs, colors, capacity };
        this.records.set(id, record);
        return record;
    }

    private materialOf(skin: number): Material {
        const existing = this.materials.get(skin);
        if (existing) return existing;
        const material = new Material();
        material.initialize({
            effectName: "builtin-ui",
            defines: { USE_TEXTURE: true },
        });
        material.setProperty("mainTexture", this.bodyTextures[skin]);
        this.materials.set(skin, material);
        return material;
    }

    /** 席位色序由 id 稳定派生（与贴图 skin 选择同一哈希口径）。 */
    private skinIndexOf(id: string): number {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
        return hash % this.bodyTextures.length;
    }

    private writeSnake(record: SnakeMeshRecord, points: readonly { readonly x: number; readonly y: number }[], tint: Color): void {
        const segments = Math.min(Math.max(0, points.length - 1), record.capacity);
        const { positions, colors } = record;
        const r = tint.r / 255;
        const g = tint.g / 255;
        const b = tint.b / 255;
        const a = tint.a / 255;

        let vert = 0;
        for (let i = 0; i < segments; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const length = Math.hypot(dx, dy);
            // 法线（垂直于段方向）× 半体宽——与原游戏 sin/cos 偏移同款几何
            const nx = length > 1e-6 ? (-dy / length) * HALF_WIDTH : 0;
            const ny = length > 1e-6 ? (dx / length) * HALF_WIDTH : HALF_WIDTH;
            // quad: [p0+法线, p0-法线, p1+法线, p1-法线]
            vert = this.writeVert(record, vert, p0.x + nx, p0.y + ny, 0, 0, r, g, b, a);
            vert = this.writeVert(record, vert, p0.x - nx, p0.y - ny, BODY_UV_SPAN, 0, r, g, b, a);
            vert = this.writeVert(record, vert, p1.x + nx, p1.y + ny, 0, 1, r, g, b, a);
            vert = this.writeVert(record, vert, p1.x - nx, p1.y - ny, BODY_UV_SPAN, 1, r, g, b, a);
        }
        // 空段退化：alpha=0（索引拓扑不变，GPU 光栅化零面积）
        for (let i = vert; i < record.capacity * VERTS_PER_SEGMENT; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
            colors[i * 4 + 3] = 0;
        }
        flushMesh(record.mesh);
    }

    private writeVert(
        record: SnakeMeshRecord,
        vert: number,
        x: number,
        y: number,
        u: number,
        v: number,
        r: number,
        g: number,
        b: number,
        a: number,
    ): number {
        record.positions[vert * 3] = x;
        record.positions[vert * 3 + 1] = y;
        record.positions[vert * 3 + 2] = 0;
        record.uvs[vert * 2] = u;
        record.uvs[vert * 2 + 1] = v;
        record.colors[vert * 4] = r;
        record.colors[vert * 4 + 1] = g;
        record.colors[vert * 4 + 2] = b;
        record.colors[vert * 4 + 3] = a;
        return vert + 1;
    }
}
