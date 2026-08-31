/**
 * 收件箱列表（游标分页：before = 上一页最小 mail_id）。
 * 投递状态以 MySQL mail 表为唯一权威（09·A6）；客户端按 mailId 去重（至少一次投递）。
 */
import { MailRpc } from "@game/shared";
import { getPool } from "../../core/infra/mysql";
import { currentZoneId } from "../../core/infra/keys";
import type { RowDataPacket } from "../../core/infra/mysql";
import { storedInt } from "../../core/infra/numbers";
import { defineRpc } from "../rpc";

interface MailRow extends RowDataPacket {
  mail_id: unknown; title: string; body: string;
  attach_op_id: string | null; read_at: Date | null; claimed_at: Date | null; created_at: unknown;
}

/** 缺省页长（shared 契约里 limit 可缺省；原 zod .default(20) 的等值实现） */
const DEFAULT_LIMIT = 20;

/**
 * 将 MySQL DATETIME 的 driver 变体统一成 wire contract 要求的 epoch 毫秒。
 *
 * mysql2 默认给 DATETIME 返回 Date，但 `dateStrings`/自定义 typeCast 会返回字符串，
 * 某些 numeric mode 也会给出已经归一化的整数。数字和纯数字字符串都按**毫秒**解释；
 * 其他字符串交给 Date.parse（支持 MySQL DATETIME 与带时区的 ISO 文本）。最终统一经
 * storedInt，拒绝 invalid Date、NaN、Infinity、负值和超出安全整数范围的值。
 */
export function normalizeMailCreatedAt(raw: unknown): number {
  let millis: unknown;
  if (raw instanceof Date) {
    millis = raw.getTime();
  } else if (typeof raw === "number") {
    millis = raw;
  } else if (typeof raw === "string") {
    const text = raw.trim();
    // A numeric string is an epoch value, not a date understood by Date.parse
    // (Date.parse("1") has surprising implementation-defined calendar semantics).
    millis = /^-?\d+$/.test(text) ? text : Date.parse(text);
  } else {
    millis = undefined;
  }
  return storedInt(millis, "mail.created_at", { min: 0, max: Number.MAX_SAFE_INTEGER });
}

export default defineRpc(MailRpc.List, {
  handler: async (ctx, p) => {
    // ⚠ **必须带 server_id 谓词**（A2）：`mail` 表有该列、`mailer.sendMail` 写入时也落了值，
    // 但查询侧此前只按 user_id ⇒ 同账号在 s1 收的邮件，切到 s2 也能看到（实证过）。
    // ⛔ 别以为"GROUP_ZONES 为空就没多区"：空 = **承载全部区**，而默认目录就下发 s1–s5。
    const args: (string | number)[] = [ctx.uid, currentZoneId()];
    let where = "user_id = ? AND server_id = ?";
    if (p.before !== undefined) { where += " AND mail_id < ?"; args.push(p.before); }
    args.push(p.limit ?? DEFAULT_LIMIT);
    const [rows] = await getPool().query<MailRow[]>(
      `SELECT mail_id, title, body, attach_op_id, read_at, claimed_at, created_at
         FROM mail WHERE ${where} ORDER BY mail_id DESC LIMIT ?`, args);
    return {
      mails: rows.map((r) => {
        return {
          mailId: storedInt(r.mail_id, "mail.mail_id", { min: 1, max: Number.MAX_SAFE_INTEGER }),
          title: r.title, body: r.body,
          hasAttach: r.attach_op_id !== null,
          read: r.read_at !== null, claimed: r.claimed_at !== null,
          createdAt: normalizeMailCreatedAt(r.created_at),
        };
      }),
    };
  },
});
