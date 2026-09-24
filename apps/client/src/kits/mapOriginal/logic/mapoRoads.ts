/**
 * 道路层：原版的路片。纯逻辑，⛔ 不碰 cc。
 *
 * ★ 坐标系与选片**全部来自原版**（MAPORIGINAL-2D §4.2）：
 *   `road_info.lua` 的 `layer_info` 给出网格 1125²、一个路格**半宽 200 / 半高 100**
 *   （逻辑格是 150/75）= **4/3 个逻辑格**；`tiles` 的值就是 `type_info` 下标
 *   ⇒ **选片在制图期就烘死了**，运行时 ⛔ 不做任何邻接判断（与河同构）。
 * ★ 路格**自成一套网格**（⛔ 别用 `mapoGrid2Pos`，那是逻辑格的 150/75）：
 *   位置 = 同一条等距式子换路格的半宽/半高，但**没有奇偶行错位**
 *   （原版 `ninegrid2pos`；错位会把 (±1,0) 方向的路打碎，2026-09-23 实测纠正，见函数注）。
 * ⚠ 每片带一个**水平翻转**位（`type_info` 的第二列 ±1）：翻转用「UV 宽取负」实现，
 *   ⛔ 别去翻顶点（那会连画家序一起翻）。
 * ⚠ 表**已按 s 升序落盘 = 画家序**，这里只做区间二分 + 矩形裁剪。
 */
import { mapoOriginalPxToWorld, mapoPos2GridRaw } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_ROAD_ATLAS_H, MAPO_ROAD_ATLAS_W, MAPO_ROAD_CELLS, MAPO_ROAD_D_BIAS,
    MAPO_ROAD_HALF_H, MAPO_ROAD_HALF_W, MAPO_ROAD_HEADER_BYTES, MAPO_ROAD_RECORD_BYTES,
    MAPO_ROAD_S_BIAS, type IMapoRoadCell,
} from "../../../shared/kits/mapOriginal/content/roads.data";
import { mapoBandAt } from "./mapoBands";
import { MAPO_BAND_SNOW } from "../../../shared/kits/mapOriginal/content/bands.data";
import type { MapoSpriteInput } from "./mapoMesh";

/** 路格的世界半宽 / 半高。 */
export const MAPO_ROAD_WORLD_HALF_W = mapoOriginalPxToWorld(MAPO_ROAD_HALF_W);
export const MAPO_ROAD_WORLD_HALF_H = mapoOriginalPxToWorld(MAPO_ROAD_HALF_H);

const CELL_BY_ID: ReadonlyMap<number, IMapoRoadCell> =
    new Map(MAPO_ROAD_CELLS.map((c) => [c.id, c]));

let view: DataView | null = null;
let count = 0;

export function mapoSetRoads(buf: ArrayBuffer | Uint8Array): void {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u.length < MAPO_ROAD_HEADER_BYTES) throw new Error("mapOriginal 道路表太短");
    const n = (u[0] << 24) | (u[1] << 16) | (u[2] << 8) | u[3];
    if (u.length !== MAPO_ROAD_HEADER_BYTES + n * MAPO_ROAD_RECORD_BYTES) {
        throw new Error(`mapOriginal 道路表长度不符：${n} 条 / ${u.length} B`);
    }
    view = new DataView(u.buffer, u.byteOffset, u.byteLength);
    count = n;
}

export function mapoHasRoads(): boolean { return view !== null; }
export function mapoRoadCount(): number { return count; }

/**
 * 路格中心的世界坐标。⚠ **没有奇偶行错位**：路格是 8 连通的普通菱形格网 ——
 * 42,018 条 tiles 的邻居直方图在 (0,±1) / (±1,0) / (±1,±1) 全方向密集（2026-09-23 实测），
 * 若带奇偶错位，(±1,0) 方向的邻居会被打成 (+0.5hw,−1.5hh) / (+1.5hw,−0.5hh) 交替，
 * 行方向的路碎成虚线（症状实机复现过）。
 * ⛔ 别照 `mapoGrid2Pos` 抄错位：逻辑格那条式子带错位，原版的 `ninegrid2pos`
 * （路/河/官道共用）不带 —— 河格传 `/3` 分数坐标（`river_grid.lua`）也旁证它无奇偶性。
 */
