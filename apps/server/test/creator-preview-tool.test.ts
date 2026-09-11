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
// @ts-expect-error 纯 ESM 场景工具，无类型声明。
import { assertSlgSettingsScrollUnchanged, readSlgMapEvidence, readSlgOverviewEvidence, SLG_WORLD_SIZE, slgFrameStability, slgMapGestureArea, slgRenderAssetsSource, slgSettingsScrollSource } from "../../../tools/creator-preview/slg.mjs";
import { SLG_MAPS } from "@game/shared/kits/slg/api/worldmap/index";

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

test("SLG 预览证据：只认地图视图的完整公开文本，网格没有 UITransform 也参与加载证据", () => {
  const node = (name: string, text: string | null, center: object | null = { x: 100, y: 100 }) => ({ name, text, path: `scene/Canvas/SlgMapView/${name}`, center });
  const walk = { nodes: [
    node("SlgMapView", null),
    node("title", "青原 · LOD 2 · 奖杯 7"),
    node("details", "(103, 98) · 地形 0 · 我方 · 守备 1"),
    node("slg-chunk-6-6", null, null),
    node("slg-terrain-layer", null, null),
    node("slg-decoration-layer", null, null),
    node("slg-decorations-6-6", null, null),
    node("status", "已占领 · 奖杯 +1"),
    node("slg-world", null, { x: -1000, y: 1100 }),
    { ...node("wrong-title", "青原 · LOD 4 · 奖杯 999"), path: "scene/Canvas/OtherView/title" },
  ] };
  const result = readSlgMapEvidence(walk);
  assert.equal(result.loaded, true);
  assert.equal(result.lod, 2);
  assert.equal(result.trophies, 7);
  assert.deepEqual(result.chunks, ["slg-chunk-6-6"]);
  assert.equal(result.terrainLayer, true);
  assert.equal(result.decorationLayer, true);
  assert.deepEqual(result.decorationChunks, ["slg-decorations-6-6"]);
  assert.equal(readSlgMapEvidence({ nodes: walk.nodes.filter((entry) => !/slg-(terrain-layer|decoration-layer|decorations-)/u.test(entry.name)) }).loaded,
    true, "旧版标题与 chunk 证据仍兼容；新版回放步骤另行要求贴图和装饰层");
  assert.deepEqual(result.tile, { x: 103, y: 98, terrain: 0, owner: "我方", guard: 1, text: "(103, 98) · 地形 0 · 我方 · 守备 1" });
  assert.equal(readSlgMapEvidence(null), null);
  assert.equal(readSlgMapEvidence({ nodes: walk.nodes.filter((entry) => entry.name !== "SlgMapView") }), null);
  assert.equal(readSlgMapEvidence({ nodes: walk.nodes.filter((entry) => !entry.name.startsWith("slg-chunk-")) }).loaded, false);
  assert.equal(readSlgMapEvidence({ nodes: walk.nodes.map((entry) => entry.name === "details" ? { ...entry, text: "(103, 98) · 地形 ? · 我方 · 守备 1" } : entry) }).tile, null);
});

