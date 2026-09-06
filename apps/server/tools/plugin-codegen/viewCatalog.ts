/**
 * View/FGUI catalog 读取与渲染（Non-intrusive §7.1/§7.4/§7.5 阶段 6）。
 *
 * 输入（唯一真源）：
 *  - `apps/plugins/<id>/plugin.json`（class "plugin"：宿主自有插件与安装进来的插件同一根，PLUGIN.md §5.5
 *    阶段 1）∪ `apps/kits/<id>/kit.json`（class "kit"，docs/KIT.md §3/§7；根可缺席），分别经
 *    apps/server/tools/plugin/{plugin-schema-v2,kit-schema-v1}.json 真实 JSON Schema 校验（两份 schema 一个解释器）；
 *    两类单元共享 id 空间（大小写归一唯一）与保留字；kit 的 class 对 PluginHost 不可见——它与插件一样进
 *    GENERATED_PLUGINS / PLUGIN_IDS / 菜单贡献；
 *  - 每个 View 同目录的 `<Name>View.view.json` sidecar（手写 metadata，逐字进产物）；
 *  - `apps/art/fairygui/assets` 的 FGUI XML（复用 tools/fgui-codegen 的 parseFgui/binding
 *    计算 direct required；⛔ 不执行任何客户端 TS）。
 *
 * 产物（全部经 lib.ts 的原子写盘与 freshness 闸）：
 *  - `apps/client/src/generated/fguiContracts.generated.ts`：FguiContract 全集；
 *  - `apps/client/src/generated/views.generated.ts`：不可变 View catalog（load 是字面量
 *    动态 import，铁律 10）+ View 源文件清单（fgui-manifest.mjs 与守门测试的路径单源）。
 *    ⚠ catalog 收录面 = FGUI 页面 ∪ **被 plugin routes 引用的** cocos View；未被引用的
 *    cocos View（BallMove/SnakeWorld 这类玩法表现件）只进源文件清单，不进 catalog；
 *  - `apps/client/src/generated/plugins.generated.ts`：plugin/route/menu contribution 数据
 *    （menu 只声明身份，排序 pluginId → entryId；位置归宿主 `apps/plugins/host.json`，渲染为
 *    GENERATED_HOST：defaultLaunch + 首屏 home placement，docs/PLUGIN.md §6）；
 *  - `apps/shared/src/kits/catalog.generated.ts`（KIT_CATALOG / KIT_EFFECT_KINDS）与
 *    `apps/server/src/kits/catalog.generated.ts`（SERVER_KIT_CATALOG：多 sqlFiles / sqlTables / userKeys）：
 *    kit 登记的双端形态（docs/KIT.md §3/§5）；零 kit 时与占位生成物字节相同。
 *
 * kit 相对插件多出来的闸（docs/KIT.md §4/§7）：`kit.json.modes[]` ≡ `apps/kits/<id>/gameplays/` 子目录集
 * （id 与 constantName 逐个相等）；插件 `requires.kits` 的每个 kit 必须已发现、每个 api 面必须存在且
 * `minSupported ≤ 声明 ≤ version`，随后并入 PluginHost 的 dependencies（有 client entry 的 kit 先装载，⛔ 不写两遍：
 * 插件 `dependencies` 直接点名 kit 即拒绝，requires.kits 是插件依赖 kit 的唯一通道）；kit 的 `dependencies` 必须为空
 * （§1：kit 只依赖框架；v0 无 kit-on-kit，也 ⛔ 不得反向依赖插件）；
 * 域名前缀规则（§2，对插件同样生效）见 assertDomainOwnership（由 lib.ts 在拿到域 descriptor 集后调用）。
 *
 * 校验 fail-fast（§7.5）：重复 qualified View id、一 View 一 manifest、logic 路径存在且位于
 * owner 声明目录（中央 logic/、plugins/<id>/ 或 kits/<id>/）、sidecar⇔View 文件双向（viewDirs 递归发现，未登记红）、`ui://` 引用 ⊆
 * 自身∪sharedPkgs、sharedPkgs ⊇ art 传递闭包∪assetUrls 所属包、package/component 重复引用
 * 仅允许显式 aliasOf、路径越界/符号链接拒绝、plugin 依赖环拒绝。
 *
 * ⚠ 生成条目的 `sharedPkgs` 是 sidecar 声明值的逐字迁移（校验 ⊇ 闭包而非 ==）：
 * 现仓 LoginNotice 刻意多声明 L10n_zh_hans（字体包），改成“== 闭包”会静默削掉它。
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseFguiComponent } from "../../../../tools/fgui-codegen/parseFgui";
import { bindingFields } from "../../../../tools/fgui-codegen/binding";
import {
  parseKitRegistration,
  parsePluginRegistration,
  readHostManifest,
  type KitRegistration,
  type PluginRegistration,
  type PluginManifestLaunch,
  type HostManifest,
  type UnitClass,
} from "./pluginManifestSchema";

/** 插件根（PLUGIN.md §5.5）：宿主自有插件与安装进来的插件都在 `apps/plugins/<id>/plugin.json`，目录名 = id。 */
export const PLUGINS_DIR_RELATIVE = "apps/plugins";
/** kit 根（docs/KIT.md §2/§7）：`apps/kits/<id>/kit.json`，目录名 = id；根可缺席（当前真仓无 kit）。 */
export const KITS_DIR_RELATIVE = "apps/kits";
/** kit 自带玩法单源子目录：`apps/kits/<id>/gameplays/<modeId>/{manifest.json,state.json}`（gameplay-codegen 的第三发现根同名）。 */
export const KIT_GAMEPLAYS_SUBDIR = "gameplays";
const PLUGIN_DIR_NAME = /^[a-z][A-Za-z0-9]{0,63}$/u;
/** 保留目录名（两类单元共用）：与宿主 placement 文件 / 注册表配置同名会混淆（PLUGIN-REGISTRY §2.2）。 */
const RESERVED_PLUGIN_IDS = new Set(["host", "registry"]);

interface PluginSource {
  readonly class: UnitClass;
  readonly label: string;
  readonly dirLabel: string;
  readonly file: string;
  readonly dirName: string;
}

const UNIT_ROOTS: readonly { readonly class: UnitClass; readonly dir: string; readonly manifest: string; readonly required: boolean }[] = [
  { class: "plugin", dir: PLUGINS_DIR_RELATIVE, manifest: "plugin.json", required: true },
  { class: "kit", dir: KITS_DIR_RELATIVE, manifest: "kit.json", required: false },
];

/**
 * 发现根：apps/plugins/<id>/plugin.json（必须存在）∪ apps/kits/<id>/kit.json（根可缺席）。
 * 每个子目录都必须是对应类别的单元（没有登记文件即 fail）。
 */
