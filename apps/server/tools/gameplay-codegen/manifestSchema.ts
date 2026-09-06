/**
 * gameplay manifest 的真实 JSON Schema 校验（§5.4/§5.5：additionalProperties:false）。
 *
 * 单源是同目录的 `gameplay-schema-v1.json`（按 §3.1 必须带 gameplay- 前缀，与
 * `apps/server/tools/plugin/plugin-schema-v2.json` 区分）。这里的解释器只实现该 schema 用到的
 * draft-07 关键字子集，并在加载期对未知关键字 fail-fast——schema 文件演进出解释器
 * 认不得的关键字时先炸加载，⛔ 不允许静默跳过一条约束。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "gameplay-schema-v1.json");

type JsonRecord = Record<string, unknown>;

export type GameplayManifest = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly constantName: string;
  readonly modeVersion: number;
  readonly maxPlayers: number;
  readonly profiles: readonly string[];
  /**
   * 该玩法 id 是否进对外 wire 枚举 `GameplayModeId`（缺省 true）。
   * 验收 fixture 玩法（dropInFixture/privateFixture）显式 false：它们走完整 catalog 链，
   * 但 ⛔ 不进对外 mode id 枚举，也不装配客户端 module——这是既有的刻意取舍，本键把它
   * 从「散在中央文件里的手写事实」搬回玩法自己的 manifest。
   */
  readonly wireExposed: boolean;
};

function fail(pathLabel: string, message: string): never {
  throw new Error(`[gameplay-codegen] ${pathLabel}: ${message}`);
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

let cachedSchema: JsonRecord | null = null;

export function loadGameplayManifestSchema(): JsonRecord {
  if (cachedSchema) return cachedSchema;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail("gameplay-schema-v1.json", `cannot read valid JSON: ${detail}`);
  }
  assertSupportedSchema(parsed, "gameplay-schema-v1.json");
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
  if (type === "boolean") {
    if (typeof value !== "boolean") fail(pathLabel, "must be a boolean");
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
    if (isRecord(schema.items)) {
      value.forEach((item, index) => validateNode(schema.items as JsonRecord, item, `${pathLabel}[${index}]`));
    }
    return;
  }
  fail(pathLabel, `schema declares unsupported type: ${String(type)}`);
}

/** 校验并归一化一份 manifest；`profiles` 缺省视为空数组（阶段 8 才消费）。 */
export function parseGameplayManifest(input: unknown, pathLabel = "manifest"): GameplayManifest {
  const schema = loadGameplayManifestSchema();
  validateNode(schema, input, pathLabel);
  const value = input as JsonRecord;
  return {
    schemaVersion: 1,
    id: value.id as string,
    constantName: value.constantName as string,
    modeVersion: value.modeVersion as number,
    maxPlayers: value.maxPlayers as number,
    profiles: Array.isArray(value.profiles) ? [...(value.profiles as string[])] : [],
    wireExposed: value.wireExposed !== false,
  };
}
