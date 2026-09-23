import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import {
    decodeMapoTerrainRle, mapoTerrainToBytes,
    MAPO_MAP_COLS, MAPO_MAP_ROWS,
    MAPO_TERRAIN_HEADER_BYTES, MAPO_ORIGINAL_TILE_HALF_W, MAPO_REGION_D_BIAS,
    MAPO_REGION_HEADER_BYTES, MAPO_REGION_RECORD_BYTES, mapoGrid2Pos, mapoRegionPos,
    mapoDecodeBase64, mapoDecodeRle,
} from "@game/shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_TERRAIN_COLS, MAPO_TERRAIN_MAP_ID, MAPO_TERRAIN_PALETTE,
    MAPO_TERRAIN_RLE_B64, MAPO_TERRAIN_ROWS, MAPO_TERRAIN_SHA256,
} from "@game/shared/kits/mapOriginal/content/terrain.data";
import {
    MAPO_RES_TYPE_CN, MAPO_VALUE_BY_ID, MAPO_VALUE_COLORS, MAPO_VALUE_KIND_ID,
    MAPO_VALUE_KINDS, MAPO_VALUE_MAX, MAPO_VALUE_PALETTE,
} from "@game/shared/kits/mapOriginal/content/display.data";
import {
    MAPO_DECOR_ATLAS_H, MAPO_DECOR_ATLAS_W, MAPO_DECOR_CELLS, MAPO_DECOR_CELL_H,
    MAPO_DECOR_CELL_W, MAPO_DECOR_CITY_BASE, MAPO_DECOR_DESERT_CELLS, MAPO_DECOR_SNOW_CELLS,
    type IMapoDecorTransform,
} from "@game/shared/kits/mapOriginal/content/decor.data";
import {
    MAPO_REGION_ATLAS_H, MAPO_REGION_ATLAS_W, MAPO_REGION_CELLS, MAPO_REGION_CELL_H,
    MAPO_REGION_CELL_W, MAPO_REGION_SNOW_CELLS,
} from "@game/shared/kits/mapOriginal/content/region.data";
import {
    MAPO_BAND_COLS, MAPO_BAND_DESERT, MAPO_BAND_GROUND, MAPO_BAND_HEADER_BYTES,
    MAPO_BAND_RLE_B64, MAPO_BAND_ROWS, MAPO_BAND_SHA256, MAPO_BAND_SNOW,
} from "@game/shared/kits/mapOriginal/content/bands.data";
import {
    MAPO_CITY_CELL_COUNTS, MAPO_CITY_CELL_KEYS, MAPO_CITY_SITES,
} from "@game/shared/kits/mapOriginal/content/labels.data";
import {
    MAPO_RIVER_D_BIAS, MAPO_RIVER_GEO_COUNT, MAPO_RIVER_HEADER_BYTES, MAPO_RIVER_ORIGIN,
    MAPO_RIVER_RECORD_BYTES, MAPO_RIVER_SIDE, MAPO_RIVER_S_BIAS, MAPO_RIVER_SYSTEMS,
    MAPO_RIVER_TILES, MAPO_RIVER_TINT,
} from "@game/shared/kits/mapOriginal/content/river.data";
import {
    MAPO_GROUND_BLOCK_TILES, MAPO_GROUND_GRID_SIDE, MAPO_GROUND_ORIGIN,
    MAPO_GROUND_REPEAT_U, MAPO_GROUND_REPEAT_V, MAPO_GROUND_TEXTURE_SIZE,
} from "@game/shared/kits/mapOriginal/content/ground.data";
import {
    MAPO_BLOCK_D_BIAS, MAPO_BLOCK_HEADER_BYTES, MAPO_BLOCK_LAYERS, MAPO_BLOCK_RECORD_BYTES,
    MAPO_BLOCK_S_BIAS,
} from "@game/shared/kits/mapOriginal/content/blocks.data";
import {
    MAPO_TOP_ATLASES, MAPO_TOP_DOWNSCALE, MAPO_TOP_RECORD_BYTES,
} from "@game/shared/kits/mapOriginal/content/tops.data";
import {
    MAPO_ROAD_ATLAS_H, MAPO_ROAD_ATLAS_W, MAPO_ROAD_CELLS, MAPO_ROAD_D_BIAS,
    MAPO_ROAD_HALF_H, MAPO_ROAD_HALF_W, MAPO_ROAD_HEADER_BYTES, MAPO_ROAD_RECORD_BYTES,
    MAPO_ROAD_SIDE, MAPO_ROAD_S_BIAS,
} from "@game/shared/kits/mapOriginal/content/roads.data";

const MAP = MAPO_TERRAIN_MAP_ID;
const kitDir = new URL(`../../kits/mapOriginal/data/maps/${MAP}/`, import.meta.url);
const cocosDir = new URL(`../../Cocos/assets/resources/kits/mapOriginal/maps/${MAP}/`, import.meta.url);

function kit(name: string): Buffer { return readFileSync(new URL(name, kitDir)); }
function cocos(name: string): Buffer { return readFileSync(new URL(name, cocosDir)); }
function sha256(b: Buffer | Uint8Array): string {
    return createHash("sha256").update(b).digest("hex");
}
const info = JSON.parse(kit("terrain.info.json").toString("utf8")) as {
    maxRow: number; maxCol: number; byteLength: number; sha256: string; passSha256: string;
    // ★ 显示层的调色板是按**原版 res 值**建的（id 即值），`kind` 是给图集用的粗类
    palette: { id: number; kind: string; cn: string; color: [number, number, number];
               passable: boolean; tiles: number; resType?: number; level?: number }[];
    passPalette: { id: number; name: string; passable: boolean; tiles: number }[];
    blockingLandIds: number[];
    mountainLandIds: number[];
};

test("mapOriginal 内容：terrain.bytes 与 terrain.info.json 逐字节自洽", () => {
    const raw = kit("terrain.bytes");
    assert.equal(raw.length, info.byteLength);
    assert.equal(raw.length, MAPO_TERRAIN_HEADER_BYTES + info.maxRow * info.maxCol);
    assert.equal(info.maxRow, MAPO_MAP_ROWS);
    assert.equal(info.maxCol, MAPO_MAP_COLS);
    assert.equal(raw.readUInt32BE(0), info.maxRow, "头 4 字节大端 rows");
    assert.equal(raw.readUInt32BE(4), info.maxCol, "次 4 字节大端 cols");
    assert.equal(sha256(raw), info.sha256);
    // 调色板计数必须与真实分布一致 —— ⛔ 不许 info 里写一套、数据里是另一套
    const counts = new Array<number>(256).fill(0);
    for (let i = MAPO_TERRAIN_HEADER_BYTES; i < raw.length; i += 1) counts[raw[i]] += 1;
    for (const e of info.palette) assert.equal(counts[e.id], e.tiles, `值 ${e.id}（${e.cn}）计数`);
    // ⚠ 值空间是封闭的：调色板之外的值一个都不许出现（⛔ 出现了就是解析规则漏了一支）
    const known = new Set(info.palette.map((e) => e.id));
    for (let v = 0; v < 256; v += 1) {
        if (counts[v] > 0 && !known.has(v)) assert.fail(`值 ${v} 出现 ${counts[v]} 次却不在调色板里`);
    }
});

test("mapOriginal 内容：shared 通行层模块 = terrain.pass.bytes（逐字节 + sha256）", () => {
    const decoded = decodeMapoTerrainRle({
        mapId: MAPO_TERRAIN_MAP_ID, rows: MAPO_TERRAIN_ROWS, cols: MAPO_TERRAIN_COLS,
        palette: MAPO_TERRAIN_PALETTE, rle: MAPO_TERRAIN_RLE_B64,
    });
    const bytes = mapoTerrainToBytes(decoded);
    const authoritative = kit("terrain.pass.bytes");
    assert.equal(bytes.length, authoritative.length);
    assert.deepEqual(Buffer.from(bytes), authoritative, "shared 模块与权威产物必须逐字节一致");
    assert.equal(sha256(bytes), MAPO_TERRAIN_SHA256);
    assert.equal(MAPO_TERRAIN_SHA256, info.passSha256);
});

test("mapOriginal 内容：通行层是显示层的派生（河流/山脉不可通行）", () => {
    const display = kit("terrain.bytes");
    const pass = kit("terrain.pass.bytes");
    const passIdOf = new Map(info.passPalette.map((e) => [e.name, e.id]));
    const LAND = passIdOf.get("land")!, RIVER = passIdOf.get("river")!, MOUNTAIN = passIdOf.get("mountain")!;
    // ★ M0-B1 起通行层**不再是显示层的逐格函数**：山地按 res_multi 的**整片足迹**挡路
    //   （[推断]，MAPORIGINAL-2D §3.1），而显示层在覆盖格上是 0 ⇒ 只能钉住这三条蕴含关系。
    //   ⛔ 别改回「值 → 通行类」的查表，那会把 19 格大山的 18 格判成可走。
    let blocked = 0;
    const n = display.length;
    for (let i = MAPO_TERRAIN_HEADER_BYTES; i < n; i += 1) {
        const v = display[i], p = pass[i], at = i - MAPO_TERRAIN_HEADER_BYTES;
        if (v === 47) assert.equal(p, RIVER, `第 ${at} 格是河流却不是不可通行河`);
        else if (v >= 48 && v <= 61) assert.equal(p, MOUNTAIN, `第 ${at} 格是山族锚点却不挡路`);
        else if (v === 0) assert.ok(p === LAND || p === MOUNTAIN, `第 ${at} 格覆盖格的通行类 ${p} 非法`);
        else assert.equal(p, LAND, `第 ${at} 格原版值 ${v} 不该挡路，实际 ${p}`);
        if (p === MOUNTAIN) blocked += 1;
    }
    // ★ 挡路格数必须等于覆盖掩码里**挡路集**的格数（两份产物互证）
    //   ⚠ 挡路集由 base.cw 的 `land.is_block` 直给（实测 1..46 通行 / 47..61 挡路），
    //   ⛔ 不再是硬编码的 {60,61} —— 那少挡了 154,552 格（1/2/4/7 格的山形）。
    const regionsMeta = JSON.parse(kit("regions.info.json").toString("utf8")) as
        { coverMask: Record<string, number> };
    assert.equal(blocked, regionsMeta.coverMask["挡路覆盖格"],
        "挡路格数 == res_multi ∈ 挡路集 的格数");
    // ⚠ 通行层的三类里只有 land 可通行
    for (const e of info.passPalette) assert.equal(e.passable, e.name === "land", e.name);
});

test("mapOriginal 内容：shared 值调色板 = terrain.info.json 的调色板", () => {
    assert.equal(MAPO_VALUE_PALETTE.length, info.palette.length);
    assert.equal(MAPO_VALUE_MAX, Math.max(...info.palette.map((e) => e.id)));
    for (const e of info.palette) {
        const v = MAPO_VALUE_BY_ID.get(e.id);
        assert.ok(v, `值 ${e.id} 必须在 shared 调色板里`);
        assert.equal(v.kind, e.kind, `值 ${e.id} 粗类`);
        assert.equal(v.cn, e.cn, `值 ${e.id} 中文名`);
        assert.equal(v.passable, e.passable, `值 ${e.id} 通行`);
        assert.equal(v.resType, e.resType, `值 ${e.id} 资源类型`);
        assert.equal(v.level, e.level, `值 ${e.id} 等级`);
        // ⚠ 热路径查的是这两张**下标表**，漂了就整片地上错色 / 取错图集行
        assert.equal(MAPO_VALUE_KIND_ID[e.id], MAPO_VALUE_KINDS.indexOf(e.kind), `值 ${e.id} 粗类下标`);
        assert.deepEqual([...MAPO_VALUE_COLORS[e.id]], e.color, `值 ${e.id} 颜色`);
    }
    assert.equal(MAPO_VALUE_KIND_ID.length, MAPO_VALUE_MAX + 1);
    assert.equal(MAPO_VALUE_COLORS.length, MAPO_VALUE_MAX + 1);
    // ⚠ 原版资源类型编号 0..3 都要有中文名，⛔ 面板上不许出现「类型2」这种兜底串
    const types = new Set(info.palette.filter((e) => e.kind === "resource").map((e) => e.resType!));
    for (const t of types) assert.ok(MAPO_RES_TYPE_CN[t], `资源类型 ${t} 缺中文名`);
});

