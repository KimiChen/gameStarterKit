/**
 * codegen:gameplays 全闸（阶段 2a 单向门本体）。
 *
 * 判别力自 room-state-codegen.test.ts（已删除）整体迁移：freshness 对真仓、mkdtemp 隔离根、
 * --check 只读字节断言、manifest/state 反例矩阵、lifecycle 断言组、serverOnly 闸、
 * validator exact keys == 装饰器 keys、lifecycle 不泄 shared；并新增 manifest JSON Schema 反例、
 * digest/modeVersion 闸、--allow-delete 删除保护、fixture mode 增量与 client catalog freshness。
 * ⚠ 本文件的值导入也把生成器自身的 .ts 纳入 tsc（§5.4 的先例形态）。
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";
import {
  GAMEPLAY_CATALOG,
  GameplayModeId,
  ROOM_STATE_VALIDATORS,
  validateRoomStateForMode,
  type IGameRoomState,
  type IIdleRoomState,
} from "@game/shared";
import {
  createRoomPlayerForMode,
  createRoomStateForMode,
  GameRoomState,
  IdlePlayerState,
  IdleRoomState,
  PlayerState,
  ROOM_STATE_PLAYER_CONSTRUCTORS,
  ROOM_STATE_ROOT_CONSTRUCTORS,
} from "../src/rooms/schema/GameRoomState";
import {
  assertGameplayArtifactsFresh,
  parseCli,
  readClientGameplayModules,
  readCoreWireNames,
  readGameplayDescriptors,
  readWireVectorOwners,
  readServerGameplayModules,
  renderGameplayArtifacts,
  wireExposedGameplays,
  writeGameplayArtifacts,
  type GameplayCodegenOptions,
} from "../tools/gameplay-codegen/lib";
import { parseGameplayManifest } from "../tools/gameplay-codegen/manifestSchema";
import { parseGameplayStateDescriptor, renderSharedStateModule } from "../tools/gameplay-codegen/stateRenderer";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCHEMA_DIR = path.join(REPOSITORY_ROOT, "apps/shared/schema/gameplays");
const PLUGINS_DIR = path.join(REPOSITORY_ROOT, "apps/plugins");
const KITS_DIR = path.join(REPOSITORY_ROOT, "apps/kits");
/**
 * 玩法单源目录：schema 目录的每个子目录 ∪ 插件目录里带 gameplay/ 的插件（PLUGIN.md §5.5 阶段 1）
 * ∪ kit 目录里 gameplays/ 的每个子目录（docs/KIT.md §7 第三发现根，id = modeId）。
 */
function gameplaySourceDirs(): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const entry of fs.readdirSync(SCHEMA_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) out.set(entry.name, `apps/shared/schema/gameplays/${entry.name}`);
  }
  if (fs.existsSync(PLUGINS_DIR)) {
    for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(PLUGINS_DIR, entry.name, "gameplay", "manifest.json"))) out.set(entry.name, `apps/plugins/${entry.name}/gameplay`);
    }
  }
  if (fs.existsSync(KITS_DIR)) {
    for (const kit of fs.readdirSync(KITS_DIR, { withFileTypes: true })) {
      const gameplaysDir = path.join(KITS_DIR, kit.name, "gameplays");
      if (!kit.isDirectory() || !fs.existsSync(gameplaysDir)) continue;
      for (const mode of fs.readdirSync(gameplaysDir, { withFileTypes: true })) {
        if (mode.isDirectory() && fs.existsSync(path.join(gameplaysDir, mode.name, "manifest.json"))) out.set(mode.name, `apps/kits/${kit.name}/gameplays/${mode.name}`);
      }
    }
  }
  return out;
}
const GAMEPLAY_SOURCES = gameplaySourceDirs();
function sourceDirOf(id: string): string {
  const relative = GAMEPLAY_SOURCES.get(id);
  if (!relative) throw new Error(`unknown gameplay id in fixture: ${id}`);
  return path.join(REPOSITORY_ROOT, relative);
}

const SHARED_STATE_DIR = "apps/shared/src/gameplays/generated/state";
const SERVER_SCHEMA_DIR = "apps/server/src/rooms/schema/generated";
const WIRE_VECTORS_DIR = "apps/server/test/wire-vectors";
const WIRE_VECTORS_INDEX = `${WIRE_VECTORS_DIR}/index.generated.ts`;
/** 真仓玩法 id 全集 = 两个发现根（⛔ 不硬编码：插件玩法进来不得需要改本测试）。 */
const EXPECTED_GAMEPLAY_IDS = [...GAMEPLAY_SOURCES.keys()].sort();
const SHARED_CATALOG = "apps/shared/src/gameplays/catalog.generated.ts";
const SHARED_INDEX = "apps/shared/src/gameplays/index.ts";
const SHARED_WIRE_CATALOG = "apps/shared/src/gameplays/generated/wire-catalog.generated.ts";
const SERVER_AGGREGATE = "apps/server/src/rooms/schema/GameRoomState.ts";
const CLIENT_CATALOG = "apps/client/src/gameplay/catalog.generated.ts";
const CLIENT_MODES_DIR = "apps/client/src/gameplay/modes";
const SERVER_CATALOG = "apps/server/src/rooms/modes/catalog.generated.ts";
const SERVER_MODES_DIR = "apps/server/src/rooms/modes";
const SHARED_MODE_IDS = "apps/shared/src/gameplays/generated/modeIds.generated.ts";

/** writeGameplayArtifacts 的产物清单（相对仓根，路径排序与实现一致）。 */
/** fixture 首次 --write 的全部产物：按真仓玩法集派生（⛔ 不硬编码 id），排序与生成器一致（路径字符串序）。 */
const FIXTURE_ARTIFACTS = [
  CLIENT_CATALOG,
  SERVER_CATALOG,
  SERVER_AGGREGATE,
  ...EXPECTED_GAMEPLAY_IDS.map((id) => `${SERVER_SCHEMA_DIR}/${id}.ts`),
  WIRE_VECTORS_INDEX,
  SHARED_CATALOG,
  SHARED_MODE_IDS,
  ...EXPECTED_GAMEPLAY_IDS.map((id) => `${SHARED_STATE_DIR}/${id}.ts`),
  SHARED_WIRE_CATALOG,
  SHARED_INDEX,
].sort((left, right) => (left < right ? -1 : 1));

type MutableField = Record<string, unknown>;
type MutableType = {
  name: string;
  sharedName: string;
  validatorName: string;
  defaultPath: string;
  fields: MutableField[];
  serverOnly: MutableField[];
};
type MutableState = {
  schemaVersion: number;
  root: string;
  types: MutableType[];
  [key: string]: unknown;
};
type MutableManifest = Record<string, unknown>;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function stateFixture(id: string): MutableState {
  return readJson<MutableState>(path.join(sourceDirOf(id), "state.json"));
}

function manifestFixture(id: string): MutableManifest {
  return readJson<MutableManifest>(path.join(sourceDirOf(id), "manifest.json"));
}

function stateType(state: MutableState, name: string): MutableType {
  const result = state.types.find((type) => type.name === name);
  assert.ok(result, `missing fixture type ${name}`);
  return result;
}

function typeField(type: MutableType, name: string): MutableField {
  const result = type.fields.find((field) => field.name === name);
  assert.ok(result, `missing fixture field ${type.name}.${name}`);
  return result;
}

function assertStateError(id: string, change: (state: MutableState) => void, pattern: RegExp): void {
  const state = stateFixture(id);
  change(state);
  assert.throws(() => parseGameplayStateDescriptor(state), pattern);
}

/** 真仓 canonical 玩法（manifest.wireExposed !== false）：客户端 module 与服务端 mode 必须同集存在。 */
function canonicalGameplayIds(): readonly string[] {
  return EXPECTED_GAMEPLAY_IDS.filter((id) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDirOf(id), "manifest.json"), "utf8")) as { wireExposed?: boolean };
    return manifest.wireExposed !== false;
  });
}

function createFixture(): { readonly root: string; readonly options: GameplayCodegenOptions } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gameplay-codegen-"));
  fs.cpSync(SCHEMA_DIR, path.join(root, "apps/shared/schema/gameplays"), { recursive: true });
  // 插件 / kit 玩法单源：按各自目录形态复制（apps/plugins/<id>/gameplay/、apps/kits/<kitId>/gameplays/<modeId>/），
  // 生成器的第二、第三个发现根。
  for (const [id, relative] of GAMEPLAY_SOURCES) {
    if (relative.startsWith("apps/shared/schema/gameplays/")) continue;
    fs.cpSync(sourceDirOf(id), path.join(root, relative), { recursive: true });
    // kit 的 mode 还要带上所属 kit 的 kit.json：第三发现根对「有 gameplays/ 没 kit.json 的目录」fail-closed。
    const kitMatch = /^apps\/kits\/([^/]+)\//u.exec(relative);
    if (kitMatch) {
      fs.copyFileSync(path.join(KITS_DIR, kitMatch[1], "kit.json"), path.join(root, "apps/kits", kitMatch[1], "kit.json"));
    }
  }
  // wire catalog 的两个额外单源：core 消息名表（protocol/messages.ts）与各玩法手写 wire.ts。
  fs.mkdirSync(path.join(root, "apps/shared/src/protocol"), { recursive: true });
  fs.copyFileSync(
    path.join(REPOSITORY_ROOT, "apps/shared/src/protocol/messages.ts"),
    path.join(root, "apps/shared/src/protocol/messages.ts"),
  );
  // 阶段 9：client catalog 的两个额外单源——canonical GameplayModeId façade（protocol/rooms.ts，
  // 真源已是 manifest.wireExposed）与各玩法客户端 module（gameplay/modes/<id>/index.ts，语法级校验）。
  fs.copyFileSync(
    path.join(REPOSITORY_ROOT, "apps/shared/src/protocol/rooms.ts"),
    path.join(root, "apps/shared/src/protocol/rooms.ts"),
  );
  // 各玩法手写 shared 模块（wire.ts / ruleset.ts）与 wire 向量 sidecar：按真仓玩法集发现（⛔ 不硬编码 id——
  // 插件玩法进来不得需要改本 fixture）。ruleset 是 state.json enumSource:"gameplay" 的硬依赖；
  // sidecar 由生成器按「声明了 C2S wire 的玩法 + core」双向对齐，真仓里恰好每个 c2s owner 一份。
  fs.mkdirSync(path.join(root, "apps/server/test/wire-vectors"), { recursive: true });
  fs.copyFileSync(
    path.join(REPOSITORY_ROOT, "apps/server/test/wire-vectors/core.ts"),
    path.join(root, "apps/server/test/wire-vectors/core.ts"),
  );
  for (const id of EXPECTED_GAMEPLAY_IDS) {
    for (const name of ["wire.ts", "ruleset.ts"]) {
      const file = path.join(REPOSITORY_ROOT, "apps/shared/src/gameplays", id, name);
      if (!fs.existsSync(file)) continue;
      fs.mkdirSync(path.join(root, "apps/shared/src/gameplays", id), { recursive: true });
      fs.copyFileSync(file, path.join(root, "apps/shared/src/gameplays", id, name));
    }
    const vectors = path.join(REPOSITORY_ROOT, "apps/server/test/wire-vectors", `${id}.ts`);
    if (fs.existsSync(vectors)) fs.copyFileSync(vectors, path.join(root, "apps/server/test/wire-vectors", `${id}.ts`));
  }
  // client module / server mode：canonical（manifest.wireExposed）∩ modes/ 目录必须双向同集——
  // fixture 复刻真仓约束，canonical 玩法的两端装配件都复制（语法级校验，不解析 import）。
  for (const id of canonicalGameplayIds()) {
    fs.mkdirSync(path.join(root, CLIENT_MODES_DIR, id), { recursive: true });
    fs.copyFileSync(path.join(REPOSITORY_ROOT, CLIENT_MODES_DIR, id, "index.ts"), path.join(root, CLIENT_MODES_DIR, id, "index.ts"));
    fs.mkdirSync(path.join(root, SERVER_MODES_DIR, id), { recursive: true });
    fs.copyFileSync(path.join(REPOSITORY_ROOT, SERVER_MODES_DIR, id, "index.ts"), path.join(root, SERVER_MODES_DIR, id, "index.ts"));
  }
  return { root, options: { repositoryRoot: root } };
}

