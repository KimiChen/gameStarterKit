/**
 * FairyGUI 绑定字段 codegen + 结构契约校验（纯函数，无 fairygui 运行时依赖）。类型词表用 fairygui-cc 的
 * 真实类名（`GButton`/`GTextField`/`GList`/`GLoader`/`GImage`/`GComponent`…），生成的 scaffold 可直接用。
 *
 * - `bindingFields` / `emitAutoFieldBlock`：按命名前缀约定生成 TS 绑定字段（只取有识别前缀者，普通 group 不声明）。
 * - `emitFguiViewScaffold`：首次生成 `FguiView` 子类脚手架（IMPORT/REQUIRED/FIELD/BIND 四个 AUTO 区块）。
 * - `regenerateViewSource`：幂等区块重写——`.fui` 变更后重跑，区块内覆盖、区块外业务代码不动（docs/CLIENT.md 方案 2）。
 * - `checkContract`：给 View 声明的必需字段，断言 `.fui` 组件是否满足（缺失/类型不符）——**结构契约无头把关**。
 * 方案见 docs/CLIENT.md §3/§4；CLI 入口 cli.ts（npm run codegen:fgui）。
 */
import type { FguiComponent, FguiElement } from "./parseFgui";

export interface BindingField {
  name: string;
  tsType: string; // fairygui-cc 类名（GButton/GTextField/...）
}

/** name 前缀 → 生成绑定字段（普通 group 等无识别前缀者不绑，与源项目 genTs.js 一致；
 *  pg/ld3 为 2026-07 对照 kimi 规范包 prefixTypeMap 补齐——art 已有实例此前被静默跳过；
 *  其 sdr/cb/it 三项等真用到再加，ld3 的源项目映射 Loader3D 在 fairygui-cc 里是 GLoader3D）。 */
const RECOGNIZED_PREFIXES = new Set(["btn", "tge", "txt", "ld", "ld3", "lst", "img", "go", "jb", "pg"]);

/** 元素标签 → fairygui-cc 类型。component 按 name 前缀区分 GButton/GProgressBar/GComponent。 */
const TAG_TYPE: Record<string, string> = {
  text: "GTextField", richtext: "GRichTextField", image: "GImage", loader: "GLoader",
  loader3D: "GLoader3D", list: "GList", graph: "GGraph", group: "GGroup", movieclip: "GMovieClip",
};

function prefixOf(name: string): string | undefined {
  const i = name.indexOf("_");
  return i > 0 ? name.slice(0, i) : undefined;
}

/** 元素的**真实 fairygui-cc 类型**（契约比对用，能抓出"loader 却起了 lst_ 名"这类前缀/标签矛盾）。
 *  jb_（嵌套自定义组件）也是 GComponent：kit 没有 UIObjectFactory 扩展机制，运行时就是 GComponent——
 *  早年按 fileName 派生类名（如 CompSeal）会没有 import 来源（IMPORT 只聚合 /^G[A-Z]/），
 *  生成不可编译代码，且类型本身是谎话（评审实证）。 */
export function elementTsType(el: FguiElement): string {
  if (el.tag === "component") {
    const p = prefixOf(el.name);
    if (p === "btn" || p === "tge") { return "GButton"; }
    if (p === "pg") { return "GProgressBar"; } // extention="ProgressBar" 组件引用（如 Login 的 pg_loading）
    return "GComponent";
  }
  return TAG_TYPE[el.tag] ?? el.tag;
}

/** 元素的**绑定类型**（仅当 name 带识别前缀时才绑定；无前缀→undefined=不生成字段）。 */
export function tsTypeOf(el: FguiElement): string | undefined {
  const p = prefixOf(el.name);
  if (!p || !RECOGNIZED_PREFIXES.has(p)) { return undefined; }
  return elementTsType(el);
}

/** 生成绑定字段：只取有识别前缀的元素。 */
export function bindingFields(comp: FguiComponent): BindingField[] {
  const out: BindingField[] = [];
  for (const el of comp.elements) {
    const t = tsTypeOf(el);
    if (t) { out.push({ name: el.name, tsType: t }); }
  }
  return out;
}

/** 产出 AUTO FIELD 块（codegen 管理区，人勿手改）。 */
export function emitAutoFieldBlock(fields: BindingField[]): string {
  const lines = fields.map((f) => `  private ${f.name}!: ${f.tsType};`);
  return ["  // #region AUTO FIELD DONT CHANGE", ...lines, "  // #endregion AUTO FIELD"].join("\n");
}

export interface ScaffoldOpts {
  viewClass: string; // 生成的类名，如 OpponentHudView
  pkg: string;       // FairyGUI 包名
  comp: string;      // FairyGUI 组件名
}

// ── AUTO 区块机械件（docs/CLIENT.md 方案 2：幂等区块重写，借鉴 Sect-TsProject region 纪律）──
// 语法：`// #region AUTO <KIND> DONT CHANGE` … `// #endregion`。区块内容 = codegen 领地
//（重跑即覆盖，⛔ 手改）；区块外 = 业务代码领地（重跑一字不动）。

/** 四个受管区块：IMPORT（fairygui 类导入）/ REQUIRED（PKG/COMP/契约常量）/
 *  FIELD（绑定字段声明）/ BIND（getChild 绑定语句）。 */
export const AUTO_REGION_KINDS = ["IMPORT", "REQUIRED", "FIELD", "BIND"] as const;
export type AutoRegionKind = (typeof AUTO_REGION_KINDS)[number];

