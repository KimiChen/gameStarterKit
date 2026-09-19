/** chat.send——realm / party 频道发言（MMO.md §6.5）；出站经投递总线（发送者也收到回显），⛔ 无 history。 */
import { LobbyPush } from "@game/shared";
import { ChatRpc } from "@game/shared/protocol/lobbyRpc/domains/chat";
import { sendChat } from "../../core/chat/send";
import { currentZoneId } from "../../core/infra/keys";
import { memberUids } from "../../core/party/party";
import { pushToRealm, pushToUsers } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(ChatRpc.Send, {
  handler: async (ctx, p) => {
    const sId = currentZoneId();
    const r = await sendChat(ctx.uid, sId, p);
    if (r.audience.kind === "realm") {
      pushToRealm(sId, LobbyPush.ChatMessage, r.message);
    } else {
      pushToUsers(await memberUids(r.audience.partyId), LobbyPush.ChatMessage, r.message, sId);
    }
    return { msgId: r.message.msgId, at: r.message.at };
  },
});
