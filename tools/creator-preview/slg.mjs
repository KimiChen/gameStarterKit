/** SLG route replay. Evidence comes only from rendered nodes/text and ordinary CDP input. */
import { selectNodes, sleep } from "./lib.mjs";

const VIEW = "SlgMapView";
const OVERVIEW = "slg-world-overview";
const inView = (node) => node.path.includes(`${VIEW}/`);

/** 世界格边长（真源 = shared worldmap 的 SLG_MAP_W；creator-preview-tool.test.ts 钉住两者一致）。 */
export const SLG_WORLD_SIZE = 1500;

/** Parse the public UI, deliberately rejecting missing/loading titles and incomplete tile details. */
export function readSlgMapEvidence(walk) {
  if (!walk?.nodes.some((node) => node.name === VIEW)) return null;
  const nodes = walk.nodes.filter(inView);
  const title = nodes.find((node) => typeof node.text === "string" && /^.+ · LOD [1-4] · 奖杯 \d+$/u.test(node.text));
  const titleMatch = title?.text.match(/^(.+) · LOD ([1-4]) · 奖杯 (\d+)$/u);
  const details = nodes.find((node) => typeof node.text === "string" && /^\(\d+, \d+\) · 地形 \d+ · .+ · 守备 \d+$/u.test(node.text));
  const tileMatch = details?.text.match(/^\((\d+), (\d+)\) · 地形 (\d+) · (无主|我方|敌方 .+) · 守备 (\d+)$/u);
  const chunks = nodes.filter((node) => /^slg-chunk-\d+-\d+$/u.test(node.name)).map((node) => node.name).sort();
  // LOD 4 远档：逐 chunk 网格被整图层（slg-far-*）替代——整图层存在同样算「已加载」。
  const farNodes = nodes.filter((node) => /^slg-far-(sea|island|landmarks|ownership)$/u.test(node.name)).map((node) => node.name).sort();
  const farGround = farNodes.includes("slg-far-sea") || farNodes.includes("slg-far-island");
  const notice = nodes.find((node) => typeof node.text === "string" && /^(已占领|已加固|已削减|地图资源加载失败|操作失败|地图加载或操作失败|网络暂不可用|地图请求较多|地图已恢复加载)/u.test(node.text));
  return {
    loaded: !!titleMatch && titleMatch[1] !== "大地图" && (chunks.length > 0 || farGround),
    title: title?.text ?? null,
    lod: titleMatch ? Number(titleMatch[2]) : null,
    trophies: titleMatch ? Number(titleMatch[3]) : null,
    chunks,
    farNodes,
    farGround,
    farLandmarks: farNodes.includes("slg-far-landmarks"),
    farOwnership: farNodes.includes("slg-far-ownership"),
    terrainLayer: nodes.some((node) => node.name === "slg-terrain-layer"),
    decorationLayer: nodes.some((node) => node.name === "slg-decoration-layer"),
    decorationChunks: nodes.filter((node) => /^slg-decorations-\d+-\d+$/u.test(node.name)).map((node) => node.name).sort(),
    tile: tileMatch ? { x: Number(tileMatch[1]), y: Number(tileMatch[2]), terrain: Number(tileMatch[3]), owner: tileMatch[4], guard: Number(tileMatch[5]), text: details.text } : null,
    notice: notice?.text ?? null,
    worldCenter: nodes.find((node) => node.name === "slg-world")?.center ?? null,
  };
}

