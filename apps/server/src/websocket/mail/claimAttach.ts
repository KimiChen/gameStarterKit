/**
 * 领附件（10·M6）：claimed_at CAS + outbox 三阶段（economy/mailer.ts）。并发双击只发一次货。
 */
import { MailRpc } from "@game/shared";
import { claimMailAttach } from "../../core/economy/mailer";
import { defineRpc } from "../rpc";

export default defineRpc(MailRpc.ClaimAttach, {
  handler: async (ctx, p) => claimMailAttach(ctx.uid, p.mailId),
});
