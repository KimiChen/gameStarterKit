import { mapoPrefabSkew } from "./mapoPrefab";
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
 * ★ **季/地貌变体（N1）**：锚点格在雪带 ⇒ 用 `MAPO_REGION_SNOW_CELLS`（雪山同形 prefab，
 *   transform 逐形重读）；沙带/其余 ⇒ 基础季（⚠ 荒地山的 2D 件与基础季**同件**，实测 13/13，
 *   ⇒ ⛔ 没有沙件表）。带归属看 cell 级 `logic_background`（`mapoBandAt`），⛔ 不看块带。
 *   ⚠ `autumn_*` 不接（M0-B3 已拍板）。
 *
 * ⚠ 表**已按 s 升序落盘 = 画家序**，这里只做**区间二分 + 矩形裁剪**，
 * ⛔ 不要每帧对 2.8 万条排序或全表扫描。
 * ⚠ 件带有 prefab 局部偏移，可能伸出锚点格，所以二分下界要多放一段（`S_MARGIN`），
 * ⛔ 只按可视矩形的 s 区间取会把「锚点在屏幕下方、身子探进来」的大山漏掉。
 */
import {
    MAPO_REGION_D_BIAS, MAPO_REGION_HEADER_BYTES, MAPO_REGION_RECORD_BYTES,
    mapoOriginalPxToWorld, mapoRegionPos, mapoRegionSAt, type IMapoRegionPiece,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_REGION_CELLS, MAPO_REGION_SNOW_CELLS, MAPO_REGION_TEXTURES, type IMapoRegionCell,
} from "../../../shared/kits/mapOriginal/content/region.data";
import { MAPO_BAND_SNOW } from "../../../shared/kits/mapOriginal/content/bands.data";
import { mapoBandAt } from "./mapoBands";

/** 图集格（= 原版 res 值）→ 布局，一次算好。⛔ 不要每件 find。 */
const CELL_BY_ID: ReadonlyMap<number, IMapoRegionCell> =
    new Map(MAPO_REGION_CELLS.map((c) => [c.id, c]));

/** 雪山变体（N1）：值 → 图集格。⚠ **沙漠带的山件就是基础季件**（land 表里荒地山的 2D
 *  `src_name` 与基础季逐字相同，实测 13/13）⇒ ⛔ 没有也不需要沙件表。 */
const SNOW_CELL_BY_ID: ReadonlyMap<number, IMapoRegionCell> =
    new Map(MAPO_REGION_SNOW_CELLS.map((c) => [c.id, c]));

/**
 * 二分下界往下多放的 s 量（格）。
 * ⚠ 取最高的一件能盖住的行数：件高 = 宽 × 原图纵横比，一格高 = 2·halfH ⇒
 *   7 格宽的山约 3.5 格高、再留一倍余量。⛔ 调小了大山会从屏幕下沿「消失」。
 */
const S_MARGIN = 24;

export interface IMapoRegionPlacement {
    readonly piece: IMapoRegionPiece;
    readonly cellLayout: IMapoRegionCell;
    /** prefab 中心锚点的世界坐标。 */
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    /** 绕精灵中心的旋转（度），来自 prefab。 */
    readonly angleDeg: number;
}

export interface IMapoWorldRect {
    readonly left: number; readonly right: number;
    readonly bottom: number; readonly top: number;
}

