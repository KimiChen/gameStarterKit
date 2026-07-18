/**
 * 标记已读：UPDATE 天然幂等（already-read 时 0 行也返回 ok），权威只在 MySQL。
 */
import { z } from "zod";
import { MailRpc } from "@game/shared";
import { getPool } from "../../core/infra/mysql";
import type { ResultSetHeader } from "../../core/infra/mysql";
import { defineRpc } from "../rpc";

export default defineRpc(MailRpc.MarkRead, {
  schema: z.object({ mailId: z.number().int().positive() }),
  handler: async (ctx, p) => {
    await getPool().execute<ResultSetHeader>(
      "UPDATE mail SET read_at = NOW(3) WHERE mail_id = ? AND user_id = ? AND read_at IS NULL",
      [p.mailId, ctx.uid]);
    return { ok: true };
  },
});
