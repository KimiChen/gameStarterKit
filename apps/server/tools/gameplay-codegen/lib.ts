/**
 * codegen:gameplays 的编排层：发现每玩法单源目录、digest/modeVersion 闸、
 * 三端产物渲染、freshness（--check 只读）与原子写盘（--write）。
 *
 * §5.5 通用约束的落点：
 *  - 稳定排序（mode 按 id 排序）⇒ 相同输入字节级相同输出；
 *  - `--check` 只读：stale/missing/extra 三态失败并点名，不创建目录、不改 mtime；
 *  - 先在内存完成全部校验与渲染，再逐文件临时文件原子替换；
 *  - 重复 id（含大小写归一化）、路径越界、符号链接逃逸拒绝；
 *  - 目录名 === manifest.id 且双向所有权：schema/gameplays/ 下有目录必须 manifest+state 齐备，
 *    catalog 里已有而目录消失必须显式 `--allow-delete <id>`；
 *  - 生成文件带「AUTO-GENERATED … Do not edit」抬头与来源。
 *
 * ⚠ 职责偏差（docs/Non-intrusive.md §5.4 已登记）：本生成器住在 @game/server workspace，
 * 却直写 `apps/client/src/gameplay/catalog.generated.ts`——`apps/client` 不是 npm workspace，
 * 客户端产物的 freshness 由 `apps/server/test/gameplay-codegen.test.ts` 的只读断言守门。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseGameplayManifest, type GameplayManifest } from "./manifestSchema";
import {
  generatedHeader,
  parseGameplayStateDescriptor,
  posixPath,
  renderSharedStateModule,
  renderServerSchemaModule,
  type GameplayStateDescriptor,
} from "./stateRenderer";
import {
  parseCoreWireNames,
  parseGameplayWireModule,
  type CoreWireNames,
  type GameplayWireDeclarations,
} from "./wireParser";

const TOOL_REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCHEMA_DIR_RELATIVE = "apps/shared/schema/gameplays";
const SHARED_GAMEPLAYS_DIR_RELATIVE = "apps/shared/src/gameplays";
const SHARED_STATE_DIR_RELATIVE = "apps/shared/src/gameplays/generated/state";
const SHARED_GENERATED_DIR_RELATIVE = "apps/shared/src/gameplays/generated";
const SHARED_CATALOG_RELATIVE = "apps/shared/src/gameplays/catalog.generated.ts";
const SHARED_INDEX_RELATIVE = "apps/shared/src/gameplays/index.ts";
const SHARED_WIRE_CATALOG_RELATIVE = "apps/shared/src/gameplays/generated/wire-catalog.generated.ts";
const CORE_MESSAGES_RELATIVE = "apps/shared/src/protocol/messages.ts";
const SERVER_SCHEMA_DIR_RELATIVE = "apps/server/src/rooms/schema/generated";
const SERVER_AGGREGATE_RELATIVE = "apps/server/src/rooms/schema/GameRoomState.ts";
const CLIENT_CATALOG_RELATIVE = "apps/client/src/gameplay/catalog.generated.ts";

const MODE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const RUN_HINT = "Run npm --workspace @game/server run codegen:gameplays";

export type GameplayCodegenOptions = {
  readonly repositoryRoot?: string;
  readonly allowDelete?: readonly string[];
};

export type GameplayDescriptor = {
  readonly id: string;
  readonly manifest: GameplayManifest;
  readonly state: GameplayStateDescriptor;
  /** 语法读取自 `apps/shared/src/gameplays/<id>/wire.ts`；无 wire.ts 时为空集。 */
  readonly wire: GameplayWireDeclarations;
  /** 该 mode 是否存在手写 wire.ts（决定聚合 barrel 是否 re-export 它）。 */
  readonly hasWireModule: boolean;
  /** sha256(manifest.json + "\0" + state.json + "\0" + wire.ts 字节)，per-mode 契约身份。 */
  readonly contractDigest: string;
  readonly sourceLabel: string;
};

export type GameplayWriteResult = {
  readonly changed: readonly string[];
  readonly deleted: readonly string[];
};

function fail(pathLabel: string, message: string): never {
  throw new Error(`[gameplay-codegen] ${pathLabel}: ${message}`);
}

function resolvedRoot(options: GameplayCodegenOptions): string {
  return path.resolve(options.repositoryRoot ?? TOOL_REPOSITORY_ROOT);
}

function readJsonFile(file: string, label: string): { readonly bytes: Buffer; readonly value: unknown } {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(label, `cannot read file: ${detail}`);
  }
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(label, `cannot read valid JSON: ${detail}`);
  }
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

