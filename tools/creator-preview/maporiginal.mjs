/**
 * mapOriginal 原版大地图 route 的真引擎重放。
 * 证据只来自**渲染出来的节点与文本** + 普通 CDP 输入，⛔ 不调 Logic、⛔ 不直接发 RPC。
 *
 * 覆盖 v1 的五件事：近档地表就位 → 点选（含坐标换算判据）→ 画面设置生效与置灰 →
 * 四档往返与全图缩放 → 缓存 GPU 邻块一致性/预算 → 缩略图跳转 → 推回近档。
 *
 * ⚠ 本 kit **无服务端**：地形随代码（shared 通行层）与资源（BufferAsset 显示层）走，
 *   所以 ⛔ 没有「占领 / 行军」这类写操作可重放。
 */
import { sleep } from "./lib.mjs";

const VIEW = "MapOriginalWorldView";
const inView = (node) => node.path.includes(`${VIEW}/`);

/** 标题形如「原版大地图 · LOD 2/3 · 0.1600×」。 */
const TITLE_RE = /^原版大地图 · LOD ([0-3])\/3(?: · ([0-9.]+)×)?$/u;
/**
 * 状态形如「s1 · 近档 · 画面：普通 · 层：… · 地表 12+3 · 道路 5 · 摆件 137/312 · 山林 48
 *   · 水面 5 · 点缀 2 · 城 8」（段序固定 = 视图里的拼接序；除「层」外各段都只在 >0 时出现，
 *   「地表 / 摆件」仅近档有）。
 * ⚠ 每段都是活体证据：掉到 0 的那一段说明对应的 bin / 图集没到位（城 ⇒ cities.bin / city-atlas）。
 * ⚠ **画面只剩一段（画质）**：沙盘模式 / 镜头视角 / 鸟瞰 / **色彩模式** 四项都是 3D 侧，
 *   已随 3D 迁出本 kit（2026-09-22）。⛔ 改这条正则必须同步改下面按组号取值的地方 ——
 *   组号前移过两次，都踩过。
 */
const STATUS_RE =
    /^s1 · (近档|远档) · 画面：([^/·]+?) · 层：(.*?)( · 地表 (\d+)(?:\+(\d+))?)?( · 道路 (\d+))?( · 摆件 (\d+)\/(\d+))?( · 山林 (\d+))?( · 水面 (\d+))?( · 点缀 (\d+))?( · 城 (\d+))?(?: · 缓存 (?<cacheReady>\d+)\/(?<cacheTotal>\d+))?$/u;
/**
 * 详情形如「(750, 751) 木·1级 · 原版值 2」，不可通行多一段，显示层没到位再多「· 读取中…」。
 * ⚠ 地形名里**自带 `·`**（原版调色板就是「类型·等级」），所以这里 ⛔ 不能用 `[^\s·]+` 去截。
 */
