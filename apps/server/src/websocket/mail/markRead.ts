/**
 * 标记已读：UPDATE 天然幂等（already-read 时 0 行也返回 ok），权威只在 MySQL。
 *
 * 幂等审计（阶段 4，§6.12）：**natural-write**——目标状态赋值天然可重复，不进通用幂等层，
 * 不受 v2 结果缓存/契约版本语义影响。
 */
import { MailRpc } from "@game/shared";
import { getPool } from "../../core/infra/mysql";
import { currentZoneId } from "../../core/infra/keys";
import type { ResultSetHeader } from "../../core/infra/mysql";
import { defineRpc } from "../rpc";

export default defineRpc(MailRpc.MarkRead, {
  handler: async (ctx, p) => {
    await getPool().execute<ResultSetHeader>(
      // ⚠ 带 server_id（A2）：⛔ 不能让本区连接把他区邮件标成已读
      "UPDATE mail SET read_at = NOW(3) WHERE mail_id = ? AND user_id = ? AND server_id = ? AND read_at IS NULL",
      [p.mailId, ctx.uid, currentZoneId()]);
    return { ok: true };
  },
});
