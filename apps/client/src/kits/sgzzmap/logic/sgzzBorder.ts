/**
 * 六向描边（原作 grid_range_border.lua:34-77 的算法）。
 *
 * 对区域里每一格，按**环序**走它的六个邻居；邻居不在区域里就在这条边上出一片边片，
 * 变体号 res_dir = 1..6（= 环序下标+1）。引用计数 cnt ⇒ 多个重叠区域可以叠加，
 * 撤掉其中一个不会把另一个的边也抹掉。
 */
import {
    sgzzCellOf, sgzzDecodeCell, sgzzInBounds, sgzzRingTable,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";

export interface SgzzBorderEdge {
    readonly row: number;
    readonly col: number;
    /** 1..6，环序下标 +1；美术按它取边片。 */
    readonly resDir: number;
}
/** 单帧边片硬上限——无界的边集是最容易顶穿 Uint16 索引的地方。 */
export const SGZZ_MAX_BORDER_EDGES = 2048;

export class SgzzBorderSet {
    private readonly counts = new Map<number, number>();
    /** 因上限被丢弃的边片数，供调试面板显示。 */
    dropped = 0;

    add(row: number, col: number): void {
        const cell = sgzzCellOf(row, col);
        this.counts.set(cell, (this.counts.get(cell) ?? 0) + 1);
    }
    remove(row: number, col: number): void {
        const cell = sgzzCellOf(row, col);
        const n = this.counts.get(cell);
        if (n === undefined) return;
        if (n <= 1) this.counts.delete(cell); else this.counts.set(cell, n - 1);
    }
    clear(): void { this.counts.clear(); this.dropped = 0; }
    get size(): number { return this.counts.size; }
    has(row: number, col: number): boolean { return this.counts.has(sgzzCellOf(row, col)); }

    /** 计算边界边片。输出按 (row,col,resDir) 稳定有序，便于逐帧 diff。 */
    edges(rows: number, cols: number): SgzzBorderEdge[] {
        const out: SgzzBorderEdge[] = [];
        this.dropped = 0;
        const cells = [...this.counts.keys()].sort((a, b) => a - b);
        for (const cell of cells) {
            const { row, col } = sgzzDecodeCell(cell);
            const ring = sgzzRingTable(row);
            for (let i = 0; i < ring.length; i += 1) {
                const r = row + ring[i][0], c = col + ring[i][1];
                // 出图外也算「外面」⇒ 地图边缘同样描边
                const outside = !sgzzInBounds(r, c, rows, cols) || !this.counts.has(sgzzCellOf(r, c));
                if (!outside) continue;
                if (out.length >= SGZZ_MAX_BORDER_EDGES) { this.dropped += 1; continue; }
                out.push({ row, col, resDir: i + 1 });
            }
        }
        return out;
    }
}