test("SLG 总览证据：区分实地图与绘卷，地标坐标只取公开锚点并反转北向 Y", () => {
  const root = "scene/Canvas/SlgMapView/slg-world-overview";
  const nav = `${root}/slg-overview-navigation`;
  const site = `${nav}/slg-overview-site-beiling`;
  const node = (name: string, text: string | null, path: string, center: object | null = { x: 200, y: 400 }) => ({ name, text, path, center });
  const walk = { canvas: { x: 0, y: 0, width: 375, height: 800 }, visible: { width: 750, height: 1600 }, nodes: [
    node("SlgMapView", null, "scene/Canvas/SlgMapView"),
    node("map-title", "青原仙洲 · LOD 4 · 奖杯 7", "scene/Canvas/SlgMapView/title"),
    node("details", "(5000, 5000) · 地形 0 · 我方 · 守备 1", "scene/Canvas/SlgMapView/details"),
    node("slg-world-overview", null, root),
    node("title", "青原仙洲 · 世界总览", `${root}/title`),
    node("slg-overview-navigation", null, nav, { x: 200, y: 400, width: 600, height: 600 }),
    node("footer", "当前位置（5000, 5000） · 点击地图定位", `${root}/footer`),
    node("slg-overview-site-beiling", null, site, { x: 200, y: 325, width: 46, height: 46 }),
    node("label", "北岭遗迹", `${site}/label`, { x: 200, y: 340 }),
    ...Array.from({ length: 4 }, (_, i) => node("slg-overview-viewport", null, `${nav}/edge-${i}`)),
    node("outside", "伪地标", "scene/Canvas/OtherView/slg-overview-site-fake"),
  ] };
  const hiddenWorld = readSlgMapEvidence(walk);
  assert.equal(hiddenWorld.loaded, false, "总览期间 world.active=false，公开 walker 不包含局部 chunk");
  assert.equal(hiddenWorld.worldCenter, null);
  assert.deepEqual(hiddenWorld.chunks, []);
  assert.equal(hiddenWorld.tile.x, 5000, "总览外的选格详情仍然可读");
  const overview = readSlgOverviewEvidence(walk, 10000, 10000);
  assert.equal(overview.mode, "navigation");
  assert.equal(overview.title, "青原仙洲 · 世界总览");
  assert.deepEqual(overview.bounds, { x: 50, y: 250, width: 300, height: 300 });
  assert.deepEqual(overview.position, { x: 5000, y: 5000 });
  assert.equal(overview.viewportEdges.length, 4);
  assert.equal(overview.landmarks.length, 1);
  assert.equal(overview.landmarks[0].name, "北岭遗迹");
  assert.deepEqual(overview.landmarks[0].expected, { x: 5000, y: 7500 }, "标签向下偏移不改变地标世界坐标");
  assert.equal(overview.artVisible, false);
  assert.equal(readSlgOverviewEvidence(null), null);
  assert.equal(readSlgOverviewEvidence({ ...walk, nodes: walk.nodes.filter((entry) => entry.path !== root) }), null);
  const badDimensions = readSlgOverviewEvidence({ ...walk, visible: { width: 0, height: 1600 } }, 10000, 10000);
  assert.equal(badDimensions.bounds, null);
  assert.equal(badDimensions.landmarks[0].expected, null, "没有有效公开地图尺寸就不能猜定位坐标");
  const scrollPath = `${root}/slg-overview-scroll`;
  const scroll = readSlgOverviewEvidence({ ...walk, nodes: [
    ...walk.nodes.filter((entry) => !entry.path.startsWith(nav)).map((entry) => entry.name === "footer" ? { ...entry, text: "山河绘卷" } : entry),
    node("slg-overview-scroll", null, scrollPath, { x: 200, y: 400, width: 600, height: 600 }),
    node("slg-overview-art", null, `${scrollPath}/slg-overview-art`),
  ] }, 10000, 10000);
  assert.equal(scroll.mode, "scroll");
  assert.equal(scroll.artVisible, true);
  assert.equal(scroll.position, null);
  assert.equal(scroll.viewportEdges.length, 0);
  assert.deepEqual(scroll.landmarks, []);
  const closed = { ...walk, nodes: [
    ...walk.nodes.filter((entry) => !entry.path.startsWith(root)),
    node("slg-world", null, "scene/Canvas/SlgMapView/slg-world", { x: -1200, y: 1700 }),
    node("slg-chunk-312-312", null, "scene/Canvas/SlgMapView/slg-world/slg-chunk-312-312", null),
  ] };
  assert.equal(readSlgOverviewEvidence(closed, 10000, 10000), null);
  assert.equal(readSlgMapEvidence(closed).loaded, true);
  assert.deepEqual(readSlgMapEvidence(closed).worldCenter, { x: -1200, y: 1700 }, "只在关闭总览后比对重新激活的公开地图坐标");
});

test("SLG 预览工具世界尺寸与 shared 常量一致（换图改尺寸时必须同改）", () => {
  assert.equal(SLG_WORLD_SIZE, SLG_MAPS[0].width);
  assert.equal(SLG_MAPS[0].id, "senzhiguo");
});

