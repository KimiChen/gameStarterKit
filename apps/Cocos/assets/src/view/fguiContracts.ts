/**
 * FairyGUI 结构契约（稳定 façade，Non-intrusive §7.5 阶段 6）。
 *
 * 类型定义留在本文件（手写单源）；契约**值**由 `codegen:plugins` 从
 * `<Name>View.view.json` sidecar + FGUI XML 生成到
 * `generated/fguiContracts.generated.ts`，此处只 re-export——本文件不再手改契约内容。
 *
 * - `required` 由生成器按 binding 规则从 XML 计算（与 View AUTO REQUIRED 单源）；
 * - manualRequired/nested/listItems/controllers/relations/assetUrls 的手写唯一真源是
 *   View 同目录的 sidecar；`.fui` 变更后 `npm run codegen:fgui` 重写 AUTO 区块，
 *   `npm --workspace @game/server run codegen:plugins` 刷新本表。
 * - 无头契约测（`test/fguiContract.test.ts`）与 `test/viewRegistry.test.ts` 遍历
 *   generated catalog 做相等校验。方案见 docs/CLIENT.md §5。
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
  /** 生成器按 binding 规则从 XML 计算的直接、带前缀字段；与 View AUTO REQUIRED 单源。 */
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

export {
  AREALIST_CONTRACT,
  CONFIRM_CONTRACT,
  FGUI_CONTRACTS,
  HOME_CONTRACT,
  LOGIN_CONTRACT,
  LOGINNOTICE_CONTRACT,
} from "../generated/fguiContracts.generated";
