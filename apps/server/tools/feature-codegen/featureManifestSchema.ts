/**
 * feature.json 的真实 JSON Schema 校验（§5.1/§5.5：additionalProperties:false）。
 *
 * 单源是仓库根 `features/feature-schema-v1.json`（随 features/ 真源目录走 --root seam，
 * fixture 根需自带一份）。解释器只实现该 schema 用到的 draft-07 关键字子集，并在加载期
 * 对未知关键字 fail-fast——schema 文件演进出解释器认不得的关键字时先炸加载，
 * ⛔ 不允许静默跳过一条约束（形态沿用 gameplay-codegen/manifestSchema.ts）。
 */
import fs from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

export type FeatureManifestOwner = {
  readonly id: string;
  readonly logicDir: string;
};

export type FeatureManifestRoute = {
  readonly id: string;
  readonly view: string;
};

/**
 * 入口启动目标（docs/PLUGIN.md §6 / PLUGIN-REVIEW F23）：gameplay = 进入已登记玩法；
 * route = 打开一个 feature route（纯 feature 插件——兑换码/聊天面板一类——的唯一入口形态）。
 */
export type FeatureManifestLaunch =
  | { readonly kind: "gameplay"; readonly gameplayId: string }
  | { readonly kind: "route"; readonly routeId: string };

/**
 * 菜单入口贡献：只声明**身份与元数据**（entryId / label / labelKey / icon / launch），
 * ⛔ 没有 slot/order——位置归宿主（features/host.json），插件本就不该有权把自己塞进首屏。
 */
export type FeatureManifestMenuItem = {
  readonly entryId: string;
  readonly label: string;
  readonly labelKey: string;
  readonly icon?: string;
  readonly launch: FeatureManifestLaunch;
};

/** 宿主 placement（features/host.json）：默认玩法 + 首屏 Home 入口的有序 qualified id（`featureId/entryId`）。 */
export type HostManifest = {
  readonly schemaVersion: 1;
  readonly defaultLaunch: { readonly kind: "gameplay"; readonly gameplayId: string };
  readonly home: readonly string[];
};

/**
 * capability fragment（§5.7 阶段 7）：与中央 docs/inventory.json capability 条目同形状的
 * 结构声明。本生成器只消费 id/category/docs/defaultEntry 渲染能力索引；合并规则的
 * fail-closed 校验（只能 extra、必含 EXTRAFEATURES、verification 覆盖等）在
 * scripts/verify-inventory.mjs。
 */
export type FeatureCapabilityFragment = {
  readonly id: string;
  readonly category: "core" | "extra";
  readonly defaultEntry: string;
  readonly sourceOfTruth: string;
  readonly wireBoundary: string;
  readonly verification: readonly JsonRecord[];
  readonly docs: readonly string[];
  readonly launch?: JsonRecord;
};

export type FeatureManifest = {
  readonly schemaVersion: 1;
  readonly id: string;
  /**
   * 能力索引用的结构分类；缺省 extra（core 身份必须显式声明）。
   *
   * gameplay feature 的取值语义（`features/snake/` 落地时定）：**当前范围内的玩法**
   * （根 README「项目边界」与 CLAUDE.md「当前范围」已登记者，如默认入口 snake）声明
   * `core`；仓外/非承诺的额外玩法声明 `extra`，并按 verify-inventory 的合并规则把
   * `docs/EXTRAFEATURES.md` 登记为权威边界。
   * ⚠ 本字段只喂能力索引渲染；capability fragment 的 core/extra 另有 fail-closed 规则
   * （fragment 通道只能 extra，见 scripts/verify-inventory.mjs），二者⛔ 不互推。
   */
  readonly category: "core" | "extra";
  /** 能力索引用的权威文档链接（仓库相对路径）；缺省空。 */
  readonly docs: readonly string[];
  /** capability fragment 声明（§5.7）；缺省空——built-in 不产 capability fragment。 */
  readonly capabilities: readonly FeatureCapabilityFragment[];
  /**
   * 常驻（FeatureHost 语义）：`true` = 不随 route refcount 归零释放。
   *
   * 取值语义：**宿主页面 feature**（built-in：Login/Home/Confirm 等，整个会话都在）声明
   * `true`；**gameplay feature**（只在进入该玩法期间活跃，且不拥有任何 route）声明
   * `false`——它没有 route，refcount 通知永不到达，`false` 是如实描述而非省电开关
   * （⛔ 不要为了「保险」把玩法写成常驻，那会把语义变成第二套 built-in）。
   */
  readonly resident: boolean;
  /**
   * 客户端 feature module（可选）：`apps/client/src/features/<id>/index.ts`，须导出
   * `createFeatureModule(): FeatureModule`。生成器渲染为静态字面量 `load: () => import(...)`
   * （Non-intrusive §5.3：loader 必须是生成的静态字面量），FeatureHost 据此 install/dispose；
   * 无 module = 静态常驻（built-in 形态）。
   */
  readonly module: string | null;
  readonly dependencies: readonly string[];
  readonly viewDirs: readonly string[];
  readonly views: readonly string[];
  readonly owners: readonly FeatureManifestOwner[];
  readonly routes: readonly FeatureManifestRoute[];
  readonly menu: readonly FeatureManifestMenuItem[];
};

