/**
 * 每玩法 state descriptor 的解析与渲染。
 *
 * ⚠ 本模块由 `tools/room-state-codegen.ts`（已删除）的 parse/render/断言函数**拆迁**而来，
 * ⛔ 不是从零重写：生成产物与旧 `protocol/state.ts` / `schema/GameRoomState.ts` 的语义等价
 * 依赖这份复用。与旧 DSL 的唯一差异：
 *  - 单文件多 root（formatVersion 2 的 roots[]）改为每玩法单 root（schemaVersion 1 的 root）；
 *  - map 字段删除 `maxSizeConstant`：players map 容量改由 manifest.maxPlayers 注入，
 *    生成物内输出模块级字面量常量并带 provenance 注释。
 */
import path from "node:path";

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

/** §4.6 公共 state fragment id。声明后由生成器把字段注入 root/player 类型（⛔ 不手写进 state.json）。 */
export type GameplayStateFragment = "ownerReady" | "inviteRoom";

export const GAMEPLAY_STATE_FRAGMENTS: readonly GameplayStateFragment[] = ["ownerReady", "inviteRoom"];

export type GameplayStateDescriptor = {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly types: readonly StateTypeDescriptor[];
  /** 该玩法声明的公共 fragment（缺省空——ballMove/idle 不声明，生产 state 零变）。 */
  readonly fragments: readonly GameplayStateFragment[];
};

function fail(pathLabel: string, message: string): never {
  throw new Error(`[gameplay-codegen] ${pathLabel}: ${message}`);
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
      ["name", "kind", "valueType", "errorCode", "key"],
      ["description"],
      pathLabel,
    );
    const key = record(value.key, `${pathLabel}.key`);
    exactKeys(key, ["field", "errorCode"], [], `${pathLabel}.key`);
    return {
      name,
      kind,
      valueType: identifier(value.valueType, `${pathLabel}.valueType`),
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

function topologicalTypes(descriptor: GameplayStateDescriptor): readonly StateTypeDescriptor[] {
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

function validateReferences(descriptor: GameplayStateDescriptor): void {
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

/**
 * §4.6 fragment 注入表。字段形状与 `RoomStateOwnerReady`/`RoomStateInviteRoom` 生成视图
 * 一一对应（lib.ts renderServerAggregate）；⛔ 两处不同步改动会让视图 cast 变成谎言。
 */
const OWNER_READY_ROOT_FIELDS: readonly WireField[] = [
  { name: "ownerId", kind: "string", default: "", minLength: 0, maxLength: 64, description: "Owner sessionId; empty until the expected owner seats" },
  { name: "rosterRevision", kind: "integer", default: 0, min: 0, description: "Seat membership revision (join / final leave / owner transfer)" },
  { name: "readyRevision", kind: "integer", default: 0, min: 0, description: "Ready set/clear revision" },
  { name: "connectionRevision", kind: "integer", default: 0, min: 0, description: "Drop/reconnect revision" },
  { name: "starting", kind: "boolean", default: false, description: "Start transaction fence; Ready/Unready are refused while set" },
];
const OWNER_READY_PLAYER_FIELDS: readonly WireField[] = [
  { name: "ready", kind: "boolean", default: false, description: "Waiting-phase ready flag; new seats default to false" },
  { name: "connected", kind: "boolean", default: true, description: "False while the member is inside the reconnect grace window" },
];
const INVITE_ROOM_ROOT_FIELDS: readonly WireField[] = [
  { name: "roomCode", kind: "string", default: "", minLength: 0, maxLength: 6, description: "Best-effort display invite code; the resolve-side lease is the only authority" },
  { name: "waitingDeadlineAt", kind: "integer", default: 0, min: 0, description: "Absolute waiting deadline (ms timestamp, display only)" },
];

function parseFragments(value: unknown): readonly GameplayStateFragment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length === 0) fail("state.fragments", "must be a non-empty array when present");
  const fragments: GameplayStateFragment[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string"
      || !(GAMEPLAY_STATE_FRAGMENTS as readonly string[]).includes(entry)) {
      fail(`state.fragments[${index}]`, `unknown fragment: ${String(entry)} (supported: ${GAMEPLAY_STATE_FRAGMENTS.join(", ")})`);
    }
    if (fragments.includes(entry as GameplayStateFragment)) {
      fail(`state.fragments[${index}]`, `duplicate fragment: ${entry}`);
    }
    fragments.push(entry as GameplayStateFragment);
  }
  return fragments;
}

