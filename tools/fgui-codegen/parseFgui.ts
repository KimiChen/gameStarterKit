/**
 * FairyGUI 组件 XML 的**最小零依赖解析器**（结构契约的事实源解析）。
 *
 * FairyGUI 编辑器把每个组件存成文本 XML（`apps/art/fairygui/assets/<Pkg>/<Comp>.xml`），`<displayList>` 下
 * 是该组件的直接子元素（text/image/loader/list/component/...），每个带 `name`。`elements` 继续只保留
 * displayList 的**直接子元素**，保证现有 AUTO 绑定稳定；同时返回 `children`/`nestedElements`，供列表
 * item、嵌套 component 和手写 getChild 契约做递归校验。解析器不依赖 DOM/Node XML 包，Creator 和
 * Node 22 都能使用。
 * 方案见 docs/CLIENT.md §5。
 */

/** displayList 里的一个 UI 元素。 */
export interface FguiElement {
  name: string;
  tag: string;         // text/richtext/image/loader/list/graph/group/component/movieclip
  fileName?: string;   // component/loader 引用的资源文件(如 Button.xml → 判 Button/自定义类型)
  pkg?: string;
  /** 直接子元素的递归结构；旧调用方只读取 name/tag，不受影响。 */
  children?: FguiElement[];
  /** 从当前组件根开始的稳定路径（例如 `lst_rows.txt_title`）。 */
  path?: string;
  /** list 的 defaultItem URL（仅部分元素存在）。 */
  defaultItem?: string;
  /** list 内显式 `<item>` 模板数量。 */
  itemCount?: number;
  /** list/item 中声明的资源 URL（保留原始值，供依赖闭包检查）。 */
  itemUrls?: string[];
}

export interface FguiComponent {
  elements: FguiElement[];
  /** 所有命名嵌套元素（不含 `elements` 自身），按 XML 深度优先顺序排列。 */
  nestedElements: FguiElement[];
  controllers: FguiController[];
  relations: FguiRelation[];
  /** 组件及其嵌套元素中出现的 ui:// 资源引用。 */
  assetReferences: FguiAssetReference[];
}

export interface FguiController {
  name: string;
  pages?: string;
  selected?: number;
}

export interface FguiRelation {
  owner?: string;
  target?: string;
  sidePair?: string;
}

export interface FguiAssetReference {
  url: string;
  ownerPath?: string;
}

/** FairyGUI displayList 支持的元素标签（用于识别 UI 元素、忽略 relation/item 等配置节点）。 */
const ELEMENT_TAGS = new Set([
  "text", "richtext", "image", "loader", "loader3D", "list", "graph", "group", "component", "movieclip",
]);

/**
 * XML 中包裹元素但不代表一个运行时对象的节点。FairyGUI 的版本/导出器
 * 偶尔会在组件或 list item 外再包一层 displayList/children；穿过这些层
 * 才能让显式嵌套契约稳定，而不会把 relation/gear 等配置误当元素。
 */
const ELEMENT_CONTAINERS = new Set(["displayList", "children", "item", "items"]);

/** 解析组件 XML → 直接元素 + 递归嵌套结构。容错:无 displayList 时对全文兜底扫描。 */
export function parseFguiComponent(xml: string): FguiComponent {
  const root = parseXml(xml);
  const displayList = findFirst(root, "displayList");
  // A hand-authored/minimal fixture may omit displayList. In that case the
  // document's root component is the equivalent container; using the #root
  // wrapper would otherwise skip its unnamed component and return no fields.
  const rootComponent = root.children.find((node) => node.tag === "component");
  const container = displayList ?? rootComponent ?? root;
  const elements: FguiElement[] = [];
  const nestedElements: FguiElement[] = [];
  collectDirectElements(container, elements, nestedElements);

  const controllers: FguiController[] = [];
  walk(root, (node) => {
    if (node.tag !== "controller" || !node.attrs.name) return;
    const selected = node.attrs.selected === undefined ? undefined : Number(node.attrs.selected);
    controllers.push({
      name: node.attrs.name,
      ...(node.attrs.pages === undefined ? {} : { pages: node.attrs.pages }),
      ...(selected === undefined || !Number.isFinite(selected) ? {} : { selected }),
    });
  });
  const relations: FguiRelation[] = [];
  walk(root, (node) => {
    if (node.tag !== "relation") return;
    relations.push({
      ...(node.attrs.owner === undefined ? {} : { owner: node.attrs.owner }),
      ...(node.attrs.target === undefined ? {} : { target: node.attrs.target }),
      ...(node.attrs.sidePair === undefined ? {} : { sidePair: node.attrs.sidePair }),
    });
  });
  const assetReferences: FguiAssetReference[] = [];
  collectAssetReferences(root, "", assetReferences);
  return { elements, nestedElements, controllers, relations, assetReferences };
}

/** 查找一个组件内的元素（支持 `parent.child` 路径和直接名称）。 */
export function findFguiElement(component: FguiComponent, nameOrPath: string): FguiElement | undefined {
  return component.elements.find((element) => element.name === nameOrPath)
    ?? component.nestedElements.find((element) => element.path === nameOrPath || element.name === nameOrPath);
}

