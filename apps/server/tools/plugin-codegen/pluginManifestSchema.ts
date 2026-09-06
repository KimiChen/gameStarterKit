/**
 * plugin.json 的真实 JSON Schema 校验（§5.1/§5.5：additionalProperties:false）。
 *
 * 单源是 `apps/server/tools/plugin/plugin-schema-v2.json`（工具自带，⛔ 不随 --root 走：schema 是工具版本的一部分，
 * fixture 根不需要也不能自带一份）。同一份 schema 同时是打包工具（身份面）与本生成器（登记面）的真相——
 * plugin.json v2 = 身份 + 客户端登记（PLUGIN.md §5.3）。解释器只实现该 schema 用到的 draft-07 关键字子集，并在加载期
 * 对未知关键字 fail-fast——schema 文件演进出解释器认不得的关键字时先炸加载，
 * ⛔ 不允许静默跳过一条约束（形态沿用 gameplay-codegen/manifestSchema.ts）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
/** plugin.json v2 的唯一 schema 文件（打包工具与生成器共用）。 */
export const PLUGIN_SCHEMA_FILE = path.resolve(TOOL_DIR, "../plugin/plugin-schema-v2.json");
export const PLUGIN_SCHEMA_RELATIVE = "apps/server/tools/plugin/plugin-schema-v2.json";
/** kit.json v1 的唯一 schema 文件（docs/KIT.md §3：两份 schema 共用本解释器）。 */
export const KIT_SCHEMA_FILE = path.resolve(TOOL_DIR, "../plugin/kit-schema-v1.json");
export const KIT_SCHEMA_RELATIVE = "apps/server/tools/plugin/kit-schema-v1.json";
export const HOST_SCHEMA_FILE = path.join(TOOL_DIR, "host-schema-v1.json");
export const HOST_SCHEMA_RELATIVE = "apps/server/tools/plugin-codegen/host-schema-v1.json";

export type PluginManifestOwner = {
  readonly id: string;
  readonly logicDir: string;
};

export type PluginManifestRoute = {
  readonly id: string;
  readonly view: string;
};

/**
 * 入口启动目标（docs/PLUGIN.md §6 / PLUGIN-REVIEW F23）：gameplay = 进入已登记玩法；
 * route = 打开一个 plugin route（纯 plugin 插件——兑换码/聊天面板一类——的唯一入口形态）。
 */
export type PluginManifestLaunch =
  | { readonly kind: "gameplay"; readonly gameplayId: string }
  | { readonly kind: "route"; readonly routeId: string };

/**
 * 菜单入口贡献：只声明**身份与元数据**（entryId / label / labelKey / icon / launch），
 * ⛔ 没有 slot/order——位置归宿主（apps/plugins/host.json），插件本就不该有权把自己塞进首屏。
 */
export type PluginManifestMenuItem = {
  readonly entryId: string;
  readonly label: string;
  readonly labelKey: string;
  readonly icon?: string;
  readonly launch: PluginManifestLaunch;
};

/** 宿主 placement（apps/plugins/host.json）：默认玩法 + 首屏 Home 入口的有序 qualified id（`pluginId/entryId`）。 */
export type HostManifest = {
  readonly schemaVersion: 1;
  readonly defaultLaunch: { readonly kind: "gameplay"; readonly gameplayId: string };
  readonly home: readonly string[];
};

/**
 * capability fragment（§5.7 阶段 7）：与中央 docs/inventory.json capability 条目同形状的
 * 结构声明。本生成器只消费 id/category/docs/defaultEntry 渲染能力索引；合并规则的
 * fail-closed 校验（只能 extra、必含 EXTRAS、verification 覆盖等）在
 * scripts/verify-inventory.mjs。
 */
export type PluginCapabilityFragment = {
  readonly id: string;
  readonly category: "core" | "extra";
  readonly defaultEntry: string;
  readonly sourceOfTruth: string;
  readonly wireBoundary: string;
  readonly verification: readonly JsonRecord[];
  readonly docs: readonly string[];
  readonly launch?: JsonRecord;
};

