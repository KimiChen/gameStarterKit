/**
 * sgzzmap 大地图 route 的真引擎重放。
 * 证据只来自**渲染出来的节点与文本** + 普通 CDP 输入，⛔ 不调 Logic、⛔ 不直接发 RPC。
 *
 * 覆盖 P6 的四件事：近档地表/领地/描边 → 占领 → 远档底图 + 鸟瞰色块 → 缩略图跳转 → 行军线。
 */
import { selectNodes, sleep } from "./lib.mjs";

const VIEW = "SgzzmapWorldView";
const inView = (node) => node.path.includes(`${VIEW}/`);

/** 标题形如「大地图 · LOD 2/5」。 */
const TITLE_RE = /^大地图 · LOD ([0-5])\/5$/u;
/**
 * 详情形如「(750, 751) 平原 · 无主」或「… · 我方（守军 3）」，不可通行时多一段「· 不可通行」。
 * ⚠ 归属说的是**关系词**（我方/盟主/同盟/友盟/攻占中/敌方），⛔ 不是原始 uid。
 */
const DETAIL_RE = /^\((\d+), (\d+)\) ([^\s·]+)( · 不可通行)? · (无主|我方|盟主|同盟|友盟|攻占中|敌方)(（守军 (\d+)）)?$/u;
/**
 * 连地闸按设计拒绝时的理由。
 * ⚠ 出生豁免只对「一块地都没有」的号生效，账号跑过一轮之后再点空地本来就该被拒 ——
 * 这不是缺陷，所以它和「真占到」一样算通过，但 report 里分得清清楚楚（outcome）。
 */
export const REFUSAL_RE = /^(这一格过不去|必须与自己或同盟的领地相连|已达持地上限|这不是你的领地)/u;

/**
 * 解析地图页的公开 UI。⚠ 刻意拒绝「标题还没出来」「详情不完整」这些中间态——
 * 半加载的画面不该被当成证据。
 */
export function readSgzzmapEvidence(walk) {
    if (!walk?.nodes?.some((node) => node.name === VIEW)) return null;
    const nodes = walk.nodes.filter(inView);
    const title = nodes.find((node) => typeof node.text === "string" && TITLE_RE.test(node.text));
    const titleMatch = title?.text.match(TITLE_RE);
    const detail = nodes.find((node) => typeof node.text === "string" && DETAIL_RE.test(node.text));
    const detailMatch = detail?.text.match(DETAIL_RE);

    const has = (name) => nodes.some((node) => node.name === name);
    const plate = nodes.find((node) => /^sgzz-plate-[45]$/u.test(node.name))?.name ?? null;
    const notice = nodes.find((node) => typeof node.text === "string"
        && /^(已占领|已加固|已削弱守军|已放弃|这一格过不去|必须与自己或同盟的领地相连|已达持地上限|这不是你的领地|正在补算到达事件|操作太快了|操作失败|地图数据读取失败)/u.test(node.text));

    return {
        lod: titleMatch ? Number(titleMatch[1]) : null,
        title: title?.text ?? null,
        // 近档三层
        terrain: has("sgzz-terrain"),
        grid: has("sgzz-grid"),
        blend: has("sgzz-blend"),
        decor: has("sgzz-decor"),
        territory: has("sgzz-territory"),
        border: has("sgzz-border"),
        // 远档两件
        plate,
        birdview: has("sgzz-birdview"),
        // 行军线与缩略图
        march: has("sgzz-march"),
        minimap: nodes.some((node) => node.name === "sgzz-minimap")
            || walk.nodes.some((node) => node.name === "sgzz-minimap"),
        // 诊断用：缩略图浮层与贴图子节点的真实尺寸（⚠ 赋 spriteFrame 会按 TRIMMED 重置成贴图原尺寸）
        minimapSize: nodes.find((node) => node.name === "sgzz-minimap")?.center ?? null,
        minimapImageSize: nodes.find((node) => node.name === "sgzz-minimap-image")?.center ?? null,
        // 页眉那颗按钮：有地时是「回领地」，无地时是「回中」（SgzzmapWorldView.render 按 logic.hasHome 翻）
        homeLabel: nodes.find((node) => node.path.includes("/sgzz-home/")
            && typeof node.text === "string" && /^(回领地|回中)$/u.test(node.text))?.text ?? null,
        selectionAt: nodes.find((node) => node.name === "sgzz-selection")?.center ?? null,
        selection: nodes.some((node) => node.name === "sgzz-selection"),
        tile: detailMatch
            ? {
                row: Number(detailMatch[1]), col: Number(detailMatch[2]),
                terrainName: detailMatch[3],
                passable: !detailMatch[4],
                owner: detailMatch[5],
                mine: detailMatch[5] === "我方",
                guard: detailMatch[7] ? Number(detailMatch[7]) : 0,
                text: detail.text,
            }
            : null,
        notice: notice?.text ?? null,
        worldCenter: nodes.find((node) => node.name === "sgzz-world")?.center ?? null,
        // 近档「画出来了」= 标题在 + 地表网格在；远档 = 标题在 + 底图或色块在
        // 连续覆盖场（v2）接管地表后就没有 sgzz-terrain 了 ⇒ 两种形态都算就位
        field: nodes.some((node) => node.name.startsWith("sgzz-field-")),
        // ⚠ 块数要**稳定**才算铺满：每帧只烘 1 块，填满要十几帧。
        //   只要求「有一个 field 节点」的话会在填充到一半时截图（真机 run 27 就是这么截到半屏黑的）。
        fieldChunks: nodes.filter((node) => node.name.startsWith("sgzz-field-")).length,
        // 块名是 sgzz-field-<档号>_<cx>_<cy> ⇒ 由此看当前用的是哪一档（LOD0/1 用 0、LOD2 用 1）
        fieldTiers: [...new Set(nodes.filter((node) => node.name.startsWith("sgzz-field-"))
            .map((node) => Number(node.name.slice("sgzz-field-".length).split("_")[0]))
            .filter((v) => Number.isInteger(v)))].sort(),
        // ⚠ 常驻网格线已停用（v2 拍板）⇒ ⛔ 不再作为就位条件。
        //   ⚠ 摆件在**陆地**上才有（水里不种树），重放的视野在出生区陆地上，恒有。
        nearLoaded: !!titleMatch && has("sgzz-decor")
            && (has("sgzz-terrain") || nodes.some((node) => node.name.startsWith("sgzz-field-"))),
        farLoaded: !!titleMatch && (!!plate || has("sgzz-birdview")),
    };
}

