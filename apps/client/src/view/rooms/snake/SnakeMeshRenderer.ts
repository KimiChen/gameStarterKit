/**
 * 稳定 skinId 驱动的蛇身渲染；白色身份色（顶点色恒为不透明白，皮肤靠贴图体现），
 * 未知皮肤由表现目录回退到 1。
 *
 * ⚠ 几何形态是**离散重叠精灵**，⛔ 不是连续缎带（S5-05 F10）：每隔
 * `repeatedBodyPointDistance` 个路径点画**一个**按该点朝向旋转的完整身体帧，相邻帧互相重叠。
 * 这与原作 `SnakeGLNode.calRenderData` 的 NormalRepeat(2) 分支、S0 冻结 golden
 * (`tools/snake-s0-replication/render.mjs`) 以及 16 张衣柜预览图的画法一致。
 * ⛔ 别改回「每个路径段一个四边形」——那会把 96×96 的方形圆点压进 8 单位段长（约 4.5 倍压缩），
 * 圆点边缘被挤成密集白齿，正是 F10 记录的现象。
 */
import { Material, Mesh, MeshRenderer, Node, Texture2D } from "cc";
import { SNAKE_RULESET } from "../../../shared/gameplays/snake/ruleset";
import {
    deriveSkinLayoutMetrics,
    resolveClientSnakeSkinPresentation,
    type ClientSkinPresentation,
    type FrameDefinition,
    type SkinPartTrack,
} from "../../../logic/rooms/snake/SnakePresentationCatalog";
import {
    allocateQuadBuffers,
    attachQuadMesh,
    createQuadMaterial,
    createQuadMesh,
    uploadQuads,
    type QuadBuffers,
} from "./snakeQuadMesh";

interface SnakeMeshRecord {
    readonly node: Node;
    readonly mesh: Mesh;
    readonly model: MeshRenderer;
    readonly buffers: QuadBuffers;
    readonly capacity: number;
    readonly skinId: number;
}

/** 原作 durationFrames 是离散保持帧；权威 world tick 只负责提供单调动画游标。 */
export function snakeTimedFrame(track: SkinPartTrack, tick: number): FrameDefinition {
    const duration = track.frames.reduce((sum, frame) => sum + frame.durationFrames, 0);
    let cursor = ((Math.floor(tick) % duration) + duration) % duration;
    for (const frame of track.frames) {
        if (cursor < frame.durationFrames) return frame;
        cursor -= frame.durationFrames;
    }
    return track.frames[track.frames.length - 1];
}

function frameUvs(texture: Texture2D, frame: FrameDefinition): readonly number[] {
    const packedWidth = frame.rotated ? frame.rect.height : frame.rect.width;
    const packedHeight = frame.rotated ? frame.rect.width : frame.rect.height;
    const u0 = frame.rect.x / texture.width;
    const u1 = (frame.rect.x + packedWidth) / texture.width;
    const v0 = frame.rect.y / texture.height;
    const v1 = (frame.rect.y + packedHeight) / texture.height;
    // 顺序为左上、右上、左下、右下；rotated atlas 在采样时逆时针还原。
    return frame.rotated
        ? [u0, v0, u0, v1, u1, v0, u1, v1]
        : [u0, v0, u1, v0, u0, v1, u1, v1];
}

export class SnakeMeshRenderer {
    private readonly records = new Map<string, SnakeMeshRecord>();
    private readonly materials = new Map<number, Material>();
    private failed = false;

    constructor(
        private readonly parent: Node,
        private readonly uiLayer: number,
        private readonly bodyTextures: ReadonlyMap<number, Texture2D>,
    ) {}

    get available(): boolean { return !this.failed && this.bodyTextures.size > 0; }

