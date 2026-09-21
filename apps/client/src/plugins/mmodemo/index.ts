/**
 * mmodemo plugin module（PluginHost 装载单元；codegen:plugins 渲染为 plugins.generated 的静态字面量 `load`，dependencies 里自动排在 mmo kit 之后——
 * 来自 plugin.json 的 requires.kits）。MG0 = 纯内容插件：内容包 / 表现映射 / 编排都在构建期经贡献点渲染进 kit 的 contributions.generated.ts，
 * 客户端无自有 UI（可选域页面 bossBoard 归 MG1-B2）。
 */
import type { PluginModule } from "../../app/PluginHost";

export function createPluginModule(): PluginModule {
    return {
        install() {
            // 无客户端能力：贡献在构建期已渲染进 kit 的 contributions.generated.ts
        },
    };
}
