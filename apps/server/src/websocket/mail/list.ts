/**
 * 收件箱列表（游标分页：before = 上一页最小 mail_id）。
 * 投递状态以 MySQL mail 表为唯一权威（09·A6）；客户端按 mailId 去重（至少一次投递）。
 */
import { z } from "zod";
import { MailRpc } from "@game/shared";
import { getPool } from "../../core/infra/mysql";
import type { RowDataPacket } from "../../core/infra/mysql";
import { defineRpc } from "../rpc";

interface MailRow extends RowDataPacket {
  mail_id: number; title: string; body: string;
  attach_op_id: string | null; read_at: Date | null; claimed_at: Date | null; created_at: Date;
}

/** 缺省页长（shared 契约里 limit 可缺省；原 zod .default(20) 的等值实现） */
const DEFAULT_LIMIT = 20;

export default defineRpc(MailRpc.List, {
  schema: z.object({
    before: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  handler: async (ctx, p) => {
    const args: (string | number)[] = [ctx.uid];
    let where = "user_id = ?";
    if (p.before !== undefined) { where += " AND mail_id < ?"; args.push(p.before); }
    args.push(p.limit ?? DEFAULT_LIMIT);
    const [rows] = await getPool().query<MailRow[]>(
      `SELECT mail_id, title, body, attach_op_id, read_at, claimed_at, created_at
         FROM mail WHERE ${where} ORDER BY mail_id DESC LIMIT ?`, args);
    return {
      mails: rows.map((r) => ({
        mailId: r.mail_id, title: r.title, body: r.body,
        hasAttach: r.attach_op_id !== null,
        read: r.read_at !== null, claimed: r.claimed_at !== null,
        createdAt: r.created_at.getTime(),
      })),
    };
  },
});
