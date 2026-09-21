import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
    loadSgzzTerrain, sgzzTerrainAt, sgzzIsPassable, sgzzInBounds, sgzzTerrainToBytes,
    sgzzDecodeBase64, sgzzDecodeRle, decodeSgzzTerrainRle,
    SGZZ_TERRAIN_HEADER_BYTES, SGZZ_MAP_ROWS, SGZZ_MAP_COLS,
    SGZZ_ATLAS_CELL_H, SGZZ_ATLAS_CELL_W, SGZZ_ATLAS_COLS, SGZZ_ATLAS_GUTTER,
    SGZZ_ATLAS_H, SGZZ_ATLAS_LODS, SGZZ_ATLAS_W, sgzzAtlasCellRect, sgzzAtlasUv,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_TERRAIN_COLS, SGZZ_TERRAIN_MAP_ID, SGZZ_TERRAIN_PALETTE,
    SGZZ_TERRAIN_RLE_B64, SGZZ_TERRAIN_ROWS, SGZZ_TERRAIN_SHA256,
} from "@game/shared/kits/sgzzmap/content/terrain.data";
import { terrainOf, resetSgzzTerrainCache, SGZZMAP_DEFAULT_MAP_ID } from "../src/kits/sgzzmap/content/terrain";
import { linksOf, resetSgzzLinksCache } from "../src/kits/sgzzmap/content/links";

const MAP = SGZZMAP_DEFAULT_MAP_ID;
const kitDir = new URL(`../../kits/sgzzmap/data/maps/${MAP}/`, import.meta.url);
const cocosDir = new URL(`../../Cocos/assets/resources/kits/sgzzmap/maps/${MAP}/`, import.meta.url);

test("sgzzmap content: 地形模块 AST 深度有界，避免 Creator 转换器栈溢出", () => {
    const source = readFileSync(new URL("../../shared/src/kits/sgzzmap/content/terrain.data.ts", import.meta.url), "utf8");
    const root = ts.createSourceFile("terrain.data.ts", source, ts.ScriptTarget.Latest, true);
    const pending: { node: ts.Node; depth: number }[] = [{ node: root, depth: 0 }];
    // 用迭代遍历检查，探针自身不能因旧版数千层字符串加法树而栈溢出。
    while (pending.length) {
        const { node, depth } = pending.pop()!;
        assert.ok(depth <= 64, "地形内容表达式过深：请避免用连续 + 拼接数千段数据");
        ts.forEachChild(node, child => { pending.push({ node: child, depth: depth + 1 }); });
    }
});

test("sgzzmap content: Creator 资源与 kit 源逐字节一致（全部文件，不只是地形）", () => {
    // ⚠ 地形不进 Cocos：它以 shared TS 模块进两端（见下一条用例），⛔ 不再多存一份二进制。
    const KIT_ONLY = new Set(["terrain.bytes", "terrain.info.json"]);
    const kitFiles = readdirSync(kitDir).sort();
    const mirrored = kitFiles.filter((f) => !KIT_ONLY.has(f));
    const cocosFiles = readdirSync(cocosDir).filter((f) => !f.endsWith(".meta")).sort();
    // 防截断下限。⚠ 15 = 地形 2 + regions 1 + 图集 3×2 + plate 2×2 + 缩略图 2；
    //   ⛔ 没有 atlas-lod3（地表层门控 hideAtLod:2，LOD3 起用整幅底图），早先那张从没人消费。
    assert.ok(kitFiles.length >= 15, `kit 数据文件过少：${kitFiles.length}`);
    assert.deepEqual(cocosFiles, mirrored, "除地形外，两处文件清单必须一致");
    for (const name of KIT_ONLY) {
        assert.ok(kitFiles.includes(name), `${name} 必须留在 kit 数据目录作权威产物`);
    }
    for (const name of mirrored) {
        const source = readFileSync(new URL(name, kitDir));
        const resource = readFileSync(new URL(name, cocosDir));
        // ⚠ 用 Buffer.compare，⛔ 不要 assert.equal —— 2.25MB 不一致时 node 会去渲染 diff
        assert.equal(Buffer.compare(resource, source), 0, `Creator 资源必须逐字节镜像 kit 源：${name}`);
    }
    for (const name of cocosFiles) {
        const meta = JSON.parse(readFileSync(new URL(`${name}.meta`, cocosDir), "utf8")) as { uuid?: string };
        assert.match(String(meta.uuid), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            `${name}.meta 的 uuid 形状不对`);
    }
});