/** 地图可点区域（页眉页脚之间），用于挑一个不会点到按钮的位置。 */
export function sgzzmapGestureArea(walk) {
    const canvas = walk.canvas;
    // ★ 全程走**页面坐标**（node.center.x/y），⛔ 不碰 center.width/height ——
    //   后者是**设计单位**（UITransform.width/height），两者混用会算出一个差一格的中心：
    //   run 5/6 就是这么把「回领地」之后的中心点选打偏到家旁边那一格的。
    const at = (name) => walk.nodes.find((node) => node.name === name && node.center)?.center ?? null;
    const anchor = at("sgzz-map-anchor"), header = at("sgzz-header"), footer = at("sgzz-footer");
    // ⚠ 要**点名**缺的是哪个：一次把三个名字一起报出来，看不出是漏了节点还是 Creator 没重编。
    const missing = [["sgzz-map-anchor", anchor], ["sgzz-header", header], ["sgzz-footer", footer]]
        .filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
        throw new Error(`地图页缺少重放契约节点 ${missing.join(" / ")}（页内共 ${walk.nodes.length} 个节点）`
            + "：若源码里有而这里没有，多半是 Creator 还没重编出新 bundle，等它编完再跑");
    }
    // 到页眉/页脚中心的距离取小者再留 20% 余量：算出来的半高必落在地图区内，且够不着按钮
    const half = Math.min(anchor.y - header.y, footer.y - anchor.y) * 0.8;
    if (!(half > 0)) throw new Error("地图可点区算成了空：页眉/页脚锚点次序不对");
    return { x: anchor.x, y: anchor.y, width: canvas.width * 0.7, height: half * 2 };
}

/**
 * 选中框必须落在**点击处**——这是「点击→格」坐标换算的直接判据。
 * ⚠ 换算错过一次（UI 坐标原点在左下，被当成居中坐标），症状是选中框跑到画布外，
 * 而「地块详情」照样出得来 ⇒ 光看详情文本是抓不到的。
 */