function writeFixtureJson(root: string, relative: string, value: unknown): void {
  fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readFixtureText(root: string, relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

// ── TypeScript AST 判据（迁移自旧测试，逐产物核对 exact keys 与装饰器）────────

type ServerClassFields = {
  readonly decorated: readonly string[];
  readonly undecorated: readonly string[];
};

function propertyName(member: ts.PropertyDeclaration): string | null {
  return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : null;
}

function isWireDecorator(decorator: ts.Decorator): boolean {
  const expression = decorator.expression;
  return ts.isCallExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "type";
}

function serverClassFields(source: string): ReadonlyMap<string, ServerClassFields> {
  const sourceFile = ts.createSourceFile("schema.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const result = new Map<string, ServerClassFields>();
  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) continue;
    const decorated: string[] = [];
    const undecorated: string[] = [];
    for (const member of statement.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      const name = propertyName(member);
      if (!name) continue;
      const decorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) ?? [] : [];
      (decorators.some(isWireDecorator) ? decorated : undecorated).push(name);
    }
    result.set(statement.name.text, { decorated, undecorated });
  }
  return result;
}

function literalStringArray(expression: ts.Expression | undefined): readonly string[] | null {
  if (!expression || !ts.isArrayLiteralExpression(expression)) return null;
  const values: string[] = [];
  for (const element of expression.elements) {
    if (!ts.isStringLiteral(element)) return null;
    values.push(element.text);
  }
  return values;
}

function sharedValidatorKeys(source: string): ReadonlyMap<string, readonly string[]> {
  const sourceFile = ts.createSourceFile("state.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const result = new Map<string, readonly string[]>();
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
    let keys: readonly string[] | null = null;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "assertExactKeys") {
        const candidate = literalStringArray(node.arguments[1]);
        if (!candidate) throw new Error(`non-literal assertExactKeys in ${statement.name?.text ?? "validator"}`);
        if (keys !== null) throw new Error(`duplicate assertExactKeys in ${statement.name?.text ?? "validator"}`);
        keys = candidate;
      }
      ts.forEachChild(node, visit);
    };
    visit(statement.body);
    if (keys !== null) result.set(statement.name.text, keys);
  }
  return result;
}

// ── 第三 mode 夹具（增量断言组用；类型名/符号名与既有两 mode 全不重合）────────

function puzzleManifest(): MutableManifest {
  return {
    schemaVersion: 1,
    id: "puzzle",
    constantName: "Puzzle",
    modeVersion: 1,
    maxPlayers: 6,
    // codegen 夹具默认 ⛔ 不进对外 wire 枚举：与 dropInFixture/privateFixture 同口径，
    // 这样增量断言组不必为一个只测生成器的 mode 造客户端 module。
    // 「新增 canonical 玩法」的退出条件测试单独把它翻成 true。
    wireExposed: false,
    profiles: [],
  };
}

function puzzleState(): MutableState {
  return {
    schemaVersion: 1,
    root: "PuzzleRoomState",
    types: [
      {
        name: "PuzzlePlayerState",
        sharedName: "IPuzzlePlayerState",
        validatorName: "validatePuzzlePlayerState",
        defaultPath: "puzzlePlayer",
        fields: [
          { name: "id", kind: "string", default: "", minLength: 1, maxLength: 64 },
          { name: "name", kind: "string", default: "", minLength: 1, maxLength: 128 },
        ],
        serverOnly: [],
      },
      {
        name: "PuzzleRoomState",
        sharedName: "IPuzzleRoomState",
        validatorName: "validatePuzzleRoomState",
        defaultPath: "puzzleState",
        fields: [
          { name: "tick", kind: "integer", default: 0, min: 0 },
          {
            name: "phase",
            kind: "enum",
            enumObject: "GamePhase",
            enumType: "GamePhaseType",
            members: ["Waiting", "Playing", "Settle"],
            default: "Waiting",
            errorCode: "STATE_PHASE",
          },
          { name: "matchId", kind: "string", default: "", minLength: 0, maxLength: 128 },
          {
            name: "players",
            kind: "map",
            valueType: "PuzzlePlayerState",
            errorCode: "STATE_PLAYERS",
            key: { field: "id", errorCode: "STATE_PLAYER_ID" },
          },
        ],
        serverOnly: [],
      },
    ],
  };
}

