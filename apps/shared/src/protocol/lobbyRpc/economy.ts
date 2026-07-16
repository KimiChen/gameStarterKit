/**
 * 经济操作结果 —— mail.claimAttach / shop.purchase / shop.queryOp 共用的响应形状。
 * 镜像 apps/server/src/economy/outbox.ts 的 Grant / PurchaseResult（04 三阶段协议读侧）。
 */

/** 一次发放的单条玩法副作用。货币不在此（权威在 MySQL，09·A2）。 */
export type IGrant =
    | { kind: "item"; itemId: number; count: number }
    | { kind: "star"; delta: number }
    | { kind: "setField"; field: string; value: string };

/** status = 'granting' → 客户端用 shop.queryOp 短轮询，⛔ 不要「超时即失败」（04）。 */
export interface IPurchaseResult {
    opId: string;
    status: "done" | "granting" | "dead";
    /** 扣费后余额（分） */
    balance: number;
    granted?: IGrant[];
}
