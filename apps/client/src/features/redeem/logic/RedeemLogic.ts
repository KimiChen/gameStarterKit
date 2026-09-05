/**
 * 兑换码面板逻辑（纯 TS，无头单测）：输入规范化（trim + 大写）、提交闸（格式 + 在途 +
 * 宿主就绪）、结果/错误翻译为一行提示。渲染归 ../view/RedeemView.ts；⛔ 不 import cc。
 *
 * 错误分支只按 RpcError.code 分派（客户端本地码 CONN_LOST/TIMEOUT 与 redeem 域错误码），
 * ⛔ 不解析错误文案。幂等写在途或超时后重试不会重复兑换（clientReqId 重放返回首次结果）。
 */
import type { IRedeemClaimRes } from "../../../shared/protocol/lobbyRpc/domains/redeem";
import type { RedeemRuntime } from "./redeemRuntime";

export type RedeemNoticeKind = "idle" | "success" | "error";

export interface RedeemNotice {
    readonly kind: RedeemNoticeKind;
    readonly text: string;
}

/** 与 redeem 域 validateRedeemClaimReq 同一条格式规则（客户端先闸，服务端仍校验）。 */
const CODE_PATTERN = /^[A-Z0-9]{4,32}$/u;
const IDLE: RedeemNotice = { kind: "idle", text: "输入兑换码后点「兑换」" };
const NOT_READY: RedeemNotice = { kind: "error", text: "兑换功能未就绪（feature 未装载）" };

export function normalizeRedeemInput(raw: string): string {
    return raw.trim().toUpperCase();
}

function errorCodeOf(error: unknown): string | null {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

export function describeRedeemError(error: unknown): string {
    const code = errorCodeOf(error);
    switch (code) {
        case "REDEEM_CODE_INVALID": return "兑换码不存在，请检查后重试";
        case "REDEEM_CODE_USED": return "这个兑换码你已经使用过了";
        case "CONN_LOST":
        case "TIMEOUT": return "网络不可用，稍后重试（已发出的请求不会重复兑换）";
        default: return code ? `兑换失败（${code}）` : "兑换失败，请稍后重试";
    }
}

export class RedeemLogic {
    /** 任一可见状态变化后的重绘通知（View 接线）。 */
    onChanged: () => void = () => {};

    private code = "";
    private busy = false;
    private notice: RedeemNotice;
    private last: IRedeemClaimRes | null = null;

    constructor(private readonly runtime: RedeemRuntime | null) {
        this.notice = runtime ? IDLE : NOT_READY;
    }

    /** 当前规范化后的输入（View 用它回写输入框，如兑换成功后清空）。 */
    inputCode(): string { return this.code; }
    isBusy(): boolean { return this.busy; }
    isReady(): boolean { return this.runtime !== null; }
    currentNotice(): RedeemNotice { return this.notice; }
    lastResult(): IRedeemClaimRes | null { return this.last; }

    canSubmit(): boolean {
        return this.runtime !== null && !this.busy && CODE_PATTERN.test(this.code);
    }

    setInput(raw: string): void {
        const next = normalizeRedeemInput(raw);
        if (next === this.code) return;
        this.code = next;
        // 用户改输入即清掉上一条结果提示，避免「上一次的成功」误挂在新码上。
        if (this.runtime && this.notice.kind !== "idle") this.notice = IDLE;
        this.onChanged();
    }

    /** 提交：返回是否兑换成功。不满足提交闸时 no-op 返回 false（⛔ 不排队第二次写）。 */
    async submit(): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || !this.canSubmit()) return false;
        const code = this.code;
        this.busy = true;
        this.onChanged();
        try {
            const result = await runtime.claim(code);
            this.last = result;
            this.code = "";
            this.notice = { kind: "success", text: `兑换成功：+${result.reward.amount} 金币，余额 ${result.balance}` };
            return true;
        } catch (error) {
            this.notice = { kind: "error", text: describeRedeemError(error) };
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
