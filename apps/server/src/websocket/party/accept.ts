/** party.accept——接受邀请入队；全员（含新成员）收 party.event。 */
import { LobbyPush } from "@game/shared";
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { currentZoneId } from "../../core/infra/keys";
import { acceptInvite } from "../../core/party/party";
import { pushToUsers } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(PartyRpc.Accept, {
  handler: async (ctx, p) => {
    const r = await acceptInvite(ctx.uid, p.partyId);
    pushToUsers(r.members, LobbyPush.PartyEvent, { seq: r.seq, partyId: p.partyId }, currentZoneId());
    return { ok: true, seq: r.seq };
  },
});
