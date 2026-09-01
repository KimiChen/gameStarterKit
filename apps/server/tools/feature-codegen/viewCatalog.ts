/**
 * View/FGUI catalog 读取与渲染（Non-intrusive §7.1/§7.4/§7.5 阶段 6）。
 *
 * 输入（唯一真源）：
 *  - `features/<dir>/feature.json`（经 features/feature-schema-v1.json 真实 JSON Schema 校验）；
 *  - 每个 View 同目录的 `<Name>View.view.json` sidecar（手写 metadata，逐字进产物）；
 *  - `apps/art/fairygui/assets` 的 FGUI XML（复用 tools/fgui-codegen 的 parseFgui/binding
 *    计算 direct required；⛔ 不执行任何客户端 TS）。
 *
 * 产物（全部经 lib.ts 的原子写盘与 freshness 闸）：
 *  - `apps/client/src/generated/fguiContracts.generated.ts`：FguiContract 全集；
 *  - `apps/client/src/generated/views.generated.ts`：不可变 View catalog（load 是字面量
 *    动态 import，铁律 10）+ View 源文件清单（fgui-manifest.mjs 与守门测试的路径单源）；
 *  - `apps/client/src/generated/features.generated.ts`：feature/route/menu contribution 数据
 *    （menu 排序 slot → order → featureId → entryId）。
 *
 * 校验 fail-fast（§7.5）：重复 qualified View id、一 View 一 manifest、logic 路径存在且位于
 * owner 声明目录、sidecar⇔View 文件双向（viewDirs 递归发现，未登记红）、`ui://` 引用 ⊆
 * 自身∪sharedPkgs、sharedPkgs ⊇ art 传递闭包∪assetUrls 所属包、package/component 重复引用
 * 仅允许显式 aliasOf、路径越界/符号链接拒绝、feature 依赖环拒绝。
 *
 * ⚠ 生成条目的 `sharedPkgs` 是 sidecar 声明值的逐字迁移（校验 ⊇ 闭包而非 ==）：
 * 现仓 LoginNotice 刻意多声明 L10n_zh_hans（字体包），改成“== 闭包”会静默削掉它。
 */
import fs from "node:fs";
import path from "node:path";
import { parseFguiComponent } from "../../../../tools/fgui-codegen/parseFgui";
import { bindingFields } from "../../../../tools/fgui-codegen/binding";
import { parseFeatureManifest, type FeatureManifest } from "./featureManifestSchema";

const FEATURES_DIR_RELATIVE = "features";
const ART_DIR_RELATIVE = "apps/art/fairygui/assets";
const CLIENT_SRC_RELATIVE = "apps/client/src";
const GENERATED_DIR_RELATIVE = "apps/client/src/generated";
export const FGUI_CONTRACTS_RELATIVE = `${GENERATED_DIR_RELATIVE}/fguiContracts.generated.ts`;
export const VIEWS_RELATIVE = `${GENERATED_DIR_RELATIVE}/views.generated.ts`;
export const FEATURES_RELATIVE = `${GENERATED_DIR_RELATIVE}/features.generated.ts`;
/** 能力索引（§5.7 阶段 7）：根文档只链接此索引，不在多处复制状态。 */
export const FEATURE_INDEX_RELATIVE = "docs/features.generated.md";

const VIEW_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/u;
const FEATURE_DIR_NAME = /^[a-z][a-z0-9-]{0,63}$/u;
const VIEW_LAYERS = ["base", "popup", "top"] as const;
const RESTORE_KINDS = ["keep-mounted", "reopen", "fallback", "discard"] as const;
/** view/ 下的机械件（非页面视图），双向发现时豁免（与 viewRegistry.test 的 MACHINERY 同源语义）。 */
const VIEW_MACHINERY = new Set(["FguiView.ts"]);

function fail(pathLabel: string, message: string): never {
  throw new Error(`[feature-codegen] ${pathLabel}: ${message}`);
}

function posixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRegularFile(file: string, label: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch {
    fail(label, "missing required file");
  }
  if (stat.isSymbolicLink()) fail(label, "symlink escape is not allowed");
  if (!stat.isFile()) fail(label, "must be a regular file");
}

// ── sidecar 形状 ────────────────────────────────────────────────────────────

export type FguiFieldContractData = {
  readonly name: string;
  readonly tsType: string;
  readonly path?: string;
};

export type FguiRelationContractData = {
  readonly owner?: string;
  readonly target?: string;
  readonly sidePair?: string;
  readonly count?: number;
};

export type FguiNestedContractData = {
  readonly path: string;
  readonly source: string;
  readonly required: readonly FguiFieldContractData[];
  readonly controllers?: readonly string[];
  readonly relations?: readonly FguiRelationContractData[];
};

export type FguiListItemContractData = {
  readonly listPath: string;
  readonly defaultItem: string;
  readonly required: readonly FguiFieldContractData[];
  readonly controllers?: readonly string[];
  readonly relations?: readonly FguiRelationContractData[];
};

export type ViewSidecar = {
  readonly schemaVersion: 1;
  readonly owner: string;
  readonly kind: "fgui" | "cocos";
  readonly layer: (typeof VIEW_LAYERS)[number];
  readonly fullscreen: boolean;
  readonly onlyOne: boolean;
  readonly permanent: boolean;
  readonly interactive: boolean;
  readonly package?: string;
  readonly component?: string;
  readonly logic: string;
  readonly sharedPkgs?: readonly string[];
  readonly manualRequired?: readonly FguiFieldContractData[];
  readonly nested?: readonly FguiNestedContractData[];
  readonly listItems?: readonly FguiListItemContractData[];
  readonly controllers?: readonly string[];
  readonly relations?: readonly FguiRelationContractData[];
  readonly assetUrls?: readonly string[];
  readonly group?: string;
  readonly restore?: (typeof RESTORE_KINDS)[number];
  readonly aliasOf?: string;
};

const SIDECAR_KEYS = new Set([
  "schemaVersion", "owner", "kind", "layer", "fullscreen", "onlyOne", "permanent",
  "interactive", "package", "component", "logic", "sharedPkgs", "manualRequired",
  "nested", "listItems", "controllers", "relations", "assetUrls", "group", "restore", "aliasOf",
]);

