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