test("SLG 材质证据：页面脚本自包含，只读公开共享材质和精灵，不创实例、不加载资源", () => {
  for (const token of ["getMaterialInstance", "resources.", "Logic", "fetch(", "require("]) {
    assert.ok(!slgRenderAssetsSource.includes(token), `渲染观察脚本不得包含 ${token}`);
  }
  const node = (name: string, children: unknown[] = [], components: Record<string, unknown> = {}, activeInHierarchy = true) => ({
    name, children, activeInHierarchy, getComponent: (id: string) => components[id] ?? null,
  });
  const texture = { width: 1536, height: 1024 };
  const texturedMesh = { "cc.MeshRenderer": { getSharedMaterial: (index: number) => {
    assert.equal(index, 0);
    return { getProperty: (name: string) => { assert.equal(name, "mainTexture"); return texture; } };
  } } };
  const scene = node("scene", [
    node("slg-chunk-9-9", [], texturedMesh),
    node("SlgMapView", [
      node("slg-chunk-1-2", [], texturedMesh),
      node("slg-decorations-1-2", [], texturedMesh),
      node("slg-chunk-2-2", [], { "cc.MeshRenderer": { getSharedMaterial: () => ({ getProperty: () => null }) } }),
      node("slg-overview-art", [], { "cc.Sprite": { spriteFrame: { texture: { width: 1254, height: 1254 } } } }),
      node("slg-decorations-3-3", [], texturedMesh, false),
      node("slg-far-sea", [], texturedMesh),
      node("slg-far-island", [], texturedMesh),
      node("slg-far-landmarks", [], texturedMesh),
      node("slg-far-ownership", [], texturedMesh, false),
    ]),
  ]);
  const evaluate = new Function("cc", `return ${slgRenderAssetsSource};`);
  const result = evaluate({ director: { getScene: () => scene } });
  assert.deepEqual(result.map((entry: { name: string }) => entry.name),
    ["slg-chunk-1-2", "slg-decorations-1-2", "slg-chunk-2-2", "slg-overview-art", "slg-far-sea", "slg-far-island", "slg-far-landmarks"]);
  assert.equal(result[0].textured, true);
  assert.equal(result[1].width, 1536);
  assert.equal(result[2].textured, false);
  assert.deepEqual(result[3], { name: "slg-overview-art", kind: "sprite", textured: true, width: 1254, height: 1254 });
  assert.deepEqual(result[4], { name: "slg-far-sea", kind: "mesh", textured: true, width: 1536, height: 1024 },
    "远档海面为 sea-tile 贴图整图层（渲染水面平铺）");
  assert.equal(result[5].textured, true, "远档岛貌地表使用纯地表烘图贴图");
  assert.equal(result[6].textured, true, "远档地标使用装饰图集贴图");
  assert.ok(!result.some((entry: { name: string }) => entry.name === "slg-far-ownership"), "隐藏节点不参与证据");
  assert.deepEqual(evaluate({ director: { getScene: () => null } }), []);
});

test("SLG 后台滚动证据：页面脚本自包含，只读取设置视口并复制公开偏移", () => {
  const offset = { x: 0, y: 12 };
  interface TestNode {
    name: string; children: TestNode[]; activeInHierarchy: boolean;
    getChildByName: (id: string) => TestNode | null;
    getComponent: (id: string) => unknown;
  }
  const node = (name: string, children: TestNode[] = [], components: Record<string, unknown> = {}, activeInHierarchy = true): TestNode => ({
    name, children, activeInHierarchy,
    getChildByName: (id) => children.find((child) => child.name === id) ?? null,
    getComponent: (id) => components[id] ?? null,
  });
  const scroll = { getScrollOffset: () => offset };
  const settings = node("SettingsView", [node("panel", [node("viewport", [], { "cc.ScrollView": scroll })])]);
  const evaluate = new Function("cc", `return ${slgSettingsScrollSource};`);
  const scene = node("scene", [
    node("SettingsView", [], {}, false),
    node("OtherView", [node("viewport", [], { "cc.ScrollView": { getScrollOffset: () => ({ x: 99, y: 99 }) } })]),
    settings,
  ]);
  const snapshot = evaluate({ director: { getScene: () => scene } });
  assert.deepEqual(snapshot, { x: 0, y: 12 });
  offset.y = 20;
  assert.equal(snapshot.y, 12, "保存快照，不能把引擎复用 Vec2 的新偏移当成原值");
  assert.deepEqual(evaluate({ director: { getScene: () => scene } }), { x: 0, y: 20 });
  assert.equal(evaluate({ director: { getScene: () => node("scene") } }), null);
  assert.equal(evaluate({ director: { getScene: () => null } }), null);
  offset.y = Number.NaN;
  assert.equal(evaluate({ director: { getScene: () => scene } }), null);
});

test("SLG 输入隔离断言：检测两轴后台偏移，不把缺失证据或失效组件算通过", () => {
  const before = { x: 0, y: 12 };
  assert.deepEqual(assertSlgSettingsScrollUnchanged(before, { x: 0, y: 12 }),
    { before, after: { x: 0, y: 12 }, unchanged: true });
  assert.throws(() => assertSlgSettingsScrollUnchanged(before, { x: 0, y: 13 }), /穿透到后台设置滚动/u);
  assert.throws(() => assertSlgSettingsScrollUnchanged(before, { x: 2, y: 12 }), /穿透到后台设置滚动/u);
  assert.throws(() => assertSlgSettingsScrollUnchanged(null, null), /不可观测/u);
  assert.throws(() => assertSlgSettingsScrollUnchanged(before, null), /不可观测/u);
  assert.throws(() => assertSlgSettingsScrollUnchanged(before, { x: 0, y: Number.NaN }), /不可观测/u);
});

