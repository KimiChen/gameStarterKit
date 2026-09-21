import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SgzzCamera, SGZZ_TAP_SLOP, sgzzCameraToRootLocal, sgzzRootLocalToCamera,
} from "../src/kits/sgzzmap/logic/sgzzCamera";
import { SgzzViewportStencil, sgzzPackOffset, sgzzUnpackOffset } from "../src/kits/sgzzmap/logic/sgzzViewport";
import {
    sgzzAoiMode, sgzzIsNearField, sgzzLayerVisible, sgzzVisibleLayers,
} from "../src/kits/sgzzmap/logic/sgzzLayers";
import {
    SGZZ_BIRDVIEW_LOD, SGZZ_LOD_MAX, SGZZ_MAP_COLS, SGZZ_MAP_ROWS,
    SGZZ_SCALE_INITIAL, SGZZ_SCALE_MAX, SGZZ_SCALE_MIN,
    sgzzGrid2Pos, sgzzInBounds,
} from "../src/shared/kits/sgzzmap/api/hexmap/index";

const W = 750, H = 1204;   // 设计分辨率 750×1624 竖屏，扣掉页眉页脚

test("sgzzmap camera: 初始居中、缩放钳位、版本只在真动时自增", () => {
    const cam = new SgzzCamera(W, H);
    const centre = cam.centreCell();
    assert.ok(Math.abs(centre.row - SGZZ_MAP_ROWS / 2) <= 1);
    assert.ok(Math.abs(centre.col - SGZZ_MAP_COLS / 2) <= 1);
    assert.equal(cam.scale, SGZZ_SCALE_INITIAL);

    const v0 = cam.version;
    cam.pan(0, 0);
    assert.equal(cam.version, v0, "没动就⛔不该自增版本");
    cam.pan(30, 30);
    assert.ok(cam.version > v0, "真动了要自增");

    for (let i = 0; i < 40; i += 1) cam.zoom(0.5);
    assert.equal(cam.scale, SGZZ_SCALE_MIN, "缩到底钳在下界");
    for (let i = 0; i < 40; i += 1) cam.zoom(2);
    assert.equal(cam.scale, SGZZ_SCALE_MAX, "放到顶钳在上界");
    cam.zoom(0);
    cam.zoom(Number.NaN);
    assert.equal(cam.scale, SGZZ_SCALE_MAX, "非法 factor 一律忽略");
});

test("sgzzmap camera: 屏幕↔世界↔格 往返自洽，且中心永远在图内", () => {
    const cam = new SgzzCamera(W, H);
    // 屏幕中心必然落在中心格
    const mid = cam.cellAt(W / 2, H / 2);
    assert.deepEqual(mid, cam.centreCell());
    // worldAt / screenAt 互逆
    for (const [sx, sy] of [[0, 0], [W, H], [123, 456], [W / 2, H / 2]]) {
        const w = cam.worldAt(sx, sy);
        const s = cam.screenAt(w.x, w.y);
        assert.ok(Math.abs(s.x - sx) < 1e-6 && Math.abs(s.y - sy) < 1e-6, `(${sx},${sy}) 往返失败`);
    }
    // ★ 拼命往四角推，中心也必须留在可玩菱形内（⛔ 不能飘到包围盒的角上）
    for (let i = 0; i < 400; i += 1) cam.pan(-4000, -4000);
    let c = cam.centreCell();
    assert.ok(sgzzInBounds(c.row, c.col), `推到极限后中心出界：${c.row},${c.col}`);
    for (let i = 0; i < 800; i += 1) cam.pan(4000, 4000);
    c = cam.centreCell();
    assert.ok(sgzzInBounds(c.row, c.col), `反向推到极限后中心出界：${c.row},${c.col}`);
});

test("sgzzmap camera: 捏合保持锚点、locate 不改缩放也不留惯性", () => {
    const cam = new SgzzCamera(W, H);
    const anchorX = 200, anchorY = 300;
    const before = cam.worldAt(anchorX, anchorY);
    cam.zoom(1.7, anchorX, anchorY);
    const after = cam.worldAt(anchorX, anchorY);
    assert.ok(Math.abs(after.x - before.x) < 1e-6 && Math.abs(after.y - before.y) < 1e-6,
        "锚点下的世界位置必须不动");

    cam.start(1, 100, 100, 0);
    cam.move(1, 300, 300, 16);
    const scale = cam.scale;
    cam.locate(400, 400);
    assert.equal(cam.scale, scale, "locate ⛔ 不改缩放");
    assert.equal(cam.pointerCount, 0, "locate 要清掉在按的指针");
    const v = cam.version;
    cam.step(0.016);
    assert.equal(cam.version, v, "locate 之后⛔不得再有惯性");
    const located = cam.centreCell();
    assert.ok(Math.abs(located.row - 400) <= 1 && Math.abs(located.col - 400) <= 1);
});

