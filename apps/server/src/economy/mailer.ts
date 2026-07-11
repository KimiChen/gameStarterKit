/**
 * 邮件发送 + 领附件（10·M6）。
 *
 * 投递状态权威 = MySQL `mail.read_at/claimed_at`（09·A6）；领附件走 outbox：
 * `claimed_at` CAS + INSERT intent 同一事务 → redisApply → markOutboxDone。
 * 附件是玩法 Effect（货币不进 Effect，09·A2——带币邮件走 creditInTx 扩展，暂不在首版）。
 */
import { randomUUID } from "node:crypto";
import { OUTBOX_PENDING } from "../infra/config";
import { withRcTx } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { InvalidPayloadError } from "../core/errors";
import { emitMailWake } from "../gateway/push";
import {
  deriveOpId, markOutboxDone, readBack, redisApply, type Effect, type PurchaseResult,
} from "./outbox";

/** 发件（GM/系统调用）。attach 为空 = 纯文本邮件。落库后发实时唤醒（流仅唤醒，09·K6）。 */
export async function sendMail(uid: string, title: string, body: string, attach?: Effect): Promise<number> {
  const attachOpId = attach && attach.length > 0
    ? deriveOpId(uid, "mail.attach", randomUUID()) // 发件时固化 op_id：领取幂等的锚点（09·I3）
    : null;
  const mailId = await withRcTx(async (conn) => {
    const [r] = await conn.execute<ResultSetHeader>(
      `INSERT INTO mail (user_id, title, body, attach_op_id, attach_effect)
       VALUES (?,?,?,?,${attachOpId ? "CAST(? AS JSON)" : "?"})`,
      [uid, title, body, attachOpId, attachOpId ? JSON.stringify(attach) : null]);
    return r.insertId;
  });
  await emitMailWake(uid, mailId).catch(() => {}); // 唤醒是尽力而为：丢了客户端上线自拉
  return mailId;
}

interface MailAttachRow extends RowDataPacket {
  attach_op_id: string | null;
  attach_effect: Effect | null;
  claimed_at: Date | null;
}

/**
 * 领附件（DoD：并发双击只发一次货）。
 * 事务内：`claimed_at IS NULL` CAS → INSERT outbox intent（ODKU 兜底）；
 * 已领/竞争输了 → 直接 readBack（附件 op 幂等，重复领拿到同一结果）。
 */
export async function claimMailAttach(uid: string, mailId: number): Promise<PurchaseResult> {
  const claim = await withRcTx(async (conn) => {
    const [rows] = await conn.query<MailAttachRow[]>(
      "SELECT attach_op_id, attach_effect, claimed_at FROM mail WHERE mail_id = ? AND user_id = ? FOR UPDATE",
      [mailId, uid]);
    if (rows.length === 0 || rows[0].attach_op_id === null) {
      throw new InvalidPayloadError("邮件不存在或无附件");
    }
    const { attach_op_id: opId, attach_effect: effect } = rows[0];
    if (rows[0].claimed_at !== null) { return { opId, effect, fresh: false }; } // 已领：幂等回读

    const [upd] = await conn.execute<ResultSetHeader>(
      "UPDATE mail SET claimed_at = NOW(3), read_at = COALESCE(read_at, NOW(3)) WHERE mail_id = ? AND claimed_at IS NULL",
      [mailId]);
    if (upd.affectedRows === 0) { return { opId, effect, fresh: false }; } // 并发双击输家

    await conn.execute<ResultSetHeader>(
      `INSERT INTO gameplay_outbox (op_id, user_id, effect, status)
       VALUES (?,?,CAST(? AS JSON),?)
       ON DUPLICATE KEY UPDATE op_id = op_id`,   // ⛔ 绝不 INSERT IGNORE（09·DB1）
      [opId, uid, JSON.stringify(effect), OUTBOX_PENDING]);
    return { opId, effect, fresh: true };
  });

  if (claim.fresh && claim.effect) {
    try {
      const r = await redisApply(uid, claim.opId, claim.effect); // 阶段 2（无 fence，09·X3）
      if (r === "ok" || r === "dup") { await markOutboxDone(claim.opId); }
      // cold → 留给 relayer→ensureLive（09·X5）
    } catch { /* relayer 收敛 */ }
  }
  return readBack(uid, claim.opId);
}
