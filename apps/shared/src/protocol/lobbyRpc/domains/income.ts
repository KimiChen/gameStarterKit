/**
 * income 域 ws-RPC 契约——「铜币收益」玩法（每 5 秒按等级发铜币 + 离线收益弹窗）。
 *
 * 执行模式三分（关键，⛔ 不得按「请求是否含 clientReqId」推断）：
 *  - GetPending  = query           只读预览（弹窗数据源），⛔ 不产生任何领域写入；
 *  - SettleOnline= natural-write   在线心跳结算，写入本身可安全重复（基线自己往前走，重放只结算新增时间）；
 *  - ClaimOffline= idempotent-write 领取离线收益，重复执行会重复加钱，故必须带 clientReqId 进通用幂等闸。
 *
 * 等级、账本与收益时间轴均是 serverNew 的 income 账户数据；首次认证以 1 级 / 0 铜币初始化，
 * 不读取旧通道的 `User` Bean。本域只定义 wire 面。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, finiteInteger, type RuntimeValidator } from "../../http";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcNaturalWrite, defineRpcQuery } from "../defineDomain";
import { emptyPayload, requiredId, rpcRecord } from "../primitives";

/** income 域路由名 */
export const IncomeRpc = {
    /** 待领收益预览（只读）：离线收益弹窗的数据源 */
    GetPending: "income.getPending",
    /** 在线结算：每 5 秒由客户端轮询触发，把已凑满周期的铜币入账 */
    SettleOnline: "income.settleOnline",
    /** 领取离线收益（写路径，幂等）：客户端点「确定」后调用 */
    ClaimOffline: "income.claimOffline",
} as const;

export interface IIncomeGetPendingReq {}
export interface IIncomeGetPendingRes {
    /** 收益账户等级（新账号初始为 1） */
    level: number;
    /** 结算周期（秒），当前为 5 */
    intervalSeconds: number;
    /** 每个周期的基础收益（`100 × 等级^1.1`） */
    perInterval: number;
    /** 待领取的离线秒数（登录时算好暂存，领取才清零） */
    offlineSeconds: number;
    /** 待领取的离线铜币 */
    offlineCopper: number;
    /** 当前铜币余额（⛔ 不含上面待领的那笔） */
    copper: number;
}

export interface IIncomeSettleOnlineReq {}
export interface IIncomeSettleOnlineRes {
    /** 本次入账的铜币；不足一个周期的余量不结算，故合法值为 0 */
    copper: number;
    /** 入账后的铜币余额 */
    balance: number;
}

export interface IIncomeClaimOfflineReq {
    /** 幂等 id（09·I2）：每个逻辑操作生成一次，重试复用 */
    clientReqId: string;
}
export interface IIncomeClaimOfflineRes {
    /** 本次领取的离线铜币；没有待领收益时为 0 */
    copper: number;
    /** 本次领取对应的离线秒数 */
    offlineSeconds: number;
    /** 领取后的铜币余额 */
    balance: number;
}

/** 路由名 → { req, res } */
export interface IncomeRpcMap {
    [IncomeRpc.GetPending]: { req: IIncomeGetPendingReq; res: IIncomeGetPendingRes };
    [IncomeRpc.SettleOnline]: { req: IIncomeSettleOnlineReq; res: IIncomeSettleOnlineRes };
    [IncomeRpc.ClaimOffline]: { req: IIncomeClaimOfflineReq; res: IIncomeClaimOfflineRes };
}

export const validateIncomeGetPendingReq: RuntimeValidator<IIncomeGetPendingReq> = emptyPayload;
export const validateIncomeSettleOnlineReq: RuntimeValidator<IIncomeSettleOnlineReq> = emptyPayload;
export const validateIncomeClaimOfflineReq: RuntimeValidator<IIncomeClaimOfflineReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId"], [], "payload"); return { clientReqId: requiredId(value, "clientReqId") };
};

export const validateIncomeGetPendingRes: RuntimeValidator<IIncomeGetPendingRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["level", "intervalSeconds", "perInterval", "offlineSeconds", "offlineCopper", "copper"], [], "response");
    return {
        level: finiteInteger(value.level, "response.level", 0),
        intervalSeconds: finiteInteger(value.intervalSeconds, "response.intervalSeconds", 1),
        perInterval: finiteInteger(value.perInterval, "response.perInterval", 0),
        offlineSeconds: finiteInteger(value.offlineSeconds, "response.offlineSeconds", 0),
        offlineCopper: finiteInteger(value.offlineCopper, "response.offlineCopper", 0),
        copper: finiteInteger(value.copper, "response.copper", 0),
    };
};
export const validateIncomeSettleOnlineRes: RuntimeValidator<IIncomeSettleOnlineRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["copper", "balance"], [], "response");
    return {
        copper: finiteInteger(value.copper, "response.copper", 0),
        balance: finiteInteger(value.balance, "response.balance", 0),
    };
};
export const validateIncomeClaimOfflineRes: RuntimeValidator<IIncomeClaimOfflineRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["copper", "offlineSeconds", "balance"], [], "response");
    return {
        copper: finiteInteger(value.copper, "response.copper", 0),
        offlineSeconds: finiteInteger(value.offlineSeconds, "response.offlineSeconds", 0),
        balance: finiteInteger(value.balance, "response.balance", 0),
    };
};

export default defineLobbyRpcDomain({
    domain: "income",
    contractVersion: 2,
    errorCodes: [],
    pushes: [],
    routes: [
        defineRpcQuery(IncomeRpc.GetPending, { request: validateIncomeGetPendingReq, response: validateIncomeGetPendingRes }),
        defineRpcNaturalWrite(IncomeRpc.SettleOnline, { request: validateIncomeSettleOnlineReq, response: validateIncomeSettleOnlineRes }),
        defineRpcIdempotentWrite(IncomeRpc.ClaimOffline, { request: validateIncomeClaimOfflineReq, response: validateIncomeClaimOfflineRes }),
    ],
});
