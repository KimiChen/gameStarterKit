import type { PluginModule } from "../../app/PluginHost";
import { SlgRpc } from "../../shared/protocol/lobbyRpc/domains/slg";
import { fetchMapTiles } from "./api/worldmap/index";
import { setSlgRuntime } from "./logic/slgRuntime";
export function createPluginModule(): PluginModule {
    return { install(context) {
        context.own(setSlgRuntime({
            selfUid: () => context.ports.session.getUserId(),
            mapTiles: (rect) => fetchMapTiles(context.ports.lobbyRpc, rect),
            capture: (tileId) => context.ports.lobbyRpc.sendIdempotent(SlgRpc.TileCapture, { tileId }),
            now: () => context.ports.clock.now(),
            tick: (callback) => context.ports.ticker.add(callback),
            close: () => context.ports.navigation.close("slgMap"),
        }));
    } };
}
