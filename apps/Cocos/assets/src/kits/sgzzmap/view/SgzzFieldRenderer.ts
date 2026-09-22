/**
 * 连续覆盖场的渲染（美术规范-过渡区域 v2）：逐块烘权重 → 传两张 RGBA8 → 自定义着色器混 8 路地形。
 *
 * ⚠ 一块一个材质实例：权重图是逐块的，⛔ 不能共用材质（setProperty 会互相覆盖）。
 * ⚠ 每帧只烘 SGZZ_FIELD_BAKE_BUDGET 块：一次全烘会卡住主线程，
 *   表现是进图时长时间白屏。⛔ 不要为了「一次到位」去掉这个闸。
 * ⚠ 权重图必须 LINEAR + CLAMP：默认可能是 POINT，放大后会露出烘焙分辨率的方块；
 *   REPEAT 则会让块边采到对面。
 * ⚠ A 通道是**权重**不是透明度，⛔ 不要开预乘。
 */
import { Material, Node, Texture2D, Vec4 } from "cc";
import { bakeSgzzField } from "../logic/sgzzField";
import {
    SGZZ_FIELD_BAKE_BUDGET, SGZZ_FIELD_CACHE_LIMIT, sgzzFieldBakeRect, sgzzFieldChunkQuad,
    sgzzFieldChunksFor, sgzzFieldTierFor, type SgzzFieldChunk,
} from "../logic/sgzzFieldChunks";
import { sgzzTerrainIdAt } from "../logic/sgzzTerrain";
import { buildSgzzPolyMesh } from "../logic/sgzzMesh";
import type { SgzzmapWorldLogic } from "../logic/SgzzmapWorldLogic";
import type { SgzzArtResources } from "./SgzzArtResources";
import { createSgzzBatch, destroySgzzBatch, type SgzzBatch } from "./SgzzMeshBatch";

/** 一次平铺覆盖多少世界单位。⚠ 太小会看出重复，太大纹理会糊。 */
const TILE_WORLD = 160;
/** 无缝图集的排布（与 pack-atlas.py 的 FIELD_COLS/ROWS 一致）。 */
const ATLAS_COLS = 4, ATLAS_ROWS = 2;
/** 岸条沿岸线的循环长度（世界单位）。⚠ 太短会看出重复，太长纹理会拉糊。 */
const SHORE_TILE_WORLD = 900;

interface Cached {
    readonly chunk: SgzzFieldChunk;
    readonly material: Material;
    readonly w0: Texture2D;
    readonly w1: Texture2D;
    readonly coast: Texture2D;
    batch: SgzzBatch | null;
    used: number;
}

export class SgzzFieldRenderer {
    private readonly cache = new Map<number, Cached>();
    private tick = 0;
    private disposed = false;
    /**
     * 上一帧视野内的块是不是**全部**烘好了。
     * ⚠ 没铺满之前 ⛔ 不能撤掉逐格地表：未烘的块什么都不画 ⇒ 那一片是**全黑**，
     *   摆件浮在黑底上（真机 run 27 实证）。每帧只烘 1 块，填满要十几帧。
     */
    private covered = false;

    constructor(private readonly root: Node, private readonly art: SgzzArtResources | null) {}

    /** 能不能用：缺 effect 或缺无缝图集就退回逐格地表。⛔ 不要半开着跑。 */
    get ready(): boolean {
        return !this.disposed && !!this.art?.fieldEffect && !!this.art?.fieldAtlas;
    }

    render(logic: SgzzmapWorldLogic): void {
        if (!this.ready) return;
        this.tick += 1;
        const cam = logic.camera;
        const halfW = cam.width / cam.scale / 2, halfH = cam.height / cam.scale / 2;
        // ⚠ 按档取块：LOD2 用 80 格的大块（36 块 → 6 块），⛔ 一套尺寸吃遍所有档会烘 1.1 秒
        const wanted = sgzzFieldChunksFor(cam.x, cam.y, halfW, halfH, sgzzFieldTierFor(cam.lod));

        // ⚠ 不在本帧视野里的块（含**别的档**的块）要停掉节点，⛔ 否则它们还在画：
        //   切档瞬间旧档的块全留着 —— 真机 run 32 在 LOD2 上同时挂着 26 块（应为 8）。
        //   只停用不销毁 ⇒ 来回缩放不用重烘（单块 31 ms）。
        const want = new Set(wanted.map((c) => c.key));
        for (const c of this.cache.values()) {
            if (c.batch) c.batch.node.active = want.has(c.chunk.key);
        }

        let baked = 0, missing = 0;
        for (const chunk of wanted) {
            const hit = this.cache.get(chunk.key);
            if (hit) { hit.used = this.tick; continue; }
            // ⚠ 分帧烘：这一帧的预算用完就先不画那块，下一帧接着来
            if (baked >= SGZZ_FIELD_BAKE_BUDGET) { missing += 1; continue; }
            const made = this.bake(chunk);
            if (made) { this.cache.set(chunk.key, made); baked += 1; } else missing += 1;
        }
        this.covered = missing === 0;
        this.evict(wanted);
    }

