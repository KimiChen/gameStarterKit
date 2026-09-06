/**
 * 兑换码 plugin 的宿主接线面：plugin module install 时由 PluginHost 注入 ports 组装，
 * View 打开时读取（route 形态入口的 navigation.open 不带 setup，故走与 loginFlow 的
 * HomeMenuRuntime 同形的模块级 holder + 身份守卫注销）。⛔ 不 import cc（铁律 9）。
 */
import type { IRedeemClaimRes } from "../../../shared/protocol/lobbyRpc/domains/redeem";

export interface RedeemRuntime {
    /** 幂等写：clientReqId 由宿主 sendIdempotent 生成，本层只传 code。 */
    claim(code: string): Promise<IRedeemClaimRes>;
    /** 关闭本 plugin 的 route。 */
    close(): void;
}

let current: RedeemRuntime | null = null;

export function setRedeemRuntime(runtime: RedeemRuntime): () => void {
    current = runtime;
    return () => {
        if (current === runtime) current = null;
    };
}

export function getRedeemRuntime(): RedeemRuntime | null {
    return current;
}
