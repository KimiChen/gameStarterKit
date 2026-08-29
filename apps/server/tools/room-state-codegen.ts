import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TOOL_REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_SCHEMA_RELATIVE_PATH = "apps/shared/schema/game-room-state.json";
const DEFAULT_SHARED_OUTPUT_RELATIVE_PATH = "apps/shared/src/protocol/state.ts";
const DEFAULT_SERVER_OUTPUT_RELATIVE_PATH = "apps/server/src/rooms/schema/GameRoomState.ts";
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_]*$/u;

type JsonRecord = Record<string, unknown>;
type NumericBound = number | "MIN_SAFE_INTEGER" | "MAX_SAFE_INTEGER";
type ScalarDefault = string | number | boolean | { readonly constant: string };

type StringField = {
  readonly name: string;
  readonly kind: "string";
  readonly default: ScalarDefault;
  readonly minLength: number;
  readonly maxLength: number;
  readonly description?: string;
};

type NumberField = {
  readonly name: string;
  readonly kind: "number" | "integer";
  readonly default: ScalarDefault;
  readonly min?: NumericBound;
  readonly max?: NumericBound;
  readonly maxField?: string;
  readonly description?: string;
};

type BooleanField = {
  readonly name: string;
  readonly kind: "boolean";
  readonly default: ScalarDefault;
  readonly description?: string;
};

type EnumField = {
  readonly name: string;
  readonly kind: "enum";
  readonly enumObject: string;
  readonly enumType: string;
  readonly members: readonly string[];
  readonly default: string;
  readonly errorCode: string;
  readonly description?: string;
};

type MapField = {
  readonly name: string;
  readonly kind: "map";
  readonly valueType: string;
  readonly maxSizeConstant: string;
  readonly errorCode: string;
  readonly key: {
    readonly field: string;
    readonly errorCode: string;
  };
  readonly description?: string;
};

export type WireField = StringField | NumberField | BooleanField | EnumField | MapField;

export type ServerOnlyField = {
  readonly name: string;
  readonly kind: "number" | "numberRecord";
  readonly default: number | "empty";
  readonly description?: string;
};

export type StateTypeDescriptor = {
  readonly name: string;
  readonly sharedName: string;
  readonly validatorName: string;
  readonly defaultPath: string;
  readonly fields: readonly WireField[];
  readonly serverOnly: readonly ServerOnlyField[];
};

export type RoomStateDescriptor = {
  readonly formatVersion: 1;
  readonly root: string;
  readonly types: readonly StateTypeDescriptor[];
};

export type RoomStateCodegenOptions = {
  readonly repositoryRoot?: string;
  readonly schemaFile?: string;
  readonly sharedOutputFile?: string;
  readonly serverOutputFile?: string;
};

export type RoomStateArtifacts = {
  readonly shared: string;
  readonly server: string;
};

function fail(pathLabel: string, message: string): never {
  throw new Error(`[room-state-codegen] ${pathLabel}: ${message}`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, pathLabel: string): JsonRecord {
  if (!isRecord(value)) fail(pathLabel, "must be an object");
  return value;
}

function exactKeys(
  value: JsonRecord,
  required: readonly string[],
  optional: readonly string[],
  pathLabel: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unknown.length > 0) fail(pathLabel, `unknown key(s): ${unknown.join(", ")}`);
  if (missing.length > 0) fail(pathLabel, `missing key(s): ${missing.join(", ")}`);
}

function stringValue(value: unknown, pathLabel: string): string {
  if (typeof value !== "string" || value.length === 0) fail(pathLabel, "must be a non-empty string");
  return value;
}

function identifier(value: unknown, pathLabel: string): string {
  const result = stringValue(value, pathLabel);
  if (!IDENTIFIER.test(result)) fail(pathLabel, `invalid TypeScript identifier: ${result}`);
  return result;
}

function errorCode(value: unknown, pathLabel: string): string {
  const result = stringValue(value, pathLabel);
  if (!ERROR_CODE.test(result)) fail(pathLabel, `invalid error code: ${result}`);
  return result;
}

