/** party.get——当前队伍视图（presence 在线标记；指针陈旧自愈清字段并返回 null）。只读。 */
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { getParty } from "../../core/party/party";
import { defineRpc } from "../rpc";

export default defineRpc(PartyRpc.Get, {
  handler: async (ctx) => ({ party: await getParty(ctx.uid) }),
});
