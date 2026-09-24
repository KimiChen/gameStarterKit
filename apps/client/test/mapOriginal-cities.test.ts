import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
    MAPO_CITY_CELLS, MAPO_CITY_TEXTURES, MAPO_CITY_DOWNSCALE, MAPO_CITY_PIECES, MAPO_CITY_PLACEMENTS,
    MAPO_CITY_PLACEMENT_BYTES, MAPO_CITY_SPRITE_BYTES,
} from "../src/shared/kits/mapOriginal/content/cities.data";
import {
    MAPO_CITY_SITES,
} from "../src/shared/kits/mapOriginal/content/labels.data";
import {
    mapoCitiesIn, mapoCityPlacements, mapoCityUv, mapoHasCities, mapoSetCities,
} from "../src/kits/mapOriginal/logic/mapoCities";
import {
    MAPO_TILE_HALF_W, mapoGrid2Pos,
} from "../src/shared/kits/mapOriginal/api/hexmap/index";

const KIT = new URL("../../kits/mapOriginal/data/maps/s1/", import.meta.url);
const bin = readFileSync(new URL("cities.bin", KIT));
const info = JSON.parse(readFileSync(new URL("cities.info.json", KIT), "utf8")) as {
    pieces: { order: number; resId: number; name: string; source: string; sprites: number }[];
    placements: number; anchorOffsets: number;
    atlas: { size: [number, number]; downscale: number; cells: unknown[] };
};

test("mapOriginal 城址：15 个原版件覆盖全部 249 座（⛔ 不再是启发式挑件）", () => {
    // ★ 件由 base.cw 两级配置定死：city[1].client_res_id → city_res.editor_brush_res_path。
    //   ⛔ 早先摆件层按「面积前 8 大 + 位置散列」挑 —— 那是本仓自创的，已删。
    assert.equal(MAPO_CITY_PIECES.length, 15);
    assert.equal(MAPO_CITY_PLACEMENTS, 249);
    assert.equal(MAPO_CITY_PLACEMENTS, MAPO_CITY_SITES.length, "摆位数 == 城址数");
    assert.equal(info.placements, MAPO_CITY_PLACEMENTS);
    // 件的 resId 互不相同、名字都在（东/南/西/北 × 小城/都城 + 关卡 + 码头 + 洛阳）
    assert.equal(new Set(MAPO_CITY_PIECES.map((p) => p.resId)).size, 15);
    for (const p of MAPO_CITY_PIECES) assert.ok(p.name.length > 0, `件 ${p.order} 没名字`);
    // ⚠ 洛阳那件（218 个 sprite）必须在：它是唯一的 10 级城，件也是专用的
    assert.ok(MAPO_CITY_PIECES.some((p) => p.sprites >= 200), "没有大城件（洛阳级）");
});

test("mapOriginal 城址：cities.bin 与 shared 元数据逐字节自洽", () => {
    const total = MAPO_CITY_PIECES.reduce((a, p) => a + p.sprites, 0);
    const want = 4 + MAPO_CITY_PIECES.length * 2
        + total * MAPO_CITY_SPRITE_BYTES + MAPO_CITY_PLACEMENTS * MAPO_CITY_PLACEMENT_BYTES;
    assert.equal(bin.length, want, "cities.bin 长度");
    const v = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    assert.equal(v.getUint16(0), MAPO_CITY_PIECES.length);
    assert.equal(v.getUint16(2), MAPO_CITY_PLACEMENTS);
    for (let i = 0; i < MAPO_CITY_PIECES.length; i += 1) {
        assert.equal(v.getUint16(4 + i * 2), MAPO_CITY_PIECES[i].sprites, `件 ${i} 的精灵数`);
    }
    // 摆位的件号必须都在界内
    let o = 4 + MAPO_CITY_PIECES.length * 2 + total * MAPO_CITY_SPRITE_BYTES;
    for (let i = 0; i < MAPO_CITY_PLACEMENTS; i += 1) {
        assert.ok(v.getUint16(o) < MAPO_CITY_PIECES.length, `摆位 ${i} 的件号越界`);
        o += MAPO_CITY_PLACEMENT_BYTES;
    }
});

test("mapOriginal 城址：注入后摆位对上 city_center 真坐标（⚠ 12 座渡口带美术偏移）", () => {
    mapoSetCities(bin);
    assert.ok(mapoHasCities());
    const placed = mapoCityPlacements();
    assert.equal(placed.length, 249);
    // ★ 摆位次序 == city_center.lua 的城序；row/col 打包期已套 even/odd_res_center 偏移
    //   ⇒ 只有 12 座（渡口）与城中心格不同，其余 237 座必须严格相等。
    const moved: string[] = [];
    for (let i = 0; i < placed.length; i += 1) {
        const s = MAPO_CITY_SITES[i], q = placed[i];
        if (q.row !== s.row || q.col !== s.col) {
            moved.push(s.name);
            assert.ok(Math.abs(q.row - s.row) <= 2 && Math.abs(q.col - s.col) <= 2,
                `第 ${i + 1} 座（${s.name}）的偏移过大`);
        }
        const pos = mapoGrid2Pos(q.row, q.col);
        assert.equal(q.x, pos.x);
        assert.equal(q.y, pos.y);
    }
    // ★ 被偏移的**恰好**是渡口那一批（⛔ 不只是「被偏移的都是渡口」，反向也要成立）
    const piers = MAPO_CITY_SITES.filter((s) => s.shape.startsWith("PIER")).map((s) => s.name);
    assert.deepEqual(moved.slice().sort(), piers.slice().sort(), "被偏移的集合 ≠ 渡口集合");
    assert.equal(moved.length, info.anchorOffsets, "被偏移的座数应与打包期一致");
    assert.equal(moved.length, 12, "12 座渡口");
});

