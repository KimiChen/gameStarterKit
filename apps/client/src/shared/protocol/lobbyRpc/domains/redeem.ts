/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/redeem.json; validators are generated, complex leaf checks stay in ../checks/. */
import { WireValidationError, assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite } from "../defineDomain";

/** redeem 域路由名 */
export const RedeemRpc = {
    Claim: "redeem.claim",
} as const;

export interface IRedeemClaimReq {
    clientReqId: string
    code: string
}

export interface IRedeemReward {
    kind: "coins"
    amount: number
}

export interface IRedeemClaimRes {
    code: string
    reward: IRedeemReward
    balance: number
}

function parseIRedeemClaimReq(input: unknown, path: string): IRedeemClaimReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "code"], [], path)
    const out: IRedeemClaimReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        code: ((v) => { const parsed = boundedString(v, `${path}.code`, 4, 32); if (!/^[A-Z0-9]{4,32}$/u.test(parsed)) throw new WireValidationError("REDEEM_CODE", `${path}.code`); return parsed; })(value.code),
    }
    return out
}

function parseIRedeemReward(input: unknown, path: string): IRedeemReward {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["kind", "amount"], [], path)
    const out: IRedeemReward = {
        kind: ((v) => { if (v !== "coins") throw new WireValidationError("REDEEM_REWARD_KIND", `${path}.kind`); return v as "coins"; })(value.kind),
        amount: finiteInteger(value.amount, `${path}.amount`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIRedeemClaimRes(input: unknown, path: string): IRedeemClaimRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["code", "reward", "balance"], [], path)
    const out: IRedeemClaimRes = {
        code: boundedString(value.code, `${path}.code`, 4, 32),
        reward: parseIRedeemReward(value.reward, `${path}.reward`),
        balance: finiteInteger(value.balance, `${path}.balance`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

export const validateRedeemClaimReq: RuntimeValidator<IRedeemClaimReq> = (input) => parseIRedeemClaimReq(input, "payload")

export const validateRedeemClaimRes: RuntimeValidator<IRedeemClaimRes> = (input) => parseIRedeemClaimRes(input, "response")

export default defineLobbyRpcDomain({
    domain: "redeem",
    contractVersion: 5,
    errorCodes: ["REDEEM_CODE_INVALID","REDEEM_CODE_USED"],
    pushes: [],
    routes: [
        defineRpcIdempotentWrite(RedeemRpc.Claim, { request: validateRedeemClaimReq, response: validateRedeemClaimRes }),
    ],
});
