/**
 * mapOriginal 原版大地图 route 的真引擎重放。
 * 证据只来自**渲染出来的节点与文本** + 普通 CDP 输入，⛔ 不调 Logic、⛔ 不直接发 RPC。
 *
 * 覆盖 v1 的五件事：近档地表就位 → 点选（含坐标换算判据）→ 画面设置生效与置灰 →
 * 拉远换远档底图 → 缩略图跳转 → 推回近档。
 *
 * ⚠ 本 kit **无服务端**：地形随代码（shared 通行层）与资源（BufferAsset 显示层）走，
 *   所以 ⛔ 没有「占领 / 行军」这类写操作可重放。
 */
import { sleep } from "./lib.mjs";

const VIEW = "MapOriginalWorldView";
const inView = (node) => node.path.includes(`${VIEW}/`);

/** 标题形如「原版大地图 · LOD 2/5」。 */
const TITLE_RE = /^原版大地图 · LOD ([0-5])\/5$/u;
/** 状态形如「s1 · 近档 · 画面：2D 沙盘/标准/普通 · 层：terrain / grid」。 */
const STATUS_RE = /^s1 · (近档|远档) · 画面：([^/]+)\/([^/·]+?)\/([^/·]+?)(\/鸟瞰)? · 层：(.*)$/u;
/** 详情形如「(750, 751) 平地」，不可通行多一段，显示层没到位再多一段「· 读取中…」。 */
const DETAIL_RE = /^\((\d+), (\d+)\) ([^\s·]+)( · 不可通行)?( · 读取中…)?$/u;

/**
 * 解析地图页的公开 UI。⚠ 刻意拒绝「标题还没出来」这些中间态 ——
 * 半加载的画面不该被当成证据。
 */
export function readMapOriginalEvidence(walk) {
    if (!walk?.nodes?.some((node) => node.name === VIEW)) return null;
    const nodes = walk.nodes.filter(inView);
    const textOf = (re) => nodes.find((node) => typeof node.text === "string" && re.test(node.text))?.text ?? null;
    const title = textOf(TITLE_RE);
    const status = textOf(STATUS_RE);
    const detail = textOf(DETAIL_RE);
    const titleMatch = title?.match(TITLE_RE);
    const statusMatch = status?.match(STATUS_RE);
    const detailMatch = detail?.match(DETAIL_RE);
    const has = (name) => nodes.some((node) => node.name === name);
    const at = (name) => nodes.find((node) => node.name === name && node.center)?.center ?? null;

    return {
        lod: titleMatch ? Number(titleMatch[1]) : null,
        title, status,
        band: statusMatch ? statusMatch[1] : null,
        graphics: statusMatch
            ? { sandbox: statusMatch[2], colorMode: statusMatch[3], quality: statusMatch[4],
                birdview: !!statusMatch[5] }
            : null,
        layers: statusMatch ? statusMatch[6].split(" / ").filter((s) => s && s !== "（无）") : [],
        // 近档 / 远档各自的「画出来了」
        terrain: has("mapo-terrain"),
        plate: nodes.find((node) => /^mapo-plate-[45]$/u.test(node.name))?.name ?? null,
        minimap: has("mapo-minimap"),
        selection: has("mapo-selection"),
        selectionAt: at("mapo-selection"),
        worldCenter: at("mapo-world"),
        tile: detailMatch
            ? {
                row: Number(detailMatch[1]), col: Number(detailMatch[2]),
                terrainName: detailMatch[3],
                passable: !detailMatch[4],
                // ⚠ 显示层（BufferAsset）没到位时详情会带「读取中…」——⛔ 不拿退回值冒充真相
                detailed: !detailMatch[5],
                text: detail,
            }
            : null,
        nearLoaded: !!titleMatch && has("mapo-terrain"),
        farLoaded: !!titleMatch && nodes.some((node) => /^mapo-plate-[45]$/u.test(node.name)),
    };
}

