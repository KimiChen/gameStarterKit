import { mapoReadPrefabVisual, mapoPrefabUv, type MapoPrefabVisual } from "./mapoPrefab";
/**
 * 城址件层：把**原版的城**（城墙 + 民居 + 街巷 + 林木）立在真坐标上。纯逻辑，⛔ 不碰 cc。
 *
 * ★ 城不在 `res.bytes` 里，是**建筑层**画上去的（MAPORIGINAL-2D §5）。件由 `base.cw` 两级
 *   配置定死：`city[1].client_res_id` → `city_res.editor_brush_res_path` → prefab。
 *   ⇒ **纯查表**，⛔ 没有概率、没有按位置散列挑件。
 *   （早先摆件层按「面积前 8 大 + 位置散列」挑城址件 —— 那是本仓自创的启发式，已删。）
 * ★ **15 个件覆盖全部 249 座**：件库只存 15 份、摆位存 249 条，⛔ 别把件展开 249 份。
 * ⚠ 件内次序按 **`low_z` 升序**（打包期已排好），⛔ 别在这里重排。
 * 图片锚点 = 件根位置 + prefab 局部 position；mesh 使用 prefab 的真实 pivot。
 * ⚠ 摆位的 row/col **打包期已套**过 `city_shape` 的 `even/odd_res_center` 美术偏移，
 *   ⛔ 这里别再套一次。
 */
import {
    MAPO_CITY_ATLAS_SIZE, MAPO_CITY_CELLS, MAPO_CITY_TEXTURES, MAPO_CITY_PIECES, MAPO_CITY_PLACEMENTS,
    MAPO_CITY_PLACEMENT_BYTES, MAPO_CITY_SPRITE_BYTES, type IMapoCityCell,
} from "../../../shared/kits/mapOriginal/content/cities.data";
import {
    mapoGrid2Pos,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import type { MapoSpriteInput } from "./mapoMesh";

interface CitySprite extends MapoPrefabVisual {
    readonly cell: IMapoCityCell;
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
            list.push({ cell, ...mapoReadPrefabVisual(v, o) });
            o += MAPO_CITY_SPRITE_BYTES;
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
    const [x, y, w, h] = MAPO_CITY_TEXTURES[cell.textureId].rect;
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
            out.push({
                // ⚠ row/col 只给画家序用：城已按 y 降序、件内已按 low_z 排好 ⇒ 给同序的量即可
                row: out.length, col: 0,
                ...t.sprite, x: q.x + t.sprite.x, y: q.y + t.sprite.y,
                uv: mapoPrefabUv(mapoCityUv(t.cell), t.mirrorX, t.mirrorY),
            });
        }
    }
    return out;
}

/** O0 只读持有量：不触发惰性解码；对象数量不冒充 JS 堆字节，BufferAsset 别再重复相加。 */
export function mapoCitiesDataUsage(): Readonly<Record<string, number>> {
    return { arrayBufferBytes: 0, pieces: PIECES.length,
        sprites: PIECES.reduce((sum, p) => sum + p.length, 0), placements: PLACED.length };
}
