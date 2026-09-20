/**
 * mmo kit · AOI 空间网格（kit 内部模块，docs/MMO.md §4.3「候选来自网格（kit）」；MK1-B2）：按内容包 `IMapDef.aoi.cellSize` 把实体桶进格子，
 * `candidates` 只产生视距圆外接矩形覆盖的格子里的实体 id——**只是候选**，精确视距与可见性授权在 `visibility.ts` / mode 里判。
 * 确定性：格子按行列序、格内按插入序（同一命令序列 ⇒ 同一候选序）。⛔ 不是第二真源（AOI 索引可重建，§4.4）。
 */
export interface IAoiPoint { readonly x: number; readonly y: number }

export class AoiGrid {
    readonly cols: number;
    readonly rows: number;
    private readonly cells: Array<Set<string> | null>;
    private readonly cellOfId = new Map<string, number>();

    constructor(readonly cellSize: number, size: { readonly w: number; readonly h: number }) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError(`[AoiGrid] cellSize ${cellSize} 非法`);
        this.cols = Math.max(1, Math.ceil(size.w / cellSize));
        this.rows = Math.max(1, Math.ceil(size.h / cellSize));
        this.cells = new Array<Set<string> | null>(this.cols * this.rows).fill(null);
    }

    get size(): number {
        return this.cellOfId.size;
    }

    has(id: string): boolean {
        return this.cellOfId.has(id);
    }

    /** 世界坐标所在格序号（图边缘最大坐标落最后一格）。 */
    cellOf(x: number, y: number): number {
        const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
        const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
        return row * this.cols + col;
    }

    insert(id: string, x: number, y: number): void {
        if (this.cellOfId.has(id)) throw new Error(`[AoiGrid] ${id} 已在网格内（用 move）`);
        const cell = this.cellOf(x, y);
        (this.cells[cell] ??= new Set()).add(id);
        this.cellOfId.set(id, cell);
    }

    /** 位置变了就调；跨格才搬桶。未插入的 id 直接插入。 */
    move(id: string, x: number, y: number): void {
        const previous = this.cellOfId.get(id);
        const next = this.cellOf(x, y);
        if (previous === next) return;
        if (previous !== undefined) this.cells[previous]?.delete(id);
        (this.cells[next] ??= new Set()).add(id);
        this.cellOfId.set(id, next);
    }

    remove(id: string): void {
        const cell = this.cellOfId.get(id);
        if (cell === undefined) return;
        this.cells[cell]?.delete(id);
        this.cellOfId.delete(id);
    }

    clear(): void {
        this.cells.fill(null);
        this.cellOfId.clear();
    }

    /** 视距圆外接矩形覆盖的格子里的全部实体 id（含中心自己）；写进 out（先清空）并返回它。 */
    candidates(center: IAoiPoint, radius: number, out: string[] = []): string[] {
        out.length = 0;
        const colMin = Math.max(0, Math.floor((center.x - radius) / this.cellSize));
        const colMax = Math.min(this.cols - 1, Math.floor((center.x + radius) / this.cellSize));
        const rowMin = Math.max(0, Math.floor((center.y - radius) / this.cellSize));
        const rowMax = Math.min(this.rows - 1, Math.floor((center.y + radius) / this.cellSize));
        for (let row = rowMin; row <= rowMax; row += 1) {
            for (let col = colMin; col <= colMax; col += 1) {
                const bucket = this.cells[row * this.cols + col];
                if (bucket) for (const id of bucket) out.push(id);
            }
        }
        return out;
    }
}