test("mapOriginal 内容：摆件图集按**原版值**建格（值 → 图，一一对应）", () => {
    const meta = JSON.parse(kit("decor-atlas.info.json").toString("utf8")) as {
        cell: [number, number]; gridCols: number; size: [number, number];
        schemaVersion: number; anchor: string; cityBase: number;
        substitutions: Record<string, (number | string)[]>;
        variants: { resIds: Record<string, { base: number; snow: number; desert: number }> };
        cells: { id: number; kind: string; variant: string; cell: [number, number, number, number];
                 art: [number, number, number, number]; native: [number, number];
                 resType?: string; level?: number; source: string;
                 prefab?: string; transform?: IMapoDecorTransform }[];
    };
    assert.deepEqual(meta.cell, [MAPO_DECOR_CELL_W, MAPO_DECOR_CELL_H]);
    assert.deepEqual(meta.size, [MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H]);
    assert.equal(meta.cityBase, MAPO_DECOR_CITY_BASE);
    assert.equal(meta.schemaVersion, 4);
    assert.equal(meta.anchor, "prefab-pivot");
    // ★ N1：图集是三套件一张（143 格 = 基础 53 + 雪 45 + 沙 45），shared 按 variant 分三表
    assert.equal(meta.cells.length,
        MAPO_DECOR_CELLS.length + MAPO_DECOR_SNOW_CELLS.length + MAPO_DECOR_DESERT_CELLS.length);
    const sharedAll = [...MAPO_DECOR_CELLS, ...MAPO_DECOR_SNOW_CELLS, ...MAPO_DECOR_DESERT_CELLS];
    const keyOf = (v: string, id: number) => `${v}:${id}`;
    const byKey = new Map(sharedAll.map((c) => [keyOf(c.variant, c.id), c]));
    const slots = new Set<string>();
    for (const c of meta.cells) {
        const shared = byKey.get(keyOf(c.variant ?? "base", c.id));
        assert.ok(shared, `摆件格 ${c.variant}:${c.id} 必须进 shared`);
        assert.deepEqual([...shared.cell], c.cell, `摆件格 ${c.variant}:${c.id} 画布`);
        assert.deepEqual([...shared.art], c.art, `摆件格 ${c.variant}:${c.id} 图内矩形`);
        // native 管贴图采样；世界尺寸和相对格心的位置由资源件 transform 决定。
        assert.deepEqual([...shared.native], c.native, `摆件格 ${c.variant}:${c.id} 原图像素`);
        if (shared.kind === "res") {
            assert.ok(c.transform, `资源格 ${c.variant}:${c.id} 缺 prefab transform`);
            assert.deepEqual(shared.transform, c.transform, `资源格 ${c.variant}:${c.id} transform 未进入 shared`);
            assert.deepEqual([...c.transform.pivot], [0.5, 0.5], "当前主片必须是中心锚点");
            assert.ok([...c.transform.size, ...c.transform.scale].every((n) => Number.isFinite(n) && n > 0));
            assert.ok([...c.transform.offset, c.transform.angle].every(Number.isFinite));
        }
        assert.ok(c.native[0] > 0 && c.native[1] > 0, `摆件格 ${c.variant}:${c.id} 原图像素非法`);
        // 纵横比必须与图集里的一致（缩略图保比例），⛔ 漂了就是件被压扁/拉长
        assert.ok(Math.abs(c.native[0] / c.native[1] - c.art[2] / c.art[3]) < 0.02,
            `摆件格 ${c.variant}:${c.id} 缩略图没保住纵横比`);
        // ⚠ 存证不许写本机绝对路径（会随机器漂、且泄漏路径）
        assert.ok(!c.source.startsWith("/"), `摆件格 ${c.variant}:${c.id} 的 source 必须是仓外相对路径`);
        const [ax, ay, aw, ah] = c.art;
        assert.ok(ax >= 0 && ay >= 0 && ax + aw <= MAPO_DECOR_CELL_W && ay + ah <= MAPO_DECOR_CELL_H,
            `摆件格 ${c.variant}:${c.id} 图内矩形越界`);
        // ★ UV 不越界：格必须整张落在图集内（N1 图集已加宽到 4096×2048）
        const [cx, cy, cw, ch] = c.cell;
        assert.ok(cx >= 0 && cy >= 0 && cx + cw <= MAPO_DECOR_ATLAS_W && cy + ch <= MAPO_DECOR_ATLAS_H,
            `摆件格 ${c.variant}:${c.id} 越出图集`);
        // ⚠ 图集槽位不许撞车（两格同位 = 有一件盖住了另一件）
        const slot = `${cx},${cy}`;
        assert.ok(!slots.has(slot), `摆件格 ${c.variant}:${c.id} 的槽位 ${slot} 撞车`);
        slots.add(slot);
    }
    // ★ 这条才是「按原游戏参数摆放」的机检：**每个资源/金矿值都得有自己的一张图**，
    //   ⛔ 少一个就会在近档出现「这一格什么都没有」的空地，而原版那里是有 res_field 的。
    const byId = new Map(MAPO_DECOR_CELLS.map((c) => [c.id, c]));
    for (const e of info.palette) {
        if (e.kind !== "resource" && e.kind !== "gold") continue;
        assert.ok(byId.has(e.id), `原版值 ${e.id}（${e.cn}）缺摆件图`);
    }
    // ⚠ 城址件与资源件必须**分段不重叠**：城不在 res 值空间里
    for (const c of MAPO_DECOR_CELLS) {
        assert.equal(c.kind === "city", c.id >= MAPO_DECOR_CITY_BASE, `格 ${c.id} 分段`);
        if (c.kind !== "city") assert.ok(MAPO_VALUE_BY_ID.has(c.id), `格 ${c.id} 不是原版值`);
    }
    assert.ok(MAPO_DECOR_CELLS.some((c) => c.id >= MAPO_DECOR_CITY_BASE), "至少要有一件城址图");
});

test("mapOriginal 内容（N1）：摆件三套件与 land 表一致（值 → {base, snow, desert}）", () => {
    // ★ land 表的四套件列是选件真源（docs/MAPORIGINAL-2D.md §3.2，⛔ autumn 不接）：
    //   info.json 落盘的 resIds 是打包期从 base.cw 读出的，shared 三张表是按它建的格 ——
    //   两份产物互证，⛔ 不是同一处算两遍。
    const meta = JSON.parse(kit("decor-atlas.info.json").toString("utf8")) as {
        variants: { resIds: Record<string, { base: number; snow: number; desert: number }> };
        cells: { id: number; kind: string; variant: string; source: string;
                 resType?: string; level?: number }[];
    };
    const tables: Record<string, readonly { id: number; resType?: string; level?: number }[]> = {
        base: MAPO_DECOR_CELLS, snow: MAPO_DECOR_SNOW_CELLS, desert: MAPO_DECOR_DESERT_CELLS,
    };
    // 三套件齐全：45 个资源值（2..46）在每套表里都恰有一格
    const prefixOf: Record<string, string> = {
        base: "scene/resource/", snow: "scene/resource_snow/", desert: "scene/resource_desert/",
    };
    for (const [variant, table] of Object.entries(tables)) {
        const ids = table.filter((c) => c.id < MAPO_DECOR_CITY_BASE)
            .map((c) => c.id).sort((x, y) => x - y);
        assert.deepEqual(ids, Array.from({ length: 45 }, (_x, i) => i + 2),
            `${variant} 表的值域必须精确是 2..46`);
        for (const c of meta.cells.filter((x) => x.variant === variant && x.kind === "res")) {
            // ★ 贴图必须长在**本套**树里（⛔ 雪件图落在基础季树 = 换件是假的）
            assert.ok(c.source.startsWith(prefixOf[variant]),
                `${variant} 格 ${c.id} 的 source ${c.source} 不在 ${prefixOf[variant]} 下`);
        }
    }
    // land 表互证：45 个值的雪/沙套件 id 都必须与基础季**不同**（本 kit 消费的值全在
    // 「113 个雪/沙件与基础件不同」之列 —— 若有例外落回同 id，说明 land 表读串了）
    for (let v = 2; v <= 46; v += 1) {
        const ids = meta.variants.resIds[String(v)];
        assert.ok(ids, `值 ${v} 缺 resIds 记录`);
        assert.ok(ids.base > 0 && ids.snow > 0 && ids.desert > 0, `值 ${v} 的套件 id 有 0`);
        assert.notEqual(ids.snow, ids.base, `值 ${v} 的雪件 id 与基础季相同`);
        assert.notEqual(ids.desert, ids.base, `值 ${v} 的沙件 id 与基础季相同`);
    }
    // ★ 同值的类型/等级在三套表里一致（打包期已用 prefab 名互校，这里钉 shared 侧）
    for (let v = 2; v <= 46; v += 1) {
        const b = tables.base.find((c) => c.id === v)!;
        const s = tables.snow.find((c) => c.id === v)!;
        const d = tables.desert.find((c) => c.id === v)!;
        assert.equal(s.resType, b.resType, `值 ${v} 雪/基础类型`);
        assert.equal(d.resType, b.resType, `值 ${v} 沙/基础类型`);
        assert.equal(s.level, b.level, `值 ${v} 雪/基础等级`);
        assert.equal(d.level, b.level, `值 ${v} 沙/基础等级`);
    }
    // ★ land 表坐实的资源类型次序：wood / stone / food / iron（⛔ 不是旧假设的铁/石/粮轮转）
    //   12..21=石料(stone) / 22..31=粮食(food) / 32..41=铁矿(iron)，42..46=金矿(gold)
    assert.equal(tables.base.find((c) => c.id === 12)!.resType, "stone", "12 是石料不是铁");
    assert.equal(tables.base.find((c) => c.id === 22)!.resType, "food", "22 是粮食不是石");
    assert.equal(tables.base.find((c) => c.id === 32)!.resType, "iron", "32 是铁矿不是粮");
    assert.equal(tables.base.find((c) => c.id === 42)!.resType, "gold");
});