test("sgzzmap camera: 点击与拖动可分辨，惯性会衰减到停", () => {
    const cam = new SgzzCamera(W, H);
    cam.start(1, 100, 100, 0);
    cam.move(1, 100 + SGZZ_TAP_SLOP - 1, 100, 10);
    const tap = cam.end(1, 20);
    assert.ok(tap !== null, "位移没过阈值 ⇒ 算点击");
    assert.ok(sgzzInBounds(tap!.row, tap!.col));

    cam.start(2, 100, 100, 0);
    cam.move(2, 400, 400, 10);
    assert.equal(cam.end(2, 20), null, "拖过了 ⇒ ⛔ 不算点击");

    // 惯性：甩一下之后会动，几百毫秒内停下来
    cam.start(3, 100, 100, 0);
    cam.move(3, 300, 100, 16);
    cam.end(3, 20);
    let moved = false;
    const v0 = cam.version;
    for (let i = 0; i < 100; i += 1) cam.step(0.016);
    if (cam.version > v0) moved = true;
    assert.ok(moved, "抬指后应有惯性");
    const v1 = cam.version;
    for (let i = 0; i < 200; i += 1) cam.step(0.016);
    assert.equal(cam.version, v1, "惯性必须衰减到完全停住");
    // dt 异常不得让相机乱跑
    const v2 = cam.version;
    cam.step(-1); cam.step(Number.NaN); cam.step(0);
    assert.equal(cam.version, v2);
});

test("sgzzmap viewport: 偏移表按奇偶分开，且只在缩放/尺寸变时重算", () => {
    const stencil = new SgzzViewportStencil();
    stencil.refresh(1, W, H);
    assert.equal(stencil.rebuilds, 1);
    stencil.refresh(1, W, H);
    assert.equal(stencil.rebuilds, 1, "同参数⛔不得重算（平移时每帧都会调）");
    stencil.refresh(0.5, W, H);
    assert.equal(stencil.rebuilds, 2, "缩放变了要重算");
    stencil.refresh(0.5, W, H + 1);
    assert.equal(stencil.rebuilds, 3, "尺寸变了要重算");

    stencil.refresh(1, W, H);
    const even = stencil.offsetsFor(600), odd = stencil.offsetsFor(601);
    assert.ok(even.length > 0 && odd.length > 0);
    // ⚠ 奇偶错半格 ⇒ 两张表不该完全一样
    assert.notDeepEqual([...even], [...odd], "奇偶行必须各有一张表");
    // 打包/解包互逆（含负偏移）。⚠ 早期 bias 取 2^15 会溢出 int32 —— 整片偏移变负数，
    // 表现是「视口角上的格莫名不在可视集合里」。这里逐个断言打包结果仍是正的 int32。
    for (const [dr, dc] of [[0, 0], [-7, 13], [120, -200], [8191, -8191]]) {
        const packed = sgzzPackOffset(dr, dc);
        assert.ok(packed > 0 && packed <= 0x7fffffff, `打包溢出：(${dr},${dc}) → ${packed}`);
        assert.equal(packed | 0, packed, "⛔ 打包结果必须原样放得进 Int32Array");
        assert.deepEqual(sgzzUnpackOffset(packed), { dr, dc });
    }
    assert.throws(() => sgzzPackOffset(8192, 0), "越界必须抛，⛔ 不静默截断");
    assert.throws(() => sgzzPackOffset(0, -8192));
});

test("sgzzmap viewport: 可视集合覆盖视口、按边界裁剪、不越界", () => {
    const cam = new SgzzCamera(W, H);
    const stencil = new SgzzViewportStencil();
    stencil.refresh(cam.scale, W, H);
    const centre = cam.centreCell();

    const seen: { row: number; col: number }[] = [];
    stencil.forEach(centre.row, centre.col, SGZZ_MAP_ROWS, SGZZ_MAP_COLS, (row, col) => {
        seen.push({ row, col });
    });
    assert.ok(seen.length > 0);
    for (const c of seen) assert.ok(sgzzInBounds(c.row, c.col), "⛔ 不得吐出界的格");

    // 视口四角所在的格必须在集合里
    const key = new Set(seen.map((c) => `${c.row},${c.col}`));
    for (const [sx, sy] of [[1, 1], [W - 1, 1], [1, H - 1], [W - 1, H - 1], [W / 2, H / 2]]) {
        const c = cam.cellAt(sx, sy);
        assert.ok(key.has(`${c.row},${c.col}`), `视口角 (${sx},${sy}) 的格 ${c.row},${c.col} 不在可视集合里`);
    }
    // 集合里的格离中心不会太远（覆盖但不过度）
    const world = sgzzGrid2Pos(centre.row, centre.col);
    for (const c of seen) {
        const p = sgzzGrid2Pos(c.row, c.col);
        const halfW = W / cam.scale / 2 + 400, halfH = H / cam.scale / 2 + 400;
        assert.ok(Math.abs(p.x - world.x) <= halfW && Math.abs(p.y - world.y) <= halfH,
            `(${c.row},${c.col}) 离视口太远，模板算多了`);
    }

    // 地图边角：集合会被裁小但不得为空
    const edge: { row: number; col: number }[] = [];
    stencil.forEach(0, 0, SGZZ_MAP_ROWS, SGZZ_MAP_COLS, (row, col) => edge.push({ row, col }));
    assert.ok(edge.length > 0 && edge.length < seen.length + 1, "地图角上应被裁剪");
});

