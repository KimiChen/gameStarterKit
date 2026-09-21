/**
 * 铜币收益逻辑（纯 TS，无头单测）：在线心跳节拍、弹窗文案与错误翻译。
 * 渲染归 ../view/IncomePopupView.ts；⛔ 不 import cc。
 *
 * 服务端规则（`apps/serverNew/server/src/modules/income/IncomeLedger.ts`）：
 *  - 每 5 秒 `100 × 等级^1.1`；
 *  - 离线收益只在登录时**算好暂存**，必须客户端显式请求才入账。
 *
 * 错误分支只按 `RpcError.code` 分派（客户端本地码 CONN_LOST/TIMEOUT 与 income 域错误码），
 * ⛔ 不解析错误文案。新服务认证时必定初始化收益账户，因此不把缺档当成客户端停用条件。
 */
import type {
    IIncomeGetPendingRes,
    IIncomeSettleOnlineRes,
} from "../../../shared/protocol/lobbyRpc/domains/income";
import type { IncomeRuntime } from "./incomeRuntime";

/** 与 `IncomeLedger.INTERVAL_SECONDS` 同一条节拍（服务端仍是唯一真源，这里只决定轮询频率）。 */
export const POLL_INTERVAL_SECONDS = 5;

export type IncomeNoticeKind = "idle" | "success" | "error";

export interface IncomeNotice {
    readonly kind: IncomeNoticeKind;
    readonly text: string;
}

export interface IOfflinePreview {
    readonly seconds: number;
    readonly copper: number;
}

const IDLE: IncomeNotice = { kind: "idle", text: "" };
const NOT_READY: IncomeNotice = { kind: "error", text: "铜币收益未就绪（plugin 未装载）" };

function errorCodeOf(error: unknown): string | null {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

export function describeIncomeError(error: unknown): string {
    const code = errorCodeOf(error);
    switch (code) {
        case "CONN_LOST":
        case "TIMEOUT": return "网络不可用，稍后自动重试";
        default: return code ? `铜币收益请求失败（${code}）` : "铜币收益请求失败";
    }
}

/** 秒数 → 「2 分 5 秒」；不足一分钟只报秒。 */
export function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    if (minutes <= 0) return `${rest} 秒`;
    if (rest === 0) return `${minutes} 分`;
    return `${minutes} 分 ${rest} 秒`;
}

/** 离线收益弹窗正文（等级/周期/合计三个数都来自服务端快照）。 */
export function offlinePopupText(snapshot: IIncomeGetPendingRes): string {
    const preview = { seconds: snapshot.offlineSeconds, copper: snapshot.offlineCopper };
    return `你离线了 ${formatDuration(preview.seconds)}，`
        + `按 ${snapshot.level} 级每 ${snapshot.intervalSeconds} 秒 ${snapshot.perInterval} 铜币计算，`
        + `共获得 ${preview.copper} 铜币。`;
}

export class IncomeLogic {
    /** 任一可见状态变化后的重绘通知（View 接线）。 */
    onChanged: () => void = () => {};

    private snapshot: IIncomeGetPendingRes | null = null;
    private busy = false;
    private notice: IncomeNotice;
    /** 距下一次在线心跳的累计秒数（帧回调喂入）。 */
    private elapsed = 0;

    constructor(private readonly runtime: IncomeRuntime | null) {
        this.notice = runtime ? IDLE : NOT_READY;
    }

    isReady(): boolean { return this.runtime !== null; }
    isBusy(): boolean { return this.busy; }
    currentNotice(): IncomeNotice { return this.notice; }
    snapshotOf(): IIncomeGetPendingRes | null { return this.snapshot; }

    /** 待领离线收益（快照未到位时是 0/0，⛔ 不猜）。 */
    pendingOffline(): IOfflinePreview {
        const snapshot = this.snapshot;
        return { seconds: snapshot?.offlineSeconds ?? 0, copper: snapshot?.offlineCopper ?? 0 };
    }

    hasOffline(): boolean { return this.pendingOffline().copper > 0; }

