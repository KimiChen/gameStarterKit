import { SgzzmapRpc } from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { view } from "../../kits/sgzzmap/api/territory/index";
import { currentZoneId } from "../../kits/sgzzmap/host";
import { defineRpc } from "../rpc";

export default defineRpc(SgzzmapRpc.View, {
    handler: (ctx, payload) => view(ctx.uid, currentZoneId(), payload.rect),
});
