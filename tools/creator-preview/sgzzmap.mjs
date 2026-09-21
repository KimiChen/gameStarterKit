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
        nearLoaded: !!titleMatch && has("sgzz-terrain"),
        farLoaded: !!titleMatch && (!!plate || has("sgzz-birdview")),
    };
}

/** 地图可点区域（页眉页脚之间），用于挑一个不会点到按钮的位置。 */
export function sgzzmapGestureArea(walk) {
    const canvas = walk.canvas;
    // 页眉 14% / 页脚 26%（与 SgzzmapWorldView.onOpen 的比例一致），再各缩 6% 留安全边
    const top = canvas.y + canvas.height * 0.20;
    const bottom = canvas.y + canvas.height * 0.68;
    return {
        x: canvas.x + canvas.width / 2,
        y: (top + bottom) / 2,
        width: canvas.width * 0.7,
        height: bottom - top,
    };
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

    const opened = await runner.step("近档：地表网格与标题就位（地形随代码走，⛔ 不等资源加载）", async () => {
        const evidence = await runner.waitFor("地图标题 + sgzz-terrain 网格", (walk) => {
            const value = readSgzzmapEvidence(walk);
            return value?.nearLoaded ? value : null;
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
            if (value.tile.mine && value.territory && value.border) return { ...value, outcome: "occupied" };
            if (value.notice && REFUSAL_RE.test(value.notice)) return { ...value, outcome: "refused" };
            return null;
        });
        return {
            plan: selected.plan, before: selected.tile.text,
            ...evidence, shot: await runner.shot(`sgzzmap-${evidence.outcome}`),
        };
    });

    const far = await runner.step("拉远到远档：底图 + 鸟瞰色块顶替逐格网格", async () => {
        const area = sgzzmapGestureArea(await runner.walk());
        await sgzzmapWheel(runner, area, 240, 14);
        const evidence = await runner.waitFor("LOD ≥ 3 且底图/色块在、地表网格已撤", (walk) => {
            const value = readSgzzmapEvidence(walk);
            return value && value.lod !== null && value.lod >= 3 && value.farLoaded && !value.terrain ? value : null;
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
        const evidence = await runner.waitFor("LOD ≤ 2 且地表网格回来", (walk) => {
            const value = readSgzzmapEvidence(walk);
            return value && value.lod !== null && value.lod <= 2 && value.terrain && !value.plate ? value : null;
        }, 45_000);
        return { farLod: far.lod, ...evidence, shot: await runner.shot("sgzzmap-back-near") };
    });

    return { ...opened, homeLabel: home.label, occupyOutcome: occupied.outcome };
}
