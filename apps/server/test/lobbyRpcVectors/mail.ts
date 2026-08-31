/** mail 域测试向量（自 wire-contract requestFixtures/responseFixtures 与 lobby-rpc-contract validPayloads 迁移合一）。 */
import { MailRpc } from "@game/shared";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [MailRpc.List]: {
    request: { before: 10, limit: 20 },
    response: { mails: [] },
  },
  [MailRpc.ClaimAttach]: {
    request: { clientReqId: "c1", mailId: 1 },
    response: { opId: "op1", status: "done", balance: 10, granted: [{ kind: "item", itemId: 1, count: 1 }] },
  },
  [MailRpc.MarkRead]: {
    request: { mailId: 1 },
    response: { ok: true },
  },
} satisfies LobbyRpcVectorFile;
