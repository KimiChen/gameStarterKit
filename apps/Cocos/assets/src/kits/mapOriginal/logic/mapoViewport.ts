/**
 * 可视格模板（原作 viewport.get_2d_view_grid 的做法）。
 *
 * 可视格集合 = 「中心格 + 一张预算好的 (dr,dc) 偏移表」。偏移表只在**缩放或视口尺寸变化**时重算，
 * 平移时一分钱不花。⚠ 奇偶行错半格 ⇒ 两种奇偶各存一张表，⛔ 不能共用。
 */
import {
    MAPO_TILE_HALF_H, MAPO_TILE_HALF_W, mapoGrid2Pos,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";

export interface MapoOffsetStencil {
    /** 打包成 dr*65536+dc+偏移，解包用 mapoUnpackOffset。 */
    readonly offsets: Int32Array;
    readonly parity: 0 | 1;
}
/**
 * ⚠ 打包必须放得进 Int32：bias 取 2^15、stride 取 2^16 的话
 * (dr+32768)*65536 最大约 2.147e9 会**溢出** int32 变成负数（实测偏移表整片变 -65536）。
 * 取 bias 2^13 / stride 2^14 ⇒ 上限约 2.68e8，安全；越界直接抛，⛔ 不静默截断。
 */
const PACK_BIAS = 1 << 13;
const PACK_STRIDE = 1 << 14;

export function mapoPackOffset(dr: number, dc: number): number {
    if (!Number.isInteger(dr) || !Number.isInteger(dc)
        || Math.abs(dr) >= PACK_BIAS || Math.abs(dc) >= PACK_BIAS) {
        throw new RangeError(`SGZZ offset (${dr},${dc}) 超出打包范围 ±${PACK_BIAS}`);
    }
    return (dr + PACK_BIAS) * PACK_STRIDE + (dc + PACK_BIAS);
}
export function mapoUnpackOffset(packed: number): { dr: number; dc: number } {
    return { dr: Math.floor(packed / PACK_STRIDE) - PACK_BIAS, dc: (packed % PACK_STRIDE) - PACK_BIAS };
}

/** 一次可视格数的硬上限：超过就说明该走远档了，⛔ 不要真去铺几万个菱形。 */
export const MAPO_MAX_STENCIL_CELLS = 24_000;

function buildStencil(parity: 0 | 1, halfWorldW: number, halfWorldH: number,
                      marginTiles: number): Int32Array {
    // 以某个该奇偶的中心格为基准算偏移；偏移表与具体在哪一格无关（只和奇偶有关）
    const baseRow = 600 + parity, baseCol = 600;
    const base = mapoGrid2Pos(baseRow, baseCol);
    const marginX = marginTiles * MAPO_TILE_HALF_W * 2;
    const marginY = marginTiles * MAPO_TILE_HALF_H * 2;
    const left = base.x - halfWorldW - marginX, right = base.x + halfWorldW + marginX;
    const bottom = base.y - halfWorldH - marginY, top = base.y + halfWorldH + marginY;

    // 四角反解出 (row,col) 的包围盒。
    // ⚠ 这里必须用**线性**逆（row/col 是 (x,y) 的线性函数，凸矩形上的极值必在四角），
    // ⛔ 不能用 mapoPos2GridRaw —— 它带奇偶行的半格分支，会把包围盒算小一格，
    //    表现就是视口角上的格漏进不了可视集合。
    const linear = (x: number, y: number) => {
        const a = x / MAPO_TILE_HALF_W;
        const b = -y / MAPO_TILE_HALF_H - 1;
        return { row: (a + b) / 2, col: (b - a) / 2 };
    };
    let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
    for (const [x, y] of [[left, bottom], [left, top], [right, bottom], [right, top]]) {
        const g = linear(x, y);
        minRow = Math.min(minRow, g.row); maxRow = Math.max(maxRow, g.row);
        minCol = Math.min(minCol, g.col); maxCol = Math.max(maxCol, g.col);
    }
    minRow = Math.floor(minRow) - 2; maxRow = Math.ceil(maxRow) + 2;
    minCol = Math.floor(minCol) - 2; maxCol = Math.ceil(maxCol) + 2;
    const out: number[] = [];
    for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
            const p = mapoGrid2Pos(row, col);
            // 菱形与视口矩形相交 ⇔ 中心落在「矩形外扩半格」内
            if (p.x < left - MAPO_TILE_HALF_W || p.x > right + MAPO_TILE_HALF_W) continue;
            if (p.y < bottom - MAPO_TILE_HALF_H || p.y > top + MAPO_TILE_HALF_H) continue;
            out.push(mapoPackOffset(row - baseRow, col - baseCol));
            if (out.length > MAPO_MAX_STENCIL_CELLS) return new Int32Array(out.slice(0, MAPO_MAX_STENCIL_CELLS));
        }
    }
    return new Int32Array(out);
}

/** 缓存两张偏移表；只有 (scale, width, height, margin) 变了才重算。 */
/** 偏移表的最大半径（格）。近景窗按它取，⛔ 别再另算一套几何。 */
function spanOf(offsets: Int32Array): { dr: number; dc: number } {
    let dr = 0, dc = 0;
    for (let i = 0; i < offsets.length; i += 1) {
        const o = mapoUnpackOffset(offsets[i]);
        if (Math.abs(o.dr) > dr) dr = Math.abs(o.dr);
        if (Math.abs(o.dc) > dc) dc = Math.abs(o.dc);
    }
    return { dr, dc };
}

export class MapoViewportStencil {
    private key = "";
    private even: Int32Array = new Int32Array(0);
    private odd: Int32Array = new Int32Array(0);
    private evenSpan = { dr: 0, dc: 0 };
    private oddSpan = { dr: 0, dc: 0 };
    /** 重算次数，供用例断言「平移不重算」。 */
    rebuilds = 0;

    constructor(readonly marginTiles = 2) {}

    refresh(scale: number, width: number, height: number): void {
        if (!(scale > 0) || !(width > 0) || !(height > 0)) return;
        const key = `${scale}|${width}|${height}`;
        if (key === this.key) return;
        this.key = key;
        this.rebuilds += 1;
        const halfW = width / scale / 2;
        const halfH = height / scale / 2;
        this.even = buildStencil(0, halfW, halfH, this.marginTiles);
        this.odd = buildStencil(1, halfW, halfH, this.marginTiles);
        this.evenSpan = spanOf(this.even);
        this.oddSpan = spanOf(this.odd);
    }

    /** 当前缩放下、以中心格为原点的可视半径（格）。近景窗要盖住它，否则屏幕上会有「没数据」的区域。 */
    spanFor(centreRow: number): { dr: number; dc: number } {
        return (centreRow & 1) === 0 ? this.evenSpan : this.oddSpan;
    }

    offsetsFor(centreRow: number): Int32Array {
        return (centreRow & 1) === 0 ? this.even : this.odd;
    }
    get size(): number { return Math.max(this.even.length, this.odd.length); }

    /** 遍历可视格。⛔ 不分配数组——这是每帧都可能走的路径。 */
    forEach(centreRow: number, centreCol: number, rows: number, cols: number,
            visit: (row: number, col: number) => void): void {
        const offsets = this.offsetsFor(centreRow);
        for (let i = 0; i < offsets.length; i += 1) {
            const { dr, dc } = mapoUnpackOffset(offsets[i]);
            const row = centreRow + dr, col = centreCol + dc;
            if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
            visit(row, col);
        }
    }
}