    renderSnake(
        id: string,
        skinId: number,
        points: readonly { readonly x: number; readonly y: number }[],
        bodyScale: number,
        tick: number,
        boost: boolean,
    ): boolean {
        if (!this.available) return false;
        try {
            const resolution = resolveClientSnakeSkinPresentation(skinId, (entry) =>
                this.bodyTextures.has(entry.skinId) ? "available" : "missing");
            const presentation = resolution.presentation;
            if (!presentation) return false;
            let record = this.records.get(id);
            if (record && record.skinId !== presentation.skinId) {
                this.destroyRecord(record);
                this.records.delete(id);
                record = undefined;
            }
            record ??= this.ensureRecord(id, presentation.skinId);
            // ⚠ 精灵尺寸现在由各自帧的 rect × frameScale 决定，⛔ 不再由调用方预先算一个统一半宽。
            const sprites = this.writeSnake(record, presentation, points, bodyScale, tick, boost);
            record.node.active = sprites > 0;
            return true;
        } catch (error) {
            console.warn("[snake] skin mesh failed; using graphics fallback", error);
            this.failed = true;
            for (const record of this.records.values()) this.destroyRecord(record);
            this.records.clear();
            return false;
        }
    }

    removeSnake(id: string): void {
        const record = this.records.get(id);
        if (record) this.destroyRecord(record);
        this.records.delete(id);
    }

    dispose(): void {
        for (const record of this.records.values()) this.destroyRecord(record);
        this.records.clear();
        // 材质按 skinId 复用、跨 record 共享，⛔ 只能在这里统一销毁，不能随单条 record 走。
        for (const material of this.materials.values()) material.destroy();
        this.materials.clear();
    }

    /** ⚠ Node.destroy 不回收网格持有的 GPU 顶点/索引缓冲；换皮肤会为同一条蛇重建 record。 */
    private destroyRecord(record: SnakeMeshRecord): void {
        record.node.destroy();
        record.mesh.destroy();
    }

    private ensureRecord(id: string, skinId: number): SnakeMeshRecord {
        const capacity = SNAKE_RULESET.maxBodyPoints;
        const buffers = allocateQuadBuffers(capacity);
        const mesh = createQuadMesh(buffers, capacity);
        const material = this.materialOf(skinId);
        const node = new Node(`snake-mesh-${id}`);
        node.layer = this.uiLayer;
        // ⚠ 先入场景再挂组件：UIMeshRenderer 的 onLoad 只查一次 ModelRenderer，见 snakeQuadMesh 文件头。
        this.parent.addChild(node);
        const model = attachQuadMesh(node, mesh, material);
        const record = { node, mesh, model, buffers, capacity, skinId };
        this.records.set(id, record);
        return record;
    }

    private materialOf(skinId: number): Material {
        const existing = this.materials.get(skinId);
        if (existing) return existing;
        const texture = this.bodyTextures.get(skinId);
        if (!texture) throw new Error(`missing texture for skinId ${skinId}`);
        const material = createQuadMaterial(texture);
        this.materials.set(skinId, material);
        return material;
    }