/** 把声明的 fragment 字段注入 root（与 root 的 players value 类型）。与手写字段重名即 fail。 */
function withInjectedFragments(
  types: readonly StateTypeDescriptor[],
  root: string,
  fragments: readonly GameplayStateFragment[],
): readonly StateTypeDescriptor[] {
  if (fragments.length === 0) return types;
  const rootType = types.find((type) => type.name === root);
  if (!rootType) return types; // 缺 root 由外层校验报错
  const playersField = rootType.fields.find((field) => field.name === "players");
  const playerTypeName = playersField?.kind === "map" ? playersField.valueType : null;

  const rootExtras: WireField[] = [];
  const playerExtras: WireField[] = [];
  if (fragments.includes("ownerReady")) {
    rootExtras.push(...OWNER_READY_ROOT_FIELDS);
    playerExtras.push(...OWNER_READY_PLAYER_FIELDS);
  }
  if (fragments.includes("inviteRoom")) {
    rootExtras.push(...INVITE_ROOM_ROOT_FIELDS);
  }
  if (playerExtras.length > 0 && playerTypeName === null) {
    fail("state.fragments", "ownerReady fragment requires a root \"players\" map field");
  }
  return types.map((type) => {
    const extras = type.name === root ? rootExtras : type.name === playerTypeName ? playerExtras : [];
    if (extras.length === 0) return type;
    for (const extra of extras) {
      if (type.fields.some((field) => field.name === extra.name)
        || type.serverOnly.some((field) => field.name === extra.name)) {
        fail(`state.types.${type.name}`, `fragment-injected field collides with a declared field: ${extra.name}`);
      }
    }
    return { ...type, fields: [...type.fields, ...extras] };
  });
}

export function parseGameplayStateDescriptor(input: unknown): GameplayStateDescriptor {
  const value = record(input, "state");
  exactKeys(value, ["schemaVersion", "root", "types"], ["fragments"], "state");
  if (value.schemaVersion !== 1) fail("state.schemaVersion", "only schemaVersion 1 is supported");
  const root = identifier(value.root, "state.root");
  const fragments = parseFragments(value.fragments);
  if (!Array.isArray(value.types) || value.types.length === 0) fail("state.types", "must be a non-empty array");
  const declaredTypes = value.types.map((type, index) => parseStateType(type, `state.types[${index}]`));
  const names = new Set<string>();
  const sharedNames = new Set<string>();
  const validators = new Set<string>();
  const paths = new Set<string>();
  for (const type of declaredTypes) {
    if (names.has(type.name)) fail("state.types", `duplicate type name: ${type.name}`);
    if (sharedNames.has(type.sharedName)) fail("state.types", `duplicate sharedName: ${type.sharedName}`);
    if (validators.has(type.validatorName)) fail("state.types", `duplicate validatorName: ${type.validatorName}`);
    if (paths.has(type.defaultPath)) fail("state.types", `duplicate defaultPath: ${type.defaultPath}`);
    names.add(type.name);
    sharedNames.add(type.sharedName);
    validators.add(type.validatorName);
    paths.add(type.defaultPath);
  }
  if (!names.has(root)) fail("state.root", `missing root type: ${root}`);
  const types = withInjectedFragments(declaredTypes, root, fragments);
  const descriptor: GameplayStateDescriptor = { schemaVersion: 1, root, types, fragments };
  validateReferences(descriptor);
  assertRootLifecycle(descriptor);
  return descriptor;
}

/**
 * 每个 root 必须声明通用 shell 依赖的那组生命周期字段。
 *
 * GameRoom 是玩法无关的 transport/lifecycle shell：它读写 `tick`/`phase`/`matchId`/`players`，
 * 与玩法自己的字段无关。此前 shell 用 `declare readonly state: GameRoomState` 把这件事写成了
 * 一句谎——真实的 root 由 mode 决定，`IdleRoomState` 只是恰好也有这四个字段。⛔ 新增一个漏掉
 * 其中任一字段的 root，过去只会在运行期读到 undefined；这里把它变成 codegen 期的失败，
 * 并让生成的 `RoomStateLifecycle` 有据可依。
 */