test("mapOriginal 内容：地表底 = 一张 POT 底纹 + 整数次 REPEAT（⛔ 不是逐格贴片）", () => {
    // ★ M2-B1：原版的地表底是「一块 10×10 格 + 一张 256² 底纹整数次 GL_REPEAT」（§1.4），
    //   整张 S1 只用**一张** underground1（§1.5）。⛔ 早先的「8 粗类 × 4 变体逐格菱形贴片」
    //   是本仓自创的，已删 —— 这条用例同时守着「别加回来」。
    const meta = JSON.parse(kit("ground.info.json").toString("utf8")) as {
        texture: { source: string; size: [number, number]; sha256: string; opaque: boolean; wrap: string };
        block: { tiles: number; gridSide: number; origin: number; sizePx: [number, number] };
        repeat: { u: number; v: number; timesU: number; timesV: number;
                  stretchU: number; stretchV: number };
        uv: Record<string, number[] | string>;
    };
    assert.equal(meta.block.tiles, MAPO_GROUND_BLOCK_TILES);
    assert.equal(meta.block.gridSide, MAPO_GROUND_GRID_SIDE);
    assert.equal(meta.block.origin, MAPO_GROUND_ORIGIN);
    assert.equal(meta.repeat.timesU, MAPO_GROUND_REPEAT_U);
    assert.equal(meta.repeat.timesV, MAPO_GROUND_REPEAT_V);
    assert.deepEqual([...MAPO_GROUND_TEXTURE_SIZE], meta.texture.size);
    // ★ 一块 = 10×10 逻辑格 = 3000×1500 原版 px（一格 300×150）
    assert.deepEqual(meta.block.sizePx, [3000, 1500], "一块的原版像素尺寸");
    // ★ 贴图必须 POT 且满幅不透明 —— 否则 WebGL1 下开不了 REPEAT、铺底会露背景
    for (const n of meta.texture.size) assert.equal(n & (n - 1), 0, `贴图边长 ${n} 不是 2 的幂`);
    assert.equal(meta.texture.opaque, true);
    assert.equal(meta.texture.wrap, "REPEAT/REPEAT");
    assert.equal(sha256(kit("ground-base.png")), meta.texture.sha256);
    assert.ok(meta.texture.source.startsWith("ground_down/"), "底纹必须是原版 2D 侧素材");
    // ★ **整周期**是关键：取 floor 让块边界落在整周期上，块与块之间不出现半个花纹的错茬
    assert.equal(meta.repeat.u % meta.texture.size[0], 0, "横向不是整周期");
    assert.equal(meta.repeat.v % meta.texture.size[1], 0, "纵向不是整周期");
    assert.equal(meta.repeat.u, meta.texture.size[0] * MAPO_GROUND_REPEAT_U);
    assert.equal(meta.repeat.v, meta.texture.size[1] * MAPO_GROUND_REPEAT_V);
    // 拉伸量 = 块尺寸 / 整周期尺寸，必须略大于 1（整周期一定不超过块）
    assert.ok(meta.repeat.stretchU > 1 && meta.repeat.stretchU < 1.2, `横向拉伸 ${meta.repeat.stretchU}`);
    assert.ok(meta.repeat.stretchV > 1 && meta.repeat.stretchV < 1.3, `纵向拉伸 ${meta.repeat.stretchV}`);
    // ★ 块网格必须正好盖住地图：150 块 × 10 格 = 1500 行，另加一圈 margin
    assert.equal((MAPO_GROUND_GRID_SIDE - 2) * MAPO_GROUND_BLOCK_TILES, MAPO_MAP_ROWS);
    assert.equal(MAPO_GROUND_ORIGIN, -MAPO_GROUND_BLOCK_TILES, "原点偏移 = 一整块的 margin");
    // ⛔ 图集产物必须**已经不在**了
    for (const lod of [0, 1, 2]) {
        assert.throws(() => kit(`atlas-lod${lod}.png`), /ENOENT/, `atlas-lod${lod}.png 又回来了`);
    }
});

test("mapOriginal 内容：kit 数据目录与 Cocos 运行时镜像逐字节一致", () => {
    const mirrored: [string, string][] = [
        // ⚠ 运行时镜像用 Cocos 的规范缓冲扩展名 `.bin`（权威产物仍叫 terrain.bytes）：
        //   镜像叫 .bytes 而 .meta 写 [".bin"] 时 Creator 会导出 `_native: ".bin"`，
        //   与库里的 .bytes 对不上 ⇒ 运行时「the native asset is missing」。
        ["terrain.bytes", "terrain.bin"],
        ["ground-base.png", "ground-base.png"],
        ["desert-base.png", "desert-base.png"], ["desert-geo.bin", "desert-geo.bin"],
        ["desert.bin", "desert.bin"],
        ["snow-base.png", "snow-base.png"], ["snow-geo.bin", "snow-geo.bin"],
        ["snow.bin", "snow.bin"],
        ["road-atlas.png", "road-atlas.png"], ["roads.bin", "roads.bin"],
        ["river-top-atlas.png", "river-top-atlas.png"], ["river-tops.bin", "river-tops.bin"],
        ["desert-top-atlas.png", "desert-top-atlas.png"], ["desert-tops.bin", "desert-tops.bin"],
        ["snow-top-atlas.png", "snow-top-atlas.png"], ["snow-tops.bin", "snow-tops.bin"],
        ["plate-lod4.png", "plate-lod4.png"], ["plate-lod4.info.json", "plate-lod4.info.json"],
        ["plate-lod5.png", "plate-lod5.png"], ["plate-lod5.info.json", "plate-lod5.info.json"],
        ["minimap.png", "minimap.png"], ["minimap-mask.png", "minimap-mask.png"],
        ["decor-atlas.png", "decor-atlas.png"], ["decor-atlas.info.json", "decor-atlas.info.json"],
        ["region-atlas.png", "region-atlas.png"],
        ["region-atlas.info.json", "region-atlas.info.json"],
        ["regions.bin", "regions.bin"],
    ];
    for (const [src, dst] of mirrored) {
        assert.deepEqual(kit(src), cocos(dst), `${src} → ${dst} 两处必须逐字节一致`);
    }
    // ⚠ 通行层与 info 只留 kit 数据目录：⛔ 不多存一份到运行时
    for (const name of ["terrain.pass.bytes", "terrain.info.json", "terrain.bytes", "labels.json",
                        "regions.info.json", "bands.bytes", "bands.info.json"]) {
        assert.throws(() => cocos(name), /ENOENT/, `${name} ⛔ 不该进 Cocos`);
    }
});

test("mapOriginal 内容：区域摆件表 regions.bin 自洽（布局 / 画家序 / 格 id）", () => {
    const meta = JSON.parse(kit("regions.info.json").toString("utf8")) as {
        count: number; recordBytes: number; headerBytes: number; dBias: number;
        byteLength: number; sha256: string;
        anchors: number; patches: number;
        footprints: Record<string, { shape: string; form: string; cells: number; dSpan: number }>;
        footprintCheck: { 命中: number; 不符: number; 命中率: number };
        patchPlacement: Record<string, number>;
        coverMask: Record<string, number>;
    };
    const raw = kit("regions.bin");
    assert.equal(meta.headerBytes, MAPO_REGION_HEADER_BYTES);
    assert.equal(meta.recordBytes, MAPO_REGION_RECORD_BYTES);
    assert.equal(meta.dBias, MAPO_REGION_D_BIAS);
    assert.equal(raw.length, meta.byteLength);
    assert.equal(raw.readUInt32BE(0), meta.count, "头 4 字节大端 count");
    assert.equal(raw.length, MAPO_REGION_HEADER_BYTES + meta.count * MAPO_REGION_RECORD_BYTES);
    assert.equal(sha256(raw), meta.sha256);

    const cellIds = new Set(MAPO_REGION_CELLS.map((c) => c.id));
    const footprintOf = new Map(MAPO_REGION_CELLS.map((c) => [c.id, c.footprintCells]));
    const display = kit("terrain.bytes");
    let prevS = -1;
    // ★ M0-B1：记录分两类，且**只能是这两类**（MAPORIGINAL-2D §3.1 / §3.4）——
    //   ① 主表锚点：该格的 `res` 原值 == 件的 cell 值；
    //   ② mountain_patch 补件：落在大山**内部**的覆盖格上 ⇒ 该格 `res` == 0。
    //   ⚠ 早先这里查的是「合并层的值属于件的族」，那是建立在 merge 之上的 —— merge 已删。
    //   ⚠ 补件**不一定**落在覆盖格上：实测 13 条落在别的件的锚点格（原版就是叠着画的），
    //   所以这里按「值 == 件值 / 值 == 0」两类计数，再与打包期落盘的分解对钉。
    let sameValueHits = 0, coveredHits = 0, otherAnchorHits = 0;
    for (let i = 0; i < meta.count; i += 1) {
        const o = MAPO_REGION_HEADER_BYTES + i * MAPO_REGION_RECORD_BYTES;
        const s = raw.readUInt16BE(o);
        const d = raw.readUInt16BE(o + 2) - MAPO_REGION_D_BIAS;
        const cell = raw.readUInt8(o + 4), wTiles = raw.readUInt8(o + 5);
        const cells = raw.readUInt16BE(o + 6);
        // ★ 表必须**已按 s 升序**落盘 —— 客户端靠它做二分与画家序，⛔ 不再排一遍
        assert.ok(s >= prevS, `第 ${i} 条 s=${s} 小于前一条 ${prevS}：表不是升序`);
        prevS = s;
        assert.ok(cellIds.has(cell), `第 ${i} 条的图集格 ${cell} 不存在`);
        assert.ok(wTiles >= 1, `第 ${i} 条件宽 ${wTiles} 非法`);
        // ★ cells 字段必须等于该形的足迹格数（1/2/4/7/19），⛔ 不是连通区大小了
        assert.equal(cells, footprintOf.get(cell), `第 ${i} 条足迹格数与形 ${cell} 不符`);
        // s、d 必须同奇偶（否则 row 不是整数），且反解出的格在图内
        assert.equal((s + d) % 2, 0, `第 ${i} 条 s/d 奇偶不同 ⇒ row 不是整数`);
        const row = (s + d) / 2, col = (s - d) / 2;
        assert.ok(row >= 0 && row < MAPO_MAP_ROWS && col >= 0 && col < MAPO_MAP_COLS,
            `第 ${i} 条反解出的格 (${row}, ${col}) 出图`);
        const value = display[MAPO_TERRAIN_HEADER_BYTES + row * MAPO_MAP_COLS + col];
        // ★ 件只能落在多格地形上：要么是锚点格（值 ∈ 48..61），要么是覆盖格（值 0）。
        //   ⛔ 不许摆到平地 / 资源 / 河里 —— 这条就是为它设的。
        if (value === cell) sameValueHits += 1;
        else if (value === 0) coveredHits += 1;
        else if (value >= 48 && value <= 61 && value !== 56) otherAnchorHits += 1;
        else {
            assert.fail(`第 ${i} 条：格 (${row}, ${col}) 的原版值 ${value} 不是多格地形 `
                + `（件 ${cell}）—— 件被摆到了平地/资源/河上`);
        }
    }
    // ★ 条数 = res 锚点 + mountain_patch 补件，⛔ 不许有来路不明的记录
    assert.equal(meta.count, meta.anchors + meta.patches, "条数 = res 锚点 + mountain_patch 补件");
    assert.equal(coveredHits, meta.patchPlacement["落在覆盖格"], "落在覆盖格上的补件数");
    assert.equal(otherAnchorHits, meta.patchPlacement["落在异值锚点格"], "落在异值锚点格的补件数");
    assert.equal(sameValueHits, meta.anchors + meta.patchPlacement["落在同值锚点格"],
        "值 == 件值的记录 = 全部锚点 + 落在同值锚点格的补件");
    assert.equal(Object.values(meta.patchPlacement).reduce((a, b) => a + b, 0), meta.patches,
        "补件三类之和 = 补件总数");
    // ★ 锚点总数 == terrain.bytes 里 48..61 的格数（两份产物互证，⛔ 不是同一处算两遍）
    let anchorCells = 0;
    for (const e of info.palette) if (e.id >= 48 && e.id <= 61) anchorCells += e.tiles;
    assert.equal(meta.anchors, anchorCells, "锚点数 == terrain.bytes 的 48..61 格数");
    // ★ 足迹逐值回代在打包期已做（regions.info.json.footprintCheck），这里钉住它真的跑过且合格
    assert.ok(meta.footprintCheck.命中率 >= 0.999, `足迹回代命中率 ${meta.footprintCheck.命中率} 过低`);
    for (const v of MAPO_REGION_CELLS) {
        assert.equal(meta.footprints[String(v.id)].cells, v.footprintCells, `形 ${v.id} 足迹格数`);
    }
});

test("mapOriginal 内容：显示层 = res 原值（⛔ 不再 merge res_multi）", () => {
    // ⚠ 这条是为 M0-B1 设的：早先 `merged = np.where(res == 0, multi, res)` 把 142,958 个
    //   **覆盖格**填成了锚点值，销毁了锚点信息 —— 本 kit 当初不得不发明连通域正是因为它。
    //   数字来自 MAPORIGINAL-2D §3.1 的六项判据（实测）。
    const byId = new Map(info.palette.map((e) => [e.id, e]));
    assert.equal(byId.get(0)?.tiles, 142958, "值 0（多格地形覆盖格）必须是 142,958 格");
    // ★ 挡路集由 base.cw 的 land.is_block 直给：1..46 通行、47..61 挡路（实测）
    assert.deepEqual(info.blockingLandIds, [47, 48, 49, 50, 51, 52, 53, 54, 55, 57, 58, 59, 60, 61],
        "挡路 land id 集");
    assert.deepEqual(info.mountainLandIds, info.blockingLandIds.filter((v) => v >= 48));
    let anchors = 0;
    for (const e of info.palette) if (e.id >= 48 && e.id <= 61) anchors += e.tiles;
    assert.equal(anchors, 55127, "48..61 锚点必须是 55,127 格");
    assert.ok(!byId.has(56), "值 56（山9）在原版数据里 0 命中，⛔ 不该出现在调色板里");
    // ★ 通行层的山地 = res_multi ∈ {60,61} 的**整片足迹**（[推断]：覆盖格继承多格 land 的 is_block）
    const mountainPass = info.passPalette.find((e) => e.name === "mountain")!.tiles;
    const regions = JSON.parse(kit("regions.info.json").toString("utf8")) as
        { coverMask: Record<string, number> };
    assert.equal(mountainPass, regions.coverMask["挡路覆盖格"],
        "不可通行山地格数 == res_multi ∈ 挡路集 的格数");
    // ⚠ 早先按硬编码 {60,61} 只挡 43,533 格，**少挡了 154,552 格**（1/2/4/7 格的山形）
    assert.ok(mountainPass > regions.coverMask["60/61 覆盖格"], "⛔ 别退回只挡 60/61");
});

