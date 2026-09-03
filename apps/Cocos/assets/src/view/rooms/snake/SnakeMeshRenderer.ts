/** 稳定 skinId 驱动的蛇身四边形带；白色身份色，未知皮肤由表现目录回退到 1。 */
import { gfx, Material, Mesh, Node, Texture2D, UIMeshRenderer, utils } from "cc";
import { SNAKE_RULESET } from "../../../shared/gameplays/snake/ruleset";
import {
    deriveSkinLayoutMetrics,
    resolveClientSnakeSkinPresentation,
    type FrameDefinition,
    type SkinPartTrack,
} from "../../../logic/rooms/snake/SnakePresentationCatalog";

const VERTS_PER_SEGMENT = 4;
const INDICES_PER_SEGMENT = 6;

interface SnakeMeshRecord {
    readonly node: Node;
    readonly mesh: Mesh;
    readonly positions: Float32Array;
    readonly uvs: Float32Array;
    readonly colors: Float32Array;
    readonly capacity: number;
    readonly skinId: number;
}

function flushMesh(mesh: Mesh): void {
    const sub = (mesh as unknown as { subMeshes?: Array<{ update?: () => void }> }).subMeshes?.[0];
    if (sub && typeof sub.update === "function") sub.update();
    else (mesh as unknown as { updateSubMesh?: (index: number) => void }).updateSubMesh?.(0);
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
                record.node.destroy();
                this.records.delete(id);
                record = undefined;
            }
            record ??= this.ensureRecord(id, presentation.skinId);
            const halfWidth = (SNAKE_RULESET.bodyWidth / 2) * bodyScale
                * presentation.bodyRenderWidthRate * presentation.visualScale;
            this.writeSnake(record, points, halfWidth, bodyScale, presentation.skinId, tick, boost);
            record.node.active = points.length >= 2;
            return true;
        } catch (error) {
            console.warn("[snake] skin mesh failed; using graphics fallback", error);
            this.failed = true;
            for (const record of this.records.values()) record.node.destroy();
            this.records.clear();
            return false;
        }
    }

    removeSnake(id: string): void {
        this.records.get(id)?.node.destroy();
        this.records.delete(id);
    }

    dispose(): void {
        for (const record of this.records.values()) record.node.destroy();
        this.records.clear();
        this.materials.clear();
    }

    private ensureRecord(id: string, skinId: number): SnakeMeshRecord {
        const capacity = SNAKE_RULESET.maxBodyPoints;
        const vertCount = capacity * VERTS_PER_SEGMENT;
        const positions = new Float32Array(vertCount * 3);
        const uvs = new Float32Array(vertCount * 2);
        const colors = new Float32Array(vertCount * 4);
        const indices = new Uint16Array(capacity * INDICES_PER_SEGMENT);
        for (let segment = 0; segment < capacity; segment += 1) {
            const vert = segment * VERTS_PER_SEGMENT;
            const idx = segment * INDICES_PER_SEGMENT;
            indices.set([vert, vert + 1, vert + 2, vert + 2, vert + 1, vert + 3], idx);
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
        const renderer = node.addComponent(UIMeshRenderer);
        (renderer as unknown as { mesh?: unknown }).mesh = mesh;
        (renderer as unknown as { material?: unknown }).material = this.materialOf(skinId);
        const record = { node, mesh, positions, uvs, colors, capacity, skinId };
        this.records.set(id, record);
        return record;
    }

    private materialOf(skinId: number): Material {
        const existing = this.materials.get(skinId);
        if (existing) return existing;
        const texture = this.bodyTextures.get(skinId);
        if (!texture) throw new Error(`missing texture for skinId ${skinId}`);
        const material = new Material();
        material.initialize({ effectName: "builtin-ui", defines: { USE_TEXTURE: true } });
        material.setProperty("mainTexture", texture);
        this.materials.set(skinId, material);
        return material;
    }

    private writeSnake(
        record: SnakeMeshRecord,
        points: readonly { x: number; y: number }[],
        halfWidth: number,
        bodyScale: number,
        skinId: number,
        tick: number,
        boost: boolean,
    ): void {
        const presentation = resolveClientSnakeSkinPresentation(skinId).presentation;
        const texture = this.bodyTextures.get(skinId);
        if (!presentation || !texture) throw new Error(`unresolved skin ${skinId}`);
        const motion = boost ? presentation.boost : presentation.normal;
        const layout = deriveSkinLayoutMetrics(presentation, bodyScale, SNAKE_RULESET.pointSpacing);
        const segments = Math.min(Math.max(0, points.length - 1), record.capacity);
        let vert = 0;
        for (let index = 0; index < segments; index += 1) {
            const bodyOrdinal = index < layout.firstBodyPointDistance
                ? 0
                : 1 + Math.floor((index - layout.firstBodyPointDistance) / layout.repeatedBodyPointDistance);
            const trackIndex = motion.bodySequence[bodyOrdinal % motion.bodySequence.length];
            const track = motion.body[trackIndex];
            if (!track) throw new Error(`skin ${skinId} body sequence points outside its track list`);
            const uvs = frameUvs(texture, snakeTimedFrame(track, tick));
            const p0 = points[index];
            const p1 = points[index + 1];
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const length = Math.hypot(dx, dy);
            const nx = length > 1e-6 ? (-dy / length) * halfWidth : 0;
            const ny = length > 1e-6 ? (dx / length) * halfWidth : halfWidth;
            vert = this.writeVert(record, vert, p0.x + nx, p0.y + ny, uvs[0], uvs[1]);
            vert = this.writeVert(record, vert, p0.x - nx, p0.y - ny, uvs[2], uvs[3]);
            vert = this.writeVert(record, vert, p1.x + nx, p1.y + ny, uvs[4], uvs[5]);
            vert = this.writeVert(record, vert, p1.x - nx, p1.y - ny, uvs[6], uvs[7]);
        }
        for (let index = vert; index < record.capacity * VERTS_PER_SEGMENT; index += 1) {
            record.positions[index * 3] = 0;
            record.positions[index * 3 + 1] = 0;
            record.positions[index * 3 + 2] = 0;
            record.colors[index * 4 + 3] = 0;
        }
        flushMesh(record.mesh);
    }

    private writeVert(record: SnakeMeshRecord, vert: number, x: number, y: number, u: number, v: number): number {
        record.positions.set([x, y, 0], vert * 3);
        record.uvs.set([u, v], vert * 2);
        record.colors.set([1, 1, 1, 1], vert * 4);
        return vert + 1;
    }
}
