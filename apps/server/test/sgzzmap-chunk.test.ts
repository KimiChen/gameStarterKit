import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_MAX_ZOOM_CHUNKS, SGZZ_MAX_ZOOM_LEVEL, SGZZ_ZOOM_CHUNK_TILES,
    sgzzZoomChunkCols, sgzzZoomChunkKey, sgzzZoomChunkOrigin, sgzzZoomChunkRows,
    sgzzZoomChunkTiles, sgzzZoomRectForCenter, validateSgzzChunkSummary, validateSgzzZoomRect,
} from "@game/shared/kits/sgzzmap/api/chunk/index";
import { validateSgzzZoomReq, validateSgzzZoomRes } from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { SGZZ_MAP_COLS, SGZZ_MAP_ROWS } from "@game/shared/kits/sgzzmap/api/hexmap/index";

test("sgzzmap chunk: 三档边长与分块数，最粗档整张图进得来", () => {
    assert.deepEqual([...SGZZ_ZOOM_CHUNK_TILES], [20, 40, 60]);
    assert.equal(SGZZ_MAX_ZOOM_LEVEL, 2);
    for (let level = 0; level <= SGZZ_MAX_ZOOM_LEVEL; level += 1) {
        const size = sgzzZoomChunkTiles(level);
        assert.equal(sgzzZoomChunkRows(level), Math.ceil(SGZZ_MAP_ROWS / size));
        assert.equal(sgzzZoomChunkCols(level), Math.ceil(SGZZ_MAP_COLS / size));
    }
    // 最粗档整张图 25×25=625 块 ≤ 1024 ⇒ 一次请求就能画完全世界
    const coarse = sgzzZoomChunkRows(SGZZ_MAX_ZOOM_LEVEL) * sgzzZoomChunkCols(SGZZ_MAX_ZOOM_LEVEL);
    assert.equal(coarse, 625);
    assert.ok(coarse <= SGZZ_MAX_ZOOM_CHUNKS, "最粗档整图必须能一次请求");
    // 最细档整图 75×75=5625 > 1024 ⇒ 必须分窗，⛔ 不给一次拉全图
    const fine = sgzzZoomChunkRows(0) * sgzzZoomChunkCols(0);
    assert.ok(fine > SGZZ_MAX_ZOOM_CHUNKS, "最细档整图必须拉不动（否则体积闸形同虚设）");
    assert.throws(() => sgzzZoomChunkTiles(-1));
    assert.throws(() => sgzzZoomChunkTiles(SGZZ_MAX_ZOOM_LEVEL + 1));
});

test("sgzzmap chunk: key 与 origin 互逆，整张图不漏格不重格", () => {
    for (let level = 0; level <= SGZZ_MAX_ZOOM_LEVEL; level += 1) {
        const size = sgzzZoomChunkTiles(level);
        for (const [row, col] of [[0, 0], [1499, 1499], [750, 750], [size - 1, size - 1], [size, size]]) {
            const key = sgzzZoomChunkKey(level, row, col);
            const origin = sgzzZoomChunkOrigin(level, key);
            assert.ok(row >= origin.row && row < origin.row + size, `row ${row} 不在块内`);
            assert.ok(col >= origin.col && col < origin.col + size, `col ${col} 不在块内`);
            assert.equal(sgzzZoomChunkKey(level, origin.row, origin.col), key, "origin 必须回到同一块");
        }
        // 同一块内的格 key 相同，跨块必不同
        assert.equal(sgzzZoomChunkKey(level, 0, 0), sgzzZoomChunkKey(level, size - 1, size - 1));
        assert.notEqual(sgzzZoomChunkKey(level, 0, 0), sgzzZoomChunkKey(level, 0, size));
        assert.notEqual(sgzzZoomChunkKey(level, 0, 0), sgzzZoomChunkKey(level, size, 0));
    }
    assert.throws(() => sgzzZoomChunkKey(0, -1, 0));
    assert.throws(() => sgzzZoomChunkKey(0, 0, SGZZ_MAP_COLS));
});

