import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import {
    decodeMapoTerrainRle, mapoAtlasCellId, mapoAtlasCellRect, mapoAtlasUv, mapoTerrainToBytes,
    MAPO_ATLAS_CELL_H, MAPO_ATLAS_CELL_W, MAPO_ATLAS_COLS, MAPO_ATLAS_GUTTER,
    MAPO_ATLAS_H, MAPO_ATLAS_LODS, MAPO_ATLAS_VARIANTS, MAPO_ATLAS_W, MAPO_MAP_COLS, MAPO_MAP_ROWS,
    MAPO_TERRAIN_HEADER_BYTES, MAPO_ORIGINAL_TILE_HALF_W, MAPO_REGION_D_BIAS,
    MAPO_REGION_HEADER_BYTES, MAPO_REGION_RECORD_BYTES, mapoGrid2Pos, mapoRegionPos,
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
    MAPO_DECOR_CELL_W, MAPO_DECOR_CITY_BASE,
} from "@game/shared/kits/mapOriginal/content/decor.data";
import {
    MAPO_REGION_ATLAS_H, MAPO_REGION_ATLAS_W, MAPO_REGION_CELLS, MAPO_REGION_CELL_H,
    MAPO_REGION_CELL_W,
} from "@game/shared/kits/mapOriginal/content/region.data";
import {
    MAPO_CITY_CELL_COUNTS, MAPO_CITY_CELL_KEYS, MAPO_CITY_SITES,
} from "@game/shared/kits/mapOriginal/content/labels.data";

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
        else if (v === 60 || v === 61) assert.equal(p, MOUNTAIN, `第 ${at} 格是山脉锚点却不挡路`);
        else if (v === 0) assert.ok(p === LAND || p === MOUNTAIN, `第 ${at} 格覆盖格的通行类 ${p} 非法`);
        else assert.equal(p, LAND, `第 ${at} 格原版值 ${v} 不该挡路，实际 ${p}`);
        if (p === MOUNTAIN) blocked += 1;
    }
    // ★ 挡路格数必须等于覆盖掩码里 60/61 的格数（两份产物互证）
    const regionsMeta = JSON.parse(kit("regions.info.json").toString("utf8")) as
        { coverMask: Record<string, number> };
    assert.equal(blocked, regionsMeta.coverMask["60/61 覆盖格"],
        "挡路格数 == res_multi ∈ {60,61} 的格数");
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
        anchor: string; cityBase: number; substitutions: (number | string)[];
        cells: { id: number; kind: string; cell: [number, number, number, number];
                 art: [number, number, number, number]; native: [number, number];
                 scale: [number, number]; offset: [number, number]; angle: number;
                 pivot: [number, number]; lowZ: number; source: string }[];
    };
    assert.deepEqual(meta.cell, [MAPO_DECOR_CELL_W, MAPO_DECOR_CELL_H]);
    assert.deepEqual(meta.size, [MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H]);
    assert.equal(meta.cityBase, MAPO_DECOR_CITY_BASE);
    // ⚠ 锚点是底边中点：地物立在菱形中心上，⛔ 不是几何中心
    assert.equal(meta.anchor, "bottom-center");
    assert.equal(meta.cells.length, MAPO_DECOR_CELLS.length);

    const byId = new Map(MAPO_DECOR_CELLS.map((c) => [c.id, c]));
    for (const c of meta.cells) {
        const shared = byId.get(c.id);
        assert.ok(shared, `摆件格 ${c.id} 必须进 shared`);
        assert.deepEqual([...shared.cell], c.cell, `摆件格 ${c.id} 画布`);
        assert.deepEqual([...shared.art], c.art, `摆件格 ${c.id} 图内矩形`);
        // ★ 件多大由**原图像素**定（原版一格 300 px），⛔ 不按格宽拉伸 —— 等级差就在这上面
        assert.deepEqual([...shared.native], c.native, `摆件格 ${c.id} 原图像素`);
        assert.ok(c.native[0] > 0 && c.native[1] > 0, `摆件格 ${c.id} 原图像素非法`);
        // 纵横比必须与图集里的一致（缩略图保比例），⛔ 漂了就是件被压扁/拉长
        assert.ok(Math.abs(c.native[0] / c.native[1] - c.art[2] / c.art[3]) < 0.02,
            `摆件格 ${c.id} 缩略图没保住纵横比`);
        // ⚠ 存证不许写本机绝对路径（会随机器漂、且泄漏路径）
        assert.ok(!c.source.startsWith("/"), `摆件格 ${c.id} 的 source 必须是仓外相对路径`);
        const [ax, ay, aw, ah] = c.art;
        assert.ok(ax >= 0 && ay >= 0 && ax + aw <= MAPO_DECOR_CELL_W && ay + ah <= MAPO_DECOR_CELL_H,
            `摆件格 ${c.id} 图内矩形越界`);
    }
    // ★ 这条才是「按原游戏参数摆放」的机检：**每个资源/金矿值都得有自己的一张图**，
    //   ⛔ 少一个就会在近档出现「这一格什么都没有」的空地，而原版那里是有 res_field 的。
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

