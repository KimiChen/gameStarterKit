/**
 * 多格地形的件层：原版「山」族 14 形（`山1..山14`）。纯逻辑，⛔ 不碰 cc。
 *
 * ★ 摆放**完全由原版数据定**，⛔ 零连通域、零启发式、零随机：
 *   ① **主表 = `res.bytes` 的 55,127 个非零锚点**（值 48..61）——
 *      `res` 的非零值**就是锚点**、`res_multi` 只是覆盖掩码（docs/MAPORIGINAL-2D.md §3.1）；
 *      件的形与贴图由值直接查 `MAPO_REGION_CELLS`（格 id = 原版 res 值）。
 *   ② **补件 = `mountain_patch.bytes` 的 3,942 条**（§3.4）：落在大山内部、打散重复感。
 *   两者都已在打包期算好，落 `regions.bin`（5.9 万条 / 461 KB，Cocos BufferAsset）。
 *
 * ⚠ 早先这里是「合并 res 与 res_multi → 八邻连通域 → 每区一件」：合并那一步
 *   把 142,958 个覆盖格填成了锚点值、销毁了锚点信息，连通域是为补救它才发明的。⛔ 别再回去。
 *
 * ⚠ 表**已按 s 升序落盘 = 画家序**，这里只做**区间二分 + 矩形裁剪**，
 * ⛔ 不要每帧对 2.8 万条排序或全表扫描。
 * ⚠ 件会**往上长**（锚在底边中点），所以二分的下界要往下多放一段（`S_MARGIN`），
 * ⛔ 只按可视矩形的 s 区间取会把「锚点在屏幕下方、身子探进来」的大山漏掉。
 */
import {
    MAPO_REGION_D_BIAS, MAPO_REGION_HEADER_BYTES, MAPO_REGION_RECORD_BYTES,
    mapoOriginalPxToWorld, mapoRegionPos, mapoRegionSAt, type IMapoRegionPiece,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_REGION_CELLS, type IMapoRegionCell,
} from "../../../shared/kits/mapOriginal/content/region.data";

/** 图集格（= 原版 res 值）→ 布局，一次算好。⛔ 不要每件 find。 */
const CELL_BY_ID: ReadonlyMap<number, IMapoRegionCell> =
    new Map(MAPO_REGION_CELLS.map((c) => [c.id, c]));

/**
 * 二分下界往下多放的 s 量（格）。
 * ⚠ 取最高的一件能盖住的行数：件高 = 宽 × 原图纵横比，一格高 = 2·halfH ⇒
 *   7 格宽的山约 3.5 格高、再留一倍余量。⛔ 调小了大山会从屏幕下沿「消失」。
 */
const S_MARGIN = 24;

let view: DataView | null = null;
let count = 0;

/** 注入 `regions.bin`（含 4 字节大端头）。⚠ 长度对不上就拒收。 */
export function mapoSetRegions(buf: ArrayBuffer | Uint8Array): void {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u.length < MAPO_REGION_HEADER_BYTES) throw new Error("mapOriginal 区域表太短");
    const n = (u[0] << 24) | (u[1] << 16) | (u[2] << 8) | u[3];
    if (u.length !== MAPO_REGION_HEADER_BYTES + n * MAPO_REGION_RECORD_BYTES) {
        throw new Error(`mapOriginal 区域表长度不符：${n} 条 / ${u.length} B`);
    }
    view = new DataView(u.buffer, u.byteOffset, u.byteLength);
    count = n;
}

export function mapoHasRegions(): boolean { return view !== null; }
export function mapoRegionCount(): number { return count; }

function recordAt(i: number): IMapoRegionPiece {
    const o = MAPO_REGION_HEADER_BYTES + i * MAPO_REGION_RECORD_BYTES;
    const v = view!;
    return {
        s: v.getUint16(o), d: v.getUint16(o + 2) - MAPO_REGION_D_BIAS,
        cell: v.getUint8(o + 4), wTiles: v.getUint8(o + 5), cells: v.getUint16(o + 6),
    };
}

/** 第一条 `s >= want` 的下标（表已升序）。 */
function lowerBound(want: number): number {
    let lo = 0, hi = count;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (view!.getUint16(MAPO_REGION_HEADER_BYTES + mid * MAPO_REGION_RECORD_BYTES) < want) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

export interface IMapoRegionPlacement {
    readonly piece: IMapoRegionPiece;
    readonly cellLayout: IMapoRegionCell;
    /** 底边中点的世界坐标。 */
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

export interface IMapoWorldRect {
    readonly left: number; readonly right: number;
    readonly bottom: number; readonly top: number;
}

/**
 * 可视矩形内的区域件，**已是画家序**（表的落盘序）。
 * @param limit 一次最多返回多少件（防一屏几千件把 mesh 撑爆）。
 */
export function mapoRegionsInRect(rect: IMapoWorldRect, limit: number): IMapoRegionPlacement[] {
    if (!view || count === 0) return [];
    // 屏幕越靠下 s 越大 ⇒ 上边界对应最小 s
    const sTop = Math.floor(mapoRegionSAt(rect.top)) - 1;
    const sBottom = Math.ceil(mapoRegionSAt(rect.bottom)) + S_MARGIN;
    const out: IMapoRegionPlacement[] = [];
    for (let i = lowerBound(Math.max(0, sTop)); i < count && out.length < limit; i += 1) {
        const piece = recordAt(i);
        if (piece.s > sBottom) break;
        const layout = CELL_BY_ID.get(piece.cell);
        if (!layout) continue;
        const pos = mapoRegionPos(piece.s, piece.d);
        // ★ 件多大**由原图像素定**（原版 2D 一格 300 px），⛔ 不按足迹拉伸 ——
        //   拉伸过一版，真机上是糊成一团的大绿斑。`wTiles`/`cells` 只是足迹的诊断量。
        const [nw, nh] = layout.native;
        const w = mapoOriginalPxToWorld(nw);
        const h = w * (nh / Math.max(nw, 1));
        // ⚠ 件是「底边中点对齐」：横向以 x 为中心、纵向从 y 往上长 h
        if (pos.x + w / 2 < rect.left || pos.x - w / 2 > rect.right) continue;
        if (pos.y > rect.top || pos.y + h < rect.bottom) continue;
        out.push({ piece, cellLayout: layout, x: pos.x, y: pos.y, w, h });
    }
    return out;
}

/** 图集格 → 归一化 UV [u0, v0, uw, vh]（v 原点在上）。 */
export function mapoRegionUv(layout: IMapoRegionCell,
                             atlasW: number, atlasH: number): readonly [number, number, number, number] {
    const [ax, ay, aw, ah] = layout.art;
    const [cx, cy] = layout.cell;
    return [(cx + ax) / atlasW, (cy + ay) / atlasH, aw / atlasW, ah / atlasH];
}

/** 仅供测试重置。 */
export function resetMapoRegions(): void { view = null; count = 0; }