test("mapOriginal 内容：城占格表 = city.bytes（249 座 / 2,689 格 / 首格对上 city_center）", () => {
    // ★ M0-B4：原版 res_field 的第 4 道门是「该格有 build ⇒ 不画」，城占的是 2,689 格、
    //   ⛔ 不是 249 个中心格。而城格 100% 是 res==1 平地 ⇒ 抑制只能靠这张表。
    const labels = JSON.parse(kit("labels.json").toString("utf8")) as {
        cities: { id: number; row: number; col: number }[];
        cityCells: [number, number][][];
    };
    assert.equal(labels.cities.length, 249, "城数");
    assert.equal(labels.cityCells.length, 249, "占格表的城数");
    assert.equal(MAPO_CITY_SITES.length, 249);
    assert.equal(MAPO_CITY_CELL_COUNTS.length, 249);
    // ★ 每城第 1 格 == city_center.lua[i]（249/249）—— 这是 city.bytes 布局的硬证
    const shapes = new Map<number, number>();
    let at = 0;
    const display = kit("terrain.bytes");
    for (let i = 0; i < 249; i += 1) {
        const cells = labels.cityCells[i], site = MAPO_CITY_SITES[i];
        assert.deepEqual(cells[0], [site.row, site.col], `第 ${i + 1} 座的首格`);
        assert.equal(MAPO_CITY_CELL_COUNTS[i], cells.length, `第 ${i + 1} 座的格数`);
        shapes.set(cells.length, (shapes.get(cells.length) ?? 0) + 1);
        for (const [row, col] of cells) {
            assert.equal(MAPO_CITY_CELL_KEYS[at], row * 10000 + col, `第 ${at} 个占格键`);
            at += 1;
            // ⚠ 城根本不在 res.bytes 里：城格 100% 是平地（§5）
            assert.equal(display[MAPO_TERRAIN_HEADER_BYTES + row * MAPO_MAP_COLS + col], 1,
                `城格 (${row}, ${col}) 不是 res==1 平地`);
        }
    }
    assert.equal(at, 2689, "占格总数");
    assert.equal(MAPO_CITY_CELL_KEYS.length, 2689);
    // ★ 占格形态只有 5 种（§5 的表）
    assert.deepEqual([...shapes.entries()].sort((a, b) => a[0] - b[0]),
        [[4, 1], [6, 11], [7, 24], [11, 204], [23, 9]], "占格形态分布");
});

test("mapOriginal 内容：249 座城的真名/类型/形状，且形状与占格 1:1 自洽", () => {
    // ★ 名字来自 base.cw 的 city[1] 桶（§11-1），经 city_shape_grids（格 → 城序号）对上。
    // ⚠ 本 kit 一度写着「⛔ 无名字（名字在服务端 AOI 里）」——**那是错的**，名字一直在
    //   客户端配置里，只是当时 base.cw 没解开。
    const types = new Map<string, number>();
    // 形状 → 它对应的占格数集合。★ 这是**两条独立数据链的互证**：
    //   占格数出自 city.bytes（二进制），形状出自 base.cw 的 city.shape → city_shape。
    const byShape = new Map<string, Set<number>>();
    for (let i = 0; i < MAPO_CITY_SITES.length; i += 1) {
        const s = MAPO_CITY_SITES[i];
        assert.ok(s.name.length > 0 && !/^\d+$/.test(s.name), `第 ${i + 1} 座没有真名：${s.name}`);
        assert.ok(["大型城池", "中型城池", "小型城池"].includes(s.cityType),
            `第 ${i + 1} 座的类型异常：${s.cityType}`);
        // ⚠ 等级实测是 **3..10**（⛔ 不是 1..8）：10 级只有洛阳一座、9 级 8 座州城
        assert.ok(s.level >= 3 && s.level <= 10, `第 ${i + 1} 座的等级越界：${s.level}`);
        types.set(s.cityType, (types.get(s.cityType) ?? 0) + 1);
        const set = byShape.get(s.shape) ?? new Set<number>();
        set.add(MAPO_CITY_CELL_COUNTS[i]);
        byShape.set(s.shape, set);
    }
    assert.equal(new Set(MAPO_CITY_SITES.map((s) => s.name)).size, 249, "城名互不重复");
    assert.deepEqual([...types.entries()].sort(),
        [["中型城池", 104], ["大型城池", 71], ["小型城池", 74]], "城池类型分布");
    // ★ 每个形状**只对应一种占格数**（⛔ 一对多即说明绑定链串了）
    assert.deepEqual([...byShape.entries()].map(([k, v]) => [k, [...v]]).sort(),
        [["DOUBLE_H_SHAPE", [23]], ["H_SHAPE", [11]], ["PIER_1", [6]],
            ["PIER_2", [6]], ["PIER_4", [4]], ["RADIUS_2", [7]]], "形状 ↔ 占格 1:1");
    // ⚠ 12 座渡口（PIER_*）在 city_shape 里带非零美术偏移 even_res_center/odd_res_center；
    //   ⛔ 将来画城址件时这 12 座要套偏移，其余 237 座为 0。
    // ★ §5 判读「23 格 / 9 座 = 大型城池（州城 / 洛阳级）」由此**独立坐实**：
    //   23 格的那 9 座正是 DOUBLE_H_SHAPE，且 10 级唯一一座就是洛阳。
    const big = MAPO_CITY_SITES.filter((_s, i) => MAPO_CITY_CELL_COUNTS[i] === 23);
    assert.equal(big.length, 9);
    assert.ok(big.every((s) => s.shape === "DOUBLE_H_SHAPE" && s.cityType === "大型城池"));
    assert.ok(big.some((s) => s.name === "洛阳"), "23 格里应有洛阳");
    const top = MAPO_CITY_SITES.filter((s) => s.level === 10);
    assert.deepEqual(top.map((s) => s.name), ["洛阳"], "10 级唯一一座");

    const piers = MAPO_CITY_SITES.filter((s) => s.shape.startsWith("PIER"));
    assert.equal(piers.length, 12, "渡口类城址座数");
    for (const name of ["孟津", "风陵渡", "蒲坂津", "白马", "夏口"]) {
        assert.ok(piers.some((s) => s.name === name), `渡口 ${name} 应在 PIER_* 里`);
    }
});

test("mapOriginal 内容：缩略图由地形烘、投影与点选同源（⛔ 不再贴原版鸟瞰插画）", () => {
    // ⚠ 缩略图在本 kit 里是**可点击导航**的（mapoMinimapCell → centerOn）⇒
    //   图与点选换算必须同一套投影。原版 noexpo_birdview 是 **3D 透视渲染**，
    //   与正交等距 ⛔ 无可靠对齐（实测相似变换 IoU 0.62、河网 NCC 0.30）。
    const meta = JSON.parse(kit("minimap.info.json").toString("utf8")) as {
        size: [number, number]; content: [number, number]; contentTop: number;
        source: string; projection: string;
    };
    assert.deepEqual(meta.size, [512, 512]);
    // ★ 内容占**中间半幅**，上下各 1/4 留白 —— 与 mapoWorldToMinimap 的 `0.25 + v*0.5` 严格对应
    assert.deepEqual(meta.content, [meta.size[0], meta.size[1] / 2]);
    assert.equal(meta.contentTop, meta.size[1] / 4);
    assert.ok(meta.source.startsWith("terrain.bytes"), "缩略图必须由地形烘");
    assert.ok(!meta.source.includes("birdview"), "⛔ 不许再贴原版鸟瞰插画");
    // 上下留白必须全透明（否则点选留白区会被当成地图内）
    const png = kit("minimap.png");
    assert.ok(png.length > 1000);
});