export const ROOT_LIFECYCLE_FIELDS = [
  { name: "tick", kind: "integer" },
  { name: "phase", kind: "enum" },
  { name: "matchId", kind: "string" },
  { name: "players", kind: "map" },
] as const;

/**
 * `phase` 只验到「是个 enum」是不够的——生成的 `RoomStateLifecycle.phase` 写死成
 * `GamePhaseType`，而 shell 无条件写 `GamePhase.Waiting/Playing/Settle` 这三个值。
 *
 * 两种漏网形态（都实测过能通过「是个 enum」这一关）：
 *  - **异枚举**：root 声明 `PuzzlePhase`，默认值落在 `PuzzlePhase.Idle`，于是 GameRoom 里
 *    `state.phase !== GamePhase.Waiting` 恒真 → 每次 onJoin 都被 GameAlreadyStarted 拒绝，
 *    房间永久不可进；而 `declare readonly state` 与 `as GameRoomState` 两处 cast 让 typecheck 抓不到。
 *  - **成员子集**：root 只声明 `[Waiting, Playing]`（「按自己规则永不 Settle」的玩法），
 *    生成的 shared validator 就会拒掉 `settle`——房间一进结算，该 mode 全部客户端的
 *    `validateRoomStateForMode` 抛 STATE_PHASE，整份结算状态无法解码。
 *    ⚠ `settle()` 不是 ballMove 专属：mode 自己在 onMessage 里调 `context.settle()` 就会写入，
 *    IdleGameMode 正是这么做的。
 */
const ROOT_PHASE_ENUM_OBJECT = "GamePhase";
const ROOT_PHASE_ENUM_TYPE = "GamePhaseType";
const ROOT_PHASE_REQUIRED_MEMBERS = ["Waiting", "Playing", "Settle"] as const;

/** shell 只读 player 的这两个字段（chat 广播与证据 roster 都只要它们）。 */
export const PLAYER_LIFECYCLE_FIELDS = [
  { name: "id", kind: "string" },
  { name: "name", kind: "string" },
] as const;

