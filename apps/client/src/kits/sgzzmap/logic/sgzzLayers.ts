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
}

export const SGZZ_LAYERS: readonly LayerGate[] = Object.freeze([
    { id: "terrain", hideAtLod: 2, showFromLod: 0, streamed: true },
    { id: "grid", hideAtLod: 1, showFromLod: 0, streamed: true },
    { id: "territory", hideAtLod: 3, showFromLod: 0, streamed: true },
    { id: "border", hideAtLod: 2, showFromLod: 0, streamed: true },
    { id: "decor", hideAtLod: 1, showFromLod: 0, streamed: true },
    { id: "marchLine", hideAtLod: 4, showFromLod: 0, streamed: false },
    { id: "marchDetail", hideAtLod: 2, showFromLod: 0, streamed: false },
    { id: "banner", hideAtLod: 1, showFromLod: 0, streamed: false },
    { id: "birdview", hideAtLod: SGZZ_LOD_MAX, showFromLod: SGZZ_BIRDVIEW_LOD, streamed: false },
    { id: "plate", hideAtLod: SGZZ_LOD_MAX, showFromLod: 3, streamed: false },
    { id: "label", hideAtLod: 2, showFromLod: 0, streamed: false },
] as const);

export function sgzzLayerVisible(id: SgzzLayerId, lod: number): boolean {
    const gate = SGZZ_LAYERS.find((l) => l.id === id);
    if (!gate) throw new RangeError(`SGZZ unknown layer ${id}`);
    return lod >= gate.showFromLod && lod <= gate.hideAtLod;
}
export function sgzzVisibleLayers(lod: number): SgzzLayerId[] {
    return SGZZ_LAYERS.filter((l) => lod >= l.showFromLod && lod <= l.hideAtLod).map((l) => l.id);
}
/** 近档（逐格铺菱形）还是远档（底图 + 聚合色块）。 */
export function sgzzIsNearField(lod: number): boolean {
    return sgzzLayerVisible("terrain", lod);
}
/** 该向服务端要逐格数据，还是要分块摘要。 */
export function sgzzAoiMode(lod: number): "detail" | "summary" {
    return lod >= SGZZ_BIRDVIEW_LOD ? "summary" : "detail";
}
