/**
 * 铜币收益 plugin 的宿主接线面：plugin module install 时由 PluginHost 注入 ports 组装，
 * View 打开时读取（route 形态入口的 navigation.open 不带 setup，故走与 redeem 同形的
 * 模块级 holder + 身份守卫注销）。⛔ 不 import cc（铁律 9）。
 */
import type {
    IIncomeClaimOfflineRes,
    IIncomeGetPendingRes,
    IIncomeSettleOnlineRes,
} from "../../../shared/protocol/lobbyRpc/domains/income";

export interface IncomeRuntime {
    /** 只读预览：等级、周期、待领离线收益、当前余额。 */
    pending(): Promise<IIncomeGetPendingRes>;
    /** 在线心跳：把已凑满 5 秒周期的铜币入账。 */
    settleOnline(): Promise<IIncomeSettleOnlineRes>;
    /** 领取离线收益（幂等写，clientReqId 由宿主 sendIdempotent 生成）。 */
    claimOffline(): Promise<IIncomeClaimOfflineRes>;
    /** 打开本 plugin 的 route（自动弹窗与手动入口共用）。 */
    open(): Promise<void>;
    /** 关闭本 plugin 的 route。 */
    close(): void;
}

let current: IncomeRuntime | null = null;

export function setIncomeRuntime(runtime: IncomeRuntime): () => void {
    current = runtime;
    return () => {
        if (current === runtime) current = null;
    };
}

export function getIncomeRuntime(): IncomeRuntime | null {
    return current;
}
