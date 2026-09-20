/** party.leave——离队；队长离开由最早成员接任，最后一人离开解散（五键全无）。 */
import { LobbyPush } from "@game/shared";
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { currentZoneId } from "../../core/infra/keys";
import { leaveParty } from "../../core/party/party";
import { pushToUsers } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(PartyRpc.Leave, {
  handler: async (ctx) => {
    const r = await leaveParty(ctx.uid);
    if (!r.disbanded) pushToUsers(r.members, LobbyPush.PartyEvent, { seq: r.seq, partyId: r.partyId }, currentZoneId());
    return { ok: true, disbanded: r.disbanded };
  },
});