function integerValue(value: unknown, pathLabel: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    fail(pathLabel, `must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function description(value: unknown, pathLabel: string): string | undefined {
  if (value === undefined) return undefined;
  const result = stringValue(value, pathLabel);
  if (result.includes("\n") || result.includes("\r") || result.includes("*/")) {
    fail(pathLabel, "must be a single safe comment line");
  }
  return result;
}

function scalarDefault(value: unknown, kind: "string" | "number" | "integer" | "boolean", pathLabel: string): ScalarDefault {
  if (isRecord(value)) {
    exactKeys(value, ["constant"], [], pathLabel);
    return { constant: identifier(value.constant, `${pathLabel}.constant`) };
  }
  const expected = kind === "integer" ? "number" : kind;
  if (typeof value !== expected) fail(pathLabel, `must be a ${expected} literal or constant reference`);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(pathLabel, "number default must be finite");
    if (kind === "integer" && !Number.isSafeInteger(value)) fail(pathLabel, "integer default must be a safe integer");
  }
  return value as string | number | boolean;
}

function numericBound(value: unknown, pathLabel: string): NumericBound {
  if (value === "MIN_SAFE_INTEGER" || value === "MAX_SAFE_INTEGER") return value;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail(pathLabel, "must be a safe integer or MIN_SAFE_INTEGER/MAX_SAFE_INTEGER");
  }
  return value;
}

function numericBoundValue(value: NumericBound): number {
  if (value === "MIN_SAFE_INTEGER") return Number.MIN_SAFE_INTEGER;
  if (value === "MAX_SAFE_INTEGER") return Number.MAX_SAFE_INTEGER;
  return value;
}

function parseWireField(input: unknown, pathLabel: string): WireField {
  const value = record(input, pathLabel);
  const name = identifier(value.name, `${pathLabel}.name`);
  const kind = stringValue(value.kind, `${pathLabel}.kind`);
  const fieldDescription = description(value.description, `${pathLabel}.description`);
  const withDescription = fieldDescription === undefined ? {} : { description: fieldDescription };

  if (kind === "string") {
    exactKeys(value, ["name", "kind", "default", "minLength", "maxLength"], ["description"], pathLabel);
    const minLength = integerValue(value.minLength, `${pathLabel}.minLength`);
    const maxLength = integerValue(value.maxLength, `${pathLabel}.maxLength`);
    if (minLength > maxLength) fail(pathLabel, "minLength must not exceed maxLength");
    const fieldDefault = scalarDefault(value.default, "string", `${pathLabel}.default`);
    if (typeof fieldDefault === "string"
      && (fieldDefault.length < minLength || fieldDefault.length > maxLength)
      && fieldDefault !== "") {
      fail(`${pathLabel}.default`, "literal is outside the declared length bounds");
    }
    return { name, kind, default: fieldDefault, minLength, maxLength, ...withDescription };
  }

  if (kind === "number" || kind === "integer") {
    exactKeys(value, ["name", "kind", "default"], ["min", "max", "maxField", "description"], pathLabel);
    const min = value.min === undefined ? undefined : numericBound(value.min, `${pathLabel}.min`);
    const max = value.max === undefined ? undefined : numericBound(value.max, `${pathLabel}.max`);
    const maxField = value.maxField === undefined ? undefined : identifier(value.maxField, `${pathLabel}.maxField`);
    if (max !== undefined && maxField !== undefined) fail(pathLabel, "max and maxField are mutually exclusive");
    if (min !== undefined && max !== undefined && numericBoundValue(min) > numericBoundValue(max)) {
      fail(pathLabel, "min must not exceed max");
    }
    const fieldDefault = scalarDefault(value.default, kind, `${pathLabel}.default`);
    if (typeof fieldDefault === "number") {
      if (min !== undefined && fieldDefault < numericBoundValue(min)) fail(`${pathLabel}.default`, "is below min");
      if (max !== undefined && fieldDefault > numericBoundValue(max)) fail(`${pathLabel}.default`, "is above max");
    }
    return {
      name,
      kind,
      default: fieldDefault,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      ...(maxField === undefined ? {} : { maxField }),
      ...withDescription,
    };
  }

  if (kind === "boolean") {
    exactKeys(value, ["name", "kind", "default"], ["description"], pathLabel);
    return {
      name,
      kind,
      default: scalarDefault(value.default, "boolean", `${pathLabel}.default`),
      ...withDescription,
    };
  }

  if (kind === "enum") {
    exactKeys(
      value,
      ["name", "kind", "enumObject", "enumType", "members", "default", "errorCode"],
      ["description"],
      pathLabel,
    );
    if (!Array.isArray(value.members) || value.members.length === 0) fail(`${pathLabel}.members`, "must be a non-empty array");
    const members = value.members.map((member, index) => identifier(member, `${pathLabel}.members[${index}]`));
    if (new Set(members).size !== members.length) fail(`${pathLabel}.members`, "contains duplicate enum members");
    const defaultMember = identifier(value.default, `${pathLabel}.default`);
    if (!members.includes(defaultMember)) fail(`${pathLabel}.default`, "must name a declared enum member");
    return {
      name,
      kind,
      enumObject: identifier(value.enumObject, `${pathLabel}.enumObject`),
      enumType: identifier(value.enumType, `${pathLabel}.enumType`),
      members,
      default: defaultMember,
      errorCode: errorCode(value.errorCode, `${pathLabel}.errorCode`),
      ...withDescription,
    };
  }

  if (kind === "map") {
    exactKeys(
      value,
      ["name", "kind", "valueType", "maxSizeConstant", "errorCode", "key"],
      ["description"],
      pathLabel,
    );
    const key = record(value.key, `${pathLabel}.key`);
    exactKeys(key, ["field", "errorCode"], [], `${pathLabel}.key`);
    return {
      name,
      kind,
      valueType: identifier(value.valueType, `${pathLabel}.valueType`),
      maxSizeConstant: identifier(value.maxSizeConstant, `${pathLabel}.maxSizeConstant`),
      errorCode: errorCode(value.errorCode, `${pathLabel}.errorCode`),
      key: {
        field: identifier(key.field, `${pathLabel}.key.field`),
        errorCode: errorCode(key.errorCode, `${pathLabel}.key.errorCode`),
      },
      ...withDescription,
    };
  }

  fail(`${pathLabel}.kind`, `unsupported wire kind: ${kind}`);
}

function parseServerOnlyField(input: unknown, pathLabel: string): ServerOnlyField {
  const value = record(input, pathLabel);
  exactKeys(value, ["name", "kind", "default"], ["description"], pathLabel);
  const name = identifier(value.name, `${pathLabel}.name`);
  const kind = stringValue(value.kind, `${pathLabel}.kind`);
  const fieldDescription = description(value.description, `${pathLabel}.description`);
  const withDescription = fieldDescription === undefined ? {} : { description: fieldDescription };
  if (kind === "number") {
    if (typeof value.default !== "number" || !Number.isFinite(value.default)) {
      fail(`${pathLabel}.default`, "number server-only default must be finite");
    }
    return { name, kind, default: value.default, ...withDescription };
  }
  if (kind === "numberRecord") {
    if (value.default !== "empty") fail(`${pathLabel}.default`, "numberRecord default must be empty");
    return { name, kind, default: "empty", ...withDescription };
  }
  fail(`${pathLabel}.kind`, `unsupported server-only kind: ${kind}`);
}

function parseStateType(input: unknown, pathLabel: string): StateTypeDescriptor {
  const value = record(input, pathLabel);
  exactKeys(
    value,
    ["name", "sharedName", "validatorName", "defaultPath", "fields", "serverOnly"],
    [],
    pathLabel,
  );
  if (!Array.isArray(value.fields) || value.fields.length === 0) fail(`${pathLabel}.fields`, "must be a non-empty array");
  if (!Array.isArray(value.serverOnly)) fail(`${pathLabel}.serverOnly`, "must be an array");
  const fields = value.fields.map((field, index) => parseWireField(field, `${pathLabel}.fields[${index}]`));
  const serverOnly = value.serverOnly.map((field, index) =>
    parseServerOnlyField(field, `${pathLabel}.serverOnly[${index}]`));
  const wireNames = new Set<string>();
  for (const field of fields) {
    if (wireNames.has(field.name)) fail(`${pathLabel}.fields`, `duplicate wire field: ${field.name}`);
    wireNames.add(field.name);
  }
  const internalNames = new Set<string>();
  for (const field of serverOnly) {
    if (wireNames.has(field.name)) fail(`${pathLabel}.serverOnly`, `field collides with wire field: ${field.name}`);
    if (internalNames.has(field.name)) fail(`${pathLabel}.serverOnly`, `duplicate server-only field: ${field.name}`);
    internalNames.add(field.name);
  }
  return {
    name: identifier(value.name, `${pathLabel}.name`),
    sharedName: identifier(value.sharedName, `${pathLabel}.sharedName`),
    validatorName: identifier(value.validatorName, `${pathLabel}.validatorName`),
    defaultPath: stringValue(value.defaultPath, `${pathLabel}.defaultPath`),
    fields,
    serverOnly,
  };
}

function validationFieldOrder(type: StateTypeDescriptor): readonly WireField[] {
  const fields = new Map(type.fields.map((field) => [field.name, field]));
  const ordered: WireField[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (field: WireField): void => {
    if (visited.has(field.name)) return;
    if (visiting.has(field.name)) fail(type.name, `cyclic maxField dependency at ${field.name}`);
    visiting.add(field.name);
    if ((field.kind === "number" || field.kind === "integer") && field.maxField !== undefined) {
      const dependency = fields.get(field.maxField);
      if (!dependency) fail(`${type.name}.${field.name}.maxField`, `missing field: ${field.maxField}`);
      if (dependency.kind !== "number" && dependency.kind !== "integer") {
        fail(`${type.name}.${field.name}.maxField`, `must reference a number/integer field: ${field.maxField}`);
      }
      visit(dependency);
    }
    visiting.delete(field.name);
    visited.add(field.name);
    ordered.push(field);
  };
  for (const field of type.fields) visit(field);
  return ordered;
}

function topologicalTypes(descriptor: RoomStateDescriptor): readonly StateTypeDescriptor[] {
  const byName = new Map(descriptor.types.map((type) => [type.name, type]));
  const ordered: StateTypeDescriptor[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (type: StateTypeDescriptor): void => {
    if (visited.has(type.name)) return;
    if (visiting.has(type.name)) fail(type.name, "cyclic map type dependency");
    visiting.add(type.name);
    for (const field of type.fields) {
      if (field.kind !== "map") continue;
      const dependency = byName.get(field.valueType);
      if (!dependency) fail(`${type.name}.${field.name}.valueType`, `missing type: ${field.valueType}`);
      visit(dependency);
    }
    visiting.delete(type.name);
    visited.add(type.name);
    ordered.push(type);
  };
  for (const type of descriptor.types) visit(type);
  return ordered;
}

function validateReferences(descriptor: RoomStateDescriptor): void {
  const byName = new Map(descriptor.types.map((type) => [type.name, type]));
  for (const type of descriptor.types) {
    validationFieldOrder(type);
    for (const field of type.fields) {
      if (field.kind !== "map") continue;
      const target = byName.get(field.valueType);
      if (!target) fail(`${type.name}.${field.name}.valueType`, `missing type: ${field.valueType}`);
      const keyField = target.fields.find((candidate) => candidate.name === field.key.field);
      if (!keyField) fail(`${type.name}.${field.name}.key.field`, `missing field on ${target.name}: ${field.key.field}`);
      if (keyField.kind !== "string") {
        fail(`${type.name}.${field.name}.key.field`, `must reference a string field on ${target.name}`);
      }
    }
  }
  topologicalTypes(descriptor);
}

export function parseRoomStateDescriptor(input: unknown): RoomStateDescriptor {
  const value = record(input, "manifest");
  exactKeys(value, ["formatVersion", "root", "types"], [], "manifest");
  if (value.formatVersion !== 1) fail("manifest.formatVersion", "only formatVersion 1 is supported");
  if (!Array.isArray(value.types) || value.types.length === 0) fail("manifest.types", "must be a non-empty array");
  const types = value.types.map((type, index) => parseStateType(type, `manifest.types[${index}]`));
  const names = new Set<string>();
  const sharedNames = new Set<string>();
  const validators = new Set<string>();
  const paths = new Set<string>();
  for (const type of types) {
    if (names.has(type.name)) fail("manifest.types", `duplicate type name: ${type.name}`);
    if (sharedNames.has(type.sharedName)) fail("manifest.types", `duplicate sharedName: ${type.sharedName}`);
    if (validators.has(type.validatorName)) fail("manifest.types", `duplicate validatorName: ${type.validatorName}`);
    if (paths.has(type.defaultPath)) fail("manifest.types", `duplicate defaultPath: ${type.defaultPath}`);
    names.add(type.name);
    sharedNames.add(type.sharedName);
    validators.add(type.validatorName);
    paths.add(type.defaultPath);
  }
  const root = identifier(value.root, "manifest.root");
  if (!names.has(root)) fail("manifest.root", `missing root type: ${root}`);
  const descriptor: RoomStateDescriptor = { formatVersion: 1, root, types };
  validateReferences(descriptor);
  return descriptor;
}

function posixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function resolvedOptions(options: RoomStateCodegenOptions): {
  readonly repositoryRoot: string;
  readonly schemaFile: string;
  readonly sharedOutputFile: string;
  readonly serverOutputFile: string;
} {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? TOOL_REPOSITORY_ROOT);
  return {
    repositoryRoot,
    schemaFile: path.resolve(options.schemaFile ?? path.join(repositoryRoot, DEFAULT_SCHEMA_RELATIVE_PATH)),
    sharedOutputFile: path.resolve(
      options.sharedOutputFile ?? path.join(repositoryRoot, DEFAULT_SHARED_OUTPUT_RELATIVE_PATH),
    ),
    serverOutputFile: path.resolve(
      options.serverOutputFile ?? path.join(repositoryRoot, DEFAULT_SERVER_OUTPUT_RELATIVE_PATH),
    ),
  };
}

export function readRoomStateDescriptor(options: RoomStateCodegenOptions = {}): RoomStateDescriptor {
  const resolved = resolvedOptions(options);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved.schemaFile, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(posixPath(path.relative(resolved.repositoryRoot, resolved.schemaFile)), `cannot read valid JSON: ${detail}`);
  }
  return parseRoomStateDescriptor(parsed);
}

function renderDoc(descriptionValue: string | undefined, indent = ""): string[] {
  return descriptionValue === undefined ? [] : [`${indent}/** ${descriptionValue} */`];
}

function renderBound(bound: NumericBound): string {
  if (bound === "MIN_SAFE_INTEGER") return "-Number.MAX_SAFE_INTEGER";
  if (bound === "MAX_SAFE_INTEGER") return "Number.MAX_SAFE_INTEGER";
  return String(bound);
}

function renderScalarDefault(value: ScalarDefault): string {
  if (isRecord(value)) return value.constant as string;
  return JSON.stringify(value);
}

function sharedFieldType(field: WireField, byName: ReadonlyMap<string, StateTypeDescriptor>): string {
  if (field.kind === "string") return "string";
  if (field.kind === "number" || field.kind === "integer") return "number";
  if (field.kind === "boolean") return "boolean";
  if (field.kind === "enum") return field.enumType;
  if (field.kind !== "map") fail(field.name, `unsupported field kind while rendering: ${field.kind}`);
  const target = byName.get(field.valueType);
  if (!target) fail(field.name, `missing map type while rendering: ${field.valueType}`);
  return `Map<string, ${target.sharedName}>`;
}

function pascalCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderEntriesHelper(field: MapField): string[] {
  const functionName = `entriesOf${pascalCase(field.name)}`;
  return [
    `function ${functionName}(input: unknown, path: string): Array<[string, unknown]> {`,
    "    if (input instanceof Map) {",
    "        const entries: Array<[string, unknown]> = [];",
    "        for (const [key, value] of input.entries()) {",
    `            if (entries.length >= ${field.maxSizeConstant}) throw new WireValidationError(${JSON.stringify(field.errorCode)}, path);`,
    "            entries.push([key, value]);",
    "        }",
    "        return entries;",
    "    }",
    "    if (typeof input === \"object\" && input !== null) {",
    "        const entriesMethod = (input as { entries?: unknown }).entries;",
    "        if (typeof entriesMethod === \"function\") {",
    "            try {",
    "                const iterable = (entriesMethod as () => Iterable<unknown>).call(input);",
    "                const iterator = iterable[Symbol.iterator]();",
    "                const entries: Array<[string, unknown]> = [];",
    "                for (;;) {",
    "                    const step = iterator.next();",
    "                    if (step.done) break;",
    "                    const pair = step.value;",
    "                    if (!Array.isArray(pair) || pair.length !== 2) {",
    `                        throw new WireValidationError(${JSON.stringify(field.errorCode)}, path);`,
    "                    }",
    `                    if (entries.length >= ${field.maxSizeConstant}) throw new WireValidationError(${JSON.stringify(field.errorCode)}, path);`,
    "                    entries.push([pair[0] as string, pair[1]]);",
    "                }",
    "                return entries;",
    "            } catch (error) {",
    "                if (error instanceof WireValidationError) throw error;",
    `                throw new WireValidationError(${JSON.stringify(field.errorCode)}, path);`,
    "            }",
    "        }",
    "    }",
    "    if (isPlainRecord(input)) {",
    "        const keys = Object.keys(input);",
    `        if (keys.length > ${field.maxSizeConstant}) throw new WireValidationError(${JSON.stringify(field.errorCode)}, path);`,
    "        return keys.map((key) => [key, input[key]]);",
    "    }",
    `    throw new WireValidationError(${JSON.stringify(field.errorCode)}, path);`,
    "}",
  ];
}

function renderNumberValidation(field: NumberField): string {
  const validator = field.kind === "integer" ? "finiteInteger" : "finiteNumber";
  const args = [`value.${field.name}`, `path + ${JSON.stringify(`.${field.name}`)}`];
  if (field.min !== undefined || field.max !== undefined || field.maxField !== undefined) {
    args.push(field.min === undefined
      ? (field.kind === "integer" ? "Number.MIN_SAFE_INTEGER" : "-Infinity")
      : renderBound(field.min));
  }
  if (field.max !== undefined || field.maxField !== undefined) {
    args.push(field.maxField ?? renderBound(field.max as NumericBound));
  }
  return `        const ${field.name} = ${validator}(${args.join(", ")});`;
}

function renderValidator(
  type: StateTypeDescriptor,
  descriptor: RoomStateDescriptor,
  byName: ReadonlyMap<string, StateTypeDescriptor>,
): string[] {
  const root = type.name === descriptor.root;
  const signature = root
    ? `export function ${type.validatorName}(input: unknown): ${type.sharedName} {`
    : `export function ${type.validatorName}(input: unknown, path = ${JSON.stringify(type.defaultPath)}): ${type.sharedName} {`;
  const lines = [signature];
  if (root) lines.push(`    const path = ${JSON.stringify(type.defaultPath)};`);
  lines.push(
    "    return guardWire(path, () => {",
    "        const value = stateRecord(input, path);",
    `        assertExactKeys(value, ${JSON.stringify(type.fields.map((field) => field.name))}, [], path);`,
  );

  for (const field of validationFieldOrder(type)) {
    if (field.kind === "string") {
      lines.push(
        `        const ${field.name} = boundedString(value.${field.name}, path + ${JSON.stringify(`.${field.name}`)}, ${field.minLength}, ${field.maxLength});`,
      );
    } else if (field.kind === "number" || field.kind === "integer") {
      lines.push(renderNumberValidation(field));
    } else if (field.kind === "boolean") {
      lines.push(
        `        if (typeof value.${field.name} !== "boolean") throw new WireValidationError("STATE_BOOLEAN", path + ${JSON.stringify(`.${field.name}`)});`,
        `        const ${field.name} = value.${field.name} as boolean;`,
      );
    } else if (field.kind === "enum") {
      lines.push(`        const ${field.name} = value.${field.name};`);
      const conditions = field.members.map((member) => `${field.name} !== ${field.enumObject}.${member}`).join(" && ");
      lines.push(
        `        if (${conditions}) {`,
        `            throw new WireValidationError(${JSON.stringify(field.errorCode)}, path + ${JSON.stringify(`.${field.name}`)});`,
        "        }",
      );
    } else if (field.kind === "map") {
      const target = byName.get(field.valueType);
      if (!target) fail(`${type.name}.${field.name}`, `missing map target ${field.valueType}`);
      const keyField = target.fields.find((candidate): candidate is StringField =>
        candidate.name === field.key.field && candidate.kind === "string");
      if (!keyField) fail(`${type.name}.${field.name}`, `invalid map key field ${field.key.field}`);
      const entriesName = `entriesOf${pascalCase(field.name)}`;
      lines.push(
        `        const entries = ${entriesName}(value.${field.name}, path + ${JSON.stringify(`.${field.name}`)});`,
        `        if (entries.length > ${field.maxSizeConstant}) throw new WireValidationError(${JSON.stringify(field.errorCode)}, path + ${JSON.stringify(`.${field.name}`)});`,
        `        const ${field.name} = new Map<string, ${target.sharedName}>();`,
        "        for (const [entryKey, entryValue] of entries) {",
        `            if (typeof entryKey !== "string" || entryKey.length < ${keyField.minLength} || entryKey.length > ${keyField.maxLength} || ${field.name}.has(entryKey)) {`,
        `                throw new WireValidationError(${JSON.stringify(field.key.errorCode)}, path + ${JSON.stringify(`.${field.name}`)});`,
        "            }",
        `            const parsed = ${target.validatorName}(entryValue, path + ${JSON.stringify(`.${field.name}.`)} + entryKey);`,
        `            if (parsed.${field.key.field} !== entryKey) {`,
        `                throw new WireValidationError(${JSON.stringify(field.key.errorCode)}, path + ${JSON.stringify(`.${field.name}.`)} + entryKey + ${JSON.stringify(`.${field.key.field}`)});`,
        "            }",
        `            ${field.name}.set(entryKey, parsed);`,
        "        }",
      );
    }
  }
  lines.push("        return {");
  for (const field of type.fields) lines.push(`            ${field.name},`);
  lines.push("        };", "    });", "}");
  return lines;
}

function renderShared(descriptor: RoomStateDescriptor, sourceLabel: string): string {
  const types = topologicalTypes(descriptor);
  const byName = new Map(types.map((type) => [type.name, type]));
  const sharedValues = new Set<string>();
  const sharedTypes = new Set<string>();
  for (const type of types) {
    for (const field of type.fields) {
      if (field.kind === "enum") {
        sharedValues.add(field.enumObject);
        sharedTypes.add(field.enumType);
      } else if (field.kind === "map") {
        sharedValues.add(field.maxSizeConstant);
      }
    }
  }
  const importNames = [
    ...[...sharedValues].sort(),
    ...[...sharedTypes].sort().map((name) => `type ${name}`),
  ];
  const lines = [
    `/** AUTO-GENERATED by apps/server/tools/room-state-codegen.ts from ${sourceLabel}. Do not edit. */`,
    `import { ${importNames.join(", ")} } from "../constants/game";`,
    "import { assertExactKeys, boundedString, finiteInteger, finiteNumber, guardWire, isPlainRecord, type PlainRecord, WireValidationError } from \"./http\";",
    "",
    "/** Dependency-free mirrors of the Colyseus wire state. */",
  ];
  for (const type of types) {
    lines.push(`export interface ${type.sharedName} {`);
    for (const field of type.fields) {
      lines.push(...renderDoc(field.description, "    "));
      lines.push(`    ${field.name}: ${sharedFieldType(field, byName)};`);
    }
    lines.push("}", "");
  }
  lines.push(
    "function stateRecord(input: unknown, path: string): PlainRecord {",
    "    if (isPlainRecord(input)) return input;",
    "    // Accept only a real @colyseus/schema projection without importing that runtime into shared.",
    "    if (typeof input === \"object\" && input !== null) {",
    "        try {",
    "            if (Object.prototype.hasOwnProperty.call(input, \"~changes\")",
    "                && Object.prototype.hasOwnProperty.call(input, \"~refId\")) {",
    "                const serializer = (input as { toJSON?: unknown }).toJSON;",
    "                if (typeof serializer === \"function\") {",
    "                    const projected = serializer.call(input);",
    "                    if (isPlainRecord(projected)) return projected;",
    "                }",
    "            }",
    "        } catch {",
    "            throw new WireValidationError(\"WIRE_DATA_CORRUPT\", path);",
    "        }",
    "    }",
    "    throw new WireValidationError(\"STATE_OBJECT\", path);",
    "}",
    "",
  );
  const mapFields = types.flatMap((type) => type.fields.filter((field): field is MapField => field.kind === "map"));
  for (const field of mapFields) lines.push(...renderEntriesHelper(field), "");
  for (const type of types) lines.push(...renderValidator(type, descriptor, byName), "");
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderServerField(field: WireField): string {
  if (field.kind === "map") return `    @type({ map: ${field.valueType} }) ${field.name} = new MapSchema<${field.valueType}>();`;
  const wireType = field.kind === "boolean" ? "boolean" : field.kind === "string" || field.kind === "enum" ? "string" : "number";
  const typeName = field.kind === "enum" ? field.enumType : field.kind === "boolean" ? "boolean" : field.kind === "string" ? "string" : "number";
  const defaultValue = field.kind === "enum"
    ? `${field.enumObject}.${field.default}`
    : renderScalarDefault(field.default);
  return `    @type(${JSON.stringify(wireType)}) ${field.name}: ${typeName} = ${defaultValue};`;
}

function renderServerOnlyField(field: ServerOnlyField): string {
  if (field.kind === "numberRecord") return `    ${field.name}: Record<number, number> = {};`;
  return `    ${field.name}: number = ${JSON.stringify(field.default)};`;
}

function renderServer(descriptor: RoomStateDescriptor, sourceLabel: string): string {
  const types = topologicalTypes(descriptor);
  const serverValues = new Set<string>();
  const serverTypes = new Set<string>();
  for (const type of types) {
    for (const field of type.fields) {
      if (field.kind === "enum") {
        serverValues.add(field.enumObject);
        serverTypes.add(field.enumType);
      } else if (field.kind !== "map" && isRecord(field.default)) {
        serverValues.add(field.default.constant as string);
      }
    }
  }
  const sharedImports = [
    ...[...serverValues].sort(),
    ...[...serverTypes].sort().map((name) => `type ${name}`),
  ];
  const lines = [
    `/** AUTO-GENERATED by apps/server/tools/room-state-codegen.ts from ${sourceLabel}. Do not edit. */`,
    "import { Schema, type, MapSchema } from \"@colyseus/schema\";",
    `import { ${sharedImports.join(", ")} } from "@game/shared";`,
    "",
  ];
  for (const type of types) {
    lines.push(`export class ${type.name} extends Schema {`);
    for (const field of type.fields) {
      lines.push(...renderDoc(field.description, "    "));
      lines.push(renderServerField(field));
    }
    if (type.serverOnly.length > 0) {
      lines.push("", "    // Server-only fields below are intentionally undecorated and never enter the wire state.");
      for (const field of type.serverOnly) {
        lines.push(...renderDoc(field.description, "    "));
        lines.push(renderServerOnlyField(field));
      }
    }
    lines.push("}", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderRoomStateArtifacts(
  descriptor: RoomStateDescriptor,
  sourceLabel = DEFAULT_SCHEMA_RELATIVE_PATH,
): RoomStateArtifacts {
  validateReferences(descriptor);
  return {
    shared: renderShared(descriptor, sourceLabel),
    server: renderServer(descriptor, sourceLabel),
  };
}

function generatedArtifacts(options: RoomStateCodegenOptions): {
  readonly resolved: ReturnType<typeof resolvedOptions>;
  readonly artifacts: RoomStateArtifacts;
} {
  const resolved = resolvedOptions(options);
  const descriptor = readRoomStateDescriptor(options);
  const sourceLabel = posixPath(path.relative(resolved.repositoryRoot, resolved.schemaFile));
  return { resolved, artifacts: renderRoomStateArtifacts(descriptor, sourceLabel) };
}

export function assertRoomStateArtifactsFresh(options: RoomStateCodegenOptions = {}): void {
  const { resolved, artifacts } = generatedArtifacts(options);
  const outputs = [
    [resolved.sharedOutputFile, artifacts.shared],
    [resolved.serverOutputFile, artifacts.server],
  ] as const;
  const stale = outputs
    .filter(([file, expected]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== expected)
    .map(([file]) => posixPath(path.relative(resolved.repositoryRoot, file)));
  if (stale.length > 0) {
    throw new Error(
      `[room-state-codegen] generated state is missing or stale: ${stale.join(", ")}. `
      + "Run npm --workspace @game/server run codegen:state",
    );
  }
}

export function writeRoomStateArtifacts(options: RoomStateCodegenOptions = {}): readonly string[] {
  const { resolved, artifacts } = generatedArtifacts(options);
  const outputs = [
    [resolved.sharedOutputFile, artifacts.shared],
    [resolved.serverOutputFile, artifacts.server],
  ] as const;
  const changed: string[] = [];
  for (const [file, content] of outputs) {
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    changed.push(posixPath(path.relative(resolved.repositoryRoot, file)));
  }
  return changed;
}

function parseCli(argv: readonly string[]): { readonly check: boolean; readonly repositoryRoot?: string } {
  let check = false;
  let repositoryRoot: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      if (check) throw new Error("duplicate argument: --check");
      check = true;
    } else if (arg === "--root") {
      if (repositoryRoot !== undefined) throw new Error("duplicate argument: --root");
      const value = argv[++index];
      if (!value) throw new Error("--root requires a non-empty directory");
      repositoryRoot = value;
    } else if (arg.startsWith("--root=")) {
      if (repositoryRoot !== undefined) throw new Error("duplicate argument: --root");
      repositoryRoot = arg.slice("--root=".length);
      if (!repositoryRoot) throw new Error("--root requires a non-empty directory");
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { check, ...(repositoryRoot === undefined ? {} : { repositoryRoot }) };
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    const args = parseCli(process.argv.slice(2));
    if (args.check) {
      assertRoomStateArtifactsFresh(args);
      console.log("[room-state-codegen] generated state is fresh");
    } else {
      const changed = writeRoomStateArtifacts(args);
      console.log(`[room-state-codegen] ${changed.length === 0 ? "no changes" : `updated ${changed.join(", ")}`}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
