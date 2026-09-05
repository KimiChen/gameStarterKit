/**
 * redeem 域 ws-RPC 契约——「兑换码」插件（plugins/redeem）自带的域文件。
 * 这是 docs/PLUGIN.md §3「插件只能消费不能定义」判据的端到端实证：本文件只使用
 * 框架已有的 defineDomain / primitives / http 助手，不新增任何框架级概念。
 *
 * 执行模式：Claim=idempotent-write（同一 clientReqId 重放返回首次结果；不同 clientReqId
 * 重复兑换同一码由服务端 Lua 原子拒绝 REDEEM_CODE_USED）。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite } from "../defineDomain";
import { requiredId, rpcRecord } from "../primitives";

/** redeem 域路由名 */
export const RedeemRpc = {
    /** 兑换一个码：成功返回奖励与兑换后的余额 */
    Claim: "redeem.claim",
} as const;

/** 兑换码奖励（首版只有金币；扩展奖励种类时在此域递增 contractVersion） */
export interface IRedeemReward {
    kind: "coins";
    amount: number;
}

export interface IRedeemClaimReq {
    /** 幂等 id（09·I2） */
    clientReqId: string;
    /** 兑换码：4～32 位大写字母/数字（客户端先 toUpperCase 再发；服务端按原样校验） */
    code: string;
}
export interface IRedeemClaimRes {
    /** 回显规范化后的码 */
    code: string;
    reward: IRedeemReward;
    /** 兑换后该玩家在本 feature 钱包内的金币余额（⛔ 不是经济系统主钱包，见 docs/redeem/README.md） */
    balance: number;
}

/** 路由名 → { req, res } */
export interface RedeemRpcMap {
    [RedeemRpc.Claim]: { req: IRedeemClaimReq; res: IRedeemClaimRes };
}

export const validateRedeemClaimReq: RuntimeValidator<IRedeemClaimReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId", "code"], [], "payload");
    const code = boundedString(value.code, "payload.code", 4, 32);
    if (!/^[A-Z0-9]{4,32}$/u.test(code)) throw new WireValidationError("REDEEM_CODE", "payload.code");
    return { clientReqId: requiredId(value, "clientReqId"), code };
};

export const validateRedeemClaimRes: RuntimeValidator<IRedeemClaimRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["code", "reward", "balance"], [], "response");
    const reward = rpcRecord(value.reward, "response.reward");
    assertExactKeys(reward, ["kind", "amount"], [], "response.reward");
    if (reward.kind !== "coins") throw new WireValidationError("REDEEM_REWARD_KIND", "response.reward.kind");
    return {
        code: boundedString(value.code, "response.code", 4, 32),
        reward: { kind: "coins", amount: finiteInteger(reward.amount, "response.reward.amount", 1) },
        balance: finiteInteger(value.balance, "response.balance", 0),
    };
};

export default defineLobbyRpcDomain({
    domain: "redeem",
    contractVersion: 1,
    errorCodes: ["REDEEM_CODE_INVALID", "REDEEM_CODE_USED"],
    pushes: [],
    routes: [
        defineRpcIdempotentWrite(RedeemRpc.Claim, { request: validateRedeemClaimReq, response: validateRedeemClaimRes }),
    ],
});
