/**
 * FairyGUI 结构契约清单（纯数据，零依赖，可无头测）。**这是"代码依赖设计师产出哪些命名元素"的
 * 提交版事实源**：每个 FGUI 视图在此声明它要的元素名 + fairygui-cc 类型。
 *
 * - 无头契约测（`test/fguiContract.test.ts`）解析 `apps/art/fairygui/assets/<Pkg>/<Comp>.xml`：
 *   注册表 contract ⇔ 本表 ⇔ View 内嵌 REQUIRED 三处字段级相等（改一处漏改另一处即红）。
 * - `view/<View>.ts`（Creator 侧）的 static REQUIRED 由 codegen 生成，须与此处 required 一致。
 * 方案见 docs/CLIENT.md §5。
 *
 * ⚠ 契约必须与 viewRegistry 条目**成对出现**（只加一边必红）；required 由 codegen 决定，
 *   `.fui` 变更后 `npm run codegen:fgui` 重跑并同步此处。
 */

/** 一个命名 UI 元素的类型契约。`path` 只给嵌套 source 使用，直接元素省略。 */
export interface FguiFieldContract {
  name: string;
  tsType: string;
  path?: string;
}

/** 稳定布局关系契约；`count` 用于同一 sidePair 的重复关系。 */
export interface FguiRelationContract {
  owner?: string;
  target?: string;
  sidePair?: string;
  count?: number;
}

/** 外部/嵌套组件的显式契约。`path` 是从页面根开始的稳定运行时路径。 */
export interface FguiNestedContract {
  path: string;
  /** 组件资源的 ui:// URL（可解析到 package.xml 的 resource id）。 */
  source: string;
  required: ReadonlyArray<FguiFieldContract>;
  controllers?: ReadonlyArray<string>;
  relations?: ReadonlyArray<FguiRelationContract>;
}

/** 列表 defaultItem 的显式契约；字段路径相对于 defaultItem 模板根。 */
export interface FguiListItemContract {
  /** 页面根开始的列表路径，例如 `jb_tabbar.lst_jb`。 */
  listPath: string;
  /** 必须与 list 元素的 defaultItem 完全相等。 */
  defaultItem: string;
  required: ReadonlyArray<FguiFieldContract>;
  controllers?: ReadonlyArray<string>;
  relations?: ReadonlyArray<FguiRelationContract>;
}

export interface FguiContract {
  pkg: string;   // FairyGUI 包名
  comp: string;  // 组件名（XML 文件名去 .xml）
  /** codegen 生成的直接、带前缀字段；必须与 View AUTO REQUIRED 保持字节级一致。 */
  required: ReadonlyArray<FguiFieldContract>;
  /** 直接但未遵循前缀约定的手写 getChild（例如 Confirm 的 title/yesBtn）。 */
  manualRequired?: ReadonlyArray<FguiFieldContract>;
  /** 外部 component 的字段/控制器依赖。 */
  nested?: ReadonlyArray<FguiNestedContract>;
  /** 所有运行时使用（或需要保持可实例化）的 list defaultItem 模板。 */
  listItems?: ReadonlyArray<FguiListItemContract>;
  /** 页面根组件直接读取的 controller 名称。 */
  controllers?: ReadonlyArray<string>;
  /** 页面根组件依赖的稳定布局关系。 */
  relations?: ReadonlyArray<FguiRelationContract>;
  /** View 业务代码显式装载/换图的 ui:// 资源（XML 内资源由 manifest 另行覆盖）。 */
  assetUrls?: ReadonlyArray<string>;
}

export const LOGIN_CONTRACT: FguiContract = {
  pkg: "View_AreaList_Login", comp: "Login",
  required: [{"name":"ld_logo","tsType":"GLoader"},{"name":"btn_copy","tsType":"GButton"},{"name":"btn_ageTip","tsType":"GButton"},{"name":"btn_musicon","tsType":"GButton"},{"name":"btn_musicoff","tsType":"GButton"},{"name":"btn_notice","tsType":"GButton"},{"name":"btn_account","tsType":"GButton"},{"name":"go_topBtns","tsType":"GGroup"},{"name":"go_top","tsType":"GGroup"},{"name":"txt_progress","tsType":"GTextField"},{"name":"pg_loading","tsType":"GProgressBar"},{"name":"go_bottom","tsType":"GGroup"},{"name":"go_container","tsType":"GComponent"},{"name":"txt_privacy","tsType":"GRichTextField"},{"name":"btn_select","tsType":"GButton"},{"name":"ld3_testAnim","tsType":"GLoader3D"},{"name":"btn_login","tsType":"GButton"},{"name":"btn_server","tsType":"GButton"},{"name":"btn_test","tsType":"GButton"},{"name":"btn_clearDataCache","tsType":"GButton"}],
  controllers: ["view", "mode", "read"],
  relations: [
    { sidePair: "bottom-bottom", count: 8 },
    { sidePair: "width-width,bottom-bottom" },
    { sidePair: "top-top" },
  ],
  assetUrls: ["ui://L10n_zh_hans/login_logo"],
};

