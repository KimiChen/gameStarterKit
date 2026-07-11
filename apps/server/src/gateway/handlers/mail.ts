/**
 * 邮件收件箱 handlers（10·M5）。
 *
 * 投递状态以 MySQL `mail.read_at` / `claimed_at` 为**唯一权威**（09·A6）；
 * Redis Stream 只作实时唤醒（gateway/push.ts）。客户端按 mail_id 去重（至少一次投递）。
 * 领附件走 outbox（attach_op_id，09·A6），实现在 economy/mailer.ts。
 */
import { z } from "zod";
import { getPool } from "../../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../../infra/mysql";
import { claimMailAttach } from "../../economy/mailer";
import { registerRoute } from "../dispatcher";

interface MailRow extends RowDataPacket {
  mail_id: number; title: string; body: string;
  attach_op_id: string | null; read_at: Date | null; claimed_at: Date | null; created_at: Date;
}

export function registerMailRoutes(): void {
  // 收件箱列表（游标分页：before = 上一页最小 mail_id）
  registerRoute("mail.list", {
    schema: z.object({ before: z.number().int().positive().optional(), limit: z.number().int().min(1).max(50).default(20) }),
    handler: async (ctx, p) => {
      const args: (string | number)[] = [ctx.uid];
      let where = "user_id = ?";
      if (p.before !== undefined) { where += " AND mail_id < ?"; args.push(p.before); }
      args.push(p.limit);
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

  // 领附件（10·M6）：claimed_at CAS + outbox 三阶段。并发双击只发一次货
  registerRoute("mail.claimAttach", {
    schema: z.object({
      clientReqId: z.string().min(1).max(64),
      mailId: z.number().int().positive(),
    }),
    idem: true,
    handler: async (ctx, p) => claimMailAttach(ctx.uid, p.mailId),
  });

  // 标记已读：UPDATE 幂等（already-read 时 0 行也返回 ok），权威只在 MySQL
  registerRoute("mail.markRead", {
    schema: z.object({ mailId: z.number().int().positive() }),
    handler: async (ctx, p) => {
      await getPool().execute<ResultSetHeader>(
        "UPDATE mail SET read_at = NOW(3) WHERE mail_id = ? AND user_id = ? AND read_at IS NULL",
        [p.mailId, ctx.uid]);
      return { ok: true };
    },
  });
}
