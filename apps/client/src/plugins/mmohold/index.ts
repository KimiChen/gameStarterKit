import type { PluginModule } from "../../app/PluginHost";

export function createPluginModule(): PluginModule {
    return { install() {} };
}
