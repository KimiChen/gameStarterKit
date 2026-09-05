/**
 * codegen:gameplays 的编排层：发现每玩法单源目录、digest/modeVersion 闸、
 * 三端产物渲染（含服务端 `modes/catalog.generated.ts`：按 manifest.wireExposed 发现
 * `modes/<id>/index.ts` 的 `register<Constant>GameMode`，Non-intrusive §5.4/§8.2）、
 * freshness（--check 只读）与原子写盘（--write）。
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
  hasGameplaySourcedEnum,
  parseGameplayStateDescriptor,
  posixPath,
  renderSharedStateModule,
  renderServerSchemaModule,
  type GameplayStateDescriptor,
} from "./stateRenderer";
import {
  assertClientGameplayModuleSource,
  assertGameplayModeIdFacade,
  assertServerGameModeModuleSource,
  parseCoreWireNames,
  parseGameplayModeIds,
  parseGameplayWireModule,
  type CoreWireNames,
  type GameplayWireDeclarations,
} from "./wireParser";

const TOOL_REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCHEMA_DIR_RELATIVE = "apps/shared/schema/gameplays";
/** 插件根（PLUGIN.md §5.5 阶段 1）：`apps/plugins/<id>/gameplay/{manifest.json,state.json}` 与 schema 目录同等发现。 */
export const PLUGINS_DIR_RELATIVE = "apps/plugins";
const PLUGIN_GAMEPLAY_SUBDIR = "gameplay";
const SHARED_GAMEPLAYS_DIR_RELATIVE = "apps/shared/src/gameplays";
const SHARED_STATE_DIR_RELATIVE = "apps/shared/src/gameplays/generated/state";
const SHARED_GENERATED_DIR_RELATIVE = "apps/shared/src/gameplays/generated";
const SHARED_CATALOG_RELATIVE = "apps/shared/src/gameplays/catalog.generated.ts";
const SHARED_INDEX_RELATIVE = "apps/shared/src/gameplays/index.ts";
const SHARED_WIRE_CATALOG_RELATIVE = "apps/shared/src/gameplays/generated/wire-catalog.generated.ts";
const SHARED_MODE_IDS_RELATIVE = "apps/shared/src/gameplays/generated/modeIds.generated.ts";
/** 上一行产物在 protocol/rooms.ts 里的相对路径（铁律 3：相对导入不带扩展名）。 */
const SHARED_MODE_IDS_MODULE_FROM_PROTOCOL = "../gameplays/generated/modeIds.generated";
const CORE_MESSAGES_RELATIVE = "apps/shared/src/protocol/messages.ts";
const SERVER_SCHEMA_DIR_RELATIVE = "apps/server/src/rooms/schema/generated";
const SERVER_AGGREGATE_RELATIVE = "apps/server/src/rooms/schema/GameRoomState.ts";
const CLIENT_CATALOG_RELATIVE = "apps/client/src/gameplay/catalog.generated.ts";
const CLIENT_MODES_DIR_RELATIVE = "apps/client/src/gameplay/modes";
const SERVER_MODES_DIR_RELATIVE = "apps/server/src/rooms/modes";
const SERVER_CATALOG_RELATIVE = "apps/server/src/rooms/modes/catalog.generated.ts";
const SHARED_ROOMS_RELATIVE = "apps/shared/src/protocol/rooms.ts";
/** 玩法 wire 向量 sidecar 目录：core.ts + 每个声明了 C2S wire 的玩法一份 <id>.ts；登记表由本生成器渲染。 */
const WIRE_VECTORS_DIR_RELATIVE = "apps/server/test/wire-vectors";
export const WIRE_VECTORS_INDEX_RELATIVE = `${WIRE_VECTORS_DIR_RELATIVE}/index.generated.ts`;
const WIRE_VECTORS_SOURCE_LABEL = `${WIRE_VECTORS_DIR_RELATIVE}/<owner>.ts（owner = core + 声明了 C2S wire 的玩法 id）`;
/** wire-vectors/ 下不是 sidecar 的固定文件。 */
const WIRE_VECTORS_NON_SIDECAR = new Set(["index.ts", "index.generated.ts", "vectorTypes.ts"]);

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
  /**
   * 该 mode 是否声明了 `enumSource: "gameplay"` 的 state 字段。
   * 为真时 `<id>/ruleset.ts` 必存在（已在 readGameplayDescriptors 校验），
   * 且聚合 barrel 必须 re-export 它——服务端侧产物从 `@game/shared` 解析这些枚举符号。
   */
  readonly hasGameplayEnumModule: boolean;
  /**
   * `apps/shared/src/gameplays/<id>/` 下**手写**模块的基名（无扩展名），按 barrel re-export 顺序：
   * `ruleset` → `wire` → 其余字母序。`*.generated.ts` 刻意排除——生成数据模块只由同目录的手写
   * façade 消费，⛔ 不进公共导出面（同 `generated/` 目录的 façade 约定）。
   * 这条自动发现是「玩法自持」的落点：玩法新增一个自有 shared 模块，⛔ 不需要改框架任何文件。
   */
  readonly sharedModules: readonly string[];
  /** sha256(manifest.json + "\0" + state.json + "\0" + wire.ts 字节)，per-mode 契约身份。 */
  readonly contractDigest: string;
  readonly sourceLabel: string;
  /** 单源目录标签（`apps/shared/schema/gameplays/<id>` 或 `apps/plugins/<id>/gameplay`），错误信息据此点名。 */
  readonly sourceDir: string;
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