/** 地图实例的数据读取器；dispose 清空运行时解码结果和 Buffer 视图。 */
export function createMapoRegionsData(bandAt: (row: number, col: number) => number = mapoBandAt) {
    let view: DataView | null = null;

    let count = 0;

    /** 注入 `regions.bin`（含 4 字节大端头）。⚠ 长度对不上就拒收。 */
    function mapoSetRegions(buf: ArrayBuffer | Uint8Array): void {
        const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        if (u.length < MAPO_REGION_HEADER_BYTES) throw new Error("mapOriginal 区域表太短");
        const n = (u[0] << 24) | (u[1] << 16) | (u[2] << 8) | u[3];
        if (u.length !== MAPO_REGION_HEADER_BYTES + n * MAPO_REGION_RECORD_BYTES) {
            throw new Error(`mapOriginal 区域表长度不符：${n} 条 / ${u.length} B`);
        }
        view = new DataView(u.buffer, u.byteOffset, u.byteLength);
        count = n;
    }

    function mapoHasRegions(): boolean { return view !== null; }

    function mapoRegionCount(): number { return count; }

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

    /**
     * 可视矩形内的区域件，**已是画家序**（表的落盘序）。
     * @param limit 一次最多返回多少件（防一屏几千件把 mesh 撑爆）。
     */
    function mapoRegionsInRect(rect: IMapoWorldRect, limit: number): IMapoRegionPlacement[] {
        if (!view || count === 0) return [];
        // 屏幕越靠下 s 越大 ⇒ 上边界对应最小 s
        // 原件按中心 pivot 定位，会同时向锚点上、下外伸；两端都要扩展候选区间。
        const sTop = Math.floor(mapoRegionSAt(rect.top)) - S_MARGIN;
        const sBottom = Math.ceil(mapoRegionSAt(rect.bottom)) + S_MARGIN;
        const out: IMapoRegionPlacement[] = [];
        for (let i = lowerBound(Math.max(0, sTop)); i < count && out.length < limit; i += 1) {
            const piece = recordAt(i);
            if (piece.s > sBottom) break;
            // ★ 先判带再选件（N1）：格在雪带 ⇒ 雪山件（transform 逐形重读，⛔ 不抄基础季）；
            //   沙带/其余 ⇒ 基础季件（荒地山 2D 与基础季同件，实测）。
            //   带归属 = 锚点格的 cell 级地貌带（mapoBands.ts，原版 check_ground_type 同一条链）。
            const band = bandAt((piece.s + piece.d) / 2, (piece.s - piece.d) / 2);
            const layout = (band === MAPO_BAND_SNOW ? SNOW_CELL_BY_ID.get(piece.cell) : null)
                ?? CELL_BY_ID.get(piece.cell);
            if (!layout) continue;
            const anchor = mapoRegionPos(piece.s, piece.d);
            // ★ 件多大 = **原图像素 × prefab 里的 scale**（⛔ 不按足迹拉伸，拉伸过一版是大绿斑）：
            //   m2 只有 563 px 却要盖满 19 格，靠的就是 `mountain19m_01` 的 scale 2.163；
            //   三对共用贴图的形全靠 transform 区分 ⇒ ⛔ 只用 native 会把 14 形压成 10 形。
            const [nw, nh] = layout.size;
            const w = mapoOriginalPxToWorld(nw * layout.scale[0]);
            const h = mapoOriginalPxToWorld(nh * layout.scale[1]);
            // 精灵中心 = 锚点格位置 + prefab 的 pos（本套 pivot 恒 [0.5, 0.5]）。
            const x = anchor.x + mapoOriginalPxToWorld(layout.offset[0]);
            const y = anchor.y + mapoOriginalPxToWorld(layout.offset[1]);
            const r = layout.angle * Math.PI / 180;
            const cs = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r));
            const [ka, kb, kc, kd] = mapoPrefabSkew(...layout.skew, ...layout.scale);
            const kw = Math.abs(w * ka) + Math.abs(h * kc), kh = Math.abs(w * kb) + Math.abs(h * kd);
            const halfW = (kw * cs + kh * sn) / 2, halfH = (kw * sn + kh * cs) / 2;
            if (x + halfW < rect.left || x - halfW > rect.right) continue;
            if (y - halfH > rect.top || y + halfH < rect.bottom) continue;
            out.push({ piece, cellLayout: layout, x, y, w, h, angleDeg: layout.angle });
        }
        return out;
    }

    /** 图集格 → 归一化 UV [u0, v0, uw, vh]（v 原点在上）。 */
    function mapoRegionUv(layout: IMapoRegionCell,
                                 atlasW: number, atlasH: number): readonly [number, number, number, number] {
        const [x, y, w, h] = MAPO_REGION_TEXTURES[layout.textureId].rect;
        return [x / atlasW, y / atlasH, w / atlasW, h / atlasH];
    }

    /** 仅供测试重置。 */
    function resetMapoRegions(): void { view = null; count = 0; }

    /** O0 只读持有量：不触发惰性解码；对象数量不冒充 JS 堆字节，BufferAsset 别再重复相加。 */
    function mapoRegionsDataUsage(): Readonly<Record<string, number>> {
        return { arrayBufferBytes: view?.buffer.byteLength ?? 0, placements: count };
    }

    return { mapoSetRegions, mapoHasRegions, mapoRegionCount, mapoRegionsInRect, mapoRegionUv, resetMapoRegions, mapoRegionsDataUsage,
        dispose(): void { resetMapoRegions(); },
    };
}

/** 兼容离线烘焙与已有测试；地图运行时必须使用 MapoDataStore 的独立读取器。 */
export const { mapoSetRegions, mapoHasRegions, mapoRegionCount, mapoRegionsInRect, mapoRegionUv, resetMapoRegions, mapoRegionsDataUsage } = createMapoRegionsData();
