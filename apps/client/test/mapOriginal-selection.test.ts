import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MAPO_CHOOSE_ASSET } from "../src/kits/mapOriginal/logic/mapoFar";
import { buildMapoSpriteMesh, MAPO_CHOOSE_WORLD } from "../src/kits/mapOriginal/logic/mapoMesh";
import { mapoDecorAt, mapoDecorUv } from "../src/kits/mapOriginal/logic/mapoDecor";
import { MapoCamera } from "../src/kits/mapOriginal/logic/mapoCamera";
import { mapoGrid2Pos } from "../src/shared/kits/mapOriginal/api/hexmap/index";

/** 读 PNG 的 IHDR 尺寸（不改码、不解压）。 */
function pngSize(path: string): [number, number] {
    const buf = readFileSync(path);
    assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${path} 不是 PNG`);
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test("mapOriginal 选中地块面：尺寸 = 原图像素 × 32/150（与全 kit 同一道换算）", () => {
    // ★ 原版 choose2 是 240×112 px、pivot 中心；漏掉 32/150 会把件放成 ~4.7 倍大
    //   （交接坑清单第 9 条：UV/数量/次序的用例全都照过，只有尺寸会静默错）。
    assert.ok(Math.abs(MAPO_CHOOSE_WORLD[0] - 240 * 32 / 150) < 1e-9);
    assert.ok(Math.abs(MAPO_CHOOSE_WORLD[1] - 112 * 32 / 150) < 1e-9);
    // ★ 尺寸纪律：原版就是「罩住整格的 0.8 倍」⇒ 必须落在 (0.7, 0.9) 格内，
    //   出界多半是有人照抄了贴图原尺寸或又乘了一次 scale
    assert.ok(MAPO_CHOOSE_WORLD[0] / 64 > 0.7 && MAPO_CHOOSE_WORLD[0] / 64 < 0.9);
});

test("mapOriginal 选中地块面：原版件已入 kit 且两边镜像齐全", () => {
    assert.equal(MAPO_CHOOSE_ASSET, "kits/mapOriginal/maps/s1/choose");
    const kit = fileURLToPath(new URL("../../kits/mapOriginal/data/maps/s1/choose.png", import.meta.url));
    const coc = fileURLToPath(new URL("../../Cocos/assets/resources/kits/mapOriginal/maps/s1/choose.png", import.meta.url));
    assert.ok(existsSync(kit), `缺 ${kit}（先跑 build_choose.py + install_to_kit.py）`);
    assert.ok(existsSync(coc), `缺 ${coc}（install_to_kit.py 的镜像没到）`);
    assert.deepEqual([...pngSize(kit)], [240, 112], "choose.png 必须是原版 240×112 帧");
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
    assert.ok(Math.abs(place.w - 196 * px) < 1e-6);
    assert.ok(Math.abs(place.h - 128 * px) < 1e-6);
    const mesh = buildMapoSpriteMesh([{ ...place, uv: mapoDecorUv(place.cell) }]);
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

test("mapOriginal 资源尺寸：保留 prefab 的两个轴缩放，不再只照贴图像素", () => {
    // Wood_03_group.prefab 的主片是 232×119，原版显示缩放并非等比。
    const place = mapoDecorAt(750, 749, 4, true);
    assert.ok(place);
    assert.ok(Math.abs(place.w - 232 * 0.922414 * 32 / 150) < 1e-6);
    assert.ok(Math.abs(place.h - 119 * 0.915966 * 32 / 150) < 1e-6);

    // 沙地 Wood_01 主片贴图为 49×49，原版显示矩形却是 50×58。
    const desert = mapoDecorAt(100, 749, 2, true);
    assert.ok(desert);
    assert.equal(desert.cell.variant, "desert");
    assert.deepEqual([...desert.cell.native], [49, 49]);
    assert.ok(Math.abs(desert.w - 50 * 32 / 150) < 1e-6);
    assert.ok(Math.abs(desert.h - 58 * 32 / 150) < 1e-6);
});
