import { SlgRpc } from "@game/shared/protocol/lobbyRpc/domains/slg";
import { dispatchMarch, slgOperation } from "../../kits/slg/api/march/index";
import { currentZoneId } from "../../kits/slg/host";
import { defineRpc } from "../rpc";

export default defineRpc(SlgRpc.MarchDispatch, {
  handler: (ctx, payload) => {
    const sId = currentZoneId();
    return dispatchMarch(ctx.uid, sId, payload.fromTile, payload.toTile, slgOperation(ctx.uid, sId, "dispatch", payload.clientReqId, ctx.operation));
  },
});
