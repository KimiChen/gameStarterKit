/** world.resolveTransfer——按 transferId 重取交接凭据（回复丢失 / 重连；MMO MF8-B4）；query。 */
import { WorldRpc } from "@game/shared/protocol/lobbyRpc/domains/world";
import { currentZoneId } from "../../core/infra/keys";
import { handleWorldResolveTransfer } from "../../core/world/enterRpc";
import { defineRpc } from "../rpc";

export default defineRpc(WorldRpc.ResolveTransfer, {
  handler: (ctx, payload) => handleWorldResolveTransfer(ctx.uid, currentZoneId(), payload),
});