test("mapOriginal 内容：道路层自洽（坐标系 / 结构签名绑定 / 摆放表）", () => {
    // ★ M3-B1：坐标系由干净集 road_info.lua 的 layer_info 直给（§4.2）：
    //   网格 1125²、一个路格半宽 200 / 半高 100 = **4/3 个逻辑格**。
    //   ★ 独立佐证：18 张路片**每张都正好 400×200 px** = grid_width×2 / grid_height×2。
    const meta = JSON.parse(kit("roads.info.json").toString("utf8")) as {
        skin: string;
        grid: { side: number; halfW: number; halfH: number; tilesPerCell: number; key: string };
        sBias: number; dBias: number; recordBytes: number; headerBytes: number;
        placements: number; placementSha256: string; typeCount: number; resIds: number[];
        atlas: { size: [number, number]; downscale: number; sha256: string;
                 cells: { id: number; typeId: number; clientResId: number; prefab: string;
                          rect: [number, number, number, number];
                          native: [number, number]; cls: string; source: string }[] };
        binding: { degrees: number[]; typeIdToClientResId: number; tier: string };
    };
    assert.equal(meta.grid.side, MAPO_ROAD_SIDE);
    assert.equal(meta.grid.halfW, MAPO_ROAD_HALF_W);
    assert.equal(meta.grid.halfH, MAPO_ROAD_HALF_H);
    assert.equal(meta.recordBytes, MAPO_ROAD_RECORD_BYTES);
    assert.equal(meta.headerBytes, MAPO_ROAD_HEADER_BYTES);
    assert.equal(meta.sBias, MAPO_ROAD_S_BIAS);
    assert.equal(meta.dBias, MAPO_ROAD_D_BIAS);
    // ★ 坐标系自洽：1500 逻辑格 × (150 / 半宽) = 网格边长
    assert.equal(1500 * 150 / MAPO_ROAD_HALF_W, MAPO_ROAD_SIDE, "网格边长与半宽不自洽");
    assert.ok(Math.abs(meta.grid.tilesPerCell - MAPO_ROAD_HALF_W / 150) < 1e-6);
    // ★ 每张路片都正好一个路格见方 —— 这是半值约定的独立佐证
    assert.equal(meta.atlas.cells.length, 18);
    assert.equal(MAPO_ROAD_CELLS.length, 18);
    for (const c of meta.atlas.cells) {
        assert.deepEqual(c.native, [MAPO_ROAD_HALF_W * 2, MAPO_ROAD_HALF_H * 2],
            `路片 ${c.id}（${c.cls}）不是一个路格见方`);
        const shared = MAPO_ROAD_CELLS.find((x) => x.id === c.id)!;
        assert.ok(shared, `路片 ${c.id} 必须进 shared`);
        assert.deepEqual([...shared.rect], c.rect);
        assert.deepEqual([...shared.native], c.native);
        assert.equal(shared.cls, c.cls);
        assert.equal(c.rect[2], Math.round(c.native[0] * meta.atlas.downscale));
        const [x, y, w, h] = c.rect;
        assert.ok(x >= 0 && y >= 0 && x + w <= MAPO_ROAD_ATLAS_W && y + h <= MAPO_ROAD_ATLAS_H);
        assert.ok(c.source.startsWith(`scene/ground/${meta.skin}/`), `路片 ${c.id} 的 source`);
    }
    assert.deepEqual([MAPO_ROAD_ATLAS_W, MAPO_ROAD_ATLAS_H], meta.atlas.size);
    assert.equal(sha256(kit("road-atlas.png")), meta.atlas.sha256);
    // ★ 结构签名：度序列必须与「12 个 2 度 + 2 个 3 度 + 1 个 4 度 + 3 个 1 度」吻合
    const byDeg = new Map<number, number>();
    for (const d of meta.binding.degrees) byDeg.set(d, (byDeg.get(d) ?? 0) + 1);
    assert.deepEqual([...byDeg.entries()].sort((a, b) => a[0] - b[0]), [[1, 3], [2, 12], [3, 2], [4, 1]]);
    assert.equal(meta.binding.degrees.length, 18);
    // ★ 绑定已由 base.cw 的 client_res 表升为 [实测]（2026-09-23）
    assert.ok(meta.binding.tier.includes("[实测]"), "绑定档位应已是 [实测]");
    // ★ type_info 的 id 与 client_res id **1:1**（⛔ 无偏移）：真表里路片本体是
    //   1169..1187 共 19 条，`up_end_2`（名「路19」）占最前的 1169 而 S1 不用
    //   ⇒ type_info 正好覆盖 1170..1187 这 18 条。
    //   ⚠ 早先写成「要 +1」是因为当时用启发式扫表、整体错位了一格（已由真解码器纠正）。
    assert.equal(meta.binding.typeIdToClientResId, 0);
    for (const c of meta.atlas.cells) {
        assert.equal(c.clientResId, c.typeId, `路片 ${c.id} 的 id 换算`);
        // ★ prefab 名与精灵目录必须同类（下划线去掉后即目录名）
        const dir = c.source.split("/").slice(-2)[0];
        assert.equal(c.prefab.replace(/_/g, "").replace(/\d+$/, ""), dir.replace(/\d+$/, ""),
            `路片 ${c.id}：prefab ${c.prefab} 与精灵目录 ${dir} 不同类`);
    }

    // 摆放表：画家序 + 格 id 域 + 翻转位 + 行列在网格内
    const raw = kit("roads.bin");
    assert.equal(sha256(raw), meta.placementSha256);
    assert.equal(raw.readUInt32BE(0), meta.placements);
    assert.equal(raw.length, MAPO_ROAD_HEADER_BYTES + meta.placements * MAPO_ROAD_RECORD_BYTES);
    const ids = new Set(MAPO_ROAD_CELLS.map((c) => c.id));
    let prev = -1;
    const seen = new Set<number>();
    for (let i = 0; i < meta.placements; i += 1) {
        const o = MAPO_ROAD_HEADER_BYTES + i * MAPO_ROAD_RECORD_BYTES;
        const sRaw = raw.readUInt16BE(o);
        assert.ok(sRaw >= prev, `第 ${i} 条不是升序`);
        prev = sRaw;
        assert.ok(ids.has(raw.readUInt8(o + 4)), `第 ${i} 条的图集格越界`);
        const flip = raw.readUInt8(o + 5);
        assert.ok(flip === 0 || flip === 1, `第 ${i} 条的翻转位 ${flip} 非法`);
        const s = sRaw - MAPO_ROAD_S_BIAS, d = raw.readUInt16BE(o + 2) - MAPO_ROAD_D_BIAS;
        assert.equal((s + d) & 1, 0, `第 ${i} 条 s/d 奇偶不同`);
        const row = (s + d) / 2, col = (s - d) / 2;
        assert.ok(row >= 0 && row < MAPO_ROAD_SIDE && col >= 0 && col < MAPO_ROAD_SIDE,
            `第 ${i} 条的格 (${row}, ${col}) 出网格`);
        const key = row * 100000 + col;
        assert.ok(!seen.has(key), `路格 (${row}, ${col}) 重复`);
        seen.add(key);
    }
    // ★ 实测：42,018 条（与 road_info.bytes 的记录数逐条互证过）
    assert.equal(meta.placements, 42018);
    assert.equal(meta.typeCount, 37);
    assert.deepEqual(meta.resIds, Array.from({ length: 18 }, (_, i) => 1170 + i));
});

test("mapOriginal 内容：_top_group 手摆细节自洽（组数对齐几何库 / 长度精确 / native 未缩）", () => {
    // ★ 原版 `_polygon_group` 铺面、配对的 `_top_group` 是手摆的点缀（§1.6）。
    //   三族共 1,899 件；⚠ 每族的**组数必须等于该族几何库条数**，否则整族错位。
    const meta = JSON.parse(kit("top-atlas.info.json").toString("utf8")) as {
        atlases: Record<string, {
            size: [number, number]; pad: number; downscale: number; fill: number;
            sha256: string; cells: { id: number; rect: [number, number, number, number];
                                     native: [number, number]; source: string }[];
        }>;
        recordBytes: number;
        families: Record<string, { groups: number; sprites: number; bytes: number; sha256: string }>;
    };
    assert.equal(meta.recordBytes, MAPO_TOP_RECORD_BYTES);
    assert.equal(MAPO_TOP_ATLASES.length, 3);
    const geoCountOf: Record<string, number> = { river: MAPO_RIVER_GEO_COUNT };
    for (const l of MAPO_BLOCK_LAYERS) geoCountOf[l.kind] = l.geoCount;
    let sprites = 0;
    for (const atlas of MAPO_TOP_ATLASES) {
        const a = meta.atlases[atlas.kind], f = meta.families[atlas.kind];
        assert.ok(a && f, `${atlas.kind} 没落盘`);
        assert.deepEqual([...atlas.size], a.size);
        assert.equal(atlas.groups, f.groups);
        assert.equal(atlas.sprites, f.sprites);
        // ★ 组数必须与该族几何库条数相等（river 102 / desert 51 / snow 52）
        assert.equal(f.groups, geoCountOf[atlas.kind], `${atlas.kind} 的组数与几何库不齐`);
        assert.equal(a.downscale, MAPO_TOP_DOWNSCALE);
        for (const n of a.size) assert.equal(n & (n - 1), 0, `${atlas.kind} top 图集边长 ${n} 非 POT`);
        assert.equal(sha256(kit(`${atlas.kind}-top-atlas.png`)), a.sha256);
        assert.equal(atlas.cells.length, a.cells.length);
        for (const c of a.cells) {
            const shared = atlas.cells.find((x) => x.id === c.id)!;
            assert.ok(shared, `${atlas.kind} 图集格 ${c.id} 必须进 shared`);
            assert.deepEqual([...shared.rect], c.rect);
            assert.deepEqual([...shared.native], c.native);
            // ★ 图集里是**缩过的**、native 是原版像素 —— 两者必须按 downscale 对上
            assert.equal(c.rect[2], Math.max(1, Math.round(c.native[0] * MAPO_TOP_DOWNSCALE)),
                `${atlas.kind} 格 ${c.id} 宽与 downscale 不符`);
            assert.equal(c.rect[3], Math.max(1, Math.round(c.native[1] * MAPO_TOP_DOWNSCALE)),
                `${atlas.kind} 格 ${c.id} 高与 downscale 不符`);
            const [x, y, w, h] = c.rect;
            assert.ok(x >= 0 && y >= 0 && x + w <= a.size[0] && y + h <= a.size[1],
                `${atlas.kind} 格 ${c.id} 越出图集`);
            // ⚠ 贴图路径必须已归一化：⛔ 不许残留打包器前缀或 @@材质名
            assert.ok(!c.source.includes("atlas_mutil_assets"), `${atlas.kind} 格 ${c.id} 没归一化`);
            assert.ok(!c.source.includes("@@"), `${atlas.kind} 格 ${c.id} 还带 @@ 材质名`);
            assert.ok(c.source.startsWith("scene/"), `${atlas.kind} 格 ${c.id} 的 source 不是原版 2D 路径`);
        }
        // 摆放库：头 + 每组件数 + 件，长度必须精确
        const raw = kit(`${atlas.kind}-tops.bin`);
        assert.equal(raw.length, f.bytes);
        assert.equal(sha256(raw), f.sha256);
        assert.equal(raw.readUInt16BE(0), f.groups, `${atlas.kind} 组数`);
        let total = 0;
        for (let i = 0; i < f.groups; i += 1) total += raw.readUInt16BE(2 + i * 2);
        assert.equal(total, f.sprites, `${atlas.kind} 件数`);
        assert.equal(raw.length, 2 + f.groups * 2 + total * MAPO_TOP_RECORD_BYTES,
            `${atlas.kind} 摆放库长度不符`);
        // 逐件：图集格必须存在，scale 不得为 0
        const ids = new Set(a.cells.map((c) => c.id));
        let o = 2 + f.groups * 2;
        for (let i = 0; i < total; i += 1) {
            assert.ok(ids.has(raw.readUInt16BE(o)), `${atlas.kind} 第 ${i} 件引用了不存在的格`);
            const sx = raw.readFloatBE(o + 10), sy = raw.readFloatBE(o + 14);
            assert.ok(Math.abs(sx) > 0.05 && Math.abs(sy) > 0.05, `${atlas.kind} 第 ${i} 件 scale 太小`);
            o += MAPO_TOP_RECORD_BYTES;
        }
        sprites += f.sprites;
    }
    // ★ 实测总量：river 597 + desert 481 + snow 821
    assert.equal(sprites, 1899, "三族手摆件总数");
    assert.deepEqual(MAPO_TOP_ATLASES.map((a) => a.sprites), [597, 481, 821]);
});

