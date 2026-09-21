/**
 * 分层门控：每一档 LOD 建哪些层。与 docs 的表一一对应，⛔ 改了要同步改表。
 * 取自原作 viewport_lod 的逐档 gate（LOD_3 关行军细线、LOD_2 关目标旗、LOD_4 切鸟瞰）。
 */
import { SGZZ_BIRDVIEW_LOD, SGZZ_LOD_MAX } from "../../../shared/kits/sgzzmap/api/hexmap/index";

export type SgzzLayerId =
    | "terrain" | "grid" | "territory" | "border" | "decor"
    | "marchLine" | "marchDetail" | "banner" | "birdview" | "plate" | "label";

interface LayerGate {
    readonly id: SgzzLayerId;
    /** LOD > hideAtLod 时不建。 */
    readonly hideAtLod: number;
    /** LOD < showFromLod 时不建。 */
    readonly showFromLod: number;
    /** 是否按 chunk 流式建。 */
    readonly streamed: boolean;
    /**
     * 渲染层**真的会建它**吗。
     * ⚠ false = 只在表里占个位、尚无实现。`sgzzLayerVisible` 对它恒回 false ——
     * ⛔ 不许出现「门控说该建、渲染器根本没写」的两张皮：真机重放发现 LOD0 没有网格线，
     * 就是因为表里 grid 写着 ✔ 而 SgzzMapRenderer 里一行都没有。
     */
    readonly implemented: boolean;
}

export const SGZZ_LAYERS: readonly LayerGate[] = Object.freeze([
    { id: "terrain", hideAtLod: 2, showFromLod: 0, streamed: true, implemented: true },
    { id: "grid", hideAtLod: 1, showFromLod: 0, streamed: true, implemented: true },
    { id: "territory", hideAtLod: 3, showFromLod: 0, streamed: true, implemented: true },
    { id: "border", hideAtLod: 2, showFromLod: 0, streamed: true, implemented: true },
    { id: "marchLine", hideAtLod: 4, showFromLod: 0, streamed: false, implemented: true },
    { id: "marchDetail", hideAtLod: 2, showFromLod: 0, streamed: false, implemented: true },
    { id: "birdview", hideAtLod: SGZZ_LOD_MAX, showFromLod: SGZZ_BIRDVIEW_LOD, streamed: false, implemented: true },
    { id: "plate", hideAtLod: SGZZ_LOD_MAX, showFromLod: 3, streamed: false, implemented: true },
    // ── 以下三层**尚未实现**：位置留着，但渲染器里没有它们，⛔ 别当成能用 ──────────────
    // decor（摆件/地标）与 banner（目标旗）等地块图集人工策展；label（地名）还缺地名数据。
    { id: "decor", hideAtLod: 1, showFromLod: 0, streamed: true, implemented: false },
    { id: "banner", hideAtLod: 1, showFromLod: 0, streamed: false, implemented: false },
    { id: "label", hideAtLod: 2, showFromLod: 0, streamed: false, implemented: false },
] as const);

/** 表里写着但还没实现的层。⚠ 加实现时把 implemented 翻成 true，这个列表会自动缩短。 */
export const SGZZ_PLANNED_LAYERS: readonly SgzzLayerId[] =
    Object.freeze(SGZZ_LAYERS.filter((l) => !l.implemented).map((l) => l.id));

/** 这一档要不要建这层。⚠ 未实现的层恒 false —— 门控说该建而渲染器没写，是两张皮。 */
export function sgzzLayerVisible(id: SgzzLayerId, lod: number): boolean {
    const gate = SGZZ_LAYERS.find((l) => l.id === id);
    if (!gate) throw new RangeError(`SGZZ unknown layer ${id}`);
    return gate.implemented && lod >= gate.showFromLod && lod <= gate.hideAtLod;
}
export function sgzzVisibleLayers(lod: number): SgzzLayerId[] {
    return SGZZ_LAYERS.filter((l) => sgzzLayerVisible(l.id, lod)).map((l) => l.id);
}
/** 近档（逐格铺菱形）还是远档（底图 + 聚合色块）。 */
export function sgzzIsNearField(lod: number): boolean {
    return sgzzLayerVisible("terrain", lod);
}
/** 该向服务端要逐格数据，还是要分块摘要。 */
export function sgzzAoiMode(lod: number): "detail" | "summary" {
    return lod >= SGZZ_BIRDVIEW_LOD ? "summary" : "detail";
}