const DETAIL_RE = /^\((\d+), (\d+)\) (\S+) · 原版值 (\d+)( · 不可通行)?( · 读取中…)?$/u;

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
        scale: titleMatch?.[2] ? Number(titleMatch[2]) : null,
        cacheReady: Number(statusMatch?.groups?.cacheReady ?? 0),
        cacheTotal: Number(statusMatch?.groups?.cacheTotal ?? 0),
        cacheQuads: nodes.filter((n) => /^mapo-cache-[12]\//u.test(n.name)).length,
        markers: has("mapo-city-markers"),
        band: statusMatch ? statusMatch[1] : null,
        graphics: statusMatch ? { quality: statusMatch[2] } : null,
        layers: statusMatch ? statusMatch[3].split(" / ").filter((s) => s && s !== "（无）") : [],
        // ★ 摆件：建出来的件数 / 可视格数。原版每个资源格都有 res_field ⇒ 近档这个比例应在四成上下
        decorPlaced: statusMatch?.[10] !== undefined ? Number(statusMatch[10]) : null,
        visibleCells: statusMatch?.[11] !== undefined ? Number(statusMatch[11]) : null,
        // ★ 区域件：res 原始锚点 + mountain_patch 补件。
        regionPieces: statusMatch?.[13] !== undefined ? Number(statusMatch[13]) : null,
        // ★ 其余各段的活体计数（掉到 0 = 对应 bin / 图集没到位；地表 / 摆件仅近档有）
        groundCount: statusMatch?.[5] !== undefined ? Number(statusMatch[5]) : null,
        blockCount: statusMatch?.[6] !== undefined ? Number(statusMatch[6]) : null,
        roadPieces: statusMatch?.[8] !== undefined ? Number(statusMatch[8]) : null,
        riverPieces: statusMatch?.[15] !== undefined ? Number(statusMatch[15]) : null,
        topPieces: statusMatch?.[17] !== undefined ? Number(statusMatch[17]) : null,
        // ★ 城址件：15 个原版件 / 249 座，⛔ 掉到 0 说明 cities.bin / city-atlas 没到位
        cityPieces: statusMatch?.[19] !== undefined ? Number(statusMatch[19]) : null,
        // 近档 / 远档各自的「画出来了」
        // ⚠ 近档地表底的节点叫 mapo-ground（M2-B1 起：一块 10×10 格 + GL_REPEAT 底纹，
        //   旧的逐格 mapo-terrain 已随那次改造删掉），⛔ 别再等一个不存在的老名字
        terrain: has("mapo-ground"),
        // ★ 摆件层：原版切片立在格上（去「铺地砖」的主力）
        decor: has("mapo-decor"),
        // ★ 城址件层：一个批、一张城址图集（zorder 3900 = 原版 BUILD_TOP）
        city: has("mapo-city"),
        // ★ 地名层：远档大区名、近档郡名。取的是**渲染出来的文本**，⛔ 不读内部状态
        labels: nodes.filter((node) => node.path.includes("/mapo-label-")
            && typeof node.text === "string" && node.text.trim().length > 0)
            .map((node) => node.text.trim()),
        plate: nodes.find((node) => /^mapo-overview$/u.test(node.name))?.name ?? null,
        minimap: has("mapo-minimap"),
        selection: has("mapo-selection"),
        selectionAt: at("mapo-selection"),
        worldCenter: at("mapo-world"),
        tile: detailMatch
            ? {
                row: Number(detailMatch[1]), col: Number(detailMatch[2]),
                terrainName: detailMatch[3],
                // ★ 原版 res 值（1 平地 / 2..46 资源与金矿 / 47 河流 / 48..61 多格地形）
                value: Number(detailMatch[4]),
                passable: !detailMatch[5],
                // ⚠ 显示层（BufferAsset）没到位时详情会带「读取中…」——⛔ 不拿退回值冒充真相
                detailed: !detailMatch[6],
                text: detail,
            }
            : null,
        nearLoaded: !!titleMatch && (has("mapo-ground") || (Number(titleMatch[1]) === 1
            && Number(statusMatch?.groups?.cacheTotal) > 0 && statusMatch?.groups?.cacheReady === statusMatch?.groups?.cacheTotal)),
        farLoaded: !!titleMatch && Number(titleMatch[1]) >= 2 && nodes.some((node) => /^mapo-overview$/u.test(node.name)),
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

/** 读真实 RenderTexture：邻块的 4 texel 重叠带必须来自同一世界区域，能抓出投影/裁剪错位。 */
export async function readMapOriginalCacheGpuEvidence(client) {
    return client.evaluate(`(${(() => {
        const nodes = [];
        const walk = (n) => { nodes.push(n); n.children.forEach(walk); };
        walk(cc.director.getScene());
        const tiles = new Map(), textures = new Set();
        let bytes = 0;
        for (const n of nodes) {
            const match = n.name.match(/^mapo-cache-([12])\/(\d+)\/([01])\/(-?\d+)\/(-?\d+)$/);
            if (!match) continue;
            const m = n.getComponent("cc.MeshRenderer"), t = m?.sharedMaterials[0]?.getProperty("mainTexture");
            if (!t?.readPixels) continue;
            if (!textures.has(t)) { textures.add(t); bytes += t.width * t.height * 8; }
            if (!n.activeInHierarchy) continue;
            tiles.set(match.slice(1).join("/"), { lod: match[1], size: Number(match[2]), detail: match[3],
                x: Number(match[4]), y: Number(match[5]), pixels: t.readPixels() });
        }
        const pending = nodes.find(n => n.name === "mapo-cache-camera")?.getComponent("cc.Camera")?.targetTexture;
        if (pending && !textures.has(pending)) bytes += pending.width * pending.height * 8;
        let pairs = 0, total = 0, samples = 0, worstPairMean = 0;
        for (const t of tiles.values()) for (const axis of [0, 1]) {
            const peer = tiles.get([t.lod,t.size,t.detail,t.x+(axis===0?1:0),t.y+(axis===1?1:0)].join("/"));
            if (!peer) continue;
            let sum = 0;
            for (let u = 0; u < t.size; u++) for (let v = 0; v < 4; v++) {
                const a = (axis===0 ? u*t.size+t.size-4+v : (t.size-4+v)*t.size+u)*4;
                const b = (axis===0 ? u*t.size+v : v*t.size+u)*4;
                for (let k = 0; k < 4; k++) sum += Math.abs(t.pixels[a+k] - peer.pixels[b+k]);
            }
            const count = t.size * 16;
            pairs++; total += sum; samples += count; worstPairMean = Math.max(worstPairMean, sum/count);
        }
        return { tiles: tiles.size, bytes, pairs, mean: samples ? total/samples : null, worstPairMean };
    }).toString()})()`);
}

async function zoomToLod(runner, lod, deltaY) {
    for (let i = 0; i < 60; i++) {
        const walk = await runner.walk(), got = readMapOriginalEvidence(walk);
        if (got?.lod === lod) return got;
        const area = mapOriginalGestureArea(walk);
        await mapOriginalWheel(runner, area, deltaY, 1);
    }
    throw new Error(`滚轮未到 LOD ${lod}`);
}

async function checkCache(runner, lod) {
    const value = await runner.waitFor(`L${lod} 缓存全部就位`, (walk) => {
        const got = readMapOriginalEvidence(walk);
        return got?.lod === lod && got.cacheTotal > 0 && got.cacheReady === got.cacheTotal ? got : null;
    }, 30_000);
    const gpu = await readMapOriginalCacheGpuEvidence(runner.client);
    if (!gpu.pairs || gpu.bytes > 48*1024*1024 || gpu.worstPairMean > 3) {
        throw new Error(`缓存邻块或预算不合格：${JSON.stringify(gpu)}`);
    }
    return { ...value, gpu };
}

export async function replayMapOriginalWorld(runner) {
    await runner.step("点设置中的「原版大地图」卡片（mapOriginal 的 route 入口，entryId=originalWorld）",
        async () => runner.tapSettingsEntry("originalWorld"));

    const opened = await runner.step("近档：标题与地表就位", async () => {
        const evidence = await runner.waitFor("地图标题 + mapo-ground 在渲染树上", (walk) => {
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

    const decorAndLabels = await runner.step(
        "近档：逐格摆件 + 多格地形区域件都就位", async () => {
        const evidence = await runner.waitFor("mapo-decor 在树上且件数够", (walk) => {
            const value = readMapOriginalEvidence(walk);
            if (!value?.nearLoaded || !value.decor) return null;
            // ★ 原版每个资源/金矿格都有自己的 res_field（全图占 43.2%）⇒ 近档这个比例应在四成上下。
            //   ⛔ 只判「mapo-decor 节点在不在」是不够的：早先按哈希概率撒件时节点也在，
            //   但一屏只有几十件、同级资源有的有有的没有 —— 那正是要根除的穿帮。
            const placed = value.decorPlaced ?? 0, cells = value.visibleCells ?? 0;
            if (cells <= 0 || placed / cells < 0.25) return null;
            // ★ 多格地形（山脉/林丛/散落）必须也摆出来了 —— 它们占全图 8.8%，
            //   近档一屏总会框进几个区；⛔ 0 就说明 regions.bin 这条链断了
            if (!(value.regionPieces > 0)) return null;
            // ⚠ 近档（LOD 0–1）的地名是**城名**（N2 起三档分带：城/郡/大区），图心没有城 ⇒
            //   这里地名可以是空，⛔ 别再等郡名（郡名在 LOD 2，由单测钉住；城名在洛阳步核）。
            return value;
        }, 30_000);
        return { decor: evidence.decor, decorPlaced: evidence.decorPlaced,
                 visibleCells: evidence.visibleCells, regionPieces: evidence.regionPieces,
                 groundCount: evidence.groundCount, roadPieces: evidence.roadPieces,
                 riverPieces: evidence.riverPieces, topPieces: evidence.topPieces,
                 decorRatio: Number((evidence.decorPlaced / evidence.visibleCells).toFixed(3)),
                 labelCount: new Set(evidence.labels).size,
                 shot: await runner.shot("maporiginal-decor-labels") };
    });

    const noSandboxRow = await runner.step(
        "画面设置：只剩画质一行 —— ⛔ 沙盘模式 / 镜头视角 / 鸟瞰 / 色彩模式 都不该在", async () => {
        // ★ **否定判据**：本 kit 只承载原版 2D 沙盘，3D 另开 kit `mapOriginal3d`（2026-09-22 拍板）。
        //   四项都是 3D 侧 —— 色彩模式（LUT）也是：`dimension_mgr:set_lut_type` 有
        //   `if not self:is_3d() then return end`，2D 下改它不派发任何渲染事件。
        //   ⛔ 不许再留一个永远选不动的 3D 档位当「契约占位」—— 早先那版就是这么写的。
        const walk = await runner.walk();
        const texts = walk.nodes.filter(inView)
            .map((n) => (typeof n.text === "string" ? n.text.trim() : "")).filter(Boolean);
        const banned = ["沙盘模式", "2D 沙盘", "3D 沙盘", "镜头视角", "鸟瞰",
                        "色彩模式", "标准", "鲜艳", "低饱和"];
        const found = banned.filter((b) => texts.includes(b));
        if (found.length > 0) throw new Error(`面板里还留着 3D 的东西：${found.join("、")}`);
        // 该有的那一行必须在，⛔ 不能把整块面板删没了还算过
        if (!texts.includes("画质")) throw new Error("画面设置缺「画质」行");
        return { banned: found, kept: ["画质"],
                 shot: await runner.shot("maporiginal-no-3d-rows") };
    });

    const medium = await runner.step("L1：原件静态缓存就位，GPU 邻块一致且不超 48 MiB", async () => {
        await zoomToLod(runner, 1, 240);
        const value = await checkCache(runner, 1);
        if (value.terrain || value.decor) throw new Error("L1 仍在绘制实时地表/资源件");
        return { ...value, shot: await runner.shot("maporiginal-medium") };
    });

    const far = await runner.step("L2：区域地貌缓存、郡名与城市标记", async () => {
        await zoomToLod(runner, 2, 240);
        const value = await checkCache(runner, 2);
        if (!value.markers || value.city) throw new Error("L2 城市应切到固定屏幕标记");
        return { ...value, names: [...new Set(value.labels)],
                 shot: await runner.shot("maporiginal-far") };
    });

    const global = await runner.step("L3：全图适配最小缩放、大区名，释放分块缓存", async () => {
        await zoomToLod(runner, 3, 240);
        let value = readMapOriginalEvidence(await runner.walk()), stable = 0;
        for (let i = 0; i < 40 && stable < 2; i++) {
            await mapOriginalWheel(runner, mapOriginalGestureArea(await runner.walk()), 240, 1);
            const next = readMapOriginalEvidence(await runner.walk());
            stable = next.scale === value.scale ? stable + 1 : 0; value = next;
        }
        const fit = await runner.client.evaluate(`(async () => {
            const e=await System.import('cc'), nodes=[];
            const visit=n=>{nodes.push(n);n.children.forEach(visit)};visit(cc.director.getScene());
            const plate=nodes.find(n=>n.name==='mapo-overview'), anchor=nodes.find(n=>n.name==='mapo-map-anchor');
            const points=plate.getComponent(e.MeshRenderer).mesh.readAttribute(0,'a_position');
            const t=anchor.getComponent(e.UITransform), size=t.contentSize, corners=[];
            for(let i=0;i<points.length;i+=3){const p=e.Vec3.transformMat4(new e.Vec3(),new e.Vec3(points[i],points[i+1],0),plate.worldMatrix);corners.push(t.convertToNodeSpaceAR(p));}
            return {width:size.width,height:size.height,scale:plate.worldScale.x,
                inside:corners.every(p=>Math.abs(p.x)<=size.width/2&&Math.abs(p.y)<=size.height/2)};
        })()`);
        const gpu = await readMapOriginalCacheGpuEvidence(runner.client);
        if (!fit.inside || gpu.bytes !== 0 || !value.markers) throw new Error(`全图适配/释放失败：${JSON.stringify({fit,gpu})}`);
        return { ...value, fit, gpu, shot: await runner.shot("maporiginal-global") };
    });

    await runner.step("从全图回 L2：重建区域缓存", async () => {
        await zoomToLod(runner, 2, -240); return checkCache(runner, 2);
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
        await zoomToLod(runner, 0, -240);
        const value = await runner.waitFor("回到近档且地表在", (walk) => {
            const got = readMapOriginalEvidence(walk);
            return got?.nearLoaded && got.lod === 0 ? got : null;
        }, 30_000);
        return { lod: value.lod, band: value.band, shot: await runner.shot("maporiginal-back") };
    });

    // ★ 城址件的真机验收（M4-B1）：初始视口在图心 (750,750)，附近 60 行内没有城
    //   （最近的是武关 (690,750)）⇒ 图心的「城 0」是**合法的**，不能拿来判链条断没断。
    //   必须真的跳到一座城 —— 洛阳 (661,543)，全图唯一 10 级城、件有 218 个 sprite。
    const city = await runner.step("城址件：缩略图跳洛阳，近档画出城（· 城 N > 0）且城名「洛阳」在屏", async () => {
        const walk = await runner.walk();
        const mini = walk.nodes.find((node) => node.name === "mapo-minimap" && node.center)?.center ?? null;
        if (!mini) return { skipped: "缩略图不在渲染树上（贴图没加载出来时只留可点底板）" };
        // ★ 洛阳在缩略图上的归一化位置：由 shared 的 mapoMinimapMark(661, 543) 算得
        //   （2026-09-23 钉），⛔ 别把 hexmap 公式抄进本工具。锚点居中：local.x=(u−0.5)·size、
        //   local.y=(0.5−v)·size，size=180 设计像素（MapOriginalWorldView 里 new MapoMinimap 的实参）。
        // ⚠ 局部 y 向上、页面 y 向下 ⇒ y 要**减**（写成加会落到 (938,823) 而不是洛阳，踩过）。
        const uv = { u: 0.5392565427571262, v: 0.45088318613564404 };
        const designToPage = walk.canvas.width / walk.visible.width;
        const at = { x: mini.x + (uv.u - 0.5) * 180 * designToPage,
                     y: mini.y - (0.5 - uv.v) * 180 * designToPage };
        await runner.client.click(at.x, at.y);
        // ★ N2：近档地名档 = 城名 ⇒ 跳到洛阳后「洛阳」二字必须在屏（且它是全城最大的那枚）
        const value = await runner.waitFor("跳到洛阳：城址件画出来（· 城 N > 0）且城名「洛阳」在屏", (w) => {
            const got = readMapOriginalEvidence(w);
            if (!got?.nearLoaded || !got.city || !(got.cityPieces > 0)) return null;
            return got.labels.includes("洛阳") ? got : null;
        }, 30_000);
        // ★ 落点核对（公开信号）：点图心选一格，详情必须落在洛阳 (661, 543) 附近 ——
        //   缩略图 UV → 页面前要过一道 y 翻号，错了会跳到几百行外（踩过，见上）。
        //   ⚠ 缩略图导航天生粗（1 CSS px ≈ 9 行），给 ±30 格容差，⛔ 别钉死精确格。
        const area = mapOriginalGestureArea(await runner.walk());
        await runner.client.click(area.x, area.y);
        const landed = await runner.waitFor("图心详情落在洛阳 (661, 543) ±30 格", (w) => {
            const got = readMapOriginalEvidence(w);
            const t = got?.tile;
            return t && Math.abs(t.row - 661) <= 30 && Math.abs(t.col - 543) <= 30 ? got : null;
        }, 10_000);
        return { at: [Math.round(at.x), Math.round(at.y)], lod: value.lod,
                 cityPieces: value.cityPieces, cityLabels: value.labels, landed: landed.tile.text,
                 status: value.status,
                 shot: await runner.shot("maporiginal-city") };
    });

    return { opened, selected, decorAndLabels, noSandboxRow, medium, far, global, jumped, back, city };
}
