import { SlgRpc } from "@game/shared/protocol/lobbyRpc/domains/slg";
import { recallMarch, slgOperation } from "../../kits/slg/api/march/index";
import { currentZoneId } from "../../kits/slg/host";
import { defineRpc } from "../rpc";

export default defineRpc(SlgRpc.MarchRecall, {
  handler: (ctx, payload) => {
    const sId = currentZoneId();
    return recallMarch(ctx.uid, sId, payload.marchId, slgOperation(ctx.uid, sId, "recall", payload.clientReqId, ctx.operation));
  },
});
