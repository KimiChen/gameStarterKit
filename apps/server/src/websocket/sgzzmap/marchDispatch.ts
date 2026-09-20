import { SgzzmapRpc } from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { marchDispatch } from "../../kits/sgzzmap/api/march/index";
import { sgzzOperation } from "../../kits/sgzzmap/api/territory/index";
import { currentZoneId } from "../../kits/sgzzmap/host";
import { defineRpc } from "../rpc";

export default defineRpc(SgzzmapRpc.MarchDispatch, {
    handler: (ctx, payload) => {
        const sId = currentZoneId();
        return marchDispatch(ctx.uid, sId, payload.path,
            sgzzOperation(ctx.uid, sId, "dispatch", payload.clientReqId, ctx.operation));
    },
});