function assertRootLifecycle(descriptor: GameplayStateDescriptor): void {
  const byName = new Map(descriptor.types.map((type) => [type.name, type]));
  const type = byName.get(descriptor.root);
  if (!type) return; // 缺失 root 类型已由上面的 root 校验报过，⛔ 不重复报
  for (const required of ROOT_LIFECYCLE_FIELDS) {
    const field = type.fields.find((candidate) => candidate.name === required.name);
    if (!field) {
      fail(
        `state.types.${type.name}`,
        `root type must declare lifecycle field "${required.name}" (generic GameRoom shell reads it)`,
      );
    }
    if (field.kind !== required.kind) {
      fail(
        `state.types.${type.name}.${required.name}`,
        `lifecycle field must be kind "${required.kind}", got "${field.kind}"`,
      );
    }
    if (required.name === "phase" && field.kind === "enum") {
      if (field.enumObject !== ROOT_PHASE_ENUM_OBJECT || field.enumType !== ROOT_PHASE_ENUM_TYPE) {
        fail(
          `state.types.${type.name}.phase`,
          `root phase must use ${ROOT_PHASE_ENUM_OBJECT}/${ROOT_PHASE_ENUM_TYPE}, `
          + `got ${field.enumObject}/${field.enumType} `
          + "(the generic shell writes GamePhase.* unconditionally)",
        );
      }
      for (const member of ROOT_PHASE_REQUIRED_MEMBERS) {
        if (!field.members.includes(member)) {
          fail(
            `state.types.${type.name}.phase`,
            `root phase must declare member "${member}" — the generic shell writes it `
            + "unconditionally, and the generated wire validator would reject it",
          );
        }
      }
    }
  }
  const players = type.fields.find((field) => field.name === "players");
  if (players?.kind !== "map") return;
  const playerType = byName.get(players.valueType);
  if (!playerType) return;
  for (const required of PLAYER_LIFECYCLE_FIELDS) {
    const field = playerType.fields.find((candidate) => candidate.name === required.name);
    if (!field) {
      fail(
        `state.types.${playerType.name}`,
        `root player type must declare lifecycle field "${required.name}" (generic GameRoom shell reads it)`,
      );
    }
    if (field.kind !== required.kind) {
      fail(
        `state.types.${playerType.name}.${required.name}`,
        `lifecycle field must be kind "${required.kind}", got "${field.kind}"`,
      );
    }
  }
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

/** 生成物内 players map 容量常量的模块局部标识符（provenance 见常量上方注释）。 */
const MAP_CAPACITY_IDENT = "MAX_PLAYERS";

export const GENERATOR_LABEL = "apps/server/tools/gameplay-codegen/cli.ts";

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

function entriesHelperName(owner: StateTypeDescriptor, field: MapField): string {
  return `entriesOf${owner.name}${pascalCase(field.name)}`;
}

function renderEntriesHelper(owner: StateTypeDescriptor, field: MapField): string[] {
  const functionName = entriesHelperName(owner, field);
  return [
    `function ${functionName}(input: unknown, path: string): Array<[string, unknown]> {`,
    "    if (input instanceof Map) {",
    "        const entries: Array<[string, unknown]> = [];",
    "        for (const [key, value] of input.entries()) {",
    `            if (entries.length >= ${MAP_CAPACITY_IDENT}) throw new WireValidationError(${JSON.stringify(field.errorCode)}, path);`,
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
    `                    if (entries.length >= ${MAP_CAPACITY_IDENT}) throw new WireValidationError(${JSON.stringify(field.errorCode)}, path);`,
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
    `        if (keys.length > ${MAP_CAPACITY_IDENT}) throw new WireValidationError(${JSON.stringify(field.errorCode)}, path);`,
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
  descriptor: GameplayStateDescriptor,
  byName: ReadonlyMap<string, StateTypeDescriptor>,
): string[] {
  const root = descriptor.root === type.name;
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
      const entriesName = entriesHelperName(type, field);
      lines.push(
        `        const entries = ${entriesName}(value.${field.name}, path + ${JSON.stringify(`.${field.name}`)});`,
        `        if (entries.length > ${MAP_CAPACITY_IDENT}) throw new WireValidationError(${JSON.stringify(field.errorCode)}, path + ${JSON.stringify(`.${field.name}`)});`,
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

/** 生成物抬头（「禁止手改」+ 来源），两端 renderer 共用。 */
export function generatedHeader(sourceLabel: string): string {
  return `/** AUTO-GENERATED by ${GENERATOR_LABEL} from ${sourceLabel}. Do not edit. */`;
}

function hasFieldKind(types: readonly StateTypeDescriptor[], kind: WireField["kind"]): boolean {
  return types.some((type) => type.fields.some((field) => field.kind === kind));
}

/**
 * shared 每玩法 state 模块（`apps/shared/src/gameplays/generated/state/<id>.ts`）。
 * 私有积木（stateRecord/hasReflectedSchemaMarkers/entriesOf*）随文件重发；
 * 满足 shared 加严选项（exactOptionalPropertyTypes/verbatimModuleSyntax/noUnusedLocals）与 ES2017。
 */
export function renderSharedStateModule(
  gameplayId: string,
  maxPlayers: number,
  descriptor: GameplayStateDescriptor,
  sourceLabel: string,
): string {
  const types = topologicalTypes(descriptor);
  const byName = new Map(types.map((type) => [type.name, type]));
  const rootType = byName.get(descriptor.root);
  if (!rootType) fail(`gameplays.${gameplayId}`, `missing root type while rendering: ${descriptor.root}`);
  const sharedValues = new Set<string>();
  const sharedTypes = new Set<string>();
  for (const type of types) {
    for (const field of type.fields) {
      if (field.kind === "enum") {
        sharedValues.add(field.enumObject);
        sharedTypes.add(field.enumType);
      }
    }
  }
  const lines = [generatedHeader(sourceLabel)];
  if (sharedValues.size > 0 || sharedTypes.size > 0) {
    const importNames = [
      ...[...sharedValues].sort(),
      ...[...sharedTypes].sort().map((name) => `type ${name}`),
    ];
    lines.push(`import { ${importNames.join(", ")} } from "../../../constants/game";`);
  }
  // noUnusedLocals：只导入本 mode 实际用到的积木。
  const httpImports = [
    "assertExactKeys",
    ...(hasFieldKind(types, "string") ? ["boundedString"] : []),
    ...(hasFieldKind(types, "integer") ? ["finiteInteger"] : []),
    ...(hasFieldKind(types, "number") ? ["finiteNumber"] : []),
    "guardWire",
    "isPlainRecord",
    "type PlainRecord",
    "WireValidationError",
  ];
  lines.push(`import { ${httpImports.join(", ")} } from "../../../protocol/http";`, "");
  if (hasFieldKind(types, "map")) {
    lines.push(
      `/** Root players map capacity. Source: apps/shared/schema/gameplays/${gameplayId}/manifest.json (maxPlayers). */`,
      `const ${MAP_CAPACITY_IDENT} = ${maxPlayers};`,
      "",
    );
  }
  lines.push("/** Dependency-free mirrors of the Colyseus wire state. */");
  for (const type of types) {
    lines.push(`export interface ${type.sharedName} {`);
    for (const field of type.fields) {
      lines.push(...renderDoc(field.description, "    "));
      lines.push(`    ${field.name}: ${sharedFieldType(field, byName)};`);
    }
    lines.push("}", "");
  }
  lines.push(
    "function hasReflectedSchemaMarkers(input: object): boolean {",
    "    const changes = Object.getOwnPropertyDescriptor(input, \"~changes\");",
    "    const refId = Object.getOwnPropertyDescriptor(input, \"~refId\");",
    "    // The server Schema runtime exposes ~refId as enumerable while client",
    "    // reflection does not. Both own it and lock ~changes as non-enumerable.",
    "    return changes !== undefined && changes.enumerable === false",
    "        && changes.configurable === false && refId !== undefined;",
    "}",
    "",
    "function stateRecord(input: unknown, path: string): PlainRecord {",
    "    // Reflection-generated client roots may inherit directly from Object. Check",
    "    // the runtime-owned Schema markers before the plain-record path.",
    "    if (typeof input === \"object\" && input !== null) {",
    "        try {",
    "            if (hasReflectedSchemaMarkers(input)) {",
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
    "    if (isPlainRecord(input)) return input;",
    "    throw new WireValidationError(\"STATE_OBJECT\", path);",
    "}",
    "",
  );
  for (const type of types) {
    for (const field of type.fields) {
      if (field.kind === "map") lines.push(...renderEntriesHelper(type, field), "");
    }
  }
  for (const type of types) lines.push(...renderValidator(type, descriptor, byName), "");
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * 服务端每玩法 Schema 模块（`apps/server/src/rooms/schema/generated/<id>.ts`）。
 * @type 装饰器与旧 `GameRoomState.ts` 产物同语义。
 */
export function renderServerSchemaModule(
  gameplayId: string,
  descriptor: GameplayStateDescriptor,
  sourceLabel: string,
): string {
  const types = topologicalTypes(descriptor);
  const byName = new Map(types.map((type) => [type.name, type]));
  if (!byName.has(descriptor.root)) {
    fail(`gameplays.${gameplayId}`, `missing root type while rendering: ${descriptor.root}`);
  }
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
  const schemaImports = ["Schema", "type", ...(hasFieldKind(types, "map") ? ["MapSchema"] : [])];
  const lines = [
    generatedHeader(sourceLabel),
    `import { ${schemaImports.join(", ")} } from "@colyseus/schema";`,
  ];
  if (serverValues.size > 0 || serverTypes.size > 0) {
    const sharedImports = [
      ...[...serverValues].sort(),
      ...[...serverTypes].sort().map((name) => `type ${name}`),
    ];
    lines.push(`import { ${sharedImports.join(", ")} } from "@game/shared";`);
  }
  lines.push("");
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

/** posix 归一化的相对路径（渲染来源标签、报错点名共用）。 */
export function posixPath(value: string): string {
  return value.split(path.sep).join("/");
}