export function judgeSelectionUnderCursor(evidence, canvas, clickAt, toleranceTiles = 2) {
    const at = evidence?.selectionAt;
    if (!at) return "选中框节点不在渲染树上";
    const inside = at.x >= canvas.x && at.x <= canvas.x + canvas.width
        && at.y >= canvas.y && at.y <= canvas.y + canvas.height;
    if (!inside) {
        return `选中框在画布外：${JSON.stringify(at)}（画布 ${canvas.x},${canvas.y} ${canvas.width}×${canvas.height}）`;
    }
    // 一格在页面上约 canvas.width/12（近档 LOD0 的量级），给 toleranceTiles 格的余量
    const tile = canvas.width / 12;
    const distance = Math.hypot(at.x - clickAt.x, at.y - clickAt.y);
    if (distance > tile * toleranceTiles) {
        return `选中框离点击处 ${Math.round(distance)}px（> ${Math.round(tile * toleranceTiles)}px）：`
            + `点 ${JSON.stringify(clickAt)}，框 ${JSON.stringify({ x: Math.round(at.x), y: Math.round(at.y) })}`;
    }
    return null;
}

/** 缩略图中心（右上角浮层）；点它会跳到对应坐标。 */
export function sgzzmapMinimapCenter(walk) {
    const node = walk?.nodes?.find((entry) => entry.name === "sgzz-minimap");
    return node?.center ? { x: node.center.x, y: node.center.y } : null;
}

/** 连发滚轮把镜头拉远/推近。⚠ Cocos 的滚轮缩放一次一档，要多发几次才跨得过 LOD 带。 */
export async function sgzzmapWheel(runner, at, deltaY, times) {
    for (let i = 0; i < times; i += 1) {
        await runner.client.send("Input.dispatchMouseEvent", {
            type: "mouseWheel", x: at.x, y: at.y, deltaX: 0, deltaY,
        });
        await sleep(60);
    }
    await sleep(300);
}