test("sgzzmap content: terrain.bytes 长度、头、指纹与调色板自洽", () => {
    const bytes = readFileSync(new URL("terrain.bytes", kitDir));
    const meta = JSON.parse(readFileSync(new URL("terrain.info.json", kitDir), "utf8")) as {
        maxRow: number; maxCol: number; byteLength: number; sha256: string;
        palette: { id: number; passable: boolean }[];
    };
    assert.equal(meta.maxRow, SGZZ_MAP_ROWS);
    assert.equal(meta.maxCol, SGZZ_MAP_COLS);
    assert.equal(bytes.byteLength, SGZZ_TERRAIN_HEADER_BYTES + meta.maxRow * meta.maxCol);
    assert.equal(bytes.byteLength, 2250008);
    assert.equal(meta.byteLength, bytes.byteLength);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), meta.sha256, "内容指纹必须钉住 terrain.bytes");
    assert.equal(bytes.readUInt32BE(0), meta.maxRow, "头 4 字节大端 rows");
    assert.equal(bytes.readUInt32BE(4), meta.maxCol, "头 4 字节大端 cols");
    assert.ok(meta.palette.some((p) => p.passable), "必须有可通行地形");
    assert.ok(meta.palette.some((p) => !p.passable), "必须有不可通行地形");
});

test("sgzzmap content: shared RLE 模块解出来与权威 terrain.bytes 逐字节相同", () => {
    // ★ 这是整条内容链路的锚：kit 服务端不能读盘，地形只能从 shared TS 模块进来，
    //   所以必须机检「派生模块 === 权威产物」，⛔ 否则两者会悄悄漂移。
    const authoritative = readFileSync(new URL("terrain.bytes", kitDir));
    const decoded = decodeSgzzTerrainRle({
        mapId: SGZZ_TERRAIN_MAP_ID, rows: SGZZ_TERRAIN_ROWS, cols: SGZZ_TERRAIN_COLS,
        palette: SGZZ_TERRAIN_PALETTE, rle: SGZZ_TERRAIN_RLE_B64,
    });
    const rebuilt = Buffer.from(sgzzTerrainToBytes(decoded));
    assert.equal(Buffer.compare(rebuilt, authoritative), 0, "shared 模块必须逐字节还原 terrain.bytes");
    assert.equal(createHash("sha256").update(rebuilt).digest("hex"), SGZZ_TERRAIN_SHA256,
        "shared 模块登记的 sha256 必须与还原字节一致");
    const meta = JSON.parse(readFileSync(new URL("terrain.info.json", kitDir), "utf8")) as { sha256: string };
    assert.equal(SGZZ_TERRAIN_SHA256, meta.sha256, "shared 模块与内容包登记的指纹必须一致");
});

test("sgzzmap content: base64 / varint-RLE 解码器 fail-closed", () => {
    assert.deepEqual([...sgzzDecodeBase64("AAECAw==")], [0, 1, 2, 3]);
    assert.throws(() => sgzzDecodeBase64("AA*A"), "字母表外的字符必须拒");
    // 一个 run：值 7、长度 4
    assert.deepEqual([...sgzzDecodeRle(new Uint8Array([7, 4]), 2, 2)], [7, 7, 7, 7]);
    assert.throws(() => sgzzDecodeRle(new Uint8Array([7, 3]), 2, 2), "填不满必须拒");
    assert.throws(() => sgzzDecodeRle(new Uint8Array([7, 5]), 2, 2), "填过头必须拒");
    assert.throws(() => sgzzDecodeRle(new Uint8Array([7]), 2, 2), "截断的 varint 必须拒");
    assert.throws(() => sgzzDecodeRle(new Uint8Array([7, 0x80, 0x80, 0x80, 0x80, 0x80]), 2, 2),
        "无限 varint 必须拒");
});

test("sgzzmap content: terrainOf 懒加载、按进程缓存、O(1) 取值", () => {
    resetSgzzTerrainCache();
    const t = terrainOf(MAP);
    assert.equal(t.mapId, MAP);
    assert.equal(t.maxRow, SGZZ_MAP_ROWS);
    assert.equal(t.cells.length, SGZZ_MAP_ROWS * SGZZ_MAP_COLS);
    assert.equal(terrainOf(MAP), t, "同一进程内必须复用同一份，⛔ 不要每次读盘");

    // 逐格取值与底层缓冲一致
    for (const [row, col] of [[0, 0], [0, 1499], [1499, 0], [1499, 1499], [750, 750], [123, 987]]) {
        assert.equal(sgzzTerrainAt(t, row, col), t.cells[row * t.maxCol + col]);
        assert.equal(sgzzIsPassable(t, row, col), t.passable[sgzzTerrainAt(t, row, col)] === 1);
    }
    assert.throws(() => sgzzTerrainAt(t, -1, 0));
    assert.throws(() => sgzzTerrainAt(t, 0, SGZZ_MAP_COLS));

    // 内容体检：可通行格必须占多数，且不可通行格确实存在（否则占领/行军闸形同虚设）
    let passable = 0;
    for (let i = 0; i < t.cells.length; i += 997) if (t.passable[t.cells[i]] === 1) passable += 1;
    const sampled = Math.ceil(t.cells.length / 997);
    assert.ok(passable / sampled > 0.5, "可通行格应占多数");
    assert.ok(passable / sampled < 0.95, "必须有成规模的不可通行地形");
    assert.ok(sgzzInBounds(0, 0, t.maxRow, t.maxCol));
});

