/**
 * snake plugin module（PluginHost 装载单元；由 codegen:plugins 渲染为 plugins.generated
 * 的静态字面量 `load`）。install 只做一件事：把宿主 ports 组装成衣柜运行时挂到 holder，
 * 注销随 context.own 在 dispose 时逆序执行。
 *
 * ⚠ 衣柜（原 snakeCosmetic plugin）已并入 snake：域仍叫 snakeCosmetic（协议不变），
 * 但入口从设置面板菜单项挪到了**结算页**，见 ./logic/snakeCosmeticRuntime.ts 的说明。
 *
 * ⚠ 三条路由都走 `query`：getSnapshot 是 query，equip/unlock 是 **natural-write**——
 * natural-write 不在 `LobbyRpcIdemType` 里，⛔ 调不到（也不需要）sendIdempotent 的
 * journal write-ahead，重复执行由服务端 store 的 no-op 语义保证安全。
 */
import type { PluginModule } from "../../app/PluginHost";
import { SnakeCosmeticRpc } from "../../shared/protocol/lobbyRpc/domains/snakeCosmetic";
import { setSnakeCosmeticRuntime } from "./logic/snakeCosmeticRuntime";

const ROUTE_ID = "snakeCosmetic";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            const rpc = context.ports.lobbyRpc;
            context.own(setSnakeCosmeticRuntime({
                getSnapshot: () => rpc.query(SnakeCosmeticRpc.GetSnapshot, {}),
                equip: (skinId) => rpc.query(SnakeCosmeticRpc.Equip, { skinId }),
                unlock: (skinId) => rpc.query(SnakeCosmeticRpc.Unlock, { skinId }),
                open: () => context.ports.navigation.open(ROUTE_ID).then(() => undefined),
                close: () => context.ports.navigation.close(ROUTE_ID),
            }));
        },
    };
}