/** barrel re-export 的依赖序前缀：其余手写模块跟在后面按字母序（`export *` 名字空间与顺序无关，
 *  这里只是让产物字节稳定且读起来符合 ruleset → wire → state 的依赖方向）。 */
const SHARED_MODULE_ORDER = ["ruleset", "wire"] as const;

/**
 * 自动发现 `apps/shared/src/gameplays/<id>/` 下的手写模块（barrel 要 re-export 的集合）。
 *
 * ⚠ 这是「玩法自持自己的 shared 面」的落点：玩法新增一个自有模块（皮肤目录、规则表…）
 * 只需把文件放进自己的目录，⛔ 不必回来改本生成器或任何中央清单。
 * 排除项只有两类：`*.generated.ts`（生成数据模块，由同目录手写 façade 消费，不进公共导出面）
 * 与 `*.d.ts`（无运行时导出）。目录不存在 = 该玩法没有手写 shared 模块。
 */
function readGameplaySharedModules(root: string, id: string): readonly string[] {
  const dirLabel = `${SHARED_GAMEPLAYS_DIR_RELATIVE}/${id}`;
  const dir = path.join(root, SHARED_GAMEPLAYS_DIR_RELATIVE, id);
  let children: fs.Dirent[];
  try {
    children = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const modules: string[] = [];
  for (const child of children.slice().sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))) {
    if (!child.name.endsWith(".ts")) continue;
    if (child.name.endsWith(".generated.ts") || child.name.endsWith(".d.ts")) continue;
    const childLabel = `${dirLabel}/${child.name}`;
    if (child.isSymbolicLink()) fail(childLabel, "symlink escape is not allowed");
    if (!child.isFile()) fail(childLabel, "must be a regular file");
    modules.push(child.name.slice(0, -".ts".length));
  }
  const ordered = SHARED_MODULE_ORDER.filter((name) => modules.includes(name));
  return [...ordered, ...modules.filter((name) => !ordered.includes(name as (typeof SHARED_MODULE_ORDER)[number]))];
}

/** 发现并解析全部玩法单源目录；输出按 id 稳定排序。 */
interface GameplaySource {
  readonly id: string;
  readonly entryPath: string;
  readonly entryLabel: string;
}

/** 两个发现根：schema 目录（每个子目录都必须是玩法）与插件目录（有 gameplay/ 子目录的插件才算）。 */
function discoverGameplaySources(root: string): readonly GameplaySource[] {
  const schemaDir = path.join(root, SCHEMA_DIR_RELATIVE);
  if (!fs.existsSync(schemaDir)) {
    fail(SCHEMA_DIR_RELATIVE, "gameplay schema directory does not exist");
  }
  const sources: GameplaySource[] = [];
  const entries = fs.readdirSync(schemaDir, { withFileTypes: true })
    .slice()
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of entries) {
    const entryLabel = `${SCHEMA_DIR_RELATIVE}/${entry.name}`;
    const entryPath = path.join(schemaDir, entry.name);
    if (fs.lstatSync(entryPath).isSymbolicLink()) fail(entryLabel, "symlink escape is not allowed");
    if (!entry.isDirectory()) fail(entryLabel, "only per-gameplay directories are allowed here");
    // 防御性路径闸：id 正则已排除路径分隔符，这里再钉一次解析结果必须留在 schema 根之下。
    const resolvedEntry = path.resolve(schemaDir, entry.name);
    if (resolvedEntry !== path.join(schemaDir, entry.name) || !resolvedEntry.startsWith(schemaDir + path.sep)) {
      fail(entryLabel, "path escapes the gameplay schema root");
    }
    sources.push({ id: entry.name, entryPath, entryLabel });
  }
  const pluginsDir = path.join(root, PLUGINS_DIR_RELATIVE);
  if (fs.existsSync(pluginsDir)) {
    const pluginEntries = fs.readdirSync(pluginsDir, { withFileTypes: true })
      .slice()
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of pluginEntries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(pluginsDir, entry.name, PLUGIN_GAMEPLAY_SUBDIR);
      if (!fs.existsSync(entryPath)) continue;
      const entryLabel = `${PLUGINS_DIR_RELATIVE}/${entry.name}/${PLUGIN_GAMEPLAY_SUBDIR}`;
      if (fs.lstatSync(path.join(pluginsDir, entry.name)).isSymbolicLink() || fs.lstatSync(entryPath).isSymbolicLink()) fail(entryLabel, "symlink escape is not allowed");
      if (!fs.statSync(entryPath).isDirectory()) fail(entryLabel, "gameplay must be a directory");
      sources.push({ id: entry.name, entryPath, entryLabel });
    }
  }
  return sources;
}