export const AREALIST_CONTRACT: FguiContract = {
  pkg: "View_AreaList_AreaList", comp: "AreaList",
  required: [{"name":"btn_mask","tsType":"GButton"},{"name":"lst_server","tsType":"GList"},{"name":"lst_my","tsType":"GList"},{"name":"jb_tabbar","tsType":"GList"},{"name":"ld_status2","tsType":"GLoader"},{"name":"ld_status1","tsType":"GLoader"},{"name":"ld_status9","tsType":"GLoader"},{"name":"txt_title","tsType":"GTextField"},{"name":"btn_close","tsType":"GButton"}],
  relations: [{ sidePair: "center-center,middle-middle", count: 3 }],
  listItems: [
    {
      listPath: "jb_tabbar",
      defaultItem: "ui://fk4x5zk1lsnn2",
      required: [
        { name: "txt_title1", tsType: "GTextField" },
        { name: "txt_title2", tsType: "GTextField" },
        { name: "go_open", tsType: "GGroup" },
        { name: "go_close", tsType: "GGroup" },
      ],
      controllers: ["lib"],
      relations: [{ sidePair: "height-height,center-center" }],
    },
    {
      listPath: "lst_server",
      defaultItem: "ui://fk4x5zk1lsnn1",
      required: [
        { name: "txt_serverName", tsType: "GTextField" },
        { name: "go_new", tsType: "GGroup" },
        { name: "go_full", tsType: "GGroup" },
        { name: "ld_status", tsType: "GLoader" },
        { name: "txt_openTime", tsType: "GTextField" },
      ],
    },
    {
      // AreaList currently leaves this tab as a presentation placeholder, but
      // its exported defaultItem is still part of the page's loadable graph.
      listPath: "lst_my",
      defaultItem: "ui://fk4x5zk1th7va",
      required: [
        { name: "txt_uName", tsType: "GTextField" },
        { name: "ld_status", tsType: "GLoader" },
        { name: "txt_serverName", tsType: "GTextField" },
        { name: "txt_openTime", tsType: "GTextField" },
      ],
    },
  ],
  assetUrls: [
    "ui://Dynamic_Login/login_status_1",
    "ui://Dynamic_Login/login_status_2",
    "ui://Dynamic_Login/login_status_9",
  ],
};

export const LOGINNOTICE_CONTRACT: FguiContract = {
  pkg: "View_AreaList_LoginNotice", comp: "LoginNotice",
  required: [{"name":"btn_mask","tsType":"GButton"},{"name":"txt_title","tsType":"GTextField"},{"name":"jb_tabbar","tsType":"GComponent"},{"name":"txt_content","tsType":"GTextField"},{"name":"tge_tip","tsType":"GButton"},{"name":"btn_close","tsType":"GButton"}],
  relations: [{ sidePair: "center-center,middle-middle", count: 3 }],
  nested: [
    {
      path: "jb_tabbar",
      source: "ui://22ylet4nph1yh",
      required: [{ name: "lst_jb", tsType: "GList" }],
    },
  ],
  listItems: [
    {
      listPath: "jb_tabbar.lst_jb",
      defaultItem: "ui://22ylet4nph1yi",
      required: [
        { name: "txt_off", tsType: "GTextField" },
        { name: "txt_on", tsType: "GTextField" },
        { name: "img_on", tsType: "GImage" },
        { name: "img_off", tsType: "GImage" },
      ],
    },
  ],
};

export const HOME_CONTRACT: FguiContract = {
  pkg: "View_Home_Home", comp: "Home",
  required: [{"name":"txt_userId","tsType":"GTextField"},{"name":"btn_enter","tsType":"GButton"}],
};

export const CONFIRM_CONTRACT: FguiContract = {
  pkg: "View_SharedWidget_Confirm", comp: "Confirm",
  required: [{"name":"go_noBtn","tsType":"GGroup"},{"name":"go_yesBtn","tsType":"GGroup"}],
  relations: [
    { sidePair: "center-center" },
    { sidePair: "center-center,middle-middle" },
  ],
  manualRequired: [
    { name: "title", tsType: "GTextField" },
    { name: "content", tsType: "GRichTextField" },
    { name: "yesBtn", tsType: "GButton" },
    { name: "noBtn", tsType: "GButton" },
  ],
};

/** 全部已迁移视图的契约（viewRegistry.test.ts 遍历它做三处相等校验）。 */
export const FGUI_CONTRACTS: readonly FguiContract[] = [
  LOGIN_CONTRACT,
  AREALIST_CONTRACT,
  LOGINNOTICE_CONTRACT,
  HOME_CONTRACT,
  CONFIRM_CONTRACT,
];