test("mapOriginal 内容：图集布局 = shared 的 MAPO_ATLAS_* 常量（逐格）", () => {
    for (const lod of MAPO_ATLAS_LODS) {
        const meta = JSON.parse(kit(`atlas-lod${lod}.info.json`).toString("utf8")) as {
            cell: [number, number]; gutter: number; gridCols: number; variants: number;
            size: [number, number]; uv: string;
            kinds: string[];
            cells: { id: number; kindId: number; kind: string; variant: number;
                     cell: [number, number, number, number] }[];
        };
        assert.deepEqual(meta.cell, [MAPO_ATLAS_CELL_W, MAPO_ATLAS_CELL_H], `lod${lod} 单格`);
        assert.equal(meta.gutter, MAPO_ATLAS_GUTTER);
        assert.equal(meta.gridCols, MAPO_ATLAS_COLS);
        assert.deepEqual(meta.size, [MAPO_ATLAS_W, MAPO_ATLAS_H]);
        assert.equal(meta.uv, "diamond-midpoints");
        // ⚠ 每类 4 个变体是**去「铺地砖」的契约**：少了它整片地会读作重复瓦片
        assert.equal(meta.variants, MAPO_ATLAS_VARIANTS, `lod${lod} 变体数`);
        // ★ 地表图集按**粗类**建（不是按 61 个原版值）：等级差由摆件层体现
        assert.deepEqual(meta.kinds, [...MAPO_VALUE_KINDS], `lod${lod} 粗类表`);
        assert.equal(meta.cells.length, MAPO_VALUE_KINDS.length * MAPO_ATLAS_VARIANTS);
        for (const c of meta.cells) {
            // ⚠ 漂了的症状是「地形对不上颜色」—— UV 整体错格，画面照样出，极难查
            assert.deepEqual(c.cell, [...mapoAtlasCellRect(c.id)], `lod${lod} 第 ${c.id} 格`);
            assert.equal(c.id, mapoAtlasCellId(c.kindId, c.variant), `lod${lod} 格 id 编码`);
            assert.equal(c.kindId, MAPO_VALUE_KINDS.indexOf(c.kind), `lod${lod} 粗类 id`);
            const uv = mapoAtlasUv(c.id);
            assert.ok(uv[0] >= 0 && uv[1] >= 0 && uv[0] + uv[2] <= 1 && uv[1] + uv[3] <= 1);
        }
    }
});

