/**
 * shop 域 ws-RPC 契约（04 三阶段协议的客户端可见面）。
 */
import type { IPurchaseResult } from "./economy";

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