/**
 * 插件对 kit 的依赖声明（docs/KIT.md §4；plugin.json v2 的增量可选字段，⛔ 不 bump schemaVersion：
 * 旧工具按 additionalProperties:false 拒未知键，本身就是前向闸）。
 * `kits[kitId][surface] = 声明的 api 面版本`；判定 `kit.api.<surface>.minSupported ≤ 声明 ≤ version`。
 */
export type PluginRequires = {
  /** 框架 plugin-api 门面版本（PLUGIN-REGISTRY §4.3；门面未实施前只登记不判）。 */
  readonly pluginApiVersion: number | null;
  readonly kits: Readonly<Record<string, Readonly<Record<string, number>>>>;
};

export const EMPTY_REQUIRES: PluginRequires = Object.freeze({ pluginApiVersion: null, kits: Object.freeze({}) });

/** 登记单元的类别（docs/KIT.md §1 三层模型的后两层）：plugin.json ⇒ "plugin"，kit.json ⇒ "kit"。 */
export type UnitClass = "plugin" | "kit";

/** kit.json 相对 plugin.json 多出来的身份面（docs/KIT.md §3）。 */
export type KitApiSurface = { readonly version: number; readonly minSupported: number };
export type KitMode = { readonly id: string; readonly constantName: string };
export type KitSqlTable = { readonly name: string; readonly zone: "per-zone" | "global" };
export type KitEffect = { readonly userKey: string; readonly field: string; readonly max: number };

export type KitRegistration = Omit<PluginRegistration, "schemaVersion" | "requires"> & {
  readonly schemaVersion: 1;
  readonly api: Readonly<Record<string, KitApiSurface>>;
  readonly modes: readonly KitMode[];
  readonly sql: { readonly files: readonly string[]; readonly tables: readonly KitSqlTable[] };
  readonly userKeys: readonly string[];
  readonly effects: Readonly<Record<string, KitEffect>>;
};

export type PluginRegistration = {
  readonly schemaVersion: 2;
  readonly id: string;
  /** 包版本；null = 宿主自有单元（不可打包、不进锁；域名前缀规则 (iii) 对其豁免）。 */
  readonly version: string | null;
  /** 声明拥有的 Lobby RPC 域（docs/KIT.md §2 域名前缀规则的登记面；缺省空）。 */
  readonly domains: readonly string[];
  /** 对 kit / 框架门面的依赖；缺省空。 */
  readonly requires: PluginRequires;
  /**
   * 能力索引用的结构分类；缺省 extra（core 身份必须显式声明）。
   *
   * gameplay plugin 的取值语义（`apps/plugins/snake/` 落地时定）：**当前范围内的玩法**
   * （根 README「项目边界」与 CLAUDE.md「当前范围」已登记者，如默认入口 snake）声明
   * `core`；仓外/非承诺的额外玩法声明 `extra`，并按 verify-inventory 的合并规则把
   * `docs/EXTRAS.md` 登记为权威边界。
   * ⚠ 本字段只喂能力索引渲染；capability fragment 的 core/extra 另有 fail-closed 规则
   * （fragment 通道只能 extra，见 scripts/verify-inventory.mjs），二者⛔ 不互推。
   */
  readonly category: "core" | "extra";
  /** 能力索引用的权威文档链接（仓库相对路径）；缺省空。 */
  readonly docs: readonly string[];
  /** capability fragment 声明（§5.7）；缺省空——built-in 不产 capability fragment。 */
  readonly capabilities: readonly PluginCapabilityFragment[];
  /**
   * 常驻（PluginHost 语义）：`true` = 不随 route refcount 归零释放。
   *
   * 取值语义：**宿主页面 plugin**（built-in：Login/Home/Confirm 等，整个会话都在）声明
   * `true`；**gameplay plugin**（只在进入该玩法期间活跃，且不拥有任何 route）声明
   * `false`——它没有 route，refcount 通知永不到达，`false` 是如实描述而非省电开关
   * （⛔ 不要为了「保险」把玩法写成常驻，那会把语义变成第二套 built-in）。
   */
  readonly resident: boolean;
  /**
   * 客户端 plugin module（可选）：`apps/client/src/plugins/<id>/index.ts`，须导出
   * `createPluginModule(): PluginModule`。生成器渲染为静态字面量 `load: () => import(...)`
   * （Non-intrusive §5.3：loader 必须是生成的静态字面量），PluginHost 据此 install/dispose；
   * 无 module = 静态常驻（built-in 形态）。
   */
  readonly entry: string | null;
  readonly dependencies: readonly string[];
  readonly viewDirs: readonly string[];
  readonly views: readonly string[];
  readonly owners: readonly PluginManifestOwner[];
  readonly routes: readonly PluginManifestRoute[];
  readonly menu: readonly PluginManifestMenuItem[];
};

