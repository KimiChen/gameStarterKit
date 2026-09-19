/** party.create——建队（MMO.md §6.4）。幂等：同 clientReqId 由 dispatcher idem 层返回首次结果，⛔ 不建第二队。 */
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { createParty } from "../../core/party/party";
import { defineRpc } from "../rpc";

export default defineRpc(PartyRpc.Create, {
  handler: async (ctx) => createParty(ctx.uid),
});