    balance(): number { return this.snapshot?.copper ?? 0; }

    /** 可领取 = 已装载 + 不在途 + 服务端确实有暂存待领。 */
    canClaim(): boolean {
        return this.runtime !== null && !this.busy && this.hasOffline();
    }

    /** 弹窗是否应该出现（自动弹窗与手动入口共用的判据）。 */
    shouldPopup(): boolean {
        return this.runtime !== null && this.hasOffline();
    }

    title(): string { return "离线收益"; }

    body(): string {
        const snapshot = this.snapshot;
        if (!snapshot) return "正在查询离线收益…";
        if (!this.hasOffline()) return "当前没有待领取的离线收益。";
        return offlinePopupText(snapshot);
    }

    /** 快照就绪后的余额行；快照未到位时返回空串（View 不渲染该行）。 */
    balanceText(): string {
        const snapshot = this.snapshot;
        if (!snapshot) return "";
        return `当前铜币 ${snapshot.copper} · ${snapshot.level} 级每 ${snapshot.intervalSeconds} 秒 ${snapshot.perInterval}`;
    }

    /** 拉一次只读预览；返回是否拿到快照。 */
    async refresh(): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || this.busy) return false;
        this.busy = true;
        this.onChanged();
        try {
            this.snapshot = await runtime.pending();
            this.notice = IDLE;
            return true;
        } catch (error) {
            this.absorb(error);
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    /** 领取离线收益；返回本次实际入账的铜币（失败与无待领都是 0）。 */
    async claim(): Promise<number> {
        const runtime = this.runtime;
        if (!runtime || !this.canClaim()) return 0;
        this.busy = true;
        this.onChanged();
        try {
            const result = await runtime.claimOffline();
            // 领取后本地立刻对账：待领清零、余额取服务端回执（⛔ 不自己加，避免与服务端口径分叉）。
            if (this.snapshot) {
                this.snapshot = { ...this.snapshot, offlineCopper: 0, offlineSeconds: 0, copper: result.balance };
            }
            this.notice = result.copper > 0
                ? { kind: "success", text: `已领取 ${result.copper} 铜币，当前余额 ${result.balance}` }
                : { kind: "idle", text: "没有待领取的离线收益" };
            return result.copper;
        } catch (error) {
            this.absorb(error);
            return 0;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    /**
     * 帧回调喂节拍（单位：秒）。返回 true 表示「已到 5 秒结算点」——调用方据此发一次
     * `poll()`。⛔ 本方法只判定不发送：View 的事件边界不允许 await，发送由调用方观察。
     */
    tick(dtSeconds: number): boolean {
        if (!this.runtime) return false;
        if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return false;
        this.elapsed += dtSeconds;
        if (this.elapsed < POLL_INTERVAL_SECONDS) return false;
        // 保留余量：宿主 hide 期间会停喂，恢复后不该一次补发多拍（服务端按真实时间算，
        // 客户端多发几拍也不会多给钱，但没必要把请求打成突发）。
        this.elapsed %= POLL_INTERVAL_SECONDS;
        return true;
    }

    /** 在线心跳：把已凑满周期的铜币入账。返回本次入账额（0 = 不足一个周期或失败）。 */
    async poll(): Promise<number> {
        const runtime = this.runtime;
        if (!runtime) return 0;
        try {
            const result: IIncomeSettleOnlineRes = await runtime.settleOnline();
            this.snapshot = this.snapshot
                ? { ...this.snapshot, copper: result.balance }
                : this.snapshot;
            if (result.copper > 0) this.onChanged();
            return result.copper;
        } catch (error) {
            this.absorb(error);
            return 0;
        }
    }

    /** 关闭本 plugin 的 route（确定领取完成 / 无可领取时的关闭）。 */
    close(): void {
        this.runtime?.close();
    }

    /** 把一次失败归位为提示，并广播重绘。 */
    private absorb(error: unknown): void {
        this.notice = { kind: "error", text: describeIncomeError(error) };
        this.onChanged();
    }
}