function parseFieldContracts(value: unknown, label: string): readonly FguiFieldContractData[] {
  if (!Array.isArray(value)) fail(label, "must be an array of field contracts");
  return value.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (!isRecord(item)) fail(itemLabel, "must be an object");
    for (const key of Object.keys(item)) {
      if (!["name", "tsType", "path"].includes(key)) fail(itemLabel, `unknown key: ${key}`);
    }
    if (typeof item.name !== "string" || item.name === "") fail(itemLabel, "name must be a non-empty string");
    if (typeof item.tsType !== "string" || item.tsType === "") fail(itemLabel, "tsType must be a non-empty string");
    if (item.path !== undefined && (typeof item.path !== "string" || item.path === "")) {
      fail(itemLabel, "path must be a non-empty string when present");
    }
    return {
      name: item.name,
      tsType: item.tsType,
      ...(item.path === undefined ? {} : { path: item.path }),
    };
  });
}

function parseRelationContracts(value: unknown, label: string): readonly FguiRelationContractData[] {
  if (!Array.isArray(value)) fail(label, "must be an array of relation contracts");
  return value.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (!isRecord(item)) fail(itemLabel, "must be an object");
    for (const key of Object.keys(item)) {
      if (!["owner", "target", "sidePair", "count"].includes(key)) fail(itemLabel, `unknown key: ${key}`);
    }
    for (const key of ["owner", "target", "sidePair"] as const) {
      if (item[key] !== undefined && typeof item[key] !== "string") fail(itemLabel, `${key} must be a string`);
    }
    if (item.count !== undefined && (!Number.isSafeInteger(item.count) || (item.count as number) < 1)) {
      fail(itemLabel, "count must be a positive integer");
    }
    return {
      ...(item.owner === undefined ? {} : { owner: item.owner as string }),
      ...(item.target === undefined ? {} : { target: item.target as string }),
      ...(item.sidePair === undefined ? {} : { sidePair: item.sidePair as string }),
      ...(item.count === undefined ? {} : { count: item.count as number }),
    };
  });
}

function parseStringArray(value: unknown, label: string, pattern: RegExp): readonly string[] {
  if (!Array.isArray(value)) fail(label, "must be an array of strings");
  return value.map((item, index) => {
    if (typeof item !== "string" || !pattern.test(item)) {
      fail(`${label}[${index}]`, `must be a string matching ${pattern}`);
    }
    return item;
  });
}

function parseSidecar(input: unknown, label: string): ViewSidecar {
  if (!isRecord(input)) fail(label, "sidecar must be a JSON object");
  for (const key of Object.keys(input)) {
    if (!SIDECAR_KEYS.has(key)) fail(label, `unknown key: ${key}`);
  }
  if (input.schemaVersion !== 1) fail(label, "schemaVersion must be 1");
  if (typeof input.owner !== "string" || !/^[a-z][A-Za-z0-9]{0,63}$/u.test(input.owner)) {
    fail(label, "owner must be a camelCase feature/gameplay id");
  }
  if (input.kind !== "fgui" && input.kind !== "cocos") fail(label, 'kind must be "fgui" | "cocos"');
  if (!(VIEW_LAYERS as readonly string[]).includes(input.layer as string)) {
    fail(label, `layer must be one of ${VIEW_LAYERS.join("/")}`);
  }
  for (const key of ["fullscreen", "onlyOne", "permanent", "interactive"] as const) {
    if (typeof input[key] !== "boolean") fail(label, `${key} must be a boolean`);
  }
  if (typeof input.logic !== "string" || !input.logic.startsWith("apps/client/src/logic/") || !input.logic.endsWith(".ts")) {
    fail(label, "logic must be a repo-relative path under apps/client/src/logic/ ending in .ts");
  }
  if (input.kind === "fgui") {
    if (typeof input.package !== "string" || input.package === "") fail(label, "fgui sidecar requires package");
    if (typeof input.component !== "string" || input.component === "") fail(label, "fgui sidecar requires component");
  } else {
    for (const key of ["package", "component", "sharedPkgs", "manualRequired", "nested", "listItems", "controllers", "relations", "assetUrls", "aliasOf"] as const) {
      if (input[key] !== undefined) fail(label, `cocos sidecar must not declare ${key}（无 FGUI 段）`);
    }
  }
  if (input.restore !== undefined && !(RESTORE_KINDS as readonly string[]).includes(input.restore as string)) {
    fail(label, `restore must be one of ${RESTORE_KINDS.join("/")}`);
  }
  if (input.group !== undefined && (typeof input.group !== "string" || input.group === "")) {
    fail(label, "group must be a non-empty string when present");
  }
  if (input.aliasOf !== undefined && (typeof input.aliasOf !== "string" || !VIEW_NAME.test(input.aliasOf))) {
    fail(label, "aliasOf must reference a View name");
  }
  const nested = input.nested === undefined ? undefined : (() => {
    if (!Array.isArray(input.nested)) fail(label, "nested must be an array");
    return input.nested.map((item, index) => {
      const itemLabel = `${label}.nested[${index}]`;
      if (!isRecord(item)) fail(itemLabel, "must be an object");
      for (const key of Object.keys(item)) {
        if (!["path", "source", "required", "controllers", "relations"].includes(key)) fail(itemLabel, `unknown key: ${key}`);
      }
      if (typeof item.path !== "string" || item.path === "") fail(itemLabel, "path must be a non-empty string");
      if (typeof item.source !== "string" || !item.source.startsWith("ui://")) fail(itemLabel, "source must be a ui:// URL");
      return {
        path: item.path,
        source: item.source,
        required: parseFieldContracts(item.required, `${itemLabel}.required`),
        ...(item.controllers === undefined ? {} : { controllers: parseStringArray(item.controllers, `${itemLabel}.controllers`, /^.+$/u) }),
        ...(item.relations === undefined ? {} : { relations: parseRelationContracts(item.relations, `${itemLabel}.relations`) }),
      };
    });
  })();
  const listItems = input.listItems === undefined ? undefined : (() => {
    if (!Array.isArray(input.listItems)) fail(label, "listItems must be an array");
    return input.listItems.map((item, index) => {
      const itemLabel = `${label}.listItems[${index}]`;
      if (!isRecord(item)) fail(itemLabel, "must be an object");
      for (const key of Object.keys(item)) {
        if (!["listPath", "defaultItem", "required", "controllers", "relations"].includes(key)) fail(itemLabel, `unknown key: ${key}`);
      }
      if (typeof item.listPath !== "string" || item.listPath === "") fail(itemLabel, "listPath must be a non-empty string");
      if (typeof item.defaultItem !== "string" || !item.defaultItem.startsWith("ui://")) fail(itemLabel, "defaultItem must be a ui:// URL");
      return {
        listPath: item.listPath,
        defaultItem: item.defaultItem,
        required: parseFieldContracts(item.required, `${itemLabel}.required`),
        ...(item.controllers === undefined ? {} : { controllers: parseStringArray(item.controllers, `${itemLabel}.controllers`, /^.+$/u) }),
        ...(item.relations === undefined ? {} : { relations: parseRelationContracts(item.relations, `${itemLabel}.relations`) }),
      };
    });
  })();
  return {
    schemaVersion: 1,
    owner: input.owner,
    kind: input.kind,
    layer: input.layer as (typeof VIEW_LAYERS)[number],
    fullscreen: input.fullscreen as boolean,
    onlyOne: input.onlyOne as boolean,
    permanent: input.permanent as boolean,
    interactive: input.interactive as boolean,
    ...(input.package === undefined ? {} : { package: input.package as string }),
    ...(input.component === undefined ? {} : { component: input.component as string }),
    logic: input.logic,
    ...(input.sharedPkgs === undefined
      ? {}
      : { sharedPkgs: parseStringArray(input.sharedPkgs, `${label}.sharedPkgs`, /^ui\/[A-Za-z0-9_]+$/u) }),
    ...(input.manualRequired === undefined ? {} : { manualRequired: parseFieldContracts(input.manualRequired, `${label}.manualRequired`) }),
    ...(nested === undefined ? {} : { nested }),
    ...(listItems === undefined ? {} : { listItems }),
    ...(input.controllers === undefined ? {} : { controllers: parseStringArray(input.controllers, `${label}.controllers`, /^.+$/u) }),
    ...(input.relations === undefined ? {} : { relations: parseRelationContracts(input.relations, `${label}.relations`) }),
    ...(input.assetUrls === undefined
      ? {}
      : { assetUrls: parseStringArray(input.assetUrls, `${label}.assetUrls`, /^ui:\/\/[A-Za-z0-9_]+\/.+$/u) }),
    ...(input.group === undefined ? {} : { group: input.group as string }),
    ...(input.restore === undefined ? {} : { restore: input.restore as (typeof RESTORE_KINDS)[number] }),
    ...(input.aliasOf === undefined ? {} : { aliasOf: input.aliasOf as string }),
  };
}

