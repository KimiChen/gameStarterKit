import { SgzzmapRpc } from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { abandon, sgzzOperation } from "../../kits/sgzzmap/api/territory/index";
import { currentZoneId } from "../../kits/sgzzmap/host";
import { defineRpc } from "../rpc";

export default defineRpc(SgzzmapRpc.Abandon, {
    handler: (ctx, payload) => {
        const sId = currentZoneId();
        return abandon(ctx.uid, sId, payload.cell,
            sgzzOperation(ctx.uid, sId, "abandon", payload.clientReqId, ctx.operation));
    },
});