const regionBegin = (kind: AutoRegionKind): string => `// #region AUTO ${kind} DONT CHANGE`;
// 结束标记带 kind：通用 `// #endregion` 会与业务代码里手写的折叠标记混淆——BIND 起始标记在而
// 结束标记被误删时，替换会吞到下一个手写 #endregion 为止的业务代码（评审实证），带 kind 则只认自家
const regionEnd = (kind: AutoRegionKind): string => `// #endregion AUTO ${kind}`;

/** 产出某区块的完整文本（含起止标记与缩进）。 */
export function emitAutoRegion(kind: AutoRegionKind, comp: FguiComponent, opts: ScaffoldOpts): string {
  const fields = bindingFields(comp);
  switch (kind) {
    case "IMPORT": {
      const gClasses = [...new Set(fields.map((f) => f.tsType))].filter((t) => /^G[A-Z]/.test(t)).sort();
      const lines = gClasses.length ? [`import { ${gClasses.join(", ")} } from "db://fairygui-cc/fairygui.mjs";`] : [];
      return [regionBegin(kind), ...lines, regionEnd(kind)].join("\n");
    }
    case "REQUIRED": {
      return [
        `  ${regionBegin(kind)}`,
        `  static readonly PKG = ${JSON.stringify(opts.pkg)};`,
        `  static readonly COMP = ${JSON.stringify(opts.comp)};`,
        `  /** 结构契约(fgui-codegen checkContract 用)：本 View 依赖的 .fui 命名元素 + 类型。 */`,
        `  static readonly REQUIRED = ${JSON.stringify(fields)} as const;`,
        `  ${regionEnd(kind)}`,
      ].join("\n");
    }
    case "FIELD":
      return emitAutoFieldBlock(fields);
    case "BIND": {
      const bindLines = fields.map((f) => `    this.${f.name} = this.getChild<${f.tsType}>("${f.name}");`);
      return [`    ${regionBegin(kind)}`, ...bindLines, `    ${regionEnd(kind)}`].join("\n");
    }
  }
}

/** 用新内容整体替换 source 里的某个区块（含标记行；按标记行定位，与缩进无关）。
 *  区块缺失或重复 → throw（文件结构被破坏，宁可停下也不生成错文件）。 */
export function replaceAutoRegion(source: string, kind: AutoRegionKind, block: string): string {
  const lines = source.split("\n");
  const isBegin = (l: string): boolean => l.trim() === regionBegin(kind);
  const beginIdxs = lines.map((l, i) => (isBegin(l) ? i : -1)).filter((i) => i >= 0);
  if (beginIdxs.length === 0) { throw new Error(`AUTO 区块缺失: ${kind}（标记行被删？重新生成脚手架）`); }
  if (beginIdxs.length > 1) { throw new Error(`AUTO 区块重复: ${kind}`); }
  const begin = beginIdxs[0];
  const end = lines.findIndex((l, i) => i > begin && l.trim() === regionEnd(kind));
  if (end < 0) { throw new Error(`AUTO 区块未闭合: ${kind}（缺 ${regionEnd(kind)}）`); }
  return [...lines.slice(0, begin), ...block.split("\n"), ...lines.slice(end + 1)].join("\n");
}

/** 幂等重写：按 `.fui` 当前结构重算四个区块，区块外的手写业务代码一字不动。
 *  同一输入重复调用输出不变；对刚生成的脚手架调用 = 恒等（单测钉死）。 */
export function regenerateViewSource(source: string, comp: FguiComponent, opts: ScaffoldOpts): string {
  let out = source;
  for (const kind of AUTO_REGION_KINDS) {
    out = replaceAutoRegion(out, kind, emitAutoRegion(kind, comp, opts));
  }
  return out;
}

/**
 * 生成一个 `FguiView` 子类脚手架：四个 AUTO 区块 + bind() 骨架。
 * 业务逻辑（apply/onEvent）写在 AUTO 区块外；此后结构变更一律走 regenerateViewSource
 * 幂等重写，⛔ 不重新生成整文件覆盖业务代码。生成物放 typecheck 排除清单（依赖
 * fairygui-cc，Creator 侧验）。
 */
export function emitFguiViewScaffold(comp: FguiComponent, opts: ScaffoldOpts): string {
  return [
    `// AUTO-GENERATED by tools/fgui-codegen — 业务逻辑(apply/onEvent)写在 AUTO 区块外。来源: ui://${opts.pkg}/${opts.comp}`,
    `import { FguiView } from "./FguiView";`,
    emitAutoRegion("IMPORT", comp, opts),
    ``,
    `export class ${opts.viewClass} extends FguiView {`,
    emitAutoRegion("REQUIRED", comp, opts),
    ``,
    emitAutoRegion("FIELD", comp, opts),
    ``,
    `  protected bind(): void {`,
    emitAutoRegion("BIND", comp, opts),
    `  }`,
    `}`,
  ].join("\n") + "\n";
}

export interface ContractResult {
  ok: boolean;
  missing: string[];      // View 依赖但 .fui 里没有的元素名
  mismatched: string[];   // 存在但类型不符（前缀/标签矛盾）
}

/** 结构契约校验：`.fui` 组件是否满足 View 声明的必需字段。缺失/类型不符即违约（设计师改坏 → 测试红）。 */
export function checkContract(comp: FguiComponent, required: readonly BindingField[]): ContractResult {
  const byName = new Map(comp.elements.map((e) => [e.name, e]));
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const r of required) {
    const el = byName.get(r.name);
    if (!el) { missing.push(r.name); continue; }
    const actual = elementTsType(el);
    if (actual !== r.tsType) { mismatched.push(`${r.name}: 期望 ${r.tsType}，实际 ${actual}`); }
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}
