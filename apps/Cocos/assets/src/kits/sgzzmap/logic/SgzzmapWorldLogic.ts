/**
 * 大地图页的页模型：相机 → 可视格 → 拉数据 → 渲染模型。⛔ 不碰 cc。
 *
 * 拉数据的纪律（抄 slg 的 SlgMapLogic，坑一样）：
 *  - **代际围栏**：每次发请求带一个 generation，回来时对不上就整批丢弃
 *    （⛔ 否则快速平移时旧响应会把新视野覆盖掉）；
 *  - **节流**：相机每帧都在动，⛔ 不能每帧发请求；
 *  - 远档（LOD ≥ 4）改拉分块摘要，⛔ 不再逐格。
 */
import {
    SGZZ_BIRDVIEW_LOD, SGZZ_MAP_COLS, SGZZ_MAP_ROWS, SGZZ_MAX_QUERY_CHUNKS,
    sgzzCellOf, sgzzChunkRectForGridRect, sgzzDecodeCell, type ISgzzRect,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_MAX_ZOOM_LEVEL, sgzzZoomRectForCenter, type ISgzzChunkSummary,
} from "../../../shared/kits/sgzzmap/api/chunk/index";
import {
    sgzzEmptyTile, sgzzGridState, type ISgzzTile, type ISgzzViewer, type SgzzGridStateValue,
} from "../../../shared/kits/sgzzmap/api/territory/index";
import { SgzzCamera } from "./sgzzCamera";
import { SgzzBorderSet } from "./sgzzBorder";
import { sgzzAoiMode, sgzzIsNearField } from "./sgzzLayers";
import { SgzzViewportStencil } from "./sgzzViewport";
import type { SgzzRuntime } from "./sgzzRuntime";

/** 两次拉取之间的最小间隔（毫秒）。相机每帧都在动，⛔ 不能每帧发。 */
export const SGZZ_READ_INTERVAL_MS = 220;

export interface SgzzSelection {
    readonly row: number;
    readonly col: number;
    readonly tile: ISgzzTile;
    readonly state: SgzzGridStateValue;
}

export class SgzzmapWorldLogic {
    readonly camera: SgzzCamera;
    readonly stencil = new SgzzViewportStencil();
    readonly borders = new SgzzBorderSet();
    /** cell → 非默认地块。缺 key 即默认无主格。 */
    readonly tiles = new Map<number, ISgzzTile>();
    /** 远档分块摘要，key = chunk key。 */
    readonly summaries = new Map<number, ISgzzChunkSummary>();
    summaryAlliances: readonly string[] = [];
    viewer: ISgzzViewer = { uid: "", aid: "", leaderUid: "", friendAids: [] };
    selection: SgzzSelection | null = null;
    notice = "";
    busy = false;
    /** 渲染层据此判断要不要重建 mesh。 */
    revision = 0;

    private generation = 0;
    private lastReadAt = 0;
    private lastKey = "";
    private inflight = false;

    constructor(private readonly runtime: SgzzRuntime, width: number, height: number) {
        this.camera = new SgzzCamera(width, height);
        this.viewer = { uid: runtime.selfUid(), aid: "", leaderUid: "", friendAids: [] };
    }

    tileAt(row: number, col: number): ISgzzTile {
        const cell = sgzzCellOf(row, col);
        return this.tiles.get(cell) ?? sgzzEmptyTile(cell);
    }
    stateAt(row: number, col: number): SgzzGridStateValue {
        return sgzzGridState(this.tileAt(row, col), this.viewer);
    }

    /** 当前视野要拉的近景窗（chunk 单位，已钳在一次请求的上限内）。 */
    nearRect(): ISgzzRect {
        const centre = this.camera.centreCell();
        const half = Math.max(0, Math.floor(Math.sqrt(SGZZ_MAX_QUERY_CHUNKS) / 2));
        const rect = sgzzChunkRectForGridRect({
            minRow: centre.row, minCol: centre.col, maxRow: centre.row, maxCol: centre.col,
        });
        return {
            minRow: Math.max(0, rect.minRow - half), minCol: Math.max(0, rect.minCol - half),
            maxRow: rect.maxRow, maxCol: rect.maxCol,
        };
    }
    /** 远档要拉的分块窗。 */
    farRect(): { level: number; rect: ISgzzRect } {
        const centre = this.camera.centreCell();
        const level = Math.min(SGZZ_MAX_ZOOM_LEVEL, this.camera.lod - SGZZ_BIRDVIEW_LOD + 1);
        return { level, rect: sgzzZoomRectForCenter(level, centre.row, centre.col, 6) };
    }

    /** 每帧调用：推进惯性、刷新可视模板、必要时拉数据。 */
    update(dt: number): void {
        this.camera.step(dt);
        this.stencil.refresh(this.camera.scale, this.camera.width, this.camera.height);
        void this.maybeRead();
    }

