/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/shop.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, type RuntimeValidator } from "../../http";
import { rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import type { IPurchaseResult } from "../economy";
import { validatePurchaseResult } from "../economy";

/** shop 域路由名 */
export const ShopRpc = {
    Purchase: "shop.purchase",
    QueryOp: "shop.queryOp",
} as const;

export interface IShopPurchaseReq {
    clientReqId: string
    sku: string
}

export interface IShopQueryOpReq {
    opId: string
}

function parseIShopPurchaseReq(input: unknown, path: string): IShopPurchaseReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "sku"], [], path)
    const out: IShopPurchaseReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        sku: boundedString(value.sku, `${path}.sku`, 1, 64),
    }
    return out
}

function parseIShopQueryOpReq(input: unknown, path: string): IShopQueryOpReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["opId"], [], path)
    const out: IShopQueryOpReq = {
        opId: boundedString(value.opId, `${path}.opId`, 1, 128),
    }
    return out
}

export const validateShopPurchaseReq: RuntimeValidator<IShopPurchaseReq> = (input) => parseIShopPurchaseReq(input, "payload")

export const validateShopPurchaseRes: RuntimeValidator<IPurchaseResult> = (input) => validatePurchaseResult(input, "response")

export const validateShopQueryOpReq: RuntimeValidator<IShopQueryOpReq> = (input) => parseIShopQueryOpReq(input, "payload")

export const validateShopQueryOpRes: RuntimeValidator<IPurchaseResult> = (input) => validatePurchaseResult(input, "response")

export default defineLobbyRpcDomain({
    domain: "shop",
    contractVersion: 5,
    errorCodes: ["INSUFFICIENT_BALANCE","GRANTING","ORDER_MISMATCH"],
    pushes: [],
    routes: [
        defineRpcIdempotentWrite(ShopRpc.Purchase, { request: validateShopPurchaseReq, response: validateShopPurchaseRes }),
        defineRpcQuery(ShopRpc.QueryOp, { request: validateShopQueryOpReq, response: validateShopQueryOpRes }),
    ],
});