    private bake(chunk: SgzzFieldChunk): Cached | null {
        const art = this.art;
        if (!art?.fieldEffect || !art.fieldAtlas) return null;
        const { rect, inner } = sgzzFieldBakeRect(chunk);
        const field = bakeSgzzField(sgzzTerrainIdAt, rect, inner, 1500, 1500);

        const w0 = this.makeWeightTexture(field.weights0, field.width, field.height);
        const w1 = this.makeWeightTexture(field.weights1, field.width, field.height);
        const coast = this.makeWeightTexture(field.coast, field.width, field.height);
        const material = new Material();
        material.initialize({ effectAsset: art.fieldEffect });
        material.setProperty("atlasTex", art.fieldAtlas);
        material.setProperty("weights0", w0);
        material.setProperty("weights1", w1);
        material.setProperty("coastTex", coast);
        if (art.shoreStrip) {
            // ⚠ 横向必须 REPEAT（沿岸循环），纵向 CLAMP（上下是透明的过渡）——
            //   ⛔ meta 里统一写的是 clamp，只能运行时改。
            art.shoreStrip.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.CLAMP_TO_EDGE);
            material.setProperty("shoreTex", art.shoreStrip);
        }
        // (minX, minY, 1/width, 1/height) —— 着色器据此把 map 坐标换成权重图 UV
        // ⚠ 必须传 Vec4：⛔ 传 JS 数组 setProperty 会**静默失败**，uniform 留 0 ⇒
        //   fract(v_map/0) = NaN、cellOrigin 除以 0 ⇒ 整片地表渲成一块纯色（真机 run 24 实证）。
        material.setProperty("chunkRect", new Vec4(chunk.minX, chunk.minY, 1 / chunk.size, 1 / chunk.size));
        material.setProperty("tileWorld", new Vec4(TILE_WORLD, TILE_WORLD, ATLAS_COLS, ATLAS_ROWS));
        // (开关, 沿岸循环长度, 不透明度下限, 上限) —— ⚠ 缺岸条贴图就关掉，⛔ 别拿 grey 兜底画出灰带
        material.setProperty("shoreParams", new Vec4(
            art.shoreStrip ? 1 : 0, SHORE_TILE_WORLD, 0.65, 0.80));

        const geometry = buildSgzzPolyMesh([{
            points: sgzzFieldChunkQuad(chunk), rgba: [1, 1, 1, 1],
        }]);
        const batch = createSgzzBatch(this.root, `sgzz-field-${chunk.tier}_${chunk.cx}_${chunk.cy}`,
            geometry, material, 0);
        return { chunk, material, w0, w1, coast, batch, used: this.tick };
    }

    private makeWeightTexture(data: Uint8Array, width: number, height: number): Texture2D {
        const tex = new Texture2D();
        tex.reset({ width, height, format: Texture2D.PixelFormat.RGBA8888, mipmapLevel: 1 });
        tex.uploadData(data);
        // ⚠ LINEAR + CLAMP：POINT 会露方块，REPEAT 会让块边采到对面
        tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
        tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
        return tex;
    }

    /** 超出缓存上限就淘汰最久未用的，⚠ 当前可见的块永不淘汰。 */
    private evict(wanted: readonly SgzzFieldChunk[]): void {
        if (this.cache.size <= SGZZ_FIELD_CACHE_LIMIT) return;
        const keep = new Set(wanted.map((c) => c.key));
        const spare = [...this.cache.values()].filter((c) => !keep.has(c.chunk.key))
            .sort((a, b) => a.used - b.used);
        for (const c of spare) {
            if (this.cache.size <= SGZZ_FIELD_CACHE_LIMIT) break;
            this.drop(c);
            this.cache.delete(c.chunk.key);
        }
    }

    private drop(c: Cached): void {
        destroySgzzBatch(c.batch); c.batch = null;
        c.material.destroy();
        c.w0.destroy(); c.w1.destroy(); c.coast.destroy();
    }

    /** 切到远档：整批撤掉。 */
    clear(): void {
        for (const c of this.cache.values()) this.drop(c);
        this.cache.clear();
        this.covered = false;
    }

    dispose(): void {
        this.disposed = true;
        this.clear();
    }

    /** 视野内的块是否已全部烘好。⚠ false 时调用方**必须**保留逐格地表垫底，⛔ 否则是黑的。 */
    get isCovered(): boolean { return this.covered; }
    /** ⚠ 只给用例/诊断用：当前缓存了几块。 */
    get cached(): number { return this.cache.size; }
}