function fail(pathLabel: string, message: string): never {
  throw new Error(`[plugin-codegen] ${pathLabel}: ${message}`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 解释器支持的关键字全集；元数据关键字只登记、不参与校验。 */
const SUPPORTED_KEYWORDS = new Set([
  "$schema", "title", "type", "const", "pattern", "minimum", "maximum",
  "required", "properties", "additionalProperties", "items", "patternProperties",
]);

function assertSupportedSchema(schema: unknown, label: string): asserts schema is JsonRecord {
  if (!isRecord(schema)) fail(label, "schema node must be an object");
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      fail(label, `schema uses unsupported keyword "${keyword}" — extend the interpreter before extending the schema`);
    }
  }
  if (isRecord(schema.properties)) {
    for (const [key, child] of Object.entries(schema.properties)) assertSupportedSchema(child, `${label}.properties.${key}`);
  }
  if (isRecord(schema.patternProperties)) {
    for (const [key, child] of Object.entries(schema.patternProperties)) assertSupportedSchema(child, `${label}.patternProperties.${key}`);
  }
  if (schema.items !== undefined) assertSupportedSchema(schema.items, `${label}.items`);
}

const schemaCache = new Map<string, JsonRecord>();

/** 加载并自检一份 schema 文件（⛔ 不接受 --root：schema 随工具走）；同一文件只解析一次。 */
export function loadSchemaFile(file: string, label: string): JsonRecord {
  const cached = schemaCache.get(file);
  if (cached) return cached;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(label, `cannot read valid JSON: ${detail}`);
  }
  assertSupportedSchema(parsed, label);
  schemaCache.set(file, parsed);
  return parsed;
}

/** 加载并自检 plugin.json v2 schema。 */
export function loadPluginRegistrationSchema(): JsonRecord {
  return loadSchemaFile(PLUGIN_SCHEMA_FILE, PLUGIN_SCHEMA_RELATIVE);
}

/** 加载并自检 kit.json v1 schema。 */
export function loadKitRegistrationSchema(): JsonRecord {
  return loadSchemaFile(KIT_SCHEMA_FILE, KIT_SCHEMA_RELATIVE);
}

/** 只做 schema 校验（打包工具复用）：形状合法即返回，语义规则由各调用方自己判。 */
export function validateKitJson(input: unknown, pathLabel: string): void {
  validateNode(loadKitRegistrationSchema(), input, pathLabel);
}

/** 只做 schema 校验（打包工具复用）：形状合法即返回，语义规则由各调用方自己判。 */
export function validatePluginJson(input: unknown, pathLabel: string): void {
  validateNode(loadPluginRegistrationSchema(), input, pathLabel);
}