test("mapOriginal 内容：snow / desert 块层自洽（叠不是替 / 行主序 / 下标域）", () => {
    // ★ M2-B2：三个地表层是「叠」不是「替」（§1.3）—— 同一块可以同时挂草地底 + 沙漠 + 雪。
    const meta = JSON.parse(kit("blocks.info.json").toString("utf8")) as {
        grid: { side: number; blockTiles: number; origin: number; order: string };
        sBias: number; dBias: number; recordBytes: number; headerBytes: number;
        layerOrder: Record<string, number>; bothBlocks: number;
        kinds: Record<string, {
            texture: { source: string; size: [number, number]; sha256: string };
            repeat: { timesU: number; timesV: number };
            geoCount: number; geoBytes: number; geoSha256: string; verts: number; tris: number;
            placements: number; placementSha256: string;
        }>;
    };
    assert.equal(meta.sBias, MAPO_BLOCK_S_BIAS);
    assert.equal(meta.dBias, MAPO_BLOCK_D_BIAS);
    assert.equal(meta.recordBytes, MAPO_BLOCK_RECORD_BYTES);
    assert.equal(meta.headerBytes, MAPO_BLOCK_HEADER_BYTES);
    // ★ 网格与地表底**同构**（⛔ 别让两者漂开）
    assert.equal(meta.grid.side, MAPO_GROUND_GRID_SIDE);
    assert.equal(meta.grid.blockTiles, MAPO_GROUND_BLOCK_TILES);
    assert.equal(meta.grid.origin, MAPO_GROUND_ORIGIN);
    assert.ok(meta.grid.order.includes("行主序"), "⛔ 块层是行主序，别抄 river 的列主序");
    // ★ 489 块两者兼有 —— 这就是「叠不是替」的硬证（§1.3 实测）
    assert.equal(meta.bothBlocks, 489, "desert 与 snow 同时有的块数");
    assert.deepEqual(meta.layerOrder, { ground: 100, desert: 200, snow: 300 });
    assert.equal(MAPO_BLOCK_LAYERS.length, 2);
    for (const layer of MAPO_BLOCK_LAYERS) {
        const k = meta.kinds[layer.kind];
        assert.ok(k, `${layer.kind} 没落盘`);
        assert.equal(layer.geoCount, k.geoCount);
        assert.deepEqual([...layer.repeat], [k.repeat.timesU, k.repeat.timesV]);
        assert.deepEqual([...layer.textureSize], k.texture.size);
        assert.equal(layer.order, (meta.layerOrder as Record<string, number>)[layer.kind]);
        // ★ 底纹必须 POT（WebGL1 下 REPEAT 的前提）且是原版 2D 侧素材
        for (const n of k.texture.size) assert.equal(n & (n - 1), 0, `${layer.kind} 底纹边长 ${n} 非 POT`);
        assert.ok(k.texture.source.startsWith("ground_down/"), `${layer.kind} 底纹来源`);
        assert.equal(sha256(kit(`${layer.kind}-base.png`)), k.texture.sha256);

        // 几何库：逐条走完必须精确读完，索引不越本条顶点
        const geo = kit(`${layer.kind}-geo.bin`);
        assert.equal(geo.length, k.geoBytes);
        assert.equal(sha256(geo), k.geoSha256);
        assert.equal(geo.readUInt16BE(0), k.geoCount);
        let o = 2, verts = 0, tris = 0;
        for (let i = 0; i < k.geoCount; i += 1) {
            const nv = geo.readUInt16BE(o + 1), ni = geo.readUInt16BE(o + 3);
            o += 5;
            assert.ok(nv >= 3, `${layer.kind} 第 ${i} 条只有 ${nv} 个顶点`);
            assert.equal(ni % 3, 0, `${layer.kind} 第 ${i} 条索引数 ${ni} 不是 3 的倍数`);
            o += nv * 8;
            for (let t = 0; t < ni; t += 1) {
                assert.ok(geo.readUInt16BE(o + t * 2) < nv, `${layer.kind} 第 ${i} 条索引越界`);
            }
            o += ni * 2;
            verts += nv; tris += ni / 3;
        }
        assert.equal(o, geo.length, `${layer.kind} 几何库必须精确读完`);
        assert.equal(verts, k.verts);
        assert.equal(tris, k.tris);

        // 摆放表：画家序 + 下标域 + 原点必须落在块上
        const raw = kit(`${layer.kind}.bin`);
        assert.equal(sha256(raw), k.placementSha256);
        assert.equal(raw.readUInt32BE(0), k.placements);
        assert.equal(raw.length, MAPO_BLOCK_HEADER_BYTES + k.placements * MAPO_BLOCK_RECORD_BYTES);
        let prev = -1;
        const seen = new Set<number>();
        for (let i = 0; i < k.placements; i += 1) {
            const off = MAPO_BLOCK_HEADER_BYTES + i * MAPO_BLOCK_RECORD_BYTES;
            const sRaw = raw.readUInt16BE(off);
            assert.ok(sRaw >= prev, `${layer.kind} 第 ${i} 条不是升序`);
            prev = sRaw;
            const g = raw.readUInt8(off + 4);
            assert.ok(g >= 1 && g <= k.geoCount, `${layer.kind} 第 ${i} 条下标 ${g} 越界`);
            const s = sRaw - MAPO_BLOCK_S_BIAS, d = raw.readUInt16BE(off + 2) - MAPO_BLOCK_D_BIAS;
            assert.equal((s + d) & 1, 0, `${layer.kind} 第 ${i} 条 s/d 奇偶不同`);
            const row = (s + d) / 2, col = (s - d) / 2;
            assert.equal(Math.abs((row - MAPO_GROUND_ORIGIN) % MAPO_GROUND_BLOCK_TILES), 0,
                `${layer.kind} 第 ${i} 条 row ${row} 不在块上`);
            assert.equal(Math.abs((col - MAPO_GROUND_ORIGIN) % MAPO_GROUND_BLOCK_TILES), 0,
                `${layer.kind} 第 ${i} 条 col ${col} 不在块上`);
            const key = row * 100000 + col;
            assert.ok(!seen.has(key), `${layer.kind} 块 (${row}, ${col}) 重复`);
            seen.add(key);
        }
    }
    // ★ desert 4,762 / snow 4,186 —— §1.3 的实测数字
    assert.equal(meta.kinds.desert.placements, 4762);
    assert.equal(meta.kinds.snow.placements, 4186);
});

test("mapOriginal 内容（N1）：cell 级地貌带 bands.bytes 与 shared 模块逐字节自洽", () => {
    // ★ 选件带归属的真源是**原版的 cell 级层** `logic_background.bytes`：
    //   原版 `check_ground_type` = `GROUND_TYPE_NAMES[格值] or "ground"`
    //   （枚举定义 = 干净集 const.lua:252 的 def_enum("GROUND_TYPE","ground","snow","desert")；
    //   层归属 = 干净集 map_layer_config.lua 的 logic_ground）。⇒ 2=雪 3=沙、其余回基础季。
    //   ⛔ 不许拿雪/沙「块」层当选件判据：块带 489 块双挂且粒度是 10×10 格，
    //   块级判据会把雪块里 38,066 个草地格误换雪件（数字见 bands.info.json）。
    const meta = JSON.parse(kit("bands.info.json").toString("utf8")) as {
        grid: { rows: number; cols: number; headerBytes: number; order: string };
        byteLength: number; sha256: string;
        values: Record<string, number>;
        bandCells: { snow: number; desert: number };
        rleBytes: number;
    };
    assert.equal(meta.grid.rows, MAPO_BAND_ROWS);
    assert.equal(meta.grid.cols, MAPO_BAND_COLS);
    assert.equal(meta.grid.headerBytes, MAPO_BAND_HEADER_BYTES);
    assert.ok(meta.grid.order.includes("行主序"), "⛔ 带层是行主序，别抄 river 的列主序");
    // ★ 枚举值钉死 def_enum 的声明序：ground=1 / snow=2 / desert=3
    assert.equal(MAPO_BAND_GROUND, 1);
    assert.equal(MAPO_BAND_SNOW, 2);
    assert.equal(MAPO_BAND_DESERT, 3);

    const raw = kit("bands.bytes");
    assert.equal(raw.length, meta.byteLength);
    assert.equal(raw.length, MAPO_BAND_HEADER_BYTES + MAPO_BAND_ROWS * MAPO_BAND_COLS);
    assert.equal(raw.readUInt16BE(0), MAPO_BAND_ROWS, "头 2 字节大端 rows");
    assert.equal(raw.readUInt16BE(2), MAPO_BAND_COLS, "次 2 字节大端 cols");
    assert.equal(sha256(raw), meta.sha256);
    assert.equal(meta.sha256, MAPO_BAND_SHA256, "shared 模块与权威产物的 sha256 必须一致");

    // ★ shared 模块解码后 == 权威产物载荷（**逐字节**，与通行层同款互证）
    const cells = mapoDecodeRle(mapoDecodeBase64(MAPO_BAND_RLE_B64),
        MAPO_BAND_ROWS, MAPO_BAND_COLS);
    assert.deepEqual(Buffer.from(cells), raw.subarray(MAPO_BAND_HEADER_BYTES),
        "bands.data.ts 解码必须逐字节等于 bands.bytes 载荷");

    // ★ 值分布与 info 逐值一致；带格数 = 打包期实测（雪 353,272 / 沙 354,478）
    const counts = new Map<number, number>();
    for (const v of cells) counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const [k, n] of Object.entries(meta.values)) {
        assert.equal(counts.get(Number(k)) ?? 0, n, `带层值 ${k} 的格数`);
    }
    assert.equal(counts.get(MAPO_BAND_SNOW), meta.bandCells.snow);
    assert.equal(counts.get(MAPO_BAND_DESERT), meta.bandCells.desert);
    assert.equal(meta.bandCells.snow, 353272, "雪带格数（实测）");
    assert.equal(meta.bandCells.desert, 354478, "沙带格数（实测）");

    // ★ 交叉校验（全量 225 万格，⛔ 不是抽样）：值 2 的格必须落在 snow 块内、
    //   值 3 必须落在 desert 块内 —— 块归属复用块层摆放表（build_blocks 的真映射
    //   BLOCK_TILES=10 / ORIGIN=-10，客户端常量 MAPO_GROUND_* 与它钉死同源）。
    for (const [file, want] of [["snow.bin", MAPO_BAND_SNOW],
                                ["desert.bin", MAPO_BAND_DESERT]] as const) {
        const table = kit(file);
        const n = table.readUInt32BE(0);
        const inBlock = new Uint8Array(152 * 152);
        for (let i = 0; i < n; i += 1) {
            const o = MAPO_BLOCK_HEADER_BYTES + i * MAPO_BLOCK_RECORD_BYTES;
            const s = table.readUInt16BE(o) - MAPO_BLOCK_S_BIAS;
            const d = table.readUInt16BE(o + 2) - MAPO_BLOCK_D_BIAS;
            const row = (s + d) / 2, col = (s - d) / 2;
            const bi = (row - MAPO_GROUND_ORIGIN) / MAPO_GROUND_BLOCK_TILES;
            const bj = (col - MAPO_GROUND_ORIGIN) / MAPO_GROUND_BLOCK_TILES;
            inBlock[bi * 152 + bj] = 1;
        }
        let bad = 0;
        for (let r = 0; r < MAPO_BAND_ROWS; r += 1) {
            for (let c = 0; c < MAPO_BAND_COLS; c += 1) {
                if (cells[r * MAPO_BAND_COLS + c] !== want) continue;
                const bi = Math.floor((r - MAPO_GROUND_ORIGIN) / MAPO_GROUND_BLOCK_TILES);
                const bj = Math.floor((c - MAPO_GROUND_ORIGIN) / MAPO_GROUND_BLOCK_TILES);
                if (!inBlock[bi * 152 + bj]) bad += 1;
            }
        }
        assert.equal(bad, 0, `值 ${want} 的格有 ${bad} 个落在 ${file} 的块外`);
    }
});

test("mapOriginal 内容：河流几何库 river-geo.bin 自洽（102 条 / 三角化合法 / 零残留）", () => {
    const meta = JSON.parse(kit("rivers.info.json").toString("utf8")) as {
        geoCount: number; geoBytes: number; geoSha256: string; verts: number; tris: number;
        placements: number; placementSha256: string; recordBytes: number;
        sBias: number; dBias: number;
        grid: { side: number; tilesPerCell: number; origin: number };
        systems: { system: number; name: string; rgb: [number, number, number] }[];
        tint: [number, number, number];
        alignCheck: Record<string, number>;
    };
    const raw = kit("river-geo.bin");
    assert.equal(raw.length, meta.geoBytes);
    assert.equal(sha256(raw), meta.geoSha256);
    assert.equal(raw.readUInt16BE(0), MAPO_RIVER_GEO_COUNT, "几何条数");
    assert.equal(meta.geoCount, MAPO_RIVER_GEO_COUNT);
    // ★ 逐条走一遍：顶点/索引数必须正好读完，索引必须落在本条的顶点范围内
    let o = 2, verts = 0, tris = 0;
    const bySystem = new Map<number, number>();
    for (let i = 0; i < MAPO_RIVER_GEO_COUNT; i += 1) {
        const system = raw.readUInt8(o);
        const nv = raw.readUInt16BE(o + 1), ni = raw.readUInt16BE(o + 3);
        o += 5;
        assert.ok(system >= 0 && system < MAPO_RIVER_SYSTEMS.length, `第 ${i} 条水系 ${system} 越界`);
        assert.ok(nv >= 3, `第 ${i} 条只有 ${nv} 个顶点，构不成多边形`);
        assert.equal(ni % 3, 0, `第 ${i} 条索引数 ${ni} 不是 3 的倍数`);
        o += nv * 8;
        for (let k = 0; k < ni; k += 1) {
            const idx = raw.readUInt16BE(o + k * 2);
            assert.ok(idx < nv, `第 ${i} 条的索引 ${idx} 越出 ${nv} 个顶点`);
        }
        o += ni * 2;
        verts += nv; tris += ni / 3;
        bySystem.set(system, (bySystem.get(system) ?? 0) + 1);
    }
    assert.equal(o, raw.length, "几何库必须精确读完不多不少");
    assert.equal(verts, meta.verts);
    assert.equal(tris, meta.tris);
    // ★ 三条水系的条数 = 原版 river_path.json 的分法（51 / 26 / 25）
    assert.deepEqual([...bySystem.entries()].sort((a, b) => a[0] - b[0]), [[0, 51], [1, 26], [2, 25]]);
    assert.deepEqual([...MAPO_RIVER_TINT], meta.tint);
    assert.equal(MAPO_RIVER_SYSTEMS.length, meta.systems.length);
    for (const s of meta.systems) {
        const shared = MAPO_RIVER_SYSTEMS[s.system];
        assert.equal(shared.name, s.name);
        assert.deepEqual([...shared.rgb], s.rgb, `水系 ${s.name} 的原版平色`);
    }
});