export function mapoRoadPos(row: number, col: number): { x: number; y: number } {
    const hw = MAPO_ROAD_WORLD_HALF_W, hh = MAPO_ROAD_WORLD_HALF_H;
    return { x: (row - col) * hw, y: -(row + col + 1) * hh };
}

export interface IMapoRoadRect {
    readonly left: number; readonly right: number;
    readonly bottom: number; readonly top: number;
}

function lowerBound(want: number): number {
    let lo = 0, hi = count;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (view!.getUint16(MAPO_ROAD_HEADER_BYTES + mid * MAPO_ROAD_RECORD_BYTES) < want) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/** 可视矩形内的路片，**已是画家序**（表的落盘序）。 */
export function mapoRoadsInRect(rect: IMapoRoadRect, limit: number): MapoSpriteInput[] {
    if (!view || count === 0) return [];
    const hh = MAPO_ROAD_WORLD_HALF_H;
    // 路片正好一格见方 ⇒ s 方向各放一格余量即可
    const sTop = Math.floor(-rect.top / hh) - 2 + MAPO_ROAD_S_BIAS;
    const sBottom = Math.ceil(-rect.bottom / hh) + 2 + MAPO_ROAD_S_BIAS;
    const out: MapoSpriteInput[] = [];
    for (let i = Math.max(0, lowerBound(Math.max(0, sTop))); i < count && out.length < limit; i += 1) {
        const o = MAPO_ROAD_HEADER_BYTES + i * MAPO_ROAD_RECORD_BYTES;
        const sRaw = view.getUint16(o);
        if (sRaw > sBottom) break;
        let cell = CELL_BY_ID.get(view.getUint8(o + 4));
        if (!cell) continue;
        const s = sRaw - MAPO_ROAD_S_BIAS, d = view.getUint16(o + 2) - MAPO_ROAD_D_BIAS;
        const row = (s + d) / 2, col = (s - d) / 2;
        const p = mapoRoadPos(row, col);
        const grid = mapoPos2GridRaw(p.x, p.y);
        if (mapoBandAt(grid.row, grid.col) === MAPO_BAND_SNOW) cell = CELL_BY_ID.get(cell.snowId)!;
        const w = mapoOriginalPxToWorld(cell.native[0]);
        const h = mapoOriginalPxToWorld(cell.native[1]);
        if (p.x + w / 2 < rect.left || p.x - w / 2 > rect.right) continue;
        if (p.y - h / 2 > rect.top || p.y + h / 2 < rect.bottom) continue;
        const [ax, ay, aw, ah] = cell.rect;
        const u0 = ax / MAPO_ROAD_ATLAS_W, v0 = ay / MAPO_ROAD_ATLAS_H;
        const uw = aw / MAPO_ROAD_ATLAS_W, vh = ah / MAPO_ROAD_ATLAS_H;
        // ⚠ 水平翻转 = **UV 宽取负**（起点挪到右边）：⛔ 别翻顶点
        const flip = view.getUint8(o + 5) !== 0;
        out.push({
            row: s, col: 0,
            x: p.x, y: p.y, w, h, pivot: [0.5, 0.5],
            uv: flip ? [u0 + uw, v0, -uw, vh] : [u0, v0, uw, vh],
        });
    }
    return out;
}

/** O0 只读持有量：不触发惰性解码；对象数量不冒充 JS 堆字节，BufferAsset 别再重复相加。 */
export function mapoRoadsDataUsage(): Readonly<Record<string, number>> {
    return { arrayBufferBytes: view?.buffer.byteLength ?? 0, placements: count };
}
