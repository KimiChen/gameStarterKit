import { SgzzmapRpc } from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { zoom } from "../../kits/sgzzmap/api/chunk/index";
import { currentZoneId } from "../../kits/sgzzmap/host";
import { defineRpc } from "../rpc";

export default defineRpc(SgzzmapRpc.Zoom, {
    handler: (ctx, payload) => zoom(ctx.uid, currentZoneId(), payload.level, payload.rect),
});
