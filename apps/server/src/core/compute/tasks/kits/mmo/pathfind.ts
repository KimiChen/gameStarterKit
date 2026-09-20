/**
 * compute 任务（MMO MK2-B2 可选下沉）：mmo kit 的 nav 网格 A*，纯函数、确定性、⛔ IO；输入 / 输出可 structuredClone
 * （位图字符串 + 尺寸 + 起终点）。组合根用 `runInPool("kits/mmo/pathfind", input)` 实现 `PathfinderPort`（kit 目录 ⛔ import compute）。
 * 任务级 admission：位图长度必须 = cols × rows、展开上限收口到 NAV_DEFAULT_MAX_EXPANSIONS。
 */
import { NAV_DEFAULT_MAX_EXPANSIONS, findPath, type INavPoint } from "@game/shared/kits/mmo/api/ai/index";

export interface IMmoPathfindInput {
    readonly cellSize: number;
    readonly cols: number;
    readonly rows: number;
    /** '0' 通行 / '1' 阻挡，行优先 */
    readonly bitmap: string;
    readonly from: INavPoint;
    readonly to: INavPoint;
    readonly maxExpansions?: number;
}

export interface IMmoPathfindResult {
    readonly path: readonly INavPoint[] | null;
}

export default function pathfind(input: IMmoPathfindInput): IMmoPathfindResult {
    const { cellSize, cols, rows, bitmap } = input;
    if (!Number.isFinite(cellSize) || cellSize <= 0 || !Number.isSafeInteger(cols) || !Number.isSafeInteger(rows) || cols < 1 || rows < 1) throw new RangeError("pathfind：网格尺寸非法");
    if (typeof bitmap !== "string" || bitmap.length !== cols * rows) throw new RangeError("pathfind：位图长度 ≠ cols × rows");
    const maxExpansions = Math.min(NAV_DEFAULT_MAX_EXPANSIONS, Math.max(1, Math.floor(input.maxExpansions ?? NAV_DEFAULT_MAX_EXPANSIONS)));
    const grid = {
        cellSize, cols, rows,
        blocked: (x: number, y: number): boolean => {
            const col = Math.min(cols - 1, Math.max(0, Math.floor(x / cellSize)));
            const row = Math.min(rows - 1, Math.max(0, Math.floor(y / cellSize)));
            return bitmap.charCodeAt(row * cols + col) === 49;
        },
    };
    return { path: findPath(grid, input.from, input.to, { maxExpansions }) };
}
