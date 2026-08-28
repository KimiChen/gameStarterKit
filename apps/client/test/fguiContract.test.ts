// FairyGUI 结构契约·无头测：解析 apps/art/fairygui 里设计师的组件 XML(事实源)，断言满足代码声明的契约
// (fguiContracts)。设计师删/改名 code 依赖的命名元素 → 本测红。不渲染、无 fairygui 运行时。
// 运行: npm run test:fgui（借 apps/server 的 tsx 跑，客户端零 node 依赖）
import assert from "node:assert";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { elementTsType, checkContract } from "../../../tools/fgui-codegen/binding";
import { findFguiElement, parseFguiComponent, type FguiComponent, type FguiElement } from "../../../tools/fgui-codegen/parseFgui";
import { FGUI_CONTRACTS } from "../src/view/fguiContracts";
import type { FguiContract, FguiFieldContract, FguiListItemContract, FguiNestedContract, FguiRelationContract } from "../src/view/fguiContracts";

// FGUI 组件源在 apps/art/fairygui/assets（FGUI 工程扫描根，只扫直接子目录）；公司标准库 Original 平铺同级。
const FGUI_ROOT = join(import.meta.dirname, "../../art/fairygui/assets");

interface ResourceDecl {
    kind: string;
    id: string;
    name: string;
    xmlPath?: string;
}

interface PackageInfo {
    name: string;
    id: string;
    resources: ResourceDecl[];
}

interface ResourceIndex {
    packagesByName: Map<string, PackageInfo>;
    packagesById: Map<string, PackageInfo>;
}

function xmlFilesUnder(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...xmlFilesUnder(full));
        else if (entry.name.endsWith(".xml")) files.push(full);
    }
    return files;
}

function xmlAttrs(source: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null;
    while ((match = attrRe.exec(source)) !== null) attrs[match[1]] = match[2] ?? match[3] ?? "";
    return attrs;
}

function resourceAliases(name: string): string[] {
    const normalized = name.replace(/^\/+/, "").replaceAll("\\", "/");
    const base = basename(normalized);
    return [
        normalized,
        normalized.replace(/\.[^/.]+$/, ""),
        base,
        base.replace(/\.[^/.]+$/, ""),
    ];
}

/** Build a small package/resource index so binary and named ui:// URLs resolve to XML. */
function buildResourceIndex(): ResourceIndex {
    const packagesByName = new Map<string, PackageInfo>();
    const packagesById = new Map<string, PackageInfo>();
    for (const packageName of readdirSync(FGUI_ROOT)) {
        const packageDir = join(FGUI_ROOT, packageName);
        const packageXmlPath = join(packageDir, "package.xml");
        if (!existsSync(packageXmlPath)) continue;
        const packageXml = readFileSync(packageXmlPath, "utf8").replace(/<!--[\s\S]*?-->/g, "");
        const packageMatch = /<packageDescription\b([^>]*)>/i.exec(packageXml);
        assert.ok(packageMatch, `${packageName}/package.xml 缺少 packageDescription`);
        const packageAttrs = xmlAttrs(packageMatch[1]);
        assert.ok(packageAttrs.id, `${packageName}/package.xml 缺少 package id`);
        const body = /<resources\b[^>]*>([\s\S]*?)<\/resources>/i.exec(packageXml)?.[1] ?? "";
        const resources: ResourceDecl[] = [];
        for (const match of body.matchAll(/<([A-Za-z_][\w:.-]*)\b([^>]*)>/g)) {
            if (match[1].toLowerCase() === "folder") continue;
            const attrs = xmlAttrs(match[2]);
            if (!attrs.id || !attrs.name) continue;
            resources.push({ kind: match[1].toLowerCase(), id: attrs.id, name: attrs.name });
        }
        const xmlByBase = new Map<string, string>();
        for (const file of xmlFilesUnder(packageDir)) {
            if (basename(file) !== "package.xml") xmlByBase.set(basename(file), file);
        }
        for (const resource of resources) {
            if (resource.kind === "component") {
                const path = xmlByBase.get(resource.name);
                if (path) resource.xmlPath = path;
            }
        }
        const info: PackageInfo = { name: packageName, id: packageAttrs.id, resources };
        assert.ok(!packagesByName.has(packageName), `重复 FGUI 包名 ${packageName}`);
        assert.ok(!packagesById.has(info.id), `重复 FGUI 包 id ${info.id}`);
        packagesByName.set(packageName, info);
        packagesById.set(info.id, info);
    }
    return { packagesByName, packagesById };
}

