/**
 * 河流层：原版的水面多边形。纯逻辑，⛔ 不碰 cc。
 *
 * ★ 摆放与选片**完全由原版数据定**（docs/MAPORIGINAL-2D.md §4.1）：
 *   `river.bytes` 是「河格 → `river_path.json` 下标」的单字节图，**选片在制图期就烘死在
 *   字节值里** ⇒ 运行时 ⛔ 不做任何邻接判断、⛔ 不拼接、⛔ 不随机。
 * ★ 一个「河格」= **3×3 逻辑格**，原版用 ninegrid2pos(r−2,c−2,450,225)。
 *   它没有 grid2pos 的奇偶行偏移；详见 MAPORIGINAL-2D §4.1。
 * ★ 几何是**原版 prefab 自带的三角化**（`polygon_2d.vertices/indices`），⛔ 我们不做耳切。
 * ★ 本读取器提供平色底与水系采样点；流动 mask / normal 由 MapoRiverRenderer 叠加。
 * ⚠ 表**已按 s 升序落盘 = 画家序**，这里只做区间二分 + 矩形裁剪，
 * ⛔ 不要每帧对 3.1 万条排序。
 */
import {
    MAPO_TILE_HALF_H, MAPO_TILE_HALF_W,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_RIVER_D_BIAS, MAPO_RIVER_GEO_COUNT, MAPO_RIVER_HEADER_BYTES,
    MAPO_RIVER_RECORD_BYTES, MAPO_RIVER_S_BIAS, MAPO_RIVER_TILES,
} from "../../../shared/kits/mapOriginal/content/river.data";
import type { MapoPolygonInput } from "./mapoMesh";
import { parseMapoPolyLib, type IMapoPoly } from "./mapoPolyLib";

export interface IMapoWorldRectLike {
    readonly left: number; readonly right: number;
    readonly bottom: number; readonly top: number;
}

/**
 * 二分上下界各往外放的 s 量（格）。
 * ⚠ 一片水面最大横跨约 8 格（原版 `size` 最大 ~2600 px / 300 px 一格），取两倍余量。
 * ⛔ 调小了屏幕上下沿的河会突然缺一截。
 */
export const MAPO_RIVER_S_MARGIN = 16;

/** 地图实例的数据读取器；dispose 清空运行时解码结果和 Buffer 视图。 */
export function createMapoRiversData() {
    let geos: IMapoPoly[] = [];

    let view: DataView | null = null;

    let count = 0;

    /** 注入 `river-geo.bin`。⚠ 条数/长度对不上就拒收，⛔ 不容忍半截几何库。 */
    function mapoSetRiverGeo(buf: ArrayBuffer | Uint8Array): void {
        geos = parseMapoPolyLib(buf, MAPO_RIVER_GEO_COUNT, "河流");
    }

    /** 注入 `rivers.bin`（含 4 字节大端头）。⚠ 长度对不上就拒收。 */
    function mapoSetRivers(buf: ArrayBuffer | Uint8Array): void {
        const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        if (u.length < MAPO_RIVER_HEADER_BYTES) throw new Error("mapOriginal 河流表太短");
        const n = (u[0] << 24) | (u[1] << 16) | (u[2] << 8) | u[3];
        if (u.length !== MAPO_RIVER_HEADER_BYTES + n * MAPO_RIVER_RECORD_BYTES) {
            throw new Error(`mapOriginal 河流表长度不符：${n} 条 / ${u.length} B`);
        }
        view = new DataView(u.buffer, u.byteOffset, u.byteLength);
        count = n;
    }

    function mapoHasRivers(): boolean { return view !== null && geos.length > 0; }

    function mapoRiverCount(): number { return count; }

    /** 表中 R=3r−6、C=3c−6；展开原版 ninegrid2pos 后再换算为世界单位。 */
    function mapoRiverPos(s: number, d: number): { x: number; y: number } {
        return { x: d * MAPO_TILE_HALF_W, y: -(s + MAPO_RIVER_TILES) * MAPO_TILE_HALF_H };
    }

    /** 第一条 `s >= want` 的下标（表已升序）。 */
    function lowerBound(want: number): number {
        let lo = 0, hi = count;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (view!.getUint16(MAPO_RIVER_HEADER_BYTES + mid * MAPO_RIVER_RECORD_BYTES) < want) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    /**
     * 可视矩形内的水面多边形，**已是画家序**（表的落盘序）。
     * @param uvOf  水系 → 填充图上的采样点（整片一个点）。
     * @param rgba  整片顶点色（本仓色相）。
     */
    function mapoRiversInRect(rect: IMapoWorldRectLike, limit: number,
                                     uvOf: (system: number) => readonly [number, number],
                                     rgba: readonly [number, number, number, number]): MapoPolygonInput[] {
        if (!view || count === 0 || geos.length === 0) return [];
        // 屏幕越靠下 s 越大；⚠ 一片水面能横跨好几格，二分下界要往两边各放一段
        const halfH = MAPO_TILE_HALF_H;
        const sTop = Math.floor(-rect.top / halfH) - MAPO_RIVER_S_MARGIN;
        const out: MapoPolygonInput[] = [];
        for (let i = Math.max(0, lowerBound(Math.max(0, sTop))); i < count && out.length < limit; i += 1) {
            const o = MAPO_RIVER_HEADER_BYTES + i * MAPO_RIVER_RECORD_BYTES;
            const sRaw = view.getUint16(o);
            if (-(sRaw - MAPO_RIVER_S_BIAS) * halfH < rect.bottom - MAPO_RIVER_S_MARGIN * halfH) break;
            const s = sRaw - MAPO_RIVER_S_BIAS, d = view.getUint16(o + 2) - MAPO_RIVER_D_BIAS;
            const geo = geos[view.getUint8(o + 4) - 1];
            if (!geo) continue;
            const pos = mapoRiverPos(s, d);
            if (pos.x + geo.maxX < rect.left || pos.x + geo.minX > rect.right) continue;
            if (pos.y + geo.minY > rect.top || pos.y + geo.maxY < rect.bottom) continue;
            out.push({ s: sRaw, x: pos.x, y: pos.y, geo: view.getUint8(o + 4),
                       verts: geo.verts, indices: geo.indices, uv: uvOf(geo.tag), rgba });
        }
        return out;
    }

    /** O0 只读持有量：不触发惰性解码；对象数量不冒充 JS 堆字节，BufferAsset 别再重复相加。 */
    function mapoRiversDataUsage(): Readonly<Record<string, number>> {
        return { arrayBufferBytes: (view?.buffer.byteLength ?? 0)
            + geos.reduce((sum, g) => sum + g.verts.byteLength + g.indices.byteLength, 0),
            polygons: geos.length, placements: count };
    }

    return { mapoSetRiverGeo, mapoSetRivers, mapoHasRivers, mapoRiverCount, mapoRiverPos, mapoRiversInRect, mapoRiversDataUsage,
        dispose(): void { geos = []; view = null; count = 0; },
    };
}

/** 兼容离线烘焙与已有测试；地图运行时必须使用 MapoDataStore 的独立读取器。 */
export const { mapoSetRiverGeo, mapoSetRivers, mapoHasRivers, mapoRiverCount, mapoRiverPos, mapoRiversInRect, mapoRiversDataUsage } = createMapoRiversData();
