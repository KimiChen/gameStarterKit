/**
 * mmodemo 客户端（MG0-B2 表现映射）：贡献的 `presentation` 覆盖内容包 demoVale 的全部 presentationId（职业 / 怪物 / NPC / 物品），
 * 条目形状合法（RGBA 0..255、size > 0、label 非空），键与 kit 内置灰盒映射不重叠（⛔ 覆盖 kit），且经 kit `presentationMap()` 生效
 * （contributions.generated 已收录本插件）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { presentation } from "../src/plugins/mmodemo/mmoPresentation";
import { BUILTIN_PRESENTATION, presentationMap, presentationOf } from "../src/kits/mmo/api/content/index";

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(resolve(HERE, "../../..", "apps/plugins/mmodemo/content/pack.json"), "utf8")) as {
    classes: { presentationId: string }[]; creatures: { presentationId: string }[]; items: { presentationId: string }[]; npcs: { presentationId: string }[];
};

test("presentation 覆盖 demoVale 的全部 presentationId，条目合法，键不与内置灰盒重叠", () => {
    const ids = [...pack.classes, ...pack.creatures, ...pack.items, ...pack.npcs].map((entry) => entry.presentationId);
    for (const id of ids) assert.ok(id in presentation, `缺表现：${id}`);
    for (const [id, entry] of Object.entries(presentation)) {
        assert.ok(entry.label.length > 0 && entry.size > 0, id);
        assert.equal(entry.color.length, 4, id);
        for (const channel of entry.color) assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255, id);
        assert.ok(!(id in BUILTIN_PRESENTATION), `键 ${id} 与 kit 内置映射重叠（插件 ⛔ 覆盖 kit）`);
    }
});

test("经 kit presentationMap() 生效：贡献点收录后 presentationOf 取到插件条目，内置条目不变", () => {
    const map = presentationMap();
    assert.equal(presentationOf("alpha-wolf", map).label, "头狼");
    assert.equal(presentationOf("slime", map).label, BUILTIN_PRESENTATION.slime!.label);
});
