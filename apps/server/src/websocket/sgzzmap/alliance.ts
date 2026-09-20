import { SgzzmapRpc } from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { alliance } from "../../kits/sgzzmap/api/alliance/index";
import { sgzzOperation } from "../../kits/sgzzmap/api/territory/index";
import { currentZoneId } from "../../kits/sgzzmap/host";
import { defineRpc } from "../rpc";

export default defineRpc(SgzzmapRpc.Alliance, {
    handler: (ctx, payload) => {
        const sId = currentZoneId();
        return alliance(ctx.uid, sId, payload,
            sgzzOperation(ctx.uid, sId, "alliance", payload.clientReqId, ctx.operation));
    },
});
