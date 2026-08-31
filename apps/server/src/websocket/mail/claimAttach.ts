/**
 * 领附件（10·M6）：claimed_at CAS + outbox 三阶段（economy/mailer.ts）。并发双击只发一次货。
 *
 * 幂等审计（阶段 4，§6.12）：**idempotent-write + durable**——`claimed_at` CAS 与
 * `attachOpId`（发件时固化）才是 exactly-once 权威；通用 idem 层只是 UX 快闸，
 * 结果缓存/墓碑不可得时按领域权威（outbox/claimed_at）收敛，重试无害。
 */
import { MailRpc } from "@game/shared";
import { claimMailAttach } from "../../core/economy/mailer";
import { defineRpc } from "../rpc";

export default defineRpc(MailRpc.ClaimAttach, {
  handler: async (ctx, p) => claimMailAttach(ctx.uid, p.mailId),
});
