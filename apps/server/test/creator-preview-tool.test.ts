/**
 * tools/creator-preview 的纯函数钉：参数解析、场景 uuid 读取、`scene=` 改写、坐标换算与节点选择。
 *
 * ⚠ 驱动本身（CDP 连 Chrome 9222 驱动 Creator 预览）不在任何门禁里——它需要编辑器 / Chrome / 本地栈 /
 * 游戏服四个外部进程；这里只钉「注入页面的脚本不能引用模块作用域」这类会让真实运行静默失败的契约。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// @ts-expect-error 纯 ESM 工具模块，无类型声明。
import { DESIGN, designToPage, nearestByRow, pageWalkSource, parseArgs, rewriteSceneQuery, sceneUuidFromMeta, selectNodes, worldToPage } from "../../../tools/creator-preview/lib.mjs";

const UUID = "33a6cd88-ca61-42f3-97e1-6b18a9096a34";

test("parseArgs：场景名是首个位置参数，选项带默认值，坏值 fail-fast", () => {
  const parsed = parseArgs(["redeem", "--code", "SNAKE90", "--out", "/tmp/x", "--reuse", "--step-timeout", "5000"]);
  assert.equal(parsed.scenario, "redeem");
  assert.equal(parsed.code, "SNAKE90");
  assert.equal(parsed.out, "/tmp/x");
  assert.equal(parsed.reuse, true);
  assert.equal(parsed.stepTimeoutMs, 5000);
  assert.equal(parsed.format, "jpeg");
  assert.equal(parsed.devtools, "http://127.0.0.1:9222");
  assert.equal(parseArgs([]).scenario, null);
  assert.deepEqual(parseArgs(["--help"]), { help: true });
  assert.throws(() => parseArgs(["--format", "gif"]), /jpeg\|png/u);
  assert.throws(() => parseArgs(["--out"]), /需要参数/u);
  assert.throws(() => parseArgs(["--out", "--reuse"]), /需要参数/u);
  assert.throws(() => parseArgs(["a", "b"]), /多余的位置参数/u);
  assert.throws(() => parseArgs(["--boot-timeout", "0"]), /正整数/u);
  assert.throws(() => parseArgs(["--nope"]), /未知参数/u);
});

test("sceneUuidFromMeta：只认严格 JSON 里的 36 位 uuid", () => {
  assert.equal(sceneUuidFromMeta(JSON.stringify({ ver: "1.1.50", uuid: UUID })), UUID);
  assert.throws(() => sceneUuidFromMeta(JSON.stringify({ uuid: "current_scene" })), /uuid/u);
  assert.throws(() => sceneUuidFromMeta("not json"));
});

test("rewriteSceneQuery：只改 scene= 参数，其余 URL 原样", () => {
  assert.equal(rewriteSceneQuery("http://localhost:7456/settings.js?scene=current_scene", UUID), `http://localhost:7456/settings.js?scene=${UUID}`);
  assert.equal(rewriteSceneQuery(`http://localhost:7456/settings.js?a=1&scene=x&b=2`, UUID), `http://localhost:7456/settings.js?a=1&scene=${UUID}&b=2`);
  assert.equal(rewriteSceneQuery("http://localhost:7456/index.html", UUID), "http://localhost:7456/index.html");
  assert.equal(rewriteSceneQuery("http://localhost:7456/x.js?myscene=1", UUID), "http://localhost:7456/x.js?myscene=1");
});

test("坐标换算：世界坐标原点在可见区左下、y 轴向上；设计坐标原点左上", () => {
  const canvas = { x: 100, y: 50, width: 375, height: 803 };
  const visible = { width: 750, height: 1606 };
  const origin = { x: 0, y: 0 };
  assert.deepEqual(worldToPage({ x: 0, y: 1606 }, visible, origin, canvas), { x: 100, y: 50 });
  assert.deepEqual(worldToPage({ x: 750, y: 0 }, visible, origin, canvas), { x: 475, y: 853 });
  assert.deepEqual(worldToPage({ x: 375, y: 803 }, visible, origin, canvas), { x: 287.5, y: 451.5 });
  // 可见区原点非零（fit 策略留边）时按 origin 平移。
  assert.deepEqual(worldToPage({ x: 10, y: 20 }, visible, { x: 10, y: 20 }, canvas), { x: 100, y: 853 });
  assert.deepEqual(DESIGN, { width: 375, height: 812 });
  assert.deepEqual(designToPage({ x: 0, y: 0 }, canvas), { x: 100, y: 50 });
  assert.deepEqual(designToPage({ x: 375, y: 812 }, canvas), { x: 475, y: 853 });
});

test("pageWalkSource：注入页面的脚本自包含（⛔ 不得引用模块作用域的常量/函数）", () => {
  assert.match(pageWalkSource, /^\(function pageWalk\(toPage\) \{[\s\S]*\}\)\(function worldToPage\(world, visible, origin, canvas\) \{[\s\S]*\}\)$/u);
  for (const token of ["DESIGN", "DEFAULTS", "selectNodes", "designToPage", "import", "require("]) {
    assert.ok(!pageWalkSource.includes(token), `页面脚本引用了模块作用域标识符 ${token}，在浏览器里会 ReferenceError`);
  }
});

test("selectNodes / nearestByRow：按名字、文本、路径筛选；多枚同名按钮按锚点所在行消歧", () => {
  const node = (name: string, text: string | null, y: number, path = `scene/Canvas/${name}`, kind = "label") => ({ name, text, path, kind, depth: 2, center: { x: 900, y, width: 10, height: 10 } });
  const walk = {
    nodes: [
      node("label", "兑换码  ·  redeem", 627, "scene/Canvas/row-entry/label"),
      node("label", "进入", 627, "scene/Canvas/row-entry/btn-进入/label"),
      node("label", "点数赛  ·  tally", 708, "scene/Canvas/row-entry/label"),
      node("label", "进入", 708, "scene/Canvas/row-entry/btn-进入/label"),
      node("btn_login", null, 700, "scene/Canvas/GRoot/btn_login", "fgui:GButton"),
      { name: "ghost", text: "进入", path: "scene/ghost", kind: "label", depth: 1, center: null },
    ],
  };
  assert.equal(selectNodes(walk, { text: "进入" }).length, 2, "没有坐标的节点不参与选择");
  assert.equal(selectNodes(walk, { name: "btn_login" })[0]?.kind, "fgui:GButton");
  assert.equal(selectNodes(walk, { textMatches: /·\s*tally$/u })[0]?.center.y, 708);
  assert.equal(selectNodes(walk, { pathIncludes: "row-entry", kind: "label", textIncludes: "·" }).length, 2);
  assert.equal(selectNodes(null, { text: "进入" }).length, 0);
  const anchor = selectNodes(walk, { textMatches: /·\s*tally$/u })[0];
  const picked = nearestByRow(selectNodes(walk, { text: "进入" }), anchor);
  assert.equal(picked?.center.y, 708);
  assert.equal(nearestByRow([], anchor), null);
});
