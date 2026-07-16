/**
 * 领附件（10·M6）：claimed_at CAS + outbox 三阶段（economy/mailer.ts）。并发双击只发一次货。
 */
import { z } from "zod";
import { MailRpc } from "@game/shared";
import { claimMailAttach } from "../../../economy/mailer";
import { defineRpc } from "../../rpc";

export default defineRpc(MailRpc.ClaimAttach, {
  schema: z.object({
    clientReqId: z.string().min(1).max(64),
    mailId: z.number().int().positive(),
  }),
  idem: true,
  handler: async (ctx, p) => claimMailAttach(ctx.uid, p.mailId),
});