function validateNode(schema: JsonRecord, value: unknown, pathLabel: string): void {
  if (schema.const !== undefined) {
    if (value !== schema.const) fail(pathLabel, `must be ${JSON.stringify(schema.const)}`);
    return;
  }
  const type = schema.type;
  if (type === "object") {
    if (!isRecord(value)) fail(pathLabel, "must be an object");
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const patternProperties = isRecord(schema.patternProperties) ? Object.entries(schema.patternProperties) : [];
    const matchingPatterns = (key: string): JsonRecord[] => patternProperties
      .filter(([pattern]) => new RegExp(pattern, "u").test(key))
      .map(([, child]) => child as JsonRecord);
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key)
        && matchingPatterns(key).length === 0);
      if (unknown.length > 0) fail(pathLabel, `unknown key(s): ${unknown.join(", ")}`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
      for (const patternSchema of matchingPatterns(key)) validateNode(patternSchema, child, `${pathLabel}.${key}`);
    }
    const required = Array.isArray(schema.required) ? schema.required : [];
    const missing = required.filter((key) => typeof key === "string"
      && !Object.prototype.hasOwnProperty.call(value, key));
    if (missing.length > 0) fail(pathLabel, `missing key(s): ${missing.join(", ")}`);
    for (const [key, child] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (!isRecord(child)) fail(`${pathLabel}.${key}`, "invalid schema node");
      validateNode(child, value[key], `${pathLabel}.${key}`);
    }
    return;
  }
  if (type === "string") {
    if (typeof value !== "string") fail(pathLabel, "must be a string");
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      fail(pathLabel, `does not match pattern ${schema.pattern}`);
    }
    return;
  }
  if (type === "integer") {
    if (!Number.isSafeInteger(value)) fail(pathLabel, "must be a safe integer");
    const numeric = value as number;
    if (typeof schema.minimum === "number" && numeric < schema.minimum) fail(pathLabel, `must be >= ${schema.minimum}`);
    if (typeof schema.maximum === "number" && numeric > schema.maximum) fail(pathLabel, `must be <= ${schema.maximum}`);
    return;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") fail(pathLabel, "must be a boolean");
    return;
  }
  if (type === "array") {
    if (!Array.isArray(value)) fail(pathLabel, "must be an array");
    if (isRecord(schema.items)) {
      value.forEach((item, index) => validateNode(schema.items as JsonRecord, item, `${pathLabel}[${index}]`));
    }
    return;
  }
  fail(pathLabel, `schema declares unsupported type: ${String(type)}`);
}

/** launch 判别联合的跨字段规则（schema 解释器无 oneOf：kind 决定哪个 id 必填、另一个必须缺席）。 */
function parseLaunch(launch: JsonRecord, pathLabel: string): PluginManifestLaunch {
  if (launch.kind === "gameplay") {
    if (typeof launch.gameplayId !== "string") fail(pathLabel, `kind:"gameplay" 必须声明 gameplayId`);
    if (launch.routeId !== undefined) fail(pathLabel, `kind:"gameplay" 不得同时声明 routeId`);
    return { kind: "gameplay", gameplayId: launch.gameplayId };
  }
  if (launch.kind === "route") {
    if (typeof launch.routeId !== "string") fail(pathLabel, `kind:"route" 必须声明 routeId`);
    if (launch.gameplayId !== undefined) fail(pathLabel, `kind:"route" 不得同时声明 gameplayId`);
    return { kind: "route", routeId: launch.routeId };
  }
  fail(pathLabel, `未知 launch.kind：${String(launch.kind)}`);
}

let cachedHostSchema: JsonRecord | null = null;

export function loadHostManifestSchema(): JsonRecord {
  if (cachedHostSchema) return cachedHostSchema;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(HOST_SCHEMA_FILE, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(HOST_SCHEMA_RELATIVE, `cannot read valid JSON: ${detail}`);
  }
  assertSupportedSchema(parsed, HOST_SCHEMA_RELATIVE);
  cachedHostSchema = parsed;
  return parsed;
}

