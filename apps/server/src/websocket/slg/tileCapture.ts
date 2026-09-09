import { SlgRpc } from "@game/shared/protocol/lobbyRpc/domains/slg";
import { captureTile, slgOperation } from "../../kits/slg/api/worldmap/index";
import { currentZoneId } from "../../kits/slg/host";
import { defineRpc } from "../rpc";

export default defineRpc(SlgRpc.TileCapture, {
  handler: (ctx, payload) => {
    const sId = currentZoneId();
    return captureTile(ctx.uid, sId, payload.tileId, slgOperation(ctx.uid, sId, "capture", payload.clientReqId, ctx.operation));
  },
});