/** 发现并解析全部玩法单源目录；输出按 id 稳定排序。 */
export function readGameplayDescriptors(options: GameplayCodegenOptions = {}): readonly GameplayDescriptor[] {
  const root = resolvedRoot(options);
  const schemaDir = path.join(root, SCHEMA_DIR_RELATIVE);
  if (!fs.existsSync(schemaDir)) {
    fail(SCHEMA_DIR_RELATIVE, "gameplay schema directory does not exist");
  }
  const entries = fs.readdirSync(schemaDir, { withFileTypes: true })
    .slice()
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  const gameplays: GameplayDescriptor[] = [];
  const normalizedIds = new Map<string, string>();
  for (const entry of entries) {
    const entryLabel = `${SCHEMA_DIR_RELATIVE}/${entry.name}`;
    const entryPath = path.join(schemaDir, entry.name);
    if (fs.lstatSync(entryPath).isSymbolicLink()) fail(entryLabel, "symlink escape is not allowed");
    if (!entry.isDirectory()) fail(entryLabel, "only per-gameplay directories are allowed here");
    if (!MODE_ID.test(entry.name)) fail(entryLabel, `invalid gameplay mode id: ${entry.name}`);
    // 防御性路径闸：id 正则已排除路径分隔符，这里再钉一次解析结果必须留在 schema 根之下。
    const resolvedEntry = path.resolve(schemaDir, entry.name);
    if (resolvedEntry !== path.join(schemaDir, entry.name) || !resolvedEntry.startsWith(schemaDir + path.sep)) {
      fail(entryLabel, "path escapes the gameplay schema root");
    }
    const normalized = entry.name.toLowerCase();
    const clash = normalizedIds.get(normalized);
    if (clash !== undefined) {
      fail(entryLabel, `gameplay id collides with "${clash}" under case normalization`);
    }
    normalizedIds.set(normalized, entry.name);

    const children = fs.readdirSync(entryPath).sort();
    const unexpected = children.filter((name) => name !== "manifest.json" && name !== "state.json");
    if (unexpected.length > 0) fail(entryLabel, `unexpected file(s): ${unexpected.join(", ")}`);
    const manifestFile = path.join(entryPath, "manifest.json");
    const stateFile = path.join(entryPath, "state.json");
    assertRegularFile(manifestFile, `${entryLabel}/manifest.json`);
    assertRegularFile(stateFile, `${entryLabel}/state.json`);

    const manifestRaw = readJsonFile(manifestFile, `${entryLabel}/manifest.json`);
    const stateRaw = readJsonFile(stateFile, `${entryLabel}/state.json`);
    const manifest = parseGameplayManifest(manifestRaw.value, `${entryLabel}/manifest.json`);
    if (manifest.id !== entry.name) {
      fail(`${entryLabel}/manifest.json`, `manifest.id "${manifest.id}" must equal its directory name "${entry.name}"`);
    }
    const state = parseGameplayStateDescriptor(stateRaw.value);

    // wire.ts（手写，可缺省 = 该 mode 无 wire 消息）：语法读取 + 字节并入 digest。
    const wireLabel = `${SHARED_GAMEPLAYS_DIR_RELATIVE}/${entry.name}/wire.ts`;
    const wireFile = path.join(root, SHARED_GAMEPLAYS_DIR_RELATIVE, entry.name, "wire.ts");
    let wireBytes = Buffer.alloc(0);
    let wire: GameplayWireDeclarations = { c2s: [], s2c: [] };
    let hasWireModule = false;
    let wireStat: fs.Stats | null = null;
    try {
      wireStat = fs.lstatSync(wireFile);
    } catch {
      wireStat = null;
    }
    if (wireStat) {
      if (wireStat.isSymbolicLink()) fail(wireLabel, "symlink escape is not allowed");
      if (!wireStat.isFile()) fail(wireLabel, "must be a regular file");
      wireBytes = fs.readFileSync(wireFile);
      wire = parseGameplayWireModule(wireBytes.toString("utf8"), wireLabel);
      hasWireModule = true;
    }

    const contractDigest = crypto.createHash("sha256")
      .update(manifestRaw.bytes)
      .update("\0")
      .update(stateRaw.bytes)
      .update("\0")
      .update(wireBytes)
      .digest("hex");
    gameplays.push({
      id: manifest.id,
      manifest,
      state,
      wire,
      hasWireModule,
      contractDigest,
      sourceLabel: `${SCHEMA_DIR_RELATIVE}/${manifest.id}/{manifest.json,state.json}`,
    });
  }
  if (gameplays.length === 0) fail(SCHEMA_DIR_RELATIVE, "no gameplay directories found");
  assertCrossGameplayUniqueness(gameplays);
  return gameplays;
}

/** mode id、生成类型名与导出符号必须全局唯一——跨 mode 重名符号会在聚合 barrel 里互相顶替。 */
function assertCrossGameplayUniqueness(gameplays: readonly GameplayDescriptor[]): void {
  const owners = new Map<string, string>();
  const claim = (symbol: string, owner: string, label: string): void => {
    const existing = owners.get(symbol);
    if (existing !== undefined && existing !== owner) {
      fail(label, `symbol "${symbol}" already owned by gameplay "${existing}" — cross-gameplay symbols must be unique`);
    }
    owners.set(symbol, owner);
  };
  const constantNames = new Map<string, string>();
  const wireTypes = new Map<string, string>();
  for (const gameplay of gameplays) {
    const label = `${SCHEMA_DIR_RELATIVE}/${gameplay.id}`;
    const constantClash = constantNames.get(gameplay.manifest.constantName);
    if (constantClash !== undefined) {
      fail(label, `constantName "${gameplay.manifest.constantName}" already used by gameplay "${constantClash}"`);
    }
    constantNames.set(gameplay.manifest.constantName, gameplay.id);
    for (const type of gameplay.state.types) {
      claim(type.name, gameplay.id, label);
      claim(type.sharedName, gameplay.id, label);
      claim(type.validatorName, gameplay.id, label);
    }
    // wire 符号进入同一聚合 barrel 命名空间；消息名跨 mode 必须唯一。
    const wireLabel = `${SHARED_GAMEPLAYS_DIR_RELATIVE}/${gameplay.id}/wire.ts`;
    for (const token of [...gameplay.wire.c2s, ...gameplay.wire.s2c]) {
      claim(token.exportName, gameplay.id, wireLabel);
      claim(token.payloadType, gameplay.id, wireLabel);
      const typeClash = wireTypes.get(token.type);
      if (typeClash !== undefined && typeClash !== gameplay.id) {
        fail(wireLabel, `wire message "${token.type}" already owned by gameplay "${typeClash}" — message types must be unique`);
      }
      wireTypes.set(token.type, gameplay.id);
    }
  }
}