test("SLG 预览输入：从公开帮助/详情行定位地图内区域，缺失/倒置时拒绝猜坐标", () => {
  const label = (text: string, y: number) => ({ name: "label", text, path: "scene/Canvas/SlgMapView/label", center: { x: 237.5, y } });
  const walk = { canvas: { x: 50, y: 30, width: 375, height: 812 }, nodes: [
    label("拖动平移  ·  双指 / 滚轮缩放", 130), label("点选地图中的一格", 630),
  ] };
  const area = slgMapGestureArea(walk);
  assert.equal(area.x, 237.5);
  assert.equal(area.y, 380);
  assert(area.y - area.height / 2 > 130);
  assert(area.y + area.height / 2 < 630);
  assert.throws(() => slgMapGestureArea({ ...walk, nodes: [] }), /不可用/u);
  assert.throws(() => slgMapGestureArea({ ...walk, nodes: [walk.nodes[0], label("点选地图中的一格", 100)] }), /不可用/u);
});

test("SLG LOD 截图等待：网格集合变化/限流退避重置稳定计时，不以标题或固定睡眠冒充加载完毕", () => {
  const evidence = { loaded: true, lod: 4, chunks: ["slg-chunk-1-1"], notice: null, worldCenter: { x: 50, y: 60 } };
  let state = slgFrameStability(null, evidence, 0, 4);
  state = slgFrameStability(state, evidence, 1200, 4);
  assert.equal(state.ready, false, "至少等待 2.4 秒，即使早期集合看起来稳定");
  const changed = { ...evidence, chunks: ["slg-chunk-1-2"] };
  state = slgFrameStability(state, changed, 2000, 4);
  state = slgFrameStability(state, changed, 2400, 4);
  assert.equal(state.ready, false, "相同个数但成员改变也须重新稳定 1.2 秒");
  state = slgFrameStability(state, changed, 3200, 4);
  assert.equal(state.ready, true);
  state = slgFrameStability(state, { ...changed, notice: "地图请求较多，稍后自动重试" }, 4000, 4);
  assert.equal(state.ready, false);
  state = slgFrameStability(state, { ...changed, notice: "地图已恢复加载" }, 8000, 4);
  assert.equal(state.ready, false, "退避恢复后重新观察稳定窗口");
  assert.equal(slgFrameStability(state, changed, 9200, 4).ready, true);
  assert.equal(slgFrameStability(state, { ...changed, loaded: false }, 9200, 4).ready, false);
  assert.equal(slgFrameStability(state, { ...changed, lod: 3 }, 9200, 4).ready, false);
});


test("SLG 预览证据：LOD 4 远档整图层（slg-far-*）替代逐 chunk 网格同样算已加载", () => {
  const node = (name: string, text: string | null, center: object | null = { x: 100, y: 100 }) => ({ name, text, path: `scene/Canvas/SlgMapView/${name}`, center });
  const walk = { nodes: [
    node("SlgMapView", null),
    node("title", "青原仙洲 · LOD 4 · 奖杯 7"),
    node("details", "(5006, 4999) · 地形 0 · 我方 · 守备 1"),
    node("slg-far-sea", null, null),
    node("slg-far-island", null, null),
    node("slg-far-landmarks", null, null),
    node("slg-far-ownership", null, null),
    node("slg-world", null, { x: -1000, y: 1100 }),
  ] };
  const result = readSlgMapEvidence(walk)!;
  assert.equal(result.loaded, true, "整图层存在即已加载（远档无逐 chunk 节点）");
  assert.deepEqual(result.chunks, []);
  assert.deepEqual(result.farNodes, ["slg-far-island", "slg-far-landmarks", "slg-far-ownership", "slg-far-sea"]);
  assert.equal(result.farGround, true);
  assert.equal(result.farLandmarks, true);
  assert.equal(result.farOwnership, true);
  assert.equal(readSlgMapEvidence({ nodes: walk.nodes.filter((entry) => entry.name !== "slg-far-sea" && entry.name !== "slg-far-island") })!.loaded,
    false, "远档缺地表整图层与近档缺全部 chunk 一样未就绪");
});

test("SLG LOD 截图等待：远档整图层集合变化同样重置稳定计时", () => {
  const evidence = { loaded: true, lod: 4, chunks: [] as string[],
    farNodes: ["slg-far-sea", "slg-far-landmarks"], notice: null, worldCenter: { x: 50, y: 60 } };
  let state = slgFrameStability(null, evidence, 0, 4);
  state = slgFrameStability(state, evidence, 1200, 4);
  state = slgFrameStability(state, evidence, 2400, 4);
  assert.equal(state.ready, true);
  const changed = { ...evidence, farNodes: ["slg-far-sea", "slg-far-landmarks", "slg-far-ownership"] };
  state = slgFrameStability(state, changed, 2500, 4);
  assert.equal(state.ready, false, "farNodes 变化（归属网格重建/图层增删）也须重新稳定 1.2 秒");
  state = slgFrameStability(state, changed, 3700, 4);
  assert.equal(state.ready, true);
});
