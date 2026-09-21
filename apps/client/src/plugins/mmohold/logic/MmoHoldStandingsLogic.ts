/** 据点战比分页：当前轮次检查点，刷新失败保留上一份数据。纯 TS，UI 与宿主经 port 接入。 */
import {
    MMO_HOLD_MAP_ID, type IMmoHoldStandingsRes, type MmoHoldOwner, type MmoHoldScores,
} from "../../../shared/protocol/lobbyRpc/domains/mmohold";
import type { MmoHoldRuntime } from "./mmoHoldRuntime";

export interface MmoHoldStandingsRow {
    readonly instanceId: string;
    readonly label: string;
    readonly checkpoint: string;
    readonly scores: MmoHoldScores;
    readonly ownership: string;
    readonly leader: MmoHoldOwner;
}
export interface MmoHoldStandingsNotice { readonly kind: "idle" | "success" | "error"; readonly text: string }
/** 每页三行，64 条分线全部可访问；留出竖屏角色入口。 */
export const MMO_HOLD_STANDINGS_PAGE_SIZE = 3;

export function describeHoldOwner(owner: MmoHoldOwner): string {
    return owner === "dawn" ? "曙光" : owner === "dusk" ? "暮光" : "中立";
}
export function describeStandingsError(error: unknown): string {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
    if (code === "TIMEOUT" || code === "CONN_LOST") return "网络不可用，稍后刷新";
    return typeof code === "string" ? `读取失败（${code}）` : "读取失败，请稍后重试";
}

export class MmoHoldStandingsLogic {
    onChanged: () => void = () => {};
    private board: IMmoHoldStandingsRes | null = null;
    private busy = false;
    private page = 0;
    private notice: MmoHoldStandingsNotice;

    constructor(private readonly runtime: MmoHoldRuntime | null) {
        this.notice = runtime ? { kind: "idle", text: "各分线当前轮次比分，随检查点刷新" } : { kind: "error", text: "据点战比分未就绪" };
    }
    isReady(): boolean { return this.runtime !== null; }
    isBusy(): boolean { return this.busy; }
    isLoaded(): boolean { return this.board !== null; }
    currentNotice(): MmoHoldStandingsNotice { return this.notice; }
    emptyText(): string {
        if (this.board) return "尚无分线战况";
        if (this.busy) return "读取战况中…";
        return this.notice.kind === "error" ? "战况暂不可用，请刷新重试" : "等待加载战况…";
    }
    mapId(): string { return this.board?.mapId ?? MMO_HOLD_MAP_ID; }
    totalScores(): MmoHoldScores { return this.board?.totalScores ?? { dawn: 0, dusk: 0 }; }
    pageIndex(): number { return this.page; }
    pageCount(): number { return Math.max(1, Math.ceil((this.board?.lines.length ?? 0) / MMO_HOLD_STANDINGS_PAGE_SIZE)); }
    rows(): MmoHoldStandingsRow[] {
        return (this.board?.lines ?? []).slice(this.page * MMO_HOLD_STANDINGS_PAGE_SIZE, (this.page + 1) * MMO_HOLD_STANDINGS_PAGE_SIZE).map((line, index) => ({
            instanceId: line.instanceId,
            label: `分线 ${this.page * MMO_HOLD_STANDINGS_PAGE_SIZE + index + 1} · …${line.instanceId.slice(-6)}`,
            checkpoint: line.rev === 0 ? "尚无检查点" : `检查点 ${line.rev} · tick ${line.tick}`,
            scores: line.scores,
            ownership: `A ${describeHoldOwner(line.owners.pointA)} · B ${describeHoldOwner(line.owners.pointB)}`,
            leader: line.scores.dawn > line.scores.dusk ? "dawn" : line.scores.dusk > line.scores.dawn ? "dusk" : "neutral",
        }));
    }
    movePage(delta: number): void {
        if (!Number.isInteger(delta)) return;
        const next = Math.max(0, Math.min(this.pageCount() - 1, this.page + delta));
        if (next !== this.page) { this.page = next; this.onChanged(); }
    }
    async refresh(): Promise<boolean> {
        if (!this.runtime || this.busy) return false;
        this.busy = true;
        this.onChanged();
        try {
            this.board = await this.runtime.standings();
            this.page = Math.min(this.page, this.pageCount() - 1);
            this.notice = { kind: "success", text: this.board.lines.length ? `已刷新 ${this.board.lines.length} 条分线；当前轮次检查点比分` : "holdRidge 还没有开过分线" };
            return true;
        } catch (error) {
            this.notice = { kind: "error", text: describeStandingsError(error) };
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }
    close(): void { this.runtime?.close(); }
}
