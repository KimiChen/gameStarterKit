/**
 * FairyGUI 结构契约清单（纯数据，零依赖，可无头测）。**这是"代码依赖设计师产出哪些命名元素"的
 * 提交版事实源**：每个 FGUI 视图在此声明它要的元素名 + fairygui-cc 类型。
 *
 * - 无头契约测（`test/viewRegistry.test.ts`）解析 `apps/art/fairygui/assets/<Pkg>/<Comp>.xml`：
 *   注册表 contract ⇔ 本表 ⇔ View 内嵌 REQUIRED 三处字段级相等（改一处漏改另一处即红）。
 * - `view/<View>.ts`（Creator 侧）的 static REQUIRED 由 codegen 生成，须与此处 required 一致。
 * 方案见 docs/CLIENT.md §4。
 *
 * ⚠ 契约必须与 viewRegistry 条目**成对出现**（只加一边必红）；required 由 codegen 决定，
 *   `.fui` 变更后 `npm run codegen:fgui` 重跑并同步此处。
 */

export interface FguiContract {
  pkg: string;   // FairyGUI 包名
  comp: string;  // 组件名（XML 文件名去 .xml）
  required: ReadonlyArray<{ name: string; tsType: string }>;
}

export const LOGIN_CONTRACT: FguiContract = {
  pkg: "View_AreaList_Login", comp: "Login",
  required: [{"name":"ld_logo","tsType":"GLoader"},{"name":"btn_copy","tsType":"GButton"},{"name":"btn_ageTip","tsType":"GButton"},{"name":"btn_musicon","tsType":"GButton"},{"name":"btn_musicoff","tsType":"GButton"},{"name":"btn_notice","tsType":"GButton"},{"name":"btn_account","tsType":"GButton"},{"name":"go_topBtns","tsType":"GGroup"},{"name":"go_top","tsType":"GGroup"},{"name":"txt_progress","tsType":"GTextField"},{"name":"pg_loading","tsType":"GProgressBar"},{"name":"go_bottom","tsType":"GGroup"},{"name":"go_container","tsType":"GComponent"},{"name":"txt_privacy","tsType":"GRichTextField"},{"name":"btn_select","tsType":"GButton"},{"name":"ld3_testAnim","tsType":"GLoader3D"},{"name":"btn_login","tsType":"GButton"},{"name":"btn_server","tsType":"GButton"},{"name":"btn_test","tsType":"GButton"},{"name":"btn_clearDataCache","tsType":"GButton"}],
};

export const AREALIST_CONTRACT: FguiContract = {
  pkg: "View_AreaList_AreaList", comp: "AreaList",
  required: [{"name":"btn_mask","tsType":"GButton"},{"name":"lst_server","tsType":"GList"},{"name":"lst_my","tsType":"GList"},{"name":"jb_tabbar","tsType":"GList"},{"name":"ld_status2","tsType":"GLoader"},{"name":"ld_status1","tsType":"GLoader"},{"name":"ld_status9","tsType":"GLoader"},{"name":"txt_title","tsType":"GTextField"},{"name":"btn_close","tsType":"GButton"}],
};

export const LOGINNOTICE_CONTRACT: FguiContract = {
  pkg: "View_AreaList_LoginNotice", comp: "LoginNotice",
  required: [{"name":"btn_mask","tsType":"GButton"},{"name":"txt_title","tsType":"GTextField"},{"name":"jb_tabbar","tsType":"GComponent"},{"name":"txt_content","tsType":"GTextField"},{"name":"tge_tip","tsType":"GButton"},{"name":"btn_close","tsType":"GButton"}],
};

export const HOME_CONTRACT: FguiContract = {
  pkg: "View_Home_Home", comp: "Home",
  required: [{"name":"txt_userId","tsType":"GTextField"},{"name":"btn_enter","tsType":"GButton"}],
};

export const CONFIRM_CONTRACT: FguiContract = {
  pkg: "View_SharedWidget_Confirm", comp: "Confirm",
  required: [{"name":"go_noBtn","tsType":"GGroup"},{"name":"go_yesBtn","tsType":"GGroup"}],
};

/** 全部已迁移视图的契约（viewRegistry.test.ts 遍历它做三处相等校验）。 */
export const FGUI_CONTRACTS: readonly FguiContract[] = [
  LOGIN_CONTRACT,
  AREALIST_CONTRACT,
  LOGINNOTICE_CONTRACT,
  HOME_CONTRACT,
  CONFIRM_CONTRACT,
];
