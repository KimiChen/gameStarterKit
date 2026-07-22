// FairyGUI 结构契约·无头测：解析 apps/art/fairygui 里设计师的组件 XML(事实源)，断言满足代码声明的契约
// (fguiContracts)。设计师删/改名 code 依赖的命名元素 → 本测红。不渲染、无 fairygui 运行时。
// 运行: npm run test:fgui（借 apps/server 的 tsx 跑，客户端零 node 依赖）
import assert from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFguiComponent } from "../../../tools/fgui-codegen/parseFgui";
import { checkContract } from "../../../tools/fgui-codegen/binding";
import { FGUI_CONTRACTS } from "../src/view/fguiContracts";

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

    // 包描述里组件必须已导出(exported)，运行时 createObject 才可见（随契约逐视图检查）
    test(`FGUI 契约:${c.pkg}/package.xml 已导出 ${c.comp}`, () => {
        const pkgXml = readFileSync(join(FGUI_ROOT, c.pkg, "package.xml"), "utf8");
        assert.match(
            pkgXml,
            new RegExp(`name="${c.comp}\\.xml"[^>]*exported="true"`),
            `${c.comp} 需在 ${c.pkg} 包里标记导出`,
        );
    });
}

// 编辑器工程 Adaptation ⇔ 代码真源 designSpec 一致性：设计师在错误分辨率/适配模式下出图
// 是「UI 偏小 + 黑边」的放大器（designSpec.ts 头注释）。分辨率两值比 designSpec；
// 适配策略半边（FIXED_WIDTH ≙ FairyGUI 的 MatchWidth）designSpec 里没有，钉 Main.ts 源文本。
test("FGUI 编辑器 Adaptation 设置 ⇔ designSpec/Main.ts 三处一致", async () => {
    const { DESIGN_WIDTH, DESIGN_HEIGHT } = await import("../src/designSpec");
    const adaptation = JSON.parse(
        readFileSync(join(import.meta.dirname, "../../art/fairygui/settings/Adaptation.json"), "utf8"),
    );
    assert.strictEqual(adaptation.designResolutionX, DESIGN_WIDTH, "编辑器设计宽 ≠ designSpec.DESIGN_WIDTH");
    assert.strictEqual(adaptation.designResolutionY, DESIGN_HEIGHT, "编辑器设计高 ≠ designSpec.DESIGN_HEIGHT");
    assert.strictEqual(adaptation.scaleMode, "ScaleWithScreenSize");
    // FairyGUI 真实键名就是 screenMathMode（非 Match 拼写笔误）
    assert.strictEqual(adaptation.screenMathMode, "MatchWidth", "编辑器适配模式须与 Main.ts 的 FIXED_WIDTH 同语义");
    const mainTs = readFileSync(join(import.meta.dirname, "../src/Main.ts"), "utf8");
    assert.match(mainTs, /ResolutionPolicy\.FIXED_WIDTH/, "Main.ts 适配策略不再是 FIXED_WIDTH——编辑器 MatchWidth 假设失效，连同本断言一起重议");
});