test("mapOriginal 城址：视口裁剪只出框内的城，且件内按 low_z 序不被打乱", () => {
    mapoSetCities(bin);
    const placed = mapoCityPlacements();
    const q = placed[0];
    // 只框住第一座：半径取半格，⛔ 别用大框（会把邻城也框进来）
    const sprites = mapoCitiesIn(q.x - 1, q.x + 1, q.y - 1, q.y + 1, 100_000);
    assert.equal(sprites.length, MAPO_CITY_PIECES[q.piece].sprites, "只该出这一座的全部件");
    // ⚠ row 是打包期序号的透传（给画家序用）⇒ 必须严格递增，⛔ 不许乱序
    for (let i = 1; i < sprites.length; i += 1) {
        assert.ok(sprites[i].row > sprites[i - 1].row, `第 ${i} 件的画家序乱了`);
    }
    // 框外必须一个都不出
    assert.equal(mapoCitiesIn(-1e9, -1e9 + 1, -1e9, -1e9 + 1, 100_000).length, 0);
});

test("mapOriginal 城址：一屏上限生效（洛阳一座就有 218 件）", () => {
    mapoSetCities(bin);
    const capped = mapoCitiesIn(-1e9, 1e9, -1e9, 1e9, 50);
    assert.equal(capped.length, 50, "上限没生效");
});

test("mapOriginal 城址：UV 在 [0,1]，尺寸走 native（⛔ 不是图集里的缩略像素）", () => {
    const [aw, ah] = info.atlas.size;
    assert.equal(info.atlas.downscale, MAPO_CITY_DOWNSCALE);
    for (const c of MAPO_CITY_CELLS) {
        const [u0, v0, uw, vh] = mapoCityUv(c);
        assert.ok(u0 >= 0 && v0 >= 0 && u0 + uw <= 1 && v0 + vh <= 1, `格 ${c.id} 的 UV 越界`);
        // ★ native 是**原版像素**、rect 是缩过的 ⇒ 两者的比必须落在 downscale 附近
        const texture = MAPO_CITY_TEXTURES[c.textureId];
        const k = texture.rect[2] / texture.nativeSize[0];
        assert.ok(Math.abs(k - MAPO_CITY_DOWNSCALE) < 0.06,
            `格 ${c.id} 的缩放比 ${k} 偏离 ${MAPO_CITY_DOWNSCALE}`);
        assert.ok(texture.rect[0] + texture.rect[2] <= aw && texture.rect[1] + texture.rect[3] <= ah, `格 ${c.id} 出图集`);
    }
});

test("mapOriginal 城址：注入会拒收对不上的表", () => {
    assert.throws(() => mapoSetCities(bin.subarray(0, bin.length - 1)), /长度不符/);
    const bad = Uint8Array.from(bin);
    new DataView(bad.buffer).setUint16(2, 248);          // 摆位数改错
    assert.throws(() => mapoSetCities(bad), /摆位/);
});

test("mapOriginal 城址：每座城的世界尺寸落在格的量级（⛔ 钉住 32/150 那道换算）", () => {
    // ★ 件的世界尺寸 = 原图像素 × prefab 的 scale × (32 / 150)。
    //   ⚠ 漏掉那道换算会让所有城**一次性大 4.7 倍**，而 UV / 数量 / 次序的用例全都照过 ——
    //   ⛔ 所以要专门钉一条尺寸量级的闸。
    // 实测各形状的渲染宽度（格）：H_SHAPE 2.69..3.36（shape_box 宽 3）、
    //   DOUBLE_H_SHAPE 4.23..5.05（box 5）、RADIUS_2 2.13..2.86、PIER_* 1.66..3.11。
    mapoSetCities(bin);
    const placed = mapoCityPlacements();
    const cellW = MAPO_TILE_HALF_W * 2;
    let widest = 0, narrowest = Infinity;
    for (let i = 0; i < placed.length; i += 1) {
        const q = placed[i];
        const sp = mapoCitiesIn(q.x - 1, q.x + 1, q.y - 1, q.y + 1, 100_000);
        const w = (Math.max(...sp.map((t) => t.x + t.w / 2))
            - Math.min(...sp.map((t) => t.x - t.w / 2))) / cellW;
        widest = Math.max(widest, w);
        narrowest = Math.min(narrowest, w);
        assert.ok(w >= 1 && w <= 8,
            `第 ${i + 1} 座（${MAPO_CITY_SITES[i].name}）宽 ${w.toFixed(2)} 格，量级不对`);
    }
    // ⚠ 上下界留了足够余量，但**不能把 4.7× 放进来**：最宽的城若超过 8 格就说明换算漏了
    assert.ok(widest < 6, `最宽的城 ${widest.toFixed(2)} 格`);
    assert.ok(narrowest > 1.2, `最窄的城 ${narrowest.toFixed(2)} 格`);
});
