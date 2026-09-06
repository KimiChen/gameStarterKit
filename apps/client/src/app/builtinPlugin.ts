/**
 * plugin 描述符 façade（Non-intrusive §7.1 阶段 6）。
 *
 * 描述符数据的唯一真源已迁到 apps/plugins/<id>/plugin.json + View sidecar，经
 * `codegen:plugins` 生成 `generated/plugins.generated.ts`；本文件只做薄 façade：
 * re-export 类型别名 + 组装既有导入面（BUILTIN_PLUGIN / APP_PLUGINS）。
 * 不可序列化件（load 闭包等行为）不进 JSON——留在各消费方手写。
 *
 * route 表语义（继承 5b）：
 *  - group "authenticated"（Login/AreaList/LoginNotice/Home）：原 `closeLobby()` 硬编码
 *    数组的成员与顺序——NavigationService.closeGroup("authenticated") 消费；
 *  - group "system"（Confirm）：会话作用域提示视图，不随 authenticated 组关闭；
 *  - restore：login/home=reopen、areaList/loginNotice/confirm=discard（§7.3）。
 */
import {
    GENERATED_PLUGINS,
    GENERATED_HOST,
    type GeneratedPluginDescriptor,
    type GeneratedHostDescriptor,
} from "../generated/plugins.generated";

export type {
    GeneratedPluginRoute as PluginRouteDescriptor,
    GeneratedMenuContribution as PluginMenuContribution,
    GeneratedLaunchTarget as PluginLaunchTarget,
    GeneratedPluginDescriptor as PluginDescriptor,
    GeneratedHostDescriptor as HostDescriptor,
    GeneratedHostHomeEntry as HostHomeEntry,
} from "../generated/plugins.generated";

/** 应用装配的全部 plugin 描述符（generated 单源）。 */
export const APP_PLUGINS: readonly GeneratedPluginDescriptor[] = GENERATED_PLUGINS;

/** 宿主 placement（apps/plugins/host.json 经 codegen:plugins 生成）：默认玩法 + 首屏入口顺序。 */
export const APP_HOST: GeneratedHostDescriptor = GENERATED_HOST;

function requirePlugin(id: string): GeneratedPluginDescriptor {
    const descriptor = GENERATED_PLUGINS.find((plugin) => plugin.id === id);
    if (!descriptor) throw new Error(`[builtinPlugin] generated catalog 缺少 plugin: ${id}`);
    return descriptor;
}

/** built-in plugin（兼容既有导入面；值来自 generated catalog）。 */
export const BUILTIN_PLUGIN: GeneratedPluginDescriptor = requirePlugin("builtin");

/**
 * 默认 launch target 的玩法 id：**宿主显式声明**（apps/plugins/host.json 的 defaultLaunch，经
 * codegen:plugins 生成为 GENERATED_HOST；生成器校验它必须有唯一贡献者）。
 *
 * ⛔ 不再从菜单排序推导（docs/PLUGIN.md §6.2 / PLUGIN-REVIEW F16：位置声明退役后，排序首条
 * 会静默翻成回归样例 ballMove）。换默认入口 = 改 apps/plugins/host.json + 重跑 codegen:plugins，
 * **零代码改动**（闭合断言见 apps/client/test/homeMenu.test.ts）。⛔ 此处不硬编码任何玩法名。
 */
export const DEFAULT_LAUNCH_GAMEPLAY_ID: string = GENERATED_HOST.defaultLaunch.gameplayId;

/**
 * 默认 launch target 解析：显式 id（Main 的 `gameplayId` @property / AppRuntime options）
 * 优先，未填或纯空白回落到 `DEFAULT_LAUNCH_GAMEPLAY_ID`。
 *
 * 放在本 façade（而不是 AppRuntime）是为了让它**不带 `cc` 依赖**：AppRuntime 的静态图经
 * loginFlow 触达 `cc`，只有在 app harness 的 cc 桩下才可装载；默认入口是纯数据规则，
 * 应当能被普通测试直接装载核对。
 */
export function resolveLaunchGameplayId(explicit: string | null | undefined): string {
    return typeof explicit === "string" && explicit.trim().length > 0
        ? explicit.trim()
        : DEFAULT_LAUNCH_GAMEPLAY_ID;
}