function addFixtureMode(root: string, id: string, manifest: MutableManifest, state: MutableState): void {
  const dir = path.join(root, "apps/shared/schema/gameplays", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

// ── freshness（真仓 + 隔离根）───────────────────────────────────────────────

test("checked-in gameplay artifacts are fresh", () => {
  assert.doesNotThrow(() => assertGameplayArtifactsFresh({ repositoryRoot: REPOSITORY_ROOT }));
});

test("玩法自有 shared 模块自动进 barrel：新增手写模块零框架改动，*.generated.ts 排除在导出面外", () => {
  const fixture = createFixture();
  try {
    const dir = path.join(fixture.root, "apps/shared/src/gameplays/idle");
    // 玩法往自己目录里放一个手写模块 + 一个生成数据模块，⛔ 不碰生成器、manifest 或任何中央清单。
    fs.writeFileSync(path.join(dir, "cosmetics.ts"), "export const IDLE_SKIN = 1;\n", "utf8");
    fs.writeFileSync(path.join(dir, "palette.generated.ts"), "export const IDLE_PALETTE_DATA = [];\n", "utf8");

    const gameplays = readGameplayDescriptors(fixture.options);
    const artifacts = renderGameplayArtifacts(
      gameplays,
      readCoreWireNames(fixture.options),
      readClientGameplayModules(gameplays, fixture.options),
      readServerGameplayModules(gameplays, fixture.options),
      readWireVectorOwners(gameplays, fixture.options),
    );
    const barrel = artifacts.get("apps/shared/src/gameplays/index.ts");
    assert.ok(barrel);
    assert.ok(barrel.includes('export * from "./idle/cosmetics";'), `手写模块必须自动进 barrel：\n${barrel}`);
    assert.equal(
      barrel.includes("palette.generated"),
      false,
      "生成数据模块 ⛔ 不进公共导出面（只由同目录手写 façade 消费）",
    );
    // 依赖序：ruleset → wire → 其余手写模块字母序 → generated state，产物字节必须稳定。
    const idleLines = barrel.split("\n").filter((line) => line.includes('"./idle/') || line.includes('state/idle'));
    assert.deepEqual(idleLines, [
      'export * from "./idle/wire";',
      'export * from "./idle/cosmetics";',
      'export * from "./generated/state/idle";',
    ]);
    // 生成物身份（contractDigest）⛔ 不受玩法自有模块影响——否则加一个皮肤表就要 bump modeVersion。
    const idle = gameplays.find((gameplay) => gameplay.id === "idle");
    assert.equal(idle?.contractDigest, GAMEPLAY_CATALOG.idle.contractDigest);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("catalog contractDigest 就是 sha256(manifest + NUL + state + NUL + wire)，⛔ 不是另一套口径", () => {
  for (const id of ["ballMove", "idle"] as const) {
    const wireFile = path.join(REPOSITORY_ROOT, "apps/shared/src/gameplays", id, "wire.ts");
    const digest = crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(sourceDirOf(id), "manifest.json")))
      .update("\0")
      .update(fs.readFileSync(path.join(sourceDirOf(id), "state.json")))
      .update("\0")
      .update(fs.existsSync(wireFile) ? fs.readFileSync(wireFile) : Buffer.alloc(0))
      .digest("hex");
    assert.equal(GAMEPLAY_CATALOG[id].contractDigest, digest);
  }
});

test("freshness check is read-only and fails after a descriptor field is added", () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(writeGameplayArtifacts(fixture.options), {
      changed: [...FIXTURE_ARTIFACTS],
      deleted: [],
    });
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
    const originalShared = readFixtureText(fixture.root, `${SHARED_STATE_DIR}/ballMove.ts`);
    const originalServer = readFixtureText(fixture.root, `${SERVER_SCHEMA_DIR}/ballMove.ts`);

    const changedState = stateFixture("ballMove");
    stateType(changedState, "PlayerState").fields.push({
      name: "debugWire",
      kind: "boolean",
      default: false,
      description: "Fixture-only generated field",
    });
    writeFixtureJson(fixture.root, "apps/shared/schema/gameplays/ballMove/state.json", changedState);
    // digest 变了 ⇒ 同批必须 bump modeVersion，否则下面的重写会被 digest 闸拦住（单独有用例钉闸）
    const changedManifest = manifestFixture("ballMove");
    changedManifest.modeVersion = Number(changedManifest.modeVersion) + 1;
    writeFixtureJson(fixture.root, "apps/shared/schema/gameplays/ballMove/manifest.json", changedManifest);

    assert.throws(
      () => assertGameplayArtifactsFresh(fixture.options),
      new RegExp(
        "not fresh — stale: apps/client/src/gameplay/catalog\\.generated\\.ts, "
        + "apps/server/src/rooms/schema/generated/ballMove\\.ts, "
        + "apps/shared/src/gameplays/catalog\\.generated\\.ts, "
        + "apps/shared/src/gameplays/generated/state/ballMove\\.ts",
        "u",
      ),
    );
    assert.equal(readFixtureText(fixture.root, `${SHARED_STATE_DIR}/ballMove.ts`), originalShared);
    assert.equal(readFixtureText(fixture.root, `${SERVER_SCHEMA_DIR}/ballMove.ts`), originalServer);

    const rewrite = writeGameplayArtifacts(fixture.options);
    assert.deepEqual(rewrite.deleted, []);
    assert.ok(rewrite.changed.includes(`${SHARED_STATE_DIR}/ballMove.ts`));
    assert.match(readFixtureText(fixture.root, `${SHARED_STATE_DIR}/ballMove.ts`), /debugWire: boolean/);
    assert.match(
      readFixtureText(fixture.root, `${SERVER_SCHEMA_DIR}/ballMove.ts`),
      /@type\("boolean"\) debugWire: boolean = false/,
    );
    assert.match(readFixtureText(fixture.root, SHARED_CATALOG), new RegExp(`modeVersion: ${changedManifest.modeVersion},`));
    assert.match(readFixtureText(fixture.root, CLIENT_CATALOG), new RegExp(`modeVersion: ${changedManifest.modeVersion},`));
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("client catalog 与 extra 产物同受 freshness 守门（stale/extra 都点名）", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    // client catalog 被手改 ⇒ stale 点名它（客户端产物的 freshness 由本测试文件守门，见 §5.4 登记的偏差）
    fs.appendFileSync(path.join(fixture.root, CLIENT_CATALOG), "// drift\n");
    assert.throws(
      () => assertGameplayArtifactsFresh(fixture.options),
      /stale: apps\/client\/src\/gameplay\/catalog\.generated\.ts/,
    );
    writeGameplayArtifacts(fixture.options);
    // 生成器独占目录里的陌生文件 ⇒ extra 点名；--write 也拒绝静默吞掉
    const stray = path.join(fixture.root, SHARED_STATE_DIR, "stray.ts");
    fs.writeFileSync(stray, "export {};\n", "utf8");
    assert.throws(() => assertGameplayArtifactsFresh(fixture.options), /extra: .*stray\.ts/);
    assert.throws(() => writeGameplayArtifacts(fixture.options), /unexpected file in a generator-owned directory/);
    fs.rmSync(stray);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
    // 三态的第三种：产物文件被删 ⇒ missing 点名
    fs.rmSync(path.join(fixture.root, `${SERVER_SCHEMA_DIR}/idle.ts`));
    assert.throws(
      () => assertGameplayArtifactsFresh(fixture.options),
      /missing: apps\/server\/src\/rooms\/schema\/generated\/idle\.ts/,
    );
    writeGameplayArtifacts(fixture.options);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── digest / modeVersion 闸 ─────────────────────────────────────────────────

test("契约 digest 变化而 modeVersion 未增：writer 与只读闸都必须拒绝；bump 后放行", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    const before = readFixtureText(fixture.root, SHARED_CATALOG);

    const changedState = stateFixture("idle");
    typeField(stateType(changedState, "IdleRoomState"), "pulseGoal").description = "Pulses required to win (fixture)";
    writeFixtureJson(fixture.root, "apps/shared/schema/gameplays/idle/state.json", changedState);

    const gate = /contract digest changed but modeVersion did not increase/;
    assert.throws(() => writeGameplayArtifacts(fixture.options), gate);
    assert.throws(() => assertGameplayArtifactsFresh(fixture.options), gate);
    // 闸必须只读：catalog 保持原字节
    assert.equal(readFixtureText(fixture.root, SHARED_CATALOG), before);

    const bumped = manifestFixture("idle");
    bumped.modeVersion = Number(bumped.modeVersion) + 1;
    writeFixtureJson(fixture.root, "apps/shared/schema/gameplays/idle/manifest.json", bumped);
    assert.ok(writeGameplayArtifacts(fixture.options).changed.length > 0);
    assert.match(readFixtureText(fixture.root, SHARED_CATALOG), new RegExp(`modeVersion: ${bumped.modeVersion},`));
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── 删除保护（--allow-delete）───────────────────────────────────────────────

test("catalog 里已有的 mode 目录消失：writer 必须拒绝；--allow-delete 放行且产物无残留", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    fs.rmSync(path.join(fixture.root, "apps/shared/schema/gameplays/idle"), { recursive: true });

    assert.throws(
      () => writeGameplayArtifacts(fixture.options),
      /source directories are gone: idle.*--allow-delete <id>/,
    );
    // 拒绝时不得动盘：idle 产物仍在
    assert.ok(fs.existsSync(path.join(fixture.root, `${SHARED_STATE_DIR}/idle.ts`)));

    // 删玩法要连它的 wire 向量 sidecar 一起删（uninstall 按锁就是这么做的）；留着即孤儿 → 生成器点名拒绝。
    assert.throws(
      () => writeGameplayArtifacts({ ...fixture.options, allowDelete: ["idle"] }),
      /orphan wire vector sidecar\(s\).*idle\.ts/u,
    );
    fs.rmSync(path.join(fixture.root, "apps/server/test/wire-vectors/idle.ts"));
    const result = writeGameplayArtifacts({ ...fixture.options, allowDelete: ["idle"] });
    assert.deepEqual(result.deleted, [`${SERVER_SCHEMA_DIR}/idle.ts`, `${SHARED_STATE_DIR}/idle.ts`]);
    assert.equal(fs.existsSync(path.join(fixture.root, `${SHARED_STATE_DIR}/idle.ts`)), false);
    assert.equal(fs.existsSync(path.join(fixture.root, `${SERVER_SCHEMA_DIR}/idle.ts`)), false);
    assert.doesNotMatch(readFixtureText(fixture.root, SHARED_CATALOG), /"idle"/);
    assert.doesNotMatch(readFixtureText(fixture.root, SHARED_INDEX), /idle/);
    assert.doesNotMatch(readFixtureText(fixture.root, SERVER_AGGREGATE), /IdleRoomState/);
    assert.doesNotMatch(readFixtureText(fixture.root, CLIENT_CATALOG), /"idle"/);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── fixture mode 增量（阶段 2a 的「新增玩法只加新目录」退出条件）──────────────

test("新增第三个 mode 目录：三端产物 + catalog 收录，另两 mode 的产物字节不动", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    const untouched = [
      `${SHARED_STATE_DIR}/ballMove.ts`,
      `${SHARED_STATE_DIR}/idle.ts`,
      `${SERVER_SCHEMA_DIR}/ballMove.ts`,
      `${SERVER_SCHEMA_DIR}/idle.ts`,
    ];
    const snapshot = new Map(untouched.map((relative) => [relative, readFixtureText(fixture.root, relative)]));

    addFixtureMode(fixture.root, "puzzle", puzzleManifest(), puzzleState());
    const result = writeGameplayArtifacts(fixture.options);
    assert.ok(result.changed.includes(`${SHARED_STATE_DIR}/puzzle.ts`));
    assert.ok(result.changed.includes(`${SERVER_SCHEMA_DIR}/puzzle.ts`));
    for (const relative of untouched) {
      assert.equal(readFixtureText(fixture.root, relative), snapshot.get(relative), `${relative} 必须保持字节不动`);
    }
    // manifest.maxPlayers 注入生成物字面量（provenance 注释 + 值都以 manifest 为准）
    const puzzleShared = readFixtureText(fixture.root, `${SHARED_STATE_DIR}/puzzle.ts`);
    assert.match(puzzleShared, /manifest\.json \(maxPlayers\)/);
    assert.match(puzzleShared, /const MAX_PLAYERS = 6;/);
    // catalog / index / 聚合器都收录第三 mode
    assert.match(readFixtureText(fixture.root, SHARED_CATALOG), /"puzzle": validatePuzzleRoomState,/);
    assert.match(readFixtureText(fixture.root, SHARED_CATALOG), /maxPlayers: 6,/);
    assert.match(readFixtureText(fixture.root, SHARED_INDEX), /export \* from "\.\/generated\/state\/puzzle";/);
    assert.match(readFixtureText(fixture.root, SERVER_AGGREGATE), /"puzzle": PuzzleRoomState,/);
    assert.match(readFixtureText(fixture.root, CLIENT_CATALOG), /"puzzle"/);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── K0：kit 第三发现根 apps/kits/<kitId>/gameplays/<modeId>/（docs/KIT.md §2/§7） ──

/** puzzle 夹具改名成 kit 自带 mode（KfixArena），⛔ 不与 puzzle 共用符号名。 */
function kfixArenaFixture(): { manifest: MutableManifest; state: MutableState } {
  const rename = (text: string): string => text.replace(/Puzzle/gu, "KfixArena").replace(/puzzle/gu, "kfixArena");
  return {
    manifest: JSON.parse(rename(JSON.stringify(puzzleManifest()))) as MutableManifest,
    state: JSON.parse(rename(JSON.stringify(puzzleState()))) as MutableState,
  };
}

/** 最小 kit.json（gameplay-codegen 只要求存在；modes ≡ gameplays/ 的闸在 codegen:plugins 侧）。 */
function addFixtureKitJson(root: string, kitId: string): void {
  const dir = path.join(root, "apps/kits", kitId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "kit.json"), `${JSON.stringify({ schemaVersion: 1, id: kitId }, null, 2)}\n`, "utf8");
}

function addFixtureKitMode(root: string, kitId: string, modeId: string, manifest: MutableManifest, state: MutableState): void {
  addFixtureKitJson(root, kitId);
  const dir = path.join(root, "apps/kits", kitId, "gameplays", modeId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

test("K0 kit：apps/kits/<kitId>/gameplays/<modeId>/ 是第三发现根——mode 进三端产物与 catalog，sourceDir 点名 kit 目录", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    const { manifest, state } = kfixArenaFixture();
    addFixtureKitMode(fixture.root, "kfix", "kfixArena", manifest, state);
    const descriptor = readGameplayDescriptors(fixture.options).find((gameplay) => gameplay.id === "kfixArena");
    assert.ok(descriptor, "kit 根下的 mode 必须被发现");
    assert.equal(descriptor.sourceDir, "apps/kits/kfix/gameplays/kfixArena");
    const result = writeGameplayArtifacts(fixture.options);
    assert.ok(result.changed.includes(`${SHARED_STATE_DIR}/kfixArena.ts`));
    assert.ok(result.changed.includes(`${SERVER_SCHEMA_DIR}/kfixArena.ts`));
    assert.match(readFixtureText(fixture.root, SHARED_CATALOG), /"kfixArena": validateKfixArenaRoomState,/u);
    assert.match(readFixtureText(fixture.root, SERVER_AGGREGATE), /"kfixArena": KfixArenaRoomState,/u);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
    // 目录名 === manifest.id 对 kit 根同样生效。
    manifest.id = "arena";
    addFixtureKitMode(fixture.root, "kfix", "kfixArena", manifest, state);
    assert.throws(() => readGameplayDescriptors(fixture.options),
      /apps\/kits\/kfix\/gameplays\/kfixArena\/manifest\.json: manifest\.id "arena" must equal its directory name "kfixArena"/u);
    // 有根则每个子目录都是 kit：没有 kit.json 的目录不得只凭 gameplays/ 就把 mode 生成进三端（单独跑 codegen:gameplays 也 fail-closed）。
    manifest.id = "kfixArena";
    addFixtureKitMode(fixture.root, "kfix", "kfixArena", manifest, state);
    fs.rmSync(path.join(fixture.root, "apps/kits/kfix/kit.json"));
    assert.throws(() => readGameplayDescriptors(fixture.options), /apps\/kits\/kfix: kit directory without kit\.json/u);
    fs.mkdirSync(path.join(fixture.root, "apps/kits/ghost"), { recursive: true });
    addFixtureKitJson(fixture.root, "kfix");
    assert.throws(() => readGameplayDescriptors(fixture.options), /apps\/kits\/ghost: kit directory without kit\.json/u, "没有 gameplays/ 的空 kit 目录同样拒绝");
    fs.rmSync(path.join(fixture.root, "apps/kits/ghost"), { recursive: true });
    assert.doesNotThrow(() => readGameplayDescriptors(fixture.options));
    // 根存在但不是目录：⛔ 不当作「根缺席」放行，也不抛裸 ENOTDIR。
    fs.rmSync(path.join(fixture.root, "apps/kits"), { recursive: true });
    fs.writeFileSync(path.join(fixture.root, "apps/kits"), "not a directory\n");
    assert.throws(() => readGameplayDescriptors(fixture.options), /apps\/kits: must be a directory/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("K0 kit：kit 自带的 modeId ⛔ 不得与任何包 id（apps/plugins ∪ apps/kits 目录名）大小写归一相等——点名 mode 与包", () => {
  const fixture = createFixture();
  try {
    const { manifest, state } = kfixArenaFixture();
    // 与自己所在 kit 同名
    fs.mkdirSync(path.join(fixture.root, "apps/kits/kfix"), { recursive: true });
    addFixtureKitMode(fixture.root, "kfix", "kfix", { ...manifest, id: "kfix" }, state);
    assert.throws(() => readGameplayDescriptors(fixture.options),
      /apps\/kits\/kfix\/gameplays\/kfix: kit "kfix" 的 mode id "kfix" 与包 id 大小写归一相等（apps\/kits\/kfix）/u);
    fs.rmSync(path.join(fixture.root, "apps/kits/kfix/gameplays/kfix"), { recursive: true });
    // 与某个插件包 id 大小写归一相等（snakecosmetic ⟷ apps/plugins/snakeCosmetic；真仓无同名玩法，故不是玩法 id 撞名先触发）。
    // fixture 只拷带 gameplay/ 的插件目录，snakeCosmetic 没有玩法——按真仓形态补一个空包目录（包 id 集只看目录名）。
    fs.mkdirSync(path.join(fixture.root, "apps/plugins/snakeCosmetic"), { recursive: true });
    addFixtureKitMode(fixture.root, "kfix", "snakecosmetic", { ...manifest, id: "snakecosmetic" }, state);
    assert.throws(() => readGameplayDescriptors(fixture.options),
      /kit "kfix" 的 mode id "snakecosmetic" 与包 id 大小写归一相等（apps\/plugins\/snakeCosmetic）/u);
    fs.rmSync(path.join(fixture.root, "apps/kits/kfix/gameplays/snakecosmetic"), { recursive: true });
    // 插件玩法 / 宿主玩法照旧：id 就等于包 id（snake、tally）——真仓 fixture 本身必须仍能读取。
    assert.doesNotThrow(() => readGameplayDescriptors(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── 单源目录所有权与跨 mode 唯一性 ──────────────────────────────────────────

test("目录名 === manifest.id，manifest+state 必须齐备，模式目录不收陌生文件", () => {
  const fixture = createFixture();
  try {
    const idleManifest = manifestFixture("idle");
    idleManifest.id = "idleRenamed";
    writeFixtureJson(fixture.root, "apps/shared/schema/gameplays/idle/manifest.json", idleManifest);
    assert.throws(
      () => readGameplayDescriptors(fixture.options),
      /manifest\.id "idleRenamed" must equal its directory name "idle"/,
    );
    writeFixtureJson(fixture.root, "apps/shared/schema/gameplays/idle/manifest.json", manifestFixture("idle"));

    fs.rmSync(path.join(fixture.root, "apps/shared/schema/gameplays/idle/state.json"));
    assert.throws(() => readGameplayDescriptors(fixture.options), /idle\/state\.json: missing required file/);
    writeFixtureJson(fixture.root, "apps/shared/schema/gameplays/idle/state.json", stateFixture("idle"));

    fs.writeFileSync(path.join(fixture.root, "apps/shared/schema/gameplays/idle/notes.md"), "x\n", "utf8");
    assert.throws(() => readGameplayDescriptors(fixture.options), /unexpected file\(s\): notes\.md/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("跨 mode 重名符号与重名 constantName 必须 fail——聚合 barrel 里会互相顶替", () => {
  const fixture = createFixture();
  try {
    // 直接复用 idle 的 state.json（类型名与 idle 完全同名）——按 id 排序 idle 先声明，zzClash 撞闸
    addFixtureMode(fixture.root, "zzClash", {
      schemaVersion: 1, id: "zzClash", constantName: "ZzClash", modeVersion: 1, maxPlayers: 4,
      wireExposed: false, profiles: [],
    }, stateFixture("idle"));
    assert.throws(
      () => readGameplayDescriptors(fixture.options),
      /symbol "IdlePlayerState" already owned by gameplay "idle"/,
    );
    fs.rmSync(path.join(fixture.root, "apps/shared/schema/gameplays/zzClash"), { recursive: true });

    const clashManifest = puzzleManifest();
    clashManifest.constantName = "Idle";
    addFixtureMode(fixture.root, "puzzle", clashManifest, puzzleState());
    assert.throws(
      () => readGameplayDescriptors(fixture.options),
      /constantName "Idle" already used by gameplay "idle"/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── manifest 反例矩阵（真实 JSON Schema：additionalProperties:false）─────────

test("manifest JSON Schema 拒绝多余键/缺键/坏类型/坏取值", () => {
  const base = manifestFixture("ballMove");
  assert.doesNotThrow(() => parseGameplayManifest(base));
  assert.throws(() => parseGameplayManifest({ ...base, legacy: true }), /manifest: unknown key\(s\): legacy/);
  const missing = { ...base } as MutableManifest;
  delete missing.constantName;
  assert.throws(() => parseGameplayManifest(missing), /manifest: missing key\(s\): constantName/);
  assert.throws(() => parseGameplayManifest({ ...base, schemaVersion: 2 }), /manifest\.schemaVersion: must be 1/);
  assert.throws(() => parseGameplayManifest({ ...base, modeVersion: "1" }), /manifest\.modeVersion: must be a safe integer/);
  assert.throws(() => parseGameplayManifest({ ...base, modeVersion: 0 }), /manifest\.modeVersion: must be >= 1/);
  assert.throws(() => parseGameplayManifest({ ...base, maxPlayers: 0 }), /manifest\.maxPlayers: must be >= 1/);
  assert.throws(() => parseGameplayManifest({ ...base, id: "bad mode" }), /manifest\.id: does not match pattern/);
  assert.throws(() => parseGameplayManifest({ ...base, constantName: "ballMove" }), /manifest\.constantName: does not match pattern/);
  assert.throws(() => parseGameplayManifest({ ...base, profiles: "private" }), /manifest\.profiles: must be an array/);
  assert.throws(() => parseGameplayManifest({ ...base, profiles: [1] }), /manifest\.profiles\[0\]: must be a string/);
  // profiles 是可选键（阶段 8 才消费），缺省按空数组归一化
  const withoutProfiles = { ...base } as MutableManifest;
  delete withoutProfiles.profiles;
  assert.deepEqual(parseGameplayManifest(withoutProfiles).profiles, []);
});

// ── state DSL 反例矩阵（迁移自旧测试）────────────────────────────────────────

test("state 拒绝 unknown shapes、非法字段类型、重复字段与非法值域", () => {
  assertStateError("ballMove", (state) => { state.legacySchema = true; }, /state: unknown key\(s\): legacySchema/);
  assertStateError("ballMove", (state) => { state.schemaVersion = 2; }, /only schemaVersion 1 is supported/);
  assertStateError("ballMove", (state) => {
    typeField(stateType(state, "PlayerState"), "id").wire = true;
  }, /unknown key\(s\): wire/);
  assertStateError("ballMove", (state) => {
    typeField(stateType(state, "PlayerState"), "id").kind = "uuid";
  }, /unsupported wire kind: uuid/);
  assertStateError("ballMove", (state) => {
    typeField(stateType(state, "PlayerState"), "alive").default = "true";
  }, /must be a boolean literal or constant reference/);
  assertStateError("ballMove", (state) => {
    const player = stateType(state, "PlayerState");
    player.fields.push({ ...player.fields[0] });
  }, /duplicate wire field: id/);
  assertStateError("ballMove", (state) => {
    const x = typeField(stateType(state, "PlayerState"), "x");
    x.min = 2;
    x.max = 1;
  }, /min must not exceed max/);
  // maxSizeConstant 已从 DSL 删除：容量只来自 manifest.maxPlayers，旧键按 unknown key 拒绝
  assertStateError("ballMove", (state) => {
    typeField(stateType(state, "GameRoomState"), "players").maxSizeConstant = "MAX_PLAYERS";
  }, /unknown key\(s\): maxSizeConstant/);
  assertStateError("ballMove", (state) => { state.root = "MissingRoomState"; }, /state\.root: missing root type: MissingRoomState/);
});

test("state 拒绝断裂的 map 与跨字段引用", () => {
  assertStateError("ballMove", (state) => {
    typeField(stateType(state, "GameRoomState"), "players").valueType = "MissingPlayerState";
  }, /players\.valueType: missing type: MissingPlayerState/);
  assertStateError("ballMove", (state) => {
    typeField(stateType(state, "PlayerState"), "hp").maxField = "missingMaxHp";
  }, /hp\.maxField: missing field: missingMaxHp/);
  assertStateError("ballMove", (state) => {
    typeField(stateType(state, "PlayerState"), "hp").maxField = "alive";
  }, /hp\.maxField: must reference a number\/integer field: alive/);
  assertStateError("ballMove", (state) => {
    const players = typeField(stateType(state, "GameRoomState"), "players");
    players.key = { field: "alive", errorCode: "STATE_PLAYER_ID" };
  }, /players\.key\.field: must reference a string field on PlayerState/);
});

test("server-only 字段拒绝暴露标记、碰撞、重复与不支持的 kind", () => {
  assertStateError("ballMove", (state) => {
    stateType(state, "PlayerState").serverOnly[0].wire = true;
  }, /serverOnly\[0\]: unknown key\(s\): wire/);
  assertStateError("ballMove", (state) => {
    stateType(state, "PlayerState").serverOnly[0].name = "id";
  }, /field collides with wire field: id/);
  assertStateError("ballMove", (state) => {
    const player = stateType(state, "PlayerState");
    player.serverOnly.push({ ...player.serverOnly[0] });
  }, /duplicate server-only field: dirX/);
  assertStateError("ballMove", (state) => {
    stateType(state, "PlayerState").serverOnly[0].kind = "string";
  }, /unsupported server-only kind: string/);
});

// ── 生成映射与运行时行为（真仓产物）─────────────────────────────────────────

test("generated root maps are frozen, type-safe and reject unknown modes", () => {
  // privateFixture：阶段 8 私房验收 fixture gameplay；dropInFixture：drop-in（自由加入）验收
  // fixture gameplay（catalog 全链收录，⛔ 都不进生产 mode registry）。
  // snake：Snake Off 玩法（S4 起 canonical + 生产 registry 登记）。
  assert.deepEqual(Object.keys(ROOM_STATE_VALIDATORS), EXPECTED_GAMEPLAY_IDS);
  assert.deepEqual(Object.keys(ROOM_STATE_ROOT_CONSTRUCTORS), EXPECTED_GAMEPLAY_IDS);
  // player 侧与 root 侧必须同集：任何「有 root 无 player」的玩法都会让按 mode 造 player
  // 的通用代码退回手写具名类。
  assert.deepEqual(Object.keys(ROOM_STATE_PLAYER_CONSTRUCTORS), Object.keys(ROOM_STATE_ROOT_CONSTRUCTORS));
  assert.deepEqual(Object.keys(GAMEPLAY_CATALOG), EXPECTED_GAMEPLAY_IDS);
  assert.equal(Object.isFrozen(ROOM_STATE_VALIDATORS), true);
  assert.equal(Object.isFrozen(ROOM_STATE_ROOT_CONSTRUCTORS), true);
  assert.equal(Object.isFrozen(ROOM_STATE_PLAYER_CONSTRUCTORS), true);

  const ballMove: GameRoomState = createRoomStateForMode("ballMove");
  const idle: IdleRoomState = createRoomStateForMode("idle");
  assert.ok(ballMove instanceof GameRoomState);
  assert.ok(idle instanceof IdleRoomState);
  const parsedBallMove: IGameRoomState = validateRoomStateForMode("ballMove", ballMove);
  const parsedIdle: IIdleRoomState = validateRoomStateForMode("idle", idle);
  assert.equal(parsedBallMove.phase, ballMove.phase);
  assert.equal(parsedIdle.pulseGoal, 3);

  assert.throws(
    () => createRoomStateForMode("missing-mode"),
    /unsupported gameplay mode: missing-mode/,
  );

  const ballMovePlayer: PlayerState = createRoomPlayerForMode("ballMove");
  const idlePlayer: IdlePlayerState = createRoomPlayerForMode("idle");
  assert.ok(ballMovePlayer instanceof PlayerState);
  assert.ok(idlePlayer instanceof IdlePlayerState);
  // 每个 player 都带 shell 依赖的生命周期字段（id/name），这是通用探针能用它的前提。
  assert.equal(typeof ballMovePlayer.id, "string");
  assert.equal(typeof idlePlayer.name, "string");
  assert.throws(
    () => createRoomPlayerForMode("missing-mode"),
    /unsupported gameplay mode: missing-mode/,
    "未知 mode 必须拒——静默返回 undefined 会让通用探针在运行期才炸",
  );
  assert.throws(
    () => validateRoomStateForMode("missing-mode", {}),
    /STATE_MODE/,
  );
});

test("generated validator keys exactly equal runtime decorated keys and exclude server-only fields", () => {
  const gameplays = readGameplayDescriptors({ repositoryRoot: REPOSITORY_ROOT });
  const artifacts = renderGameplayArtifacts(
    gameplays,
    readCoreWireNames({ repositoryRoot: REPOSITORY_ROOT }),
    readClientGameplayModules(gameplays, { repositoryRoot: REPOSITORY_ROOT }),
    readServerGameplayModules(gameplays, { repositoryRoot: REPOSITORY_ROOT }),
    readWireVectorOwners(gameplays, { repositoryRoot: REPOSITORY_ROOT }),
  );
  for (const gameplay of gameplays) {
    const shared = artifacts.get(`${SHARED_STATE_DIR}/${gameplay.id}.ts`);
    const server = artifacts.get(`${SERVER_SCHEMA_DIR}/${gameplay.id}.ts`);
    assert.ok(shared && server, `missing rendered artifacts for ${gameplay.id}`);
    const validators = sharedValidatorKeys(shared);
    const classes = serverClassFields(server);
    for (const type of gameplay.state.types) {
      const expectedWire = type.fields.map((field) => field.name);
      const classFields = classes.get(type.name);
      assert.ok(classFields, `missing generated class ${type.name}`);
      assert.deepEqual(validators.get(type.validatorName), expectedWire, `${type.validatorName} exact keys drifted`);
      assert.deepEqual(classFields.decorated, expectedWire, `${type.name} decorated keys drifted`);
      for (const internal of type.serverOnly) {
        assert.ok(classFields.undecorated.includes(internal.name), `${type.name}.${internal.name} must be undecorated`);
        assert.equal(expectedWire.includes(internal.name), false, `${type.name}.${internal.name} leaked into wire fields`);
        assert.doesNotMatch(shared, new RegExp(`\\b${internal.name}\\b`, "u"));
      }
    }
  }
});

test("map entry helpers are unique per owner type when roots share a field name", () => {
  const realGameplays = readGameplayDescriptors({ repositoryRoot: REPOSITORY_ROOT });
  const artifacts = renderGameplayArtifacts(
    realGameplays,
    readCoreWireNames({ repositoryRoot: REPOSITORY_ROOT }),
    readClientGameplayModules(realGameplays, { repositoryRoot: REPOSITORY_ROOT }),
    readServerGameplayModules(realGameplays, { repositoryRoot: REPOSITORY_ROOT }),
    readWireVectorOwners(realGameplays, { repositoryRoot: REPOSITORY_ROOT }),
  );
  const ballMove = artifacts.get(`${SHARED_STATE_DIR}/ballMove.ts`) ?? "";
  const idle = artifacts.get(`${SHARED_STATE_DIR}/idle.ts`) ?? "";
  assert.match(ballMove, /function entriesOfGameRoomStatePlayers\(/);
  assert.match(idle, /function entriesOfIdleRoomStatePlayers\(/);
  assert.doesNotMatch(ballMove, /function entriesOfPlayers\(/);
  assert.doesNotMatch(idle, /function entriesOfPlayers\(/);
  assert.match(ballMove, /const entries = entriesOfGameRoomStatePlayers\(value\.players/);
  assert.match(idle, /const entries = entriesOfIdleRoomStatePlayers\(value\.players/);
});

// ── root 生命周期字段断言（plan-v4 条目 4 阶段三，随生成器迁移原样保留）────────
//
// 通用 GameRoom shell 只读 root 的 tick/phase/matchId/players 与 player 的 id/name。
// 此前它用 `declare readonly state: GameRoomState` 声明这件事，那是一句谎：真实 root 由 mode
// 决定，IdleRoomState 只是恰好也有这些字段。⛔ 新增一个漏字段的 root，过去只在运行期读到
// undefined。下面把每种漏法都钉成 codegen 期失败。

test("root 漏掉任一生命周期字段必须在 codegen 期失败", () => {
  for (const field of ["tick", "phase", "matchId", "players"]) {
    assertStateError(
      "idle",
      (state) => {
        const root = stateType(state, "IdleRoomState");
        root.fields = root.fields.filter((candidate) => candidate.name !== field);
      },
      new RegExp(`root type must declare lifecycle field "${field}"`),
    );
  }
});

test("生命周期字段的 kind 不对同样必须失败——⛔ 只查名字不够", () => {
  // ⚠ 必须换成一个**本身合法**的字段：直接改 kind 会留下原 kind 的专属键（tick 的 min），
  // 那会先撞上 exactKeys，用例就测不到生命周期断言了。
  assertStateError(
    "idle",
    (state) => {
      const root = stateType(state, "IdleRoomState");
      root.fields = root.fields.map((field) => field.name === "tick"
        ? { name: "tick", kind: "string", default: "", minLength: 0, maxLength: 8 }
        : field);
    },
    /lifecycle field must be kind "integer", got "string"/,
  );
  assertStateError(
    "ballMove",
    (state) => {
      const root = stateType(state, "GameRoomState");
      root.fields = root.fields.map((field) => field.name === "matchId"
        ? { name: "matchId", kind: "integer", default: 0, min: 0 }
        : field);
    },
    /lifecycle field must be kind "string", got "integer"/,
  );
});

test("root 的 phase 必须是 GamePhase 本身，⛔ 「是个 enum」不够", () => {
  // 异枚举实测能通过「是个 enum」：生成的 root 是 `phase: PuzzlePhaseType = PuzzlePhase.Idle`，
  // 而聚合产物里 RoomStateLifecycle 仍写死 `phase: GamePhaseType`——两处 cast
  // （declare readonly state / as GameRoomState）让 typecheck 抓不到，运行期表现是
  // `state.phase !== GamePhase.Waiting` 恒真 → 每次 onJoin 都 GameAlreadyStarted，房间永久不可进。
  assertStateError(
    "idle",
    (state) => {
      const phase = typeField(stateType(state, "IdleRoomState"), "phase");
      phase.enumObject = "PuzzlePhase";
      phase.enumType = "PuzzlePhaseType";
      phase.members = ["Waiting", "Playing", "Settle"];
    },
    /root phase must use GamePhase\/GamePhaseType, got PuzzlePhase\/PuzzlePhaseType/,
  );
  // 只错 enumType 也必须被命中——⛔ 不能只查 enumObject
  assertStateError(
    "ballMove",
    (state) => { typeField(stateType(state, "GameRoomState"), "phase").enumType = "PuzzlePhaseType"; },
    /root phase must use GamePhase\/GamePhaseType/,
  );
});

test("enumSource:\"gameplay\" 的字段：shared 侧产物 import 指向该玩法自有 ruleset", () => {
  // 判别力：玩法自有枚举必须从 <id>/ruleset 进 shared 产物。若渲染无条件走 core，
  // 生成的 import 会指回 constants/game——那正是本轮要拆掉的中央耦合（снake 枚举
  // 曾把 70 行 Snake-only 符号钉在跨玩法常量文件里）。
  const state = parseGameplayStateDescriptor(stateFixture("snake"));
  const rendered = renderSharedStateModule("snake", 8, state, "fixture");
  // 玩法组：指向自有 ruleset，⛔ 不带扩展名（铁律 3）。
  assert.match(
    rendered,
    /^import \{ SnakeDeathCause, SnakeReliveReceiptState, SnakeRunEndReason, SnakeRunState, type SnakeDeathCauseType, type SnakeReliveReceiptStateType, type SnakeRunEndReasonType, type SnakeRunStateType \} from "\.\.\/\.\.\/snake\/ruleset";$/mu,
  );
  // core 组仍走中央常量，且 Snake 符号一个都不许再出现在这条 import 里。
  assert.match(rendered, /^import \{ GamePhase, type GamePhaseType \} from "\.\.\/\.\.\/\.\.\/constants\/game";$/mu);
  const coreImport = rendered.split("\n").find((line) => line.includes('"../../../constants/game"'));
  assert.ok(coreImport && !coreImport.includes("Snake"), "core import must not carry Snake symbols");

  // 缺省（不写 enumSource）必须仍然整组走 core——向后兼容，ballMove/idle 产物零变。
  const idle = parseGameplayStateDescriptor(stateFixture("idle"));
  const idleRendered = renderSharedStateModule("idle", 4, idle, "fixture");
  assert.match(idleRendered, /from "\.\.\/\.\.\/\.\.\/constants\/game";/u);
  assert.doesNotMatch(idleRendered, /\/ruleset";/u);
});

test("enumSource 取值闭合，且 root 的 phase 恒属 core", () => {
  // 反例①：非法取值必须点名拒绝，⛔ 不静默当成 core。
  assertStateError(
    "snake",
    (state) => { typeField(stateType(state, "SnakePlayerState"), "runState").enumSource = "elsewhere"; },
    /enumSource: must be one of core \| gameplay, got "elsewhere"/,
  );
  // 反例②：root phase 声明 gameplay 归属必须被点名拒绝。放行的话，shared 侧产物会去
  // <id>/ruleset 找 GamePhase，而通用 shell 写入的是 constants/game 的那一个——
  // 两个同名符号各自独立演化，运行期是「phase 比较恒假」的静默错。
  assertStateError(
    "snake",
    (state) => { typeField(stateType(state, "SnakeRoomState"), "phase").enumSource = "gameplay"; },
    /root phase is always core-owned, got enumSource "gameplay"/,
  );
  // 显式写 "core" 与缺省等价，必须放行（向后兼容的另一半）。
  const explicitCore = stateFixture("snake");
  typeField(stateType(explicitCore, "SnakeRoomState"), "phase").enumSource = "core";
  assert.doesNotThrow(() => parseGameplayStateDescriptor(explicitCore));
});

test("声明 enumSource:\"gameplay\" 但 ruleset.ts 缺失：codegen 必须点名拒绝", () => {
  // 存在性闸：shared 侧产物 import 它、聚合 barrel re-export 它，缺失就是断链。
  // ⛔ 不留到 tsc 阶段——codegen 期就要指出是哪个玩法的哪个文件。
  const { root, options } = createFixture();
  const ruleset = path.join(root, "apps/shared/src/gameplays/snake/ruleset.ts");
  assert.ok(fs.existsSync(ruleset), "fixture must start with snake ruleset present");
  // 先证明有 ruleset 时是绿的，再删除——否则测不出是「缺失」导致的红。
  assert.doesNotThrow(() => readGameplayDescriptors(options));
  fs.rmSync(ruleset);
  assert.throws(
    () => readGameplayDescriptors(options),
    /apps\/plugins\/snake\/gameplay\/state\.json: declares enumSource "gameplay" but apps\/shared\/src\/gameplays\/snake\/ruleset\.ts is missing/,
  );
  // 反向对照：ballMove 不声明 gameplay 归属，没有 ruleset.ts 也必须照常通过——
  // 存在性闸只在真正声明时收紧，⛔ 不给所有玩法强加一个文件。
  assert.ok(!fs.existsSync(path.join(root, "apps/shared/src/gameplays/ballMove/ruleset.ts")));
  // snake 的玩法单源已迁进插件目录（apps/plugins/snake/gameplay/），⛔ 不在中央 schema 根下。
  fs.rmSync(path.join(root, "apps/plugins/snake/gameplay"), { recursive: true });
  fs.rmSync(path.join(root, CLIENT_MODES_DIR, "snake"), { recursive: true });
  assert.doesNotThrow(() => readGameplayDescriptors(options));
  fs.rmSync(root, { recursive: true, force: true });
});

test("root 的 phase 必须声明 shell 会写入的全部成员，缺一个都不行", () => {
  // 成员子集同样能通过「是个 enum」。少了 Settle 时，生成的 shared validator 会拒掉 settle，
  // 房间一进结算该 mode 全部客户端的 validateRoomStateForMode 抛 STATE_PHASE，结算状态无法解码。
  // ⚠ settle() 不是 ballMove 专属：mode 在 onMessage 里调 context.settle() 就会写入。
  for (const member of ["Waiting", "Playing", "Settle"]) {
    assertStateError(
      "idle",
      (state) => {
        const phase = typeField(stateType(state, "IdleRoomState"), "phase");
        phase.members = (phase.members as string[]).filter((value) => value !== member);
        // ⚠ 必须同时把 default 挪到仍然存在的成员上：删掉 default 指向的成员会先撞上既有的
        // 「default 必须是已声明成员」闸，用例就测不到成员断言了。
        phase.default = (phase.members as string[])[0];
      },
      new RegExp(`root phase must declare member "${member}"`),
    );
  }
  // 据实记录既有闸的覆盖：删掉 default 指向的成员由更早的 default 闸挡住，
  // ⛔ 不谎称是本组断言的覆盖。
  assertStateError(
    "idle",
    (state) => {
      const phase = typeField(stateType(state, "IdleRoomState"), "phase");
      phase.members = (phase.members as string[]).filter((value) => value !== "Waiting");
    },
    /must name a declared enum member/,
  );
});

test("root 的 player 类型漏掉 name 必须在 codegen 期失败", () => {
  assertStateError(
    "idle",
    (state) => {
      const player = stateType(state, "IdlePlayerState");
      player.fields = player.fields.filter((candidate) => candidate.name !== "name");
    },
    /root player type must declare lifecycle field "name"/,
  );
  // `id` 已有更早的既存闸（map 的 key.field 指向它），⛔ 不要谎称是本组新增覆盖：
  // 这里钉住它确实仍被挡住，以及挡它的是哪一条。
  assertStateError(
    "idle",
    (state) => {
      const player = stateType(state, "IdlePlayerState");
      player.fields = player.fields.filter((candidate) => candidate.name !== "id");
    },
    /players\.key\.field: missing field on IdlePlayerState: id/,
  );
});

test("真实 descriptor 必须通过生命周期断言，否则上面的反例只是恒真", () => {
  const gameplays = readGameplayDescriptors({ repositoryRoot: REPOSITORY_ROOT });
  assert.equal(gameplays.length >= 2, true, "至少两个 mode 才谈得上「玩法无关」");
  for (const gameplay of gameplays) {
    const type = gameplay.state.types.find((candidate) => candidate.name === gameplay.state.root);
    assert.ok(type, `missing root type ${gameplay.state.root}`);
    assert.deepEqual(
      ["tick", "phase", "matchId", "players"].filter((name) =>
        type.fields.some((field) => field.name === name)),
      ["tick", "phase", "matchId", "players"],
      `${gameplay.state.root} 必须声明全部生命周期字段`,
    );
  }
});

test("生成的 RoomStateLifecycle 是独立接口，⛔ 不得是某个具体 root 的别名，也不得泄进 shared 产物", () => {
  const realGameplays = readGameplayDescriptors({ repositoryRoot: REPOSITORY_ROOT });
  const artifacts = renderGameplayArtifacts(
    realGameplays,
    readCoreWireNames({ repositoryRoot: REPOSITORY_ROOT }),
    readClientGameplayModules(realGameplays, { repositoryRoot: REPOSITORY_ROOT }),
    readServerGameplayModules(realGameplays, { repositoryRoot: REPOSITORY_ROOT }),
    readWireVectorOwners(realGameplays, { repositoryRoot: REPOSITORY_ROOT }),
  );
  const aggregate = artifacts.get(SERVER_AGGREGATE) ?? "";
  assert.match(aggregate, /export interface RoomStateLifecycle \{/u);
  assert.match(aggregate, /export interface RoomStatePlayerLifecycle \{/u);
  // 别名形态（= GameRoomState）会让 shell 重新拥有 ballMove 的全部字段
  assert.doesNotMatch(aggregate, /RoomStateLifecycle\s*=\s*GameRoomState/u);
  assert.match(aggregate, /players: MapSchema<RoomStatePlayerLifecycle>;/u);
  // 生命周期接口不属于 wire 契约，⛔ 不得泄进任何 shared 生成物（协议指纹与镜像耦合）
  for (const [relative, content] of artifacts) {
    if (!relative.startsWith("apps/shared/") && !relative.startsWith("apps/client/")) continue;
    assert.doesNotMatch(content, /RoomStateLifecycle/u, `${relative} 泄漏了生命周期接口`);
  }
});

// ── wire token（阶段 2b：玩法 wire.ts 语法约束 / 重名闸 / digest 并入 / 增量退出条件）──

function writeFixtureWire(root: string, id: string, source: string): void {
  const dir = path.join(root, "apps/shared/src/gameplays", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "wire.ts"), source, "utf8");
  // 声明了 C2S wire 的玩法必须自带向量 sidecar（生成器按目录发现，缺即 fail）。
  const vectors = path.join(root, "apps/server/test/wire-vectors", `${id}.ts`);
  fs.mkdirSync(path.dirname(vectors), { recursive: true });
  fs.writeFileSync(vectors, "export default { c2s: {}, admission: {} };\n", "utf8");
}

const PUZZLE_WIRE = `import { GamePhase } from "../../constants/game";
import { defineC2S, defineS2C } from "../defineGameplayWire";

export interface IPuzzleStepReq {
    steps: number;
}

export interface IPuzzleBoardRes {
    cells: number;
}

function validatePuzzleStep(input: unknown): IPuzzleStepReq {
    return input as IPuzzleStepReq;
}

function validatePuzzleBoard(input: unknown): IPuzzleBoardRes {
    return input as IPuzzleBoardRes;
}

export const PuzzleStep = defineC2S("c2s.puzzle.step", validatePuzzleStep, {
    phases: [GamePhase.Waiting, GamePhase.Playing],
    rateCost: 2,
});

export const PuzzleBoard = defineS2C("s2c.puzzle.board", validatePuzzleBoard);
`;

test("wire.ts 语法约束：顶层副作用/spread/computed/let/未导出 token 一律拒绝", () => {
  const fixture = createFixture();
  try {
    const attempt = (source: string, pattern: RegExp): void => {
      addFixtureMode(fixture.root, "puzzle", puzzleManifest(), puzzleState());
      writeFixtureWire(fixture.root, "puzzle", source);
      assert.throws(() => readGameplayDescriptors(fixture.options), pattern);
      fs.rmSync(path.join(fixture.root, "apps/shared/schema/gameplays/puzzle"), { recursive: true });
      fs.rmSync(path.join(fixture.root, "apps/shared/src/gameplays/puzzle"), { recursive: true });
    };
    // 顶层副作用（表达式语句）
    attempt(`${PUZZLE_WIRE}console.log("boot");\n`, /wire\.ts 顶层只允许/);
    // class / let 都不属于允许的顶层形态
    attempt(`${PUZZLE_WIRE}class Boot {}\n`, /不允许：ClassDeclaration/);
    attempt(`${PUZZLE_WIRE}let mutable = 1;\n`, /只允许 const 声明/);
    // 顶层 const 里的 spread/computed
    attempt(`${PUZZLE_WIRE}const key = "k";\nconst bad = { [key]: 1 };\n`, /禁 spread\/computed\/副作用/);
    attempt(
      `${PUZZLE_WIRE}const base = { a: 1 };\nconst bad = { ...base };\n`,
      /禁 spread\/computed\/副作用/,
    );
    // defineC2S 选项里的 spread
    attempt(
      PUZZLE_WIRE.replace(
        "phases: [GamePhase.Waiting, GamePhase.Playing],\n    rateCost: 2,",
        "...({ phases: [GamePhase.Playing] }),",
      ),
      /不允许 spread\/computed property/,
    );
    // token 必须 export
    attempt(PUZZLE_WIRE.replace("export const PuzzleBoard", "const PuzzleBoard"), /必须 export/);
    // validator 必须是本文件函数声明且带接口返回类型注解
    attempt(
      PUZZLE_WIRE.replace("defineS2C(\"s2c.puzzle.board\", validatePuzzleBoard)",
        "defineS2C(\"s2c.puzzle.board\", (input) => input)"),
      /validator 必须是本文件内函数声明的标识符引用/,
    );
    attempt(
      PUZZLE_WIRE.replace("function validatePuzzleBoard(input: unknown): IPuzzleBoardRes {",
        "function validatePuzzleBoard(input: unknown) {"),
      /必须带单一接口标识符的返回类型注解/,
    );
    attempt(
      PUZZLE_WIRE.replace("export interface IPuzzleBoardRes", "interface IPuzzleBoardRes"),
      /必须在本文件内声明并导出/,
    );
    // phases/rateCost 的字面量约束
    attempt(PUZZLE_WIRE.replace("[GamePhase.Waiting, GamePhase.Playing]", "[]"), /非空数组字面量/);
    attempt(PUZZLE_WIRE.replace("GamePhase.Waiting", "GamePhase.Lobby"), /GamePhase\.Waiting\/Playing\/Settle/);
    attempt(PUZZLE_WIRE.replace("rateCost: 2", "rateCost: 0"), /rateCost 必须是 ≥1 的整数/);
    attempt(PUZZLE_WIRE.replace("rateCost: 2", "rateCost: 1 + 1"), /rateCost 必须是数字字面量/);
    // 消息名前缀与文件内重名
    attempt(PUZZLE_WIRE.replace('"c2s.puzzle.step"', '"puzzle.step"'), /必须以 "c2s\." 开头/);
    attempt(
      `${PUZZLE_WIRE}export const PuzzleStepAgain = defineC2S("c2s.puzzle.step", validatePuzzleStep, {\n    phases: [GamePhase.Playing],\n});\n`,
      /重复声明消息名：c2s\.puzzle\.step/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("wire 重名闸：跨 mode 消息名、与 core 重名的消息名/聚合键名都必须 fail", () => {
  const fixture = createFixture();
  try {
    addFixtureMode(fixture.root, "puzzle", puzzleManifest(), puzzleState());
    // ① 跨 mode 重名：ballMove 已拥有 c2s.move
    writeFixtureWire(fixture.root, "puzzle", PUZZLE_WIRE.replace('"c2s.puzzle.step"', '"c2s.move"'));
    assert.throws(
      () => readGameplayDescriptors(fixture.options),
      /wire message "c2s\.move" already owned by gameplay "ballMove"/,
    );
    // ② 与 core 重名的消息名（Ping 属 shell）——生成器在聚合时拒绝
    writeFixtureWire(fixture.root, "puzzle", PUZZLE_WIRE.replace('"c2s.puzzle.step"', '"c2s.ping"'));
    assert.throws(
      () => writeGameplayArtifacts(fixture.options),
      /wire message "c2s\.ping" is already a core message/,
    );
    // ③ token 导出名与 core 聚合键重名（S2C 对象里已有 Error）
    writeFixtureWire(fixture.root, "puzzle", PUZZLE_WIRE.replace("export const PuzzleBoard", "export const Error"));
    assert.throws(
      () => writeGameplayArtifacts(fixture.options),
      /wire token "Error" collides with core in the aggregated S2C keys/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("digest 并入 wire.ts 字节：改 wire.ts 一个字节而不 bump modeVersion 必须转红", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));

    const wireFile = path.join(fixture.root, "apps/shared/src/gameplays/ballMove/wire.ts");
    fs.appendFileSync(wireFile, "// drift\n", "utf8");
    const gate = /contract digest changed but modeVersion did not increase/;
    assert.throws(() => assertGameplayArtifactsFresh(fixture.options), gate);
    assert.throws(() => writeGameplayArtifacts(fixture.options), gate);

    const bumped = manifestFixture("ballMove");
    bumped.modeVersion = Number(bumped.modeVersion) + 1;
    writeFixtureJson(fixture.root, "apps/shared/schema/gameplays/ballMove/manifest.json", bumped);
    assert.ok(writeGameplayArtifacts(fixture.options).changed.length > 0);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("阶段 2b 退出条件：fixture mode 新增 C2S/S2C 只加 wire.ts（+manifest/state），生成 wire catalog 即收发", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    const untouched = [
      `${SHARED_STATE_DIR}/ballMove.ts`,
      `${SHARED_STATE_DIR}/idle.ts`,
      `${SERVER_SCHEMA_DIR}/ballMove.ts`,
      `${SERVER_SCHEMA_DIR}/idle.ts`,
    ];
    const snapshot = new Map(untouched.map((relative) => [relative, readFixtureText(fixture.root, relative)]));

    addFixtureMode(fixture.root, "puzzle", puzzleManifest(), puzzleState());
    writeFixtureWire(fixture.root, "puzzle", PUZZLE_WIRE);
    writeGameplayArtifacts(fixture.options);
    for (const relative of untouched) {
      assert.equal(readFixtureText(fixture.root, relative), snapshot.get(relative), `${relative} 必须保持字节不动`);
    }

    const wireCatalog = readFixtureText(fixture.root, SHARED_WIRE_CATALOG);
    // 聚合常量：新消息以 token 导出名为键进入 C2S/S2C 字面量
    assert.match(wireCatalog, /PuzzleStep: "c2s\.puzzle\.step",/);
    assert.match(wireCatalog, /PuzzleBoard: "s2c\.puzzle\.board",/);
    // payload map / validator 表 / owner / phases / rateCost / per-mode token 表全部收录
    assert.match(wireCatalog, /"c2s\.puzzle\.step": IPuzzleStepReq;/);
    assert.match(wireCatalog, /"s2c\.puzzle\.board": IPuzzleBoardRes;/);
    assert.match(wireCatalog, /"c2s\.puzzle\.step": PuzzleStep\.validate,/);
    assert.match(wireCatalog, /"s2c\.puzzle\.board": PuzzleBoard\.validate,/);
    assert.match(wireCatalog, /"c2s\.puzzle\.step": "puzzle",/);
    assert.match(wireCatalog, /"s2c\.puzzle\.board": "puzzle",/);
    assert.match(wireCatalog, /"c2s\.puzzle\.step": \[GamePhase\.Waiting, GamePhase\.Playing\],/);
    assert.match(wireCatalog, /"c2s\.puzzle\.step": 2,/);
    assert.match(wireCatalog, /import \{ PuzzleBoard, PuzzleStep, type IPuzzleBoardRes, type IPuzzleStepReq \} from "\.\.\/puzzle\/wire";/);
    // 聚合 barrel 收录手写 wire 模块；catalog digest 覆盖 wire 字节（上一用例已钉）
    assert.match(readFixtureText(fixture.root, SHARED_INDEX), /export \* from "\.\/puzzle\/wire";/);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── 阶段 9：client GameplayModule 装配集（canonical ∩ catalog 双向同集与语法闸）──

test("GameplayModeId 的单源是 manifest.wireExposed：闭合、⊆ catalog，rooms.ts 只是 façade", () => {
  const gameplays = readGameplayDescriptors({ repositoryRoot: REPOSITORY_ROOT });
  const exposed = wireExposedGameplays(gameplays).map((gameplay) => gameplay.id).sort();
  // ① 生成的对外枚举 ⇔ wireExposed manifest 集：双向相等。
  assert.deepEqual(Object.values(GameplayModeId).slice().sort(), exposed,
    "GameplayModeId 成员集必须等于 {wireExposed: true} 的 manifest id 集");
  // ② ⊆ GAMEPLAY_CATALOG：对外枚举不得出现 catalog 之外的 id。
  for (const id of exposed) {
    assert.ok(id in GAMEPLAY_CATALOG, `${id} 必须在 GAMEPLAY_CATALOG 里`);
  }
  // ③ 刻意取舍仍成立：两个验收 fixture 玩法在 catalog 里，但 ⛔ 不在对外枚举里。
  for (const id of ["dropInFixture", "privateFixture"] as const) {
    assert.ok(id in GAMEPLAY_CATALOG, `${id} 必须仍在 catalog 里`);
    assert.ok(!exposed.includes(id), `${id} 必须声明 wireExposed:false，⛔ 不进对外 wire 枚举`);
  }
  // ④ protocol/rooms.ts 只是一行 re-export façade：谁在那里重新手写常量表就 fail-fast。
  const fixture = createFixture();
  try {
    assert.doesNotThrow(() => writeGameplayArtifacts(fixture.options));
    const roomsFile = path.join(fixture.root, "apps/shared/src/protocol/rooms.ts");
    const rooms = fs.readFileSync(roomsFile, "utf8");
    fs.writeFileSync(
      roomsFile,
      `export const GameplayModeId = {\n    BallMove: "ballMove",\n} as const;\n${rooms}`,
      "utf8",
    );
    assert.throws(
      () => writeGameplayArtifacts(fixture.options),
      /GameplayModeId 的单源是 manifest\.wireExposed/,
    );
    fs.writeFileSync(roomsFile, rooms.replace(/^export \{ GameplayModeId.*$/mu, ""), "utf8");
    assert.throws(
      () => writeGameplayArtifacts(fixture.options),
      /必须从 ".*modeIds\.generated" re-export GameplayModeId/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("client module 集 = canonical GameplayModeId：真仓 modes/ 目录双向同集，渲染进 GAMEPLAY_MODULES", () => {
  const gameplays = readGameplayDescriptors({ repositoryRoot: REPOSITORY_ROOT });
  const modules = readClientGameplayModules(gameplays, { repositoryRoot: REPOSITORY_ROOT });
  // canonical = manifest 声明 wireExposed 的玩法（⛔ 本测试不写死玩法名：新增 canonical 玩法
  // 只改它自己的 manifest + 两个 modes/<id>/index.ts，本文件不动）；fixture 玩法走完整 catalog
  // 链但 ⛔ 不装配客户端 module / 服务端 mode（三端一致闸）。
  const canonical = wireExposedGameplays(gameplays).map((gameplay) => gameplay.id).sort();
  assert.ok(canonical.length >= 2, "canonical 玩法 <2 时本闸判别力不足");
  assert.deepEqual(modules.map((module) => module.id), canonical);
  const serverModules = readServerGameplayModules(gameplays, { repositoryRoot: REPOSITORY_ROOT });
  assert.deepEqual(serverModules.map((module) => module.id), canonical,
    "服务端 mode 装配集必须 = canonical（与客户端 module 装配集同集）");
  for (const gameplay of gameplays) {
    if (canonical.includes(gameplay.id)) continue;
    assert.ok(!fs.existsSync(path.join(REPOSITORY_ROOT, SERVER_MODES_DIR, gameplay.id)),
      `fixture 玩法 ${gameplay.id} ⛔ 不得拥有 modes/<id>/ 服务端目录（不进生产 registry）`);
  }
  // 真仓 modes/ 目录必须与装配集双向同集：多出的目录 = 无主 module，少了 = 装配缺口。
  const moduleDirs = fs.readdirSync(path.join(REPOSITORY_ROOT, CLIENT_MODES_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(moduleDirs, modules.map((module) => module.id).sort(),
    "gameplay/modes/ 目录必须与 canonical GameplayModeId 装配集精确同集");
  // 真仓 modes/ 目录（服务端）必须与装配集双向同集：多出的目录 = 无主 mode，少了 = 装配缺口。
  // ⚠ 服务端 modes/ 目录只认子目录（catalog.ts / catalog.generated.ts 是文件，不参与比对）。
  const serverModeDirs = fs.readdirSync(path.join(REPOSITORY_ROOT, SERVER_MODES_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(serverModeDirs, canonical,
    "rooms/modes/ 子目录必须与 canonical GameplayModeId 装配集精确同集");
  const artifacts = renderGameplayArtifacts(
    gameplays,
    readCoreWireNames({ repositoryRoot: REPOSITORY_ROOT }),
    modules,
    serverModules,
    readWireVectorOwners(gameplays, { repositoryRoot: REPOSITORY_ROOT }),
  );
  const serverCatalog = artifacts.get(SERVER_CATALOG) ?? "";
  for (const module of serverModules) {
    assert.match(serverCatalog, new RegExp(`import \\{ ${module.registerSymbol} \\} from "\\./${module.id}/index";`),
      `服务端 catalog 必须静态 import ${module.registerSymbol}`);
    assert.match(serverCatalog, new RegExp(`disposers\\.push\\(${module.registerSymbol}\\(registry\\)\\);`));
    assert.match(serverCatalog, new RegExp(`^ {4}${JSON.stringify(module.id)},$`, "mu"),
      "GENERATED_GAME_MODE_IDS 收录每个装配 mode");
  }
  assert.doesNotMatch(serverCatalog, /privateFixture|dropInFixture/,
    "fixture 玩法 ⛔ 不得进入服务端 generated catalog");
  const clientCatalog = artifacts.get(CLIENT_CATALOG) ?? "";
  assert.match(clientCatalog, /"ballMove": createBallMoveGameplayModule,/);
  assert.match(clientCatalog, /"idle": createIdleGameplayModule,/);
  assert.doesNotMatch(clientCatalog, /"privateFixture": create/,
    "fixture gameplay ⛔ 不得进入 GAMEPLAY_MODULES（无客户端 module）");
  assert.doesNotMatch(clientCatalog, /"dropInFixture": create/,
    "drop-in fixture gameplay 同样 ⛔ 不得进入 GAMEPLAY_MODULES");
  assert.match(clientCatalog, /import \{ createGameplayModule as createBallMoveGameplayModule \} from "\.\/modes\/ballMove\/index";/);
});

test("client module 缺失或未导出约定符号：freshness 与 writer 都必须 fail-fast", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));

    // ① module 文件被删 → 点名缺失
    const idleModule = path.join(fixture.root, CLIENT_MODES_DIR, "idle/index.ts");
    const original = fs.readFileSync(idleModule, "utf8");
    fs.rmSync(idleModule);
    const missingGate = /gameplay\/modes\/idle\/index\.ts: missing required file/;
    assert.throws(() => assertGameplayArtifactsFresh(fixture.options), missingGate);
    assert.throws(() => writeGameplayArtifacts(fixture.options), missingGate);

    // ② module 存在但未导出 createGameplayModule → 语法级点名
    fs.writeFileSync(idleModule, "export const somethingElse = 1;\n", "utf8");
    const exportGate = /必须导出约定符号 createGameplayModule/;
    assert.throws(() => assertGameplayArtifactsFresh(fixture.options), exportGate);
    assert.throws(() => writeGameplayArtifacts(fixture.options), exportGate);

    fs.writeFileSync(idleModule, original, "utf8");
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("server mode 缺失或未导出 register<Constant>GameMode：freshness 与 writer 都必须 fail-fast", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));

    // ① server mode 文件被删 → 点名缺失
    const idleMode = path.join(fixture.root, SERVER_MODES_DIR, "idle/index.ts");
    const original = fs.readFileSync(idleMode, "utf8");
    fs.rmSync(idleMode);
    const missingGate = /rooms\/modes\/idle\/index\.ts: missing required file/;
    assert.throws(() => assertGameplayArtifactsFresh(fixture.options), missingGate);
    assert.throws(() => writeGameplayArtifacts(fixture.options), missingGate);

    // ② 文件存在但未导出约定符号 → 语法级点名（符号名由 manifest.constantName 派生）
    fs.writeFileSync(idleMode, "export const somethingElse = 1;\n", "utf8");
    const exportGate = /必须导出约定符号 registerIdleGameMode/;
    assert.throws(() => assertGameplayArtifactsFresh(fixture.options), exportGate);
    assert.throws(() => writeGameplayArtifacts(fixture.options), exportGate);

    fs.writeFileSync(idleMode, original, "utf8");
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("阶段 9 退出条件：新增 canonical 玩法 = 单源目录 + modes/<id>/index.ts，⛔ 不改中央文件即入 GAMEPLAY_MODULES", () => {
  const fixture = createFixture();
  try {
    writeGameplayArtifacts(fixture.options);
    // canonical 增员：只在**玩法自己的 manifest** 里声明 wireExposed（⛔ 不再改 rooms.ts
    // 或任何中央文件——GameplayModeId 现在由 manifest.wireExposed 生成）。
    addFixtureMode(fixture.root, "puzzle", { ...puzzleManifest(), wireExposed: true }, puzzleState());

    // canonical ∩ catalog 命中 puzzle 但 module 缺失 → fail-fast（缺口不可静默）。
    assert.throws(
      () => writeGameplayArtifacts(fixture.options),
      /gameplay\/modes\/puzzle\/index\.ts: missing required file/,
    );

    // 只新增 module 文件（内容语法级满足约定导出即可）。
    fs.mkdirSync(path.join(fixture.root, CLIENT_MODES_DIR, "puzzle"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.root, CLIENT_MODES_DIR, "puzzle/index.ts"),
      "export function createGameplayModule(services: unknown): unknown {\n    return services;\n}\n",
      "utf8",
    );
    // 服务端半边：client module 就绪但 server mode 缺失 → 同样 fail-fast 点名（三端一致闸）。
    assert.throws(
      () => writeGameplayArtifacts(fixture.options),
      /rooms\/modes\/puzzle\/index\.ts: missing required file/,
    );
    fs.mkdirSync(path.join(fixture.root, SERVER_MODES_DIR, "puzzle"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.root, SERVER_MODES_DIR, "puzzle/index.ts"),
      "export function registerPuzzleGameMode(registry?: unknown): () => void {\n    return () => registry;\n}\n",
      "utf8",
    );
    const untouched = [
      `${SHARED_STATE_DIR}/ballMove.ts`,
      `${SHARED_STATE_DIR}/idle.ts`,
      `${CLIENT_MODES_DIR}/ballMove/index.ts`,
      `${CLIENT_MODES_DIR}/idle/index.ts`,
      `${SERVER_MODES_DIR}/ballMove/index.ts`,
      `${SERVER_MODES_DIR}/idle/index.ts`,
    ];
    const snapshot = new Map(untouched.map((relative) => [relative, readFixtureText(fixture.root, relative)]));
    writeGameplayArtifacts(fixture.options);
    for (const relative of untouched) {
      assert.equal(readFixtureText(fixture.root, relative), snapshot.get(relative),
        `${relative} 必须保持字节不动`);
    }
    // 生成的对外枚举随 manifest 增员，⛔ 零中央文件改动。
    const modeIds = readFixtureText(fixture.root, SHARED_MODE_IDS);
    assert.match(modeIds, /Puzzle: "puzzle",/);
    const clientCatalog = readFixtureText(fixture.root, CLIENT_CATALOG);
    assert.match(clientCatalog, /"puzzle": createPuzzleGameplayModule,/);
    assert.match(clientCatalog, /registerGameplayModule\(registry, createPuzzleGameplayModule\(services\), services\.controllerBridge\)/);
    // 服务端 catalog 同批收录：⛔ 零中央文件改动（modes/catalog.ts 是 façade，不再手写 import）。
    const serverCatalog = readFixtureText(fixture.root, SERVER_CATALOG);
    assert.match(serverCatalog, /import \{ registerPuzzleGameMode \} from "\.\/puzzle\/index";/);
    assert.match(serverCatalog, /disposers\.push\(registerPuzzleGameMode\(registry\)\);/);
    assert.match(serverCatalog, /^ {4}"puzzle",$/mu);
    assert.doesNotThrow(() => assertGameplayArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── CLI 参数惯例 ────────────────────────────────────────────────────────────

test("CLI 沿用惯例：--check、--root <dir>/--root=<dir>、--allow-delete；重复/未知参数 throw", () => {
  assert.deepEqual(parseCli([]), { check: false });
  assert.deepEqual(parseCli(["--check"]), { check: true });
  assert.deepEqual(parseCli(["--root", "/tmp/x"]), { check: false, repositoryRoot: "/tmp/x" });
  assert.deepEqual(parseCli(["--root=/tmp/x"]), { check: false, repositoryRoot: "/tmp/x" });
  assert.deepEqual(
    parseCli(["--allow-delete", "idle", "--allow-delete=puzzle"]),
    { check: false, allowDelete: ["idle", "puzzle"] },
  );
  assert.throws(() => parseCli(["--check", "--check"]), /duplicate argument: --check/);
  assert.throws(() => parseCli(["--root", "/a", "--root=/b"]), /duplicate argument: --root/);
  assert.throws(() => parseCli(["--root"]), /--root requires a non-empty directory/);
  assert.throws(() => parseCli(["--root="]), /--root requires a non-empty directory/);
  assert.throws(() => parseCli(["--allow-delete"]), /--allow-delete requires a gameplay id/);
  assert.throws(() => parseCli(["--allow-delete", "idle", "--allow-delete", "idle"]), /duplicate argument/);
  assert.throws(() => parseCli(["--frobnicate"]), /unknown argument: --frobnicate/);
  // --check 是只读契约，⛔ 不接受删除授权
  assert.throws(() => parseCli(["--check", "--allow-delete", "idle"]), /read-only/);
});
