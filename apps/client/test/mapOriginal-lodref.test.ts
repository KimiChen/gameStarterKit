import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
    MAPO_LAYERS, MAPO_PLANNED_LAYERS, mapoLayerVisible, type MapoLayerId,
} from "../src/kits/mapOriginal/logic/mapoLayers";
import { MAPO_LOD_MAX } from "../src/shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_LODREF_CFG, MAPO_LODREF_LAYERS, MAPO_LODREF_SHA256,
} from "../src/shared/kits/mapOriginal/content/lodref.data";

/**
 * ★ N3 第 2 步：LOD 层**相对次序**交叉校验 —— 本 kit 的层 ↔ 原版 `map_layer_lod_cfg`。
 *   ⛔ 断言的是**相对次序 / 类别一致**，不断言档界相等 —— 档界已查明是 **3D 侧**的
 *   （相机表 `lod_zoom_*_divide_defind_cfg`，MAPORIGINAL-2D §8.2），2D 被 `is_in_2d_scene`
 *   短路、`_lod` 恒 0 ⇒ 2D 本来就没有档界可对齐 ⇒ ⛔ 这里一个 `hideAtLod` 数字都不钉。
 * ⚠ 只以 **cfg 表**（64 层 5 档）为准：消费方函数名 `get_map_layer_lod_cfg`
 *   （[干净集] forest_grid_layer_view.lua:21）+ 旧档自述过时 + 两表 7 层冲突；
 *   `map_layer_lod`（37 层 3 档）仅留档与冲突登记。
 */

const KIT_DATA = new URL("../../kits/mapOriginal/data/lodref.json", import.meta.url);

type OrigClass = "never" | "near" | "always" | "other";
/** kit 侧门类：static=近档起就在；far=远档才建（plate）；absent=未实现；exempt=明示豁免。 */
type KitClass = "static" | "far" | "absent" | "exempt";

interface Mapping {
    readonly kit: MapoLayerId;
    /** 对应的原版 `map_layer_lod_cfg` 层 key。 */
    readonly orig: string;
    /** 期望的原版类别（由数据推导后与这里对钉，钉错即红）。 */
    readonly cls: OrigClass;
    readonly kitCls: KitClass;
    /** 映射依据（⛔ 不许空 —— 没有依据的映射等于没校）。 */
    readonly basis: string;
    /** 原版恒隐但本 kit 实现了 ⇒ 必须写豁免理由。 */
    readonly exempt?: string;
}

