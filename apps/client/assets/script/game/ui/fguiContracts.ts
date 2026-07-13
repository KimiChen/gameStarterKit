/**
 * FairyGUI 结构契约清单（纯数据，零依赖，可无头测）。**这是"代码依赖设计师产出哪些命名元素"的
 * 提交版事实源**：每个 FGUI 视图在此声明它要的元素名 + fairygui-cc 类型。
 *
 * - 无头契约测（`test/fguiContract.test.ts`）解析 `apps/art/fairygui/assets/<Pkg>/<Comp>.xml`，用
 *   `tools/fgui-codegen` 的 `checkContract` 断言满足——设计师删/改名 code 要的元素 → CI 红。
 * - `ui/fgui/<View>.ts`（Creator 侧）从这里 import 同一份契约，避免测试与绑定漂移。
 * 方案见 docs/research/fairgui.md §4。
 *
 * 契约条目模板（新迁一个视图 → 加一条并放进 FGUI_CONTRACTS）：
 *   export const XXX_MAIN_CONTRACT: FguiContract = {
 *     pkg: "Xxx", comp: "XxxMain",
 *     required: [{ name: "lst_xxx", tsType: "GList" }, { name: "txt_title", tsType: "GTextField" }],
 *   };
 */

export interface FguiContract {
  pkg: string;   // FairyGUI 包名
  comp: string;  // 组件名（XML 文件名去 .xml）
  required: ReadonlyArray<{ name: string; tsType: string }>;
}

/** 全部已迁移视图的契约（契约测遍历它，含「组件已 exported」检查）。当前无业务视图。 */
export const FGUI_CONTRACTS: readonly FguiContract[] = [];
