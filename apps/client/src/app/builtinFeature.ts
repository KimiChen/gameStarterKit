/**
 * feature 描述符 façade（Non-intrusive §7.1 阶段 6）。
 *
 * 描述符数据的唯一真源已迁到 features/<id>/feature.json + View sidecar，经
 * `codegen:features` 生成 `generated/features.generated.ts`；本文件只做薄 façade：
 * re-export 类型别名 + 组装既有导入面（BUILTIN_FEATURE / APP_FEATURES）。
 * 不可序列化件（load 闭包等行为）不进 JSON——留在各消费方手写。
 *
 * route 表语义（继承 5b）：
 *  - group "authenticated"（Login/AreaList/LoginNotice/Home）：原 `closeLobby()` 硬编码
 *    数组的成员与顺序——NavigationService.closeGroup("authenticated") 消费；
 *  - group "system"（Confirm）：会话作用域提示视图，不随 authenticated 组关闭；
 *  - restore：login/home=reopen、areaList/loginNotice/confirm=discard（§7.3）。
 */
import {
    GENERATED_FEATURES,
    GENERATED_MENU_CONTRIBUTIONS,
    type GeneratedFeatureDescriptor,
} from "../generated/features.generated";

export type {
    GeneratedFeatureRoute as FeatureRouteDescriptor,
    GeneratedMenuContribution as FeatureMenuContribution,
    GeneratedLaunchTarget as FeatureLaunchTarget,
    GeneratedFeatureDescriptor as FeatureDescriptor,
} from "../generated/features.generated";

/** 应用装配的全部 feature 描述符（generated 单源）。 */
export const APP_FEATURES: readonly GeneratedFeatureDescriptor[] = GENERATED_FEATURES;

function requireFeature(id: string): GeneratedFeatureDescriptor {
    const descriptor = GENERATED_FEATURES.find((feature) => feature.id === id);
    if (!descriptor) throw new Error(`[builtinFeature] generated catalog 缺少 feature: ${id}`);
    return descriptor;
}

/** built-in feature（兼容既有导入面；值来自 generated catalog）。 */
export const BUILTIN_FEATURE: GeneratedFeatureDescriptor = requireFeature("builtin");

/**
 * 默认 launch target 的玩法 id（§7.4：菜单是入口的唯一数据源）。
 *
 * 取**已排序**菜单贡献的第一条——即 Home 渲染到主入口的那条（排序 slot → order →
 * featureId → entryId 由生成器完成，⛔ 此处不重排、不筛选、不硬编码任何玩法名）。
 * 换默认入口 = 改 `features/<id>/feature.json` 的 slot/order 数值 + 重跑 codegen:features，
 * **零代码改动**（闭合断言见 apps/client/test/homeMenu.test.ts）。
 *
 * 菜单为空是生成器闸挡住的不可达态（FEATURE_IDS 删除保护 + built-in 必有 contribution）；
 * 真为空时回退空串，交给 RoomController.startRegistered 的「未登记玩法 id」拒绝路径报错，
 * ⛔ 不在此处编一个玩法名兜底——那正是本次要消灭的硬编码。
 */
export const DEFAULT_LAUNCH_GAMEPLAY_ID: string = GENERATED_MENU_CONTRIBUTIONS.length > 0
    ? GENERATED_MENU_CONTRIBUTIONS[0].launch.gameplayId
    : "";

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
