/**
 * mmodemo plugin module（PluginHost 装载单元；codegen:plugins 渲染为 plugins.generated 的静态字面量 `load`，dependencies 里自动排在 mmo kit 之后——
 * 来自 plugin.json 的 requires.kits）。内容包 / 表现映射 / 编排在构建期经贡献点渲染进 kit 的 contributions.generated.ts（MG0）；
 * install 只做一件事（MG1-B2）：把宿主 ports 组装成 MmoDemoRuntime 挂到 holder（自有域 mmodemo.bossBoard 只读 + 关闭 route），注销随 context.own 逆序执行。
 */
import type { PluginModule } from "../../app/PluginHost";
import { MmoDemoRpc } from "../../shared/protocol/lobbyRpc/domains/mmodemo";
import { setMmoDemoRuntime } from "./logic/mmoDemoRuntime";

const ROUTE_ID = "bossBoard";

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            context.own(setMmoDemoRuntime({
                bossBoard: () => context.ports.lobbyRpc.query(MmoDemoRpc.BossBoard, {}),
                close: () => context.ports.navigation.close(ROUTE_ID),
            }));
        },
    };
}
