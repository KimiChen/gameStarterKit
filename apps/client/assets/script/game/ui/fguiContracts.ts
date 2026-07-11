/**
 * FairyGUI 结构契约清单（纯数据，零依赖，可无头测）。**这是"代码依赖设计师产出哪些命名元素"的
 * 提交版事实源**：每个 FGUI 视图在此声明它要的元素名 + fairygui-cc 类型。
 *
 * - 无头契约测（`test/fguiContract.test.ts`）解析 `apps/art/fairygui/assets/<Pkg>/<Comp>.xml`，用
 *   `tools/fgui-codegen` 的 `checkContract` 断言满足——设计师删/改名 code 要的元素 → CI 红。
 * - `ui/fgui/<View>.ts`（Creator 侧）从这里 import 同一份契约，避免测试与绑定漂移。
 * 方案见 docs/research/fairgui.md §4。
 */

export interface FguiContract {
  pkg: string;   // FairyGUI 包名
  comp: string;  // 组件名（XML 文件名去 .xml）
  required: ReadonlyArray<{ name: string; tsType: string }>;
}

/** 排行榜主面板：虚拟列表 + 标题。btn_country/btn_province/btn_close 现为占位 graph，
 *  设计师换成真 GButton 后再补进契约（现映射到 GComponent，先不强约束）。 */
export const RANK_MAIN_CONTRACT: FguiContract = {
  pkg: "Rank",
  comp: "RankMain",
  required: [
    { name: "lst_rank", tsType: "GList" },
    { name: "txt_title", tsType: "GTextField" },
  ],
};

/** 排行榜单行：presenter `rankView` 绑定的命名元素。文本 + 榜单专属美术(奖牌/头像框/星级,已从原版反编译图集抽入
 *  本包 art/,忠实原版)。RankView.renderInto 代码驱动 loader.url/visible(无控制器)。设计师改名/删元素 → 契约测红。 */
export const RANK_ITEM_CONTRACT: FguiContract = {
  pkg: "Rank",
  comp: "RankItem",
  required: [
    { name: "img_bg", tsType: "GImage" },
    { name: "img_bg0", tsType: "GImage" },
    { name: "img_bg1", tsType: "GImage" },
    { name: "img_bg2", tsType: "GImage" },
    { name: "img_bgSelf", tsType: "GImage" },
    { name: "ld_medal", tsType: "GLoader" },
    { name: "txt_rankNum", tsType: "GTextField" },
    { name: "img_avatarBg", tsType: "GImage" },
    { name: "ld_avatar", tsType: "GLoader" },
    { name: "txt_name", tsType: "GTextField" },
    { name: "txt_province", tsType: "GTextField" },
    { name: "txt_rankTitle", tsType: "GTextField" },
    { name: "ld_star0", tsType: "GLoader" },
    { name: "ld_star1", tsType: "GLoader" },
    { name: "ld_star2", tsType: "GLoader" },
    { name: "ld_star3", tsType: "GLoader" },
    { name: "ld_star4", tsType: "GLoader" },
    { name: "ld_bigStar", tsType: "GLoader" },
    { name: "txt_level", tsType: "GTextField" },
  ],
};

/** 全部已迁移视图的契约（契约测遍历它）。新迁一个视图 → 加一条。 */
export const FGUI_CONTRACTS: readonly FguiContract[] = [
  RANK_MAIN_CONTRACT,
  RANK_ITEM_CONTRACT,
];
