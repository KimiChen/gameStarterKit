/**
 * shop 域 ws-RPC 契约（04 三阶段协议的客户端可见面）。
 *
 * 执行模式：Purchase=idempotent-write；QueryOp=query——它携带**原操作的 opId**但不产生
 * 领域写入，正是「⛔ 不得按请求含操作 ID 推断幂等」的现成反例（§4.1）。
 * 领域错误码归本域：INSUFFICIENT_BALANCE / GRANTING / ORDER_MISMATCH。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import { validateGrant } from "../economy";
import type { IGrant, IPurchaseResult } from "../economy";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import { requiredId, rpcRecord } from "../primitives";

/** shop 域路由名 */
export const ShopRpc = {
    /** 购买（写路径，幂等；status='granting' 时转 QueryOp 轮询） */
    Purchase: "shop.purchase",
    /** 发放状态查询（只读） */
    QueryOp: "shop.queryOp",
} as const;

export interface IShopPurchaseReq {
    /** 幂等 id（09·I2/I3：数据层 exactly-once 与 RPC 占位共用它派生） */
    clientReqId: string;
    sku: string;
}

export interface IShopQueryOpReq {
    opId: string;
}

/** 路由名 → { req, res } */
export interface ShopRpcMap {
    [ShopRpc.Purchase]: { req: IShopPurchaseReq; res: IPurchaseResult };
    [ShopRpc.QueryOp]: { req: IShopQueryOpReq; res: IPurchaseResult };
}

/** IPurchaseResult 视图 validator（就近归属本域；mail.claimAttach 从这里 import 复用）。 */
export function validatePurchaseResult(input: unknown, path = "response"): IPurchaseResult {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["opId", "status", "balance"], ["granted"], path);
    if (value.status !== "done" && value.status !== "granting" && value.status !== "dead") {
        throw new WireValidationError("RPC_PURCHASE_STATUS", `${path}.status`);
    }
    const grantedValue = value.granted;
    let granted: IGrant[] | undefined;
    if (grantedValue !== undefined) {
        if (!Array.isArray(grantedValue) || grantedValue.length > 64) throw new WireValidationError("RPC_GRANTS", `${path}.granted`);
        granted = grantedValue.map((item, i) => validateGrant(item, `${path}.granted[${i}]`));
    }
    const base = {
        opId: boundedString(value.opId, `${path}.opId`, 1, 128),
        status: value.status as IPurchaseResult["status"],
        balance: finiteInteger(value.balance, `${path}.balance`, 0),
    };
    return granted === undefined ? base : { ...base, granted };
}

export const validateShopPurchaseReq: RuntimeValidator<IShopPurchaseReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId", "sku"], [], "payload"); return { clientReqId: requiredId(value, "clientReqId"), sku: boundedString(value.sku, "payload.sku", 1, 64) };
};
export const validateShopQueryReq: RuntimeValidator<IShopQueryOpReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["opId"], [], "payload"); return { opId: requiredId(value, "opId", 128) };
};

export default defineLobbyRpcDomain({
    domain: "shop",
    errorCodes: [
        "INSUFFICIENT_BALANCE",
        "GRANTING",
        "ORDER_MISMATCH",
    ],
    routes: [
        defineRpcIdempotentWrite(ShopRpc.Purchase, { request: validateShopPurchaseReq, response: validatePurchaseResult }),
        defineRpcQuery(ShopRpc.QueryOp, { request: validateShopQueryReq, response: validatePurchaseResult }),
    ],
});