/** Read actual visible overview nodes; hidden scroll/navigation branches are absent from pageWalk. */
export function readSlgOverviewEvidence(walk, worldWidth = SLG_WORLD_SIZE, worldHeight = SLG_WORLD_SIZE) {
  const panel = walk?.nodes.find((node) => inView(node) && node.name === OVERVIEW);
  if (!panel) return null;
  const nodes = walk.nodes.filter((node) => node.path.startsWith(`${panel.path}/`));
  const navigation = nodes.find((node) => node.name === "slg-overview-navigation");
  const scroll = nodes.find((node) => node.name === "slg-overview-scroll");
  const map = navigation ?? scroll;
  const center = map?.center;
  const scaleX = walk.canvas?.width / walk.visible?.width, scaleY = walk.canvas?.height / walk.visible?.height;
  const width = center?.width * scaleX, height = center?.height * scaleY;
  const dimensions = [center?.x, center?.y, width, height, worldWidth, worldHeight];
  const bounds = dimensions.every(Number.isFinite) && width > 0 && height > 0 && worldWidth > 0 && worldHeight > 0
    ? { x: center.x - width / 2, y: center.y - height / 2, width, height } : null;
  const coordinate = nodes.find((node) => typeof node.text === "string" && /^当前位置（\d+, \d+） · 点击地图定位$/u.test(node.text));
  const coordinates = coordinate?.text.match(/^当前位置（(\d+), (\d+)）/u);
  const landmarks = nodes.filter((node) => /^slg-overview-site-/u.test(node.name) && node.center).map((site) => {
    const label = nodes.find((node) => node.path.startsWith(`${site.path}/`) && typeof node.text === "string" && node.text.length > 0);
    // Site group centers are their true map anchors. Icons and labels may have presentation offsets.
    const expected = bounds ? {
      x: Math.max(0, Math.min(worldWidth - 1, Math.round((site.center.x - bounds.x) / bounds.width * worldWidth))),
      y: Math.max(0, Math.min(worldHeight - 1, Math.round((1 - (site.center.y - bounds.y) / bounds.height) * worldHeight))),
    } : null;
    return { name: label?.text ?? null, path: site.path, center: site.center, expected };
  }).filter((site) => site.name);
  return {
    title: nodes.find((node) => typeof node.text === "string" && /^.+ · 世界总览$/u.test(node.text))?.text ?? null,
    mode: navigation && !scroll ? "navigation" : scroll && !navigation ? "scroll" : null,
    bounds,
    viewportEdges: nodes.filter((node) => node.name === "slg-overview-viewport" && node.center).map((node) => node.center),
    position: coordinates ? { x: Number(coordinates[1]), y: Number(coordinates[2]) } : null,
    landmarks,
    artVisible: nodes.some((node) => node.name === "slg-overview-art"),
  };
}

/** Self-contained browser observation: public render components only, with no asset loads or material instances. */
function readSlgRenderAssets() {
  if (typeof cc === "undefined" || !cc.director?.getScene()) return [];
  const result = [];
  const visit = (node, inMap) => {
    if (!node.activeInHierarchy) return;
    const inside = inMap || node.name === "SlgMapView";
    if (inside && (/^slg-chunk-\d+-\d+$/u.test(node.name) || /^slg-decorations-\d+-\d+$/u.test(node.name)
        || /^slg-far-(sea|island|landmarks|ownership)$/u.test(node.name))) {
      const renderer = node.getComponent("cc.MeshRenderer");
      const material = renderer?.getSharedMaterial(0);
      const texture = material?.getProperty("mainTexture");
      result.push({ name: node.name, kind: "mesh", textured: !!texture && texture.width > 0 && texture.height > 0,
        width: texture?.width ?? null, height: texture?.height ?? null });
    }
    if (inside && node.name === "slg-overview-art") {
      const texture = node.getComponent("cc.Sprite")?.spriteFrame?.texture;
      result.push({ name: node.name, kind: "sprite", textured: !!texture && texture.width > 0 && texture.height > 0,
        width: texture?.width ?? null, height: texture?.height ?? null });
    }
    for (const child of node.children) visit(child, inside);
  };
  visit(cc.director.getScene(), false);
  return result;
}
export const slgRenderAssetsSource = `(${readSlgRenderAssets.toString()})()`;

