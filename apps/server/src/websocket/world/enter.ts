/** world.enter——签发世界房一次性准入凭据（MMO MF8-B4）；query：凭据可丢弃，权威准入在 WorldRoom。 */
import { WorldRpc } from "@game/shared/protocol/lobbyRpc/domains/world";
import { currentZoneId } from "../../core/infra/keys";
import { handleWorldEnter } from "../../core/world/enterRpc";
import { defineRpc } from "../rpc";

export default defineRpc(WorldRpc.Enter, {
  handler: (ctx, payload) => handleWorldEnter(ctx.uid, currentZoneId(), payload),
});
