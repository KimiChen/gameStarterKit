import { SlgRpc } from "@game/shared/protocol/lobbyRpc/domains/slg";
import { readTiles } from "../../kits/slg/api/worldmap/index";
import { currentZoneId } from "../../kits/slg/host";
import { defineRpc } from "../rpc";

export default defineRpc(SlgRpc.MapTiles, {
  handler: (ctx, payload) => readTiles(ctx.uid, currentZoneId(), payload.rect),
});