function discoverPluginSources(root: string): readonly PluginSource[] {
  const sources: PluginSource[] = [];
  for (const unitRoot of UNIT_ROOTS) {
    const dir = path.join(root, unitRoot.dir);
    if (!fs.existsSync(dir)) {
      if (unitRoot.required) fail(unitRoot.dir, `${unitRoot.class}s directory is missing`);
      continue;
    }
    // 存在但不是目录（例如误建了名为 apps/kits 的文件）：⛔ 不当作「根缺席」放行，也不让 readdir 抛裸 ENOTDIR。
    if (!fs.statSync(dir).isDirectory()) fail(unitRoot.dir, "must be a directory");
    for (const dirName of fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      sources.push({
        class: unitRoot.class,
        label: `${unitRoot.dir}/${dirName}/${unitRoot.manifest}`,
        dirLabel: `${unitRoot.dir}/${dirName}`,
        file: path.join(dir, dirName, unitRoot.manifest),
        dirName,
      });
    }
  }
  return sources;
}
const ART_DIR_RELATIVE = "apps/art/fairygui/assets";
const CLIENT_SRC_RELATIVE = "apps/client/src";
const GENERATED_DIR_RELATIVE = "apps/client/src/generated";
export const FGUI_CONTRACTS_RELATIVE = `${GENERATED_DIR_RELATIVE}/fguiContracts.generated.ts`;
export const VIEWS_RELATIVE = `${GENERATED_DIR_RELATIVE}/views.generated.ts`;
export const PLUGINS_RELATIVE = `${GENERATED_DIR_RELATIVE}/plugins.generated.ts`;
/** 能力索引（§5.7 阶段 7）：根文档只链接此索引，不在多处复制状态。 */
export const PLUGIN_INDEX_RELATIVE = "docs/plugins.generated.md";
/** kit 登记的双端生成物（docs/KIT.md §3；类型真源 catalogTypes.ts 手写）。 */
export const KIT_CATALOG_SHARED_RELATIVE = "apps/shared/src/kits/catalog.generated.ts";
export const KIT_CATALOG_SERVER_RELATIVE = "apps/server/src/kits/catalog.generated.ts";

const VIEW_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/u;
const VIEW_LAYERS = ["base", "popup", "top"] as const;
const RESTORE_KINDS = ["keep-mounted", "reopen", "fallback", "discard"] as const;
/** view/ 下的机械件（渲染栈基类，非页面视图），双向发现时豁免（与 viewRegistry.test 的 MACHINERY 同源语义）。 */
const VIEW_MACHINERY = new Set(["FguiView.ts", "CocosView.ts"]);

function fail(pathLabel: string, message: string): never {
  throw new Error(`[plugin-codegen] ${pathLabel}: ${message}`);
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
    fail(label, "owner must be a camelCase plugin/gameplay id");
  }
  if (input.kind !== "fgui" && input.kind !== "cocos") fail(label, 'kind must be "fgui" | "cocos"');
  if (!(VIEW_LAYERS as readonly string[]).includes(input.layer as string)) {
    fail(label, `layer must be one of ${VIEW_LAYERS.join("/")}`);
  }
  for (const key of ["fullscreen", "onlyOne", "permanent", "interactive"] as const) {
    if (typeof input[key] !== "boolean") fail(label, `${key} must be a boolean`);
  }
  // logic 落点：中央 logic/、plugin 自持目录 apps/client/src/plugins/<id>/（Non-intrusive §11.3 的插件形态）
  // 或 kit 自持目录 apps/client/src/kits/<id>/（docs/KIT.md §2）。
  if (typeof input.logic !== "string" || !input.logic.endsWith(".ts")
    || !(input.logic.startsWith("apps/client/src/logic/") || input.logic.startsWith("apps/client/src/plugins/")
      || input.logic.startsWith("apps/client/src/kits/"))) {
    fail(label, "logic must be a repo-relative path under apps/client/src/logic/, apps/client/src/plugins/ or apps/client/src/kits/ ending in .ts");
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
  readonly plugin: string;
  readonly sidecar: ViewSidecar;
  /** 仓库相对路径（posix）。 */
  readonly sidecarPath: string;
  readonly viewPath: string;
  /** 仅 kind:"fgui"：从 XML 算出的 direct required。 */
  readonly required: readonly FguiFieldContractData[];
};

/**
 * 进入 catalog 的登记单元：插件（`dependencies` 已是 requires.kits 并入后的有效依赖）或 kit。
 * class 只在生成器内部与能力索引可见；客户端产物对二者一视同仁。
 */
export type CatalogUnit =
  | (PluginRegistration & { readonly class: "plugin" })
  | (KitRegistration & { readonly class: "kit" });

export type ViewCatalog = {
  /** 全部登记单元（插件 ∪ kit），按 id 排序。字段名沿用历史（消费方只按 id/entry/routes/menu 读）。 */
  readonly plugins: readonly CatalogUnit[];
  readonly entries: readonly ViewCatalogEntry[];
  /** 全部 plugin 声明的 view 目录（仓库相对，排序去重）。 */
  readonly viewDirs: readonly string[];
  /** 仓库根（绝对路径）：能力索引渲染时做 fragment defaultEntry 的存在性判定，⛔ 不进产物字节。 */
  readonly root: string;
  /** 宿主 placement（apps/plugins/host.json）：默认玩法 + 首屏入口顺序，⛔ 插件 manifest 无权声明位置。 */
  readonly host: HostManifest;
};

/** 玩法 id 集合：canonical（wireExposed !== false，可作入口）与 fixture（wireExposed:false，⛔ 不得作入口）。 */
type GameplayIdSets = { readonly canonical: ReadonlySet<string>; readonly fixture: ReadonlySet<string> };

/**
 * 只读每玩法 manifest 的 id/wireExposed（launch.gameplayId 与 host.defaultLaunch 的存在性/可入口性闸）：
 * 拼错的 id 与 fixture 玩法都不该进 GENERATED_HOST / contribution——它们不在 GameplayModeId、不在两端装配集。
 * ⛔ 不复用 gameplay-codegen 的完整读取（那会把 state/wire 校验也拉进来），只做最小解析。
 */