/** Observe the still-mounted settings panel without changing its event listeners or scroll state. */
function readSlgSettingsScroll() {
  if (typeof cc === "undefined" || !cc.director?.getScene()) return null;
  const find = (node) => {
    if (!node.activeInHierarchy) return null;
    if (node.name === "SettingsView") return node;
    for (const child of node.children) { const found = find(child); if (found) return found; }
    return null;
  };
  const settings = find(cc.director.getScene());
  const viewport = settings?.getChildByName("panel")?.getChildByName("viewport");
  const offset = viewport?.getComponent("cc.ScrollView")?.getScrollOffset();
  return offset && Number.isFinite(offset.x) && Number.isFinite(offset.y) ? { x: offset.x, y: offset.y } : null;
}
export const slgSettingsScrollSource = `(${readSlgSettingsScroll.toString()})()`;

export function assertSlgSettingsScrollUnchanged(before, after) {
  if (![before?.x, before?.y, after?.x, after?.y].every(Number.isFinite)) {
    throw new Error("后台 SettingsView 的 ScrollView 偏移不可观测，无法验证地图输入隔离");
  }
  if (Math.hypot(after.x - before.x, after.y - before.y) > 0.1) {
    throw new Error(`地图操作穿透到后台设置滚动：${JSON.stringify({ before, after })}`);
  }
  return { before, after, unchanged: true };
}

async function settingsScrollUnchanged(runner, before) {
  return assertSlgSettingsScrollUnchanged(before, await runner.client.evaluate(slgSettingsScrollSource));
}

async function renderedMapAssets(runner) {
  const assets = await runner.client.evaluate(slgRenderAssetsSource);
  const terrain = assets.filter((entry) => /^slg-chunk-/u.test(entry.name));
  const decorations = assets.filter((entry) => /^slg-decorations-/u.test(entry.name));
  if (!terrain.length || !decorations.length || [...terrain, ...decorations].some((entry) => !entry.textured)) {
    throw new Error(`地图贴图/装饰材质尚未就绪：${JSON.stringify({ terrain: terrain.slice(0, 2), decorations: decorations.slice(0, 2) })}`);
  }
  return { terrainCount: terrain.length, decorationCount: decorations.length, samples: [terrain[0], decorations[0]] };
}

/** 远档（标题 LOD 4）整图层证据：海面为无贴图顶点色（设计如此），岛貌地表与地标必须有贴图。 */
async function renderedFarAssets(runner) {
  const assets = await runner.client.evaluate(slgRenderAssetsSource);
  const sea = assets.find((entry) => entry.name === "slg-far-sea");
  const island = assets.find((entry) => entry.name === "slg-far-island");
  const landmarks = assets.find((entry) => entry.name === "slg-far-landmarks");
  if (!sea || sea.textured) throw new Error(`远档海面应为无贴图顶点色整图层：${JSON.stringify(sea ?? null)}`);
  if (!island?.textured) throw new Error(`远档岛貌地表贴图尚未就绪：${JSON.stringify(island ?? null)}`);
  if (!landmarks?.textured) throw new Error(`远档地标贴图尚未就绪：${JSON.stringify(landmarks ?? null)}`);
  return { seaUntextured: true, islandTextured: true, landmarksTextured: true,
    ownership: assets.some((entry) => entry.name === "slg-far-ownership") };
}

/** Anchor the gestures between the visible help row and tile detail row, never in the toolbars. */
export function slgMapGestureArea(walk) {
  const help = selectNodes(walk, { pathIncludes: VIEW, text: "拖动平移  ·  双指 / 滚轮缩放" })[0];
  const details = selectNodes(walk, { pathIncludes: VIEW, textMatches: /^(点选地图中的一格|\(\d+, \d+\) · 地形)/u })[0];
  if (!help || !details || !walk?.canvas || details.center.y <= help.center.y) throw new Error("SLG 地图的帮助/详情行位置不可用");
  const span = details.center.y - help.center.y;
  return {
    x: walk.canvas.x + walk.canvas.width / 2,
    y: (help.center.y + details.center.y) / 2,
    width: walk.canvas.width * 0.7,
    height: span * 0.6,
  };
}

function failed(evidence) {
  if (evidence?.notice && /失败|不可用/u.test(evidence.notice)) throw new Error(evidence.notice);
  return evidence;
}

