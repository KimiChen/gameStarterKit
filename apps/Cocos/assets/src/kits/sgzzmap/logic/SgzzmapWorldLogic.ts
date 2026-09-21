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
    sgzzCellOf, sgzzChunkRectForGridRect, sgzzClampChunkRect, sgzzDecodeCell,
    sgzzGridRectForChunkRect, type ISgzzRect,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_MAX_ZOOM_LEVEL, sgzzZoomRectForCenter, type ISgzzChunkSummary,
} from "../../../shared/kits/sgzzmap/api/chunk/index";
import {
    sgzzEmptyTile, sgzzGridState, type ISgzzTile, type ISgzzViewer, type SgzzGridStateValue,
} from "../../../shared/kits/sgzzmap/api/territory/index";
import type { ISgzzMarch } from "../../../shared/kits/sgzzmap/api/march/index";
import { SgzzCamera } from "./sgzzCamera";
import { SgzzMarchLineTracker } from "./sgzzMarchLines";
import { SgzzBorderSet } from "./sgzzBorder";
import { sgzzAoiMode, sgzzIsNearField, sgzzLayerVisible } from "./sgzzLayers";
import { SgzzViewportStencil } from "./sgzzViewport";
import type { SgzzRuntime } from "./sgzzRuntime";

/** 两次拉取之间的最小间隔（毫秒）。相机每帧都在动，⛔ 不能每帧发。 */
export const SGZZ_READ_INTERVAL_MS = 220;

export interface SgzzSelection {
    readonly row: number;
    readonly col: number;
    readonly tile: ISgzzTile;
    readonly state: SgzzGridStateValue;
    /** 这一格落在近景窗外、正在单独查详情。面板要显示「读取中…」，⛔ 不能显示成无主。 */
    readonly pending: boolean;
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
    /** 拉回来的那一档（画色块要按它算分块形状）。 */
    summaryLevel = 0;
    /** 我的在途行军（v1 只有自己的，见域契约注释）。 */
    marches: readonly ISgzzMarch[] = [];
    readonly marchLines = new SgzzMarchLineTracker();
    viewer: ISgzzViewer = { uid: "", aid: "", leaderUid: "", friendAids: [] };
    /**
     * 我名下任意一块地的 cell，-1 = 一块都没有。
     * ⚠ 服务端现查下发（见域契约 ISgzzViewerWire.home）：225 万格上没有这个入口就**找不回自己的地**。
     */
    home = -1;
    selection: SgzzSelection | null = null;
    notice = "";
    /**
     * 提示的来路。
     * ⚠ 早先 view 轮询一成功就把 notice 清空，结果占领/弃地的结果活不过 220 ms：
     * 真机重放里「操作失败」根本没来得及出现在屏幕上。只有读出来的提示才该被下一次读成功清掉。
     */
    noticeKind: "" | "read" | "act" = "";
    /** 当前已载入的格矩形（近景窗）。窗外的格是**未知**，⛔ 不等于无主。 */
    loadedRect: ISgzzRect | null = null;
    /** 窗内非默认格超了响应上限，已被服务端截断。 */
    truncated = false;
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

    /**
     * 当前视野要拉的近景窗（chunk 单位，已钳在一次请求的上限内）。
     *
     * ⚠ 必须按**屏幕真实可视半径**取并且**对称**收缩。早先的写法是
     * `minRow - half` 而 max 不动、half 又固定为 1，窗口只有 20×20 格且整体偏到相机左上：
     * LOD0 屏幕上四分之三的格没有数据，而客户端把没数据显示成「无主」——
     * 真机重放点哪都说无主，根因就在这里。
     */
    nearRect(): ISgzzRect {
        const centre = this.camera.centreCell();
        const span = this.stencil.spanFor(centre.row);
        const want = sgzzChunkRectForGridRect({
            minRow: centre.row - span.dr, minCol: centre.col - span.dc,
            maxRow: centre.row + span.dr, maxCol: centre.col + span.dc,
        });
        const c = sgzzChunkRectForGridRect({
            minRow: centre.row, minCol: centre.col, maxRow: centre.row, maxCol: centre.col,
        });
        return sgzzClampChunkRect(want, c.minRow, c.minCol, SGZZ_MAX_QUERY_CHUNKS);
    }

