/**
 * 充值链路（10·M6）：微信支付回调 → `purchases` 状态机（created→paid→delivered）。
 *
 * 发币是**纯 MySQL**（gold 权威在 user_currency）——不碰 Redis，无需 outbox；
 * paid 后**同一事务**插 `currency_ledger` 正向 delta（deliver_op_id 幂等）并推进 delivered（05）。
 * `refunded` 分支等 M0 退款拍板（微信账单 T+1 vs 主动查单），状态位已留。
 */
import { randomBytes } from "node:crypto";
import {
  PURCHASE_CREATED, PURCHASE_DELIVERED, PURCHASE_PAID, CUR_GOLD,
} from "../infra/config";
import { withRcTx } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { getRechargeSku } from "./catalog";
import { creditInTx, invalidateBalanceCache } from "./currency";
import { deriveOpId } from "./outbox";

/** 下单：客户端拉起支付前调用。order_id 服务端生成。 */
export async function createOrder(uid: string, sku: string): Promise<{ orderId: string; amountFen: number }> {
  const product = getRechargeSku(sku);
  if (!product) { throw new Error(`未知充值 SKU: ${sku}`); }
  const orderId = `o_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
  await withRcTx(async (conn) => {
    await conn.execute<ResultSetHeader>(
      "INSERT INTO purchases (order_id, user_id, sku, amount_fen, status) VALUES (?,?,?,?,?)",
      [orderId, uid, sku, product.amountFen, PURCHASE_CREATED]);
  });
  return { orderId, amountFen: product.amountFen };
}

export interface WxPayNotify {
  orderId: string;   // 商户订单号（out_trade_no）
  wxTxnId: string;   // 微信支付单号（transaction_id）
  amountFen: number; // 实付金额
}

/**
 * 支付回调（签名验证在 HTTP 层完成后调这里）。整条链路一个 RC 事务：
 * created→paid 状态 CAS → 金额校验 → 发币（ledger 幂等）→ delivered。
 *
 * 重放安全（DoD：同 wx_txn_id 回调两次只发一次币）三重闸：
 * ① 状态 CAS `WHERE status = created` 0 行即已处理；② `uk_wx_txn` UNIQUE；
 * ③ ledger `UNIQUE(user_id, idem_key)`（deliver_op_id 恒定派生）。
 */
export async function handleWxPayNotify(n: WxPayNotify): Promise<"ok" | "already" | "mismatch"> {
  const result = await withRcTx(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT user_id, sku, amount_fen, status FROM purchases WHERE order_id = ? FOR UPDATE", [n.orderId]);
    if (rows.length === 0) { return "mismatch" as const; }
    const order = rows[0];
    if (Number(order.status) !== PURCHASE_CREATED) { return "already" as const; } // 重放：直接 ack
    if (Number(order.amount_fen) !== n.amountFen) { return "mismatch" as const; } // 金额不符 → 人工

    const product = getRechargeSku(order.sku as string);
    if (!product) { return "mismatch" as const; }
    const uid = order.user_id as string;
    const opId = deriveOpId(uid, "recharge.deliver", n.orderId); // 订单号即幂等源

    // created → paid（含 wx_txn_id 落库；同 txn 撞 uk_wx_txn 由外层 1062 拒掉）
    const [paid] = await conn.execute<ResultSetHeader>(
      "UPDATE purchases SET status = ?, wx_txn_id = ?, deliver_op_id = ? WHERE order_id = ? AND status = ?",
      [PURCHASE_PAID, n.wxTxnId, opId, n.orderId, PURCHASE_CREATED]);
    if (paid.affectedRows === 0) { return "already" as const; }

    // 同事务发币 + delivered（paid 与 delivered 之间不存在崩溃窗口——就是一个事务）
    await creditInTx(conn, uid, CUR_GOLD, product.gold, opId, "recharge.deliver");
    await conn.execute<ResultSetHeader>(
      "UPDATE purchases SET status = ? WHERE order_id = ?", [PURCHASE_DELIVERED, n.orderId]);
    return { uid } as { uid: string };
  }).catch((e: unknown) => {
    if ((e as { errno?: number }).errno === 1062) { return "already" as const; } // uk_wx_txn 重放
    throw e;
  });

  if (typeof result === "object") {
    await invalidateBalanceCache(result.uid);
    return "ok";
  }
  return result;
}