/** Pure observation state: elapsed time alone is insufficient while the chunk set keeps changing. */
export function slgFrameStability(previous, evidence, now, lod) {
  const startedAt = previous?.startedAt ?? now;
  const valid = !!evidence?.loaded && evidence.lod === lod && !/稍后自动重试/u.test(evidence.notice ?? "");
  // Also wait out residual drag inertia; subpixel noise smaller than 0.1 CSS px is immaterial.
  const position = evidence?.worldCenter ? [evidence.worldCenter.x, evidence.worldCenter.y].map((n) => Math.round(n * 10)) : [];
  const key = valid ? JSON.stringify([lod, evidence.chunks, evidence.farNodes ?? [], position]) : null;
  const lastChangeAt = !valid || previous?.key !== key ? now : previous.lastChangeAt;
  const elapsedMs = now - startedAt;
  const stableMs = now - lastChangeAt;
  return { startedAt, lastChangeAt, key, elapsedMs, stableMs, ready: valid && elapsedMs >= 2400 && stableMs >= 1200 };
}

async function stableSlgFrame(runner, lod) {
  let observation = null;
  return runner.waitFor(`LOD ${lod} 网格稳定（至少 2.4 秒、集合持续 1.2 秒不变）`, (walk) => {
    const evidence = failed(readSlgMapEvidence(walk));
    observation = slgFrameStability(observation, evidence, Date.now(), lod);
    return observation.ready ? { ...evidence, settling: { elapsedMs: observation.elapsedMs, stableMs: observation.stableMs, chunkCount: evidence.chunks.length } } : null;
  }, Math.max(runner.options.stepTimeoutMs, 40_000));
}

