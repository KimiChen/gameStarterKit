/**
 * 行军线的几何与分帧刷新。⛔ 不碰 cc。
 *
 * 两种表现（照搬原作 armyline_layer_view）：
 *  - **简线**：起点直连终点的一条带；远档也画（LOD ≤ 4）。
 *  - **细线**：沿**逐格展开**的路径逐段画；近档才画（LOD ≤ 2）。
 * 外加一个「部队当前位置」标记，按 sgzzMarchPositionAt 在两格之间插值。
 *
 * ⚠ 逐格展开不便宜（一条 64 步的路要建 64 段）。所以：
 *  - 展开结果**按 marchId 缓存**，⛔ 路径不变不重算；
 *  - 刷新走**分帧游标**（原作 _grid_refresh_cursor 同款），一帧只推一条，
 *    ⛔ 不在一帧里把所有行军线全重建。
 */
import {
    sgzzDecodeCell, sgzzGrid2Pos,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";
import {
    sgzzExpandPath, sgzzMarchPositionAt, sgzzMarchTarget, type ISgzzMarch,
} from "../../../shared/kits/sgzzmap/api/march/index";

export interface SgzzSegment {
    readonly x0: number; readonly y0: number;
    readonly x1: number; readonly y1: number;
}
export interface SgzzMarchVisual {
    readonly marchId: string;
    /** 起点直连终点。 */
    readonly simple: SgzzSegment;
    /** 逐格路径的每一段；近档才用。 */
    readonly detail: readonly SgzzSegment[];
    /** 部队当前世界位置。 */
    readonly head: { readonly x: number; readonly y: number };
    /** 进度 0..1，做淡出/箭头用。 */
    readonly progress: number;
}

function worldOf(cell: number): { x: number; y: number } {
    const { row, col } = sgzzDecodeCell(cell);
    return sgzzGrid2Pos(row, col);
}

/** 单条行军的可视化。⚠ 需要展开逐格路径时才传 withDetail。 */
export function sgzzMarchVisual(march: ISgzzMarch, now: number, withDetail: boolean,
                                cachedPath?: readonly number[]): SgzzMarchVisual {
    const origin = worldOf(march.path[0]);
    const target = worldOf(sgzzMarchTarget(march));
    const pos = sgzzMarchPositionAt(march, now);
    const a = worldOf(pos.cell), b = worldOf(pos.nextCell);
    const head = { x: a.x + (b.x - a.x) * pos.t, y: a.y + (b.y - a.y) * pos.t };

    let detail: SgzzSegment[] = [];
    if (withDetail) {
        const cells = cachedPath ?? sgzzExpandPath(march.path);
        for (let i = 1; i < cells.length; i += 1) {
            const p = worldOf(cells[i - 1]), q = worldOf(cells[i]);
            detail.push({ x0: p.x, y0: p.y, x1: q.x, y1: q.y });
        }
    }
    const total = Math.max(1, march.arriveAt - march.departAt);
    return {
        marchId: march.marchId,
        simple: { x0: origin.x, y0: origin.y, x1: target.x, y1: target.y },
        detail,
        head,
        progress: Math.max(0, Math.min(1, (now - march.departAt) / total)),
    };
}

/**
 * 分帧刷新器：持有展开缓存 + 游标。
 * 每帧调 `step()` 推进**一条**；`visuals()` 随时给出当前全部可视化。
 */
export class SgzzMarchLineTracker {
    private readonly paths = new Map<string, readonly number[]>();
    private readonly cache = new Map<string, SgzzMarchVisual>();
    private cursor = 0;
    private detail = false;
    /** 展开次数，供用例断言「路径不变就⛔不重算」。 */
    expansions = 0;

    /** 换了一批行军：丢掉不在列表里的缓存。⛔ 不要留下已撤回/已到达的线。 */
    sync(marches: readonly ISgzzMarch[], withDetail: boolean, now: number): void {
        const live = new Set(marches.map((m) => m.marchId));
        for (const id of [...this.cache.keys()]) if (!live.has(id)) this.cache.delete(id);
        for (const id of [...this.paths.keys()]) if (!live.has(id)) this.paths.delete(id);
        if (withDetail !== this.detail) {
            this.detail = withDetail;
            this.cache.clear();          // 档位变了，细线有无要整体换
        }
        for (const m of marches) {
            if (!this.cache.has(m.marchId)) this.rebuild(m, now);
        }
        if (this.cursor >= marches.length) this.cursor = 0;
    }

    /** 每帧推进一条（分帧摊平）。返回这一帧重建的 marchId。 */
    step(marches: readonly ISgzzMarch[], now: number): string | null {
        if (marches.length === 0) return null;
        const m = marches[this.cursor % marches.length];
        this.cursor = (this.cursor + 1) % marches.length;
        this.rebuild(m, now);
        return m.marchId;
    }

    private rebuild(march: ISgzzMarch, now: number): void {
        let path = this.paths.get(march.marchId);
        if (!path && this.detail) {
            path = sgzzExpandPath(march.path);
            this.expansions += 1;
            this.paths.set(march.marchId, path);
        }
        this.cache.set(march.marchId, sgzzMarchVisual(march, now, this.detail, path));
    }

    visuals(): SgzzMarchVisual[] {
        return [...this.cache.values()].sort((a, b) => a.marchId.localeCompare(b.marchId));
    }
    clear(): void { this.cache.clear(); this.paths.clear(); this.cursor = 0; }
    get size(): number { return this.cache.size; }
}
