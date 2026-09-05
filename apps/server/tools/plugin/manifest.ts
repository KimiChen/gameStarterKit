/**
 * plugin.json 的真实 JSON Schema 校验（同目录 `plugin-schema-v1.json` 单源；解释器只实现该 schema
 * 用到的 draft-07 关键字子集并对未知关键字 fail-fast——与 gameplay-codegen/manifestSchema.ts 同口径）。
 *
 * plugin.json 只声明身份/版本/kinds/兼容轴：
 *  - `kinds` 允许同时含 gameplay 与 feature（一个玩法插件天然 = manifest/state/wire + feature.json，
 *    PLUGIN-REVIEW F14 的 kind 二分不成立）；
 *  - `requires.*SchemaVersion` 只钉两个 schemaVersion（feature-schema-v1 / gameplay-schema-v1）——
 *    协议整数范围不是插件的兼容轴（F22）；`requires` 必填且 fail-closed：kinds 含 feature ⇒ featureSchemaVersion 必填，
 *    含 gameplay ⇒ gameplaySchemaVersion 必填；比对基准从两个 schema 文件的 `schemaVersion.const` 读取，⛔ 不是
 *    手抄常量（PLUGIN-REGISTRY §1-9）；
 *  - ⛔ 不放路径映射（仓库布局不能成为第二真源），⛔ 不放 slot/order（位置归宿主，§6）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginIdentity, PluginKind } from "./ownership";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.join(TOOL_DIR, "plugin-schema-v1.json");
/** 两个兼容轴的真源：feature.json 与 gameplay manifest.json 各自 schema 的 `properties.schemaVersion.const`。 */
export const FEATURE_SCHEMA_FILE = path.resolve(TOOL_DIR, "../../../../features/feature-schema-v1.json");
export const GAMEPLAY_SCHEMA_FILE = path.resolve(TOOL_DIR, "../gameplay-codegen/gameplay-schema-v1.json");

function readSchemaVersionConst(file: string): number {
  if (!fs.existsSync(file)) throw new Error(`[plugin] 兼容轴真源缺失：${file}`);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { readonly properties?: { readonly schemaVersion?: { readonly const?: unknown } } };
  const value = parsed.properties?.schemaVersion?.const;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`[plugin] ${file} 的 properties.schemaVersion.const 不是正整数`);
  return value;
}

/** 当前仓库支持的两个 manifest schemaVersion（plugin.json.requires 的比对基准；读自 schema 文件，⛔ 不手抄）。 */
export const CURRENT_FEATURE_SCHEMA_VERSION: number = readSchemaVersionConst(FEATURE_SCHEMA_FILE);
export const CURRENT_GAMEPLAY_SCHEMA_VERSION: number = readSchemaVersionConst(GAMEPLAY_SCHEMA_FILE);

type JsonRecord = Record<string, unknown>;

export interface PluginManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly kinds: readonly PluginKind[];
  readonly constantName: string | null;
  readonly domains: readonly string[];
  readonly fguiPackages: readonly string[];
  readonly requires: {
    readonly featureSchemaVersion: number | null;
    readonly gameplaySchemaVersion: number | null;
  };
  readonly description: string;
}

function fail(pathLabel: string, message: string): never {
  throw new Error(`[plugin] ${pathLabel}: ${message}`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SUPPORTED_KEYWORDS = new Set([
  "$schema", "title", "type", "const", "pattern", "minimum", "maximum",
  "required", "properties", "additionalProperties", "items",
]);

function assertSupportedSchema(schema: unknown, label: string): asserts schema is JsonRecord {
  if (!isRecord(schema)) fail(label, "schema node must be an object");
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) fail(label, `schema uses unsupported keyword "${keyword}"`);
  }
  if (isRecord(schema.properties)) {
    for (const [key, child] of Object.entries(schema.properties)) assertSupportedSchema(child, `${label}.properties.${key}`);
  }
  if (schema.items !== undefined) assertSupportedSchema(schema.items, `${label}.items`);
}

let cachedSchema: JsonRecord | null = null;

export function loadPluginManifestSchema(): JsonRecord {
  if (cachedSchema) return cachedSchema;
  const parsed: unknown = JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf8"));
  assertSupportedSchema(parsed, "plugin-schema-v1.json");
  cachedSchema = parsed;
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
    const missing = required.filter((key) => typeof key === "string" && !Object.prototype.hasOwnProperty.call(value, key));
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
  if (type === "array") {
    if (!Array.isArray(value)) fail(pathLabel, "must be an array");
    if (isRecord(schema.items)) value.forEach((item, index) => validateNode(schema.items as JsonRecord, item, `${pathLabel}[${index}]`));
    return;
  }
  fail(pathLabel, `schema declares unsupported type: ${String(type)}`);
}

