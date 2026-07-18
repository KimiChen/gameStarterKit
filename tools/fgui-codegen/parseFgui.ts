/**
 * FairyGUI 组件 XML 的**最小零依赖解析器**（结构契约的事实源解析）。
 *
 * FairyGUI 编辑器把每个组件存成文本 XML（`apps/art/fairygui/assets/<Pkg>/<Comp>.xml`），`<displayList>` 下
 * 是该组件的直接子元素（text/image/loader/list/component/...），每个带 `name`。本解析器只取 displayList
 * 的**直接子元素**（list 的 item、button 的配置等嵌套内容不计），供 codegen 生成绑定字段 / 契约校验。
 * 纯函数、无渲染、无 fairygui 运行时依赖 → 可无头单测（见 fgui-codegen.test.ts）。
 * 方案见 docs/CLIENT.md §4。
 */

/** displayList 里的一个 UI 元素。 */
export interface FguiElement {
  name: string;
  tag: string;         // text/richtext/image/loader/list/graph/group/component/movieclip
  fileName?: string;   // component/loader 引用的资源文件(如 Button.xml → 判 Button/自定义类型)
}

export interface FguiComponent {
  elements: FguiElement[];
}

/** FairyGUI displayList 支持的元素标签（用于识别 UI 元素、忽略 relation/item 等配置节点）。 */
const ELEMENT_TAGS = new Set([
  "text", "richtext", "image", "loader", "list", "graph", "group", "component", "movieclip",
]);

/** 解析组件 XML → displayList 直接子元素清单。容错:无 displayList 时对全文兜底扫描。 */
export function parseFguiComponent(xml: string): FguiComponent {
  const dl = /<displayList>([\s\S]*?)<\/displayList>/.exec(xml);
  const body = dl ? dl[1] : xml;
  const elements: FguiElement[] = [];
  let depth = 0; // 只按"元素标签"计嵌套深度;非元素节点(relation/item/Button 配置)不影响
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)\b([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body)) !== null) {
    const [, close, tag, attrs, selfClose] = m;
    const isElement = ELEMENT_TAGS.has(tag);
    if (close) {
      if (isElement) { depth = Math.max(0, depth - 1); }
      continue;
    }
    if (depth === 0 && isElement) {
      const name = attr(attrs, "name");
      if (name) { elements.push({ name, tag, fileName: attr(attrs, "fileName") }); }
    }
    if (isElement && !selfClose) { depth += 1; } // 非自闭合元素 → 进入其内层(list item 等)
  }
  return { elements };
}

function attr(attrs: string, key: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${key}="([^"]*)"`).exec(attrs);
  return m ? m[1] : undefined;
}