function readGameplayIdSets(root: string): GameplayIdSets {
  const schemaDir = path.join(root, "apps/shared/schema/gameplays");
  if (!fs.existsSync(schemaDir)) fail("apps/shared/schema/gameplays", "gameplay schema directory is missing（plugin 入口校验需要玩法 manifest）");
  const canonical = new Set<string>();
  const fixture = new Set<string>();
  // 与 gameplay-codegen 同一对发现根：schema 目录 ∪ apps/plugins/<id>/gameplay/（PLUGIN.md §5.5 阶段 1）。
  const manifests: { readonly file: string; readonly label: string }[] = [];
  for (const entry of fs.readdirSync(schemaDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    manifests.push({ file: path.join(schemaDir, entry.name, "manifest.json"), label: `apps/shared/schema/gameplays/${entry.name}/manifest.json` });
  }
  const pluginsDir = path.join(root, PLUGINS_DIR_RELATIVE);
  if (fs.existsSync(pluginsDir)) {
    for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      manifests.push({ file: path.join(pluginsDir, entry.name, "gameplay", "manifest.json"), label: `${PLUGINS_DIR_RELATIVE}/${entry.name}/gameplay/manifest.json` });
    }
  }
  // 第三发现根（docs/KIT.md §7）：apps/kits/<kitId>/gameplays/<modeId>/manifest.json。
  const kitsDir = path.join(root, KITS_DIR_RELATIVE);
  if (fs.existsSync(kitsDir)) {
    for (const kit of fs.readdirSync(kitsDir, { withFileTypes: true })) {
      if (!kit.isDirectory()) continue;
      for (const mode of kitGameplayDirs(root, kit.name)) {
        manifests.push({
          file: path.join(kitsDir, kit.name, KIT_GAMEPLAYS_SUBDIR, mode, "manifest.json"),
          label: `${KITS_DIR_RELATIVE}/${kit.name}/${KIT_GAMEPLAYS_SUBDIR}/${mode}/manifest.json`,
        });
      }
    }
  }
  for (const { file, label } of manifests) {
    if (!fs.existsSync(file)) continue;
    let parsed: { readonly id?: unknown; readonly wireExposed?: unknown };
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { readonly id?: unknown; readonly wireExposed?: unknown };
    } catch (error) {
      fail(label, `cannot read valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof parsed.id !== "string") continue;
    (parsed.wireExposed === false ? fixture : canonical).add(parsed.id);
  }
  return { canonical, fixture };
}

function assertLaunchableGameplay(label: string, gameplayId: string, sets: GameplayIdSets, context: string): void {
  if (sets.canonical.has(gameplayId)) return;
  if (sets.fixture.has(gameplayId)) {
    fail(label, `${context} 引用 fixture 玩法 "${gameplayId}"（manifest wireExposed:false，不装配客户端 module / 服务端 mode，⛔ 不得作为入口）`);
  }
  fail(label, `${context} 引用未登记的玩法 "${gameplayId}"（apps/shared/schema/gameplays/、apps/plugins/<id>/gameplay/ 与 apps/kits/<id>/gameplays/<modeId>/ 下都没有该 manifest）`);
}

/** kit 的玩法子目录名集合（排序；gameplays/ 缺席 = 空集）。 */
function kitGameplayDirs(root: string, kitId: string): readonly string[] {
  const dir = path.join(root, KITS_DIR_RELATIVE, kitId, KIT_GAMEPLAYS_SUBDIR);
  if (!fs.existsSync(dir)) return [];
  if (!fs.statSync(dir).isDirectory()) fail(`${KITS_DIR_RELATIVE}/${kitId}/${KIT_GAMEPLAYS_SUBDIR}`, "must be a directory");
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * kit.json 的 modes[] 必须与 `apps/kits/<id>/gameplays/` 的子目录集一一对应（docs/KIT.md §3：锁抬头与所有权都按
 * modes 逐个推玩法规则，登记面与单源目录脱节即 fail），且每个 manifest.json 的 constantName 与登记值相等。
 */
function assertKitModesMatchGameplays(root: string, kit: KitRegistration, label: string): void {
  const dirs = kitGameplayDirs(root, kit.id);
  const declared = new Map(kit.modes.map((mode) => [mode.id, mode]));
  for (const mode of dirs) {
    if (!declared.has(mode)) {
      fail(label, `${KIT_GAMEPLAYS_SUBDIR}/${mode}/ 存在但 modes[] 未登记该 mode（kit.json.modes 必须 ≡ gameplays/ 子目录集）`);
    }
  }
  for (const mode of kit.modes) {
    if (!dirs.includes(mode.id)) {
      fail(label, `modes[] 登记了 "${mode.id}" 但 ${KITS_DIR_RELATIVE}/${kit.id}/${KIT_GAMEPLAYS_SUBDIR}/${mode.id}/ 不存在（kit.json.modes 必须 ≡ gameplays/ 子目录集）`);
    }
    const manifestLabel = `${KITS_DIR_RELATIVE}/${kit.id}/${KIT_GAMEPLAYS_SUBDIR}/${mode.id}/manifest.json`;
    const manifestFile = path.join(root, manifestLabel);
    assertRegularFile(manifestFile, manifestLabel);
    let parsed: { readonly id?: unknown; readonly constantName?: unknown };
    try {
      parsed = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as { readonly id?: unknown; readonly constantName?: unknown };
    } catch (error) {
      fail(manifestLabel, `cannot read valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (parsed.id !== mode.id) fail(manifestLabel, `manifest.id（${JSON.stringify(parsed.id)}）必须等于 mode 目录名 "${mode.id}"`);
    if (parsed.constantName !== mode.constantName) {
      fail(label, `mode "${mode.id}" 的 constantName "${mode.constantName}" 与 ${manifestLabel} 的 constantName ${JSON.stringify(parsed.constantName)} 不一致`);
    }
  }
}

/** 顶层 `export function <name>` / `export const <name>` 是否存在（语法级，⛔ 不执行客户端 TS）。 */
function hasExportedFunction(source: string, label: string, name: string): boolean {
  const sourceFile = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const isExported = (statement: ts.Statement): boolean =>
    (ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name?.text === name) return true;
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return true;
      }
    }
  }
  return false;
}

function detectDependencyCycle(plugins: readonly CatalogUnit[]): void {
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string, chain: readonly string[]): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) fail(PLUGINS_DIR_RELATIVE, `plugin 依赖环：${[...chain, id].join(" → ")}`);
    visiting.add(id);
    for (const dep of byId.get(id)?.dependencies ?? []) {
      if (!byId.has(dep)) fail(PLUGINS_DIR_RELATIVE, `plugin "${id}" 依赖不存在的 plugin "${dep}"`);
      visit(dep, [...chain, id]);
    }
    visiting.delete(id);
    done.add(id);
  };
  for (const plugin of plugins) visit(plugin.id, []);
}

/**
 * 插件对 kit 的依赖闸（docs/KIT.md §4）：每个 required kit 必须是已发现的 kit，每个 api 面必须存在且
 * `minSupported ≤ 声明 ≤ version`；返回并入后的有效 dependencies = [有 client entry 的 required kit（按 id 排序）] ++
 * 声明 dependencies（去重，kit 先）。无 entry 的 kit 不进 PluginHost 装载序（那里没有东西可装）。
 *
 * 插件对 kit 的依赖只有 requires.kits 这一条通道：声明 `dependencies` 直接点名 kit 即拒绝——否则 api 面版本闸、
 * plugin 工具的反向闸（--break-dependents 只读 requires.kits）与卸载依赖反查全被绕过（KIT.md §4「⛔ 不写两遍」）。
 */
function mergeRequiredKits(
  plugin: PluginRegistration,
  kitsById: ReadonlyMap<string, KitRegistration>,
  label: string,
): readonly string[] {
  for (const dep of plugin.dependencies) {
    if (kitsById.has(dep)) {
      fail(label, `插件 ${plugin.id} 的 dependencies 直接引用 kit "${dep}"——对 kit 的依赖只能经 requires.kits 声明（KIT.md §4：codegen 自动并入，⛔ 不写两遍）`);
    }
  }
  const requiredKitIds = Object.keys(plugin.requires.kits).sort();
  for (const kitId of requiredKitIds) {
    const kit = kitsById.get(kitId);
    if (!kit) fail(label, `插件 ${plugin.id} 需要 kit ${kitId}，但该 kit 未安装（${KITS_DIR_RELATIVE}/${kitId}/kit.json 不存在）`);
    for (const [surface, declared] of Object.entries(plugin.requires.kits[kitId])) {
      // 只认自有属性：即便 api 映射将来退回普通字面量，也不会读到 Object.prototype 成员而 fail-open。
      const spec = Object.prototype.hasOwnProperty.call(kit.api, surface) ? kit.api[surface] : undefined;
      if (!spec) {
        fail(label, `插件 ${plugin.id} 需要 kit ${kitId} 的 api 面 ${surface} 版本 ${declared}，宿主 kit 没有该 api 面（已有：${Object.keys(kit.api).sort().join(", ") || "无"}）`);
      }
      if (declared < spec.minSupported || declared > spec.version) {
        fail(label, `插件 ${plugin.id} 需要 kit ${kitId} 的 api 面 ${surface} 版本 ${declared}，宿主 kit 提供 [${spec.minSupported}, ${spec.version}]`);
      }
    }
  }
  const merged: string[] = [];
  for (const kitId of requiredKitIds) {
    if (kitsById.get(kitId)!.entry !== null && !merged.includes(kitId)) merged.push(kitId);
  }
  for (const dep of plugin.dependencies) {
    if (!merged.includes(dep)) merged.push(dep);
  }
  return merged;
}

/** 单元 id 对域名的边界前缀：域 === id，或以 id 开头且紧随其后的是大写字母 / 数字（`slg` → `slgAdmin`，⛔ 不匹配 `slgx`）。 */
function boundaryPrefixes(unitId: string, domain: string): boolean {
  if (domain === unitId) return true;
  if (!domain.startsWith(unitId)) return false;
  return /^[A-Z0-9]/u.test(domain.slice(unitId.length));
}