test("sgzzmap layers: 分层门控与远近档、AOI 模式切换", () => {
    assert.ok(sgzzLayerVisible("terrain", 0));
    assert.ok(sgzzLayerVisible("terrain", 2));
    assert.ok(!sgzzLayerVisible("terrain", 3), "LOD3 起改用烘焙底图");
    assert.ok(!sgzzLayerVisible("plate", 2));
    assert.ok(sgzzLayerVisible("plate", 3));
    assert.ok(!sgzzLayerVisible("birdview", SGZZ_BIRDVIEW_LOD - 1));
    assert.ok(sgzzLayerVisible("birdview", SGZZ_BIRDVIEW_LOD));
    assert.ok(!sgzzLayerVisible("marchDetail", 3), "LOD3 关行军细线");
    assert.ok(!sgzzLayerVisible("banner", 2), "LOD2 关目标旗");
    assert.throws(() => sgzzLayerVisible("nope" as never, 0));

    for (let lod = 0; lod <= SGZZ_LOD_MAX; lod += 1) {
        const layers = sgzzVisibleLayers(lod);
        assert.ok(layers.length > 0, `LOD${lod} 不能什么都不画`);
        // 近档必有地表、远档必有底图
        if (lod <= 2) assert.ok(layers.includes("terrain"));
        else assert.ok(layers.includes("plate"));
        assert.equal(sgzzIsNearField(lod), lod <= 2);
        assert.equal(sgzzAoiMode(lod), lod >= SGZZ_BIRDVIEW_LOD ? "summary" : "detail");
    }
});

test("sgzzmap camera: ★ 根局部 ↔ 相机坐标互逆，且地图区中心 = 相机中心", () => {
    // 真机实测的版式：layerWidth 750、layerHeight 1542、页眉 150、页脚 270 ⇒ 地图区高 1122
    const W = 750, H = 1542;
    const mapTop = H / 2 - 150, mapBottom = -H / 2 + 270;
    const mapH = mapTop - mapBottom;
    assert.equal(mapH, 1122, "版式核对：地图区高应为 1122（与真机 report.json 的 world 节点一致）");

    // ⚠ 这条是那个真 bug 的回归：UI 坐标原点在**左下**、x∈[0,W]，
    //   经 convertToNodeSpaceAR 落到根局部后，地图区中心必须换算成相机坐标的正中。
    const centreLocal = { x: 0, y: (mapTop + mapBottom) / 2 };
    const centreCam = sgzzRootLocalToCamera(centreLocal.x, centreLocal.y, W, mapTop, mapBottom);
    assert.deepEqual(centreCam, { x: W / 2, y: mapH / 2 }, "地图区中心必须落在相机坐标的正中");

    // 四角
    const topLeft = sgzzRootLocalToCamera(-W / 2, mapTop, W, mapTop, mapBottom);
    assert.deepEqual(topLeft, { x: 0, y: 0 }, "地图区左上 → 相机 (0,0)");
    const bottomRight = sgzzRootLocalToCamera(W / 2, mapBottom, W, mapTop, mapBottom);
    assert.deepEqual(bottomRight, { x: W, y: mapH }, "地图区右下 → 相机 (W, mapH)");

    // 互逆
    for (const [lx, ly] of [[0, 0], [-W / 2, mapTop], [W / 2, mapBottom], [123, -45], [-300, 500]]) {
        const cam = sgzzRootLocalToCamera(lx, ly, W, mapTop, mapBottom);
        const back = sgzzCameraToRootLocal(cam.x, cam.y, W, mapTop, mapBottom);
        assert.ok(Math.abs(back.x - lx) < 1e-9 && Math.abs(back.y - ly) < 1e-9,
            `(${lx},${ly}) 往返失败：${JSON.stringify(back)}`);
    }

    // ★ 端到端：屏幕正中点一下，必须选到相机中心那一格（⛔ 早先错在这里，真机上点哪都选屏幕外）
    const cam = new SgzzCamera(W, mapH);
    const picked = cam.cellAt(centreCam.x, centreCam.y);
    assert.deepEqual(picked, cam.centreCell(), "屏幕正中 → 中心格");

    // 相机移开以后仍然成立
    cam.locate(400, 900);
    assert.deepEqual(cam.cellAt(centreCam.x, centreCam.y), cam.centreCell());
});
