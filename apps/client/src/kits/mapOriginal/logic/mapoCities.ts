/**
 * 城址件层：把**原版的城**（城墙 + 民居 + 街巷 + 林木）立在真坐标上。纯逻辑，⛔ 不碰 cc。
 *
 * ★ 城不在 `res.bytes` 里，是**建筑层**画上去的（MAPORIGINAL-2D §5）。件由 `base.cw` 两级
 *   配置定死：`city[1].client_res_id` → `city_res.editor_brush_res_path` → prefab。
 *   ⇒ **纯查表**，⛔ 没有概率、没有按位置散列挑件。
 *   （早先摆件层按「面积前 8 大 + 位置散列」挑城址件 —— 那是本仓自创的启发式，已删。）
 * ★ **15 个件覆盖全部 249 座**：件库只存 15 份、摆位存 249 条，⛔ 别把件展开 249 份。
 * ⚠ 件内次序按 **`low_z` 升序**（打包期已排好），⛔ 别在这里重排。
 * ⚠ 件是「**底边中点**对齐到格心」：prefab 的 pos 指的是件**中心** ⇒ 再往下 h/2（与山族件同式）。
 * ⚠ 摆位的 row/col **打包期已套**过 `city_shape` 的 `even/odd_res_center` 美术偏移，
 *   ⛔ 这里别再套一次。
 */
