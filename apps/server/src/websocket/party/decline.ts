/** party.decline——拒绝邀请（无邀请时幂等 ok）；有变更才发 party.event。 */
import { LobbyPush } from "@game/shared";
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { currentZoneId } from "../../core/infra/keys";
import { declineInvite } from "../../core/party/party";
import { pushToUsers } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(PartyRpc.Decline, {
  handler: async (ctx, p) => {
    const r = await declineInvite(ctx.uid, p.partyId);
    if (r.seq > 0) pushToUsers(r.members, LobbyPush.PartyEvent, { seq: r.seq, partyId: p.partyId }, currentZoneId());
    return { ok: true };
  },
});
