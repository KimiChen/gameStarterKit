/**
 * mapOriginal kit 客户端入口。
 *
 * ⚠ v1 **无服务端**：地形随代码（shared 通行层）与资源（BufferAsset 显示层）走，
 *   ⛔ 没有 lobbyRpc 域、没有 SQL、没有 worker。所以这里只接 navigation 一条端口。
 */
import type { PluginModule } from "../../app/PluginHost";
import { setMapoRuntime } from "./logic/mapoRuntime";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            context.own(setMapoRuntime({
                now: () => context.ports.clock.now(),
                tick: (callback) => context.ports.ticker.add(callback),
                close: () => context.ports.navigation.close("mapOriginalWorld"),
            }));
        },
    };
}
