/**
 * mmo kit module（PluginHost 装载单元；由 codegen:plugins 渲染为 plugins.generated 的静态字面量 `load`；resident：登录后即装载，
 * 建在本 kit 上的内容插件在 dependencies 里排在它之后）。install 只做一件事：把宿主 ports 组装成 MmoRuntime 挂到 holder
 * （选角页与 mmoWorld joiner 读取），注销随 context.own 在 dispose 时逆序执行。玩法 mmoWorld 经 generated gameplay catalog 装载。
 */
import type { PluginModule } from "../../app/PluginHost";
import { createCharacter, fetchCharacters } from "./api/characters/index";
import { enterWorld } from "./api/world/index";
import { setMmoRuntime } from "./logic/mmoRuntime";

const ROUTE_ID = "mmoCharacters";
const WORLD_GAMEPLAY_ID = "mmoWorld";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            context.own(setMmoRuntime({
                selfUid: () => context.ports.session.getUserId(),
                characters: () => fetchCharacters(context.ports.lobbyRpc),
                createCharacter: (input) => createCharacter(context.ports.lobbyRpc, input),
                enterWorld: (personaId, mapId) => enterWorld(context.ports.lobbyRpc, personaId, mapId),
                launchWorld: (characterId, mapId, transfer) => context.ports.launch.launch({ kind: "gameplay", gameplayId: WORLD_GAMEPLAY_ID, payload: { characterId, mapId, ...(transfer ? { transfer } : {}) } }),
                close: () => context.ports.navigation.close(ROUTE_ID),
            }));
        },
    };
}
