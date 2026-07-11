// FairyGUI 结构契约 codegen/lint·纯层单测(无 fairygui 运行时,纯解析 XML)。类型词表=fairygui-cc 类名。
// 运行: npm run test:fgui
import assert from "node:assert";
import { test } from "node:test";
import { parseFguiComponent } from "./parseFgui";
import {
  bindingFields, emitAutoFieldBlock, emitFguiViewScaffold, checkContract, tsTypeOf, type BindingField,
} from "./binding";

// 仿真 FairyGUI 组件 XML(OpponentHud):标题文本 + 虚拟列表 + 按钮 + loader + 普通 group + graph。
// list 里嵌套 <item>/<relation>(不该被当直接子元素);button <component> 引 Button.xml。
const OPPONENT_HUD_XML = `<?xml version="1.0" encoding="utf-8"?>
<component size="340,120">
  <displayList>
    <text id="n0_a1" name="txt_title" xy="0,0" size="200,26" fontSize="20" text="对手战况"/>
    <list id="n1_b2" name="lst_rows" xy="0,28" size="320,80" layout="column">
      <item title="row"/>
      <relation target="" sidePair="width-width"/>
    </list>
    <component id="n2_c3" name="btn_ready" src="x0y1z2" fileName="Button.xml" xy="0,90"/>
    <loader id="n3_d4" name="ld_icon" xy="120,0" size="40,40"/>
    <group id="n4_e5" name="frameGroup" xy="0,0"/>
    <graph id="n5_f6" name="go_border" type="rect"/>
  </displayList>
</component>`;

test("解析:只取 displayList 直接子元素(list 的 item/relation 不计)", () => {
  const comp = parseFguiComponent(OPPONENT_HUD_XML);
  const names = comp.elements.map((e) => e.name).sort();
  assert.deepStrictEqual(names, ["btn_ready", "frameGroup", "go_border", "ld_icon", "lst_rows", "txt_title"]);
  assert.strictEqual(comp.elements.find((e) => e.name === "lst_rows")?.tag, "list");
  assert.strictEqual(comp.elements.find((e) => e.name === "btn_ready")?.fileName, "Button.xml");
});

test("类型推断:fairygui-cc 类名;jb_ 取自定义类名;无前缀不绑定", () => {
  assert.strictEqual(tsTypeOf({ name: "txt_title", tag: "text" }), "GTextField");
  assert.strictEqual(tsTypeOf({ name: "btn_ready", tag: "component" }), "GButton");
  assert.strictEqual(tsTypeOf({ name: "lst_rows", tag: "list" }), "GList");
  assert.strictEqual(tsTypeOf({ name: "ld_icon", tag: "loader" }), "GLoader");
  assert.strictEqual(tsTypeOf({ name: "go_border", tag: "graph" }), "GComponent");
  assert.strictEqual(tsTypeOf({ name: "jb_seal", tag: "component", fileName: "CompSeal.xml" }), "CompSeal");
  assert.strictEqual(tsTypeOf({ name: "frameGroup", tag: "group" }), undefined, "无识别前缀 → 不生成字段");
});

test("codegen:AUTO FIELD 块只含有前缀的元素(普通 group 跳过)", () => {
  const block = emitAutoFieldBlock(bindingFields(parseFguiComponent(OPPONENT_HUD_XML)));
  assert.ok(block.includes("// #region AUTO FIELD DONT CHANGE"));
  assert.ok(block.includes("private txt_title!: GTextField;"));
  assert.ok(block.includes("private lst_rows!: GList;"));
  assert.ok(block.includes("private btn_ready!: GButton;"));
  assert.ok(block.includes("private ld_icon!: GLoader;"));
  assert.ok(block.includes("private go_border!: GComponent;"));
  assert.ok(!block.includes("frameGroup"), "普通 group 不声明字段");
});

test("FguiView scaffold:导入 + REQUIRED 契约 + bind() 里 getChild<T>", () => {
  const src = emitFguiViewScaffold(parseFguiComponent(OPPONENT_HUD_XML), {
    viewClass: "OpponentHudView", pkg: "Versus", comp: "OpponentHud",
  });
  assert.ok(src.includes('import { FguiView } from "./FguiView";'));
  assert.ok(src.includes('import { GButton, GComponent, GList, GLoader, GTextField } from "db://fairygui-cc/fairygui.mjs";'), "按用到的 G 类聚合导入");
  assert.ok(src.includes("export class OpponentHudView extends FguiView"));
  assert.ok(src.includes('static readonly PKG = "Versus";'));
  assert.ok(src.includes('static readonly REQUIRED = ['), "内嵌契约常量");
  assert.ok(src.includes('this.txt_title = this.getChild<GTextField>("txt_title");'));
  assert.ok(src.includes('this.btn_ready = this.getChild<GButton>("btn_ready");'));
  assert.ok(src.includes("// #region AUTO BIND DONT CHANGE"));
});

test("契约校验:满足 → ok", () => {
  const required: BindingField[] = [
    { name: "txt_title", tsType: "GTextField" },
    { name: "lst_rows", tsType: "GList" },
    { name: "btn_ready", tsType: "GButton" },
  ];
  assert.deepStrictEqual(checkContract(parseFguiComponent(OPPONENT_HUD_XML), required), { ok: true, missing: [], mismatched: [] });
});

test("契约校验:设计师删了元素 → missing 报红", () => {
  const r = checkContract(parseFguiComponent(OPPONENT_HUD_XML), [
    { name: "txt_title", tsType: "GTextField" }, { name: "btn_start", tsType: "GButton" },
  ]);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.missing, ["btn_start"]);
});

test("契约校验:把 GList 名安到 loader 上 → mismatched 报红(前缀/标签矛盾)", () => {
  const xml = `<component><displayList><loader id="n0" name="lst_rows" xy="0,0"/></displayList></component>`;
  const r = checkContract(parseFguiComponent(xml), [{ name: "lst_rows", tsType: "GList" }]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.mismatched.length, 1);
  assert.ok(r.mismatched[0].includes("期望 GList，实际 GLoader"));
});
