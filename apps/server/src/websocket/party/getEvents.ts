/** party.getEvents——唤醒式推送的自愈拉取端（上线首拉 / 断线重连 / seq 不连续同一路径）。只读。 */
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { getPartyEvents } from "../../core/party/party";
import { defineRpc } from "../rpc";

export default defineRpc(PartyRpc.GetEvents, {
  handler: async (ctx, p) => getPartyEvents(ctx.uid, p.sinceSeq),
});