/** 玩法 wire 与 core 消息不得重名（消息名与聚合对象键名两个命名空间都要闸）。 */
function assertCoreWireUniqueness(gameplays: readonly GameplayDescriptor[], core: CoreWireNames): void {
  const coreTypes = new Set([...core.c2s, ...core.s2c].map((entry) => entry.type));
  const c2sKeys = new Map<string, string>(core.c2s.map((entry) => [entry.key, "core"]));
  const s2cKeys = new Map<string, string>(core.s2c.map((entry) => [entry.key, "core"]));
  for (const gameplay of gameplays) {
    const label = `${SHARED_GAMEPLAYS_DIR_RELATIVE}/${gameplay.id}/wire.ts`;
    for (const token of gameplay.wire.c2s) {
      if (coreTypes.has(token.type)) {
        fail(label, `wire message "${token.type}" is already a core message — core 名不得被玩法重声明`);
      }
      const clash = c2sKeys.get(token.exportName);
      if (clash !== undefined) {
        fail(label, `wire token "${token.exportName}" collides with ${clash === "core" ? "core" : `gameplay "${clash}"`} in the aggregated C2S keys`);
      }
      c2sKeys.set(token.exportName, gameplay.id);
    }
    for (const token of gameplay.wire.s2c) {
      if (coreTypes.has(token.type)) {
        fail(label, `wire message "${token.type}" is already a core message — core 名不得被玩法重声明`);
      }
      const clash = s2cKeys.get(token.exportName);
      if (clash !== undefined) {
        fail(label, `wire token "${token.exportName}" collides with ${clash === "core" ? "core" : `gameplay "${clash}"`} in the aggregated S2C keys`);
      }
      s2cKeys.set(token.exportName, gameplay.id);
    }
  }
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

// ⚠ 标签会进 `/** … */` 块注释：⛔ 不能写 `*/`（glob 星号 + 斜杠会提前终止注释）。
const AGGREGATE_SOURCE_LABEL = `${SCHEMA_DIR_RELATIVE}/<id>/{manifest.json,state.json}`;

function rootType(gameplay: GameplayDescriptor): { readonly sharedName: string; readonly validatorName: string; readonly name: string } {
  const type = gameplay.state.types.find((candidate) => candidate.name === gameplay.state.root);
  if (!type) fail(`gameplays.${gameplay.id}`, `missing root type while rendering: ${gameplay.state.root}`);
  return type;
}

function renderCatalogEntries(gameplays: readonly GameplayDescriptor[]): string[] {
  const lines: string[] = [];
  for (const gameplay of gameplays) {
    lines.push(
      `    ${JSON.stringify(gameplay.id)}: {`,
      `        id: ${JSON.stringify(gameplay.id)},`,
      `        constantName: ${JSON.stringify(gameplay.manifest.constantName)},`,
      `        modeVersion: ${gameplay.manifest.modeVersion},`,
      `        maxPlayers: ${gameplay.manifest.maxPlayers},`,
      `        profiles: [${gameplay.manifest.profiles.map((profile) => JSON.stringify(profile)).join(", ")}],`,
      `        stateFragments: [${gameplay.state.fragments.map((fragment) => JSON.stringify(fragment)).join(", ")}],`,
      `        contractDigest: ${JSON.stringify(gameplay.contractDigest)},`,
      "    },",
    );
  }
  return lines;
}

function renderSharedCatalog(gameplays: readonly GameplayDescriptor[]): string {
  const lines = [
    generatedHeader(AGGREGATE_SOURCE_LABEL),
    "import { WireValidationError } from \"../protocol/http\";",
  ];
  for (const gameplay of gameplays) {
    const root = rootType(gameplay);
    lines.push(
      `import { ${root.validatorName}, type ${root.sharedName} } from "./generated/state/${gameplay.id}";`,
    );
  }
  lines.push(
    "",
    "/** Wire root interfaces keyed by canonical gameplay mode id. */",
    "export interface RoomStateByMode {",
  );
  for (const gameplay of gameplays) {
    lines.push(`    ${JSON.stringify(gameplay.id)}: ${rootType(gameplay).sharedName};`);
  }
  lines.push(
    "}",
    "",
    "export type RoomStateMode = keyof RoomStateByMode;",
    "export type RoomState = RoomStateByMode[RoomStateMode];",
    "export type RoomStateValidator<M extends RoomStateMode> = (input: unknown) => RoomStateByMode[M];",
    "",
    "export const ROOM_STATE_VALIDATORS = Object.freeze({",
  );
  for (const gameplay of gameplays) {
    lines.push(`    ${JSON.stringify(gameplay.id)}: ${rootType(gameplay).validatorName},`);
  }
  lines.push(
    "} as const satisfies { readonly [M in RoomStateMode]: RoomStateValidator<M> });",
    "",
    "export function validateRoomStateForMode<M extends RoomStateMode>(mode: M, input: unknown): RoomStateByMode[M];",
    "export function validateRoomStateForMode(mode: string, input: unknown): RoomState;",
    "export function validateRoomStateForMode(mode: string, input: unknown): RoomState {",
    "    const validator = (ROOM_STATE_VALIDATORS as Readonly<Partial<Record<string, (value: unknown) => RoomState>>>)[mode];",
    "    if (!validator) throw new WireValidationError(\"STATE_MODE\", \"mode\");",
    "    return validator(input);",
    "}",
    "",
    "/** Per-gameplay catalog. contractDigest = sha256(manifest.json + \"\\0\" + state.json + \"\\0\" + wire.ts). */",
    "export const GAMEPLAY_CATALOG = {",
    ...renderCatalogEntries(gameplays),
    "} as const;",
    "",
    "export type GameplayCatalogId = keyof typeof GAMEPLAY_CATALOG;",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderSharedIndex(gameplays: readonly GameplayDescriptor[]): string {
  const lines = [
    generatedHeader(AGGREGATE_SOURCE_LABEL),
    "// 稳定 façade：外部只 import 本文件或包根 barrel，⛔ 不直接 import generated/ 内部路径。",
    "export * from \"./defineGameplayWire\";",
    "export * from \"./catalog.generated\";",
    "export * from \"./generated/wire-catalog.generated\";",
  ];
  for (const gameplay of gameplays) {
    if (gameplay.hasWireModule) lines.push(`export * from "./${gameplay.id}/wire";`);
    lines.push(`export * from "./generated/state/${gameplay.id}";`);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

// ── wire catalog（§4.5：显式字面量聚合，公共名不变） ─────────────────────────

const WIRE_SOURCE_LABEL =
  `${SHARED_GAMEPLAYS_DIR_RELATIVE}/<id>/wire.ts + ${CORE_MESSAGES_RELATIVE} (core)`;

type WireEntry = { readonly owner: string; readonly key: string; readonly type: string; readonly payloadRef: string };

/** 读取并语法解析 core 消息名表（protocol/messages.ts 的 CORE_C2S/CORE_S2C）。 */
export function readCoreWireNames(options: GameplayCodegenOptions = {}): CoreWireNames {
  const file = path.join(resolvedRoot(options), CORE_MESSAGES_RELATIVE);
  let source: string;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(CORE_MESSAGES_RELATIVE, `cannot read core message module: ${detail}`);
  }
  return parseCoreWireNames(source, CORE_MESSAGES_RELATIVE);
}

function renderWireCatalog(gameplays: readonly GameplayDescriptor[], core: CoreWireNames): string {
  assertCoreWireUniqueness(gameplays, core);

  const c2sEntries: WireEntry[] = core.c2s.map((entry) => ({
    owner: "core",
    key: entry.key,
    type: entry.type,
    payloadRef: `CoreC2SPayloadMap[${JSON.stringify(entry.type)}]`,
  }));
  const s2cEntries: WireEntry[] = core.s2c.map((entry) => ({
    owner: "core",
    key: entry.key,
    type: entry.type,
    payloadRef: `CoreS2CPayloadMap[${JSON.stringify(entry.type)}]`,
  }));
  for (const gameplay of gameplays) {
    for (const token of gameplay.wire.c2s) {
      c2sEntries.push({ owner: gameplay.id, key: token.exportName, type: token.type, payloadRef: token.payloadType });
    }
    for (const token of gameplay.wire.s2c) {
      s2cEntries.push({ owner: gameplay.id, key: token.exportName, type: token.type, payloadRef: token.payloadType });
    }
  }
  const gameplayC2S = gameplays.flatMap((gameplay) =>
    gameplay.wire.c2s.map((token) => ({ id: gameplay.id, token })));
  const hasGameplayC2S = gameplayC2S.length > 0;

  const lines = [generatedHeader(WIRE_SOURCE_LABEL)];
  if (hasGameplayC2S) {
    lines.push("import { GamePhase, type GamePhaseType } from \"../../constants/game\";");
  }
  lines.push(
    "import { guardWire, WireValidationError, type RuntimeValidator } from \"../../protocol/http\";",
    "import {",
    "    CORE_C2S_WIRE,",
    "    CORE_S2C_WIRE,",
    "    type CoreC2SPayloadMap,",
    "    type CoreS2CPayloadMap,",
    "} from \"../../protocol/messages\";",
    "import { defineS2C, type GameplayC2SToken, type GameplayS2CToken } from \"../defineGameplayWire\";",
  );
  for (const gameplay of gameplays) {
    if (!gameplay.hasWireModule) continue;
    const tokens = [...gameplay.wire.c2s, ...gameplay.wire.s2c];
    if (tokens.length === 0) continue;
    const valueNames = tokens.map((token) => token.exportName).sort();
    const typeNames = [...new Set(tokens.map((token) => token.payloadType))].sort();
    const specifiers = [...valueNames, ...typeNames.map((name) => `type ${name}`)];
    lines.push(`import { ${specifiers.join(", ")} } from "../${gameplay.id}/wire";`);
  }

  lines.push(
    "",
    "/** 客户端 → 服务端 消息名（core + 各玩法 wire token 的显式字面量聚合） */",
    "export const C2S = {",
    ...c2sEntries.map((entry) => `    ${entry.key}: ${JSON.stringify(entry.type)},`),
    "} as const;",
    "",
    "/** 服务端 → 客户端 消息名 */",
    "export const S2C = {",
    ...s2cEntries.map((entry) => `    ${entry.key}: ${JSON.stringify(entry.type)},`),
    "} as const;",
    "",
    "export type C2SType = (typeof C2S)[keyof typeof C2S];",
    "export type S2CType = (typeof S2C)[keyof typeof S2C];",
    "",
    "/** 消息名 → payload 类型，供两端 adapter 和 fixture 共享。 */",
    "export interface C2SPayloadMap {",
    ...c2sEntries.map((entry) => `    ${JSON.stringify(entry.type)}: ${entry.payloadRef};`),
    "}",
    "",
    "export interface S2CPayloadMap {",
    ...s2cEntries.map((entry) => `    ${JSON.stringify(entry.type)}: ${entry.payloadRef};`),
    "}",
    "",
    "export type C2SPayload<T extends C2SType> = C2SPayloadMap[T];",
    "export type S2CPayload<T extends S2CType> = S2CPayloadMap[T];",
    "",
    "/** C2S runtime validators（core 表 + token.validate；漏键编译期红）。 */",
    "export const C2S_RUNTIME_VALIDATORS: { [K in C2SType]: RuntimeValidator<C2SPayloadMap[K]> } = {",
    ...c2sEntries.map((entry) => entry.owner === "core"
      ? `    ${JSON.stringify(entry.type)}: CORE_C2S_WIRE[${JSON.stringify(entry.type)}],`
      : `    ${JSON.stringify(entry.type)}: ${entry.key}.validate,`),
    "};",
    "",
    "/** S2C runtime validators. Client state/message adapters must validate before dispatching callbacks. */",
    "export const S2C_RUNTIME_VALIDATORS: { [K in S2CType]: RuntimeValidator<S2CPayloadMap[K]> } = {",
    ...s2cEntries.map((entry) => entry.owner === "core"
      ? `    ${JSON.stringify(entry.type)}: CORE_S2C_WIRE[${JSON.stringify(entry.type)}],`
      : `    ${JSON.stringify(entry.type)}: ${entry.key}.validate,`),
    "};",
    "",
    "export function validateC2SPayload<T extends C2SType>(type: T, input: unknown): C2SPayload<T> {",
    "    return guardWire(\"payload\", () => {",
    "        const validator = C2S_RUNTIME_VALIDATORS[type] as RuntimeValidator<C2SPayload<T>> | undefined;",
    "        if (!validator) throw new WireValidationError(\"MESSAGE_TYPE\", \"type\");",
    "        return validator(input);",
    "    });",
    "}",
    "",
    "export function validateS2CPayload<T extends S2CType>(type: T, input: unknown): S2CPayload<T> {",
    "    return guardWire(\"payload\", () => {",
    "        const validator = S2C_RUNTIME_VALIDATORS[type] as RuntimeValidator<S2CPayload<T>> | undefined;",
    "        if (!validator) throw new WireValidationError(\"MESSAGE_TYPE\", \"type\");",
    "        return validator(input);",
    "    });",
    "}",
    "",
    "/** message type → 拥有者（core 或玩法 mode id）；dispatcher 的 owner 闸。 */",
    "export const GAME_WIRE_OWNERS = {",
    ...c2sEntries.map((entry) => `    ${JSON.stringify(entry.type)}: ${JSON.stringify(entry.owner)},`),
    ...s2cEntries.map((entry) => `    ${JSON.stringify(entry.type)}: ${JSON.stringify(entry.owner)},`),
    "} as const;",
    "",
    "export type GameWireType = keyof typeof GAME_WIRE_OWNERS;",
    "",
    "/** 玩法 C2S 的 phase 白名单（token 声明；core 消息的 phase 规则由 shell 拥有，不在此表）。 */",
    "export const GAME_WIRE_PHASES = {",
    ...gameplayC2S.map(({ token }) =>
      `    ${JSON.stringify(token.type)}: [${token.phases.map((phase) => `GamePhase.${phase}`).join(", ")}],`),
    hasGameplayC2S
      ? "} as const satisfies { readonly [type: string]: readonly GamePhaseType[] };"
      : "} as const;",
    "",
    "/** 玩法 C2S 的预算成本（rateCost；机制为高频输入留位）。 */",
    "export const GAME_WIRE_RATE_COST = {",
    ...gameplayC2S.map(({ token }) => `    ${JSON.stringify(token.type)}: ${token.rateCost},`),
    "} as const satisfies { readonly [type: string]: number };",
    "",
    "/** 每玩法 C2S token 表（GameMode.commands 键派生与校验用）。 */",
    "export const gameplayC2STokens = {",
    ...gameplays.flatMap((gameplay) => [
      `    ${JSON.stringify(gameplay.id)}: {`,
      ...gameplay.wire.c2s.map((token) => `        ${JSON.stringify(token.type)}: ${token.exportName},`),
      "    },",
    ]),
    "} as const satisfies { readonly [mode: string]: { readonly [type: string]: GameplayC2SToken<unknown> } };",
    "",
    "/** 每玩法 S2C token 表。 */",
    "export const gameplayS2CTokens = {",
    ...gameplays.flatMap((gameplay) => [
      `    ${JSON.stringify(gameplay.id)}: {`,
      ...gameplay.wire.s2c.map((token) => `        ${JSON.stringify(token.type)}: ${token.exportName},`),
      "    },",
    ]),
    "} as const satisfies { readonly [mode: string]: { readonly [type: string]: GameplayS2CToken<unknown> } };",
    "",
    "/** core S2C token（mode 经 context 发送 core Error/Chat 等时使用）。 */",
    "export const CORE_S2C_TOKENS = {",
    ...core.s2c.map((entry) =>
      `    ${entry.key}: defineS2C(${JSON.stringify(entry.type)}, CORE_S2C_WIRE[${JSON.stringify(entry.type)}]),`),
    "} as const;",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderServerAggregate(gameplays: readonly GameplayDescriptor[]): string {
  const lines = [
    generatedHeader(AGGREGATE_SOURCE_LABEL),
    "import { Schema, MapSchema } from \"@colyseus/schema\";",
    "import { type GamePhaseType, type RoomStateMode } from \"@game/shared\";",
  ];
  for (const gameplay of gameplays) {
    lines.push(`import { ${rootType(gameplay).name} } from "./generated/${gameplay.id}";`);
  }
  lines.push("");
  for (const gameplay of gameplays) {
    const names = gameplay.state.types.map((type) => type.name);
    lines.push(`export { ${names.join(", ")} } from "./generated/${gameplay.id}";`);
  }
  // 通用 shell 只被允许看见这组字段。⛔ 不要把它写成某个具体 root 的别名：那正是被替换掉的
  // `declare readonly state: GameRoomState`——它让 shell 在类型上拥有 ballMove 的全部字段，
  // 于是「玩法无关」只剩下口头约定。字段集由每玩法 state descriptor 的生命周期断言保证。
  lines.push(
    "",
    "/** Fields every root declares; the gameplay-agnostic GameRoom shell may only touch these. */",
    "export interface RoomStatePlayerLifecycle {",
    "    id: string;",
    "    name: string;",
    "}",
    "",
    "/** Root lifecycle view used by the generic shell; the selected mode owns everything else. */",
    "export interface RoomStateLifecycle {",
    "    tick: number;",
    "    phase: GamePhaseType;",
    "    matchId: string;",
    "    players: MapSchema<RoomStatePlayerLifecycle>;",
    "}",
    "",
    "/** OwnerReady fragment view (§4.6): only roots whose state.json declares \"ownerReady\" carry these fields. */",
    "export interface RoomStatePlayerOwnerReady extends RoomStatePlayerLifecycle {",
    "    /** Waiting-phase ready flag; new seats default to false */",
    "    ready: boolean;",
    "    /** False while the member is inside the reconnect grace window */",
    "    connected: boolean;",
    "}",
    "",
    "export interface RoomStateOwnerReady extends RoomStateLifecycle {",
    "    /** Owner sessionId; empty until the expected owner seats */",
    "    ownerId: string;",
    "    rosterRevision: number;",
    "    readyRevision: number;",
    "    connectionRevision: number;",
    "    /** Start transaction fence; Ready/Unready are refused while set */",
    "    starting: boolean;",
    "    players: MapSchema<RoomStatePlayerOwnerReady>;",
    "}",
    "",
    "/** InviteRoom fragment view (§4.6): display-only invite code and waiting-deadline info. */",
    "export interface RoomStateInviteRoom {",
    "    /** Best-effort display invite code; the resolve-side lease is the only authority */",
    "    roomCode: string;",
    "    /** Absolute waiting deadline (ms timestamp, display only) */",
    "    waitingDeadlineAt: number;",
    "}",
    "",
    "/** Declared state fragments per mode; profile startup assertions read this map. */",
    "export const ROOM_STATE_FRAGMENTS = Object.freeze({",
    ...gameplays.map((gameplay) =>
      `    ${JSON.stringify(gameplay.id)}: [${gameplay.state.fragments.map((fragment) => JSON.stringify(fragment)).join(", ")}],`),
    "} as const satisfies Record<RoomStateMode, readonly string[]>);",
    "",
    "export const ROOM_STATE_ROOT_CONSTRUCTORS = Object.freeze({",
  );
  for (const gameplay of gameplays) {
    lines.push(`    ${JSON.stringify(gameplay.id)}: ${rootType(gameplay).name},`);
  }
  lines.push(
    "} as const satisfies Record<RoomStateMode, new () => Schema>);",
    "",
    "export type RoomStateRootForMode<M extends RoomStateMode> = InstanceType<(typeof ROOM_STATE_ROOT_CONSTRUCTORS)[M]>;",
    "export type RoomStateRoot = RoomStateRootForMode<RoomStateMode>;",
    "type RoomStateRootConstructor = (typeof ROOM_STATE_ROOT_CONSTRUCTORS)[RoomStateMode];",
    "",
    "export function createRoomStateForMode<M extends RoomStateMode>(mode: M): RoomStateRootForMode<M>;",
    "export function createRoomStateForMode(mode: string): RoomStateRoot;",
    "export function createRoomStateForMode(mode: string): RoomStateRoot {",
    "    const Root = (ROOM_STATE_ROOT_CONSTRUCTORS as Readonly<Partial<Record<string, RoomStateRootConstructor>>>)[mode];",
    "    if (!Root) throw new TypeError(`[room-state] unsupported gameplay mode: ${mode}`);",
    "    return new Root();",
    "}",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderClientCatalog(gameplays: readonly GameplayDescriptor[]): string {
  // ⚠ 客户端生成代码钉 ES2017 运行时 API 且必须过 noUnusedLocals（本文件只有字面量数据）。
  const lines = [
    generatedHeader(AGGREGATE_SOURCE_LABEL),
    "",
    "/** Per-gameplay catalog mirror (minimal; extended in stage 9). contractDigest = sha256(manifest.json + \"\\0\" + state.json + \"\\0\" + wire.ts). */",
    "export const GAMEPLAY_CATALOG = {",
    ...renderCatalogEntries(gameplays),
    "} as const;",
    "",
    "export type GameplayCatalogId = keyof typeof GAMEPLAY_CATALOG;",
    "",
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

/** 全部产物（相对仓根路径 → 内容），键按路径稳定排序。 */
export function renderGameplayArtifacts(
  gameplays: readonly GameplayDescriptor[],
  core: CoreWireNames,
): ReadonlyMap<string, string> {
  const artifacts = new Map<string, string>();
  artifacts.set(SHARED_WIRE_CATALOG_RELATIVE, renderWireCatalog(gameplays, core));
  for (const gameplay of gameplays) {
    artifacts.set(
      `${SHARED_STATE_DIR_RELATIVE}/${gameplay.id}.ts`,
      renderSharedStateModule(gameplay.id, gameplay.manifest.maxPlayers, gameplay.state, gameplay.sourceLabel),
    );
    artifacts.set(
      `${SERVER_SCHEMA_DIR_RELATIVE}/${gameplay.id}.ts`,
      renderServerSchemaModule(gameplay.id, gameplay.state, gameplay.sourceLabel),
    );
  }
  artifacts.set(SHARED_CATALOG_RELATIVE, renderSharedCatalog(gameplays));
  artifacts.set(SHARED_INDEX_RELATIVE, renderSharedIndex(gameplays));
  artifacts.set(SERVER_AGGREGATE_RELATIVE, renderServerAggregate(gameplays));
  artifacts.set(CLIENT_CATALOG_RELATIVE, renderClientCatalog(gameplays));
  return new Map([...artifacts.entries()].sort(([left], [right]) => (left < right ? -1 : 1)));
}

// ── digest/modeVersion 闸 ───────────────────────────────────────────────────

type CatalogRecord = { readonly modeVersion: number; readonly contractDigest: string };

/**
 * 从既有 shared catalog 生成物中恢复 per-mode digest/modeVersion 记录。
 * 生成物格式由本生成器唯一拥有，解析不动的文件按「无历史记录」处理（首次生成放行；
 * catalog 本身受 freshness 断言守护，手工篡改会先被 --check 点名）。
 */
export function previousCatalogRecords(options: GameplayCodegenOptions = {}): ReadonlyMap<string, CatalogRecord> {
  const file = path.join(resolvedRoot(options), SHARED_CATALOG_RELATIVE);
  const records = new Map<string, CatalogRecord>();
  if (!fs.existsSync(file)) return records;
  const text = fs.readFileSync(file, "utf8");
  // profiles/stateFragments 两行可缺省匹配：既容纳阶段 8 之前的旧 catalog 格式（首次带
  // fragment 的迁移仍能读到历史 digest/modeVersion），也容纳当前格式。
  const entry = /"([A-Za-z0-9._-]{1,64})": \{\n {8}id: "[^"\n]+",\n {8}constantName: "[^"\n]+",\n {8}modeVersion: (\d+),\n {8}maxPlayers: \d+,\n(?: {8}(?:profiles|stateFragments): \[[^\]\n]*\],\n)* {8}contractDigest: "([0-9a-f]{64})",\n {4}\},/gu;
  for (const match of text.matchAll(entry)) {
    records.set(match[1], {
      modeVersion: Number(match[2]),
      contractDigest: match[3],
    });
  }
  return records;
}

/** 契约 digest 变化必须伴随 manifest.modeVersion 递增；首次生成（无旧记录）放行。 */
export function assertModeVersionBumped(
  gameplays: readonly GameplayDescriptor[],
  previous: ReadonlyMap<string, CatalogRecord>,
): void {
  for (const gameplay of gameplays) {
    const record = previous.get(gameplay.id);
    if (!record) continue;
    if (record.contractDigest === gameplay.contractDigest) continue;
    if (gameplay.manifest.modeVersion > record.modeVersion) continue;
    fail(
      `${SCHEMA_DIR_RELATIVE}/${gameplay.id}`,
      `contract digest changed but modeVersion did not increase (kept ${gameplay.manifest.modeVersion}, `
      + `previous ${record.modeVersion}). Bump modeVersion in ${SCHEMA_DIR_RELATIVE}/${gameplay.id}/manifest.json`,
    );
  }
}

// ── freshness 与写盘 ────────────────────────────────────────────────────────

/** 生成器独占所有权的目录：其中出现非预期文件即 extra。 */
const OWNED_GENERATED_DIRS = [SHARED_GENERATED_DIR_RELATIVE, SERVER_SCHEMA_DIR_RELATIVE] as const;

function collectOwnedFiles(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string, base: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, base);
      else out.push(posixPath(path.relative(base, full)));
    }
  };
  for (const relative of OWNED_GENERATED_DIRS) walk(path.join(root, relative), root);
  return [...new Set(out)].sort();
}

function diffArtifacts(root: string, expected: ReadonlyMap<string, string>): {
  readonly stale: readonly string[];
  readonly missing: readonly string[];
  readonly extra: readonly string[];
} {
  const stale: string[] = [];
  const missing: string[] = [];
  for (const [relative, content] of expected) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) {
      missing.push(relative);
    } else if (fs.readFileSync(file, "utf8") !== content) {
      stale.push(relative);
    }
  }
  const extra = collectOwnedFiles(root).filter((relative) => !expected.has(relative));
  return { stale, missing, extra };
}

/** 只读 freshness 断言：stale / missing / extra 任一非空即失败并点名。 */
export function assertGameplayArtifactsFresh(options: GameplayCodegenOptions = {}): void {
  const root = resolvedRoot(options);
  const gameplays = readGameplayDescriptors(options);
  assertModeVersionBumped(gameplays, previousCatalogRecords(options));
  const { stale, missing, extra } = diffArtifacts(root, renderGameplayArtifacts(gameplays, readCoreWireNames(options)));
  const problems: string[] = [];
  if (stale.length > 0) problems.push(`stale: ${stale.join(", ")}`);
  if (missing.length > 0) problems.push(`missing: ${missing.join(", ")}`);
  if (extra.length > 0) problems.push(`extra: ${extra.join(", ")}`);
  if (problems.length > 0) {
    throw new Error(
      `[gameplay-codegen] generated gameplay artifacts are not fresh — ${problems.join("; ")}. ${RUN_HINT}`,
    );
  }
}

function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, file);
}

/**
 * 写盘。目录消失但 catalog 仍登记的 mode 必须显式 `--allow-delete <id>`，
 * 生成目录内它的产物同批删除、不留残留。
 */
export function writeGameplayArtifacts(options: GameplayCodegenOptions = {}): GameplayWriteResult {
  const root = resolvedRoot(options);
  const allowDelete = new Set(options.allowDelete ?? []);
  const gameplays = readGameplayDescriptors(options);
  const previous = previousCatalogRecords(options);
  assertModeVersionBumped(gameplays, previous);

  const currentIds = new Set(gameplays.map((gameplay) => gameplay.id));
  const removed = [...previous.keys()].filter((id) => !currentIds.has(id));
  const refused = removed.filter((id) => !allowDelete.has(id));
  if (refused.length > 0) {
    fail(
      SCHEMA_DIR_RELATIVE,
      `gameplay id(s) still in the generated catalog but their source directories are gone: ${refused.join(", ")}. `
      + `Deleting a gameplay requires an explicit --allow-delete <id>`,
    );
  }

  const expected = renderGameplayArtifacts(gameplays, readCoreWireNames(options));
  // extra 清理：生成目录里不再被任何 mode 拥有的文件。允许删除名单里的 mode 产物删除；
  // 其余一律拒绝——普通 --write 不得静默吞掉未知文件。
  const orphans = collectOwnedFiles(root).filter((relative) => !expected.has(relative));
  const deletable: string[] = [];
  for (const relative of orphans) {
    const stem = path.basename(relative).replace(/\.ts$/u, "");
    if (allowDelete.has(stem)) {
      deletable.push(relative);
    } else {
      fail(relative, `unexpected file in a generator-owned directory. ${RUN_HINT} with --allow-delete <id> if this gameplay was removed`);
    }
  }

  const changed: string[] = [];
  for (const [relative, content] of expected) {
    const file = path.join(root, relative);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) continue;
    atomicWrite(file, content);
    changed.push(relative);
  }
  for (const relative of deletable) fs.rmSync(path.join(root, relative));
  return { changed, deleted: deletable };
}

// ── CLI 参数 ────────────────────────────────────────────────────────────────

export type GameplayCliArguments = {
  readonly check: boolean;
  readonly repositoryRoot?: string;
  readonly allowDelete?: readonly string[];
};

/** 沿用仓内惯例：`--check`、`--root <dir>`/`--root=<dir>`；重复/未知参数 throw。 */
export function parseCli(argv: readonly string[]): GameplayCliArguments {
  let check = false;
  let repositoryRoot: string | undefined;
  const allowDelete: string[] = [];
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
    } else if (arg === "--allow-delete") {
      const value = argv[++index];
      if (!value || !MODE_ID.test(value)) throw new Error("--allow-delete requires a gameplay id");
      if (allowDelete.includes(value)) throw new Error(`duplicate argument: --allow-delete ${value}`);
      allowDelete.push(value);
    } else if (arg.startsWith("--allow-delete=")) {
      const value = arg.slice("--allow-delete=".length);
      if (!value || !MODE_ID.test(value)) throw new Error("--allow-delete requires a gameplay id");
      if (allowDelete.includes(value)) throw new Error(`duplicate argument: --allow-delete ${value}`);
      allowDelete.push(value);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (check && allowDelete.length > 0) throw new Error("--check is read-only and rejects --allow-delete");
  return {
    check,
    ...(repositoryRoot === undefined ? {} : { repositoryRoot }),
    ...(allowDelete.length === 0 ? {} : { allowDelete }),
  };
}
