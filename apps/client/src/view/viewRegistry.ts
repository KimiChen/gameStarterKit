/**
 * 页面注册表（登记点，docs/CLIENT.md 方案 1）——每页面一条 defineView 元数据，ViewMgr 按此接管
 * 生命周期。守门：test/viewRegistry.test.ts 校验「view/*View.ts 文件集合 ⇔ 注册表键」与
 * 「注册表契约 ⇔ FGUI_CONTRACTS」双向相等 + AUTO 区块与 .fui 同步 + Logic 配对。
 *
 * ⚠ 本文件的 load 闭包会让 tsc 解析 View 模块类型（依赖 fairygui），故与 ViewMgr 一起
 *   排除在无头 typecheck 外（apps/client/tsconfig.json），Creator 侧验证。
 *
 * ⚠ 调用方约束（铁律 10）：`ViewMgr.open` 只允许 view/ 内部或动态 import 闭包里调用；
 *   页面的组合根（Logic + 注入 net 依赖 + 导航接线）在 view/pages.ts。
 *
 * 新页面四步动线：FGUI 出图 → `npm run codegen:fgui -- <Pkg> <Comp>` → logic/page/XxxLogic.ts
 *   → 此处加一条（contract 同步进 fguiContracts.FGUI_CONTRACTS）。
 */
import { defineView, type ViewMeta } from "./defineView";
import { AREALIST_CONTRACT, CONFIRM_CONTRACT, HOME_CONTRACT, LOGIN_CONTRACT, LOGINNOTICE_CONTRACT } from "./fguiContracts";

export const VIEW_REGISTRY: Readonly<Record<string, ViewMeta>> = {
  Login: defineView({
    name: "Login", contract: LOGIN_CONTRACT, layer: "base",
    fullscreen: true, onlyOne: true, permanent: false, interactive: true,
    // fairygui 不自动加载依赖包：须声明**传递闭包**（如 btn_login 图标 login_enterGame 在 L10n_zh_hans，
    // 少了它按钮就空白）。清单由 art XML 引用推导，viewRegistry.test 机检 sharedPkgs ⊇ 依赖闭包。
    sharedPkgs: ["ui/Common_Btn", "ui/Common_Component", "ui/Common_RGBA", "ui/Dynamic_Login", "ui/Dynamic_Spine", "ui/L10n_zh_hans"],
    load: () => import("./LoginView").then((m) => m.LoginView),
  }),
  AreaList: defineView({
    name: "AreaList", contract: AREALIST_CONTRACT, layer: "popup",
    fullscreen: true, onlyOne: true, permanent: false, interactive: true,
    // Dynamic_Login：区服状态图标 login_status_*（代码 ui:// 引用，非 art XML 依赖）
    sharedPkgs: ["ui/Common_Btn", "ui/Common_RGBA", "ui/Dynamic_Login"],
    load: () => import("./AreaListView").then((m) => m.AreaListView),
  }),
  LoginNotice: defineView({
    name: "LoginNotice", contract: LOGINNOTICE_CONTRACT, layer: "popup",
    fullscreen: true, onlyOne: true, permanent: false, interactive: true,
    sharedPkgs: ["ui/Common_Btn", "ui/Common_RGBA", "ui/Common_ComboBox", "ui/L10n_zh_hans"],
    load: () => import("./LoginNoticeView").then((m) => m.LoginNoticeView),
  }),
  Home: defineView({
    name: "Home", contract: HOME_CONTRACT, layer: "base",
    fullscreen: true, onlyOne: true, permanent: false, interactive: true,
    sharedPkgs: ["ui/Common_Btn", "ui/Common_RGBA"],
    load: () => import("./HomeView").then((m) => m.HomeView),
  }),
  Confirm: defineView({
    name: "Confirm", contract: CONFIRM_CONTRACT, layer: "top",
    fullscreen: true, onlyOne: false, permanent: false, interactive: true,
    sharedPkgs: ["ui/Common_Btn", "ui/Common_RGBA"],
    load: () => import("./ConfirmView").then((m) => m.ConfirmView),
  }),
};