    /**
     * 把一条蛇的身体写成若干个「按朝向旋转的整帧四边形」，返回实际写入的精灵数。
     *
     * 布局口径全部来自表现目录（`deriveSkinLayoutMetrics`，原作 NormalRepeat(2) 公式）：
     *   - 路径点索引 0 是**蛇头**，由 SnakeWorldView 用独立 Sprite 画，⛔ 网格不碰它；
     *   - 第一个身体精灵落在索引 `firstBodyPointDistance`（= 半个头高 + 半个身高 + 源偏移）；
     *   - 之后每隔 `repeatedBodyPointDistance` 个点再画一个；
     *   - 第 n 个精灵用 `bodySequence[n % bodySequence.length]` 号轨道（多轨皮肤据此交替配色）。
     * 以皮肤 1 为例：frameScale = 36/96 = 0.375，身高 36、源间距 -16→-6，
     * 于是 `round((36-6)/8) = 4`——每 4 个点画一个 36×36 的圆，间距 32 < 36 故必然重叠。
     */
    private writeSnake(
        record: SnakeMeshRecord,
        presentation: ClientSkinPresentation,
        points: readonly { x: number; y: number }[],
        bodyScale: number,
        tick: number,
        boost: boolean,
    ): number {
        const texture = this.bodyTextures.get(presentation.skinId);
        if (!texture) throw new Error(`unresolved skin ${presentation.skinId}`);
        // boost 只换纹理，⛔ 不改变路径点布局——所以 layout 恒用 normal 侧算（目录函数内部已保证）。
        const motion = boost ? presentation.boost : presentation.normal;
        const layout = deriveSkinLayoutMetrics(presentation, bodyScale, SNAKE_RULESET.pointSpacing);
        const lastIndex = points.length - 1;

        // 能放下几个身体精灵。⚠ 再按缓冲容量夹一次：uploadQuads 超过 maxSubMeshVertices 会触发引擎断言。
        const spriteCount = lastIndex < layout.firstBodyPointDistance
            ? 0
            : Math.min(
                Math.floor((lastIndex - layout.firstBodyPointDistance) / layout.repeatedBodyPointDistance) + 1,
                record.capacity,
            );

        let vert = 0;
        // ⚠ 倒序（尾 → 头）是**画面契约**，⛔ 不要图省事改成正序：所有四边形共用一个 mesh，
        // 引擎按索引顺序绘制且不写深度，于是「后写的盖住先写的」。倒序才能让每个圆盖住它身后那个、
        // 只露出朝尾一侧的圆弧——原作 `for (W = N-1; W >= 0; W--)` 与 S0 golden 都是这个方向。
        // 正序会让鳞片朝向翻转，观感立刻不对。
        for (let ordinal = spriteCount - 1; ordinal >= 0; ordinal -= 1) {
            const pointIndex = layout.firstBodyPointDistance + ordinal * layout.repeatedBodyPointDistance;
            const trackIndex = motion.bodySequence[ordinal % motion.bodySequence.length];
            const track = motion.body[trackIndex];
            if (!track) throw new Error(`skin ${presentation.skinId} body sequence points outside its track list`);
            const frame = snakeTimedFrame(track, tick);
            const uvs = frameUvs(texture, frame);

            // 朝向取「本点 → 前一个点」，即指向蛇头的方向；points[0] 是头，故 pointIndex ≥ 1 恒成立。
            const here = points[pointIndex];
            const ahead = points[pointIndex - 1];
            const dx = ahead.x - here.x;
            const dy = ahead.y - here.y;
            const length = Math.hypot(dx, dy);
            // 退化点（两点重合）时朝向取 +Y，与旧实现保持一致，避免出现 NaN 顶点。
            const forwardX = length > 1e-6 ? dx / length : 0;
            const forwardY = length > 1e-6 ? dy / length : 1;

            // rect.width/height 是**逻辑**尺寸（rotated 帧的图集区域才是转置的，已由 frameUvs 处理）。
            // 宽跨蛇身、高沿脊线——与 deriveSkinLayoutMetrics 用 rect.height 算间距的口径一致。
            const scale = layout.frameScale * presentation.visualScale;
            const halfAlong = frame.rect.height * scale * 0.5;
            const halfAcross = frame.rect.width * scale * 0.5;
            const alongX = forwardX * halfAlong;
            const alongY = forwardY * halfAlong;
            // 行进方向的左手侧法线（逆时针 90°）。
            const acrossX = -forwardY * halfAcross;
            const acrossY = forwardX * halfAcross;

            // 顶点顺序必须是 左上/右上/左下/右下，才能和固定索引对 [v, v+1, v+2, v+2, v+1, v+3] 拼成四边形；
            // 「上」取朝头方向，「左」取左手侧。⚠ 绕序会随转向翻正负，所以材质已关背面剔除。
            vert = this.writeVert(record, vert, here.x + alongX + acrossX, here.y + alongY + acrossY, uvs[0], uvs[1]);
            vert = this.writeVert(record, vert, here.x + alongX - acrossX, here.y + alongY - acrossY, uvs[2], uvs[3]);
            vert = this.writeVert(record, vert, here.x - alongX + acrossX, here.y - alongY + acrossY, uvs[4], uvs[5]);
            vert = this.writeVert(record, vert, here.x - alongX - acrossX, here.y - alongY - acrossY, uvs[6], uvs[7]);
        }
        uploadQuads(record.model, record.mesh, record.buffers, spriteCount);
        return spriteCount;
    }

    private writeVert(record: SnakeMeshRecord, vert: number, x: number, y: number, u: number, v: number): number {
        record.buffers.positions.set([x, y, 0], vert * 3);
        record.buffers.uvs.set([u, v], vert * 2);
        record.buffers.colors.set([1, 1, 1, 1], vert * 4);
        return vert + 1;
    }
}
