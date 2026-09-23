import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MAPO_LABEL_COUNTS, mapoCityLabelSize, mapoLabelsFor, mapoLabelTier,
} from "../src/kits/mapOriginal/logic/mapoLabels";
import { MAPO_CITY_SITES } from "../src/shared/kits/mapOriginal/content/labels.data";

test("mapOriginal 地名：按档位突出城名 / 郡 / 大区，保留重要城名参与避让", () => {
    assert.equal(mapoLabelTier(0), "city");
    assert.equal(mapoLabelTier(1), "city");
    assert.equal(mapoLabelTier(2), "area");
    assert.equal(mapoLabelTier(3), "canton");
    assert.equal(mapoLabelTier(5), "canton");
    // 重要城名跨档保留，其他层级按档位加入候选。
    const city = mapoLabelsFor(0), area = mapoLabelsFor(2), canton = mapoLabelsFor(3);
    assert.equal(city.length, MAPO_LABEL_COUNTS.city);
    assert.equal(area.filter(l => l.tier === "area").length, MAPO_LABEL_COUNTS.area);
    assert.ok(area.some(l => l.name === "洛阳"));
    assert.equal(canton.filter(l => l.tier === "canton").length, MAPO_LABEL_COUNTS.canton);
    assert.ok(canton.some(l => l.name === "洛阳"));
    assert.equal(MAPO_LABEL_COUNTS.city, 249, "城名 = 249 座城全量");
    assert.equal(MAPO_LABEL_COUNTS.area, 55);
    assert.equal(MAPO_LABEL_COUNTS.canton, 9);
    const names = new Set(city.map((l) => l.name));
    assert.equal(names.size, 249, "城名不该有重名折叠");
});

test("mapOriginal 地名：城名落在城中心格，字号按 大型>中型>小型 分档、洛阳最突出", () => {
    const city = mapoLabelsFor(0);
    const byName = new Map(city.map((l) => [l.name, l]));
    // 城名位置 == MAPO_CITY_SITES 的格（双向抽样核对）
    for (const site of [MAPO_CITY_SITES[0], MAPO_CITY_SITES[205], MAPO_CITY_SITES[248]]) {
        const label = byName.get(site.name);
        assert.ok(label, `${site.name} 缺城名`);
        assert.equal(label.row, site.row);
        assert.equal(label.col, site.col);
    }
    // 字号纪律：档序单调、洛阳（10 级唯一）全场最大、且不压过大区名的 30
    assert.ok(mapoCityLabelSize("大型城池", 7) > mapoCityLabelSize("中型城池", 6));
    assert.ok(mapoCityLabelSize("中型城池", 6) > mapoCityLabelSize("小型城池", 3));
    const luoyang = byName.get("洛阳");
    assert.ok(luoyang, "洛阳 缺城名");
    assert.equal(luoyang.size, 28, "洛阳（10 级）再突出一档");
    assert.ok(Math.max(...city.map((l) => l.size)) <= 28);
    assert.ok(Math.max(...city.map((l) => l.size)) < 30, "城名不能压过大区名");
});
