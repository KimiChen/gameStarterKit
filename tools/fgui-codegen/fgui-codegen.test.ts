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

test("类型推断:fairygui-cc 类名;tge_ 是 GButton;jb_ 是 GComponent;无前缀不绑定", () => {
  assert.strictEqual(tsTypeOf({ name: "txt_title", tag: "text" }), "GTextField");
  assert.strictEqual(tsTypeOf({ name: "btn_ready", tag: "component" }), "GButton");
  assert.strictEqual(tsTypeOf({ name: "tge_remind", tag: "component" }), "GButton");
  assert.strictEqual(tsTypeOf({ name: "lst_rows", tag: "list" }), "GList");
  assert.strictEqual(tsTypeOf({ name: "ld_icon", tag: "loader" }), "GLoader");
  assert.strictEqual(tsTypeOf({ name: "go_border", tag: "graph" }), "GGraph");
  assert.strictEqual(tsTypeOf({ name: "jb_seal", tag: "component", fileName: "CompSeal.xml" }), "GComponent",
    "jb_ 嵌套组件无 UIObjectFactory 扩展机制，运行时就是 GComponent");
  assert.strictEqual(tsTypeOf({ name: "frameGroup", tag: "group" }), undefined, "无识别前缀 → 不生成字段");
});

test("codegen:AUTO FIELD 块只含有前缀的元素(普通 group 跳过)", () => {
  const block = emitAutoFieldBlock(bindingFields(parseFguiComponent(OPPONENT_HUD_XML)));
  assert.ok(block.includes("// #region AUTO FIELD DONT CHANGE"));
  assert.ok(block.includes("private txt_title!: GTextField;"));
  assert.ok(block.includes("private lst_rows!: GList;"));
  assert.ok(block.includes("private btn_ready!: GButton;"));
  assert.ok(block.includes("private ld_icon!: GLoader;"));
  assert.ok(block.includes("private go_border!: GGraph;"));
  assert.ok(!block.includes("frameGroup"), "普通 group 不声明字段");
});

test("FguiView scaffold:导入 + REQUIRED 契约 + bind() 里 getChild<T>", () => {
  const src = emitFguiViewScaffold(parseFguiComponent(OPPONENT_HUD_XML), {
    viewClass: "OpponentHudView", pkg: "Versus", comp: "OpponentHud",
  });
  assert.ok(src.includes('import { FguiView } from "./FguiView";'));
  assert.ok(src.includes('import { GButton, GGraph, GList, GLoader, GTextField } from "db://fairygui-cc/fairygui.mjs";'), "按用到的 G 类聚合导入");
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

// ── AUTO 区块幂等重写（docs/CLIENT.md 方案 2）────────────────────────────

import { emitAutoRegion, regenerateViewSource, replaceAutoRegion } from "./binding";

const HUD_COMP = parseFguiComponent(OPPONENT_HUD_XML);
const HUD_OPTS = { viewClass: "OpponentHudView", pkg: "Versus", comp: "OpponentHud" };

test("region 幂等:对刚生成的脚手架 regenerate = 恒等;同输入两遍零 diff", () => {
  const scaffold = emitFguiViewScaffold(HUD_COMP, HUD_OPTS);
  const once = regenerateViewSource(scaffold, HUD_COMP, HUD_OPTS);
  assert.strictEqual(once, scaffold, "幂等重写不得改动刚生成的脚手架");
  assert.strictEqual(regenerateViewSource(once, HUD_COMP, HUD_OPTS), once, "重复重写零 diff");
});

test("region 重写:契约变更时区块更新、区块外业务代码一字不动", () => {
  // 脚手架 + 手写业务方法
  const scaffold = emitFguiViewScaffold(HUD_COMP, HUD_OPTS);
  const withBiz = scaffold.replace(
    "  protected bind(): void {",
    "  /** 业务:刷新对手战况(手写,区块外) */\n  apply(rows: string[]): void { void rows; }\n\n  protected bind(): void {",
  );
  // 设计师加了一个元素 txt_score
  const xml2 = OPPONENT_HUD_XML.replace(
    "</displayList>",
    '<text id="n9" name="txt_score" xy="0,0" size="80,20"/></displayList>',
  );
  const regen = regenerateViewSource(withBiz, parseFguiComponent(xml2), HUD_OPTS);
  assert.ok(regen.includes("apply(rows: string[]): void"), "手写业务方法保全");
  assert.ok(regen.includes('this.txt_score = this.getChild<GTextField>("txt_score");'), "新元素进 BIND 区块");
  assert.ok(regen.includes("private txt_score!: GTextField;"), "新元素进 FIELD 区块");
  assert.ok(regen.includes('"name":"txt_score"'), "新元素进 REQUIRED 契约");
  // 再跑一遍仍幂等
  assert.strictEqual(regenerateViewSource(regen, parseFguiComponent(xml2), HUD_OPTS), regen);
});

test("region 篡改检测:手改生成区 → regenerate 结果 ≠ 原文(CI 红的判据)", () => {
  const scaffold = emitFguiViewScaffold(HUD_COMP, HUD_OPTS);
  const tampered = scaffold.replace(
    'this.txt_title = this.getChild<GTextField>("txt_title");',
    'this.txt_title = this.getChild<GTextField>("txt_renamed");',
  );
  assert.notStrictEqual(regenerateViewSource(tampered, HUD_COMP, HUD_OPTS), tampered);
});

test("region 结构破坏:标记行被删/重复 → throw 而不是生成错文件", () => {
  const scaffold = emitFguiViewScaffold(HUD_COMP, HUD_OPTS);
  const noMarker = scaffold.replace("// #region AUTO BIND DONT CHANGE", "");
  assert.throws(() => replaceAutoRegion(noMarker, "BIND", emitAutoRegion("BIND", HUD_COMP, HUD_OPTS)), /缺失/);
  const dup = scaffold + "\n    // #region AUTO BIND DONT CHANGE\n    // #endregion AUTO BIND";
  assert.throws(() => replaceAutoRegion(dup, "BIND", ""), /重复/);
});

test("region 结束标记带 kind:业务代码里的手写 #endregion 不会被误当区块边界吞掉", () => {
  const scaffold = emitFguiViewScaffold(HUD_COMP, HUD_OPTS);
  // BIND 结束标记被误删 + 后方业务代码里有手写折叠 #endregion（VS Code 常见）
  const broken = scaffold.replace("    // #endregion AUTO BIND", "") +
    "\n  // #region 业务折叠\n  apply(): void {}\n  // #endregion\n";
  // 通用结束标记会吞掉 apply()；带 kind 的实现必须报「未闭合」而不是静默吞业务代码
  assert.throws(() => replaceAutoRegion(broken, "BIND", emitAutoRegion("BIND", HUD_COMP, HUD_OPTS)), /未闭合/);
});
