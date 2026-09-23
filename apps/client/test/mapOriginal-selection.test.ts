import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { MAPO_CHOOSE_ASSET } from "../src/kits/mapOriginal/logic/mapoFar";
import { MAPO_CHOOSE_WORLD } from "../src/kits/mapOriginal/logic/mapoMesh";

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
    const kit = "apps/kits/mapOriginal/data/maps/s1/choose.png";
    const coc = "apps/Cocos/assets/resources/kits/mapOriginal/maps/s1/choose.png";
    assert.ok(existsSync(kit), `缺 ${kit}（先跑 build_choose.py + install_to_kit.py）`);
    assert.ok(existsSync(coc), `缺 ${coc}（install_to_kit.py 的镜像没到）`);
    assert.deepEqual([...pngSize(kit)], [240, 112], "choose.png 必须是原版 240×112 帧");
    assert.deepEqual(
        [...readFileSync(kit)], [...readFileSync(coc)], "kit 与 Cocos 镜像必须逐字节一致");
});
