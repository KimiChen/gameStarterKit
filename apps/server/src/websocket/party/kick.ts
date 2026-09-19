/** party.kick——队长踢人；被踢者也收唤醒（其 party.get 自愈清档字段，⛔ 不跨 uid 取锁）。 */
import { LobbyPush } from "@game/shared";
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { currentZoneId } from "../../core/infra/keys";
import { kickFromParty } from "../../core/party/party";
import { pushToUsers } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(PartyRpc.Kick, {
  handler: async (ctx, p) => {
    const r = await kickFromParty(ctx.uid, p.uid);
    pushToUsers([...r.members, p.uid], LobbyPush.PartyEvent, { seq: r.seq, partyId: r.partyId }, currentZoneId());
    return { ok: true, seq: r.seq };
  },
});