test("mapOriginal 内容：kit 数据目录与 Cocos 运行时镜像逐字节一致", () => {
    const mirrored: [string, string][] = [
        // ⚠ 运行时镜像用 Cocos 的规范缓冲扩展名 `.bin`（权威产物仍叫 terrain.bytes）：
        //   镜像叫 .bytes 而 .meta 写 [".bin"] 时 Creator 会导出 `_native: ".bin"`，
        //   与库里的 .bytes 对不上 ⇒ 运行时「the native asset is missing」。
        ["terrain.bytes", "terrain.bin"],
        ...MAPO_ATLAS_LODS.flatMap((l): [string, string][] =>
            [[`atlas-lod${l}.png`, `atlas-lod${l}.png`], [`atlas-lod${l}.info.json`, `atlas-lod${l}.info.json`]]),
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
                        "regions.info.json"]) {
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
    let anchors = 0;
    for (const e of info.palette) if (e.id >= 48 && e.id <= 61) anchors += e.tiles;
    assert.equal(anchors, 55127, "48..61 锚点必须是 55,127 格");
    assert.ok(!byId.has(56), "值 56（山9）在原版数据里 0 命中，⛔ 不该出现在调色板里");
    // ★ 通行层的山地 = res_multi ∈ {60,61} 的**整片足迹**（[推断]：覆盖格继承多格 land 的 is_block）
    const mountainPass = info.passPalette.find((e) => e.name === "mountain")!.tiles;
    const regions = JSON.parse(kit("regions.info.json").toString("utf8")) as
        { coverMask: Record<string, number> };
    assert.equal(mountainPass, regions.coverMask["60/61 覆盖格"],
        "不可通行山地格数 == 60/61 的覆盖掩码格数");
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
        cells: { id: number; kind: string; cell: [number, number, number, number];
                 art: [number, number, number, number]; native: [number, number];
                 scale: [number, number]; offset: [number, number]; angle: number;
                 pivot: [number, number]; lowZ: number; source: string }[];
    };
    assert.deepEqual(meta.cell, [MAPO_REGION_CELL_W, MAPO_REGION_CELL_H]);
    assert.deepEqual(meta.size, [MAPO_REGION_ATLAS_W, MAPO_REGION_ATLAS_H]);
    assert.equal(meta.anchor, "bottom-center");
    assert.equal(meta.cells.length, MAPO_REGION_CELLS.length);
    const byId = new Map(MAPO_REGION_CELLS.map((c) => [c.id, c]));
    for (const c of meta.cells) {
        const shared = byId.get(c.id);
        assert.ok(shared, `区域件格 ${c.id} 必须进 shared`);
        assert.equal(shared.kind, c.kind);
        assert.deepEqual([...shared.cell], c.cell);
        assert.deepEqual([...shared.art], c.art);
        assert.deepEqual([...shared.native], c.native, `区域件格 ${c.id} 原图像素`);
        // ★ M0-B2：件的大小 = 原图像素 × prefab 里的 scale，⛔ 只抄像素会把 14 形压成 10 形
        assert.deepEqual([...shared.scale], c.scale, `区域件格 ${c.id} 的 scale`);
        assert.deepEqual([...shared.offset], c.offset, `区域件格 ${c.id} 的 offset`);
        assert.equal(shared.angle, c.angle, `区域件格 ${c.id} 的 angle`);
        assert.deepEqual([...shared.pivot], c.pivot, `区域件格 ${c.id} 的 pivot`);
        assert.ok(c.scale[0] > 0.1 && c.scale[0] < 8 && c.scale[1] > 0.1 && c.scale[1] < 8,
            `区域件格 ${c.id} 的 scale ${c.scale} 不在 (0.1, 8.0) 内`);
        // ⚠ 原版 sprite 的 pivot 恒中心；位置换算（中心 → 底边中点）就建在这条上
        assert.deepEqual(c.pivot, [0.5, 0.5], `区域件格 ${c.id} 的 pivot 不是中心`);
        assert.ok(Math.abs(c.native[0] / c.native[1] - c.art[2] / c.art[3]) < 0.02,
            `区域件格 ${c.id} 缩略图没保住纵横比`);
        // ★ 件在世界里的**实际**宽度 = 原图像素 × scale ÷ 一格 300 px。
        //   ⚠ 必须随足迹单调放大：19 格的形只用 native 只有 1.88 格（比 7 格的形还小），
        //   补上 scale 后才是 4.06 格 —— 这条就是为 M0-B3.3 的那个缺陷设的。
        const tiles = (c.native[0] * c.scale[0]) / (MAPO_ORIGINAL_TILE_HALF_W * 2);
        assert.ok(tiles > 0.9 && tiles < 5,
            `区域件格 ${c.id} 在原版里占 ${tiles.toFixed(2)} 格，不像地物`);
        const want = new Map<number, readonly [number, number]>([
            [1, [0.9, 1.4]], [2, [1.2, 2.1]], [4, [1.7, 2.4]], [7, [2.2, 3.0]], [19, [3.8, 4.6]],
        ]);
        const fp = byId.get(c.id)!.footprintCells;
        const band = want.get(fp)!;
        assert.ok(tiles >= band[0] && tiles <= band[1],
            `区域件格 ${c.id}（足迹 ${fp} 格）宽 ${tiles.toFixed(2)} 格，不在 ${band} 内`);
        const [ax, ay, aw, ah] = c.art;
        assert.ok(ax >= 0 && ay >= 0 && ax + aw <= MAPO_REGION_CELL_W
            && ay + ah <= MAPO_REGION_CELL_H, `区域件格 ${c.id} 图内矩形越界`);
        // ⚠ 素材全部来自原版切片，⛔ 存证不许写本机绝对路径
        assert.ok(!c.source.startsWith("/"), `区域件格 ${c.id} 的 source 必须是仓外相对路径`);
        assert.ok(c.source.startsWith("scene/"), `区域件格 ${c.id} 的 source 必须是原版资源路径`);
    }
    // ★ M0-B3：山体美术必须是**基础季**，⛔ 不是秋季（grass_fall_new）
    for (const c of meta.cells) {
        assert.ok(c.source.startsWith("scene/ground/mountain_new/png/"),
            `区域件格 ${c.id} 的 source ${c.source} 不是基础季山体`);
        assert.ok(!c.source.includes("grass_fall"), `区域件格 ${c.id} 还指着秋季件`);
    }
    // ★ M0-B1：原版 48..61 是**一族 14 形**（山1..山14，§3.2），山9（值 56）无 2D prefab
    //   且数据里 0 命中 ⇒ 格 id 集合必须精确等于 48..61 去掉 56。
    //   ⛔ 早先按「山脉 / 林丛 / 散落」三族分是本仓自创的分类。
    const want: number[] = [];
    for (let v = 48; v <= 61; v += 1) if (v !== 56) want.push(v);
    assert.deepEqual(MAPO_REGION_CELLS.map((c) => c.id).slice().sort((a, b) => a - b), want,
        "件的格 id 必须精确是原版山族值 48..61（⛔ 无 56）");
    for (const c of MAPO_REGION_CELLS) {
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
    // ⚠ 跟着 `MAPO_ATLAS_LODS` 走，⛔ 不硬编码档数 —— 新增一档图集会静默逃逸出校验集。
    // ⚠ 也 ⛔ 不用 readdirSync 全枚举：那会把「这几个必须被校」的显式契约换成
    //   「目录里有什么校什么」，产物被删/改名后同样静默退出。
    const files = [...MAPO_ATLAS_LODS.map((l) => `atlas-lod${l}.info.json`),
                   "decor-atlas.info.json", "region-atlas.info.json"];
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
    assert.ok(checked >= 100, `只校到 ${checked} 条 source，⛔ 像是白名单没覆盖到产物`);
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
