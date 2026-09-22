/**
 * 分层门控：每一档 LOD 建哪些层。⛔ 改了要同步改 kit README 的层表。
 * ⚠ 档界是**本仓自建**的（按 scale 分档 + 滞回），⛔ 不是原作 viewport_lod：
 *   原作按相机距离分档，且 `LOD_4` 那条路在 2D 下永远触发不到（`on_vp_scale_change`
 *   第一条就是 `GETFIELD self.is_in_2d_scene → TEST → RETURN`）。
 *   本 kit 的远档底图实为 `showFromLod: 3`（见下表 plate 行），⛔ 不是「LOD_4 起」。
 *
 * ⚠ v1 只有「看得见的地图」这几层：⛔ 无领地/描边/行军/远档聚合（那些要服务端）。
 */
import { MAPO_LOD_MAX } from "../../../shared/kits/mapOriginal/api/hexmap/index";

export type MapoLayerId =
    | "terrain" | "grid" | "river" | "region" | "decor" | "plate" | "banner" | "label";

interface LayerGate {
    readonly id: MapoLayerId;
    /** LOD > hideAtLod 时不建。 */
    readonly hideAtLod: number;
    /** LOD < showFromLod 时不建。 */
    readonly showFromLod: number;
    readonly streamed: boolean;
    /**
     * 渲染层**真的会建它**吗。
     * ⚠ false = 只占位、尚无实现，`mapoLayerVisible` 对它恒回 false ——
     * ⛔ 不许出现「门控说该建、渲染器根本没写」的两张皮（sgzzmap 真机重放为此红过一次）。
     */
    readonly implemented: boolean;
}

export const MAPO_LAYERS: readonly LayerGate[] = Object.freeze([
    { id: "terrain", hideAtLod: 2, showFromLod: 0, streamed: true, implemented: true },
    // ⚠ 网格线：**尚未实现**（M1-B1 止血）。此前写着 implemented: true 而渲染器里一行都没有，
    //   违反本文件抬头立的规矩，还会向状态行与真机重放证据谎报。
    //   ⚠ 另：原版 2D 的逐格三层是 res / terrain / grid_state（MAPORIGINAL-2D §2），
    //   `grid_state` 是 AOI 驱动的**归属态叠图**，⛔ 不是线框网格；
    //   「原版有没有线框网格层」目前**无证据** ⇒ 要做之前先补证据，⛔ 别照 sgzzmap 抄了当原版。
    { id: "grid", hideAtLod: 1, showFromLod: 0, streamed: true, implemented: false },
    // ★ 河流：原版水面多边形。⚠ 必须在地表**之上**、山族件与摆件**之下**
    //   （原版 MAP_ZORDER：TERRAIN 300 < RIVER 1600 < RES 3400）。
    //   ⚠ 比逐格摆件多盖一档：远档看水网走向最有用（与 region 同档）。
    { id: "river", hideAtLod: 3, showFromLod: 0, streamed: true, implemented: true },
    { id: "plate", hideAtLod: MAPO_LOD_MAX, showFromLod: 3, streamed: false, implemented: true },
    // ★ 摆件：**原版切片**（城/营/建筑/资源地物）立在格上。超出菱形，必须画在地表之上、按画家序排。
    // ★ 区域件（多格地形：山脉/林丛/散落）。⚠ 比逐格摆件多盖一档：远档看山林轮廓最有用。
    { id: "region", hideAtLod: 3, showFromLod: 0, streamed: true, implemented: true },
    { id: "decor", hideAtLod: 2, showFromLod: 0, streamed: true, implemented: true },
    // ★ 地名：原版 canton/area 名表。⚠ 全档都画（远档大区、近档郡），⛔ 两档不要一起画。
    { id: "label", hideAtLod: MAPO_LOD_MAX, showFromLod: 0, streamed: false, implemented: true },
    // ── 以下**尚未实现**：位置留着，⛔ 别当成能用 ──────────────────────────────
    // banner 目标旗要服务端的归属数据。
    { id: "banner", hideAtLod: 1, showFromLod: 0, streamed: false, implemented: false },
] as const);

/**
 * 每个层由**哪个渲染器字段**负责；`null` = 尚无渲染器。
 *
 * ★ 这张表是 M1-B1 的止血闸：机检拿它去扫 `MapOriginalWorldView.ts`，要求
 *   ① `implemented` ⟺ 这里非 null；② 非 null 的字段名在视图里真的有 `.render(` 调用。
 *   ⛔ 新增层若写了 `implemented: true` 却没渲染器，用例立刻红 —— 将来的层自动受管。
 */
export const MAPO_LAYER_RENDERER: Readonly<Record<MapoLayerId, string | null>> = Object.freeze({
    terrain: "renderer",
    grid: null,
    river: "riverRenderer",
    plate: "farRenderer",
    region: "regionRenderer",
    decor: "decorRenderer",
    label: "labelRenderer",
    banner: null,
});

/** 表里写着但还没实现的层。⚠ 加实现时把 implemented 翻成 true，这个列表会自动缩短。 */
export const MAPO_PLANNED_LAYERS: readonly MapoLayerId[] =
    Object.freeze(MAPO_LAYERS.filter((l) => !l.implemented).map((l) => l.id));

export function mapoLayerVisible(id: MapoLayerId, lod: number): boolean {
    const gate = MAPO_LAYERS.find((l) => l.id === id);
    if (!gate) throw new RangeError(`MAPO unknown layer ${id}`);
    return gate.implemented && lod >= gate.showFromLod && lod <= gate.hideAtLod;
}

export function mapoVisibleLayers(lod: number): MapoLayerId[] {
    return MAPO_LAYERS.filter((l) => mapoLayerVisible(l.id, lod)).map((l) => l.id);
}

/** 近档（逐格铺菱形）还是远档（整幅底图）。 */
export function mapoIsNearField(lod: number): boolean {
    return mapoLayerVisible("terrain", lod);
}