export function readGameplayDescriptors(options: GameplayCodegenOptions = {}): readonly GameplayDescriptor[] {
  const root = resolvedRoot(options);
  const gameplays: GameplayDescriptor[] = [];
  const normalizedIds = new Map<string, string>();
  for (const source of discoverGameplaySources(root)) {
    const { entryPath, entryLabel } = source;
    const entry = { name: source.id };
    if (!MODE_ID.test(entry.name)) fail(entryLabel, `invalid gameplay mode id: ${entry.name}`);
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

    // ruleset.ts（手写）：仅当 state.json 声明了 enumSource:"gameplay" 时才是硬依赖。
    // shared 侧产物会 import 它、聚合 barrel 会 re-export 它，缺失就是一条断链——点名拒绝，
    // ⛔ 不留到 tsc 阶段（符号级存在性交给 typecheck，这里只保证模块在）。
    const hasGameplayEnumModule = hasGameplaySourcedEnum(state);
    if (hasGameplayEnumModule) {
      const rulesetLabel = `${SHARED_GAMEPLAYS_DIR_RELATIVE}/${entry.name}/ruleset.ts`;
      const rulesetFile = path.join(root, SHARED_GAMEPLAYS_DIR_RELATIVE, entry.name, "ruleset.ts");
      let rulesetStat: fs.Stats | null = null;
      try {
        rulesetStat = fs.lstatSync(rulesetFile);
      } catch {
        rulesetStat = null;
      }
      if (!rulesetStat) {
        fail(
          `${entryLabel}/state.json`,
          `declares enumSource "gameplay" but ${rulesetLabel} is missing `
          + "(gameplay-owned enums must live in that module)",
        );
      }
      if (rulesetStat.isSymbolicLink()) fail(rulesetLabel, "symlink escape is not allowed");
      if (!rulesetStat.isFile()) fail(rulesetLabel, "must be a regular file");
    }

    // 手写 shared 模块自动发现（barrel re-export 集合）。⛔ 不进 contractDigest：
    // digest 是 wire/state 契约身份，玩法自有模块的内容变化不该逼 modeVersion bump。
    const sharedModules = readGameplaySharedModules(root, entry.name);

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
      hasGameplayEnumModule,
      sharedModules,
      contractDigest,
      sourceLabel: `${entryLabel}/{manifest.json,state.json}`,
      sourceDir: entryLabel,
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
    const label = gameplay.sourceDir;
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

/** 已装配客户端 GameplayModule 的玩法（阶段 9：canonical GameplayModeId ∩ catalog）。 */
export type ClientGameplayModule = {
  readonly id: string;
  readonly constantName: string;
};

/**
 * 发现客户端 GameplayModule 装配集（§7.6 阶段 9）：
 *  - canonical 集 = manifest 声明 `wireExposed !== false` 的玩法（= 生成的 `GameplayModeId`
 *    成员集）——与服务端生产 mode registry 的同集断言同一口径；
 *  - `protocol/rooms.ts` 必须只是该生成物的 re-export façade（手写常量表即 fail-fast）；
 *  - 装配集内每个 id 的 `apps/client/src/gameplay/modes/<id>/index.ts` 必须存在且
 *    （语法级）导出 `createGameplayModule`，缺失 fail-fast。
 * 真仓的「modes/ 目录 == canonical 集」双向同集由 gameplay-codegen.test 守门。
 */
export function readClientGameplayModules(
  gameplays: readonly GameplayDescriptor[],
  options: GameplayCodegenOptions = {},
): readonly ClientGameplayModule[] {
  const root = resolvedRoot(options);
  const roomsFile = path.join(root, SHARED_ROOMS_RELATIVE);
  let roomsSource: string;
  try {
    roomsSource = fs.readFileSync(roomsFile, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(SHARED_ROOMS_RELATIVE, `cannot read canonical GameplayModeId façade: ${detail}`);
  }
  assertGameplayModeIdFacade(roomsSource, SHARED_ROOMS_RELATIVE, SHARED_MODE_IDS_MODULE_FROM_PROTOCOL);
  const canonical = wireExposedGameplays(gameplays);
  const modules: ClientGameplayModule[] = [];
  for (const gameplay of [...canonical].sort((left, right) => (left.id < right.id ? -1 : 1))) {
    const id = gameplay.id;
    const label = `${CLIENT_MODES_DIR_RELATIVE}/${id}/index.ts`;
    const file = path.join(root, CLIENT_MODES_DIR_RELATIVE, id, "index.ts");
    assertRegularFile(file, label);
    assertClientGameplayModuleSource(fs.readFileSync(file, "utf8"), label);
    modules.push({ id, constantName: gameplay.manifest.constantName });
  }
  return modules;
}

/** 已装配服务端 GameMode 的玩法（= canonical GameplayModeId ∩ catalog；与客户端装配集同口径）。 */
export type ServerGameplayModule = {
  readonly id: string;
  readonly constantName: string;
  /** 约定导出符号：`register<ConstantName>GameMode`。 */
  readonly registerSymbol: string;
};

/**
 * 发现服务端 GameMode 装配集（Non-intrusive §5.4/§8.2：`modes/catalog.ts` 生成化）：
 *  - 装配集 = manifest 声明 `wireExposed !== false` 的玩法（= 生成的 `GameplayModeId` 成员集），
 *    与客户端 `GAMEPLAY_MODULES` 同集——fixture 玩法（wireExposed:false）⛔ 不进生产 registry；
 *  - 装配集内每个 id 的 `apps/server/src/rooms/modes/<id>/index.ts` 必须存在且（语法级）导出
 *    `register<ConstantName>GameMode`，缺失 fail-fast。
 * 真仓的「modes/ 目录 == 装配集」双向同集由 gameplay-codegen.test 守门。
 */
export function readServerGameplayModules(
  gameplays: readonly GameplayDescriptor[],
  options: GameplayCodegenOptions = {},
): readonly ServerGameplayModule[] {
  const root = resolvedRoot(options);
  const canonical = wireExposedGameplays(gameplays);
  const modules: ServerGameplayModule[] = [];
  for (const gameplay of [...canonical].sort((left, right) => (left.id < right.id ? -1 : 1))) {
    const id = gameplay.id;
    const registerSymbol = `register${gameplay.manifest.constantName}GameMode`;
    const label = `${SERVER_MODES_DIR_RELATIVE}/${id}/index.ts`;
    const file = path.join(root, SERVER_MODES_DIR_RELATIVE, id, "index.ts");
    assertRegularFile(file, label);
    assertServerGameModeModuleSource(fs.readFileSync(file, "utf8"), label, registerSymbol);
    modules.push({ id, constantName: gameplay.manifest.constantName, registerSymbol });
  }
  return modules;
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
const AGGREGATE_SOURCE_LABEL = `${SCHEMA_DIR_RELATIVE}/<id>/{manifest.json,state.json} + ${PLUGINS_DIR_RELATIVE}/<id>/${PLUGIN_GAMEPLAY_SUBDIR}/{manifest.json,state.json}`;

function rootType(gameplay: GameplayDescriptor): { readonly sharedName: string; readonly validatorName: string; readonly name: string } {
  const type = gameplay.state.types.find((candidate) => candidate.name === gameplay.state.root);
  if (!type) fail(`gameplays.${gameplay.id}`, `missing root type while rendering: ${gameplay.state.root}`);
  return type;
}

/**
 * root 的 `players` map value 类型 = 该玩法的 player Schema 类。
 * 存在性由 stateRenderer 的 ROOT_LIFECYCLE_FIELDS / PLAYER_LIFECYCLE_FIELDS 断言保证
 * （每个 root 必须有 `players` map，其 value 类型必须声明 id/name），这里只做渲染期兜底。
 */
function playerType(gameplay: GameplayDescriptor): { readonly name: string } {
  const root = rootType(gameplay);
  const rootDescriptor = gameplay.state.types.find((candidate) => candidate.name === root.name);
  const players = rootDescriptor?.fields.find((field) => field.name === "players");
  if (players?.kind !== "map") {
    fail(`gameplays.${gameplay.id}`, `root ${root.name} must declare a "players" map while rendering`);
  }
  const type = gameplay.state.types.find((candidate) => candidate.name === players.valueType);
  if (!type) fail(`gameplays.${gameplay.id}`, `missing player type while rendering: ${players.valueType}`);
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
    // 依赖序：ruleset（玩法自有枚举/规则）→ wire（import 它）→ 其余手写模块 → generated state。
    for (const module of gameplay.sharedModules) lines.push(`export * from "./${gameplay.id}/${module}";`);
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
    lines.push(`import { ${rootType(gameplay).name}, ${playerType(gameplay).name} } from "./generated/${gameplay.id}";`);
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
    // player 侧与 root 侧同构：来源都是 state.json（player = root 的 players map value 类型）。
    // ⛔ 没有这张表时，任何需要「按 mode 造一个 player」的通用代码（GameRoom shell 之外，
    // 尤其是玩法无关的测试探针）只能手写 `new SnakePlayerState()`——那正是中央测试长出
    // 具名玩法分支的根因。
    "/** mode → player Schema 类；与 ROOM_STATE_ROOT_CONSTRUCTORS 同源于 state.json。 */",
    "export const ROOM_STATE_PLAYER_CONSTRUCTORS = Object.freeze({",
  );
  for (const gameplay of gameplays) {
    lines.push(`    ${JSON.stringify(gameplay.id)}: ${playerType(gameplay).name},`);
  }
  lines.push(
    "} as const satisfies Record<RoomStateMode, new () => Schema>);",
    "",
    "export type RoomStatePlayerForMode<M extends RoomStateMode> = InstanceType<(typeof ROOM_STATE_PLAYER_CONSTRUCTORS)[M]>;",
    "export type RoomStatePlayer = RoomStatePlayerForMode<RoomStateMode>;",
    "type RoomStatePlayerConstructor = (typeof ROOM_STATE_PLAYER_CONSTRUCTORS)[RoomStateMode];",
    "",
    "export function createRoomPlayerForMode<M extends RoomStateMode>(mode: M): RoomStatePlayerForMode<M>;",
    "export function createRoomPlayerForMode(mode: string): RoomStatePlayer;",
    "export function createRoomPlayerForMode(mode: string): RoomStatePlayer {",
    "    const Player = (ROOM_STATE_PLAYER_CONSTRUCTORS as Readonly<Partial<Record<string, RoomStatePlayerConstructor>>>)[mode];",
    "    if (!Player) throw new TypeError(`[room-state] unsupported gameplay mode: ${mode}`);",
    "    return new Player();",
    "}",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

// ⚠ 标签会进 `/** … */` 块注释：⛔ 不能写 `*/`。
const CLIENT_SOURCE_LABEL =
  `${AGGREGATE_SOURCE_LABEL} + ${CLIENT_MODES_DIR_RELATIVE}/<id>/index.ts`;

function renderClientCatalog(
  gameplays: readonly GameplayDescriptor[],
  clientModules: readonly ClientGameplayModule[],
): string {
  // ⚠ 客户端生成代码钉 ES2017 运行时 API 且必须过 noUnusedLocals。
  // module import 是**静态字面量**（catalog 稳定进依赖图）；cc/FGUI 渲染实现仍由各
  // module 内的字面量动态 import 挂接（铁律 10；generated-purity 门禁覆盖本文件）。
  const factoryName = (module: ClientGameplayModule): string =>
    `create${module.constantName}GameplayModule`;
  const lines = [
    generatedHeader(CLIENT_SOURCE_LABEL),
    "import { registerGameplayModule } from \"../logic/gameplay/GameplayModule\";",
    "import type { AppGameplayRegistry, GameplayServicesContext } from \"./services\";",
  ];
  for (const module of clientModules) {
    lines.push(
      `import { createGameplayModule as ${factoryName(module)} } from "./modes/${module.id}/index";`,
    );
  }
  lines.push(
    "",
    "/** Per-gameplay catalog mirror. contractDigest = sha256(manifest.json + \"\\0\" + state.json + \"\\0\" + wire.ts). */",
    "export const GAMEPLAY_CATALOG = {",
    ...renderCatalogEntries(gameplays),
    "} as const;",
    "",
    "export type GameplayCatalogId = keyof typeof GAMEPLAY_CATALOG;",
    "",
    "/** 已装配客户端 module 的玩法（canonical GameplayModeId ∩ catalog；fixture 玩法不在此表）。 */",
    "export const GAMEPLAY_MODULES = {",
    ...clientModules.map((module) => `    ${JSON.stringify(module.id)}: ${factoryName(module)},`),
    "} as const;",
    "",
    "export type GameplayModuleId = keyof typeof GAMEPLAY_MODULES;",
    "",
    "/**",
    " * 登记全部 generated gameplay module（§7.6）：每个 module 只注入稳定服务，",
    " * 后续登记失败回滚本次已登记项（逆序），⛔ 不影响调用前已有登记。",
    " */",
    "export function registerGeneratedGameplays(",
    "    registry: AppGameplayRegistry,",
    "    services: GameplayServicesContext,",
    "): () => void {",
    "    const disposers: Array<() => void> = [];",
    "    try {",
    ...clientModules.map((module) =>
      `        disposers.push(registerGameplayModule(registry, ${factoryName(module)}(services), services.controllerBridge));`),
    "    } catch (error) {",
    "        for (const dispose of disposers.splice(0).reverse()) dispose();",
    "        throw error;",
    "    }",
    "    return () => {",
    "        for (const dispose of disposers.splice(0).reverse()) dispose();",
    "    };",
    "}",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

// ⚠ 标签会进 `/** … */` 块注释：⛔ 不能写 `*/`。
const SERVER_SOURCE_LABEL =
  `${SCHEMA_DIR_RELATIVE}/<id>/manifest.json (wireExposed) + ${SERVER_MODES_DIR_RELATIVE}/<id>/index.ts`;

/**
 * 服务端 mode catalog（`modes/catalog.generated.ts`）：静态字面量 import 各 mode 的
 * `register<Constant>GameMode`，在进程组合根一次登记全集（Non-intrusive §5.4：显式、排序稳定的
 * 静态 import；⛔ 无副作用式自注册、⛔ 无运行时目录扫描）。`modes/catalog.ts` 是它的稳定 façade。
 */
function renderServerCatalog(serverModules: readonly ServerGameplayModule[]): string {
  const lines = [
    generatedHeader(SERVER_SOURCE_LABEL),
    "import type { GameModeRegistry } from \"../GameMode\";",
  ];
  for (const module of serverModules) {
    lines.push(`import { ${module.registerSymbol} } from "./${module.id}/index";`);
  }
  lines.push(
    "",
    "/** 已装配服务端 GameMode 的玩法 id（= canonical GameplayModeId；fixture 玩法不在此表）。 */",
    "export const GENERATED_GAME_MODE_IDS: readonly string[] = [",
    ...serverModules.map((module) => `    ${JSON.stringify(module.id)},`),
    "];",
    "",
    "/**",
    " * 在进程组合根登记全部 generated 服务端 GameMode（缺省登记进生产 gameModeRegistry；",
    " * 测试可注入自己的 registry）：后续登记失败回滚本次已登记项（逆序），⛔ 不影响调用前已有登记。",
    " */",
    "export function registerGeneratedGameModes(registry?: GameModeRegistry): () => void {",
    "    const disposers: Array<() => void> = [];",
    "    try {",
    ...serverModules.map((module) => `        disposers.push(${module.registerSymbol}(registry));`),
    "    } catch (error) {",
    "        for (const dispose of disposers.splice(0).reverse()) dispose();",
    "        throw error;",
    "    }",
    "    return () => {",
    "        for (const dispose of disposers.splice(0).reverse()) dispose();",
    "    };",
    "}",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * 对外 wire 枚举 `GameplayModeId` 的成员集：manifest 声明 `wireExposed !== false` 的玩法。
 *
 * 这是「哪些 mode id 允许出现在 join/matchmaking wire 值里」的唯一判据。fixture 玩法
 * （dropInFixture/privateFixture）显式 `wireExposed: false`：它们走完整 catalog 链但 ⛔ 不进
 * 对外枚举——这条既有的刻意取舍此前只写在手写的 protocol/rooms.ts 里，现在归位到各自 manifest。
 */
export function wireExposedGameplays(gameplays: readonly GameplayDescriptor[]): readonly GameplayDescriptor[] {
  return gameplays.filter((gameplay) => gameplay.manifest.wireExposed);
}

/**
 * 闭合断言：`GameplayModeId` 成员集 === `{wireExposed: true}` 的 manifest id 集，且 ⊆ catalog。
 * 渲染完成后按渲染结果**回读**再比一次——渲染器写歪（漏一个/多一个/名字对不上）当场炸，
 * ⛔ 不依赖「生成器不会错」的信任。
 */
function assertWireExposedClosure(gameplays: readonly GameplayDescriptor[], rendered: string): void {
  const catalogIds = new Set(gameplays.map((gameplay) => gameplay.id));
  const exposed = wireExposedGameplays(gameplays);
  if (exposed.length === 0) {
    fail(SHARED_MODE_IDS_RELATIVE, "no gameplay declares wireExposed — GameplayModeId 不得为空");
  }
  for (const gameplay of exposed) {
    if (!catalogIds.has(gameplay.id)) {
      fail(SHARED_MODE_IDS_RELATIVE, `wireExposed gameplay "${gameplay.id}" 不在 GAMEPLAY_CATALOG 里`);
    }
  }
  const declared = [...parseGameplayModeIds(rendered, SHARED_MODE_IDS_RELATIVE)].sort();
  const expected = exposed.map((gameplay) => gameplay.id).sort();
  if (declared.length !== expected.length || declared.some((id, index) => id !== expected[index])) {
    fail(
      SHARED_MODE_IDS_RELATIVE,
      `GameplayModeId 成员集 [${declared.join(", ")}] 必须等于 wireExposed manifest 集 [${expected.join(", ")}]`,
    );
  }
}

/**
 * 对外 wire 枚举模块（**零依赖**：只含字面量常量与类型，⛔ 不 import 任何东西）。
 *
 * ⚠ 为什么单独一个模块而不是直接放进 catalog.generated.ts：`protocol/rooms.ts` 需要
 * `GameplayModeId`，而 catalog → generated/state → protocol/http 已经指回 protocol/，
 * 让 rooms.ts 反过来 import catalog 会成环。零依赖模块 + rooms.ts 的一行 re-export façade
 * 是无环的（实测：apps/shared tsc 与两端 typecheck 通过）。
 */
function renderSharedModeIds(gameplays: readonly GameplayDescriptor[]): string {
  const lines = [
    generatedHeader(`${AGGREGATE_SOURCE_LABEL} (manifest.wireExposed)`),
    "",
    "/**",
    " * Starter 中已装配的玩法 mode id；作为 join/matchmaking wire 值的双端单源。",
    " * 成员 = manifest 声明 `wireExposed !== false` 的玩法（缺省 true）。",
    " * ⚠ 本模块零依赖：`protocol/rooms.ts` 只做一行 re-export façade，⛔ 不得反向 import catalog",
    " * （catalog → generated/state → protocol/http 已指回 protocol/，那样会成环）。",
    " */",
    "export const GameplayModeId = {",
    ...gameplays.map((gameplay) =>
      `    ${gameplay.manifest.constantName}: ${JSON.stringify(gameplay.id)},`),
    "} as const;",
    "",
    "export type GameplayModeIdType = (typeof GameplayModeId)[keyof typeof GameplayModeId];",
    "",
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * 发现玩法 wire 向量 sidecar（`apps/server/test/wire-vectors/<owner>.ts`）并与 wire owner 集合双向对齐：
 * owner = core + 每个声明了 ≥1 个 C2S token 的玩法。缺 sidecar / 孤儿 sidecar 都 fail-fast——
 * 中央测试的「向量并集 ⇔ validator 全集」双向相等以前靠人工维护 index.ts 的 import 表，插件加不进去
 * （PLUGIN.md §3：插件只加文件不改中央源码），现在由本生成器按目录发现并渲染登记表。
 */
export function readWireVectorOwners(
  gameplays: readonly GameplayDescriptor[],
  options: GameplayCodegenOptions = {},
): readonly string[] {
  const root = resolvedRoot(options);
  const dir = path.join(root, WIRE_VECTORS_DIR_RELATIVE);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    fail(WIRE_VECTORS_DIR_RELATIVE, "wire-vectors directory does not exist");
  }
  const required = ["core", ...gameplays.filter((gameplay) => gameplay.wire.c2s.length > 0).map((gameplay) => gameplay.id)]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const present = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && !WIRE_VECTORS_NON_SIDECAR.has(name))
    .map((name) => name.slice(0, -".ts".length))
    .sort();
  const missing = required.filter((owner) => !present.includes(owner));
  if (missing.length > 0) {
    fail(
      WIRE_VECTORS_DIR_RELATIVE,
      `missing wire vector sidecar(s): ${missing.map((owner) => `${owner}.ts`).join(", ")}. `
      + "每个声明了 C2S wire 的玩法（与 core）必须自带 apps/server/test/wire-vectors/<owner>.ts",
    );
  }
  const orphans = present.filter((owner) => !required.includes(owner));
  if (orphans.length > 0) {
    fail(
      WIRE_VECTORS_DIR_RELATIVE,
      `orphan wire vector sidecar(s) without a C2S wire owner: ${orphans.map((owner) => `${owner}.ts`).join(", ")}. `
      + "玩法删除时连它的 sidecar 一起删（uninstall 按锁删；手工删除也要一并删）",
    );
  }
  return required;
}

/** 向量登记表 `wire-vectors/index.generated.ts`：owner → sidecar default（两份 wire 测试经 index.ts façade 唯一消费）。 */
function renderWireVectorsIndex(owners: readonly string[]): string {
  const lines = [generatedHeader(WIRE_VECTORS_SOURCE_LABEL)];
  for (const owner of owners) lines.push(`import ${owner}Vectors from "./${owner}";`);
  lines.push(
    'import type { WireVectorFile } from "./vectorTypes";',
    "",
    "/** owner → sidecar default（core + 声明了 C2S wire 的玩法；新增玩法只新增 wire-vectors/<id>.ts 并重跑 codegen:gameplays）。 */",
    "export const WIRE_VECTOR_FILES: Readonly<Record<string, WireVectorFile>> = {",
    ...owners.map((owner) => `    ${owner}: ${owner}Vectors,`),
    "};",
    "",
  );
  return lines.join("\n");
}

/** 全部产物（相对仓根路径 → 内容），键按路径稳定排序。 */
export function renderGameplayArtifacts(
  gameplays: readonly GameplayDescriptor[],
  core: CoreWireNames,
  clientModules: readonly ClientGameplayModule[],
  serverModules: readonly ServerGameplayModule[],
  wireVectorOwners: readonly string[],
): ReadonlyMap<string, string> {
  const artifacts = new Map<string, string>();
  artifacts.set(SHARED_WIRE_CATALOG_RELATIVE, renderWireCatalog(gameplays, core));
  artifacts.set(WIRE_VECTORS_INDEX_RELATIVE, renderWireVectorsIndex(wireVectorOwners));
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
  const modeIds = renderSharedModeIds(wireExposedGameplays(gameplays));
  assertWireExposedClosure(gameplays, modeIds);
  artifacts.set(SHARED_MODE_IDS_RELATIVE, modeIds);
  artifacts.set(SHARED_CATALOG_RELATIVE, renderSharedCatalog(gameplays));
  artifacts.set(SHARED_INDEX_RELATIVE, renderSharedIndex(gameplays));
  artifacts.set(SERVER_AGGREGATE_RELATIVE, renderServerAggregate(gameplays));
  artifacts.set(CLIENT_CATALOG_RELATIVE, renderClientCatalog(gameplays, clientModules));
  assertModuleSetsAligned(clientModules, serverModules);
  artifacts.set(SERVER_CATALOG_RELATIVE, renderServerCatalog(serverModules));
  return new Map([...artifacts.entries()].sort(([left], [right]) => (left < right ? -1 : 1)));
}

/** 三端一致闸：客户端 module 装配集与服务端 mode 装配集必须精确同集（两者都 = canonical）。 */
function assertModuleSetsAligned(
  clientModules: readonly ClientGameplayModule[],
  serverModules: readonly ServerGameplayModule[],
): void {
  const client = clientModules.map((module) => module.id).sort();
  const server = serverModules.map((module) => module.id).sort();
  if (client.length !== server.length || client.some((id, index) => id !== server[index])) {
    fail(
      SERVER_CATALOG_RELATIVE,
      `客户端 module 装配集 [${client.join(", ")}] 与服务端 mode 装配集 [${server.join(", ")}] 不同集`,
    );
  }
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
      gameplay.sourceDir,
      `contract digest changed but modeVersion did not increase (kept ${gameplay.manifest.modeVersion}, `
      + `previous ${record.modeVersion}). Bump modeVersion in ${gameplay.sourceDir}/manifest.json`,
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
  const { stale, missing, extra } = diffArtifacts(
    root,
    renderGameplayArtifacts(
      gameplays,
      readCoreWireNames(options),
      readClientGameplayModules(gameplays, options),
      readServerGameplayModules(gameplays, options),
      readWireVectorOwners(gameplays, options),
    ),
  );
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

  const expected = renderGameplayArtifacts(
    gameplays,
    readCoreWireNames(options),
    readClientGameplayModules(gameplays, options),
    readServerGameplayModules(gameplays, options),
    readWireVectorOwners(gameplays, options),
  );
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
