/**
 * 竞技场商店 plugin module（PluginHost 装载单元；由 codegen:plugins 渲染为 plugins.generated 的静态字面量 `load`，
 * dependencies 里自动排在 arena kit 之后——来自 plugin.json 的 requires.kits，⛔ 不写两遍）。
 * install 只做一件事：把宿主 ports 组装成 ArenaShopRuntime 挂到 holder，注销随 context.own 在 dispose 时逆序执行。
 * 棋盘只读经 arena kit 的 client board 面 `fetchArenaBoard`（⛔ 不直接点名 kit 的 RPC 路由：wire 契约随
 * `api.board.version`，由 requires.kits 的闸保护），写走本插件自己的 arenaShop 域。
 */
import type { PluginModule } from "../../app/PluginHost";
import { fetchArenaBoard } from "../../kits/arena/api/board/index";
import { ArenaShopRpc } from "../../shared/protocol/lobbyRpc/domains/arenaShop";
import { setArenaShopRuntime } from "./logic/arenaShopRuntime";

const ROUTE_ID = "arenaShop";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            context.own(setArenaShopRuntime({
                selfUid: () => context.ports.session.getUserId(),
                board: () => fetchArenaBoard(context.ports.lobbyRpc),
                buyBoost: (tile) => context.ports.lobbyRpc.sendIdempotent(ArenaShopRpc.BuyBoost, { tile }),
                close: () => context.ports.navigation.close(ROUTE_ID),
            }));
        },
    };
}
