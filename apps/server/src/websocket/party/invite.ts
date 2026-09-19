/** party.invite——邀请在线同区玩家；成员收 party.event 唤醒，被邀请者收带内容的 party.invited。 */
import { LobbyPush } from "@game/shared";
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { currentZoneId } from "../../core/infra/keys";
import { inviteToParty } from "../../core/party/party";
import { pushToUsers } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(PartyRpc.Invite, {
  handler: async (ctx, p) => {
    const sId = currentZoneId();
    const r = await inviteToParty(ctx.uid, p.uid);
    pushToUsers(r.members, LobbyPush.PartyEvent, { seq: r.seq, partyId: r.partyId }, sId);
    pushToUsers([p.uid], LobbyPush.PartyInvited, { partyId: r.partyId, by: ctx.uid, expAt: r.expAt }, sId);
    return { ok: true, seq: r.seq, expAt: r.expAt };
  },
});
