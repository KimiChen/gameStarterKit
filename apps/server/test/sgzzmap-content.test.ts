import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import {
    loadSgzzTerrain, sgzzTerrainAt, sgzzIsPassable, sgzzInBounds,
    SGZZ_TERRAIN_HEADER_BYTES, SGZZ_MAP_ROWS, SGZZ_MAP_COLS,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";
import { terrainOf, resetSgzzTerrainCache, SGZZMAP_DEFAULT_MAP_ID } from "../src/kits/sgzzmap/content/terrain";
import { linksOf, resetSgzzLinksCache } from "../src/kits/sgzzmap/content/links";

const MAP = SGZZMAP_DEFAULT_MAP_ID;
const kitDir = new URL(`../../kits/sgzzmap/data/maps/${MAP}/`, import.meta.url);
const cocosDir = new URL(`../../Cocos/assets/resources/kits/sgzzmap/maps/${MAP}/`, import.meta.url);

test("sgzzmap content: Creator 资源与 kit 源逐字节一致（全部文件，不只是地形）", () => {
    const kitFiles = readdirSync(kitDir).sort();
    const cocosFiles = readdirSync(cocosDir).filter((f) => !f.endsWith(".meta")).sort();
    assert.ok(kitFiles.length >= 17, `kit 数据文件过少：${kitFiles.length}`);
    assert.deepEqual(cocosFiles, kitFiles, "两处文件清单必须一致");
    for (const name of kitFiles) {
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

test("sgzzmap content: linksOf 缺文件 = 本图没有长程链接，⛔ 不是错误", () => {
    resetSgzzLinksCache();
    const links = linksOf(MAP);
    assert.equal(links.size, 0, "当前内容包未附 links.json");
    assert.equal(linksOf(MAP), links, "同样按进程缓存");
});