/** 校验并归一化 plugin.json；语义规则（kinds 非空唯一、gameplay ⇒ constantName …）在 assertPluginIdentity。 */
export function parsePluginManifest(input: unknown, pathLabel = "plugin.json"): PluginManifest {
  validateNode(loadPluginManifestSchema(), input, pathLabel);
  const value = input as JsonRecord;
  const kinds = [...(value.kinds as PluginKind[])];
  if (kinds.length === 0) fail(pathLabel, "kinds 不能为空");
  const requires = isRecord(value.requires) ? value.requires : {};
  // 兼容轴 fail-closed：相关 kind 的 schemaVersion 必须显式声明（缺省「视为当前版本」= 对任何宿主都通过，等于没有闸）。
  if (kinds.includes("feature") && typeof requires.featureSchemaVersion !== "number") fail(pathLabel, "kinds 含 feature 时 requires.featureSchemaVersion 必填");
  if (kinds.includes("gameplay") && typeof requires.gameplaySchemaVersion !== "number") fail(pathLabel, "kinds 含 gameplay 时 requires.gameplaySchemaVersion 必填");
  return {
    schemaVersion: 1,
    id: value.id as string,
    version: value.version as string,
    kinds,
    constantName: typeof value.constantName === "string" ? value.constantName : null,
    domains: Array.isArray(value.domains) ? [...(value.domains as string[])] : [],
    fguiPackages: Array.isArray(value.fguiPackages) ? [...(value.fguiPackages as string[])] : [],
    requires: {
      featureSchemaVersion: typeof requires.featureSchemaVersion === "number" ? requires.featureSchemaVersion : null,
      gameplaySchemaVersion: typeof requires.gameplaySchemaVersion === "number" ? requires.gameplaySchemaVersion : null,
    },
    description: typeof value.description === "string" ? value.description : "",
  };
}

/**
 * requires 与当前仓库两个 schemaVersion 的兼容比对。parsePluginManifest 已保证相关 kind 的轴非 null；
 * null 只可能来自旧形态的已安装锁（未登记 requires），由 check 单独点名。
 */
export function assertManifestCompatible(manifest: PluginManifest, pathLabel = "plugin.json"): void {
  const { featureSchemaVersion, gameplaySchemaVersion } = manifest.requires;
  if (manifest.kinds.includes("feature") && featureSchemaVersion === null) fail(pathLabel, "kinds 含 feature 但 requires.featureSchemaVersion 未登记");
  if (manifest.kinds.includes("gameplay") && gameplaySchemaVersion === null) fail(pathLabel, "kinds 含 gameplay 但 requires.gameplaySchemaVersion 未登记");
  if (featureSchemaVersion !== null && featureSchemaVersion !== CURRENT_FEATURE_SCHEMA_VERSION) {
    fail(pathLabel, `requires.featureSchemaVersion=${featureSchemaVersion} 与本仓 feature-schema-v${CURRENT_FEATURE_SCHEMA_VERSION} 不兼容`);
  }
  if (gameplaySchemaVersion !== null && gameplaySchemaVersion !== CURRENT_GAMEPLAY_SCHEMA_VERSION) {
    fail(pathLabel, `requires.gameplaySchemaVersion=${gameplaySchemaVersion} 与本仓 gameplay-schema-v${CURRENT_GAMEPLAY_SCHEMA_VERSION} 不兼容`);
  }
}

/** plugin.json → 所有权身份（feature.json 声明的客户端目录由调用方补入 clientDirs）。 */
export function identityOf(manifest: PluginManifest, clientDirs: readonly string[] = []): PluginIdentity {
  return {
    id: manifest.id,
    kinds: manifest.kinds,
    constantName: manifest.constantName,
    domains: manifest.domains,
    fguiPackages: manifest.fguiPackages,
    clientDirs,
  };
}

/** 身份分量（版本以外的一切）：reinstall-from-tree 的身份变化闸与 check 的漂移比对共用（PLUGIN-REGISTRY §1-3）。 */
export function identitySummary(manifest: PluginManifest): Record<string, string> {
  return {
    kinds: manifest.kinds.join(","),
    constantName: manifest.constantName ?? "-",
    domains: manifest.domains.join(",") || "-",
    fguiPackages: manifest.fguiPackages.join(",") || "-",
  };
}

export function identityDifferences(previous: PluginManifest, next: PluginManifest): readonly string[] {
  const before = identitySummary(previous);
  const after = identitySummary(next);
  return Object.keys(before).filter((key) => before[key] !== after[key]).map((key) => `${key}: ${before[key]} → ${after[key]}`);
}

/** semver 三段比较：负 = left 旧，0 = 相等，正 = left 新。 */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] => value.split(".").map((part) => Number(part));
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