test("mapOriginal 内容：河流摆放表 rivers.bin 自洽（画家序 / 下标 / 对位覆盖）", () => {
    const meta = JSON.parse(kit("rivers.info.json").toString("utf8")) as {
        placements: number; placementSha256: string; recordBytes: number;
        sBias: number; dBias: number;
        grid: { side: number; tilesPerCell: number; origin: number };
        alignCheck: Record<string, number>;
    };
    assert.equal(meta.recordBytes, MAPO_RIVER_RECORD_BYTES);
    assert.equal(meta.sBias, MAPO_RIVER_S_BIAS);
    assert.equal(meta.dBias, MAPO_RIVER_D_BIAS);
    assert.equal(meta.grid.side, MAPO_RIVER_SIDE);
    assert.equal(meta.grid.tilesPerCell, MAPO_RIVER_TILES);
    assert.equal(meta.grid.origin, MAPO_RIVER_ORIGIN);
    const raw = kit("rivers.bin");
    assert.equal(sha256(raw), meta.placementSha256);
    assert.equal(raw.readUInt32BE(0), meta.placements, "头 4 字节大端 count");
    assert.equal(raw.length, MAPO_RIVER_HEADER_BYTES + meta.placements * MAPO_RIVER_RECORD_BYTES);

    const display = kit("terrain.bytes");
    const covered = new Uint8Array(MAPO_MAP_ROWS * MAPO_MAP_COLS);
    let prevS = -1;
    for (let i = 0; i < meta.placements; i += 1) {
        const o = MAPO_RIVER_HEADER_BYTES + i * MAPO_RIVER_RECORD_BYTES;
        const sRaw = raw.readUInt16BE(o);
        const geo = raw.readUInt8(o + 4);
        // ★ 表必须**已按 s 升序**落盘 —— 客户端靠它做二分与画家序
        assert.ok(sRaw >= prevS, `第 ${i} 条 s=${sRaw} 小于前一条 ${prevS}`);
        prevS = sRaw;
        assert.ok(geo >= 1 && geo <= MAPO_RIVER_GEO_COUNT, `第 ${i} 条的几何下标 ${geo} 越界`);
        assert.equal(raw.readUInt8(o + 5), 0, `第 ${i} 条的保留字节必须为 0`);
        const s = sRaw - MAPO_RIVER_S_BIAS, d = raw.readUInt16BE(o + 2) - MAPO_RIVER_D_BIAS;
        // ⚠ margin 块的 s/d 可为负，⛔ 别用 `% 2`：JS 的 `-12 % 2` 是 **-0**，
        //   而 node:assert/strict 按 SameValue 比，`assert.equal(-0, 0)` 会红。
        assert.equal((s + d) & 1, 0, `第 ${i} 条 s/d 奇偶不同 ⇒ row 不是整数`);
        const row = (s + d) / 2, col = (s - d) / 2;
        // ★ 原点格必须落在 3 的倍数减 6 上（河格 → 逻辑格的换算，⛔ 不许有半格）
        assert.equal(Math.abs((row - MAPO_RIVER_ORIGIN) % MAPO_RIVER_TILES), 0,
            `第 ${i} 条 row ${row} 不在河格上`);
        assert.equal(Math.abs((col - MAPO_RIVER_ORIGIN) % MAPO_RIVER_TILES), 0,
            `第 ${i} 条 col ${col} 不在河格上`);
        for (let dr = 0; dr < MAPO_RIVER_TILES; dr += 1) {
            for (let dc = 0; dc < MAPO_RIVER_TILES; dc += 1) {
                const r = row + dr, c = col + dc;
                if (r < 0 || r >= MAPO_MAP_ROWS || c < 0 || c >= MAPO_MAP_COLS) continue;
                covered[r * MAPO_MAP_COLS + c] = 1;
            }
        }
    }
    // ★ 对位判据：**每个 res==47 格都要被某个河格覆盖**（打包期实测 235,290/235,292）
    let river = 0, hit = 0;
    for (let i = 0; i < covered.length; i += 1) {
        if (display[MAPO_TERRAIN_HEADER_BYTES + i] !== 47) continue;
        river += 1;
        if (covered[i]) hit += 1;
    }
    assert.equal(river, meta.alignCheck["res==47 格"]);
    assert.equal(hit, meta.alignCheck["被覆盖"]);
    assert.ok(hit / river >= 0.999, `河格只覆盖了 ${(hit / river).toFixed(4)} 的 res==47 格`);
});

test("mapOriginal 内容：mapoRegionPos 与 mapoGrid2Pos 同式（含奇数行半格错位）", () => {
    // ⚠ 漏了奇数行的 -0.5 偏移，整个区域件层会与地表错半格 —— 这条就是为它设的
    for (const [row, col] of [[0, 0], [1, 0], [0, 1], [1, 1], [749, 750], [750, 749],
                              [1499, 1499], [1234, 567], [567, 1234]] as const) {
        const a = mapoGrid2Pos(row, col);
        const b = mapoRegionPos(row + col, row - col);
        assert.deepEqual([b.x, b.y], [a.x, a.y], `(${row}, ${col})`);
    }
});

test("mapOriginal 内容：区域件图集布局 = shared 的 MAPO_REGION_* 常量", () => {
    const meta = JSON.parse(kit("region-atlas.info.json").toString("utf8")) as {
        cell: [number, number]; gridCols: number; size: [number, number]; anchor: string;
        variants?: { desertSameAsBase: number };
        cells: { id: number; kind: string; variant: string; cell: [number, number, number, number];
                 art: [number, number, number, number]; native: [number, number];
                 scale: [number, number]; offset: [number, number]; angle: number;
                 pivot: [number, number]; lowZ: number; source: string }[];
    };
    assert.deepEqual(meta.cell, [MAPO_REGION_CELL_W, MAPO_REGION_CELL_H]);
    assert.deepEqual(meta.size, [MAPO_REGION_ATLAS_W, MAPO_REGION_ATLAS_H]);
    assert.equal(meta.anchor, "bottom-center");
    // ★ N1：一张图集装两套（基础 13 + 雪 13 = 26 格，2048×4096）
    assert.equal(meta.cells.length, MAPO_REGION_CELLS.length + MAPO_REGION_SNOW_CELLS.length);
    const byKey = new Map([...MAPO_REGION_CELLS, ...MAPO_REGION_SNOW_CELLS]
        .map((c) => [`${c.variant}:${c.id}`, c]));
    const slots = new Set<string>();
    for (const c of meta.cells) {
        const shared = byKey.get(`${c.variant ?? "base"}:${c.id}`);
        assert.ok(shared, `区域件格 ${c.variant}:${c.id} 必须进 shared`);
        assert.equal(shared.kind, c.kind);
        assert.deepEqual([...shared.cell], c.cell);
        assert.deepEqual([...shared.art], c.art);
        assert.deepEqual([...shared.native], c.native, `区域件格 ${c.variant}:${c.id} 原图像素`);
        // ★ M0-B2：件的大小 = 原图像素 × prefab 里的 scale，⛔ 只抄像素会把 14 形压成 10 形
        assert.deepEqual([...shared.scale], c.scale, `区域件格 ${c.variant}:${c.id} 的 scale`);
        assert.deepEqual([...shared.offset], c.offset, `区域件格 ${c.variant}:${c.id} 的 offset`);
        assert.equal(shared.angle, c.angle, `区域件格 ${c.variant}:${c.id} 的 angle`);
        assert.deepEqual([...shared.pivot], c.pivot, `区域件格 ${c.variant}:${c.id} 的 pivot`);
        assert.ok(c.scale[0] > 0.1 && c.scale[0] < 8 && c.scale[1] > 0.1 && c.scale[1] < 8,
            `区域件格 ${c.variant}:${c.id} 的 scale ${c.scale} 不在 (0.1, 8.0) 内`);
        // 当前山体 sprite 的原版锚点均为中心；mesh 直接消费该字段。
        assert.deepEqual(c.pivot, [0.5, 0.5], `区域件格 ${c.variant}:${c.id} 的 pivot 不是中心`);
        assert.ok(Math.abs(c.native[0] / c.native[1] - c.art[2] / c.art[3]) < 0.02,
            `区域件格 ${c.variant}:${c.id} 缩略图没保住纵横比`);
        // ★ 件在世界里的**实际**宽度 = 原图像素 × scale ÷ 一格 300 px。
        //   ⚠ 必须随足迹单调放大：19 格的形只用 native 只有 1.88 格（比 7 格的形还小），
        //   补上 scale 后才是 4.06 格 —— 这条就是为 M0-B3.3 的那个缺陷设的。
        const tiles = (c.native[0] * c.scale[0]) / (MAPO_ORIGINAL_TILE_HALF_W * 2);
        assert.ok(tiles > 0.8 && tiles < 5,
            `区域件格 ${c.variant}:${c.id} 在原版里占 ${tiles.toFixed(2)} 格，不像地物`);
        const want = new Map<number, readonly [number, number]>([
            // ⚠ 下沿为雪山件放宽过（N1 实测：雪 1m 0.88 格、雪 2m_xy 1.02 格，
            //   雪件的 scale 全 1.0、就是比基础季小）；上沿不动，「忘乘 scale」仍会被 19m 拦下。
            [1, [0.8, 1.4]], [2, [0.9, 2.1]], [4, [1.7, 2.4]], [7, [2.2, 3.0]], [19, [3.8, 4.6]],
        ]);
        const fp = shared!.footprintCells;
        const band = want.get(fp)!;
        assert.ok(tiles >= band[0] && tiles <= band[1],
            `区域件格 ${c.variant}:${c.id}（足迹 ${fp} 格）宽 ${tiles.toFixed(2)} 格，不在 ${band} 内`);
        const [ax, ay, aw, ah] = c.art;
        assert.ok(ax >= 0 && ay >= 0 && ax + aw <= MAPO_REGION_CELL_W
            && ay + ah <= MAPO_REGION_CELL_H, `区域件格 ${c.variant}:${c.id} 图内矩形越界`);
        // ★ UV 不越界：格必须整张落在图集内（N1 图集已加高到 2048×4096）
        const [cx, cy, cw, ch] = c.cell;
        assert.ok(cx >= 0 && cy >= 0 && cx + cw <= MAPO_REGION_ATLAS_W && cy + ch <= MAPO_REGION_ATLAS_H,
            `区域件格 ${c.variant}:${c.id} 越出图集`);
        const slot = `${cx},${cy}`;
        assert.ok(!slots.has(slot), `区域件格 ${c.variant}:${c.id} 的槽位 ${slot} 撞车`);
        slots.add(slot);
        // ⚠ 素材全部来自原版切片，⛔ 存证不许写本机绝对路径
        assert.ok(!c.source.startsWith("/"), `区域件格 ${c.variant}:${c.id} 的 source 必须是仓外相对路径`);
        assert.ok(c.source.startsWith("scene/"), `区域件格 ${c.variant}:${c.id} 的 source 必须是原版资源路径`);
    }
    // ★ M0-B3：山体美术必须是**基础季**，⛔ 不是秋季（grass_fall_new）
    for (const c of meta.cells.filter((x) => x.variant === "base")) {
        assert.ok(c.source.startsWith("scene/ground/mountain_new/png/"),
            `区域件格 ${c.id} 的 source ${c.source} 不是基础季山体`);
        assert.ok(!c.source.includes("grass_fall"), `区域件格 ${c.id} 还指着秋季件`);
    }
    // ★ N1：雪件必须是 `mountain_snow` 的同形件；沙漠带的山件与基础季**同件**（实测 13/13），
    //   ⛔ 没有也不许有沙件格 —— 出现了说明 land 表的荒地山列变了，要回去重读。
    for (const c of meta.cells.filter((x) => x.variant === "snow")) {
        assert.ok(c.source.startsWith("scene/ground/mountain_snow/png/"),
            `雪山格 ${c.id} 的 source ${c.source} 不是雪山件`);
    }
    assert.ok(!meta.cells.some((c) => c.variant === "desert"), "⛔ 不该有沙件格（荒地山=基础季件）");
    assert.equal(meta.variants?.desertSameAsBase, 13, "荒地山与基础季同件的实测计数");
    // ★ 雪件的 transform 必须**逐形重读**：13 形的 scale/offset 与基础季全不同
    //   （例如 19m：基础季 scale 2.163、雪山 2.0）—— 全同 = 抄了基础季，等于没接变体。
    for (const base of MAPO_REGION_CELLS) {
        const snow = MAPO_REGION_SNOW_CELLS.find((c) => c.id === base.id)!;
        assert.ok(snow, `形 ${base.id} 缺雪山格`);
        assert.notDeepEqual(
            { scale: [...snow.scale], offset: [...snow.offset] },
            { scale: [...base.scale], offset: [...base.offset] },
            `形 ${base.id} 的雪/基础 transform 不该相同`);
    }
    // ★ M0-B1：原版 48..61 是**一族 14 形**（山1..山14，§3.2），山9（值 56）无 2D prefab
    //   且数据里 0 命中 ⇒ 格 id 集合必须精确等于 48..61 去掉 56。
    //   ⛔ 早先按「山脉 / 林丛 / 散落」三族分是本仓自创的分类。
    const want: number[] = [];
    for (let v = 48; v <= 61; v += 1) if (v !== 56) want.push(v);
    for (const table of [MAPO_REGION_CELLS, MAPO_REGION_SNOW_CELLS]) {
        assert.deepEqual(table.map((c) => c.id).slice().sort((a, b) => a - b), want,
            "件的格 id 必须精确是原版山族值 48..61（⛔ 无 56）");
    }
    for (const c of [...MAPO_REGION_CELLS, ...MAPO_REGION_SNOW_CELLS]) {
        assert.equal(c.kind, "mountain", `格 ${c.id} 必须属山族`);
        assert.ok([1, 2, 4, 7, 19].includes(c.footprintCells), `格 ${c.id} 足迹 ${c.footprintCells} 不是原版的 1/2/4/7/19`);
        assert.ok(c.shan >= 1 && c.shan <= 14, `格 ${c.id} 的山号 ${c.shan} 越界`);
        assert.equal(c.id, c.shan + 47, `格 ${c.id} 与山号 ${c.shan} 不满足 v = 山N + 47`);
    }
});

