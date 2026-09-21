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
    palette: { id: number; name: string; passable: boolean; tiles: number }[];
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
    const counts = new Array<number>(16).fill(0);
    for (let i = MAPO_TERRAIN_HEADER_BYTES; i < raw.length; i += 1) counts[raw[i]] += 1;
    for (const e of info.palette) assert.equal(counts[e.id], e.tiles, `类 ${e.name} 计数`);
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

test("mapOriginal 内容：通行层是显示层的派生（river/mountain/water 三类不可通行）", () => {
    const display = kit("terrain.bytes");
    const pass = kit("terrain.pass.bytes");
    const idOf = new Map(info.palette.map((e) => [e.name, e.id]));
    const passIdOf = new Map(info.passPalette.map((e) => [e.name, e.id]));
    const expect = new Array<number>(16).fill(passIdOf.get("land")!);
    expect[idOf.get("river")!] = passIdOf.get("river")!;
    expect[idOf.get("mountain")!] = passIdOf.get("mountain")!;
    expect[idOf.get("water")!] = passIdOf.get("water")!;
    const n = display.length;
    for (let i = MAPO_TERRAIN_HEADER_BYTES; i < n; i += 1) {
        if (pass[i] !== expect[display[i]]) {
            assert.fail(`第 ${i - MAPO_TERRAIN_HEADER_BYTES} 格：显示类 ${display[i]} 应派生出通行类 `
                + `${expect[display[i]]}，实际 ${pass[i]}`);
        }
    }
    // ⚠ 通行层的四类里只有 land 可通行
    for (const e of info.passPalette) assert.equal(e.passable, e.name === "land", e.name);
});

test("mapOriginal 内容：图集布局 = shared 的 MAPO_ATLAS_* 常量（逐格）", () => {
    for (const lod of MAPO_ATLAS_LODS) {
        const meta = JSON.parse(kit(`atlas-lod${lod}.info.json`).toString("utf8")) as {
            cell: [number, number]; gutter: number; gridCols: number; variants: number;
            size: [number, number]; uv: string;
            cells: { id: number; classId: number; variant: number;
                     cell: [number, number, number, number] }[];
        };
        assert.deepEqual(meta.cell, [MAPO_ATLAS_CELL_W, MAPO_ATLAS_CELL_H], `lod${lod} 单格`);
        assert.equal(meta.gutter, MAPO_ATLAS_GUTTER);
        assert.equal(meta.gridCols, MAPO_ATLAS_COLS);
        assert.deepEqual(meta.size, [MAPO_ATLAS_W, MAPO_ATLAS_H]);
        assert.equal(meta.uv, "diamond-midpoints");
        // ⚠ 每类 4 个变体是**去「铺地砖」的契约**：少了它整片地会读作重复瓦片
        assert.equal(meta.variants, MAPO_ATLAS_VARIANTS, `lod${lod} 变体数`);
        assert.equal(meta.cells.length, info.palette.length * MAPO_ATLAS_VARIANTS);
        for (const c of meta.cells) {
            // ⚠ 漂了的症状是「地形对不上颜色」—— UV 整体错格，画面照样出，极难查
            assert.deepEqual(c.cell, [...mapoAtlasCellRect(c.id)], `lod${lod} 第 ${c.id} 格`);
            assert.equal(c.id, mapoAtlasCellId(c.classId, c.variant), `lod${lod} 格 id 编码`);
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