/** 将直接元素及其递归子项展平；适合构建显式 binding/资源契约。 */
export function flattenFguiElements(component: FguiComponent): FguiElement[] {
  return [...component.elements, ...component.nestedElements];
}

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: "#root", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  // A tiny tokenizer is preferable to a regex here: FairyGUI text/customData
  // attributes can contain a quoted `>` and must not split the opening tag.
  for (const token of xmlTokens(xml)) {
    if (!token || token.startsWith("!") || token.startsWith("?") || token.startsWith("!DOCTYPE")) continue;
    if (token.startsWith("/")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const selfClosing = /\/\s*$/.test(token);
    const body = token.replace(/\/\s*$/, "").trim();
    const tagMatch = /^([A-Za-z][\w:-]*)/.exec(body);
    if (!tagMatch) continue;
    const node: XmlNode = { tag: tagMatch[1], attrs: parseAttrs(body.slice(tagMatch[0].length)), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

function* xmlTokens(xml: string): Generator<string> {
  let i = 0;
  while (i < xml.length) {
    const start = xml.indexOf("<", i);
    if (start < 0) break;
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4);
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      const end = xml.indexOf("]]>", start + 9);
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    let quote = "";
    let end = start + 1;
    for (; end < xml.length; end++) {
      const ch = xml[end];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
    }
    if (end >= xml.length) break;
    yield xml.slice(start + 1, end).trim();
    i = end + 1;
  }
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(source)) !== null) attrs[match[1]] = match[2] ?? match[3] ?? "";
  return attrs;
}

function findFirst(node: XmlNode, tag: string): XmlNode | undefined {
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const found = findFirst(child, tag);
    if (found) return found;
  }
  return undefined;
}

function walk(node: XmlNode, visitor: (node: XmlNode) => void): void {
  visitor(node);
  for (const child of node.children) walk(child, visitor);
}

function toElement(node: XmlNode, parentPath: string): FguiElement | undefined {
  if (!ELEMENT_TAGS.has(node.tag)) return undefined;
  const name = node.attrs.name;
  if (!name) return undefined;
  const path = parentPath ? `${parentPath}.${name}` : name;
  const children: FguiElement[] = [];
  collectElementChildren(node, path, children);
  const result: FguiElement = {
    name,
    tag: node.tag,
    ...(node.attrs.fileName === undefined ? {} : { fileName: node.attrs.fileName }),
    ...(node.attrs.pkg === undefined ? {} : { pkg: node.attrs.pkg }),
    ...(children.length === 0 ? {} : { children }),
    path,
    ...(node.attrs.defaultItem === undefined ? {} : { defaultItem: node.attrs.defaultItem }),
  };
  const itemCount = node.children.filter((child) => child.tag === "item").length;
  if (itemCount > 0) result.itemCount = itemCount;
  const itemUrls = node.children
    .filter((child) => child.tag === "item")
    .flatMap((child) => Object.values(child.attrs).filter((value) => value.startsWith("ui://")));
  if (itemUrls.length > 0) result.itemUrls = [...new Set(itemUrls)];
  return result;
}

function collectDirectElements(
  container: XmlNode,
  out: FguiElement[],
  nestedOut: FguiElement[],
): void {
  for (const child of container.children) {
    if (ELEMENT_TAGS.has(child.tag)) {
      const element = toElement(child, "");
      if (element) {
        out.push(element);
        collectNested(element, nestedOut);
      }
      continue;
    }
    // When displayList itself is wrapped, keep the old "direct element"
    // contract by flattening only known structural containers.
    if (ELEMENT_CONTAINERS.has(child.tag)) collectDirectElements(child, out, nestedOut);
  }
}

function collectElementChildren(node: XmlNode, parentPath: string, out: FguiElement[]): void {
  for (const child of node.children) {
    if (ELEMENT_TAGS.has(child.tag)) {
      const nested = toElement(child, parentPath);
      if (nested) out.push(nested);
    } else if (ELEMENT_CONTAINERS.has(child.tag)) {
      // Skip the unnamed item/container segment in the stable path. A list
      // item field is addressed as `listName.fieldName`, just like a nested
      // component field, so callers do not depend on template ordinal.
      collectElementChildren(child, parentPath, out);
    }
  }
}

function collectNested(element: FguiElement, out: FguiElement[]): void {
  for (const child of element.children ?? []) {
    out.push(child);
    collectNested(child, out);
  }
}

function collectAssetReferences(node: XmlNode, parentPath: string, out: FguiAssetReference[]): void {
  const element = ELEMENT_TAGS.has(node.tag) && node.attrs.name
    ? toElementPath(node, parentPath)
    : undefined;
  const ownerPath = (element?.path ?? parentPath) || undefined;
  for (const value of Object.values(node.attrs)) {
    if (value.startsWith("ui://")) out.push({ url: value, ...(ownerPath ? { ownerPath } : {}) });
  }
  for (const child of node.children) {
    collectAssetReferences(child, ownerPath ?? parentPath, out);
  }
}

function toElementPath(node: XmlNode, parentPath: string): { path: string } | undefined {
  if (!node.attrs.name) return undefined;
  return { path: parentPath ? `${parentPath}.${node.attrs.name}` : node.attrs.name };
}