export async function replaySgzzmapWorld(runner) {
    await runner.step("点设置中的「大地图」卡片（sgzzmap 的 route 入口，entryId=world）", async () => {
        // ⚠ slg 的卡片标签也是「大地图」，所以必须按 entryId 定位，⛔ 不能按文本
        return runner.tapSettingsEntry("world");
    });

    const opened = await runner.step("近档：地表与标题就位（覆盖场要铺满，⛔ 不接受填到一半）", async () => {
        // ⚠ 覆盖场是分帧烘的 ⇒ 要等块数连续两次采样不变才算铺满
        let lastChunks = -1, stable = 0;
        const evidence = await runner.waitFor("地图标题 + 地表就位且覆盖场块数稳定", (walk) => {
            const value = readSgzzmapEvidence(walk);
            if (!value?.nearLoaded) { lastChunks = -1; stable = 0; return null; }
            if (value.fieldChunks === 0) return value;          // 退回逐格地表的形态
            stable = value.fieldChunks === lastChunks ? stable + 1 : 0;
            lastChunks = value.fieldChunks;
            return stable >= 2 && value.fieldChunks >= 4 ? value : null;
        }, 60_000);
        return { ...evidence, shot: await runner.shot("sgzzmap-opened") };
    });

    const home = await runner.step("回领地：页眉按钮把镜头带到自己的地（无地时退回地图中心）", async () => {
        // ⚠ 按钮文案要等第一次 view 回来才定型（hasHome 源自服务端下发的 viewer.home），
        //   ⛔ 不能直接用首屏那一刻的 opened.homeLabel。
        let label = null;
        for (let i = 0; i < 20; i += 1) {
            label = readSgzzmapEvidence(await runner.walk())?.homeLabel ?? null;
            if (label === "回领地") break;
            await sleep(500);
        }
        if (label === null) throw new Error("页眉没有 回中/回领地 按钮");
        const before = readSgzzmapEvidence(await runner.walk())?.worldCenter ?? null;
        if (label === "回中") {
            // 全新账号：一块地都没有，下一步靠出生豁免占第一块
            return { label, moved: 0, skipped: "全新账号（一块地都没有），下一步靠出生豁免占第一块" };
        }
        await runner.tapText("回领地", { pathIncludes: VIEW });
        const evidence = await runner.waitFor("世界节点位移（镜头真的跳到领地了）", (walk) => {
            const value = readSgzzmapEvidence(walk);
            if (!value?.worldCenter || !before) return null;
            const moved = Math.hypot(value.worldCenter.x - before.x, value.worldCenter.y - before.y);
            // ⚠ 跳过去之后领地叠色与描边必须**真的画出来**——这是 territory/border 两层唯一的真机证据
            return moved > 1 && value.territory && value.border ? { ...value, moved: Math.round(moved) } : null;
        });
        return { label, ...evidence, shot: await runner.shot("sgzzmap-home") };
    });

    const selected = await runner.step("点选一格（普通鼠标点击，⛔ 不调 Logic）", async () => {
        const area = sgzzmapGestureArea(await runner.walk());
        const tried = [];
        let fallback = null;
        // ⚠ dev 账号跨轮累积领地：第二轮起「出生豁免」就没了，随便点一格无主的多半不连地。
        //   所以**优先挑已经是我方的格**（占领 = 加固，永远成立）；没有才退回无主格。
        for (const row of [0, -0.25, 0.25]) {
            for (const column of [0, -0.3, 0.3]) {
                const at = { x: area.x + area.width * column, y: area.y + area.height * row };
                await runner.client.click(at.x, at.y);
                const value = await runner.waitFor("选中格详情", (walk) => {
                    const got = readSgzzmapEvidence(walk);
                    return got?.tile ? got : null;
                });
                // ★ 先判「选中框是否落在点击处」——坐标换算错的话这里立刻红，
                //   ⛔ 不要等到占领那步才发现「占了但看不见」
                const misplaced = judgeSelectionUnderCursor(value, (await runner.walk()).canvas, at);
                if (misplaced) throw new Error(`点击→格 坐标换算不对：${misplaced}`);
                tried.push({ at: [Math.round(at.x), Math.round(at.y)], tile: value.tile.text });
                // ★ 刚「回领地」过来，正中那一格**必须**是我方 —— 相机中心就是家那一格。
                //   不是的话说明可点区中心算错了（run 5/6 就差了一格），要红，
                //   ⛔ 不能让它悄悄降级成后面那支「连地闸拒绝」。
                if (home.label === "回领地" && tried.length === 1 && !value.tile.mine) {
                    throw new Error(`回领地后正中不是我方地（${value.tile.text}）：可点区中心算错了`);
                }
                if (value.tile.passable && value.tile.mine) {
                    return { ...value, tried, plan: "加固", shot: await runner.shot("sgzzmap-selected") };
                }
                if (!fallback && value.tile.passable && value.tile.owner === "无主") fallback = { ...value, at };
            }
        }
        if (fallback) {
            // 回到那一格再点一次，让选中态与截图一致
            await runner.client.click(fallback.at.x, fallback.at.y);
            const value = await runner.waitFor("选中格详情", (walk) => readSgzzmapEvidence(walk)?.tile ? readSgzzmapEvidence(walk) : null);
            return { ...value, tried, plan: "占领（需连地或出生豁免）", shot: await runner.shot("sgzzmap-selected") };
        }
        throw new Error(`可见区域里没找到可通行的格：${JSON.stringify(tried)}`);
    });

    const occupied = await runner.step("占领：要么真占到（叠色 + 描边出现），要么连地闸按设计拒绝并说明理由", async () => {
        await runner.tapText("占领 / 加固", { pathIncludes: VIEW });
        const evidence = await runner.waitFor("同一格变我方 + 叠色描边建起来，或给出明确的拒绝理由", (walk) => {
            const value = readSgzzmapEvidence(walk);
            if (!value?.tile) return null;
            // ⚠ 选中格必须还是刚才那一格。早先手势绑在整页 root 上，点「占领」那一下会**顺手换掉选中格**，
            //   于是这里永远等不到；那条 bug 由 sgzzInMapBand 封住了，这里顺带当哨兵。
            if (value.tile.row !== selected.tile.row || value.tile.col !== selected.tile.col) return null;
            if (!value.territory || !value.border) return null;
            // ★ 必须证明这一发 RPC **真的生效了**，⛔ 不能拿「点选时本来就是我方」冒充成功：
            //   run 8 就这么假通过过 —— 守军前后都是 1，而占领其实被连地闸拒了（孤地加固 bug）。
            if (selected.plan === "加固") {
                return value.tile.mine && value.tile.guard > selected.tile.guard
                    ? { ...value, outcome: "occupied" } : null;
            }
            if (value.tile.mine) return { ...value, outcome: "occupied" };
            // 拒绝这一支只留给「全新账号占空地」，⛔ 加固失败不许往这儿兜
            if (value.notice && REFUSAL_RE.test(value.notice)) return { ...value, outcome: "refused" };
            return null;
        });
        return {
            plan: selected.plan, before: selected.tile.text,
            ...evidence, guardBefore: selected.tile.guard, guardAfter: evidence.tile?.guard ?? null,
            shot: await runner.shot(`sgzzmap-${evidence.outcome}`),
        };
    });

    await runner.step("拉到 LOD2：覆盖场切到大块档（tier 1），⛔ 不是继续用小块", async () => {
        // ⚠ 这一档以前从没被真机跑到过（重放是 0 → 4 → 0），分档只有离线验证
        const area = sgzzmapGestureArea(await runner.walk());
        await sgzzmapWheel(runner, area, 240, 6);
        const evidence = await runner.waitFor("LOD 2 且覆盖场用 tier 1 的大块", (walk) => {
            const value = readSgzzmapEvidence(walk);
            if (!value || value.lod !== 2) return null;
            // ⚠ 切档后旧档的块必须停掉：⛔ 还挂着的话是白画（真机 run 32 在 LOD2 挂了 26 块）
            return value.fieldChunks > 0 && value.fieldTiers.length === 1
                && value.fieldTiers[0] === 1 ? value : null;
        }, 45_000);
        return { ...evidence, shot: await runner.shot("sgzzmap-lod2-tier1") };
    });

    const far = await runner.step("拉远到远档：逐格网格撤走，⚠ 覆盖场要一路盖到 LOD5", async () => {
        const area = sgzzmapGestureArea(await runner.walk());
        await sgzzmapWheel(runner, area, 240, 14);
        const evidence = await runner.waitFor("LOD ≥ 3、地表网格已撤、覆盖场仍在", (walk) => {
            const value = readSgzzmapEvidence(walk);
            // ⚠ 逐格地表/摆件/过渡片必须撤干净：压在底图上会把远档糊成一片。
            // ★ 但覆盖场**要留着**：它一直盖到 LOD4 —— ⛔ 撤掉的话切到 LOD3 岸线会跳回底图的旧轮廓。
            if (!value || value.lod === null || value.lod < 3 || !value.farLoaded) return null;
            if (value.terrain || value.decor || value.blend) return null;
            // ★ 覆盖场**全档 0–5** 都要在：⛔ 任何一档交给整幅底图，切档时岸线都会跳回旧轮廓。
            //   （这条判据曾经写「LOD5 必须没有 field」，放开门控时忘了同步 —— 重放正确地拒绝了。）
            return value.fieldChunks > 0 ? value : null;
        }, 45_000);
        return { ...evidence, shot: await runner.shot("sgzzmap-far") };
    });

    await runner.step("缩略图跳转：点右上角浮层，镜头换地方", async () => {
        const walk = await runner.walk();
        const centre = sgzzmapMinimapCenter(walk);
        if (!centre) throw new Error("缩略图节点 sgzz-minimap 不在渲染树上（贴图没加载出来也应有底板）");
        const before = readSgzzmapEvidence(walk)?.worldCenter;
        // 点缩略图左上角一带，跳到图的西北方
        await runner.client.click(centre.x - 24, centre.y - 18);
        const evidence = await runner.waitFor("世界节点位移（镜头真的跳了）", (walk2) => {
            const value = readSgzzmapEvidence(walk2);
            if (!value?.worldCenter || !before) return null;
            const moved = Math.hypot(value.worldCenter.x - before.x, value.worldCenter.y - before.y);
            return moved > 1 ? { ...value, moved: Math.round(moved) } : null;
        });
        return { before, ...evidence, shot: await runner.shot("sgzzmap-minimap-locate") };
    });

    await runner.step("推回近档：逐格网格回来，底图撤走", async () => {
        const area = sgzzmapGestureArea(await runner.walk());
        await sgzzmapWheel(runner, area, -240, 16);
        const evidence = await runner.waitFor("LOD ≤ 2 且地表与网格线都回来", (walk) => {
            const value = readSgzzmapEvidence(walk);
            // ⚠ lod ≤ 1 才有网格线（门控 hideAtLod:1），滚轮多半停在 0
            return value && value.lod !== null && value.lod <= 2 && !value.plate
                && (value.terrain || value.field) ? value : null;
        }, 45_000);
        return { farLod: far.lod, ...evidence, shot: await runner.shot("sgzzmap-back-near") };
    });

    return { ...opened, homeLabel: home.label, occupyOutcome: occupied.outcome };
}