export function readHostManifest(repositoryRoot: string): HostManifest {
  const file = path.join(repositoryRoot, "apps/plugins/host.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail("apps/plugins/host.json", `cannot read valid JSON（宿主必须显式声明 defaultLaunch 与 home placement）: ${detail}`);
  }
  validateNode(loadHostManifestSchema(), parsed, "apps/plugins/host.json");
  const value = parsed as JsonRecord;
  const home = [...(value.home as string[])];
  const seen = new Set<string>();
  for (const entry of home) {
    if (seen.has(entry)) fail("apps/plugins/host.json", `home 重复登记 "${entry}"`);
    seen.add(entry);
  }
  return {
    schemaVersion: 1,
    defaultLaunch: { kind: "gameplay", gameplayId: (value.defaultLaunch as JsonRecord).gameplayId as string },
    home,
  };
}

function parseRequires(value: unknown, pathLabel: string): PluginRequires {
  if (value === undefined) return EMPTY_REQUIRES;
  const record = value as JsonRecord;
  const kits: Record<string, Record<string, number>> = {};
  for (const [kitId, surfaces] of Object.entries(isRecord(record.kits) ? record.kits : {})) {
    const entries = Object.entries(surfaces as JsonRecord);
    if (entries.length === 0) fail(`${pathLabel}.kits.${kitId}`, "至少声明一个 api 面");
    kits[kitId] = Object.fromEntries(entries.map(([surface, version]) => [surface, version as number]));
  }
  return {
    pluginApiVersion: typeof record.pluginApiVersion === "number" ? record.pluginApiVersion : null,
    kits,
  };
}

type RegistrationCommon = Omit<PluginRegistration, "schemaVersion" | "requires">;

function parseRegistrationCommon(value: JsonRecord, pathLabel: string): RegistrationCommon {
  const list = (key: string): JsonRecord[] => (Array.isArray(value[key]) ? (value[key] as JsonRecord[]) : []);
  const menu = list("menu").map((item, index) => ({
    entryId: item.entryId as string,
    label: item.label as string,
    labelKey: item.labelKey as string,
    ...(item.icon === undefined ? {} : { icon: item.icon as string }),
    launch: parseLaunch(item.launch as JsonRecord, `${pathLabel}.menu[${index}].launch`),
  }));
  return {
    id: value.id as string,
    version: typeof value.version === "string" ? value.version : null,
    domains: assertUniqueStrings(Array.isArray(value.domains) ? [...(value.domains as string[])] : [], `${pathLabel}.domains`, "域"),
    category: value.category === "core" ? "core" : "extra",
    docs: Array.isArray(value.docs) ? [...(value.docs as string[])] : [],
    capabilities: Array.isArray(value.capabilities)
      ? (value.capabilities as JsonRecord[]).map((fragment) => ({
        id: fragment.id as string,
        category: fragment.category === "core" ? "core" as const : "extra" as const,
        defaultEntry: fragment.defaultEntry as string,
        sourceOfTruth: fragment.sourceOfTruth as string,
        wireBoundary: fragment.wireBoundary as string,
        verification: [...(fragment.verification as JsonRecord[])],
        docs: [...(fragment.docs as string[])],
        ...(fragment.launch === undefined ? {} : { launch: fragment.launch as JsonRecord }),
      }))
      : [],
    resident: value.resident === true,
    entry: typeof value.entry === "string" ? value.entry : null,
    dependencies: Array.isArray(value.dependencies) ? [...(value.dependencies as string[])] : [],
    viewDirs: Array.isArray(value.viewDirs) ? [...(value.viewDirs as string[])] : [],
    views: Array.isArray(value.views) ? [...(value.views as string[])] : [],
    owners: list("owners").map((owner) => ({
      id: owner.id as string,
      logicDir: owner.logicDir as string,
    })),
    routes: list("routes").map((route) => ({
      id: route.id as string,
      view: route.view as string,
    })),
    menu,
  };
}