function resolveResource(rawUrl: string, index: ResourceIndex): { pkg: PackageInfo; resource: ResourceDecl } {
    assert.match(rawUrl, /^ui:\/\//, `非法 FGUI URL: ${rawUrl}`);
    const raw = rawUrl.slice("ui://".length);
    const slash = raw.indexOf("/");
    let pkg: PackageInfo | undefined;
    let resourceKey: string;
    if (slash >= 0) {
        const packageKey = raw.slice(0, slash);
        pkg = index.packagesByName.get(packageKey) ?? index.packagesById.get(packageKey);
        resourceKey = raw.slice(slash + 1);
    } else {
        const candidates = [...index.packagesById.entries()]
            .filter(([id]) => raw.startsWith(id))
            .sort((a, b) => b[0].length - a[0].length);
        pkg = candidates[0]?.[1];
        resourceKey = candidates.length ? raw.slice(candidates[0][0].length) : raw;
    }
    assert.ok(pkg, `ui://${raw} 引用了未知 FGUI 包`);
    const resource = pkg.resources.find((candidate) =>
        candidate.id === resourceKey || resourceAliases(candidate.name).includes(resourceKey));
    assert.ok(resource, `ui://${raw} 引用了未知 FGUI 资源`);
    return { pkg, resource };
}

function componentResourceForUrl(rawUrl: string, index: ResourceIndex): { component: FguiComponent; resource: ResourceDecl } {
    const { resource } = resolveResource(rawUrl, index);
    assert.equal(resource.kind, "component", `${rawUrl} 必须指向 component 资源`);
    assert.ok(resource.xmlPath, `${rawUrl} 缺少对应组件 XML`);
    return { component: parseFguiComponent(readFileSync(resource.xmlPath, "utf8")), resource };
}

interface Scope {
    path: string;
    component: FguiComponent;
}

/** Resolve a root-relative path through root and already loaded nested component scopes. */
function elementAtPath(scopes: readonly Scope[], path: string): FguiElement | undefined {
    const ordered = [...scopes].sort((a, b) => b.path.length - a.path.length);
    for (const scope of ordered) {
        if (scope.path !== "" && path !== scope.path && !path.startsWith(`${scope.path}.`)) continue;
        const relative = scope.path === "" ? path : path === scope.path ? "" : path.slice(scope.path.length + 1);
        if (!relative) continue;
        const found = findFguiElement(scope.component, relative);
        if (found) return found;
    }
    return undefined;
}

function requiredFields(contract: FguiContract): FguiFieldContract[] {
    return [
        ...contract.required,
        ...(contract.manualRequired ?? []),
        ...(contract.nested ?? []).flatMap((nested) => nested.required),
        ...(contract.listItems ?? []).flatMap((item) => item.required),
    ];
}

function assertControllers(component: FguiComponent, required: readonly string[], label: string): void {
    const actual = new Set(component.controllers.map((controller) => controller.name));
    const missing = required.filter((name) => !actual.has(name));
    assert.deepEqual(missing, [], `${label} 缺少 controller ${JSON.stringify(missing)}`);
}

function relationMatches(actual: FguiComponent["relations"][number], expected: FguiRelationContract): boolean {
    return (expected.owner === undefined || actual.owner === expected.owner)
        && (expected.target === undefined || actual.target === expected.target)
        && (expected.sidePair === undefined || actual.sidePair === expected.sidePair);
}

function assertRelations(component: FguiComponent, required: readonly FguiRelationContract[], label: string): void {
    const remaining = component.relations.slice();
    const missing: FguiRelationContract[] = [];
    for (const expected of required) {
        const count = expected.count ?? 1;
        for (let i = 0; i < count; i++) {
            const index = remaining.findIndex((actual) => relationMatches(actual, expected));
            if (index < 0) missing.push(expected);
            else remaining.splice(index, 1);
        }
    }
    assert.deepEqual(missing, [], `${label} 缺少 relation ${JSON.stringify(missing)}`);
}

function requireElement<T extends FguiElement = FguiElement>(value: T | undefined, message: string): T {
    assert.ok(value, message);
    return value as T;
}

function assertScopedFields(component: FguiComponent, required: readonly FguiFieldContract[], label: string): void {
    const result = checkContract(component, required);
    assert.deepEqual(
        { missing: result.missing, mismatched: result.mismatched },
        { missing: [], mismatched: [] },
        `${label} 不满足字段契约——缺失: [${result.missing}] 类型不符: [${result.mismatched}]`,
    );
}

function assertListItemContract(
    itemContract: FguiListItemContract,
    scopes: Scope[],
    index: ResourceIndex,
    label: string,
): void {
    const list = requireElement(elementAtPath(scopes, itemContract.listPath), `${label} 找不到列表 ${itemContract.listPath}`);
    assert.equal(list.tag, "list", `${label} ${itemContract.listPath} 不是 GList`);
    assert.ok(list.defaultItem, `${label} ${itemContract.listPath} 缺少 defaultItem`);
    const actualDefault = resolveResource(list.defaultItem, index);
    const expectedDefault = resolveResource(itemContract.defaultItem, index);
    assert.equal(
        `${actualDefault.pkg.id}/${actualDefault.resource.id}`,
        `${expectedDefault.pkg.id}/${expectedDefault.resource.id}`,
        `${label} defaultItem 漂移：XML=${list.defaultItem} contract=${itemContract.defaultItem}`,
    );
    const { component: template } = componentResourceForUrl(itemContract.defaultItem, index);
    assertScopedFields(template, itemContract.required, `${label} item ${itemContract.defaultItem}`);
    assertControllers(template, itemContract.controllers ?? [], `${label} item ${itemContract.defaultItem}`);
    assertRelations(template, itemContract.relations ?? [], `${label} item ${itemContract.defaultItem}`);
}

function assertAssetUrls(contract: FguiContract, index: ResourceIndex, label: string): void {
    for (const url of contract.assetUrls ?? []) {
        const { resource } = resolveResource(url, index);
        assert.ok(resource, `${label} 运行时资源 ${url} 不存在`);
    }
}

function assertNestedContract(
    nested: FguiNestedContract,
    rootPackage: PackageInfo,
    scopes: Scope[],
    index: ResourceIndex,
    label: string,
): void {
    const owner = requireElement(elementAtPath(scopes, nested.path), `${label} 找不到嵌套元素 ${nested.path}`);
    assert.equal(elementTsType(owner), "GComponent", `${label} ${nested.path} 不是 component`);
    const resolvedOwner = resolveElementResource(owner, rootPackage, index);
    const { component, resource } = componentResourceForUrl(nested.source, index);
    // Comparing resolved XML paths catches a designer swapping the component
    // resource while leaving the instance name unchanged.
    assert.equal(resolvedOwner?.xmlPath, resource.xmlPath,
        `${label} ${nested.path} 的 source 已漂移：XML 引用与 contract 不一致`);
    assertScopedFields(component, nested.required, `${label} nested ${nested.source}`);
    assertControllers(component, nested.controllers ?? [], `${label} nested ${nested.source}`);
    assertRelations(component, nested.relations ?? [], `${label} nested ${nested.source}`);
    scopes.push({ path: nested.path, component });
}

function resolveElementResource(element: FguiElement, ownerPackage: PackageInfo, index: ResourceIndex): ResourceDecl | undefined {
    const packageInfo = element.pkg
        ? index.packagesById.get(element.pkg) ?? index.packagesByName.get(element.pkg)
        : ownerPackage;
    if (!packageInfo) return undefined;
    const key = element.src ?? element.fileName;
    if (!key) return undefined;
    return packageInfo.resources.find((resource) =>
        resource.id === key || resource.name === key || resourceAliases(resource.name).includes(key));
}

function sourceWithoutComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertViewCallsDeclared(contract: FguiContract, label: string): void {
    const viewPath = join(FGUI_ROOT, "..", "..", "..", "client", "src", "view", `${label}View.ts`);
    const source = sourceWithoutComments(readFileSync(viewPath, "utf8"));
    const declared = new Set(requiredFields(contract).map((field) => field.name));
    const childCalls = [...source.matchAll(/\.getChild\s*(?:<\s*([^>]+?)\s*>)?\s*\(\s*["']([^"']+)["']\s*\)/g)];
    for (const match of childCalls) {
        const type = match[1]?.trim();
        const name = match[2];
        assert.ok(declared.has(name), `${label}View.ts 手写 getChild(${name}) 未登记到 FGUI 子契约`);
        if (!type) continue;
        const fields = [
            ...contract.required,
            ...(contract.manualRequired ?? []),
            ...(contract.nested ?? []).flatMap((nested) => nested.required),
            ...(contract.listItems ?? []).flatMap((item) => item.required),
        ].filter((field) => field.name === name);
        assert.ok(fields.some((field) => field.tsType === type),
            `${label}View.ts getChild<${type}>("${name}") 与子契约类型不一致`);
    }
    const controllerNames = new Set((contract.controllers ?? [])
        .concat((contract.nested ?? []).flatMap((nested) => nested.controllers ?? []))
        .concat((contract.listItems ?? []).flatMap((item) => item.controllers ?? [])));
    for (const match of source.matchAll(/\.getController\s*\(\s*["']([^"']+)["']\s*\)/g)) {
        assert.ok(controllerNames.has(match[1]), `${label}View.ts getController(${match[1]}) 未登记到 FGUI 子契约`);
    }
}

for (const c of FGUI_CONTRACTS) {
    test(`FGUI 契约:ui://${c.pkg}/${c.comp} 满足代码依赖的命名元素`, () => {
        const xmlPath = join(FGUI_ROOT, c.pkg, `${c.comp}.xml`);
        const comp = parseFguiComponent(readFileSync(xmlPath, "utf8"));
        const r = checkContract(comp, c.required);
        assert.deepStrictEqual(
            { missing: r.missing, mismatched: r.mismatched }, { missing: [], mismatched: [] },
            `设计师的 ${c.pkg}/${c.comp}.xml 不满足契约——缺失: [${r.missing}] 类型不符: [${r.mismatched}]`,
        );
    });

    // 包描述里组件必须已导出(exported)，运行时 createObject 才可见（随契约逐视图检查）
    test(`FGUI 契约:${c.pkg}/package.xml 已导出 ${c.comp}`, () => {
        const pkgXml = readFileSync(join(FGUI_ROOT, c.pkg, "package.xml"), "utf8");
        assert.match(
            pkgXml,
            new RegExp(`name="${c.comp}\\.xml"[^>]*exported="true"`),
            `${c.comp} 需在 ${c.pkg} 包里标记导出`,
        );
    });

    test(`FGUI 契约:${c.pkg}/${c.comp} 的手写/嵌套/list-item 依赖完整`, () => {
        const index = buildResourceIndex();
        const packageInfo = index.packagesByName.get(c.pkg);
        assert.ok(packageInfo, `契约引用了未知 FGUI 包 ${c.pkg}`);
        const rootPath = join(FGUI_ROOT, c.pkg, `${c.comp}.xml`);
        const root = parseFguiComponent(readFileSync(rootPath, "utf8"));
        const scopes: Scope[] = [{ path: "", component: root }];
        assertAssetUrls(c, index, `${c.pkg}/${c.comp}`);
        assertControllers(root, c.controllers ?? [], `${c.pkg}/${c.comp}`);
        assertRelations(root, c.relations ?? [], `${c.pkg}/${c.comp}`);

        // Unprefixed fields are intentionally outside the generated AUTO
        // block, but remain strict structure dependencies.
        assertScopedFields(root, c.manualRequired ?? [], `${c.pkg}/${c.comp} manual`);

        // Load nested component sources before resolving root-relative list
        // paths such as `jb_tabbar.lst_jb`.
        for (const nested of c.nested ?? []) {
            assertNestedContract(nested, packageInfo, scopes, index, `${c.pkg}/${c.comp}`);
        }
        for (const item of c.listItems ?? []) {
            assertListItemContract(item, scopes, index, `${c.pkg}/${c.comp}`);
        }

        // Every literal getChild/getController call in the View must have an
        // explicit contract entry; this prevents a future manual binding from
        // silently escaping the XML checks above.
        assertViewCallsDeclared(c, basename(rootPath, ".xml"));
    });
}

// 编辑器工程 Adaptation ⇔ 代码真源 designSpec 一致性：设计师在错误分辨率/适配模式下出图
// 是「UI 偏小 + 黑边」的放大器（designSpec.ts 头注释）。分辨率两值比 designSpec；
// 适配策略半边（FIXED_WIDTH ≙ FairyGUI 的 MatchWidth）designSpec 里没有，钉 Main.ts 源文本。
test("FGUI 编辑器 Adaptation 设置 ⇔ designSpec/Main.ts 三处一致", async () => {
    const { DESIGN_WIDTH, DESIGN_HEIGHT } = await import("../src/designSpec");
    const adaptation = JSON.parse(
        readFileSync(join(import.meta.dirname, "../../art/fairygui/settings/Adaptation.json"), "utf8"),
    );
    assert.strictEqual(adaptation.designResolutionX, DESIGN_WIDTH, "编辑器设计宽 ≠ designSpec.DESIGN_WIDTH");
    assert.strictEqual(adaptation.designResolutionY, DESIGN_HEIGHT, "编辑器设计高 ≠ designSpec.DESIGN_HEIGHT");
    assert.strictEqual(adaptation.scaleMode, "ScaleWithScreenSize");
    // FairyGUI 真实键名就是 screenMathMode（非 Match 拼写笔误）
    assert.strictEqual(adaptation.screenMathMode, "MatchWidth", "编辑器适配模式须与 Main.ts 的 FIXED_WIDTH 同语义");
    const mainTs = readFileSync(join(import.meta.dirname, "../src/Main.ts"), "utf8");
    assert.match(mainTs, /ResolutionPolicy\.FIXED_WIDTH/, "Main.ts 适配策略不再是 FIXED_WIDTH——编辑器 MatchWidth 假设失效，连同本断言一起重议");
});