test("sgzzmap content: loadSgzzTerrain fail-closed", () => {
    const bytes = readFileSync(new URL("terrain.bytes", kitDir));
    const meta = JSON.parse(readFileSync(new URL("terrain.info.json", kitDir), "utf8")) as Record<string, unknown>;
    const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert.ok(loadSgzzTerrain(u8, meta), "合法内容必须通过");

    const truncated = u8.subarray(0, u8.length - 1);
    assert.throws(() => loadSgzzTerrain(truncated, meta), "长度不符必须拒");

    const wrongHeader = u8.slice();
    wrongHeader[3] = 0;
    assert.throws(() => loadSgzzTerrain(wrongHeader, meta), "头与 meta 不符必须拒");

    const unknownId = u8.slice();
    unknownId[SGZZ_TERRAIN_HEADER_BYTES + 12345] = 15;
    assert.throws(() => loadSgzzTerrain(unknownId, meta), "调色板外的地形 id 必须拒");

    assert.throws(() => loadSgzzTerrain(u8, { ...meta, palette: [] }), "空调色板必须拒");
    assert.throws(() => loadSgzzTerrain(u8, { ...meta, maxRow: 1499 }), "尺寸不符必须拒");
    assert.throws(() => loadSgzzTerrain(u8, { ...meta, extra: 1 }), "多余键必须拒");
    assert.throws(() => loadSgzzTerrain(u8, null), "非对象必须拒");
});

test("sgzzmap content: linksOf 空表 = 本图没有长程链接，⛔ 不是错误", () => {
    resetSgzzLinksCache();
    const links = linksOf(MAP);
    assert.equal(links.size, 0, "v1 内容包没有长程链接");
    assert.equal(linksOf(MAP), links, "同样按进程缓存");
});

test("sgzzmap content: ★ 图集布局 —— 打包脚本写的 info.json 与 shared 常量逐格一致", () => {
    // ⚠ 两边漂了的症状是「地形对不上颜色」：UV 整体错格，画面还照样出，极难查。
    //   所以拿 kit 数据目录里的成品 info.json 与 shared 的 SGZZ_ATLAS_* 硬比。
    const dir = "../../apps/kits/sgzzmap/data/maps/zhongyuan";
    for (const lod of SGZZ_ATLAS_LODS) {
        const info = JSON.parse(readFileSync(`${dir}/atlas-lod${lod}.info.json`, "utf8")) as {
            cell: [number, number]; gutter: number; gridCols: number; size: [number, number];
            uv: string; cells: { id: number; name: string; cell: [number, number, number, number] }[];
        };
        assert.deepEqual(info.cell, [SGZZ_ATLAS_CELL_W, SGZZ_ATLAS_CELL_H], `lod${lod} 单格尺寸`);
        assert.equal(info.gutter, SGZZ_ATLAS_GUTTER, `lod${lod} 出血带`);
        assert.equal(info.gridCols, SGZZ_ATLAS_COLS, `lod${lod} 列数`);
        assert.deepEqual(info.size, [SGZZ_ATLAS_W, SGZZ_ATLAS_H], `lod${lod} 图集尺寸`);
        assert.equal(info.uv, "diamond-midpoints", `lod${lod} UV 约定`);
        assert.equal(info.cells.length, SGZZ_TERRAIN_PALETTE.length, `lod${lod} 格数 = 地形数`);
        for (const cell of info.cells) {
            assert.equal(cell.name, SGZZ_TERRAIN_PALETTE[cell.id].name, `lod${lod} 第 ${cell.id} 格的地形名`);
            assert.deepEqual(cell.cell, [...sgzzAtlasCellRect(cell.id)], `lod${lod} 第 ${cell.id} 格的矩形`);
        }
    }
    // 出血带真的在：相邻两格之间至少隔 2×GUTTER，⛔ 贴边会被双线性采样串色
    const a = sgzzAtlasCellRect(0), b = sgzzAtlasCellRect(1);
    assert.equal(b[0] - (a[0] + a[2]), SGZZ_ATLAS_GUTTER * 2);
    // 每格都在图集内
    for (let id = 0; id < SGZZ_TERRAIN_PALETTE.length; id += 1) {
        const [x, y, w, h] = sgzzAtlasCellRect(id);
        assert.ok(x - SGZZ_ATLAS_GUTTER >= 0 && x + w + SGZZ_ATLAS_GUTTER <= SGZZ_ATLAS_W, `第 ${id} 格横向越界`);
        assert.ok(y - SGZZ_ATLAS_GUTTER >= 0 && y + h + SGZZ_ATLAS_GUTTER <= SGZZ_ATLAS_H, `第 ${id} 格纵向越界`);
        const uv = sgzzAtlasUv(id);
        assert.ok(uv.every((v) => v >= 0 && v <= 1), `第 ${id} 格 UV 越界`);
    }
    // ⛔ 没有 atlas-lod3：地表层门控 hideAtLod:2，LOD3 起改用整幅底图
    assert.throws(() => readFileSync(`${dir}/atlas-lod3.info.json`), /ENOENT/u);
});
