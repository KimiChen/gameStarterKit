import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
    decodeMapoTerrainRle, mapoAtlasCellId, mapoAtlasCellRect, mapoAtlasUv, mapoTerrainToBytes,
    MAPO_ATLAS_CELL_H, MAPO_ATLAS_CELL_W, MAPO_ATLAS_COLS, MAPO_ATLAS_GUTTER,
    MAPO_ATLAS_H, MAPO_ATLAS_LODS, MAPO_ATLAS_VARIANTS, MAPO_ATLAS_W, MAPO_MAP_COLS, MAPO_MAP_ROWS,
    MAPO_TERRAIN_HEADER_BYTES,
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
    // ★ 派生规则只看**粗类**：river → 河、mountain → 山、其余 → 可走陆地
    const expect = new Array<number>(256).fill(passIdOf.get("land")!);
    for (const e of info.palette) {
        if (e.kind === "river") expect[e.id] = passIdOf.get("river")!;
        else if (e.kind === "mountain") expect[e.id] = passIdOf.get("mountain")!;
    }
    const n = display.length;
    for (let i = MAPO_TERRAIN_HEADER_BYTES; i < n; i += 1) {
        if (pass[i] !== expect[display[i]]) {
            assert.fail(`第 ${i - MAPO_TERRAIN_HEADER_BYTES} 格：原版值 ${display[i]} 应派生出通行类 `
                + `${expect[display[i]]}，实际 ${pass[i]}`);
        }
    }
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
                 art: [number, number, number, number]; source: string }[];
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
    ];
    for (const [src, dst] of mirrored) {
        assert.deepEqual(kit(src), cocos(dst), `${src} → ${dst} 两处必须逐字节一致`);
    }
    // ⚠ 通行层与 info 只留 kit 数据目录：⛔ 不多存一份到运行时
    for (const name of ["terrain.pass.bytes", "terrain.info.json", "terrain.bytes", "labels.json"]) {
        assert.throws(() => cocos(name), /ENOENT/, `${name} ⛔ 不该进 Cocos`);
    }
});