import {
    MAPO_CITY_ATLAS_SIZE, MAPO_CITY_CELLS, MAPO_CITY_PIECES, MAPO_CITY_PLACEMENTS,
    MAPO_CITY_PLACEMENT_BYTES, MAPO_CITY_SPRITE_BYTES, type IMapoCityCell,
} from "../../../shared/kits/mapOriginal/content/cities.data";
import {
    mapoGrid2Pos, mapoOriginalPxToWorld,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import type { MapoSpriteInput } from "./mapoMesh";

interface CitySprite {
    readonly cell: IMapoCityCell;
    /** 相对件锚点的世界偏移。 */
    readonly ox: number; readonly oy: number;
    readonly w: number; readonly h: number;
    readonly angleDeg: number;
    /** 水平翻转（prefab 的 scale.x < 0）。 */
    readonly flipX: boolean;
}

export interface IMapoCityPlacement {
    readonly piece: number;
    readonly row: number;
    readonly col: number;
    readonly x: number;
    readonly y: number;
}

let PIECES: CitySprite[][] = [];
let PLACED: IMapoCityPlacement[] = [];

/** 注入 `cities.bin`。⚠ 件数/精灵数/摆位数/长度任一对不上就拒收。 */
export function mapoSetCities(buf: ArrayBuffer | Uint8Array): void {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
    const np = v.getUint16(0), nq = v.getUint16(2);
    if (np !== MAPO_CITY_PIECES.length) {
        throw new Error(`mapOriginal 城址件 ${np} 个 ≠ ${MAPO_CITY_PIECES.length}`);
    }
    if (nq !== MAPO_CITY_PLACEMENTS) {
        throw new Error(`mapOriginal 城址摆位 ${nq} 条 ≠ ${MAPO_CITY_PLACEMENTS}`);
    }
    const counts: number[] = [];
    let total = 0;
    for (let i = 0; i < np; i += 1) {
        const n = v.getUint16(4 + i * 2);
        if (n !== MAPO_CITY_PIECES[i].sprites) {
            throw new Error(`mapOriginal 城址件 ${i} 有 ${n} 个精灵 ≠ ${MAPO_CITY_PIECES[i].sprites}`);
        }
        counts.push(n);
        total += n;
    }
    const want = 4 + np * 2 + total * MAPO_CITY_SPRITE_BYTES + nq * MAPO_CITY_PLACEMENT_BYTES;
    if (u.length !== want) {
        throw new Error(`mapOriginal 城址表长度不符：${u.length} B，应为 ${want} B`);
    }
    const byId = new Map(MAPO_CITY_CELLS.map((c) => [c.id, c]));
    const pieces: CitySprite[][] = [];
    let o = 4 + np * 2;
    for (const n of counts) {
        const list: CitySprite[] = [];
        for (let k = 0; k < n; k += 1) {
            const cell = byId.get(v.getUint16(o));
            if (!cell) throw new Error("mapOriginal 城址件引用了不存在的图集格");
            const x = v.getFloat32(o + 2), y = v.getFloat32(o + 6);
            const sx = v.getFloat32(o + 10), sy = v.getFloat32(o + 14);
            const angle = v.getFloat32(o + 18);
            o += MAPO_CITY_SPRITE_BYTES;
            list.push({
                cell,
                ox: mapoOriginalPxToWorld(x), oy: mapoOriginalPxToWorld(y),
                // ★ 尺寸走 native（原图像素）× prefab 的 scale，⛔ 不是图集里的缩略尺寸
                w: mapoOriginalPxToWorld(cell.native[0] * Math.abs(sx)),
                h: mapoOriginalPxToWorld(cell.native[1] * Math.abs(sy)),
                angleDeg: angle, flipX: sx < 0,
            });
        }
        pieces.push(list);
    }
    const placed: IMapoCityPlacement[] = [];
    for (let i = 0; i < nq; i += 1) {
        const piece = v.getUint16(o), row = v.getUint16(o + 2), col = v.getUint16(o + 4);
        o += MAPO_CITY_PLACEMENT_BYTES;
        if (piece >= np) throw new Error(`mapOriginal 城址摆位 ${i} 引用了不存在的件 ${piece}`);
        const pos = mapoGrid2Pos(row, col);
        placed.push({ piece, row, col, x: pos.x, y: pos.y });
    }
    PIECES = pieces;
    PLACED = placed;
}

export function mapoHasCities(): boolean {
    return PIECES.length > 0 && PLACED.length > 0;
}

/** 全部摆位（⚠ 只读；裁剪由调用方按视口做）。 */
export function mapoCityPlacements(): readonly IMapoCityPlacement[] {
    return PLACED;
}

/** 图集格 → 归一化 UV [u0, v0, uw, vh]（v 原点在上）。 */
export function mapoCityUv(cell: IMapoCityCell): readonly [number, number, number, number] {
    const [x, y, w, h] = cell.rect;
    const [aw, ah] = MAPO_CITY_ATLAS_SIZE;
    return [x / aw, y / ah, w / aw, h / ah];
}

/**
 * 把视口内的城展开成 sprite。
 *
 * @param minX/maxX/minY/maxY 视口的世界包围盒（**已含件的外扩**由调用方保证）。
 * @param limit 一屏最多展开多少件（一座大城 245 个 ⇒ ⛔ 必须有上限）。
 * ⚠ 按 `y` 降序（屏幕越低越靠前）排城：城之间要有画家序，⛔ 别按摆位原序。
 */
export function mapoCitiesIn(minX: number, maxX: number, minY: number, maxY: number,
                             limit: number): MapoSpriteInput[] {
    if (!mapoHasCities()) return [];
    const hit = PLACED.filter((q) => q.x >= minX && q.x <= maxX && q.y >= minY && q.y <= maxY);
    hit.sort((a, b) => b.y - a.y || a.x - b.x);
    const out: MapoSpriteInput[] = [];
    for (const q of hit) {
        for (const t of PIECES[q.piece]) {
            if (out.length >= limit) return out;
            const uv = mapoCityUv(t.cell);
            out.push({
                // ⚠ row/col 只给画家序用：城已按 y 降序、件内已按 low_z 排好 ⇒ 给同序的量即可
                row: out.length, col: 0,
                x: q.x + t.ox, y: q.y + t.oy - t.h / 2, w: t.w, h: t.h,
                uv: t.flipX ? [uv[0] + uv[2], uv[1], -uv[2], uv[3]] : uv,
                angleDeg: t.angleDeg,
            });
        }
    }
    return out;
}
