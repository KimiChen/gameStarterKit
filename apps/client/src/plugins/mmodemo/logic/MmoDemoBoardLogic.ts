/**
 * 头狼战报逻辑（MG1-B2；纯 TS，无头单测）：加载本插件自有域 `mmodemo.bossBoard`（demoVale 各分线最新检查点里的编排 durable var bossKills）
 * → 行视图（分线序号 + 实例 id 末 6 位 / 检查点 rev / 分线运行时长 / 击杀）+ 合计 + 一行提示。渲染归 ../view/MmoDemoBoardView.ts；⛔ 不 import cc。
 * 插件只 import shared 域文件与框架 shared 常量（⛔ kit 内部模块；本页不需要 kit 的 client 面）。错误只按 RpcError.code 分派，⛔ 不解析错误文案。
 */
import { TICK_MS } from "../../../shared/constants/game";
import { MMO_DEMO_MAP_ID, type IMmoDemoBossBoardLine, type IMmoDemoBossBoardRes } from "../../../shared/protocol/lobbyRpc/domains/mmodemo";
import type { MmoDemoRuntime } from "./mmoDemoRuntime";

export type MmoDemoBoardNoticeKind = "idle" | "success" | "error";

export interface MmoDemoBoardNotice {
    readonly kind: MmoDemoBoardNoticeKind;
    readonly text: string;
}

export interface MmoDemoBoardRow {
    readonly instanceId: string;
    /** 「分线 n · …末 6 位」 */
    readonly label: string;
    readonly rev: number;
    /** 分线运行时长（tick × 固定步）；尚无检查点 ⇒ 「尚无检查点」 */
    readonly uptime: string;
    readonly bossKills: number;
}

const IDLE: MmoDemoBoardNotice = { kind: "idle", text: `${MMO_DEMO_MAP_ID} 各分线的头狼击杀（每个分线检查点刷新一次）` };
const NOT_READY: MmoDemoBoardNotice = { kind: "error", text: "头狼战报未就绪（plugin 未装载）" };

function errorCodeOf(error: unknown): string | null {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

export function describeMmoDemoError(error: unknown): string {
    const code = errorCodeOf(error);
    switch (code) {
        case "CONN_LOST":
        case "TIMEOUT": return "网络不可用，稍后刷新";
        default: return code ? `读取失败（${code}）` : "读取失败，请稍后重试";
    }
}

/** 分线运行时长文案：tick × TICK_MS → 「Xh Ym」/「Ym Zs」/「Zs」；tick 0 ⇒ 「尚无检查点」。 */
export function formatUptime(tick: number, stepMs = TICK_MS): string {
    if (!Number.isFinite(tick) || tick <= 0) return "尚无检查点";
    const seconds = Math.floor((tick * stepMs) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

export function formatLineLabel(instanceId: string, index: number): string {
    return `分线 ${index + 1} · …${instanceId.slice(-6)}`;
}

export function rowOf(line: IMmoDemoBossBoardLine, index: number): MmoDemoBoardRow {
    return { instanceId: line.instanceId, label: formatLineLabel(line.instanceId, index), rev: line.rev, uptime: formatUptime(line.tick), bossKills: line.bossKills };
}

export class MmoDemoBoardLogic {
    /** 任一可见状态变化后的重绘通知（View 接线）。 */
    onChanged: () => void = () => {};

    private board: IMmoDemoBossBoardRes | null = null;
    private busy = false;
    private notice: MmoDemoBoardNotice;

    constructor(private readonly runtime: MmoDemoRuntime | null) {
        this.notice = runtime ? IDLE : NOT_READY;
    }

    isReady(): boolean { return this.runtime !== null; }
    isBusy(): boolean { return this.busy; }
    isLoaded(): boolean { return this.board !== null; }
    currentNotice(): MmoDemoBoardNotice { return this.notice; }
    mapId(): string { return this.board?.mapId ?? MMO_DEMO_MAP_ID; }
    /** 击杀降序，同分按分线序（服务端 instance_id 序）。 */
    rows(): MmoDemoBoardRow[] {
        const lines = this.board?.lines ?? [];
        return lines.map(rowOf).sort((left, right) => right.bossKills - left.bossKills || left.label.localeCompare(right.label));
    }
    totalKills(): number { return this.board?.totalKills ?? 0; }

    /** 加载 / 刷新战报：返回是否成功（失败写提示，保留旧数据）。 */
    async refresh(): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || this.busy) return false;
        this.busy = true;
        this.onChanged();
        try {
            this.board = await runtime.bossBoard();
            this.notice = this.board.lines.length === 0 ? { kind: "success", text: `${this.board.mapId} 还没有开过分线` } : { kind: "success", text: `已刷新：${this.board.lines.length} 条分线，合计击杀 ${this.board.totalKills}` };
            return true;
        } catch (error) {
            this.notice = { kind: "error", text: describeMmoDemoError(error) };
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    close(): void {
        this.runtime?.close();
    }
}
