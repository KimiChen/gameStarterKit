import type { PluginModule } from "../../app/PluginHost";
import { SgzzmapRpc } from "../../shared/protocol/lobbyRpc/domains/sgzzmap";
import { fetchSgzzTile, fetchSgzzView, fetchSgzzZoom } from "./api/worldmap/index";
import { setSgzzRuntime } from "./logic/sgzzRuntime";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            context.own(setSgzzRuntime({
                selfUid: () => context.ports.session.getUserId(),
                view: (rect) => fetchSgzzView(context.ports.lobbyRpc, rect),
                zoom: (level, rect) => fetchSgzzZoom(context.ports.lobbyRpc, level, rect),
                tile: (cell) => fetchSgzzTile(context.ports.lobbyRpc, cell),
                occupy: (cell) => context.ports.lobbyRpc.sendIdempotent(SgzzmapRpc.Occupy, { cell }),
                abandon: (cell) => context.ports.lobbyRpc.sendIdempotent(SgzzmapRpc.Abandon, { cell }),
                now: () => context.ports.clock.now(),
                tick: (callback) => context.ports.ticker.add(callback),
                close: () => context.ports.navigation.close("sgzzmapWorld"),
            }));
        },
    };
}