/** 地图可点区域（页眉页脚之间）。★ 全程走**页面坐标**，⛔ 不碰 center.width/height（那是设计单位）。 */
export function mapOriginalGestureArea(walk) {
    const canvas = walk.canvas;
    const at = (name) => walk.nodes.find((node) => node.name === name && node.center)?.center ?? null;
    const anchor = at("mapo-map-anchor"), header = at("mapo-header"), footer = at("mapo-footer");
    const missing = [["mapo-map-anchor", anchor], ["mapo-header", header], ["mapo-footer", footer]]
        .filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
        throw new Error(`地图页缺少重放契约节点 ${missing.join(" / ")}（页内共 ${walk.nodes.length} 个节点）`
            + "：若源码里有而这里没有，多半是 Creator 还没重编出新 bundle，等它编完再跑");
    }
    const half = Math.min(anchor.y - header.y, footer.y - anchor.y) * 0.8;
    if (!(half > 0)) throw new Error("地图可点区算成了空：页眉/页脚锚点次序不对");
    return { x: anchor.x, y: anchor.y, width: canvas.width * 0.7, height: half * 2 };
}

/** 选中框必须落在**点击处**——这是「点击→格」坐标换算的直接判据。 */
export function judgeSelectionUnderCursor(evidence, canvas, clickAt, toleranceTiles = 2) {
    const at = evidence?.selectionAt;
    if (!at) return "选中框节点不在渲染树上";
    const inside = at.x >= canvas.x && at.x <= canvas.x + canvas.width
        && at.y >= canvas.y && at.y <= canvas.y + canvas.height;
    if (!inside) {
        return `选中框在画布外：${JSON.stringify(at)}（画布 ${canvas.x},${canvas.y} ${canvas.width}×${canvas.height}）`;
    }
    const tile = canvas.width / 12;
    const distance = Math.hypot(at.x - clickAt.x, at.y - clickAt.y);
    if (distance > tile * toleranceTiles) {
        return `选中框离点击处 ${Math.round(distance)}px（> ${Math.round(tile * toleranceTiles)}px）`;
    }
    return null;
}

/** 连发滚轮把镜头拉远/推近。⚠ Cocos 的滚轮缩放一次一档，要多发几次才跨得过 LOD 带。 */
export async function mapOriginalWheel(runner, at, deltaY, times) {
    for (let i = 0; i < times; i += 1) {
        await runner.client.send("Input.dispatchMouseEvent", {
            type: "mouseWheel", x: at.x, y: at.y, deltaX: 0, deltaY,
        });
        await sleep(60);
    }
    await sleep(300);
}

