// FairyGUI 结构契约·无头测：解析 apps/art/fairygui 里设计师的组件 XML(事实源)，断言满足代码声明的契约
// (fguiContracts)。设计师删/改名 code 依赖的命名元素 → 本测红。不渲染、无 fairygui 运行时。
// 运行: npm run test:fgui（借 apps/server 的 tsx 跑，客户端零 node 依赖）
import assert from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFguiComponent } from "../../../tools/fgui-codegen/parseFgui";
import { checkContract } from "../../../tools/fgui-codegen/binding";
import { FGUI_CONTRACTS } from "../assets/script/game/ui/fguiContracts";

// FGUI 组件源在 apps/art/fairygui/assets（FGUI 工程扫描根，只扫直接子目录）；公司标准库 Original 平铺同级。
const FGUI_ROOT = join(import.meta.dirname, "../../art/fairygui/assets");

for (const c of FGUI_CONTRACTS) {
    test(`FGUI 契约:ui://${c.pkg}/${c.comp} 满足代码依赖的命名元素`, () => {
        const xmlPath = join(FGUI_ROOT, c.pkg, `${c.comp}.xml`);
        const comp = parseFguiComponent(readFileSync(xmlPath, "utf8"));
        const r = checkContract(comp, c.required);
        assert.deepStrictEqual(
            { missing: r.missing, mismatched: r.mismatched }, { missing: [], mismatched: [] },
            `设计师的 ${c.pkg}/${c.comp}.xml 不满足契约——缺失: [${r.missing}] 类型不符: [${r.mismatched}]`,
        );
    });
}

test("FGUI 契约:包描述里组件已导出(exported)，运行时 createObject 才可见", () => {
    const pkgXml = readFileSync(join(FGUI_ROOT, "Rank/package.xml"), "utf8");
    assert.match(pkgXml, /name="RankMain\.xml"[^>]*exported="true"/, "RankMain 需在包里标记导出");
});