/**
 * 大小写归一版的边界前缀：前缀按归一比较（`slgadmin` 也算 `slgAdminOps` 的前缀单元），
 * 但边界字符（紧随前缀的大写字母 / 数字）按域**原文**判——⛔ 不能把域也归一后再判，否则大写边界永远不成立。
 */
function boundaryPrefixesFolded(unitId: string, domain: string): boolean {
  const folded = unitId.toLowerCase();
  const domainFolded = domain.toLowerCase();
  if (domainFolded === folded) return true;
  if (!domainFolded.startsWith(folded)) return false;
  return /^[A-Z0-9]/u.test(domain.slice(unitId.length));
}

/**
 * 域名前缀规则（docs/KIT.md §2「域名必须以包 id 开头；该规则对插件同样生效」）——按登记面的 `domains` 交叉核对
 * Lobby RPC 域 descriptor 集（由 lib.ts 传入）：
 *  (i)  一个域只能被一个单元声明；
 *  (ii) 声明的域必须以声明者 id 为边界前缀，且声明者必须是**最长的**边界前缀单元（大小写归一）：
 *       单元 `snake` 不得在 `snakeCosmetic` 存在时声明 `snakeCosmeticX`；声明的域还必须真有 descriptor；
 *  (iii) 未被任何单元声明的域（宿主 / 框架自有：guild / mail / room / shop / user / snakeCosmetic）不得等于或被任一
 *       **带 version 的**单元 id 边界前缀匹配（否则可分发单元的前缀被框架先占）；宿主自有单元（无 version）豁免。
 */
export function assertDomainOwnership(domainIds: readonly string[], units: readonly CatalogUnit[]): void {
  const label = `${PLUGINS_DIR_RELATIVE} + ${KITS_DIR_RELATIVE}`;
  const owners = new Map<string, CatalogUnit>();
  for (const unit of units) {
    for (const domain of unit.domains) {
      const existing = owners.get(domain);
      if (existing) fail(label, `域 "${domain}" 同时被 ${existing.class} "${existing.id}" 与 ${unit.class} "${unit.id}" 声明（一个域一个主人）`);
      owners.set(domain, unit);
    }
  }
  const longestPrefixOwner = (domain: string): CatalogUnit | null => {
    let best: CatalogUnit | null = null;
    for (const unit of units) {
      if (!boundaryPrefixesFolded(unit.id, domain)) continue;
      if (best === null || unit.id.length > best.id.length) best = unit;
    }
    return best;
  };
  const known = new Set(domainIds);
  for (const [domain, owner] of owners) {
    if (!boundaryPrefixes(owner.id, domain)) {
      fail(label, `${owner.class} "${owner.id}" 声明的域 "${domain}" 必须等于其 id 或以其 id 开头并紧随大写字母/数字（KIT.md §2 域名前缀规则）`);
    }
    const longest = longestPrefixOwner(domain);
    if (longest !== null && longest.id !== owner.id) {
      fail(label, `${owner.class} "${owner.id}" 声明的域 "${domain}" 的最长前缀单元是 "${longest.id}"——该域只能由 "${longest.id}" 声明`);
    }
    if (!known.has(domain)) {
      fail(label, `${owner.class} "${owner.id}" 声明的域 "${domain}" 没有 descriptor（apps/shared/src/protocol/lobbyRpc/domains/${domain}.ts 不存在）`);
    }
  }
  for (const domain of domainIds) {
    if (owners.has(domain)) continue;
    for (const unit of units) {
      if (unit.version === null) continue;
      if (boundaryPrefixesFolded(unit.id, domain)) {
        fail(label, `域 "${domain}" 未被任何单元声明，却等于或以带版本的 ${unit.class} "${unit.id}" 为前缀——宿主 / 框架自有域不得占用可分发单元的前缀（要么由 "${unit.id}" 声明该域，要么改名）`);
      }
    }
  }
}