    private async maybeRead(): Promise<void> {
        if (this.inflight) return;
        const now = this.runtime.now();
        if (now - this.lastReadAt < SGZZ_READ_INTERVAL_MS) return;
        const mode = sgzzAoiMode(this.camera.lod);
        const key = mode === "detail"
            ? `d:${JSON.stringify(this.nearRect())}`
            : `s:${JSON.stringify(this.farRect())}`;
        if (key === this.lastKey) return;

        this.lastReadAt = now;
        this.lastKey = key;
        this.generation += 1;
        const gen = this.generation;
        this.inflight = true;
        try {
            if (mode === "detail") {
                const res = await this.runtime.view(this.nearRect());
                if (gen !== this.generation) return;   // ★ 代际围栏：旧响应⛔不得覆盖新视野
                this.applyView(res);
            } else {
                const { level, rect } = this.farRect();
                const res = await this.runtime.zoom(level, rect);
                if (gen !== this.generation) return;
                this.applyZoom(res);
            }
            this.notice = "";
        } catch (error) {
            // 结算积压是预期内的「稍后再试」，⛔ 不当成错误刷屏
            const code = (error as { rpcCode?: string } | null)?.rpcCode;
            this.notice = code === "SGZZMAP_SETTLEMENT_PENDING" ? "正在补算到达事件…" : "地图数据读取失败";
            this.lastKey = "";   // 允许下一轮重试
        } finally {
            this.inflight = false;
        }
    }

    applyView(res: { viewer: ISgzzViewer; alliances: string[]; owners: { uid: string; alliance: number }[];
                     tiles: { cell: number; owner: number; durability: number; addition: boolean; capturing: number }[] }): void {
        this.viewer = {
            uid: res.viewer.uid, aid: res.viewer.aid,
            leaderUid: res.viewer.leaderUid, friendAids: [...res.viewer.friendAids],
        };
        this.tiles.clear();
        for (const ref of res.tiles) {
            const owner = ref.owner >= 0 ? res.owners[ref.owner] : null;
            this.tiles.set(ref.cell, {
                cell: ref.cell,
                ownerUid: owner?.uid ?? "",
                ownerAid: owner && owner.alliance >= 0 ? res.alliances[owner.alliance] : "",
                durability: ref.durability,
                addition: ref.addition,
                capturingAid: ref.capturing >= 0 ? res.alliances[ref.capturing] : "",
            });
        }
        this.rebuildBorders();
        this.revision += 1;
    }

    applyZoom(res: { alliances: string[]; chunks: ISgzzChunkSummary[] }): void {
        this.summaryAlliances = [...res.alliances];
        this.summaries.clear();
        for (const c of res.chunks) this.summaries.set(c.key, c);
        this.revision += 1;
    }

    /** 我方（含同盟）领地的描边集合。 */
    private rebuildBorders(): void {
        this.borders.clear();
        for (const tile of this.tiles.values()) {
            if (tile.ownerUid === "") continue;
            const mine = tile.ownerUid === this.viewer.uid
                || (this.viewer.aid !== "" && tile.ownerAid === this.viewer.aid);
            if (mine) {
                const { row, col } = sgzzDecodeCell(tile.cell);
                this.borders.add(row, col);
            }
        }
    }

    /** 点击选格。返回是否真的选中（远档不选格）。 */
    select(row: number, col: number): boolean {
        if (!sgzzIsNearField(this.camera.lod)) return false;
        const tile = this.tileAt(row, col);
        this.selection = { row, col, tile, state: sgzzGridState(tile, this.viewer) };
        this.revision += 1;
        return true;
    }
    clearSelection(): void {
        if (!this.selection) return;
        this.selection = null;
        this.revision += 1;
    }

    async occupySelected(): Promise<void> {
        const sel = this.selection;
        if (!sel || this.busy) return;
        this.busy = true;
        try {
            const res = await this.runtime.occupy(sgzzCellOf(sel.row, sel.col));
            this.tiles.set(res.tile.cell, res.tile);
            this.rebuildBorders();
            this.selection = { ...sel, tile: res.tile, state: sgzzGridState(res.tile, this.viewer) };
            this.notice = res.outcome === "captured" ? "已占领"
                : res.outcome === "reinforced" ? "已加固" : "已削弱守军";
            this.revision += 1;
        } catch (error) {
            this.notice = noticeOf(error);
        } finally {
            this.busy = false;
        }
    }

    async abandonSelected(): Promise<void> {
        const sel = this.selection;
        if (!sel || this.busy) return;
        this.busy = true;
        try {
            const cell = sgzzCellOf(sel.row, sel.col);
            await this.runtime.abandon(cell);
            this.tiles.delete(cell);
            this.rebuildBorders();
            this.selection = { ...sel, tile: sgzzEmptyTile(cell), state: sgzzGridState(sgzzEmptyTile(cell), this.viewer) };
            this.notice = "已放弃";
            this.revision += 1;
        } catch (error) {
            this.notice = noticeOf(error);
        } finally {
            this.busy = false;
        }
    }

    /** 跳转到坐标（缩略图/搜索用）。 */
    locate(row: number, col: number): void {
        this.camera.locate(row, col);
        this.lastKey = "";   // 跳转后必须重拉
        this.revision += 1;
    }

    get mapRows(): number { return SGZZ_MAP_ROWS; }
    get mapCols(): number { return SGZZ_MAP_COLS; }
}

/** 把服务端错误码翻成一句人话。⛔ 不把原始错误直接甩给玩家。 */
export function noticeOf(error: unknown): string {
    const code = (error as { rpcCode?: string } | null)?.rpcCode ?? "";
    switch (code) {
        case "SGZZMAP_IMPASSABLE": return "这一格过不去";
        case "SGZZMAP_NOT_ADJACENT": return "必须与自己或同盟的领地相连";
        case "SGZZMAP_TILE_LIMIT": return "已达持地上限";
        case "SGZZMAP_NOT_OWNED": return "这不是你的领地";
        case "SGZZMAP_SETTLEMENT_PENDING": return "正在补算到达事件，请稍后重试";
        case "RATE_LIMITED": return "操作太快了，缓一缓";
        default: return "操作失败";
    }
}
