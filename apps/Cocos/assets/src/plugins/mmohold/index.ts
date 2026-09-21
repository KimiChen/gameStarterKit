/** 将宿主只读 RPC / route 关闭接入 mmohold 自有比分页。 */
import type { PluginModule } from "../../app/PluginHost";
import { MmoHoldRpc } from "../../shared/protocol/lobbyRpc/domains/mmohold";
import { MMO_HOLD_MAP_ID } from "../../shared/protocol/lobbyRpc/domains/mmohold";
import { createCharacter, fetchCharacters } from "../../kits/mmo/api/characters/index";
import { setMmoHoldRuntime } from "./logic/mmoHoldRuntime";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            context.own(setMmoHoldRuntime({
                standings: () => context.ports.lobbyRpc.query(MmoHoldRpc.Standings, {}),
                selfUid: () => context.ports.session.getUserId(),
                characters: () => fetchCharacters(context.ports.lobbyRpc),
                createCharacter: (input) => createCharacter(context.ports.lobbyRpc, input),
                enter: (characterId) => context.ports.launch.launch({ kind: "gameplay", gameplayId: "mmoWorld", payload: { characterId, mapId: MMO_HOLD_MAP_ID } }),
                close: () => context.ports.navigation.close("standings"),
            }));
        },
    };
}
