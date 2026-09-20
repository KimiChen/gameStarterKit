/**
 * mmo kit · `ai` 面 · nav 网格 A*（shared，MK2-B2）：在碰撞网格（`movement` 面 CollisionGrid 同形：cellSize + blocked(x, y)）上找路。
 * 纯函数、确定性（8 邻域、对角不许穿角、扩展上限 fail-closed 返回 null）；直线无阻挡时直接返回终点（⛔ 空转 A*）。
 * 可下沉 compute（`core/compute/tasks/kits/mmo/pathfind.ts` 只是对本函数的 structured-clone 包装）。
 */
export interface INavGrid {
    readonly cellSize: number;
    readonly cols: number;
    readonly rows: number;
    blocked(x: number, y: number): boolean;
}

export interface INavPoint { readonly x: number; readonly y: number }

export interface FindPathOptions {
    /** A* 最多展开的格数（fail-closed：超过 ⇒ null，调用方视为不可达） */
    readonly maxExpansions?: number;
    /** 直线检查的采样步长（世界单位；缺省 cellSize / 2） */
    readonly lineStep?: number;
}

export const NAV_DEFAULT_MAX_EXPANSIONS = 4_096;

/** 直线可通行（按 lineStep 采样，含终点）。 */
export function lineClear(grid: INavGrid, from: INavPoint, to: INavPoint, lineStep = grid.cellSize / 2): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, lineStep)));
    for (let index = 1; index <= steps; index += 1) {
        const ratio = index / steps;
        if (grid.blocked(from.x + dx * ratio, from.y + dy * ratio)) return false;
    }
    return true;
}

const cellOf = (grid: INavGrid, point: INavPoint): { readonly col: number; readonly row: number } => ({
    col: Math.min(grid.cols - 1, Math.max(0, Math.floor(point.x / grid.cellSize))),
    row: Math.min(grid.rows - 1, Math.max(0, Math.floor(point.y / grid.cellSize))),
});
const centerOf = (grid: INavGrid, col: number, row: number): INavPoint => ({ x: (col + 0.5) * grid.cellSize, y: (row + 0.5) * grid.cellSize });
const NEIGHBORS: readonly (readonly [number, number, number])[] = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * 找路：起点 → 终点的世界坐标折线（不含起点、含终点；终点格阻挡 ⇒ null）。直线无阻挡 ⇒ [to]；否则格心 A*（八邻域、对角不穿角、
 * 八分距离启发）并去掉共线中间点。展开超过 maxExpansions ⇒ null。
 */
export function findPath(grid: INavGrid, from: INavPoint, to: INavPoint, options: FindPathOptions = {}): INavPoint[] | null {
    if (grid.blocked(to.x, to.y)) return null;
    if (lineClear(grid, from, to, options.lineStep)) return [{ x: to.x, y: to.y }];
    const maxExpansions = options.maxExpansions ?? NAV_DEFAULT_MAX_EXPANSIONS;
    const start = cellOf(grid, from);
    const goal = cellOf(grid, to);
    const key = (col: number, row: number): number => row * grid.cols + col;
    const blockedCell = (col: number, row: number): boolean => {
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return true;
        const center = centerOf(grid, col, row);
        return grid.blocked(center.x, center.y);
    };
    const heuristic = (col: number, row: number): number => {
        const dc = Math.abs(col - goal.col);
        const dr = Math.abs(row - goal.row);
        return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
    };
    const gScore = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const open: { key: number; col: number; row: number; f: number }[] = [];
    const startKey = key(start.col, start.row);
    gScore.set(startKey, 0);
    open.push({ key: startKey, col: start.col, row: start.row, f: heuristic(start.col, start.row) });
    const closed = new Set<number>();
    let expansions = 0;
    while (open.length > 0) {
        // 确定性：f 最小、再 key 最小
        let bestIndex = 0;
        for (let index = 1; index < open.length; index += 1) {
            const candidate = open[index]!;
            const best = open[bestIndex]!;
            if (candidate.f < best.f || (candidate.f === best.f && candidate.key < best.key)) bestIndex = index;
        }
        const current = open.splice(bestIndex, 1)[0]!;
        if (closed.has(current.key)) continue;
        closed.add(current.key);
        expansions += 1;
        if (expansions > maxExpansions) return null;
        if (current.col === goal.col && current.row === goal.row) {
            const cells: { col: number; row: number }[] = [];
            let cursor = current.key;
            while (cursor !== startKey) {
                cells.push({ col: cursor % grid.cols, row: Math.floor(cursor / grid.cols) });
                cursor = cameFrom.get(cursor)!;
            }
            cells.reverse();
            const points: INavPoint[] = cells.map((cell) => centerOf(grid, cell.col, cell.row));
            if (points.length > 0) points[points.length - 1] = { x: to.x, y: to.y };
            else points.push({ x: to.x, y: to.y });
            return simplify(points);
        }
        const currentG = gScore.get(current.key) ?? 0;
        for (const [dc, dr, cost] of NEIGHBORS) {
            const col = current.col + dc;
            const row = current.row + dr;
            if (blockedCell(col, row)) continue;
            if (dc !== 0 && dr !== 0 && (blockedCell(current.col + dc, current.row) || blockedCell(current.col, current.row + dr))) continue; // 不穿角
            const nextKey = key(col, row);
            if (closed.has(nextKey)) continue;
            const tentative = currentG + cost;
            if (tentative < (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
                gScore.set(nextKey, tentative);
                cameFrom.set(nextKey, current.key);
                open.push({ key: nextKey, col, row, f: tentative + heuristic(col, row) });
            }
        }
    }
    return null;
}

/** 去掉共线的中间点（三点共线即删中间）。 */
function simplify(points: readonly INavPoint[]): INavPoint[] {
    if (points.length <= 2) return [...points];
    const out: INavPoint[] = [points[0]!];
    for (let index = 1; index < points.length - 1; index += 1) {
        const previous = out[out.length - 1]!;
        const current = points[index]!;
        const next = points[index + 1]!;
        const cross = (current.x - previous.x) * (next.y - current.y) - (current.y - previous.y) * (next.x - current.x);
        if (Math.abs(cross) > 1e-9) out.push(current);
    }
    out.push(points[points.length - 1]!);
    return out;
}
