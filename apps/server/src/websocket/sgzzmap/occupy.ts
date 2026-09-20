import { SgzzmapRpc } from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { occupy, sgzzOperation } from "../../kits/sgzzmap/api/territory/index";
import { currentZoneId } from "../../kits/sgzzmap/host";
import { defineRpc } from "../rpc";

export default defineRpc(SgzzmapRpc.Occupy, {
    handler: (ctx, payload) => {
        const sId = currentZoneId();
        return occupy(ctx.uid, sId, payload.cell,
            sgzzOperation(ctx.uid, sId, "occupy", payload.clientReqId, ctx.operation));
    },
});