function fail(pathLabel: string, message: string): never {
  throw new Error(`[feature-codegen] ${pathLabel}: ${message}`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 解释器支持的关键字全集；元数据关键字只登记、不参与校验。 */
const SUPPORTED_KEYWORDS = new Set([
  "$schema", "title", "type", "const", "pattern", "minimum", "maximum",
  "required", "properties", "additionalProperties", "items",
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
  if (schema.items !== undefined) assertSupportedSchema(schema.items, `${label}.items`);
}

export function loadFeatureManifestSchema(repositoryRoot: string): JsonRecord {
  const schemaFile = path.join(repositoryRoot, "features/feature-schema-v1.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail("features/feature-schema-v1.json", `cannot read valid JSON: ${detail}`);
  }
  assertSupportedSchema(parsed, "features/feature-schema-v1.json");
  return parsed;
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
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key));
      if (unknown.length > 0) fail(pathLabel, `unknown key(s): ${unknown.join(", ")}`);
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
function parseLaunch(launch: JsonRecord, pathLabel: string): FeatureManifestLaunch {
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

export function loadHostManifestSchema(repositoryRoot: string): JsonRecord {
  const schemaFile = path.join(repositoryRoot, "features/host-schema-v1.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail("features/host-schema-v1.json", `cannot read valid JSON: ${detail}`);
  }
  assertSupportedSchema(parsed, "features/host-schema-v1.json");
  return parsed;
}

/** 读取并校验宿主 placement（features/host.json）；文件缺失即 fail-fast——默认玩法必须显式声明（F16）。 */
export function readHostManifest(repositoryRoot: string): HostManifest {
  const file = path.join(repositoryRoot, "features/host.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail("features/host.json", `cannot read valid JSON（宿主必须显式声明 defaultLaunch 与 home placement）: ${detail}`);
  }
  validateNode(loadHostManifestSchema(repositoryRoot), parsed, "features/host.json");
  const value = parsed as JsonRecord;
  const home = [...(value.home as string[])];
  const seen = new Set<string>();
  for (const entry of home) {
    if (seen.has(entry)) fail("features/host.json", `home 重复登记 "${entry}"`);
    seen.add(entry);
  }
  return {
    schemaVersion: 1,
    defaultLaunch: { kind: "gameplay", gameplayId: (value.defaultLaunch as JsonRecord).gameplayId as string },
    home,
  };
}

/** 校验并归一化一份 feature manifest；可选字段给出确定缺省。 */
export function parseFeatureManifest(repositoryRoot: string, input: unknown, pathLabel: string): FeatureManifest {
  const schema = loadFeatureManifestSchema(repositoryRoot);
  validateNode(schema, input, pathLabel);
  const value = input as JsonRecord;
  const menu = (value.menu as JsonRecord[]).map((item, index) => ({
    entryId: item.entryId as string,
    label: item.label as string,
    labelKey: item.labelKey as string,
    ...(item.icon === undefined ? {} : { icon: item.icon as string }),
    launch: parseLaunch(item.launch as JsonRecord, `${pathLabel}.menu[${index}].launch`),
  }));
  return {
    schemaVersion: 1,
    id: value.id as string,
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
    module: typeof value.module === "string" ? value.module : null,
    dependencies: Array.isArray(value.dependencies) ? [...(value.dependencies as string[])] : [],
    viewDirs: [...(value.viewDirs as string[])],
    views: [...(value.views as string[])],
    owners: (value.owners as JsonRecord[]).map((owner) => ({
      id: owner.id as string,
      logicDir: owner.logicDir as string,
    })),
    routes: (value.routes as JsonRecord[]).map((route) => ({
      id: route.id as string,
      view: route.view as string,
    })),
    menu,
  };
}