// ── FGUI 包依赖闭包（算法迁自 viewRegistry.test 的 buildPkgIdMap/directDeps） ──

function xmlFilesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...xmlFilesUnder(full));
    else if (entry.name.endsWith(".xml")) files.push(full);
  }
  return files.sort();
}

/** id→包名（扫每个包 package.xml 的 packageDescription id）。 */
function buildPkgIdMap(artDir: string): Map<string, string> {
  const id2name = new Map<string, string>();
  if (!fs.existsSync(artDir)) return id2name;
  for (const pkg of fs.readdirSync(artDir).sort()) {
    const packagePath = path.join(artDir, pkg, "package.xml");
    if (!fs.existsSync(packagePath)) continue;
    const match = /<packageDescription\b[^>]*\bid\s*=\s*(["'])([^"']+)\1/i.exec(fs.readFileSync(packagePath, "utf8"));
    if (match) id2name.set(match[2], pkg);
  }
  return id2name;
}

/** 某包直接引用的外部包名集合（扫递归 XML 的 pkg/ui:// 引用）。 */
function directDeps(artDir: string, pkg: string, id2name: Map<string, string>): Set<string> {
  const own = [...id2name.entries()].find(([, name]) => name === pkg)?.[0];
  const ids = new Set<string>();
  for (const file of xmlFilesUnder(path.join(artDir, pkg))) {
    if (path.basename(file) === "package.xml") continue;
    const source = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const match of source.matchAll(/\bpkg\s*=\s*(["'])([^"']+)\1/gi)) ids.add(match[2]);
    for (const match of source.matchAll(/ui:\/\/([^\s"'<>|&]+)/gi)) {
      const raw = match[1].replace(/[),.;\]}]+$/g, "");
      const slash = raw.indexOf("/");
      if (slash >= 0) ids.add(raw.slice(0, slash));
      else {
        const id = [...id2name.keys()].filter((candidate) => raw.startsWith(candidate))
          .sort((left, right) => right.length - left.length)[0];
        if (id) ids.add(id);
      }
    }
  }
  const names = new Set<string>();
  for (const id of ids) {
    if (id !== own && id2name.has(id)) names.add(id2name.get(id)!);
  }
  return names;
}

/** 传递闭包（不含自身；自身包由 ViewMgr 打开时加载）。 */
function packageClosure(artDir: string, pkg: string, id2name: Map<string, string>, cache: Map<string, Set<string>>): Set<string> {
  const deps = (name: string): Set<string> =>
    cache.get(name) ?? cache.set(name, directDeps(artDir, name, id2name)).get(name)!;
  const seen = new Set<string>();
  const stack = [pkg];
  while (stack.length) {
    for (const dep of deps(stack.pop()!)) {
      if (!seen.has(dep)) {
        seen.add(dep);
        stack.push(dep);
      }
    }
  }
  seen.delete(pkg);
  return seen;
}

// ── catalog 读取 ────────────────────────────────────────────────────────────

export type ViewCatalogEntry = {
  readonly name: string;
  readonly feature: string;
  readonly sidecar: ViewSidecar;
  /** 仓库相对路径（posix）。 */
  readonly sidecarPath: string;
  readonly viewPath: string;
  /** 仅 kind:"fgui"：从 XML 算出的 direct required。 */
  readonly required: readonly FguiFieldContractData[];
};

export type ViewCatalog = {
  readonly features: readonly FeatureManifest[];
  readonly entries: readonly ViewCatalogEntry[];
  /** 全部 feature 声明的 view 目录（仓库相对，排序去重）。 */
  readonly viewDirs: readonly string[];
  /** 仓库根（绝对路径）：能力索引渲染时做 fragment defaultEntry 的存在性判定，⛔ 不进产物字节。 */
  readonly root: string;
};

function detectDependencyCycle(features: readonly FeatureManifest[]): void {
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string, chain: readonly string[]): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) fail(FEATURES_DIR_RELATIVE, `feature 依赖环：${[...chain, id].join(" → ")}`);
    visiting.add(id);
    for (const dep of byId.get(id)?.dependencies ?? []) {
      if (!byId.has(dep)) fail(FEATURES_DIR_RELATIVE, `feature "${id}" 依赖不存在的 feature "${dep}"`);
      visit(dep, [...chain, id]);
    }
    visiting.delete(id);
    done.add(id);
  };
  for (const feature of features) visit(feature.id, []);
}

/** 发现并校验全部 feature manifest 与 view sidecar；返回稳定排序的 catalog。 */
export function readViewCatalog(repositoryRoot: string): ViewCatalog {
  const root = path.resolve(repositoryRoot);
  const featuresDir = path.join(root, FEATURES_DIR_RELATIVE);
  if (!fs.existsSync(featuresDir)) fail(FEATURES_DIR_RELATIVE, "features directory is missing");

  const featureDirs = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const features: FeatureManifest[] = [];
  const seenFeatureIds = new Map<string, string>();
  for (const dirName of featureDirs) {
    const label = `${FEATURES_DIR_RELATIVE}/${dirName}/feature.json`;
    if (!FEATURE_DIR_NAME.test(dirName)) fail(label, `feature 目录名 "${dirName}" 必须是小写短横线标识符`);
    const manifestFile = path.join(featuresDir, dirName, "feature.json");
    assertRegularFile(manifestFile, label);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    } catch (error) {
      fail(label, `cannot read valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const manifest = parseFeatureManifest(root, parsed, label);
    if (dirName.replace(/-/g, "") !== manifest.id.toLowerCase()) {
      fail(label, `feature id ("${manifest.id}") 必须与目录名 ("${dirName}"，忽略短横线）一致`);
    }
    const normalized = manifest.id.toLowerCase();
    const clash = seenFeatureIds.get(normalized);
    if (clash) fail(label, `feature id 与 "${clash}" 大小写归一化后冲突`);
    seenFeatureIds.set(normalized, manifest.id);
    features.push(manifest);
  }
  features.sort((left, right) => (left.id < right.id ? -1 : 1));
  detectDependencyCycle(features);

  const artDir = path.join(root, ART_DIR_RELATIVE);
  const id2name = buildPkgIdMap(artDir);
  const knownPackages = new Set(id2name.values());
  const closureCache = new Map<string, Set<string>>();

  const entries: ViewCatalogEntry[] = [];
  const nameOwners = new Map<string, string>();
  const sidecarOwners = new Map<string, string>();
  for (const feature of features) {
    const featureLabel = `${FEATURES_DIR_RELATIVE}/${feature.id}`;
    const ownerDirs = new Map<string, string>();
    for (const owner of feature.owners) {
      if (ownerDirs.has(owner.id)) fail(featureLabel, `owners 重复声明 "${owner.id}"`);
      ownerDirs.set(owner.id, owner.logicDir);
    }
    for (const dir of feature.viewDirs) {
      const resolved = path.resolve(root, dir);
      if (!resolved.startsWith(path.join(root, CLIENT_SRC_RELATIVE) + path.sep)) {
        fail(featureLabel, `viewDirs 越出 ${CLIENT_SRC_RELATIVE}: ${dir}`);
      }
      if (!fs.existsSync(resolved)) fail(featureLabel, `viewDirs 目录不存在: ${dir}`);
    }
    for (const sidecarRelative of feature.views) {
      const label = sidecarRelative;
      const claimed = sidecarOwners.get(sidecarRelative);
      if (claimed) fail(label, `同一 View sidecar 同时被 ${claimed} 与 ${feature.id} 登记（一 View 一 manifest）`);
      sidecarOwners.set(sidecarRelative, feature.id);
      const sidecarFile = path.resolve(root, sidecarRelative);
      if (!feature.viewDirs.some((dir) => sidecarFile.startsWith(path.resolve(root, dir) + path.sep))) {
        fail(label, `sidecar 不在本 feature 声明的任何 viewDirs 之内`);
      }
      assertRegularFile(sidecarFile, label);
      const baseName = path.basename(sidecarRelative);
      const viewName = baseName.slice(0, -"View.view.json".length);
      if (!VIEW_NAME.test(viewName)) fail(label, `sidecar 文件名必须形如 <Name>View.view.json（Name 为 PascalCase）`);
      const normalizedName = viewName.toLowerCase();
      const nameClash = nameOwners.get(normalizedName);
      if (nameClash) fail(label, `View id "${viewName}" 与 "${nameClash}" 大小写归一化后重复`);
      nameOwners.set(normalizedName, viewName);
      let parsed: unknown;
      try {
        parsed = JSON.parse(fs.readFileSync(sidecarFile, "utf8"));
      } catch (error) {
        fail(label, `cannot read valid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      const sidecar = parseSidecar(parsed, label);
      const logicDir = ownerDirs.get(sidecar.owner);
      if (!logicDir) {
        fail(label, `owner "${sidecar.owner}" 未在 ${featureLabel}/feature.json 的 owners 表登记 logicDir`);
      }
      const logicFile = path.resolve(root, sidecar.logic);
      if (!logicFile.startsWith(path.resolve(root, logicDir) + path.sep)) {
        fail(label, `logic 路径 ${sidecar.logic} 不在 owner "${sidecar.owner}" 的目录 ${logicDir} 之内`);
      }
      assertRegularFile(logicFile, `${label} → ${sidecar.logic}`);
      const viewRelative = sidecarRelative.slice(0, -".view.json".length) + ".ts";
      const viewFile = path.resolve(root, viewRelative);
      assertRegularFile(viewFile, `${label} → ${viewRelative}`);

      let required: readonly FguiFieldContractData[] = [];
      if (sidecar.kind === "fgui") {
        const pkg = sidecar.package!;
        const comp = sidecar.component!;
        if (!knownPackages.has(pkg)) fail(label, `未知 FGUI 包 ${pkg}`);
        const xmlFile = path.join(artDir, pkg, `${comp}.xml`);
        assertRegularFile(xmlFile, `${label} → ${ART_DIR_RELATIVE}/${pkg}/${comp}.xml`);
        required = bindingFields(parseFguiComponent(fs.readFileSync(xmlFile, "utf8")))
          .map((field) => ({ name: field.name, tsType: field.tsType }));

        // sharedPkgs 必须 ⊇ art 传递闭包 ∪ assetUrls 所属包（fairygui 不自动加载依赖包）。
        const need = packageClosure(artDir, pkg, id2name, closureCache);
        for (const url of sidecar.assetUrls ?? []) {
          const assetPkg = url.slice("ui://".length).split("/")[0];
          if (!knownPackages.has(assetPkg)) fail(label, `assetUrls 引用未知包 ${assetPkg}（${url}）`);
          if (assetPkg !== pkg) need.add(assetPkg);
        }
        const declared = new Set((sidecar.sharedPkgs ?? []).map((item) => item.slice("ui/".length)));
        for (const name of declared) {
          if (!knownPackages.has(name)) fail(label, `sharedPkgs 引用未知包 ${name}`);
        }
        const missing = [...need].filter((name) => !declared.has(name)).sort();
        if (missing.length > 0) {
          fail(label, `sharedPkgs 缺依赖包 ${JSON.stringify(missing)}（art 闭包∪assetUrls 所属包；漏包=运行时元素空白）`);
        }

        // 代码内 ui://Pkg/ 引用 ⊆ 本页包 ∪ sharedPkgs（写错包名不报错、运行时图标空白）。
        const source = fs.readFileSync(viewFile, "utf8");
        const allowed = new Set([pkg, ...declared]);
        const bad = new Set<string>();
        for (const match of source.matchAll(/ui:\/\/([^\s"'<>|/]+)\//g)) {
          if (!allowed.has(match[1])) bad.add(match[1]);
        }
        if (bad.size > 0) {
          fail(`${label} → ${viewRelative}`, `代码引用了闭包外的包 ${JSON.stringify([...bad].sort())}——包名写错或漏在 sharedPkgs 声明`);
        }
      }

      entries.push({
        name: viewName,
        feature: feature.id,
        sidecar,
        sidecarPath: sidecarRelative,
        viewPath: viewRelative,
        required,
      });
    }
  }
  entries.sort((left, right) => (left.name < right.name ? -1 : 1));

  // package/component 重复引用只允许显式 aliasOf（迁移期兼容），其余重复必败。
  const byComponent = new Map<string, ViewCatalogEntry[]>();
  for (const entry of entries) {
    if (entry.sidecar.kind !== "fgui") continue;
    const key = `${entry.sidecar.package}/${entry.sidecar.component}`;
    const bucket = byComponent.get(key) ?? [];
    bucket.push(entry);
    byComponent.set(key, bucket);
  }
  for (const [key, bucket] of byComponent) {
    const canonical = bucket.filter((entry) => entry.sidecar.aliasOf === undefined);
    if (canonical.length !== 1) {
      fail(FEATURES_DIR_RELATIVE, `组件 ${key} 被 ${bucket.map((entry) => entry.name).join(", ")} 重复引用，`
        + "且未通过唯一 canonical + 显式 aliasOf 声明迁移期兼容");
    }
    for (const entry of bucket) {
      if (entry.sidecar.aliasOf !== undefined && entry.sidecar.aliasOf !== canonical[0].name) {
        fail(entry.sidecarPath, `aliasOf 必须指向同组件的 canonical View "${canonical[0].name}"`);
      }
    }
    const orphanAlias = bucket.find((entry) => entry.sidecar.aliasOf === entry.name);
    if (orphanAlias) fail(orphanAlias.sidecarPath, "aliasOf 不得指向自身");
  }
  for (const entry of entries) {
    if (entry.sidecar.aliasOf !== undefined) {
      const target = entries.find((candidate) => candidate.name === entry.sidecar.aliasOf);
      if (!target) fail(entry.sidecarPath, `aliasOf 指向不存在的 View "${entry.sidecar.aliasOf}"`);
      if (target.sidecar.kind !== "fgui" || entry.sidecar.kind !== "fgui"
        || target.sidecar.package !== entry.sidecar.package
        || target.sidecar.component !== entry.sidecar.component) {
        fail(entry.sidecarPath, "aliasOf 只用于同一 package/component 的迁移期兼容");
      }
    }
  }

  // sidecar ⇔ View 文件双向：viewDirs 递归发现的 *View.ts 必须全部登记（机械件豁免）。
  const registeredViewPaths = new Set(entries.map((entry) => entry.viewPath));
  const allViewDirs = [...new Set(features.flatMap((feature) => feature.viewDirs))].sort();
  for (const dir of allViewDirs) {
    const base = path.resolve(root, dir);
    const walk = (current: string): void => {
      for (const dirent of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, dirent.name);
        if (dirent.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/^[A-Z].*View\.ts$/.test(dirent.name) || VIEW_MACHINERY.has(dirent.name)) continue;
        const relative = posixPath(path.relative(root, full));
        if (!registeredViewPaths.has(relative)) {
          fail(relative, "发现未登记的 *View.ts：为它新增同目录 <Name>View.view.json 并登记进 feature.json 的 views");
        }
      }
    };
    walk(base);
  }

  // route 校验：view 必须是已登记 fgui View，group/restore 由其 sidecar 声明。
  const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
  const routeIds = new Map<string, string>();
  const routeViews = new Map<string, string>();
  const menuEntryIds = new Map<string, string>();
  for (const feature of features) {
    const label = `${FEATURES_DIR_RELATIVE}/${feature.id}/feature.json`;
    for (const route of feature.routes) {
      const clash = routeIds.get(route.id);
      if (clash) fail(label, `route id "${route.id}" 与 feature "${clash}" 重复`);
      routeIds.set(route.id, feature.id);
      const viewClash = routeViews.get(route.view);
      if (viewClash) fail(label, `route view "${route.view}" 已被 feature "${viewClash}" 的路由占用`);
      routeViews.set(route.view, feature.id);
      const entry = entryByName.get(route.view);
      if (!entry) fail(label, `route "${route.id}" 引用未登记的 View "${route.view}"`);
      if (entry.sidecar.kind !== "fgui") fail(label, `route "${route.id}" 引用的 View "${route.view}" 不是 fgui 页面`);
      if (entry.feature !== feature.id) fail(label, `route "${route.id}" 引用了 feature "${entry.feature}" 登记的 View`);
      if (entry.sidecar.group === undefined || entry.sidecar.restore === undefined) {
        fail(entry.sidecarPath, `被 route "${route.id}" 引用的 View 必须在 sidecar 声明 group 与 restore`);
      }
    }
    for (const item of feature.menu) {
      const key = `${feature.id}/${item.entryId}`;
      if (menuEntryIds.has(key)) fail(label, `menu entryId "${item.entryId}" 重复`);
      menuEntryIds.set(key, feature.id);
    }
  }

  return { features, entries, viewDirs: allViewDirs, root };
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

function generatedClientHeader(): string {
  return "/** AUTO-GENERATED by apps/server/tools/feature-codegen/cli.ts from"
    + " features/<dir>/feature.json + <Name>View.view.json sidecars + apps/art/fairygui/assets. Do not edit. */";
}

function contractConstName(viewName: string): string {
  return `${viewName.toUpperCase()}_CONTRACT`;
}

/** 契约对象（键序固定；可选段缺省省略——与手写 FguiContract 形状一致）。 */
function contractValue(entry: ViewCatalogEntry): Record<string, unknown> {
  const sidecar = entry.sidecar;
  return {
    pkg: sidecar.package,
    comp: sidecar.component,
    required: entry.required,
    ...(sidecar.manualRequired === undefined ? {} : { manualRequired: sidecar.manualRequired }),
    ...(sidecar.nested === undefined ? {} : { nested: sidecar.nested }),
    ...(sidecar.listItems === undefined ? {} : { listItems: sidecar.listItems }),
    ...(sidecar.controllers === undefined ? {} : { controllers: sidecar.controllers }),
    ...(sidecar.relations === undefined ? {} : { relations: sidecar.relations }),
    ...(sidecar.assetUrls === undefined ? {} : { assetUrls: sidecar.assetUrls }),
  };
}

function fguiEntries(catalog: ViewCatalog): readonly ViewCatalogEntry[] {
  return catalog.entries.filter((entry) => entry.sidecar.kind === "fgui");
}

export function renderFguiContracts(catalog: ViewCatalog): string {
  const lines: string[] = [generatedClientHeader()];
  lines.push(`import type { FguiContract } from "../view/fguiContracts";`);
  lines.push("");
  const pages = fguiEntries(catalog);
  for (const entry of pages) {
    lines.push(`/** ${entry.sidecar.package}/${entry.sidecar.component}（owner: ${entry.sidecar.owner}；真源 ${entry.sidecarPath}） */`);
    lines.push(`export const ${contractConstName(entry.name)}: FguiContract = ${JSON.stringify(contractValue(entry), null, 4)};`);
    lines.push("");
  }
  lines.push("/** 全部已登记视图的契约（守门测试遍历它做相等校验）。 */");
  lines.push("export const FGUI_CONTRACTS: readonly FguiContract[] = [");
  for (const entry of pages) lines.push(`    ${contractConstName(entry.name)},`);
  lines.push("];");
  return `${lines.join("\n")}\n`;
}

/** load 闭包的 import specifier：generated/ 视角的相对路径（去 .ts 后缀）。 */
function loadSpecifier(viewPath: string): string {
  const withoutExtension = viewPath.slice(0, -".ts".length);
  let relative = path.posix.relative(GENERATED_DIR_RELATIVE, withoutExtension);
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return relative;
}

export function renderViews(catalog: ViewCatalog): string {
  const pages = fguiEntries(catalog);
  const lines: string[] = [generatedClientHeader()];
  lines.push(`import { defineView, type ViewMeta } from "../view/defineView";`);
  const constNames = pages.map((entry) => contractConstName(entry.name)).sort();
  lines.push(`import { ${constNames.join(", ")} } from "./fguiContracts.generated";`);
  lines.push("");
  lines.push("/** 不可变 View catalog（ViewMgr 的默认查询源；铁律 10：load 是字面量动态 import 闭包）。 */");
  lines.push("export const GENERATED_VIEW_CATALOG: Readonly<Record<string, ViewMeta>> = {");
  for (const entry of pages) {
    const sidecar = entry.sidecar;
    lines.push(`    ${entry.name}: defineView({`);
    lines.push(`        name: ${JSON.stringify(entry.name)}, contract: ${contractConstName(entry.name)}, layer: ${JSON.stringify(sidecar.layer)},`);
    lines.push(`        fullscreen: ${sidecar.fullscreen}, onlyOne: ${sidecar.onlyOne}, permanent: ${sidecar.permanent}, interactive: ${sidecar.interactive},`);
    if (sidecar.sharedPkgs !== undefined) {
      lines.push(`        sharedPkgs: ${JSON.stringify(sidecar.sharedPkgs)},`);
    }
    lines.push(`        load: () => import(${JSON.stringify(loadSpecifier(entry.viewPath))}).then((m) => m.${entry.name}View),`);
    lines.push("    }),");
  }
  lines.push("};");
  lines.push("");
  lines.push(`export type GeneratedViewKind = "fgui" | "cocos";`);
  lines.push("");
  lines.push("/** View 源文件清单（fgui-manifest.mjs 与守门测试消费的精确路径集合；行格式由本生成器唯一拥有）。 */");
  lines.push("export interface GeneratedViewSourceRecord {");
  lines.push("    readonly name: string;");
  lines.push("    readonly owner: string;");
  lines.push("    readonly kind: GeneratedViewKind;");
  lines.push("    readonly pkg?: string;");
  lines.push("    readonly comp?: string;");
  lines.push("    readonly path: string;");
  lines.push("    readonly logic: string;");
  lines.push("    readonly sidecar: string;");
  lines.push("}");
  lines.push("");
  lines.push("export const VIEW_SOURCE_RECORDS: readonly GeneratedViewSourceRecord[] = [");
  for (const entry of catalog.entries) {
    const sidecar = entry.sidecar;
    const fguiSegment = sidecar.kind === "fgui"
      ? `pkg: ${JSON.stringify(sidecar.package)}, comp: ${JSON.stringify(sidecar.component)}, `
      : "";
    lines.push(`    { name: ${JSON.stringify(entry.name)}, owner: ${JSON.stringify(sidecar.owner)}, kind: ${JSON.stringify(sidecar.kind)}, `
      + fguiSegment
      + `path: ${JSON.stringify(entry.viewPath)}, logic: ${JSON.stringify(sidecar.logic)}, sidecar: ${JSON.stringify(entry.sidecarPath)} },`);
  }
  lines.push("];");
  lines.push("");
  lines.push("/** manifest 声明的 view 目录（守门测试的递归比对根）。 */");
  lines.push("export const VIEW_SOURCE_DIRS: readonly string[] = [");
  for (const dir of catalog.viewDirs) lines.push(`    ${JSON.stringify(dir)},`);
  lines.push("];");
  return `${lines.join("\n")}\n`;
}

/** menu contribution 排序：slot → order → featureId → entryId（§7.4）。 */
function compareContributions(
  left: { slot: number; order: number; featureId: string; entryId: string },
  right: { slot: number; order: number; featureId: string; entryId: string },
): number {
  if (left.slot !== right.slot) return left.slot - right.slot;
  if (left.order !== right.order) return left.order - right.order;
  if (left.featureId !== right.featureId) return left.featureId < right.featureId ? -1 : 1;
  return left.entryId < right.entryId ? -1 : (left.entryId > right.entryId ? 1 : 0);
}

export function renderFeatures(catalog: ViewCatalog): string {
  const entryByName = new Map(catalog.entries.map((entry) => [entry.name, entry]));
  const lines: string[] = [generatedClientHeader()];
  lines.push("");
  lines.push("/** 单条业务路由声明：view 名对应 View catalog 键；group/restore 逐字来自该 View 的 sidecar。 */");
  lines.push("export interface GeneratedFeatureRoute {");
  lines.push("    readonly id: string;");
  lines.push("    readonly view: string;");
  lines.push("    readonly group: string;");
  lines.push(`    readonly restore: "keep-mounted" | "reopen" | "fallback" | "discard";`);
  lines.push("}");
  lines.push("");
  lines.push("/** 玩法启动目标（LaunchPort.launch 的载荷；§7.4 点击唯一出口）。 */");
  lines.push("export interface GeneratedLaunchTarget {");
  lines.push(`    readonly kind: "gameplay";`);
  lines.push("    readonly gameplayId: string;");
  lines.push("}");
  lines.push("");
  lines.push("/** Home 菜单入口贡献（§7.4：菜单唯一数据源）。 */");
  lines.push("export interface GeneratedMenuContribution {");
  lines.push("    readonly entryId: string;");
  lines.push("    readonly featureId: string;");
  lines.push("    readonly slot: number;");
  lines.push("    readonly order: number;");
  lines.push("    readonly label: string;");
  lines.push("    readonly labelKey: string;");
  lines.push("    readonly icon?: string;");
  lines.push("    readonly launch: GeneratedLaunchTarget;");
  lines.push("}");
  lines.push("");
  lines.push("export interface GeneratedFeatureDescriptor {");
  lines.push("    readonly id: string;");
  lines.push("    readonly resident: boolean;");
  lines.push("    readonly dependencies: readonly string[];");
  lines.push("    readonly routes: readonly GeneratedFeatureRoute[];");
  lines.push("    readonly menu: readonly GeneratedMenuContribution[];");
  lines.push("}");
  lines.push("");
  lines.push("/** feature 全集（生成器删除保护锚）。 */");
  lines.push("export const FEATURE_IDS: readonly string[] = [");
  for (const feature of catalog.features) lines.push(`    ${JSON.stringify(feature.id)},`);
  lines.push("];");
  lines.push("");
  lines.push("export const GENERATED_FEATURES: readonly GeneratedFeatureDescriptor[] = [");
  for (const feature of catalog.features) {
    lines.push("    {");
    lines.push(`        id: ${JSON.stringify(feature.id)},`);
    lines.push(`        resident: ${feature.resident},`);
    lines.push(`        dependencies: ${JSON.stringify(feature.dependencies)},`);
    lines.push("        routes: [");
    for (const route of feature.routes) {
      const entry = entryByName.get(route.view)!;
      lines.push(`            { id: ${JSON.stringify(route.id)}, view: ${JSON.stringify(route.view)}, `
        + `group: ${JSON.stringify(entry.sidecar.group)}, restore: ${JSON.stringify(entry.sidecar.restore)} },`);
    }
    lines.push("        ],");
    lines.push("        menu: [");
    const menu = [...feature.menu]
      .map((item) => ({ ...item, featureId: feature.id }))
      .sort(compareContributions);
    for (const item of menu) {
      lines.push(`            { entryId: ${JSON.stringify(item.entryId)}, featureId: ${JSON.stringify(feature.id)}, `
        + `slot: ${item.slot}, order: ${item.order}, label: ${JSON.stringify(item.label)}, labelKey: ${JSON.stringify(item.labelKey)}, `
        + (item.icon === undefined ? "" : `icon: ${JSON.stringify(item.icon)}, `)
        + `launch: { kind: "gameplay", gameplayId: ${JSON.stringify(item.launch.gameplayId)} } },`);
    }
    lines.push("        ],");
    lines.push("    },");
  }
  lines.push("];");
  lines.push("");
  lines.push("/** 全仓菜单贡献（已按 slot → order → featureId → entryId 排序）。 */");
  lines.push("export const GENERATED_MENU_CONTRIBUTIONS: readonly GeneratedMenuContribution[] = [");
  const all = catalog.features
    .flatMap((feature) => feature.menu.map((item) => ({ ...item, featureId: feature.id })))
    .sort(compareContributions);
  for (const item of all) {
    lines.push(`    { entryId: ${JSON.stringify(item.entryId)}, featureId: ${JSON.stringify(item.featureId)}, `
      + `slot: ${item.slot}, order: ${item.order}, label: ${JSON.stringify(item.label)}, labelKey: ${JSON.stringify(item.labelKey)}, `
      + (item.icon === undefined ? "" : `icon: ${JSON.stringify(item.icon)}, `)
      + `launch: { kind: "gameplay", gameplayId: ${JSON.stringify(item.launch.gameplayId)} } },`);
  }
  lines.push("];");
  return `${lines.join("\n")}\n`;
}

// ── 能力索引（docs/features.generated.md，§5.7 阶段 7） ─────────────────────

/** 状态词汇表：只允许这三个结构状态；⛔ 无任何测试实跑/人工验收语义的状态词。 */
export const FEATURE_INDEX_STATUSES = ["planned", "registered", "source-present"] as const;

/** 索引内文档链接：docs/ 视角的相对链接（纯文本变换，⛔ 不做存在性 IO——索引字节只由
 *  feature.json 决定；文档存在性由 verify-inventory 的登记面校验）。 */
function indexDocLink(doc: string): string {
  let relative = path.posix.relative("docs", doc.split(path.sep).join("/"));
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return `[${doc}](${relative})`;
}

export function renderFeatureIndex(catalog: ViewCatalog): string {
  const lines: string[] = [];
  lines.push("<!-- AUTO-GENERATED by apps/server/tools/feature-codegen/cli.ts from features/<dir>/feature.json. Do not edit. -->");
  lines.push("");
  lines.push("# 能力索引（features 生成）");
  lines.push("");
  lines.push("由 `npm --workspace @game/server run codegen:features` 从 `features/<dir>/feature.json` 生成。");
  lines.push("状态字段只描述可机检的**结构状态**（词汇表仅 `planned` / `registered` / `source-present` 三值），");
  lines.push("不代表测试实跑或人工验收结论；实跑证据、开放问题与完成判断由人工维护在");
  lines.push("`docs/inventory.json` 的 `routeOfTruth.corePlan` 指向的当前计划文件里（本生成器⛔ 不写任何 plan-*.md）。");
  lines.push("");
  lines.push("- `registered`：feature.json 有效且已并入本次生成的客户端 catalog；");
  lines.push("- `source-present`：capability fragment 声明的 `defaultEntry` 在仓内存在；");
  lines.push("- `planned`：capability fragment 已声明但其 `defaultEntry` 尚不存在。");
  lines.push("");
  lines.push("额外能力的政策、边界与非承诺说明见 [docs/EXTRAFEATURES.md](EXTRAFEATURES.md)；");
  lines.push("capability fragment 的合并规则由 `npm run verify:inventory` fail-closed 校验。");
  lines.push("");
  lines.push("## feature 目录");
  lines.push("");
  lines.push("| feature | category | 状态 | 权威文档 |");
  lines.push("| --- | --- | --- | --- |");
  for (const feature of catalog.features) {
    const docs = feature.docs.length === 0
      ? "—"
      : feature.docs.map((doc) => indexDocLink(doc)).join("、");
    lines.push(`| \`${feature.id}\` | ${feature.category} | registered | ${docs} |`);
  }
  lines.push("");
  lines.push("## capability fragment");
  lines.push("");
  const fragments = catalog.features.flatMap((feature) =>
    feature.capabilities.map((fragment) => ({ feature: feature.id, fragment })));
  if (fragments.length === 0) {
    lines.push("（当前没有 feature 声明 capability fragment。）");
  } else {
    lines.push("| capability | 所属 feature | category | defaultEntry | 状态 | 权威文档 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const { feature, fragment } of fragments) {
      const status = fs.existsSync(path.resolve(catalog.root, fragment.defaultEntry))
        ? "source-present"
        : "planned";
      const docs = fragment.docs.length === 0
        ? "—"
        : fragment.docs.map((doc) => indexDocLink(doc)).join("、");
      lines.push(`| \`${fragment.id}\` | \`${feature}\` | ${fragment.category} | \`${fragment.defaultEntry}\` | ${status} | ${docs} |`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function renderViewCatalogArtifacts(catalog: ViewCatalog): ReadonlyMap<string, string> {
  return new Map([
    [FGUI_CONTRACTS_RELATIVE, renderFguiContracts(catalog)],
    [VIEWS_RELATIVE, renderViews(catalog)],
    [FEATURES_RELATIVE, renderFeatures(catalog)],
    [FEATURE_INDEX_RELATIVE, renderFeatureIndex(catalog)],
  ]);
}

// ── 删除保护锚（从既有生成物恢复集合；生成物格式由本生成器唯一拥有） ────────

export function previousGeneratedViewNames(repositoryRoot: string): readonly string[] {
  const file = path.join(path.resolve(repositoryRoot), VIEWS_RELATIVE);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(/^ {4}\{ name: "([^"\n]+)", owner: "[^"\n]+", kind: "(?:fgui|cocos)", /gmu)]
    .map((match) => match[1]);
}

export function previousGeneratedFeatureIds(repositoryRoot: string): readonly string[] {
  const file = path.join(path.resolve(repositoryRoot), FEATURES_RELATIVE);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const block = text.match(/^export const FEATURE_IDS: readonly string\[\] = \[\n((?: {4}"[^"\n]+",\n)*)\];$/mu);
  if (!block) return [];
  return [...block[1].matchAll(/"([^"\n]+)"/gu)].map((match) => match[1]);
}