test("sgzzmap chunk: 以中心取窗会按档边界收口，⛔ 不越界", () => {
    for (let level = 0; level <= SGZZ_MAX_ZOOM_LEVEL; level += 1) {
        const rows = sgzzZoomChunkRows(level), cols = sgzzZoomChunkCols(level);
        for (const [row, col] of [[0, 0], [1499, 1499], [750, 750]]) {
            const rect = sgzzZoomRectForCenter(level, row, col, 3);
            assert.ok(rect.minRow >= 0 && rect.minCol >= 0);
            assert.ok(rect.maxRow < rows && rect.maxCol < cols);
            assert.ok(rect.minRow <= rect.maxRow && rect.minCol <= rect.maxCol);
        }
        // 半径大到覆盖全图也不得越界
        const all = sgzzZoomRectForCenter(level, 750, 750, 9999);
        assert.deepEqual(all, { minRow: 0, minCol: 0, maxRow: rows - 1, maxCol: cols - 1 });
    }
});

test("sgzzmap chunk: 窗与摘要 fail-closed", () => {
    assert.doesNotThrow(() => validateSgzzZoomRect({ minRow: 0, minCol: 0, maxRow: 1, maxCol: 1 }, 2));
    assert.throws(() => validateSgzzZoomRect({ minRow: 1, minCol: 0, maxRow: 0, maxCol: 1 }, 2), "逆序窗");
    assert.throws(() => validateSgzzZoomRect({ minRow: 0, minCol: 0, maxRow: 999, maxCol: 999 }, 2), "越界");
    // 最细档一次拉 33×33 > 1024 必须拒
    assert.throws(() => validateSgzzZoomRect({ minRow: 0, minCol: 0, maxRow: 32, maxCol: 32 }, 0), "超块数上限");

    const maxTiles = 60 * 60;
    assert.doesNotThrow(() => validateSgzzChunkSummary({ key: 1, tiles: 9, alliance: 0, top: 5 }, 1, maxTiles));
    assert.throws(() => validateSgzzChunkSummary({ key: 1, tiles: 3, alliance: 0, top: 5 }, 1, maxTiles),
        "top ⛔ 不得大于 tiles");
    assert.throws(() => validateSgzzChunkSummary({ key: 1, tiles: 9, alliance: 1, top: 5 }, 1, maxTiles),
        "alliance 下标越界");
    assert.throws(() => validateSgzzChunkSummary({ key: 1, tiles: 0, alliance: -1, top: 1 }, 1, maxTiles),
        "空块⛔不该出现在响应里");
    assert.throws(() => validateSgzzChunkSummary({ key: 1, tiles: 9, alliance: -1, top: 5, extra: 1 }, 1, maxTiles),
        "多余键");
});

test("sgzzmap chunk: 线型校验 —— 分块按 key 升序且不得重复", () => {
    const rect = { minRow: 0, minCol: 0, maxRow: 1, maxCol: 1 };
    assert.doesNotThrow(() => validateSgzzZoomReq({ level: 2, rect }));
    assert.throws(() => validateSgzzZoomReq({ level: 3, rect }), "档位越界");
    assert.throws(() => validateSgzzZoomReq({ level: 2, rect, extra: 1 }), "多余键");

    const base = { level: 2, rect, revision: 1, alliances: ["a1"] };
    assert.doesNotThrow(() => validateSgzzZoomRes({
        ...base, chunks: [{ key: 1, tiles: 2, alliance: 0, top: 2 }, { key: 5, tiles: 1, alliance: -1, top: 1 }],
    }));
    assert.throws(() => validateSgzzZoomRes({
        ...base, chunks: [{ key: 5, tiles: 1, alliance: -1, top: 1 }, { key: 1, tiles: 2, alliance: 0, top: 2 }],
    }), "必须按 key 升序");
    assert.throws(() => validateSgzzZoomRes({
        ...base, chunks: [{ key: 1, tiles: 1, alliance: -1, top: 1 }, { key: 1, tiles: 1, alliance: -1, top: 1 }],
    }), "⛔ 不得重复 key");
});
