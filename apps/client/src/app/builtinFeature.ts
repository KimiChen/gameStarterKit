/**
 * built-in feature 描述符（Non-intrusive §7.1/§7.2 阶段 5b）。
 *
 * ⚠ 本文件是**手写** descriptor——阶段 6 改为 `codegen:features` 产物（生成式
 * Feature Catalog），届时本文件被 generated catalog 取代，路由/贡献声明迁入
 * feature 单源目录。在那之前它是 FeatureRegistry 的唯一数据源。
 *
 * route 表继承今天 view/pages.ts 的五个页面：
 *  - group "authenticated"（Login/AreaList/LoginNotice/Home）：即原 `closeLobby()`
 *    硬编码数组的成员与顺序——NavigationService.closeGroup("authenticated") 取代
 *    该数组（§7.2：新 feature 不得再进硬编码数组）。
 *  - group "system"（Confirm）：会话作用域提示视图，不随 authenticated 组关闭，
 *    也不受 discard 恢复策略影响（回登录提示链）。
 *
 * 恢复策略（§7.3：临时 popup 默认 discard，显式声明才 reopen）：
 *  login/home=reopen（最终断线恢复后重开）、areaList/loginNotice=discard、
 *  confirm=discard（多实例提示不跨会话恢复）。
 */

/** 单条业务路由声明：view 名对应 VIEW_REGISTRY 键。 */
export interface FeatureRouteDescriptor {
    readonly id: string;
    readonly view: string;
    readonly group: string;
    readonly restore: "keep-mounted" | "reopen" | "fallback" | "discard";
}

/** Home 菜单入口贡献（§7.4 数据驱动 Home 的数据源雏形；阶段 6 由 composer 消费）。 */
export interface FeatureMenuContribution {
    readonly id: string;
    readonly featureId: string;
    readonly label: string;
    readonly gameplayId?: string;
}

export interface FeatureDescriptor {
    readonly id: string;
    /** 常驻 feature：不随 route refcount 归零释放（built-in 即是）。 */
    readonly resident?: boolean;
    /** dispose 逆序依据：本 feature 依赖的其它 feature id。 */
    readonly dependencies?: readonly string[];
    readonly routes: readonly FeatureRouteDescriptor[];
    readonly menu: readonly FeatureMenuContribution[];
}

export const BUILTIN_FEATURE: FeatureDescriptor = {
    id: "builtin",
    resident: true,
    routes: [
        // 顺序即 closeGroup 关闭顺序——逐字继承原 closeLobby() 数组顺序。
        { id: "login", view: "Login", group: "authenticated", restore: "reopen" },
        { id: "areaList", view: "AreaList", group: "authenticated", restore: "discard" },
        { id: "loginNotice", view: "LoginNotice", group: "authenticated", restore: "discard" },
        { id: "home", view: "Home", group: "authenticated", restore: "reopen" },
        { id: "confirm", view: "Confirm", group: "system", restore: "discard" },
    ],
    menu: [
        { id: "ballMove", featureId: "builtin", label: "进入战斗", gameplayId: "ballMove" },
    ],
};
