import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MAPO_CITY_CELL_COUNTS, MAPO_CITY_CELL_KEYS, MAPO_CITY_SITES,
} from "../src/shared/kits/mapOriginal/content/labels.data";
import { MAPO_DECOR_CITY_BASE } from "../src/shared/kits/mapOriginal/content/decor.data";
import { mapoDecorAt } from "../src/kits/mapOriginal/logic/mapoDecor";

/** 第一座城的中心格与它的一个非中心占格。 */
const SITE = MAPO_CITY_SITES[0];
const OTHER_KEY = MAPO_CITY_CELL_KEYS[1];              // 同一座城的第 2 格
const OTHER = { row: Math.floor(OTHER_KEY / 10000), col: OTHER_KEY % 10000 };
const RES_VALUE = 12;                                   // 某个资源值（2..41）

test("mapOriginal 摆件：城中心格出城址件", () => {
    const p = mapoDecorAt(SITE.row, SITE.col, 1, true);
    assert.ok(p, "城中心没出件");
    assert.ok(p.cell.id >= MAPO_DECOR_CITY_BASE, "城中心出的不是城址件");
});

test("mapOriginal 摆件：第 4 道门 —— 城占的格不叠资源件", () => {
    // ⚠ 这条是为 MAPORIGINAL-2D §2.1 的第 4 道门设的（M0-B4）：
    //   原版「该格有 build 且 is_show_res_field() 为假 ⇒ 不画」。
    //   ⛔ 别只挡 249 个中心格 —— 城占的是 2,689 格。
    assert.notEqual(OTHER_KEY, SITE.row * 10000 + SITE.col, "取到的应是非中心占格");
    assert.equal(mapoDecorAt(OTHER.row, OTHER.col, RES_VALUE, true), null,
        "城占格上仍摆了资源件");
    // 同一个值放在非城格上必须照常出件（证明挡掉的是「城」不是「值」）
    const free = mapoDecorAt(3, 3, RES_VALUE, true);
    assert.ok(free && free.cell.id === RES_VALUE, "非城格的资源件被误伤");
});

test("mapOriginal 摆件：占格表自洽（249 座 / 2,689 格 / 计数和相等）", () => {
    assert.equal(MAPO_CITY_CELL_COUNTS.length, MAPO_CITY_SITES.length);
    assert.equal(MAPO_CITY_CELL_COUNTS.reduce((a, b) => a + b, 0), MAPO_CITY_CELL_KEYS.length);
    assert.equal(MAPO_CITY_CELL_KEYS.length, 2689);
    // 每座城的首格 == 它的中心（前缀和切分）
    let at = 0;
    for (let i = 0; i < MAPO_CITY_SITES.length; i += 1) {
        const s = MAPO_CITY_SITES[i];
        assert.equal(MAPO_CITY_CELL_KEYS[at], s.row * 10000 + s.col, `第 ${i + 1} 座首格`);
        at += MAPO_CITY_CELL_COUNTS[i];
    }
    assert.equal(new Set(MAPO_CITY_CELL_KEYS).size, MAPO_CITY_CELL_KEYS.length, "占格有重复");
});
