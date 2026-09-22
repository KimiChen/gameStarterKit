import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MAPO_LOD_MAX } from "../src/shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_LAYERS, MAPO_LAYER_ORDER, MAPO_LAYER_RENDERER, MAPO_PLANNED_LAYERS,
    mapoLayerVisible, mapoLayerZorder,
} from "../src/kits/mapOriginal/logic/mapoLayers";
import {
    MAPO_CITY_CELL_COUNTS, MAPO_CITY_CELL_KEYS, MAPO_CITY_SITES,
} from "../src/shared/kits/mapOriginal/content/labels.data";
import { mapoDecorAt } from "../src/kits/mapOriginal/logic/mapoDecor";

/** 第一座城的中心格与它的一个非中心占格。 */
const SITE = MAPO_CITY_SITES[0];
const OTHER_KEY = MAPO_CITY_CELL_KEYS[1];              // 同一座城的第 2 格
const OTHER = { row: Math.floor(OTHER_KEY / 10000), col: OTHER_KEY % 10000 };
const RES_VALUE = 12;                                   // 某个资源值（2..41）

test("mapOriginal 摆件：城中心格**不**出摆件（城址件归 mapoCities 画）", () => {
    // ⚠ 本用例 2026-09-23 反向：早先摆件层按「面积前 8 大 + 位置散列」在城中心挑一件城址件
    //   —— 那是本仓自创的启发式。现在城由 `mapoCities` 画**原版真件**（15 个件 / 249 座），
    //   中心格若还出摆件就会与城重叠。
    assert.equal(mapoDecorAt(SITE.row, SITE.col, 1, true), null, "城中心仍出了摆件");
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

test("mapOriginal 分层：implemented 的层必须真有渲染器（⛔ 不许门控与渲染两张皮）", () => {
    // ⚠ 这条是 M1-B1 的止血闸，且是**通用**的：将来新增层自动受管。
    //   `grid` 曾写着 implemented: true 而渲染器里一行都没有 —— 会向状态行与真机重放证据谎报。
    const view = readFileSync(
        new URL("../src/kits/mapOriginal/view/MapOriginalWorldView.ts", import.meta.url), "utf8");
    for (const gate of MAPO_LAYERS) {
        const field = MAPO_LAYER_RENDERER[gate.id];
        assert.equal(gate.implemented, field !== null,
            `层 ${gate.id}：implemented=${gate.implemented} 与渲染器 ${field} 不一致`);
        if (field === null) {
            for (let lod = 0; lod <= MAPO_LOD_MAX; lod += 1) {
                assert.equal(mapoLayerVisible(gate.id, lod), false,
                    `未实现的层 ${gate.id} 在 lod ${lod} 却可见`);
            }
            continue;
        }
        // ⚠ 不能只认 `this.x?.render(`：blocks 是一**组**渲染器，走 reduce 遍历 ⇒
        //   判据放宽成「字段名出现后 400 字符内有 .render(」，仍能抓住「声明了却从不渲染」。
        let hit = false;
        for (let at = view.indexOf(`this.${field}`); at >= 0;
             at = view.indexOf(`this.${field}`, at + 1)) {
            if (view.slice(at, at + 400).includes(".render(")) { hit = true; break; }
        }
        assert.ok(hit, `层 ${gate.id} 说由 ${field} 负责，但视图里找不到它的 .render( 调用`);
    }
});

test("mapOriginal 分层：未实现的层就是 grid 与 banner（⛔ 改了要同步 kit README 层表）", () => {
    assert.deepEqual([...MAPO_PLANNED_LAYERS], ["grid", "banner"]);
});

test("mapOriginal 画质：⛔ 不再有「分帧建格步长」这个没人调的旋钮（M1-B2）", () => {
    const settings = readFileSync(
        new URL("../src/kits/mapOriginal/logic/mapoSettings.ts", import.meta.url), "utf8");
    assert.ok(!settings.includes("export function mapoCreateStepFor"), "mapoCreateStepFor 又回来了");
    const logic = readFileSync(
        new URL("../src/kits/mapOriginal/logic/MapOriginalWorldLogic.ts", import.meta.url), "utf8");
    assert.ok(!logic.includes("createStep"), "MapOriginalWorldLogic 还留着 createStep");
});

test("mapOriginal 分层：第 ② 级刻度照抄原版 MAP_ZORDER，且**留了缝**", () => {
    // ★ 原版是 render_layer + MAP_ZORDER（留缝）+ 层内画家序**三级**；本 kit 早先只有兄弟序，
    //   次序取决于「谁先 render」—— 实测那会让地表底挂在路/河/山之后、把它们全盖住。
    //   ⛔ 别把刻度排满：留缝是为了新增层能往里插。
    assert.equal(mapoLayerZorder("terrain"), 100, "地表底 = 原版 BG");
    assert.equal(mapoLayerZorder("region"), 300, "山族件 = 原版 TERRAIN");
    assert.equal(mapoLayerZorder("road"), 900, "= 原版 ROAD");
    assert.equal(mapoLayerZorder("river"), 1600, "= 原版 RIVER");
    assert.equal(mapoLayerZorder("decor"), 3400, "res_field = 原版 RES");
    assert.equal(mapoLayerZorder("city"), 3900, "城址件 = 原版 BUILD_TOP");
    // ★ 关键次序：远档底图 < 地表底 < 雪沙带 < 山族件 < 路 < 河 < 摆件 < 城 < 旗 < 地名
    // ⚠ city = 原版 BUILD_TOP(3900) 在 decor = RES(3400) **之上**；
    //   banner（旗标）再在城之上 ⇒ 它从 3900 让到 3950
    const want = ["plate", "terrain", "blocks", "region", "road", "grid", "river",
                  "decor", "city", "banner", "label"];
    const got = MAPO_LAYER_ORDER.filter((id) => (want as readonly string[]).includes(id));
    assert.deepEqual([...got], want.filter((id) => (got as readonly string[]).includes(id)),
        "刻度升序");
    // ⚠ 刻度必须两两不同（同值时容器建序不稳定）
    const zs = MAPO_LAYERS.map((l) => l.zorder);
    assert.equal(new Set(zs).size, zs.length, "刻度不许撞车");
    // ⚠ 相邻刻度至少留 10 的缝
    const sorted = zs.slice().sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
        assert.ok(sorted[i] - sorted[i - 1] >= 10,
            `刻度 ${sorted[i - 1]} 与 ${sorted[i]} 之间没留缝`);
    }
});

test("mapOriginal 分层：渲染器挂各自的层容器，⛔ 不许直接挂 world", () => {
    // ⚠ 这条钉住 P4 的修法：次序由**容器建序**定，与「谁先 render」无关。
    const view = readFileSync(
        new URL("../src/kits/mapOriginal/view/MapOriginalWorldView.ts", import.meta.url), "utf8");
    for (const m of view.matchAll(/new Mapo(\w+)Renderer\(([^,)]+)/g)) {
        const kind = m[1], parent = m[2].trim();
        if (kind === "Label") continue;            // 地名建在 root 上（字号不跟相机缩放）
        assert.ok(parent.startsWith("this.layer("),
            `Mapo${kind}Renderer 挂的是 ${parent}，应挂 this.layer(<层>)`);
    }
    assert.ok(view.includes("MAPO_LAYER_ORDER"), "容器必须按第 ② 级刻度升序建");
});