    /** 这一格在已载入的窗里吗？窗外是**未知**，⛔ 不能当无主展示。 */
    isLoaded(row: number, col: number): boolean {
        const r = this.loadedRect;
        return r !== null && row >= r.minRow && row <= r.maxRow && col >= r.minCol && col <= r.maxCol;
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
        // 行军线分帧推进：一帧只重建一条，⛔ 不在一帧里把所有线全重算
        if (this.marches.length > 0) {
            this.marchLines.sync(this.marches, this.wantsMarchDetail, this.runtime.now());
            this.marchLines.step(this.marches, this.runtime.now());
        }
        void this.maybeRead();
    }

    /** 近档才画逐格细线。 */
    get wantsMarchDetail(): boolean {
        return sgzzLayerVisible("marchDetail", this.camera.lod);
    }
    /** 这一档要不要画行军线（远到 LOD5 就不画了）。 */
    get wantsMarchLines(): boolean {
        return sgzzLayerVisible("marchLine", this.camera.lod);
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
            // ⚠ 只清掉「读出来的」提示：占领/弃地的结果要留到下一次动作，⛔ 不能被轮询抹掉
            if (this.noticeKind !== "act") { this.notice = ""; this.noticeKind = ""; }
        } catch (error) {
            // 结算积压是预期内的「稍后再试」，⛔ 不当成错误刷屏
            const code = sgzzErrorCode(error);
            this.notice = code === "SGZZMAP_SETTLEMENT_PENDING" ? "正在补算到达事件…"
                : code ? `地图数据读取失败（${code}）` : "地图数据读取失败";
            this.noticeKind = "read";
            this.lastKey = "";   // 允许下一轮重试
        } finally {
            this.inflight = false;
        }
    }

    applyView(res: { rect?: ISgzzRect; truncated?: boolean;
                     viewer: ISgzzViewer & { home?: number };
                     alliances: string[]; owners: { uid: string; alliance: number }[];
                     tiles: { cell: number; owner: number; durability: number; addition: boolean; capturing: number }[];
                     marches?: readonly ISgzzMarch[] }): void {
        this.loadedRect = res.rect ? sgzzGridRectForChunkRect(res.rect) : null;
        this.truncated = res.truncated === true;
        this.viewer = {
            uid: res.viewer.uid, aid: res.viewer.aid,
            leaderUid: res.viewer.leaderUid, friendAids: [...res.viewer.friendAids],
        };
        this.home = typeof res.viewer.home === "number" ? res.viewer.home : -1;
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
        this.marches = res.marches ? [...res.marches] : [];
        this.marchLines.sync(this.marches, this.wantsMarchDetail, this.runtime.now());
        this.rebuildBorders();
        this.revision += 1;
    }

    applyZoom(res: { level?: number; alliances: string[]; chunks: ISgzzChunkSummary[] }): void {
        this.summaryAlliances = [...res.alliances];
        if (typeof res.level === "number") this.summaryLevel = res.level;
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

    /**
     * 点击选格。返回是否真的选中（远档不选格）。
     *
     * ⚠ 窗外的格**不知道**归属：近景窗只盖 SGZZ_MAX_QUERY_CHUNKS 块，LOD ≥ 1 时屏幕比窗大。
     * 这种格标成 pending 并单独查 sgzzmap.tile，⛔ 不能拿默认空格冒充「无主」——那是在撒谎。
     */
    select(row: number, col: number): boolean {
        if (!sgzzIsNearField(this.camera.lod)) return false;
        const known = this.isLoaded(row, col) && !this.truncated;
        const tile = this.tileAt(row, col);
        this.selection = {
            row, col, tile, state: sgzzGridState(tile, this.viewer), pending: !known,
        };
        this.revision += 1;
        if (!known) void this.readTile(row, col);
        return true;
    }

    /** 单格详情补查。代际 + 同格双重围栏：⛔ 旧响应不得盖新选择。 */
    private async readTile(row: number, col: number): Promise<void> {
        const gen = this.generation;
        const cell = sgzzCellOf(row, col);
        try {
            const res = await this.runtime.tile(cell);
            const sel = this.selection;
            if (gen !== this.generation || !sel || sel.row !== row || sel.col !== col) return;
            if (res.tile.ownerUid !== "" || res.tile.capturingAid !== "") this.tiles.set(cell, res.tile);
            else this.tiles.delete(cell);
            this.selection = { row, col, tile: res.tile, state: sgzzGridState(res.tile, this.viewer), pending: false };
            this.revision += 1;
        } catch {
            // 查不到就维持 pending：面板显示「读取中…」，⛔ 不退化成「无主」
        }
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
            this.selection = { ...sel, tile: res.tile, state: sgzzGridState(res.tile, this.viewer), pending: false };
            this.notice = res.outcome === "captured" ? "已占领"
                : res.outcome === "reinforced" ? "已加固" : "已削弱守军";
            this.noticeKind = "act";
            this.revision += 1;
        } catch (error) {
            this.notice = noticeOf(error);
            this.noticeKind = "act";
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
            this.selection = { ...sel, tile: sgzzEmptyTile(cell), state: sgzzGridState(sgzzEmptyTile(cell), this.viewer), pending: false };
            this.notice = "已放弃";
            this.noticeKind = "act";
            this.revision += 1;
        } catch (error) {
            this.notice = noticeOf(error);
            this.noticeKind = "act";
        } finally {
            this.busy = false;
        }
    }

    /** 有没有自己的地可回。没有就只能回地图中心。 */
    get hasHome(): boolean { return this.home >= 0; }

    /**
     * 回到自己的领地；没有地时回地图中心。返回落点。
     *
     * ⚠ 这是 1500×1500 上的**必需**入口而不是锦上添花：关掉页面再进来，视野默认在地图正中，
     * 而自己的地可能在几百格外——没有它就真的找不回去了。
     */
    locateHome(): { row: number; col: number } {
        const at = this.home >= 0
            ? sgzzDecodeCell(this.home)
            : { row: Math.floor(SGZZ_MAP_ROWS / 2), col: Math.floor(SGZZ_MAP_COLS / 2) };
        this.locate(at.row, at.col);
        return at;
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

/**
 * 取客户端错误码。
 * ⚠ 客户端抛的是 `RpcError { code }`（net/WebSocketClient），**⛔ 不是**服务端 `RpcFault` 的
 * `rpcCode` —— 这两个字段名不一样，我一开始照服务端写，结果真机上所有失败都只显示「操作失败」。
 */
export function sgzzErrorCode(error: unknown): string {
    const code = error && typeof error === "object" ? (error as { code?: unknown }).code : null;
    return typeof code === "string" ? code : "";
}

/** 把错误码翻成一句人话。⛔ 不把原始错误直接甩给玩家。 */
export function noticeOf(error: unknown): string {
    switch (sgzzErrorCode(error)) {
        case "SGZZMAP_IMPASSABLE": return "这一格过不去";
        case "SGZZMAP_NOT_ADJACENT": return "必须与自己或同盟的领地相连";
        case "SGZZMAP_TILE_LIMIT": return "已达持地上限";
        case "SGZZMAP_NOT_OWNED": return "这不是你的领地";
        case "SGZZMAP_SETTLEMENT_PENDING": return "正在补算到达事件，请稍后重试";
        case "RATE_LIMITED": return "操作太快了，缓一缓";
        case "TIMEOUT": case "CONN_LOST": return "网络暂不可用，请稍后重试";
        default: {
            // ⚠ 未登记的码也要把码带出来，⛔ 不要让排查的人只看到「操作失败」
            const code = sgzzErrorCode(error);
            return code ? `操作失败（${code}）` : "操作失败";
        }
    }
}