/** 校验并归一化一份 plugin manifest；可选字段给出确定缺省。 */
export function parsePluginRegistration(input: unknown, pathLabel: string): PluginRegistration {
  validateNode(loadPluginRegistrationSchema(), input, pathLabel);
  const value = input as JsonRecord;
  return { schemaVersion: 2, ...parseRegistrationCommon(value, pathLabel), requires: parseRequires(value.requires, `${pathLabel}.requires`) };
}

function assertUniqueStrings(values: readonly string[], pathLabel: string, what: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(pathLabel, `${what} 重复：${value}`);
    seen.add(value);
  }
  return values;
}

/**
 * 校验并归一化一份 kit manifest（docs/KIT.md §3）。登记面与插件同一解释；kit 多出来的跨字段规则在这里判：
 * api 面 `minSupported ≤ version`；modes 的 id / constantName 各自唯一；sql.tables 表名必须以 `k_<id 小写>_` 开头且唯一、
 * sql.files 唯一；userKeys 唯一；effects 的 userKey 必须是 userKeys 成员。
 */
export function parseKitRegistration(input: unknown, pathLabel: string): KitRegistration {
  validateNode(loadKitRegistrationSchema(), input, pathLabel);
  const value = input as JsonRecord;
  const common = parseRegistrationCommon(value, pathLabel);
  const api: Record<string, KitApiSurface> = {};
  for (const [surface, spec] of Object.entries(isRecord(value.api) ? value.api : {})) {
    const record = spec as JsonRecord;
    const version = record.version as number;
    const minSupported = record.minSupported as number;
    if (minSupported > version) fail(`${pathLabel}.api.${surface}`, `minSupported（${minSupported}）不得大于 version（${version}）`);
    api[surface] = { version, minSupported };
  }
  const modes: KitMode[] = (Array.isArray(value.modes) ? (value.modes as JsonRecord[]) : [])
    .map((mode) => ({ id: mode.id as string, constantName: mode.constantName as string }));
  assertUniqueStrings(modes.map((mode) => mode.id), `${pathLabel}.modes`, "mode id");
  assertUniqueStrings(modes.map((mode) => mode.constantName), `${pathLabel}.modes`, "constantName");
  const sqlRecord = isRecord(value.sql) ? value.sql : {};
  const files = Array.isArray(sqlRecord.files) ? [...(sqlRecord.files as string[])] : [];
  assertUniqueStrings(files, `${pathLabel}.sql.files`, "迁移文件");
  const tablePrefix = `k_${common.id.toLowerCase()}_`;
  const tables: KitSqlTable[] = (Array.isArray(sqlRecord.tables) ? (sqlRecord.tables as JsonRecord[]) : [])
    .map((table) => ({ name: table.name as string, zone: table.zone as "per-zone" | "global" }));
  for (const table of tables) {
    if (!table.name.startsWith(tablePrefix)) fail(`${pathLabel}.sql.tables`, `表名 "${table.name}" 必须以 "${tablePrefix}" 开头（KIT.md §2）`);
  }
  assertUniqueStrings(tables.map((table) => table.name), `${pathLabel}.sql.tables`, "表名");
  if (files.length === 0 && tables.length > 0) fail(`${pathLabel}.sql`, "声明了表却没有迁移文件");
  const userKeys = Array.isArray(value.userKeys) ? [...(value.userKeys as string[])] : [];
  assertUniqueStrings(userKeys, `${pathLabel}.userKeys`, "userKey");
  const effects: Record<string, KitEffect> = {};
  for (const [name, spec] of Object.entries(isRecord(value.effects) ? value.effects : {})) {
    const record = spec as JsonRecord;
    const userKey = record.userKey as string;
    if (!userKeys.includes(userKey)) fail(`${pathLabel}.effects.${name}`, `userKey "${userKey}" 不在 userKeys 内`);
    effects[name] = { userKey, field: record.field as string, max: record.max as number };
  }
  return { schemaVersion: 1, ...common, api, modes, sql: { files, tables }, userKeys, effects };
}