test("mapOriginal 内容：图片 .meta 只有 Creator 那一个 texture 子资源（⛔ 不许两套 id）", () => {
    // ⚠ 这条是为一条真实缺陷设的：装配脚本早先自己 sha1 出一个 subMeta id（如 `b2b1d`），
    //   覆写掉 Creator 导入出来的 `6c48a` 之后，同一张 PNG 就有了**两个 texture 子资源**、
    //   动态加载 URL 相同（`kits/mapOriginal/maps/s1/<图名>/texture`）——
    //   Creator 每次导入都刷一条 warn，运行时按 URL 取图还可能拿错那一个。
    //   ⛔ 别再引入第二套 sub id：Creator 3.8 给图片 texture 用的就是固定的 `6c48a`。
    const dir = new URL(`../../Cocos/assets/resources/kits/mapOriginal/maps/${MAP}/`, import.meta.url);
    const metas = readdirSync(dir).filter((f) => f.endsWith(".png.meta"));
    assert.ok(metas.length > 0, "运行时镜像里应当有图片");
    for (const file of metas) {
        const meta = JSON.parse(readFileSync(new URL(file, dir)).toString("utf8")) as {
            uuid: string; importer: string;
            subMetas: Record<string, { id: string; name: string }>;
            userData: { redirect: string; hasAlpha: boolean };
        };
        assert.equal(meta.importer, "image", `${file} 的 importer`);
        const ids = Object.keys(meta.subMetas);
        assert.deepEqual(ids, ["6c48a"], `${file} 的 subMeta 必须只有 Creator 那个 6c48a`);
        assert.equal(meta.subMetas["6c48a"].name, "texture", `${file} 的子资源名`);
        assert.equal(meta.userData.redirect, `${meta.uuid}@6c48a`, `${file} 的 redirect`);
        // hasAlpha 由 Creator 按真实图算：PNG 的 IHDR 色彩类型 4/6 才有 alpha 通道。
        // ⚠ 硬编码成 true 的话，灰度蒙版图首次打开就会被 Creator 改写一次。
        const png = readFileSync(new URL(file.slice(0, -5), dir));
        assert.equal(meta.userData.hasAlpha, png[25] === 4 || png[25] === 6,
            `${file} 的 hasAlpha 与 PNG 色彩类型 ${png[25]} 不符`);
    }
});

/**
 * ★ 「2D kit 只用 2D 素材」的机检（2026-09-22 拍板：3D 沙盘另开 kit `mapOriginal3d`）。
 *
 * 判据来自原版源码，⛔ 不是按名字里有没有 "3d"：
 * - `asset/scene/**` = 2D 沙盘美术根、`asset/scene_3d/**` = 3D 沙盘。铁证：基础包里全部
 *   `.prefab`/`.mesh`/`.material`/`.static_scene` 都落在 `scene_3d/**`，`scene/**` 下一个都没有；
 *   而 `script/logic/res_load_control/res_2d_atlas.lua`（文件名就带 2d）整表是 `scene/_output_atlas_scene/`。
 * - `asset/ground_down/**` 是 2D 侧：desert/snow 各 60 个 `*_polygon_group.prefab` 引用它作地面底。
 * - `fairy/atlas_3d/**`、`fairy/ui_3d/**`、`ui_3d/**` 是 **3D UI 皮肤**，与沙盘维度**正交**
 *   （`const.lua:651-657` 两套独立 tag）⇒ 两个沙盘 kit 都不收。
 * - `map/<赛季>/cn/**` 数据层两版共用（`map_layer_config.lua` 的 `DataLayers` 与 2d/3d 段平级）。
 */
const MAPO_2D_SOURCE_PREFIXES = [
    "scene/",            // 2D 沙盘美术根（含 _output_atlas_scene 图集页与切片）
    "ground_down/",      // 2D 地面底（underground1/2/3）
    "map/",              // 数据层，两版共用
    "asset/config/",     // 数值/语义配置，无维度分支
    // ⚠ UI 树只放行**共用包**，⛔ 不整棵 `fairy/ui/` 与 `fairy/atlas/` 放行：
    //   按本文件抬头同一条判据（UI 维度与沙盘维度正交），2D UI 皮肤树也是 UI 维度，
    //   不该拿来当沙盘地表。当前 173 条 source 里这三条命中 0，是**预授权**闸门，收窄零代价。
    "fairy/ui/ui_common",   // 共用 UI 包（`fairy/ui_3d/` 下无 ui_common_map ⇒ 无 3D 对偶）
    "fairy/atlas_common/",  // 两套 UI 皮肤共用
];
/** ⛔ 出现即红。⚠ 前缀要**带斜杠**，否则 `scene/` 会把 `scene_3d/` 也放过去。 */
const MAPO_BANNED_SOURCE_PREFIXES = ["scene_3d/", "fairy/ui_3d/", "fairy/atlas_3d/", "ui_3d/"];

test("mapOriginal 内容：★ 所有产物的素材来源都必须是**原版 2D 侧**（⛔ 无 scene_3d）", () => {
    // ⚠ ⛔ 不用 readdirSync 全枚举：那会把「这几个必须被校」的显式契约换成
    //   「目录里有什么校什么」，产物被删/改名后同样静默退出。
    const files = ["decor-atlas.info.json", "region-atlas.info.json"];
    let checked = 0;
    const perFile = new Map<string, number>();
    for (const name of files) {
        const meta = JSON.parse(kit(name).toString("utf8")) as {
            cells?: { id: number; source?: string }[];
        };
        for (const c of meta.cells ?? []) {
            const src = c.source;
            // 纯色兜底格没有真实来源，跳过；⛔ 但不许静默跳过「有 source 却不合规」的
            if (!src || src.startsWith("（")) continue;
            checked += 1;
            perFile.set(name, (perFile.get(name) ?? 0) + 1);
            for (const bad of MAPO_BANNED_SOURCE_PREFIXES) {
                // ⚠ 判**子串**不只是前缀：原版语料里确有
                //   `asset/scene/effect/_output_atlas_se/atlas_mutil_assets/asset/ground_down/…`
                //   这种嵌套前缀写法，纯 startsWith 会让 `scene/…/scene_3d/…` 漏网。
                assert.ok(!src.includes(bad),
                    `${name} 第 ${c.id} 格的素材来自 3D 侧：${src}\n`
                    + "  ⇒ 本 kit 只承载原版 2D 沙盘，3D 素材属于 mapOriginal3d");
            }
            assert.ok(MAPO_2D_SOURCE_PREFIXES.some((ok) => src.startsWith(ok)),
                `${name} 第 ${c.id} 格的素材来源不在 2D 白名单里：${src}`);
            // ⚠ 本机绝对路径会随机器漂，也让上面的前缀判定失效
            assert.ok(!src.startsWith("/"), `${name} 第 ${c.id} 格的 source 是本机绝对路径`);
        }
    }
    // ⚠ 判据是「每个产物都至少产出一条」，⛔ 不是总数阈值 ——
    //   总数富余时（现有 173 条）某个产物整体不产 source 也能蒙混过去。
    for (const name of files) {
        assert.ok((perFile.get(name) ?? 0) > 0, `${name} 一条 source 都没校到`);
    }
    // ★ 非「格」形态的产物也要校 source：地表底一张、河流三条水系各一张
    const extra: [string, string][] = [
        ["ground.info.json", (JSON.parse(kit("ground.info.json").toString("utf8")) as
            { texture: { source: string } }).texture.source],
        ...(JSON.parse(kit("rivers.info.json").toString("utf8")) as
            { systems: { name: string; source: string }[] }).systems
            .map((x): [string, string] => [`rivers.info.json/${x.name}`, x.source]),
        ...Object.entries((JSON.parse(kit("blocks.info.json").toString("utf8")) as
            { kinds: Record<string, { texture: { source: string } }> }).kinds)
            .map(([k, x]): [string, string] => [`blocks.info.json/${k}`, x.texture.source]),
        ...(JSON.parse(kit("roads.info.json").toString("utf8")) as
            { atlas: { cells: { id: number; source: string }[] } }).atlas.cells
            .map((c): [string, string] => [`roads.info.json#${c.id}`, c.source]),
        ...Object.entries((JSON.parse(kit("top-atlas.info.json").toString("utf8")) as
            { atlases: Record<string, { cells: { id: number; source: string }[] }> }).atlases)
            .flatMap(([k, x]) => x.cells.map((c): [string, string] =>
                [`top-atlas.info.json/${k}#${c.id}`, c.source])),
    ];
    for (const [where, src] of extra) {
        for (const bad of MAPO_BANNED_SOURCE_PREFIXES) {
            assert.ok(!src.includes(bad), `${where} 的素材来自 3D 侧：${src}`);
        }
        assert.ok(MAPO_2D_SOURCE_PREFIXES.some((ok) => src.startsWith(ok)),
            `${where} 的素材来源不在 2D 白名单里：${src}`);
        assert.ok(!src.startsWith("/"), `${where} 的 source 是本机绝对路径`);
        checked += 1;
    }
    // ⚠ 阈值随 M2-B1 下调：自创的 8 粗类 × 4 变体 × 3 档地表图集（96 条）已删。
    assert.ok(checked >= 60, `只校到 ${checked} 条 source，⛔ 像是白名单没覆盖到产物`);
});

test("mapOriginal 内容：选材清单 select.json ⛔ 不许再出现 3D 侧前缀", () => {
    // ⚠ 钉**入口**而不只是产物：产物是烘出来的，选材表才是「下次重烘会拿什么」的真源。
    const sel = JSON.parse(
        readFileSync(new URL("../../../tools/maporiginal-assets/select.json", import.meta.url))
            .toString("utf8")) as {
        groups: { kind: string; paths?: string[]; prefixes?: string[] }[];
    };
    for (const g of sel.groups) {
        for (const p of [...(g.paths ?? []), ...(g.prefixes ?? [])]) {
            for (const bad of MAPO_BANNED_SOURCE_PREFIXES) {
                assert.ok(!p.includes(bad), `select.json 的 ${g.kind} 组还指着 3D 侧：${p}`);
            }
        }
    }
});