export async function replayMapOriginalWorld(runner) {
    await runner.step("点设置中的「原版大地图」卡片（mapOriginal 的 route 入口，entryId=originalWorld）",
        async () => runner.tapSettingsEntry("originalWorld"));

    const opened = await runner.step("近档：标题与地表就位", async () => {
        const evidence = await runner.waitFor("地图标题 + mapo-terrain 在渲染树上", (walk) => {
            const value = readMapOriginalEvidence(walk);
            return value?.nearLoaded ? value : null;
        }, 60_000);
        return { ...evidence, shot: await runner.shot("maporiginal-opened") };
    });

    const selected = await runner.step("点选一格（普通鼠标点击，⛔ 不调 Logic）", async () => {
        const area = mapOriginalGestureArea(await runner.walk());
        const at = { x: area.x, y: area.y };
        await runner.client.click(at.x, at.y);
        const value = await runner.waitFor("选中格详情", (walk) => {
            const got = readMapOriginalEvidence(walk);
            return got?.tile ? got : null;
        });
        // ★ 先判「选中框是否落在点击处」——坐标换算错的话这里立刻红，
        //   ⛔ 不要等到别的步骤才发现「选了但看不见」
        const misplaced = judgeSelectionUnderCursor(value, (await runner.walk()).canvas, at);
        if (misplaced) throw new Error(`点击→格 坐标换算不对：${misplaced}`);
        return {
            at: [Math.round(at.x), Math.round(at.y)], tile: value.tile,
            // ⚠ 显示层是 2.25 MB 的 BufferAsset：没到位时详情会带「读取中…」，如实记
            displayTerrainLoaded: value.tile.detailed,
            shot: await runner.shot("maporiginal-selected"),
        };
    });

    const colorMode = await runner.step("画面设置：色彩模式切「鲜艳」并确认真的生效", async () => {
        const before = readMapOriginalEvidence(await runner.walk())?.graphics ?? null;
        await runner.tapText("鲜艳", { pathIncludes: VIEW });
        const after = await runner.waitFor("状态行里的色彩模式变成鲜艳", (walk) => {
            const value = readMapOriginalEvidence(walk);
            return value?.graphics?.colorMode === "鲜艳" ? value : null;
        });
        return { before, after: after.graphics, shot: await runner.shot("maporiginal-color-vivid") };
    });

    const sandbox3d = await runner.step("画面设置：3D 沙盘按原作行为置灰 —— 点它 ⛔ 不该生效", async () => {
        await runner.tapText("3D 沙盘", { pathIncludes: VIEW });
        await sleep(600);
        const value = readMapOriginalEvidence(await runner.walk());
        if (!value?.graphics) throw new Error("读不到状态行");
        // ★ 这一条是**否定判据**：点了必须还是 2D。能切过去反而是缺陷
        //   （框架 Stage3D 零实施，⛔ 不许 kit 内自建 3D 相机）
        if (value.graphics.sandbox !== "2D 沙盘") {
            throw new Error(`3D 沙盘不该能切：现在是 ${value.graphics.sandbox}`);
        }
        return { sandbox: value.graphics.sandbox, outcome: "按预期置灰",
                 shot: await runner.shot("maporiginal-3d-disabled") };
    });

    const far = await runner.step("拉远：换成远档底图（mapo-plate-4/5）", async () => {
        const area = mapOriginalGestureArea(await runner.walk());
        await mapOriginalWheel(runner, { x: area.x, y: area.y }, 240, 14);
        const value = await runner.waitFor("远档底图就位且 LOD ≥ 3", (walk) => {
            const got = readMapOriginalEvidence(walk);
            return got?.farLoaded && got.lod >= 3 ? got : null;
        }, 30_000);
        return { lod: value.lod, plate: value.plate, band: value.band, layers: value.layers,
                 shot: await runner.shot("maporiginal-far") };
    });

    const jumped = await runner.step("缩略图跳转：点一下缩略图，镜头真的挪了", async () => {
        const walk = await runner.walk();
        const mini = walk.nodes.find((node) => node.name === "mapo-minimap" && node.center)?.center ?? null;
        if (!mini) return { skipped: "缩略图不在渲染树上（贴图没加载出来时只留可点底板）" };
        const before = readMapOriginalEvidence(walk)?.worldCenter ?? null;
        await runner.client.click(mini.x - 30, mini.y + 20);
        const value = await runner.waitFor("世界节点位移", (w) => {
            const got = readMapOriginalEvidence(w);
            if (!got?.worldCenter || !before) return null;
            const moved = Math.hypot(got.worldCenter.x - before.x, got.worldCenter.y - before.y);
            return moved > 1 ? { ...got, moved: Math.round(moved) } : null;
        }, 20_000);
        return { moved: value.moved, shot: await runner.shot("maporiginal-minimap-jump") };
    });

    const back = await runner.step("推回近档：地表重新铺出来", async () => {
        const area = mapOriginalGestureArea(await runner.walk());
        await mapOriginalWheel(runner, { x: area.x, y: area.y }, -240, 16);
        const value = await runner.waitFor("回到近档且地表在", (walk) => {
            const got = readMapOriginalEvidence(walk);
            return got?.nearLoaded && got.lod <= 2 ? got : null;
        }, 30_000);
        return { lod: value.lod, band: value.band, shot: await runner.shot("maporiginal-back") };
    });

    return { opened, selected, colorMode, sandbox3d, far, jumped, back };
}