// ── 本 kit 层 → 原版层 映射表（依据逐条写死，⛔ 改映射先改依据） ─────────────
const MAPPING: readonly Mapping[] = [
    // §1.4：地表底 = 一块 10×10 格 + 底纹整数次 GL_REPEAT，对应原版 ground（背景底图）。
    //   旁证：原版逐格三层之一的 terrain（地形）也全档显示 [0,0,0,0,0]。
    { kit: "terrain", orig: "ground", cls: "never", kitCls: "static",
      basis: "地表底=原版 ground 背景底图（§1.4 原版做法）" },
    // 雪/沙块带 = ground_snow/ground_desert.bytes，§1.3「叠在地表底之上」⇒ 与 ground 同族。
    { kit: "blocks", orig: "ground", cls: "never", kitCls: "static",
      basis: "雪/沙块带是 ground 族的地表叠层（§1.3 叠不是替）" },
    // 远档整幅底图 ↔ 原版 birdview（过渡层地表，全档显示）。⚠ 鸟瞰在 2D 恒不生效（§7），
    //   plate 只作「远档静态底」参照 ⇒ kitCls=far，不参与「近档必须在」的断言。
    { kit: "plate", orig: "birdview", cls: "never", kitCls: "far",
      basis: "远档整幅底图 ↔ 过渡层地表 birdview；鸟瞰 2D 恒不生效（§7）" },
    // 同名同物：42,018 片 road_info.bytes 摆放表（M3-B1）。原版 road 第 2 档起隐。
    { kit: "road", orig: "road", cls: "near", kitCls: "static",
      basis: "同名同物（roads.bin 42,018 片已 [实测]）" },
    // ⚠ 特例：原版 river 层配置**恒隐**（两张表一致 [1,1,…] —— 水面由 terrain/ground 画，
    //   独立河层被配置压住）。本 kit 的河层是用原版 _polygon_group/_top_group 资产自建的
    //   （§1.6），是明示的内容决策 ⇒ 豁免「恒隐 ⇒ 未实现」的规则，但理由必须留字。
    { kit: "river", orig: "river", cls: "always", kitCls: "exempt",
      basis: "同名层",
      exempt: "原版 river 层恒隐（水面由 terrain/ground 画）；本 kit 用原版 _polygon_group"
              + " 资产自建河层（§1.6），属明示的内容决策" },
    // 多格地形件 = 山族（48..61）⇒ 原版 mountain（山体层，全档显示）。
    //   ⚠ 不取 mountain_3d [0,0,0,0,1] —— 那是 3D 侧（2D kit 只用 2D 素材的机检同源判据）。
    { kit: "region", orig: "mountain", cls: "never", kitCls: "static",
      basis: "山族多格件 = mountain 山体层；mountain_3d 是 3D 侧不取" },
    // 摆件层主体 = res_field 资源地物（原版第四道门就是 res_field 画的）。
    //   ⚠ 不取 decorate（装饰层 [1,1,1,1,1] 恒隐的特效点缀）。
    { kit: "decor", orig: "res", cls: "never", kitCls: "static",
      basis: "摆件层主体是 res_field 资源地物；decorate 是恒隐特效层不取" },
    // 城址件 = 城墙/城门件 ⇒ big_city_wall（大城城墙层，全档显示）/ city_gate_wall（同）。
    //   旁证 big_city_house（民居 [0,0,0,1,1] 远档隐）：原版自己也是「远档只留大体量」。
    { kit: "city", orig: "big_city_wall", cls: "never", kitCls: "static",
      basis: "城址件=城墙/城门（big_city_wall/city_gate_wall 全档显示）；"
              + "big_city_house 远档隐作「远档只留大体量」旁证" },
    // 地名：原版沙盘大区名 sandbox_area_name **只在最远档出**（[1,1,1,1,0] + lod0Hide），
    //   郡名 sandbox_canton_name 恒隐。本 kit 的三带（近城名/中郡/远大区，N2）里
    //   「远档出大区名」与原版同向；郡名档是 N2 明示的内容决策。
    { kit: "label", orig: "sandbox_area_name", cls: "other", kitCls: "static",
      basis: "大区名 ↔ sandbox_area_name（仅最远档出，同向）；郡名档是 N2 内容决策" },
    // [disasm] GroundLayerView.line_layer 是 ground 的静态子层；与 forest_grid 无关。
    { kit: "grid", orig: "ground", cls: "never", kitCls: "static",
      basis: "ground_layer_view:_create_line_data → GROUND_GRID_LINE，MAP_ZORDER.FRAME=1400" },
    // 目标旗 ↔ grid_state（占领状态层）：AOI 驱动的归属态叠图，要服务端 ⇒ v1 明确不做；
    //   原版自己也是恒隐配置（两张表一致全 1）。
    { kit: "banner", orig: "grid_state", cls: "always", kitCls: "absent",
      basis: "banner ↔ grid_state 归属态叠图，要服务端 AOI（v1 不做，§7）" },
];

/** 原版层类别推导：`hide` 全 0 且非 lod0 特判 = 恒显；全 1 = 恒隐；前 0 后 1 = 近显远隐。 */
function origClass(row: { lod0Hide: boolean; hide: readonly number[] }): OrigClass {
    const hide = row.hide;
    if (hide.every((v) => v === 0)) return row.lod0Hide ? "other" : "never";
    if (hide.every((v) => v === 1)) return "always";
    const first = hide.indexOf(1);
    if (!row.lod0Hide && first > 0 && hide.slice(first).every((v) => v === 1)) return "near";
    return "other";
}

