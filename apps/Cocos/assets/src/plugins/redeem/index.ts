/**
 * 兑换码 plugin module（PluginHost 装载单元；由 codegen:plugins 渲染为
 * plugins.generated 的静态字面量 `load`）。install 只做一件事：把宿主 ports 组装成
 * RedeemRuntime 挂到 holder，注销随 context.own 在 dispose 时逆序执行。
 */
import type { PluginModule } from "../../app/PluginHost";
import { RedeemRpc } from "../../shared/protocol/lobbyRpc/domains/redeem";
import { setRedeemRuntime } from "./logic/redeemRuntime";

const ROUTE_ID = "redeem";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            context.own(setRedeemRuntime({
                claim: (code) => context.ports.lobbyRpc.sendIdempotent(RedeemRpc.Claim, { code }),
                close: () => context.ports.navigation.close(ROUTE_ID),
            }));
        },
    };
}
