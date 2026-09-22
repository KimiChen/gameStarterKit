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
    | "terrain" | "blocks" | "road" | "grid" | "river" | "region" | "decor" | "city" | "plate"
    | "banner" | "label";

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
    /**
     * ★ **第 ② 级刻度**：原版是 `render_layer` + `MAP_ZORDER`（留缝）+ 层内画家序**三级**，
     * 本 kit 早先只有兄弟序 ⇒ 次序取决于**谁先 render**，插一层就可能把底盖到面上。
     * 现在每层一个容器节点、按本值升序建，次序**与调用时机无关**。
     * ⚠ 值尽量照抄原版 `MAP_ZORDER`（`const.lua:105`，step=100）：
     *   `BG 100 < TERRAIN_MASK 200 < TERRAIN 300 < ROAD 900 < RIVER 1600
     *    < STATE_DEFAULT 2000 < CREATURE 3200 < RES 3400 < STATE_TOP 3800 < BUILD_TOP 3900`。
     * ⚠ BG 内部另有一套 `POLYGON_LAYER_ORDER {ground:100, desert:200, snow:300}` /
     *   `TOP_LAYER_ORDER {101, 201, 301}`（§1.3）—— 那是**层内**次序，这里压进 100..121 的缝里。
     * ⛔ 留缝是故意的：新增层往缝里插，⛔ 别把相邻值排满。
     */
    readonly zorder: number;
}

export const MAPO_LAYERS: readonly LayerGate[] = Object.freeze([
    // ★ 地表底：**一块 10×10 格 + 一张底纹整数次 GL_REPEAT**（原版做法，MAPORIGINAL-2D §1.4）。
    //   ⛔ 早先是「8 粗类 × 4 变体的逐格菱形贴片」——那是本仓自创的，M2-B1 已换掉。
    { id: "terrain", hideAtLod: 2, showFromLod: 0, streamed: true, implemented: true, zorder: 100 },
    // ⚠ 网格线：**尚未实现**（M1-B1 止血）。此前写着 implemented: true 而渲染器里一行都没有，
    //   违反本文件抬头立的规矩，还会向状态行与真机重放证据谎报。
    //   ⚠ 另：原版 2D 的逐格三层是 res / terrain / grid_state（MAPORIGINAL-2D §2），
    //   `grid_state` 是 AOI 驱动的**归属态叠图**，⛔ 不是线框网格；
    //   「原版有没有线框网格层」目前**无证据** ⇒ 要做之前先补证据，⛔ 别照 sgzzmap 抄了当原版。
    { id: "grid", hideAtLod: 1, showFromLod: 0, streamed: true, implemented: false, zorder: 950 },
    // ★ snow / desert 的 block 级地貌带：**叠**在地表底之上（§1.3，⛔ 不是替换）。
    //   与 terrain 同档：它就是地表的一部分。
    { id: "blocks", hideAtLod: 2, showFromLod: 0, streamed: true, implemented: true, zorder: 110 },
    // ★ 道路：原版路片。⚠ 在地表与河流**之间**（原版 MAP_ZORDER：TERRAIN 300 < ROAD 900 < RIVER 1600）。
    //   ⚠ 路是**纯表现层**，⛔ 别拿它做通行/行军判定。
    { id: "road", hideAtLod: 2, showFromLod: 0, streamed: true, implemented: true, zorder: 900 },
    // ★ 河流：原版水面多边形。⚠ 必须在地表**之上**、山族件与摆件**之下**
    //   （原版 MAP_ZORDER：TERRAIN 300 < RIVER 1600 < RES 3400）。
    //   ⚠ 比逐格摆件多盖一档：远档看水网走向最有用（与 region 同档）。
    { id: "river", hideAtLod: 3, showFromLod: 0, streamed: true, implemented: true, zorder: 1600 },
    { id: "plate", hideAtLod: MAPO_LOD_MAX, showFromLod: 3, streamed: false, implemented: true, zorder: 90 },
    // ★ 摆件：**原版切片**（城/营/建筑/资源地物）立在格上。超出菱形，必须画在地表之上、按画家序排。
    // ★ 区域件（多格地形：山脉/林丛/散落）。⚠ 比逐格摆件多盖一档：远档看山林轮廓最有用。
    { id: "region", hideAtLod: 3, showFromLod: 0, streamed: true, implemented: true, zorder: 300 },
    { id: "decor", hideAtLod: 2, showFromLod: 0, streamed: true, implemented: true, zorder: 3400 },
    // ★ 城址件：原版 15 个件、249 座真坐标（§5）。⚠ 在资源件**之上**
    //   （原版 MAP_ZORDER：RES 3400 < BUILD_TOP 3900）。
    //   ⚠ 比资源件多盖一档（hideAtLod 3）：远档一眼看城的分布最有用，而件只有 249 座、
    //   一屏撑死几座，⛔ 开销不是这一层的瓶颈。
    { id: "city", hideAtLod: 3, showFromLod: 0, streamed: false, implemented: true, zorder: 3900 },
    // ★ 地名：原版 canton/area 名表。⚠ 全档都画（远档大区、近档郡），⛔ 两档不要一起画。
    { id: "label", hideAtLod: MAPO_LOD_MAX, showFromLod: 0, streamed: false, implemented: true, zorder: 4000 },
    // ── 以下**尚未实现**：位置留着，⛔ 别当成能用 ──────────────────────────────
    // banner 目标旗要服务端的归属数据。
    // ⚠ banner 从 3900 挪到 3950：3900 是原版 BUILD_TOP，已给城址件；旗标在建筑**之上**。
    { id: "banner", hideAtLod: 1, showFromLod: 0, streamed: false, implemented: false, zorder: 3950 },
] as const);

/**
 * 每个层由**哪个渲染器字段**负责；`null` = 尚无渲染器。
 *
 * ★ 这张表是 M1-B1 的止血闸：机检拿它去扫 `MapOriginalWorldView.ts`，要求
 *   ① `implemented` ⟺ 这里非 null；② 非 null 的字段名在视图里出现后**不远处就有 `.render(`**
 *      （⚠ 不能只认 `this.x?.render(`：`blocks` 是一**组**渲染器，走的是 `reduce` 遍历）。
 *   ⛔ 新增层若写了 `implemented: true` 却没渲染器，用例立刻红 —— 将来的层自动受管。
 */
export const MAPO_LAYER_RENDERER: Readonly<Record<MapoLayerId, string | null>> = Object.freeze({
    terrain: "renderer",
    blocks: "blockRenderers",
    road: "roadRenderer",
    grid: null,
    river: "riverRenderer",
    plate: "farRenderer",
    region: "regionRenderer",
    decor: "decorRenderer",
    city: "cityRenderer",
    label: "labelRenderer",
    banner: null,
});

/**
 * 层 id → 第 ② 级刻度，**升序**。⚠ 这是建容器节点的次序真源，
 * ⛔ 别再靠「谁先 render 谁在下面」—— 那正是早先地表底盖住路/河/山的原因。
 */
export const MAPO_LAYER_ORDER: readonly MapoLayerId[] =
    Object.freeze(MAPO_LAYERS.slice().sort((a, b) => a.zorder - b.zorder).map((l) => l.id));

/** 某层的第 ② 级刻度。 */
export function mapoLayerZorder(id: MapoLayerId): number {
    const gate = MAPO_LAYERS.find((l) => l.id === id);
    if (!gate) throw new RangeError(`MAPO unknown layer ${id}`);
    return gate.zorder;
}

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
