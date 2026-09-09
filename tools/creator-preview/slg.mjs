/** SLG route replay. Evidence comes only from rendered nodes/text and ordinary CDP input. */
import { selectNodes, sleep } from "./lib.mjs";

const VIEW = "SlgMapView";
const inView = (node) => node.path.includes(`${VIEW}/`);

/** Parse the public UI, deliberately rejecting missing/loading titles and incomplete tile details. */
export function readSlgMapEvidence(walk) {
  if (!walk?.nodes.some((node) => node.name === VIEW)) return null;
  const nodes = walk.nodes.filter(inView);
  const title = nodes.find((node) => typeof node.text === "string" && /^.+ · LOD [1-4] · 奖杯 \d+$/u.test(node.text));
  const titleMatch = title?.text.match(/^(.+) · LOD ([1-4]) · 奖杯 (\d+)$/u);
  const details = nodes.find((node) => typeof node.text === "string" && /^\(\d+, \d+\) · 地形 \d+ · .+ · 守备 \d+$/u.test(node.text));
  const tileMatch = details?.text.match(/^\((\d+), (\d+)\) · 地形 (\d+) · (无主|我方|敌方 .+) · 守备 (\d+)$/u);
  const chunks = nodes.filter((node) => /^slg-chunk-\d+-\d+$/u.test(node.name)).map((node) => node.name).sort();
  const notice = nodes.find((node) => typeof node.text === "string" && /^(已占领|已加固|已削减|地图资源加载失败|操作失败|地图加载或操作失败|网络暂不可用|地图请求较多|地图已恢复加载)/u.test(node.text));
  return {
    loaded: !!titleMatch && titleMatch[1] !== "大地图" && chunks.length > 0,
    title: title?.text ?? null,
    lod: titleMatch ? Number(titleMatch[2]) : null,
    trophies: titleMatch ? Number(titleMatch[3]) : null,
    chunks,
    tile: tileMatch ? { x: Number(tileMatch[1]), y: Number(tileMatch[2]), terrain: Number(tileMatch[3]), owner: tileMatch[4], guard: Number(tileMatch[5]), text: details.text } : null,
    notice: notice?.text ?? null,
    worldCenter: nodes.find((node) => node.name === "slg-world")?.center ?? null,
  };
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
  const key = valid ? JSON.stringify([lod, evidence.chunks, position]) : null;
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
  await runner.step("进入「大地图 · slg」（设置菜单的正式 route）", async () => {
    return runner.tapText("进入", { near: /^大地图\s+·\s+slg$/u });
  });
  await runner.step("SlgMapView 加载原创地形与 chunk 网格", async () => {
    const evidence = await runner.waitFor("青原标题与 slg-chunk 网格", (walk) => {
      const value = failed(readSlgMapEvidence(walk));
      return value?.loaded ? value : null;
    }, 60_000);
    return { ...(await stableSlgFrame(runner, evidence.lod)), shot: await runner.shot("slg-opened") };
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

  await runner.step("鼠标拖动平移（地图节点位置实际改变）", async () => {
    const walk = await runner.walk();
    const before = readSlgMapEvidence(walk)?.worldCenter;
    const area = slgMapGestureArea(walk);
    if (!before) throw new Error("找不到 slg-world 的可测坐标");
    const from = { x: area.x - area.width * 0.15, y: area.y };
    const to = { x: area.x + area.width * 0.15, y: area.y + area.height * 0.1 };
    await runner.client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
    await runner.client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...from, button: "left", buttons: 1, clickCount: 1 });
    for (let step = 1; step <= 8; step++) {
      await runner.client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8, button: "left", buttons: 1 });
      await sleep(40);
    }
    await runner.client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...to, button: "left", buttons: 0, clickCount: 1 });
    const evidence = await runner.waitFor("平移后的世界节点坐标", (next) => {
      const value = failed(readSlgMapEvidence(next));
      return value?.worldCenter && Math.hypot(value.worldCenter.x - before.x, value.worldCenter.y - before.y) > 5 ? value : null;
    });
    return { from, to, before, after: evidence.worldCenter, shot: await runner.shot("slg-panned") };
  });

  const lods = new Set();
  const initial = failed(readSlgMapEvidence(await runner.walk()));
  if (initial?.lod !== 1) throw new Error(`预期初始 LOD 1，实际 ${initial?.lod}`);
  lods.add(initial.lod);
  await runner.step("记录 LOD 1 近景（网格稳定后）", async () => ({ ...(await stableSlgFrame(runner, 1)), shot: await runner.shot("slg-lod-1") }));
  let direction = 1;
  for (const target of [2, 3, 4]) {
    await runner.step(`滚轮缩放到 LOD ${target}`, async () => {
      const area = slgMapGestureArea(await runner.walk());
      const deltas = [];
      for (let attempt = 0; attempt < 64; attempt++) {
        const deltaY = 60 * direction;
        await runner.client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: area.x, y: area.y, deltaX: 0, deltaY });
        deltas.push(deltaY);
        await sleep(120);
        const evidence = failed(readSlgMapEvidence(await runner.walk()));
        if (evidence?.lod === target) {
          lods.add(target);
          return { ...(await stableSlgFrame(runner, target)), deltas, shot: await runner.shot(`slg-lod-${target}`) };
        }
        if (evidence?.lod > target) throw new Error(`滚轮从 LOD ${target - 1} 跳过 ${target} 到 ${evidence.lod}`);
        // Cocos/browser wheel conventions vary. Decide by observed LOD, never mutate camera fields.
        if (target === 2 && attempt === 7 && evidence?.lod === 1) direction = -1;
      }
      throw new Error(`64 次滚轮后仍未到 LOD ${target}`);
    });
  }
  return runner.step("关闭地图回设置面板", async () => {
    await runner.tapText("关闭", { pathIncludes: VIEW });
    await runner.waitFor("SlgMapView 卸载，SettingsView 保留", (walk) => {
      return !walk.nodes.some((node) => node.name === VIEW)
        && walk.nodes.some((node) => node.name === "SettingsView") ? true : null;
    });
    return { lods: [...lods], shot: await runner.shot("slg-closed") };
  });
}