/** Run after SettingsView has been reached by the shared login/settings flow. */
export async function replaySlgMap(runner) {
  await runner.step("点设置中的「大地图」卡片（正式 route）", async () => {
    return runner.tapSettingsEntry("map");
  });
  await runner.step("SlgMapView 加载地表贴图与独立装饰层", async () => {
    const evidence = await runner.waitFor("地图标题、chunk 网格与装饰节点", (walk) => {
      const value = failed(readSlgMapEvidence(walk));
      return value?.loaded && value.terrainLayer && value.decorationLayer && value.decorationChunks.length ? value : null;
    }, 60_000);
    return { ...(await stableSlgFrame(runner, evidence.lod)), assets: await renderedMapAssets(runner), shot: await runner.shot("slg-opened") };
  });

  const selected = await runner.step("点选可见无主格（不直接调用 Logic 或 RPC）", async () => {
    const area = slgMapGestureArea(await runner.walk());
    const tried = [];
    // Replays may find the previous run's tile occupied. Inspect nearby rendered map positions first.
    for (const row of [0, -0.3, 0.3]) for (const column of [0, -0.25, 0.25, -0.5, 0.5]) {
      const at = { x: area.x + area.width * column, y: area.y + area.height * row };
      const previous = readSlgMapEvidence(runner.lastWalk)?.tile;
      await runner.client.click(at.x, at.y);
      const evidence = await runner.waitFor("选中格详情", (walk) => {
        const value = failed(readSlgMapEvidence(walk));
        return value?.tile && (!previous || value.tile.x !== previous.x || value.tile.y !== previous.y) ? value : null;
      });
      tried.push({ at, tile: evidence.tile });
      if (evidence.tile.owner === "无主") {
        // Allow the visible chunk request to finish before the action becomes available.
        await sleep(800);
        const ready = failed(readSlgMapEvidence(await runner.walk()));
        if (ready?.tile?.owner === "无主") return { ...ready, tried, shot: await runner.shot("slg-selected") };
      }
    }
    throw new Error(`当前可见区域未找到无主格：${JSON.stringify(tried)}`);
  });

  const captured = await runner.step("免费占领并观察 SQL 结果与奖杯回流", async () => {
    await runner.tapText("免费占领", { pathIncludes: VIEW });
    const evidence = await runner.waitFor("选中格变我方守备 1，奖杯增加 1", (walk) => {
      const value = failed(readSlgMapEvidence(walk));
      return value?.tile?.x === selected.tile.x && value.tile.y === selected.tile.y
        && value.tile.owner === "我方" && value.tile.guard === 1
        && value.trophies === selected.trophies + 1 && value.notice === "已占领 · 奖杯 +1" ? value : null;
    });
    return { before: selected.tile, ...evidence, shot: await runner.shot("slg-captured") };
  });

  await runner.step("刷新后同一格仍归我方（权威查询重读）", async () => {
    await runner.tapText("刷新", { pathIncludes: VIEW });
    // Refresh clears the sparse projection, so a post-click read must regain both ownership and mesh.
    await sleep(400);
    const evidence = await runner.waitFor("刷新后所有权、守备及奖杯保持", (walk) => {
      const value = failed(readSlgMapEvidence(walk));
      return value?.loaded && value.tile?.text === captured.tile.text && value.trophies === captured.trophies ? value : null;
    });
    return { ...evidence, shot: await runner.shot("slg-refreshed") };
  });

  await runner.step("中央鼠标拖动平移，后台设置不滚动", async () => {
    const walk = await runner.walk();
    const before = readSlgMapEvidence(walk)?.worldCenter;
    const area = slgMapGestureArea(walk);
    const settingsBefore = await runner.client.evaluate(slgSettingsScrollSource);
    assertSlgSettingsScrollUnchanged(settingsBefore, settingsBefore);
    if (!before) throw new Error("找不到 slg-world 的可测坐标");
    const from = { x: area.x - area.width * 0.15, y: area.y };
    const to = { x: area.x + area.width * 0.15, y: area.y + area.height * 0.1 };
    await runner.client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
    await runner.client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...from, button: "left", buttons: 1, clickCount: 1 });
    try {
      for (let step = 1; step <= 8; step++) {
        await runner.client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8, button: "left", buttons: 1 });
        await sleep(40);
        await settingsScrollUnchanged(runner, settingsBefore);
      }
    } finally {
      await runner.client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...to, button: "left", buttons: 0, clickCount: 1 });
    }
    const evidence = await runner.waitFor("平移后的世界节点坐标", (next) => {
      const value = failed(readSlgMapEvidence(next));
      return value?.worldCenter && Math.hypot(value.worldCenter.x - before.x, value.worldCenter.y - before.y) > 5 ? value : null;
    });
    return { from, to, before, after: evidence.worldCenter, settingsScroll: await settingsScrollUnchanged(runner, settingsBefore),
      shot: await runner.shot("slg-panned") };
  });

  const lods = new Set();
  const initial = failed(readSlgMapEvidence(await runner.walk()));
  if (initial?.lod !== 1) throw new Error(`预期初始 LOD 1，实际 ${initial?.lod}`);
  lods.add(initial.lod);
  await runner.step("记录 LOD 1 近景（网格稳定后）", async () => ({ ...(await stableSlgFrame(runner, 1)), shot: await runner.shot("slg-lod-1") }));
  let direction = 1;
  for (const target of [2, 3, 4]) {
    await runner.step(`中央滚轮缩放到 LOD ${target}，后台设置不滚动`, async () => {
      const area = slgMapGestureArea(await runner.walk());
      const settingsBefore = await runner.client.evaluate(slgSettingsScrollSource);
      assertSlgSettingsScrollUnchanged(settingsBefore, settingsBefore);
      const deltas = [];
      for (let attempt = 0; attempt < 64; attempt++) {
        const deltaY = 60 * direction;
        await runner.client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: area.x, y: area.y, deltaX: 0, deltaY });
        deltas.push(deltaY);
        await sleep(120);
        await settingsScrollUnchanged(runner, settingsBefore);
        const evidence = failed(readSlgMapEvidence(await runner.walk()));
        if (evidence?.lod === target) {
          lods.add(target);
          return { ...(await stableSlgFrame(runner, target)), deltas,
            settingsScroll: await settingsScrollUnchanged(runner, settingsBefore), shot: await runner.shot(`slg-lod-${target}`) };
        }
        if (evidence?.lod > target) throw new Error(`滚轮从 LOD ${target - 1} 跳过 ${target} 到 ${evidence.lod}`);
        // Cocos/browser wheel conventions vary. Decide by observed LOD, never mutate camera fields.
        if (target === 2 && attempt === 7 && evidence?.lod === 1) direction = -1;
      }
      throw new Error(`64 次滚轮后仍未到 LOD ${target}`);
    });
  }
  const openedOverview = await runner.step("打开世界总览，读取实地图、当前位置框与地标", async () => {
    const local = failed(readSlgMapEvidence(await runner.walk()));
    if (!local?.loaded || !local.worldCenter) throw new Error("总览打开前的局部地图尚未就绪");
    await runner.tapText("总览", { pathIncludes: VIEW });
    const overview = await runner.waitFor("实地图与四条视口边框", (walk) => {
      const value = readSlgOverviewEvidence(walk);
      return value?.mode === "navigation" && value.title && value.bounds && value.position
        && value.viewportEdges.length === 4 && value.landmarks.length > 0 ? value : null;
    });
    return { ...overview, localBefore: { worldCenter: local.worldCenter, tile: local.tile, lod: local.lod },
      shot: await runner.shot("slg-world-navigation") };
  });

  await runner.step("山河绘卷可欣赏，点击画面保持位置与总览", async () => {
    const before = failed(readSlgMapEvidence(await runner.walk()));
    await runner.tapText("山河绘卷", { pathIncludes: `${OVERVIEW}/slg-overview-山河绘卷` });
    const scroll = await runner.waitFor("山河绘卷图片显示、实地图隐藏", (walk) => {
      const value = readSlgOverviewEvidence(walk);
      return value?.mode === "scroll" && value.artVisible && value.bounds && value.viewportEdges.length === 0 ? value : null;
    });
    const assets = await runner.client.evaluate(slgRenderAssetsSource);
    const art = assets.find((entry) => entry.name === "slg-overview-art" && entry.textured);
    if (!art) throw new Error("山河绘卷的 Sprite 尚无有效贴图");
    await runner.client.click(scroll.bounds.x + scroll.bounds.width / 2, scroll.bounds.y + scroll.bounds.height / 2);
    await sleep(700);
    const walk = await runner.walk(), after = failed(readSlgMapEvidence(walk));
    const retained = readSlgOverviewEvidence(walk);
    if (retained?.mode !== "scroll" || after?.tile?.text !== before?.tile?.text) {
      throw new Error("点击山河绘卷意外关闭总览或改变选格");
    }
    const shot = await runner.shot("slg-world-scroll");
    // The local world is intentionally inactive while the overview is open, so its chunks and
    // transform are absent from pageWalk. Compare its public position only after closing the panel.
    await runner.tapText("返回", { pathIncludes: OVERVIEW });
    const origin = openedOverview.localBefore;
    const restored = await runner.waitFor("关闭绘卷后，局部地图位置与选格保持", (next) => {
      const value = failed(readSlgMapEvidence(next));
      return !readSlgOverviewEvidence(next) && value?.loaded && value.worldCenter && value.lod === origin.lod
        && value.tile?.text === origin.tile?.text
        && Math.hypot(value.worldCenter.x - origin.worldCenter.x, value.worldCenter.y - origin.worldCenter.y) < 0.1 ? value : null;
    });
    await runner.tapText("总览", { pathIncludes: VIEW });
    await runner.waitFor("绘卷关闭后重新打开世界总览", (next) => readSlgOverviewEvidence(next));
    await runner.tapText("实地图", { pathIncludes: `${OVERVIEW}/slg-overview-实地图` });
    const navigation = await runner.waitFor("实地图当前位置保持", (next) => {
      const value = readSlgOverviewEvidence(next);
      return value?.mode === "navigation" && value.position?.x === openedOverview.position.x
        && value.position?.y === openedOverview.position.y ? value : null;
    });
    return { ...retained, art, positionUnchanged: true, restoredWorldCenter: restored.worldCenter,
      overviewPosition: navigation.position, shot };
  });

  await runner.step("实地图点选命名地标，回到对应局部格并稳定显示", async () => {
    await runner.tapText("实地图", { pathIncludes: `${OVERVIEW}/slg-overview-实地图` });
    const overview = await runner.waitFor("实地图地标可点击", (walk) => {
      const value = readSlgOverviewEvidence(walk);
      return value?.mode === "navigation" && value.position && value.landmarks.some((site) => site.expected) ? value : null;
    });
    const candidates = overview.landmarks.filter((site) => site.expected).sort((a, b) =>
      Math.hypot(b.expected.x - overview.position.x, b.expected.y - overview.position.y)
      - Math.hypot(a.expected.x - overview.position.x, a.expected.y - overview.position.y));
    const landmark = candidates[0];
    await runner.tapText(landmark.name, { pathIncludes: landmark.path });
    const located = await runner.waitFor("总览关闭，详情坐标与地标位置吻合", (walk) => {
      const value = failed(readSlgMapEvidence(walk));
      return !readSlgOverviewEvidence(walk) && value?.loaded && value.tile
        && Math.abs(value.tile.x - landmark.expected.x) <= 1 && Math.abs(value.tile.y - landmark.expected.y) <= 1 ? value : null;
    });
    return { landmark, ...(await stableSlgFrame(runner, located.lod)),
      // 定位落点在哪一档就按哪一档断言：LOD 4 远档是整图层（无贴图地表 + 贴图地标），近档是逐 chunk 贴图与装饰。
      assets: located.lod >= 4 ? await renderedFarAssets(runner) : await renderedMapAssets(runner),
      shot: await runner.shot("slg-world-located") };
  });

  await runner.step("总览返回只关闭面板，保留当前位置与选格", async () => {
    const before = failed(readSlgMapEvidence(await runner.walk()));
    await runner.tapText("总览", { pathIncludes: VIEW });
    await runner.waitFor("世界总览重新显示", (walk) => readSlgOverviewEvidence(walk));
    await runner.tapText("返回", { pathIncludes: OVERVIEW });
    const after = await runner.waitFor("总览隐藏、局部位置不变", (walk) => {
      const value = failed(readSlgMapEvidence(walk));
      return !readSlgOverviewEvidence(walk) && value?.loaded && value.tile?.text === before?.tile?.text
        && value.worldCenter && before.worldCenter
        && Math.hypot(value.worldCenter.x - before.worldCenter.x, value.worldCenter.y - before.worldCenter.y) < 0.1 ? value : null;
    });
    return { ...after, positionUnchanged: true, shot: await runner.shot("slg-world-returned") };
  });

  await runner.step("关闭地图回设置面板", async () => {
    await runner.tapText("关闭", { pathIncludes: VIEW });
    await runner.waitFor("SlgMapView 卸载，SettingsView 保留", (walk) => {
      return !walk.nodes.some((node) => node.name === VIEW)
        && walk.nodes.some((node) => node.name === "SettingsView") ? true : null;
    });
    return { lods: [...lods], shot: await runner.shot("slg-closed") };
  });

  await runner.step("重新进入地图，地表和装饰重新加载", async () => {
    await runner.tapSettingsEntry("map");
    const evidence = await runner.waitFor("重开后的地图与装饰层", (walk) => {
      const value = failed(readSlgMapEvidence(walk));
      return value?.loaded && value.terrainLayer && value.decorationLayer && value.decorationChunks.length ? value : null;
    }, 60_000);
    return { ...(await stableSlgFrame(runner, evidence.lod)), assets: await renderedMapAssets(runner), shot: await runner.shot("slg-reopened") };
  });
  return runner.step("完成验收并再次关闭地图", async () => {
    await runner.tapText("关闭", { pathIncludes: VIEW });
    await runner.waitFor("重开的地图卸载，设置面板保留", (walk) =>
      !walk.nodes.some((node) => node.name === VIEW) && walk.nodes.some((node) => node.name === "SettingsView") ? true : null);
    return { lods: [...lods], reopened: true, shot: await runner.shot("slg-reopened-closed") };
  });
}
