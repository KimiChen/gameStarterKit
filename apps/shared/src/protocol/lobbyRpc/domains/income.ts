/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/income.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcNaturalWrite, defineRpcQuery } from "../defineDomain";

/** income 域路由名 */
export const IncomeRpc = {
    GetPending: "income.getPending",
    SettleOnline: "income.settleOnline",
    ClaimOffline: "income.claimOffline",
} as const;

export interface IIncomeGetPendingReq {
    readonly [key: string]: never
}

export interface IIncomeGetPendingRes {
    level: number
    intervalSeconds: number
    perInterval: number
    offlineSeconds: number
    offlineCopper: number
    copper: number
}

export interface IIncomeSettleOnlineReq {
    readonly [key: string]: never
}

export interface IIncomeSettleOnlineRes {
    copper: number
    balance: number
}

export interface IIncomeClaimOfflineReq {
    clientReqId: string
}

export interface IIncomeClaimOfflineRes {
    copper: number
    offlineSeconds: number
    balance: number
}

function parseIIncomeGetPendingReq(input: unknown, path: string): IIncomeGetPendingReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], [], path)
    const out: IIncomeGetPendingReq = {
    }
    return out
}

function parseIIncomeGetPendingRes(input: unknown, path: string): IIncomeGetPendingRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["level", "intervalSeconds", "perInterval", "offlineSeconds", "offlineCopper", "copper"], [], path)
    const out: IIncomeGetPendingRes = {
        level: finiteInteger(value.level, `${path}.level`, 0, Number.MAX_SAFE_INTEGER),
        intervalSeconds: finiteInteger(value.intervalSeconds, `${path}.intervalSeconds`, 1, Number.MAX_SAFE_INTEGER),
        perInterval: finiteInteger(value.perInterval, `${path}.perInterval`, 0, Number.MAX_SAFE_INTEGER),
        offlineSeconds: finiteInteger(value.offlineSeconds, `${path}.offlineSeconds`, 0, Number.MAX_SAFE_INTEGER),
        offlineCopper: finiteInteger(value.offlineCopper, `${path}.offlineCopper`, 0, Number.MAX_SAFE_INTEGER),
        copper: finiteInteger(value.copper, `${path}.copper`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIIncomeSettleOnlineReq(input: unknown, path: string): IIncomeSettleOnlineReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], [], path)
    const out: IIncomeSettleOnlineReq = {
    }
    return out
}

function parseIIncomeSettleOnlineRes(input: unknown, path: string): IIncomeSettleOnlineRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["copper", "balance"], [], path)
    const out: IIncomeSettleOnlineRes = {
        copper: finiteInteger(value.copper, `${path}.copper`, 0, Number.MAX_SAFE_INTEGER),
        balance: finiteInteger(value.balance, `${path}.balance`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIIncomeClaimOfflineReq(input: unknown, path: string): IIncomeClaimOfflineReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId"], [], path)
    const out: IIncomeClaimOfflineReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
    }
    return out
}

function parseIIncomeClaimOfflineRes(input: unknown, path: string): IIncomeClaimOfflineRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["copper", "offlineSeconds", "balance"], [], path)
    const out: IIncomeClaimOfflineRes = {
        copper: finiteInteger(value.copper, `${path}.copper`, 0, Number.MAX_SAFE_INTEGER),
        offlineSeconds: finiteInteger(value.offlineSeconds, `${path}.offlineSeconds`, 0, Number.MAX_SAFE_INTEGER),
        balance: finiteInteger(value.balance, `${path}.balance`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

export const validateIncomeGetPendingReq: RuntimeValidator<IIncomeGetPendingReq> = (input) => parseIIncomeGetPendingReq(input, "payload")

export const validateIncomeGetPendingRes: RuntimeValidator<IIncomeGetPendingRes> = (input) => parseIIncomeGetPendingRes(input, "response")

export const validateIncomeSettleOnlineReq: RuntimeValidator<IIncomeSettleOnlineReq> = (input) => parseIIncomeSettleOnlineReq(input, "payload")

export const validateIncomeSettleOnlineRes: RuntimeValidator<IIncomeSettleOnlineRes> = (input) => parseIIncomeSettleOnlineRes(input, "response")

export const validateIncomeClaimOfflineReq: RuntimeValidator<IIncomeClaimOfflineReq> = (input) => parseIIncomeClaimOfflineReq(input, "payload")

export const validateIncomeClaimOfflineRes: RuntimeValidator<IIncomeClaimOfflineRes> = (input) => parseIIncomeClaimOfflineRes(input, "response")

export default defineLobbyRpcDomain({
    domain: "income",
    contractVersion: 7,
    errorCodes: [],
    pushes: [],
    routes: [
        defineRpcQuery(IncomeRpc.GetPending, { request: validateIncomeGetPendingReq, response: validateIncomeGetPendingRes }),
        defineRpcNaturalWrite(IncomeRpc.SettleOnline, { request: validateIncomeSettleOnlineReq, response: validateIncomeSettleOnlineRes }),
        defineRpcIdempotentWrite(IncomeRpc.ClaimOffline, { request: validateIncomeClaimOfflineReq, response: validateIncomeClaimOfflineRes }),
    ],
});