/** 发现并校验全部 plugin / kit manifest 与 view sidecar；返回稳定排序的 catalog。 */
export function readViewCatalog(repositoryRoot: string): ViewCatalog {
  const root = path.resolve(repositoryRoot);
  const parsedPlugins: PluginRegistration[] = [];
  const kitsById = new Map<string, KitRegistration>();
  const seenPluginIds = new Map<string, string>();
  /** 单元 id → 其登记目录标签（apps/plugins/<id> 或 apps/kits/<id>），错误信息据此点名真源。 */
  const dirLabelById = new Map<string, string>();
  const manifestLabelById = new Map<string, string>();
  for (const source of discoverPluginSources(root)) {
    const { label, dirName } = source;
    const noun = source.class === "kit" ? "kit" : "插件";
    if (!PLUGIN_DIR_NAME.test(dirName)) fail(label, `${noun}目录名 "${dirName}" 必须是合法${noun} id（小写字母开头的驼峰）`);
    if (RESERVED_PLUGIN_IDS.has(dirName)) fail(label, `${noun} id "${dirName}" 是保留字（${[...RESERVED_PLUGIN_IDS].join(", ")}）`);
    assertRegularFile(source.file, label);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(source.file, "utf8"));
    } catch (error) {
      fail(label, `cannot read valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const manifest = source.class === "kit" ? parseKitRegistration(parsed, label) : parsePluginRegistration(parsed, label);
    if (manifest.id !== dirName) fail(label, `${noun} id ("${manifest.id}") 必须等于${noun}目录名 ("${dirName}")`);
    // plugin 与 kit 共享同一 id 空间（docs/KIT.md §3：撞名即拒绝）。
    const normalized = manifest.id.toLowerCase();
    const clash = seenPluginIds.get(normalized);
    if (clash) fail(label, `${noun} id 与 "${clash}" 大小写归一化后冲突（${dirLabelById.get(clash) ?? "?"} ⟷ ${source.dirLabel}）`);
    seenPluginIds.set(normalized, manifest.id);
    dirLabelById.set(manifest.id, source.dirLabel);
    manifestLabelById.set(manifest.id, label);
    if (manifest.schemaVersion === 1) {
      assertKitModesMatchGameplays(root, manifest, label);
      kitsById.set(manifest.id, manifest);
    } else {
      parsedPlugins.push(manifest);
    }
  }
  const plugins: CatalogUnit[] = [
    ...parsedPlugins.map((plugin): CatalogUnit => ({
      ...plugin,
      class: "plugin",
      dependencies: mergeRequiredKits(plugin, kitsById, manifestLabelById.get(plugin.id)!),
    })),
    ...[...kitsById.values()].map((kit): CatalogUnit => ({ ...kit, class: "kit" })),
  ];
  plugins.sort((left, right) => (left.id < right.id ? -1 : 1));
  // kit 只依赖框架（docs/KIT.md §1）：v0 ⛔ 不依赖 kit，也 ⛔ 不依赖插件——依赖解析只做 plugin → kit 单向，
  // 否则地基层会被排到插件之后装载，且 plugin 工具的卸载反查（只读插件 requires.kits）看不见这条边。
  for (const unit of plugins) {
    if (unit.class !== "kit") continue;
    for (const dep of unit.dependencies) {
      if (kitsById.has(dep)) fail(manifestLabelById.get(unit.id)!, `kit "${unit.id}" 不得依赖别的 kit "${dep}"（KIT.md §4：v0 无 kit-on-kit）`);
      fail(manifestLabelById.get(unit.id)!, `kit "${unit.id}" 不得依赖插件 "${dep}"（KIT.md §1/§4：kit 只依赖框架，依赖解析只做 plugin → kit 单向）`);
    }
  }
  detectDependencyCycle(plugins);

  const artDir = path.join(root, ART_DIR_RELATIVE);
  const id2name = buildPkgIdMap(artDir);
  const knownPackages = new Set(id2name.values());
  const closureCache = new Map<string, Set<string>>();

  const entries: ViewCatalogEntry[] = [];
  const nameOwners = new Map<string, string>();
  const sidecarOwners = new Map<string, string>();
  for (const plugin of plugins) {
    const pluginLabel = dirLabelById.get(plugin.id) ?? `${PLUGINS_DIR_RELATIVE}/${plugin.id}`;
    const ownerDirs = new Map<string, string>();
    for (const owner of plugin.owners) {
      if (ownerDirs.has(owner.id)) fail(pluginLabel, `owners 重复声明 "${owner.id}"`);
      ownerDirs.set(owner.id, owner.logicDir);
    }
    if (plugin.entry !== null) {
      // 命名空间按 class 分（docs/KIT.md §2）：插件 apps/client/src/plugins/<id>/，kit apps/client/src/kits/<id>/。
      const expected = `${CLIENT_SRC_RELATIVE}/${plugin.class === "kit" ? "kits" : "plugins"}/${plugin.id}/index.ts`;
      if (plugin.entry !== expected) fail(pluginLabel, `entry 必须是本 ${plugin.class} 自己的 ${expected}（读到 ${plugin.entry}）`);
      const moduleFile = path.resolve(root, plugin.entry);
      const manifestLabel = manifestLabelById.get(plugin.id) ?? `${pluginLabel}/plugin.json`;
      assertRegularFile(moduleFile, `${manifestLabel} → ${plugin.entry}`);
      if (!hasExportedFunction(fs.readFileSync(moduleFile, "utf8"), plugin.entry, "createPluginModule")) {
        fail(`${manifestLabel} → ${plugin.entry}`, `${plugin.class} entry 必须导出约定符号 createPluginModule（() => PluginModule）`);
      }
    }
    for (const dir of plugin.viewDirs) {
      const resolved = path.resolve(root, dir);
      if (!resolved.startsWith(path.join(root, CLIENT_SRC_RELATIVE) + path.sep)) {
        fail(pluginLabel, `viewDirs 越出 ${CLIENT_SRC_RELATIVE}: ${dir}`);
      }
      if (!fs.existsSync(resolved)) fail(pluginLabel, `viewDirs 目录不存在: ${dir}`);
    }
    for (const sidecarRelative of plugin.views) {
      const label = sidecarRelative;
      const claimed = sidecarOwners.get(sidecarRelative);
      if (claimed) fail(label, `同一 View sidecar 同时被 ${claimed} 与 ${plugin.id} 登记（一 View 一 manifest）`);
      sidecarOwners.set(sidecarRelative, plugin.id);
      const sidecarFile = path.resolve(root, sidecarRelative);
      if (!plugin.viewDirs.some((dir) => sidecarFile.startsWith(path.resolve(root, dir) + path.sep))) {
        fail(label, `sidecar 不在本 plugin 声明的任何 viewDirs 之内`);
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
        fail(label, `owner "${sidecar.owner}" 未在 ${manifestLabelById.get(plugin.id) ?? `${pluginLabel}/plugin.json`} 的 owners 表登记 logicDir`);
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
        plugin: plugin.id,
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
      fail(PLUGINS_DIR_RELATIVE, `组件 ${key} 被 ${bucket.map((entry) => entry.name).join(", ")} 重复引用，`
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
  const allViewDirs = [...new Set(plugins.flatMap((plugin) => plugin.viewDirs))].sort();
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
          fail(relative, "发现未登记的 *View.ts：为它新增同目录 <Name>View.view.json 并登记进 plugin.json 的 views");
        }
      }
    };
    walk(base);
  }

  // route 校验：view 必须是已登记 View（fgui 或 cocos 均可），group/restore 由其 sidecar 声明。
  const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
  const routeIds = new Map<string, string>();
  const routeViews = new Map<string, string>();
  const menuEntryIds = new Map<string, string>();
  const gameplayContributors = new Map<string, string>();
  const gameplayIds = readGameplayIdSets(root);
  // route 先全部登记（launch.kind:"route" 可以引用他 plugin 的 route），再校验 menu。
  for (const plugin of plugins) {
    const label = manifestLabelById.get(plugin.id) ?? `${PLUGINS_DIR_RELATIVE}/${plugin.id}/plugin.json`;
    for (const route of plugin.routes) {
      const clash = routeIds.get(route.id);
      if (clash) fail(label, `route id "${route.id}" 与 plugin "${clash}" 重复`);
      routeIds.set(route.id, plugin.id);
      const viewClash = routeViews.get(route.view);
      if (viewClash) fail(label, `route view "${route.view}" 已被 plugin "${viewClash}" 的路由占用`);
      routeViews.set(route.view, plugin.id);
      const entry = entryByName.get(route.view);
      if (!entry) fail(label, `route "${route.id}" 引用未登记的 View "${route.view}"`);
      if (entry.plugin !== plugin.id) fail(label, `route "${route.id}" 引用了 plugin "${entry.plugin}" 登记的 View`);
      if (entry.sidecar.group === undefined || entry.sidecar.restore === undefined) {
        fail(entry.sidecarPath, `被 route "${route.id}" 引用的 View 必须在 sidecar 声明 group 与 restore`);
      }
    }
  }
  for (const plugin of plugins) {
    const label = manifestLabelById.get(plugin.id) ?? `${PLUGINS_DIR_RELATIVE}/${plugin.id}/plugin.json`;
    for (const item of plugin.menu) {
      // entryId 全仓唯一（PLUGIN-REVIEW F24）：宿主 placement 与设置面板都按裸 entryId 引用/查找。
      const clash = menuEntryIds.get(item.entryId);
      if (clash) {
        fail(label, clash === plugin.id
          ? `menu entryId "${item.entryId}" 重复`
          : `menu entryId "${item.entryId}" 已被 plugin "${clash}" 使用（entryId 全仓唯一）`);
      }
      menuEntryIds.set(item.entryId, plugin.id);
      if (item.launch.kind === "gameplay") {
        assertLaunchableGameplay(label, item.launch.gameplayId, gameplayIds, `menu entryId "${item.entryId}" 的 launch`);
        // 一 gameplayId 一贡献者（F17）：launch→plugin 映射不能靠排序裁决。
        const owner = gameplayContributors.get(item.launch.gameplayId);
        if (owner && owner !== plugin.id) {
          fail(label, `玩法 "${item.launch.gameplayId}" 的入口已由 plugin "${owner}" 贡献（一 gameplayId 一贡献者）`);
        }
        gameplayContributors.set(item.launch.gameplayId, plugin.id);
      } else if (!routeIds.has(item.launch.routeId)) {
        fail(label, `menu entryId "${item.entryId}" 的 launch 引用未登记的 route "${item.launch.routeId}"`);
      }
    }
  }

  // 宿主 placement：默认玩法必须有唯一贡献者；home 里每个 qualified id 必须真实存在。
  const host = readHostManifest(root);
  assertLaunchableGameplay("apps/plugins/host.json", host.defaultLaunch.gameplayId, gameplayIds, "defaultLaunch");
  if (!gameplayContributors.has(host.defaultLaunch.gameplayId)) {
    fail("apps/plugins/host.json", `defaultLaunch 指向没有任何 plugin 贡献入口的玩法 "${host.defaultLaunch.gameplayId}"`);
  }
  for (const qualified of host.home) {
    const [pluginId, entryId] = qualified.split("/");
    if (menuEntryIds.get(entryId) !== pluginId) {
      fail("apps/plugins/host.json", `home 引用不存在的入口 "${qualified}"（形态 pluginId/entryId，须与某条 menu contribution 一致）`);
    }
  }
  // 分组：成员必须真实存在；组 id ⛔ 不得与任何入口 id 或单元 id 撞车（设置面板把组渲染成一行，
  // 撞车会让「点的到底是组还是入口」取决于实现细节）。
  const unitIds = new Set(plugins.map((plugin) => plugin.id));
  for (const group of host.groups) {
    if (menuEntryIds.has(group.id)) {
      fail("apps/plugins/host.json", `分组 id "${group.id}" 与入口 id 同名——设置面板同一层里两者都是一行，⛔ 不允许同名`);
    }
    if (unitIds.has(group.id)) {
      fail("apps/plugins/host.json", `分组 id "${group.id}" 与 plugin/kit id 同名——⛔ 不允许（分组是宿主 placement，不是单元）`);
    }
    for (const qualified of group.members) {
      const [pluginId, entryId] = qualified.split("/");
      if (menuEntryIds.get(entryId) !== pluginId) {
        fail("apps/plugins/host.json", `分组 "${group.id}" 引用不存在的入口 "${qualified}"（形态 pluginId/entryId，须与某条 menu contribution 一致）`);
      }
    }
  }

  return { plugins, entries, viewDirs: allViewDirs, root, host };
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

function generatedClientHeader(): string {
  return "/** AUTO-GENERATED by apps/server/tools/plugin-codegen/cli.ts from"
    + " apps/plugins/<id>/plugin.json + apps/kits/<id>/kit.json + <Name>View.view.json sidecars + apps/art/fairygui/assets. Do not edit. */";
}

// ── kit 登记的双端生成物（docs/KIT.md §3/§5） ─────────────────────────────

const KIT_CATALOG_HEADER = "/** AUTO-GENERATED by apps/server/tools/plugin-codegen/cli.ts from apps/kits/<id>/kit.json. Do not edit. */";
const TS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

/** 把 JSON 值渲染成 TS 对象字面量（键为合法标识符时不加引号；4 空格缩进；确定性键序 = 调用方给定顺序）。 */
function tsLiteral(value: unknown, indent: number): string {
  const pad = " ".repeat(indent);
  const inner = " ".repeat(indent + 4);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${inner}${tsLiteral(item, indent + 4)},`).join("\n")}\n${pad}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const inline = entries.every(([, item]) => !isRecord(item) && !Array.isArray(item));
    const render = ([key, item]: [string, unknown]): string =>
      `${TS_IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${tsLiteral(item, indent + 4)}`;
    if (inline) return `{ ${entries.map(render).join(", ")} }`;
    return `{\n${entries.map((entry) => `${inner}${render(entry)},`).join("\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

type KitEffectRecord = { readonly kitId: string; readonly name: string; readonly userKey: string; readonly field: string; readonly max: number };

function kitUnits(catalog: ViewCatalog): readonly (KitRegistration & { readonly class: "kit" })[] {
  return catalog.plugins.filter((unit): unit is KitRegistration & { readonly class: "kit" } => unit.class === "kit");
}

/** effects 按 name 排序（kit:<kitId>:<name> 的登记序）。 */
function kitEffects(kit: KitRegistration): readonly KitEffectRecord[] {
  return Object.keys(kit.effects).sort().map((name) => ({
    kitId: kit.id, name, userKey: kit.effects[name].userKey, field: kit.effects[name].field, max: kit.effects[name].max,
  }));
}

/** shared 条目字段（键序固定 = KitCatalogEntry 声明序）。 */
function sharedKitEntry(kit: KitRegistration): Record<string, unknown> {
  return {
    id: kit.id,
    version: kit.version,
    api: Object.fromEntries(Object.keys(kit.api).sort().map((surface) => [surface, { version: kit.api[surface].version, minSupported: kit.api[surface].minSupported }])),
    modes: kit.modes.map((mode) => ({ id: mode.id, constantName: mode.constantName })),
    domains: [...kit.domains],
    effects: kitEffects(kit),
  };
}

export function renderKitCatalogShared(catalog: ViewCatalog): string {
  const kits = kitUnits(catalog);
  const lines: string[] = [KIT_CATALOG_HEADER];
  lines.push(`import { type KitCatalogEntry, type KitEffectSpec } from "./catalogTypes";`);
  lines.push("");
  lines.push("/** 已登记 kit（按 id 排序）。 */");
  lines.push(`export const KIT_CATALOG: readonly KitCatalogEntry[] = ${tsLiteral(kits.map(sharedKitEntry), 0)};`);
  lines.push("");
  lines.push("/** `kit:<kitId>:<name>` → effect 规格（economy.ts validateGrant 与 Lua 镜像的共同真源）。 */");
  const kinds = Object.fromEntries(kits.flatMap((kit) => kitEffects(kit).map((effect) => [`kit:${effect.kitId}:${effect.name}`, effect])));
  lines.push(`export const KIT_EFFECT_KINDS: Readonly<Record<string, KitEffectSpec>> = ${tsLiteral(kinds, 0)};`);
  return `${lines.join("\n")}\n`;
}

export function renderKitCatalogServer(catalog: ViewCatalog): string {
  const kits = kitUnits(catalog);
  const lines: string[] = [KIT_CATALOG_HEADER];
  lines.push(`import type { ServerKitCatalogEntry } from "./catalogTypes";`);
  lines.push("");
  lines.push("/** 已登记 kit（按 id 排序）；与 @game/shared/kits/catalog.generated 的 KIT_CATALOG 同源同序。 */");
  const entries = kits.map((kit) => ({
    ...sharedKitEntry(kit),
    sqlFiles: [...kit.sql.files],
    sqlTables: kit.sql.tables.map((table) => ({ name: table.name, zone: table.zone })),
    userKeys: [...kit.userKeys],
  }));
  lines.push(`export const SERVER_KIT_CATALOG: readonly ServerKitCatalogEntry[] = ${tsLiteral(entries, 0)};`);
  return `${lines.join("\n")}\n`;
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

/**
 * 进入 ViewMgr catalog 的条目 = FGUI 页面 ∪ **被某个 plugin 的 routes 引用的** cocos View。
 *
 * 「被 routes 引用」就是「这是页面、不是玩法表现件」的判别信号：BallMoveView /
 * SnakeWorldView 不在任何 routes 里，天然排除，仍只经 gameplay presentation 挂载。
 * ⛔ 不为此新发明 sidecar 标记字段——多一个可以说谎的字段就是多一处漂移源。
 */
function catalogEntries(catalog: ViewCatalog): readonly ViewCatalogEntry[] {
  const routed = new Set(catalog.plugins.flatMap((plugin) => plugin.routes.map((route) => route.view)));
  return catalog.entries.filter((entry) => entry.sidecar.kind === "fgui" || routed.has(entry.name));
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
  const pages = catalogEntries(catalog);
  const lines: string[] = [generatedClientHeader()];
  lines.push(`import { defineView, type ViewMeta } from "../view/defineView";`);
  const constNames = pages.filter((entry) => entry.sidecar.kind === "fgui")
    .map((entry) => contractConstName(entry.name)).sort();
  if (constNames.length > 0) {
    lines.push(`import { ${constNames.join(", ")} } from "./fguiContracts.generated";`);
  }
  lines.push("");
  lines.push("/** 不可变 View catalog（ViewMgr 的默认查询源；铁律 10：load 是字面量动态 import 闭包）。 */");
  lines.push("export const GENERATED_VIEW_CATALOG: Readonly<Record<string, ViewMeta>> = {");
  for (const entry of pages) {
    const sidecar = entry.sidecar;
    lines.push(`    ${entry.name}: defineView({`);
    // cocos 页面结构上没有 FGUI 段（无 contract / 无 sharedPkgs）——ViewMeta 判别联合在检。
    const contractSegment = sidecar.kind === "fgui" ? `contract: ${contractConstName(entry.name)}, ` : "";
    lines.push(`        name: ${JSON.stringify(entry.name)}, kind: ${JSON.stringify(sidecar.kind)}, ${contractSegment}layer: ${JSON.stringify(sidecar.layer)},`);
    lines.push(`        fullscreen: ${sidecar.fullscreen}, onlyOne: ${sidecar.onlyOne}, permanent: ${sidecar.permanent}, interactive: ${sidecar.interactive},`);
    if (sidecar.kind === "fgui" && sidecar.sharedPkgs !== undefined) {
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

/** menu contribution 排序：pluginId → entryId（确定、与语言无关；位置不由插件声明，docs/PLUGIN.md §6）。 */
function compareContributions(
  left: { pluginId: string; entryId: string },
  right: { pluginId: string; entryId: string },
): number {
  if (left.pluginId !== right.pluginId) return left.pluginId < right.pluginId ? -1 : 1;
  return left.entryId < right.entryId ? -1 : (left.entryId > right.entryId ? 1 : 0);
}

function renderLaunch(launch: PluginManifestLaunch): string {
  return launch.kind === "gameplay"
    ? `launch: { kind: "gameplay", gameplayId: ${JSON.stringify(launch.gameplayId)} }`
    : `launch: { kind: "route", routeId: ${JSON.stringify(launch.routeId)} }`;
}

export function renderPlugins(catalog: ViewCatalog): string {
  const entryByName = new Map(catalog.entries.map((entry) => [entry.name, entry]));
  const lines: string[] = [generatedClientHeader()];
  if (catalog.plugins.some((plugin) => plugin.entry !== null)) {
    // ⚠ noUnusedLocals：只有存在 module 时才引入类型（generated-purity：type-only import 放行）。
    lines.push("import type { PluginModule } from \"../app/PluginHost\";");
  }
  lines.push("");
  lines.push("/** 单条业务路由声明：view 名对应 View catalog 键；group/restore 逐字来自该 View 的 sidecar。 */");
  lines.push("export interface GeneratedPluginRoute {");
  lines.push("    readonly id: string;");
  lines.push("    readonly view: string;");
  lines.push("    readonly group: string;");
  lines.push(`    readonly restore: "keep-mounted" | "reopen" | "fallback" | "discard";`);
  lines.push("}");
  lines.push("");
  lines.push("/** 入口启动目标（LaunchPort.launch 的载荷；§7.4 点击唯一出口）：进入玩法，或打开一个 plugin route。 */");
  lines.push("export type GeneratedLaunchTarget =");
  lines.push(`    | { readonly kind: "gameplay"; readonly gameplayId: string }`);
  lines.push(`    | { readonly kind: "route"; readonly routeId: string };`);
  lines.push("");
  lines.push("/** 菜单入口贡献（§7.4：菜单唯一数据源）；只有身份与元数据，⛔ 无位置字段（位置见 GENERATED_HOST）。 */");
  lines.push("export interface GeneratedMenuContribution {");
  lines.push("    readonly entryId: string;");
  lines.push("    readonly pluginId: string;");
  lines.push("    readonly label: string;");
  lines.push("    readonly labelKey: string;");
  lines.push("    readonly icon?: string;");
  lines.push("    readonly launch: GeneratedLaunchTarget;");
  lines.push("}");
  lines.push("");
  lines.push("export interface GeneratedPluginDescriptor {");
  lines.push("    readonly id: string;");
  lines.push("    readonly resident: boolean;");
  lines.push("    readonly dependencies: readonly string[];");
  lines.push("    readonly routes: readonly GeneratedPluginRoute[];");
  lines.push("    readonly menu: readonly GeneratedMenuContribution[];");
  lines.push("    /** plugin module 加载器（静态字面量动态 import，Non-intrusive §5.3）；无 = 静态常驻。 */");
  lines.push(`    readonly load?: () => Promise<${catalog.plugins.some((plugin) => plugin.entry !== null) ? "PluginModule" : "never"}>;`);
  lines.push("}");
  lines.push("");
  lines.push("/** plugin 全集（生成器删除保护锚）。 */");
  lines.push("export const PLUGIN_IDS: readonly string[] = [");
  for (const plugin of catalog.plugins) lines.push(`    ${JSON.stringify(plugin.id)},`);
  lines.push("];");
  lines.push("");
  lines.push("export const GENERATED_PLUGINS: readonly GeneratedPluginDescriptor[] = [");
  for (const plugin of catalog.plugins) {
    lines.push("    {");
    lines.push(`        id: ${JSON.stringify(plugin.id)},`);
    lines.push(`        resident: ${plugin.resident},`);
    if (plugin.entry !== null) {
      const specifier = path.posix.relative(GENERATED_DIR_RELATIVE, plugin.entry.slice(0, -".ts".length));
      lines.push(`        load: () => import(${JSON.stringify(specifier.startsWith(".") ? specifier : `./${specifier}`)}).then((m) => m.createPluginModule()),`);
    }
    lines.push(`        dependencies: ${JSON.stringify(plugin.dependencies)},`);
    lines.push("        routes: [");
    for (const route of plugin.routes) {
      const entry = entryByName.get(route.view)!;
      lines.push(`            { id: ${JSON.stringify(route.id)}, view: ${JSON.stringify(route.view)}, `
        + `group: ${JSON.stringify(entry.sidecar.group)}, restore: ${JSON.stringify(entry.sidecar.restore)} },`);
    }
    lines.push("        ],");
    lines.push("        menu: [");
    const menu = [...plugin.menu]
      .map((item) => ({ ...item, pluginId: plugin.id }))
      .sort(compareContributions);
    for (const item of menu) {
      lines.push(`            { entryId: ${JSON.stringify(item.entryId)}, pluginId: ${JSON.stringify(plugin.id)}, `
        + `label: ${JSON.stringify(item.label)}, labelKey: ${JSON.stringify(item.labelKey)}, `
        + (item.icon === undefined ? "" : `icon: ${JSON.stringify(item.icon)}, `)
        + `${renderLaunch(item.launch)} },`);
    }
    lines.push("        ],");
    lines.push("    },");
  }
  lines.push("];");
  lines.push("");
  lines.push("/** 全仓菜单贡献（已按 pluginId → entryId 排序；⛔ 不含位置——首屏顺序见 GENERATED_HOST.home）。 */");
  lines.push("export const GENERATED_MENU_CONTRIBUTIONS: readonly GeneratedMenuContribution[] = [");
  const all = catalog.plugins
    .flatMap((plugin) => plugin.menu.map((item) => ({ ...item, pluginId: plugin.id })))
    .sort(compareContributions);
  for (const item of all) {
    lines.push(`    { entryId: ${JSON.stringify(item.entryId)}, pluginId: ${JSON.stringify(item.pluginId)}, `
      + `label: ${JSON.stringify(item.label)}, labelKey: ${JSON.stringify(item.labelKey)}, `
      + (item.icon === undefined ? "" : `icon: ${JSON.stringify(item.icon)}, `)
      + `${renderLaunch(item.launch)} },`);
  }
  lines.push("];");
  lines.push("");
  lines.push("/** 首屏 Home 上的一条入口（宿主 placement 的展开形态）。 */");
  lines.push("export interface GeneratedHostHomeEntry {");
  lines.push("    readonly pluginId: string;");
  lines.push("    readonly entryId: string;");
  lines.push("}");
  lines.push("");
  lines.push("/** 入口分组（宿主 placement 的展开形态）：设置面板把整组渲染成**一行**，点进去才见成员。 */");
  lines.push("export interface GeneratedHostGroup {");
  lines.push("    readonly id: string;");
  lines.push("    readonly label: string;");
  lines.push("    readonly labelKey: string;");
  lines.push("    readonly members: readonly GeneratedHostHomeEntry[];");
  lines.push("}");
  lines.push("");
  lines.push("/** 宿主 placement（apps/plugins/host.json）：默认玩法、首屏入口顺序与入口分组的唯一来源（docs/PLUGIN.md §6）。 */");
  lines.push("export interface GeneratedHostDescriptor {");
  lines.push(`    readonly defaultLaunch: { readonly kind: "gameplay"; readonly gameplayId: string };`);
  lines.push("    readonly home: readonly GeneratedHostHomeEntry[];");
  lines.push("    readonly groups: readonly GeneratedHostGroup[];");
  lines.push("}");
  lines.push("");
  lines.push("export const GENERATED_HOST: GeneratedHostDescriptor = {");
  lines.push(`    defaultLaunch: { kind: "gameplay", gameplayId: ${JSON.stringify(catalog.host.defaultLaunch.gameplayId)} },`);
  lines.push("    home: [");
  for (const qualified of catalog.host.home) {
    const [pluginId, entryId] = qualified.split("/");
    lines.push(`        { pluginId: ${JSON.stringify(pluginId)}, entryId: ${JSON.stringify(entryId)} },`);
  }
  lines.push("    ],");
  lines.push("    groups: [");
  for (const group of catalog.host.groups) {
    lines.push(`        { id: ${JSON.stringify(group.id)}, label: ${JSON.stringify(group.label)}, labelKey: ${JSON.stringify(group.labelKey)}, members: [`);
    for (const qualified of group.members) {
      const [pluginId, entryId] = qualified.split("/");
      lines.push(`            { pluginId: ${JSON.stringify(pluginId)}, entryId: ${JSON.stringify(entryId)} },`);
    }
    lines.push("        ] },");
  }
  lines.push("    ],");
  lines.push("};");
  return `${lines.join("\n")}\n`;
}

// ── 能力索引（docs/plugins.generated.md，§5.7 阶段 7） ─────────────────────

/** 状态词汇表：只允许这三个结构状态；⛔ 无任何测试实跑/人工验收语义的状态词。 */
export const PLUGIN_INDEX_STATUSES = ["planned", "registered", "source-present"] as const;

/** 索引内文档链接：docs/ 视角的相对链接（纯文本变换，⛔ 不做存在性 IO——索引字节只由
 *  plugin.json 决定；文档存在性由 verify-inventory 的登记面校验）。 */
function indexDocLink(doc: string): string {
  let relative = path.posix.relative("docs", doc.split(path.sep).join("/"));
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return `[${doc}](${relative})`;
}

export function renderPluginIndex(catalog: ViewCatalog): string {
  const lines: string[] = [];
  lines.push("<!-- AUTO-GENERATED by apps/server/tools/plugin-codegen/cli.ts from apps/plugins/<id>/plugin.json + apps/kits/<id>/kit.json. Do not edit. -->");
  lines.push("");
  lines.push("# 能力索引（plugins 生成）");
  lines.push("");
  lines.push("由 `npm --workspace @game/server run codegen:plugins` 从 `apps/plugins/<id>/plugin.json`（class `plugin`：宿主自有与安装进来的插件）与 `apps/kits/<id>/kit.json`（class `kit`，docs/KIT.md）生成。");
  lines.push("状态字段只描述可机检的**结构状态**（词汇表仅 `planned` / `registered` / `source-present` 三值），");
  lines.push("不代表测试实跑或人工验收结论；实跑证据、开放问题与完成判断由人工维护在");
  lines.push("`docs/inventory.json` 的 `routeOfTruth.corePlan` 指向的当前计划文件里（本生成器⛔ 不写任何 plan-*.md）。");
  lines.push("");
  lines.push("- `registered`：plugin.json / kit.json 有效且已并入本次生成的客户端 catalog；");
  lines.push("- `source-present`：capability fragment 声明的 `defaultEntry` 在仓内存在；");
  lines.push("- `planned`：capability fragment 已声明但其 `defaultEntry` 尚不存在。");
  lines.push("");
  lines.push("额外能力的政策、边界与非承诺说明见 [docs/EXTRAS.md](EXTRAS.md)；");
  lines.push("capability fragment 的合并规则由 `npm run verify:inventory` fail-closed 校验。");
  lines.push("");
  lines.push("## plugin 目录");
  lines.push("");
  lines.push("| plugin | class | category | 状态 | 权威文档 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const plugin of catalog.plugins) {
    const docs = plugin.docs.length === 0
      ? "—"
      : plugin.docs.map((doc) => indexDocLink(doc)).join("、");
    lines.push(`| \`${plugin.id}\` | ${plugin.class} | ${plugin.category} | registered | ${docs} |`);
  }
  lines.push("");
  lines.push("## capability fragment");
  lines.push("");
  const fragments = catalog.plugins.flatMap((plugin) =>
    plugin.capabilities.map((fragment) => ({ plugin: plugin.id, fragment })));
  if (fragments.length === 0) {
    lines.push("（当前没有 plugin 声明 capability fragment。）");
  } else {
    lines.push("| capability | 所属 plugin | category | defaultEntry | 状态 | 权威文档 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const { plugin, fragment } of fragments) {
      const status = fs.existsSync(path.resolve(catalog.root, fragment.defaultEntry))
        ? "source-present"
        : "planned";
      const docs = fragment.docs.length === 0
        ? "—"
        : fragment.docs.map((doc) => indexDocLink(doc)).join("、");
      lines.push(`| \`${fragment.id}\` | \`${plugin}\` | ${fragment.category} | \`${fragment.defaultEntry}\` | ${status} | ${docs} |`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function renderViewCatalogArtifacts(catalog: ViewCatalog): ReadonlyMap<string, string> {
  return new Map([
    [FGUI_CONTRACTS_RELATIVE, renderFguiContracts(catalog)],
    [VIEWS_RELATIVE, renderViews(catalog)],
    [PLUGINS_RELATIVE, renderPlugins(catalog)],
    [PLUGIN_INDEX_RELATIVE, renderPluginIndex(catalog)],
    [KIT_CATALOG_SHARED_RELATIVE, renderKitCatalogShared(catalog)],
    [KIT_CATALOG_SERVER_RELATIVE, renderKitCatalogServer(catalog)],
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

export function previousGeneratedPluginIds(repositoryRoot: string): readonly string[] {
  const file = path.join(path.resolve(repositoryRoot), PLUGINS_RELATIVE);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const block = text.match(/^export const PLUGIN_IDS: readonly string\[\] = \[\n((?: {4}"[^"\n]+",\n)*)\];$/mu);
  if (!block) return [];
  return [...block[1].matchAll(/"([^"\n]+)"/gu)].map((match) => match[1]);
}

/** 既有 KIT_CATALOG 里的 kit id（kit 同时也在 PLUGIN_IDS；这里是 shared 侧生成物自己的删除保护锚）。 */
export function previousGeneratedKitIds(repositoryRoot: string): readonly string[] {
  const file = path.join(path.resolve(repositoryRoot), KIT_CATALOG_SHARED_RELATIVE);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const block = text.match(/^export const KIT_CATALOG: readonly KitCatalogEntry\[\] = \[\n([\s\S]*?)\n\];$/mu);
  if (!block) return [];
  return [...block[1].matchAll(/^ {8}id: "([^"\n]+)",$/gmu)].map((match) => match[1]);
}