/** never = Infinity（恒显），near = 首个隐藏档，其余不参与排序。 */
function firstHide(row: { hide: readonly number[] }): number {
    const i = row.hide.indexOf(1);
    return i < 0 ? Infinity : i;
}

const cfgBy = new Map<string, (typeof MAPO_LODREF_CFG)[number]>();
for (const r of MAPO_LODREF_CFG) cfgBy.set(r.key, r);
const gateBy = new Map(MAPO_LAYERS.map((l) => [l.id, l]));

test("mapOriginal LOD 参考：shared TS ↔ kit 留档 lodref.json 逐字段互证（含 sha256）", () => {
    const doc = JSON.parse(readFileSync(KIT_DATA, "utf8")) as {
        schemaVersion: number; contentSha256: string;
        legacyOnly: string[]; cfgOnly: string[]; conflicts: string[];
        legacy: { key: string; name: string; desc: string; hide: number[] }[];
        cfg: { key: string; name: string; lod0Hide: boolean; hide: number[] }[];
    };
    assert.equal(doc.schemaVersion, 1);
    // ★ canonical payload 必须与 build_lodref.py 同序同分隔（key 排序、字段序固定）
    const legacy = MAPO_LODREF_LAYERS.map((r) => ({ key: r.key, name: r.name, desc: r.desc,
                                                     hide: [...r.hide] }));
    const cfg = MAPO_LODREF_CFG.map((r) => ({ key: r.key, name: r.name, lod0Hide: r.lod0Hide,
                                              hide: [...r.hide] }));
    assert.deepEqual(legacy, doc.legacy, "旧档 37 层 TS ↔ json");
    assert.deepEqual(cfg, doc.cfg, "现行 64 层 TS ↔ json");
    const sha = createHash("sha256")
        .update(JSON.stringify({ legacy, cfg }), "utf8").digest("hex");
    assert.equal(sha, MAPO_LODREF_SHA256, "TS 侧的 contentSha256");
    assert.equal(sha, doc.contentSha256, "json 留档的 contentSha256");
});

test("mapOriginal LOD 参考：两张原版表的结构与关系钉死（37 vs 64）", () => {
    // 结构：档数 / 值域 / 层 key == 行内名字
    assert.equal(MAPO_LODREF_LAYERS.length, 37, "map_layer_lod 37 层");
    assert.equal(MAPO_LODREF_CFG.length, 64, "map_layer_lod_cfg 64 层");
    for (const r of MAPO_LODREF_LAYERS) {
        assert.equal(r.hide.length, 3, `旧档 ${r.key} 不是 3 档`);
        assert.equal(r.name, r.key);
        assert.ok(r.desc.length > 0, `旧档 ${r.key} 缺中文说明`);
    }
    for (const r of MAPO_LODREF_CFG) {
        assert.equal(r.hide.length, 5, `cfg ${r.key} 不是 5 档`);
        assert.equal(r.name, r.key);
        for (const v of r.hide) assert.ok(v === 0 || v === 1, `cfg ${r.key} hide 值 ${v}`);
    }
    // ★ 关系：35 层重叠；旧档独有 2；现行独有 29 —— 两表不是「同一份数据的两种粒度」
    const lk = new Set<string>(MAPO_LODREF_LAYERS.map((r) => r.key));
    const ck = new Set<string>(MAPO_LODREF_CFG.map((r) => r.key));
    const both = [...lk].filter((k) => ck.has(k));
    assert.equal(both.length, 35, "两表重叠层数");
    assert.deepEqual([...lk].filter((k) => !ck.has(k)).sort(),
        ["barn_decorate", "birdview_mountain"], "旧档独有层");
    assert.equal([...ck].filter((k) => !lk.has(k)).length, 29, "现行独有层数");
    // ★ 冲突层（旧档 3 档 ≠ 现行前 3 档，逐前缀比对）—— 逐字钉死，多一层少一层都要人看：
    //   这 7 层坐实「旧档过时」（birdview_mountain 的 desc 自述「PK19 改了，待删除」）。
    const legacyBy = new Map<string, (typeof MAPO_LODREF_LAYERS)[number]>();
    for (const r of MAPO_LODREF_LAYERS) legacyBy.set(r.key, r);
    const conflicts = both.filter((k) =>
        legacyBy.get(k)!.hide.join() !== cfgBy.get(k)!.hide.slice(0, 3).join()).sort();
    assert.deepEqual(conflicts,
        ["birdview_grid_state", "flammable", "map_army", "newbie_army",
            "official_road", "road", "spot"],
        "两表冲突层清单");
    // ⚠ 冲突里 road 在列：旧档说恒显、现行说第 2 档起隐 —— 交叉校验只以 cfg 为准，
    //   且「road 近档显示中远档隐」与旧档也不矛盾到不能调和（档界未知），但映射只查 cfg。
    // ★ NEXT.md §5 点名的「动态层、全档隐藏」名录必须在数据里就是恒隐
    for (const k of ["creature", "bullet", "grid_state", "map_npc_army", "detect_army",
                     "fish", "spot", "decorate"]) {
        assert.equal(origClass(cfgBy.get(k)!), "always", `${k} 应是恒隐动态层`);
    }
});

