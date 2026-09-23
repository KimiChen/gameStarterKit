import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MAPO_CHOOSE_ASSET } from "../src/kits/mapOriginal/logic/mapoFar";
import { buildMapoSpriteMesh } from "../src/kits/mapOriginal/logic/mapoMesh";
import { mapoDecorAt } from "../src/kits/mapOriginal/logic/mapoDecor";
import { MapoCamera } from "../src/kits/mapOriginal/logic/mapoCamera";
import { mapoGrid2Pos } from "../src/shared/kits/mapOriginal/api/hexmap/index";

import { mapoSceneSprites } from "../src/kits/mapOriginal/logic/mapoScene";
import { mapoSelectionSprites } from "../src/kits/mapOriginal/logic/mapoSelection";
import { MAPO_CHOOSE } from "../src/shared/kits/mapOriginal/content/choose.data";
import { MAPO_DECOR_TEXTURES, MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H } from "../src/shared/kits/mapOriginal/content/decor.data";
function pieces(row: number, col: number, value: number) {
    const p = mapoDecorAt(row, col, value, true)!;
    return mapoSceneSprites(p.cell.scene, MAPO_DECOR_TEXTURES,
        [MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H], 0, p);
}

/** 读 PNG 的 IHDR 尺寸（不改码、不解压）。 */
function pngSize(path: string): [number, number] {
    const buf = readFileSync(path);
    assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${path} 不是 PNG`);
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test("mapOriginal 普通点选：2080 的八片 UI 围绕格心，不混入行军选择", () => {
    assert.equal(MAPO_CHOOSE.clientResId, 2080);
    assert.deepEqual(MAPO_CHOOSE.size, [291, 148]);
    const pieces = mapoSelectionSprites(0);
    assert.equal(pieces.length, 8);
    assert.ok(pieces[4].uv[2] < 0 && pieces[7].uv[2] < 0 && pieces[7].uv[3] < 0);
    const mesh = buildMapoSpriteMesh(pieces);
    assert.ok(Math.abs(mesh.minPos[0] + mesh.maxPos[0]) < 1e-5);
    assert.ok(Math.abs(mesh.minPos[1] + mesh.maxPos[1]) < 1e-5);
    assert.ok(Math.abs(mesh.maxPos[0] * 2 - 291 * 32 / 150) < 1e-5);
    assert.equal(MAPO_CHOOSE.frameRate, 24, "原包 UI importer 缺省是 24 帧");
    const peak = buildMapoSpriteMesh(mapoSelectionSprites(15 / 24));
    assert.ok(Math.abs(peak.maxPos[0] / mesh.maxPos[0] - 1.03) < 1e-6);
    assert.ok(Math.abs(peak.colors[2] - 189 / 255) < 1e-6);
    assert.deepEqual(buildMapoSpriteMesh(mapoSelectionSprites(30 / 24)).positions, mesh.positions);
});

test("mapOriginal 选中地块面：原版件已入 kit 且两边镜像齐全", () => {
    assert.equal(MAPO_CHOOSE_ASSET, "kits/mapOriginal/maps/s1/choose");
    const kit = fileURLToPath(new URL("../../kits/mapOriginal/data/maps/s1/choose.png", import.meta.url));
    const coc = fileURLToPath(new URL("../../Cocos/assets/resources/kits/mapOriginal/maps/s1/choose.png", import.meta.url));
    assert.ok(existsSync(kit), `缺 ${kit}（先跑 build_choose.py + install_to_kit.py）`);
    assert.ok(existsSync(coc), `缺 ${coc}（install_to_kit.py 的镜像没到）`);
    assert.deepEqual([...pngSize(kit)], [512, 64], "choose.png 必须包含普通点选的三种原始切片");
    assert.deepEqual(
        [...readFileSync(kit)], [...readFileSync(coc)], "kit 与 Cocos 镜像必须逐字节一致");
});

test("mapOriginal 选中对齐：截图中的 (750,749) 5级粮田保留原版中心偏移", () => {
    // 独立取自 Food_05_group.prefab.bin：size=196×128、scale=1、pivot=(0.5,0.5)、
    // position=(-8.054690,-3.634770)。旧版图片底边放在格心-8，使中心向上错约 30 原版 px。
    const row = 750, col = 749;
    const place = mapoDecorAt(row, col, 26, true);
    assert.ok(place);
    const grid = mapoGrid2Pos(row, col);
    const px = 32 / 150;
    const sprite = pieces(row, col, 26).find((s) => s.w === 196 && s.h === 128)!;
    assert.ok(sprite, "粮田主体必须存在于完整节点图中");
    const mesh = buildMapoSpriteMesh([sprite]);
    const center = {
        x: (mesh.positions[0] + mesh.positions[6]) / 2,
        y: (mesh.positions[1] + mesh.positions[7]) / 2,
    };
    assert.ok(Math.abs(center.x - grid.x - (-8.054690 * px)) < 0.002, "粮田横向偏移丢失");
    assert.ok(Math.abs(center.y - grid.y - (-3.634770 * px)) < 0.002, "粮田仍被按底边抬高");

    // 选框继续以逻辑格心定位；平移、缩放只能同比例改变素材的原始局部偏移。
    const camera = new MapoCamera(750, 1200);
    for (const scale of [0.8, 1.28, 3.2]) {
        camera.scale = scale;
        camera.x = grid.x + 71; camera.y = grid.y - 43;
        const selected = camera.screenAt(grid.x, grid.y);
        const art = camera.screenAt(center.x, center.y);
        assert.ok(Math.abs((art.x - selected.x) / scale - (-8.054690 * px)) < 0.002);
        assert.ok(Math.abs((art.y - selected.y) / scale - (3.634770 * px)) < 0.002);
        assert.deepEqual(camera.cellAt(selected.x, selected.y), { row, col });
    }
});

test("mapOriginal 资源尺寸与数量：保留完整树丛和不等于贴图的显示尺寸", () => {
    assert.equal(pieces(750, 749, 2).length, 8, "Wood_01 必须保留 8 棵树");
    const tree = pieces(750, 749, 4).find((s) => s.w === 232 && s.h === 119)!;
    const mesh = buildMapoSpriteMesh([tree]);
    assert.ok(Math.abs(mesh.maxPos[0] - mesh.minPos[0] - 232 * 0.922414 * 32 / 150) < 0.001);
    const desert = pieces(100, 749, 2).find((s) => s.w === 50 && s.h === 58)!;
    assert.ok(desert, "沙地树的显示矩形 50×58 不能替换为贴图 49×49");
    const dm = buildMapoSpriteMesh([desert]);
    assert.ok(Math.abs(dm.maxPos[1] - dm.minPos[1] - 58 * 32 / 150) < 0.001);
});

test("mapOriginal 精灵锚点：非中心 pivot 也按原位置展开、绕锚点旋转", () => {
    // 左下角固定在 (10,20)，100×200 图片逆时针转 90° 后应位于其左上方。
    // 这能抓住「记录了 pivot，渲染仍固定按底边/中心」或绕错旋转中心的回归。
    const mesh = buildMapoSpriteMesh([{
        row: 0, col: 0, x: 10, y: 20, w: 100, h: 200,
        pivot: [0, 0], angleDeg: 90, uv: [0, 0, 1, 1],
    }]);
    assert.deepEqual(Array.from(mesh.positions),
        [-190, 20, 0, -190, 120, 0, 10, 120, 0, 10, 20, 0]);
    assert.deepEqual(mesh.minPos, [-190, 20, 0]);
    assert.deepEqual(mesh.maxPos, [10, 120, 0]);
});
