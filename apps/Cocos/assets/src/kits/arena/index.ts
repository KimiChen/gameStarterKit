/**
 * arena kit module（PluginHost 装载单元；由 codegen:plugins 渲染为 plugins.generated 的静态字面量 `load`；
 * 建在本 kit 上的插件在 dependencies 里排在它之后）。install 只做一件事：把宿主 ports 组装成 ArenaRuntime
 * 挂到 holder，注销随 context.own 在 dispose 时逆序执行。两个玩法（arenaCapture / arenaDuel）经 generated
 * gameplay catalog 装载，与本 module 无关。
 */
import type { PluginModule } from "../../app/PluginHost";
import { ArenaRpc } from "../../shared/protocol/lobbyRpc/domains/arena";
import { fetchArenaBoard } from "./api/board/index";
import { setArenaRuntime } from "./logic/arenaRuntime";

const ROUTE_ID = "arena";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            context.own(setArenaRuntime({
                selfUid: () => context.ports.session.getUserId(),
                board: () => fetchArenaBoard(context.ports.lobbyRpc),
                capture: (tile) => context.ports.lobbyRpc.sendIdempotent(ArenaRpc.Capture, { tile }),
                close: () => context.ports.navigation.close(ROUTE_ID),
            }));
        },
    };
}
