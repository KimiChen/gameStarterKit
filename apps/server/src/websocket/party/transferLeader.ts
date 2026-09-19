/** party.transferLeader——队长转让给在队成员。 */
import { LobbyPush } from "@game/shared";
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { currentZoneId } from "../../core/infra/keys";
import { transferLeader } from "../../core/party/party";
import { pushToUsers } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(PartyRpc.TransferLeader, {
  handler: async (ctx, p) => {
    const r = await transferLeader(ctx.uid, p.uid);
    pushToUsers(r.members, LobbyPush.PartyEvent, { seq: r.seq, partyId: r.partyId }, currentZoneId());
    return { ok: true, seq: r.seq };
  },
});
