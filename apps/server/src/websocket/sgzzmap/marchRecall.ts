import { SgzzmapRpc } from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { marchRecall } from "../../kits/sgzzmap/api/march/index";
import { sgzzOperation } from "../../kits/sgzzmap/api/territory/index";
import { currentZoneId } from "../../kits/sgzzmap/host";
import { defineRpc } from "../rpc";

export default defineRpc(SgzzmapRpc.MarchRecall, {
    handler: (ctx, payload) => {
        const sId = currentZoneId();
        return marchRecall(ctx.uid, sId, payload.marchId,
            sgzzOperation(ctx.uid, sId, "recall", payload.clientReqId, ctx.operation));
    },
});