test("mapOriginal LOD 交叉校验：映射完备且类别与原版一致（相对次序，⛔ 不钉档界）", () => {
    // ★ 完备性：本 kit 每一层都必须在映射表里出现且只出现一次 —— 新增层漏登记即红
    assert.deepEqual(MAPPING.map((m) => m.kit).slice().sort(),
        MAPO_LAYERS.map((l) => l.id).slice().sort(), "映射必须覆盖全部 kit 层");
    assert.equal(new Set(MAPPING.map((m) => m.kit)).size, MAPPING.length, "映射不许重复");

    for (const m of MAPPING) {
        assert.ok(m.basis.length > 0, `${m.kit} 缺映射依据`);
        const orig = cfgBy.get(m.orig);
        assert.ok(orig, `${m.kit} 映射的原版层 ${m.orig} 不在 map_layer_lod_cfg 里`);
        assert.equal(origClass(orig), m.cls,
            `${m.kit} → ${m.orig} 的原版类别（hide=[${orig.hide}] lod0Hide=${orig.lod0Hide}）`);
        const gate = gateBy.get(m.kit)!;
        switch (m.kitCls) {
        case "static":
            // ★ 静态层（原版恒显/近显）⇒ 本 kit 必须已实现且近档在、低 hide 档
            assert.ok(gate.implemented, `${m.kit} 对应原版静态层却没有实现`);
            assert.ok(mapoLayerVisible(m.kit, 0), `${m.kit} 近档 LOD0 必须在`);
            assert.ok(mapoLayerVisible(m.kit, 1), `${m.kit} 近档 LOD1 必须在`);
            assert.ok(gate.hideAtLod >= 2, `${m.kit} 的 hideAtLod ${gate.hideAtLod} 不像静态层`);
            break;
        case "far":
            // ★ plate：远档才建，且必须与 terrain 的退出档**连续**（地表底全档总有一层）
            assert.ok(gate.implemented);
            assert.ok(mapoLayerVisible(m.kit, MAPO_LOD_MAX), `${m.kit} 最远档必须在`);
            assert.ok(!mapoLayerVisible(m.kit, 0), `${m.kit} 近档不该建`);
            assert.equal(gateBy.get("terrain")!.hideAtLod + 1, gate.showFromLod,
                "plate 必须正好接住 terrain 退出的那一档（地表底不许断档）");
            break;
        case "absent":
            // ★ 原版恒隐/要服务端的层 ⇒ 本 kit 未实现，⛔ 不许「门控说该建、渲染器没写」
            assert.ok(!gate.implemented, `${m.kit} 对应原版 ${m.cls} 层却已实现？`);
            assert.ok(MAPO_PLANNED_LAYERS.includes(m.kit), `${m.kit} 应在未实现名录里`);
            break;
        case "exempt":
            assert.ok(m.exempt && m.exempt.length > 0,
                `${m.kit} 对应原版恒隐层却实现了，必须留豁免理由`);
            assert.ok(gate.implemented && mapoLayerVisible(m.kit, 0),
                `${m.kit} 豁免层近档必须在（内容决策）`);
            break;
        }
        // ★ 规则 A：原版恒显 ⇒ 本 kit 不许「恒隐/缺席」（far 底图除外）
        if (m.cls === "never") {
            assert.ok(m.kitCls === "static" || m.kitCls === "far",
                `${m.kit} 对应原版恒显层 ${m.orig} 却没有对应实现`);
        }
        // ★ 规则 B：原版恒隐（动态层）⇒ 本 kit 恒隐或未实现（豁免必须留字）
        if (m.cls === "always") {
            assert.ok(m.kitCls === "absent" || m.kitCls === "exempt",
                `${m.kit} 对应原版恒隐层 ${m.orig} 却静默实现了`);
        }
        // ★ 规则 C：原版近显远隐 ⇒ 本 kit 若实现则必须在最远档之前隐
        if (m.cls === "near" && m.kitCls === "static") {
            assert.ok(gate.hideAtLod < MAPO_LOD_MAX,
                `${m.kit} 对应原版会隐的层 ${m.orig}，本 kit 却全档都建`);
        }
    }

    // ★ 相对次序总扫：两个映射都落在「原版可排序」（never/near）且本 kit 都 static 时，
    //   原版先隐的层在本 kit 不许更长寿（hideAtLod 不许更大）。⛔ 只比大小，不比档号。
    for (const a of MAPPING) {
        for (const b of MAPPING) {
            if (a.kitCls !== "static" || b.kitCls !== "static") continue;
            if (a.cls !== "never" && a.cls !== "near") continue;
            if (b.cls !== "never" && b.cls !== "near") continue;
            const fa = firstHide(cfgBy.get(a.orig)!), fb = firstHide(cfgBy.get(b.orig)!);
            if (fa < fb) {
                assert.ok(gateBy.get(a.kit)!.hideAtLod <= gateBy.get(b.kit)!.hideAtLod,
                    `原版 ${a.orig} 比 ${b.orig} 先隐，本 kit ${a.kit} 却比 ${b.kit} 长寿`);
            }
        }
    }

    // ★ 三条文档级次序（原版表内的直接证据）：
    //   ① road 第 2 档起隐 / res 恒显 ⇒ 路不比资源地物长寿（2 ≤ 2）
    assert.ok(gateBy.get("road")!.hideAtLod <= gateBy.get("decor")!.hideAtLod,
        "road 不许比 decor（res 资源地）长寿");
    //   ② mountain 恒显 ⇒ 山林轮廓不先于路退场
    assert.ok(gateBy.get("region")!.hideAtLod >= gateBy.get("road")!.hideAtLod,
        "region（mountain 恒显）不许比 road 先隐");
    //   ③ big_city_house 第 3 档起隐而 big_city_wall 恒显 ⇒ 远档只留大体量：
    //     城址件（墙/门）不许比细碎摆件先退场
    assert.ok(gateBy.get("city")!.hideAtLod >= gateBy.get("decor")!.hideAtLod,
        "city（城墙恒显）不许比 decor 先隐");
    //   ④ 大区名最远档必须出（与 sandbox_area_name [1,1,1,1,0] 同向）
    assert.ok(mapoLayerVisible("label", MAPO_LOD_MAX), "远档大区名必须在");
});
