/**
 * 竞技场棋盘页逻辑（纯 TS，无头单测）：加载棋盘 → 展示模型（经本 kit 的 client board / ranking 面）→ 点格占领
 * （在途闸 + 宿主就绪闸）→ 结果 / 错误翻译为一行提示。渲染归 ../view/ArenaBoardView.ts；⛔ 不 import cc。
 *
 * 错误分支只按 RpcError.code 分派（客户端本地码 CONN_LOST/TIMEOUT 与 arena 域错误码），⛔ 不解析错误文案。
 */
import { type ArenaTileView, type IArenaTile, describeBoard } from "../api/board/index";
import { formatRanking } from "../api/ranking/index";
import type { ArenaRuntime } from "./arenaRuntime";

export type ArenaNoticeKind = "idle" | "success" | "error";

export interface ArenaNotice {
    readonly kind: ArenaNoticeKind;
    readonly text: string;
}

const IDLE: ArenaNotice = { kind: "idle", text: "点一格占领；敌格每次尝试削它 1 点守备" };
const NOT_READY: ArenaNotice = { kind: "error", text: "竞技场未就绪（kit 未装载）" };

function errorCodeOf(error: unknown): string | null {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

export function describeArenaError(error: unknown): string {
    const code = errorCodeOf(error);
    switch (code) {
        case "ARENA_TILE_TAKEN": return "这格还有守备，再试几次就能夺下";
        case "CONN_LOST":
        case "TIMEOUT": return "网络不可用，稍后重试（已发出的占领不会重复）";
        default: return code ? `操作失败（${code}）` : "操作失败，请稍后重试";
    }
}

export class ArenaBoardLogic {
    /** 任一可见状态变化后的重绘通知（View 接线）。 */
    onChanged: () => void = () => {};

    private tiles: IArenaTile[] = [];
    private trophies = 0;
    private loaded = false;
    private busy = false;
    private notice: ArenaNotice;

    constructor(private readonly runtime: ArenaRuntime | null) {
        this.notice = runtime ? IDLE : NOT_READY;
    }

    isReady(): boolean { return this.runtime !== null; }
    isBusy(): boolean { return this.busy; }
    isLoaded(): boolean { return this.loaded; }
    myTrophies(): number { return this.trophies; }
    currentNotice(): ArenaNotice { return this.notice; }
    board(): ArenaTileView[] { return describeBoard(this.tiles, this.runtime?.selfUid() ?? ""); }
    ranking(): string[] { return formatRanking(this.tiles, this.runtime?.selfUid() ?? ""); }

    canCapture(tile: number): boolean {
        if (this.runtime === null || this.busy || !this.loaded) return false;
        const view = this.board().find((item) => item.tile === tile);
        return view !== undefined && view.capturable;
    }

    /** 加载 / 刷新棋盘：返回是否成功（失败写提示，保留旧棋盘）。`keepNotice` = 刷新失败也不覆盖当前提示。 */
    async refresh(keepNotice = false): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || this.busy) return false;
        this.busy = true;
        this.onChanged();
        try {
            const result = await runtime.board();
            this.tiles = result.tiles;
            this.trophies = result.myTrophies;
            this.loaded = true;
            return true;
        } catch (error) {
            if (!keepNotice) this.notice = { kind: "error", text: describeArenaError(error) };
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    /**
     * 占领一格：返回是否成功。不满足闸时 no-op 返回 false（⛔ 不排队第二次写）。
     * 成功或 ARENA_TILE_TAKEN（敌格已被削 1 守备）后都重读整张棋盘，提示保留。
     */
    async capture(tile: number): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || !this.canCapture(tile)) return false;
        const label = this.board().find((item) => item.tile === tile)?.label ?? String(tile);
        this.busy = true;
        this.onChanged();
        let boardChanged = false;
        let ok = false;
        try {
            const result = await runtime.capture(tile);
            this.trophies = result.trophies;
            this.notice = { kind: "success", text: `${label} 已占领 · 守备 ${result.power} · 奖杯 ${result.trophies}` };
            // 成功响应（含回执重放）⇒ 该格主人必是本人（taken 走错误分支）：先本地落一笔，随后整张重读校正
            this.tiles = this.tiles.map((item) => (item.tile === tile ? { tile, ownerUid: runtime.selfUid(), power: result.power } : item));
            boardChanged = true;
            ok = true;
        } catch (error) {
            this.notice = { kind: "error", text: describeArenaError(error) };
            boardChanged = errorCodeOf(error) === "ARENA_TILE_TAKEN";
        } finally {
            this.busy = false;
            this.onChanged();
        }
        if (boardChanged) await this.refresh(true);
        return ok;
    }

    close(): void {
        this.runtime?.close();
    }
}
