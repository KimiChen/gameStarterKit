import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";
import {
  ROOM_STATE_VALIDATORS,
  validateRoomStateForMode,
  type IGameRoomState,
  type IIdleRoomState,
} from "@game/shared";
import {
  createRoomStateForMode,
  GameRoomState,
  IdleRoomState,
  ROOM_STATE_ROOT_CONSTRUCTORS,
} from "../src/rooms/schema/GameRoomState";
import {
  assertRoomStateArtifactsFresh,
  parseRoomStateDescriptor,
  readRoomStateDescriptor,
  renderRoomStateArtifacts,
  writeRoomStateArtifacts,
  type RoomStateCodegenOptions,
} from "../tools/room-state-codegen";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCHEMA_FILE = path.join(REPOSITORY_ROOT, "apps/shared/schema/game-room-state.json");

type MutableField = Record<string, unknown>;
type MutableType = {
  name: string;
  sharedName: string;
  validatorName: string;
  defaultPath: string;
  fields: MutableField[];
  serverOnly: MutableField[];
};
type MutableRoot = {
  mode: string;
  type: string;
  [key: string]: unknown;
};
type MutableManifest = {
  formatVersion: number;
  roots: MutableRoot[];
  types: MutableType[];
  [key: string]: unknown;
};

function manifestFixture(): MutableManifest {
  return JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf8")) as MutableManifest;
}

function manifestType(manifest: MutableManifest, name: string): MutableType {
  const result = manifest.types.find((type) => type.name === name);
  assert.ok(result, `missing fixture type ${name}`);
  return result;
}

function manifestField(type: MutableType, name: string): MutableField {
  const result = type.fields.find((field) => field.name === name);
  assert.ok(result, `missing fixture field ${type.name}.${name}`);
  return result;
}

function assertManifestError(change: (manifest: MutableManifest) => void, pattern: RegExp): void {
  const manifest = manifestFixture();
  change(manifest);
  assert.throws(() => parseRoomStateDescriptor(manifest), pattern);
}

function createFixture(manifest = manifestFixture()): {
  readonly root: string;
  readonly options: RoomStateCodegenOptions;
  readonly schemaFile: string;
  readonly sharedOutputFile: string;
  readonly serverOutputFile: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-state-codegen-"));
  const schemaFile = path.join(root, "schema/game-room-state.json");
  const sharedOutputFile = path.join(root, "generated/state.shared.ts");
  const serverOutputFile = path.join(root, "generated/state.server.ts");
  fs.mkdirSync(path.dirname(schemaFile), { recursive: true });
  fs.writeFileSync(schemaFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    root,
    schemaFile,
    sharedOutputFile,
    serverOutputFile,
    options: { repositoryRoot: root, schemaFile, sharedOutputFile, serverOutputFile },
  };
}

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
  const sourceFile = ts.createSourceFile("GameRoomState.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
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

test("checked-in room-state artifacts are fresh", () => {
  assert.doesNotThrow(() => assertRoomStateArtifactsFresh({ repositoryRoot: REPOSITORY_ROOT }));
});

test("freshness check is read-only and fails after a descriptor field is added", () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(writeRoomStateArtifacts(fixture.options), [
      "generated/state.shared.ts",
      "generated/state.server.ts",
    ]);
    assert.doesNotThrow(() => assertRoomStateArtifactsFresh(fixture.options));
    const originalShared = fs.readFileSync(fixture.sharedOutputFile, "utf8");
    const originalServer = fs.readFileSync(fixture.serverOutputFile, "utf8");

    const changed = manifestFixture();
    manifestType(changed, "PlayerState").fields.push({
      name: "debugWire",
      kind: "boolean",
      default: false,
      description: "Fixture-only generated field",
    });
    fs.writeFileSync(fixture.schemaFile, `${JSON.stringify(changed, null, 2)}\n`, "utf8");

    assert.throws(
      () => assertRoomStateArtifactsFresh(fixture.options),
      /generated state is missing or stale: generated\/state\.shared\.ts, generated\/state\.server\.ts/,
    );
    assert.equal(fs.readFileSync(fixture.sharedOutputFile, "utf8"), originalShared);
    assert.equal(fs.readFileSync(fixture.serverOutputFile, "utf8"), originalServer);

    assert.deepEqual(writeRoomStateArtifacts(fixture.options), [
      "generated/state.shared.ts",
      "generated/state.server.ts",
    ]);
    assert.match(fs.readFileSync(fixture.sharedOutputFile, "utf8"), /debugWire: boolean/);
    assert.match(fs.readFileSync(fixture.serverOutputFile, "utf8"), /@type\("boolean"\) debugWire: boolean = false/);
    assert.doesNotThrow(() => assertRoomStateArtifactsFresh(fixture.options));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("manifest rejects unknown shapes, invalid field types, duplicates and invalid bounds", () => {
  assertManifestError((manifest) => { manifest.legacySchema = true; }, /manifest: unknown key\(s\): legacySchema/);
  assertManifestError((manifest) => {
    manifestField(manifestType(manifest, "PlayerState"), "id").wire = true;
  }, /unknown key\(s\): wire/);
  assertManifestError((manifest) => {
    manifestField(manifestType(manifest, "PlayerState"), "id").kind = "uuid";
  }, /unsupported wire kind: uuid/);
  assertManifestError((manifest) => {
    manifestField(manifestType(manifest, "PlayerState"), "alive").default = "true";
  }, /must be a boolean literal or constant reference/);
  assertManifestError((manifest) => {
    const player = manifestType(manifest, "PlayerState");
    player.fields.push({ ...player.fields[0] });
  }, /duplicate wire field: id/);
  assertManifestError((manifest) => {
    const x = manifestField(manifestType(manifest, "PlayerState"), "x");
    x.min = 2;
    x.max = 1;
  }, /min must not exceed max/);
});

test("formatVersion 2 requires exact, unique and resolvable mode roots", () => {
  assertManifestError((manifest) => { manifest.formatVersion = 1; }, /only formatVersion 2 is supported/);
  assertManifestError((manifest) => { manifest.root = "GameRoomState"; }, /manifest: unknown key\(s\): root/);
  assertManifestError((manifest) => { manifest.roots = []; }, /manifest\.roots: must be a non-empty array/);
  assertManifestError((manifest) => { manifest.roots[0].legacy = true; }, /roots\[0\]: unknown key\(s\): legacy/);
  assertManifestError((manifest) => { manifest.roots[0].mode = "bad mode"; }, /invalid gameplay mode id: bad mode/);
  assertManifestError((manifest) => {
    manifest.roots[1].mode = manifest.roots[0].mode;
  }, /duplicate root mode: ballMove/);
  assertManifestError((manifest) => {
    manifest.roots[1].type = manifest.roots[0].type;
  }, /ambiguous root type: GameRoomState/);
  assertManifestError((manifest) => {
    manifest.roots[1].type = "MissingRoomState";
  }, /roots\[1\]\.type: missing root type: MissingRoomState/);

  const descriptor = parseRoomStateDescriptor(manifestFixture());
  assert.deepEqual(descriptor.roots, [
    { mode: "ballMove", type: "GameRoomState" },
    { mode: "idle", type: "IdleRoomState" },
  ]);
});

test("roots directly drive shared validators and server constructors", () => {
  const manifest = manifestFixture();
  manifest.roots[1].mode = "idle-v2";
  const artifacts = renderRoomStateArtifacts(parseRoomStateDescriptor(manifest));

  assert.match(artifacts.shared, /"idle-v2": IIdleRoomState;/);
  assert.match(artifacts.shared, /"idle-v2": validateIdleRoomState,/);
  assert.doesNotMatch(artifacts.shared, /"idle": IIdleRoomState;/);
  assert.doesNotMatch(artifacts.shared, /"idle": validateIdleRoomState,/);
  assert.match(artifacts.server, /"idle-v2": IdleRoomState,/);
  assert.doesNotMatch(artifacts.server, /"idle": IdleRoomState,/);
});

test("generated root maps are frozen, type-safe and reject unknown modes", () => {
  assert.deepEqual(Object.keys(ROOM_STATE_VALIDATORS), ["ballMove", "idle"]);
  assert.deepEqual(Object.keys(ROOM_STATE_ROOT_CONSTRUCTORS), ["ballMove", "idle"]);
  assert.equal(Object.isFrozen(ROOM_STATE_VALIDATORS), true);
  assert.equal(Object.isFrozen(ROOM_STATE_ROOT_CONSTRUCTORS), true);

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
  assert.throws(
    () => validateRoomStateForMode("missing-mode", {}),
    /STATE_MODE/,
  );
});

test("manifest rejects broken map and cross-field references", () => {
  assertManifestError((manifest) => {
    manifestField(manifestType(manifest, "GameRoomState"), "players").valueType = "MissingPlayerState";
  }, /players\.valueType: missing type: MissingPlayerState/);
  assertManifestError((manifest) => {
    manifestField(manifestType(manifest, "PlayerState"), "hp").maxField = "missingMaxHp";
  }, /hp\.maxField: missing field: missingMaxHp/);
  assertManifestError((manifest) => {
    manifestField(manifestType(manifest, "PlayerState"), "hp").maxField = "alive";
  }, /hp\.maxField: must reference a number\/integer field: alive/);
  assertManifestError((manifest) => {
    const players = manifestField(manifestType(manifest, "GameRoomState"), "players");
    players.key = { field: "alive", errorCode: "STATE_PLAYER_ID" };
  }, /players\.key\.field: must reference a string field on PlayerState/);
});

test("server-only fields reject exposure markers, collisions, duplicates and unsupported kinds", () => {
  assertManifestError((manifest) => {
    manifestType(manifest, "PlayerState").serverOnly[0].wire = true;
  }, /serverOnly\[0\]: unknown key\(s\): wire/);
  assertManifestError((manifest) => {
    manifestType(manifest, "PlayerState").serverOnly[0].name = "id";
  }, /field collides with wire field: id/);
  assertManifestError((manifest) => {
    const player = manifestType(manifest, "PlayerState");
    player.serverOnly.push({ ...player.serverOnly[0] });
  }, /duplicate server-only field: dirX/);
  assertManifestError((manifest) => {
    manifestType(manifest, "PlayerState").serverOnly[0].kind = "string";
  }, /unsupported server-only kind: string/);
});

test("generated validator keys exactly equal runtime decorated keys and exclude server-only fields", () => {
  const descriptor = readRoomStateDescriptor({ repositoryRoot: REPOSITORY_ROOT });
  const artifacts = renderRoomStateArtifacts(descriptor);
  const validators = sharedValidatorKeys(artifacts.shared);
  const classes = serverClassFields(artifacts.server);

  for (const type of descriptor.types) {
    const expectedWire = type.fields.map((field) => field.name);
    const classFields = classes.get(type.name);
    assert.ok(classFields, `missing generated class ${type.name}`);
    assert.deepEqual(validators.get(type.validatorName), expectedWire, `${type.validatorName} exact keys drifted`);
    assert.deepEqual(classFields.decorated, expectedWire, `${type.name} decorated keys drifted`);
    for (const internal of type.serverOnly) {
      assert.ok(classFields.undecorated.includes(internal.name), `${type.name}.${internal.name} must be undecorated`);
      assert.equal(expectedWire.includes(internal.name), false, `${type.name}.${internal.name} leaked into wire fields`);
      assert.doesNotMatch(artifacts.shared, new RegExp(`\\b${internal.name}\\b`, "u"));
    }
  }
});

test("map entry helpers are unique per owner type when roots share a field name", () => {
  const descriptor = readRoomStateDescriptor({ repositoryRoot: REPOSITORY_ROOT });
  const { shared } = renderRoomStateArtifacts(descriptor);
  assert.match(shared, /function entriesOfGameRoomStatePlayers\(/);
  assert.match(shared, /function entriesOfIdleRoomStatePlayers\(/);
  assert.doesNotMatch(shared, /function entriesOfPlayers\(/);
  assert.match(shared, /const entries = entriesOfGameRoomStatePlayers\(value\.players/);
  assert.match(shared, /const entries = entriesOfIdleRoomStatePlayers\(value\.players/);
});

// ── root 生命周期字段断言（plan-v4 条目 4 阶段三）─────────────────────────────
//
// 通用 GameRoom shell 只读 root 的 tick/phase/matchId/players 与 player 的 id/name。
// 此前它用 `declare readonly state: GameRoomState` 声明这件事，那是一句谎：真实 root 由 mode
// 决定，IdleRoomState 只是恰好也有这些字段。⛔ 新增一个漏字段的 root，过去只在运行期读到
// undefined。下面把每种漏法都钉成 codegen 期失败。

test("root 漏掉任一生命周期字段必须在 codegen 期失败", () => {
  for (const field of ["tick", "phase", "matchId", "players"]) {
    assertManifestError(
      (manifest) => {
        const root = manifestType(manifest, "IdleRoomState");
        root.fields = root.fields.filter((candidate) => candidate.name !== field);
      },
      new RegExp(`root type must declare lifecycle field "${field}"`),
    );
  }
});

test("生命周期字段的 kind 不对同样必须失败——⛔ 只查名字不够", () => {
  // ⚠ 必须换成一个**本身合法**的字段：直接改 kind 会留下原 kind 的专属键（tick 的 min），
  // 那会先撞上 exactKeys，用例就测不到生命周期断言了。
  assertManifestError(
    (manifest) => {
      const root = manifestType(manifest, "IdleRoomState");
      root.fields = root.fields.map((field) => field.name === "tick"
        ? { name: "tick", kind: "string", default: "", minLength: 0, maxLength: 8 }
        : field);
    },
    /lifecycle field must be kind "integer", got "string"/,
  );
  assertManifestError(
    (manifest) => {
      const root = manifestType(manifest, "GameRoomState");
      root.fields = root.fields.map((field) => field.name === "matchId"
        ? { name: "matchId", kind: "integer", default: 0, min: 0 }
        : field);
    },
    /lifecycle field must be kind "string", got "integer"/,
  );
});

test("root 的 phase 必须是 GamePhase 本身，⛔ 「是个 enum」不够", () => {
  // 异枚举实测能通过「是个 enum」：生成的 root 是 `phase: PuzzlePhaseType = PuzzlePhase.Idle`，
  // 而同一份产物里 RoomStateLifecycle 仍写死 `phase: GamePhaseType`——两处 cast
  // （declare readonly state / as GameRoomState）让 typecheck 抓不到，运行期表现是
  // `state.phase !== GamePhase.Waiting` 恒真 → 每次 onJoin 都 GameAlreadyStarted，房间永久不可进。
  assertManifestError(
    (manifest) => {
      const phase = manifestField(manifestType(manifest, "IdleRoomState"), "phase");
      phase.enumObject = "PuzzlePhase";
      phase.enumType = "PuzzlePhaseType";
      phase.members = ["Waiting", "Playing", "Settle"];
    },
    /root phase must use GamePhase\/GamePhaseType, got PuzzlePhase\/PuzzlePhaseType/,
  );
  // 只错 enumType 也必须被命中——⛔ 不能只查 enumObject
  assertManifestError(
    (manifest) => { manifestField(manifestType(manifest, "GameRoomState"), "phase").enumType = "PuzzlePhaseType"; },
    /root phase must use GamePhase\/GamePhaseType/,
  );
});

test("root 的 phase 必须声明 shell 会写入的全部成员，缺一个都不行", () => {
  // 成员子集同样能通过「是个 enum」。少了 Settle 时，生成的 shared validator 会拒掉 settle，
  // 房间一进结算该 mode 全部客户端的 validateRoomStateForMode 抛 STATE_PHASE，结算状态无法解码。
  // ⚠ settle() 不是 ballMove 专属：mode 在 onMessage 里调 context.settle() 就会写入。
  for (const member of ["Waiting", "Playing", "Settle"]) {
    assertManifestError(
      (manifest) => {
        const phase = manifestField(manifestType(manifest, "IdleRoomState"), "phase");
        phase.members = (phase.members as string[]).filter((value) => value !== member);
        // ⚠ 必须同时把 default 挪到仍然存在的成员上：删掉 default 指向的成员会先撞上既有的
        // 「default 必须是已声明成员」闸，用例就测不到本轮新增的成员断言了。
        phase.default = (phase.members as string[])[0];
      },
      new RegExp(`root phase must declare member "${member}"`),
    );
  }
  // 据实记录既有闸的覆盖：删掉 default 指向的成员由更早的 default 闸挡住，
  // ⛔ 不谎称是本轮新增覆盖。
  assertManifestError(
    (manifest) => {
      const phase = manifestField(manifestType(manifest, "IdleRoomState"), "phase");
      phase.members = (phase.members as string[]).filter((value) => value !== "Waiting");
    },
    /must name a declared enum member/,
  );
});

test("root 的 player 类型漏掉 name 必须在 codegen 期失败", () => {
  assertManifestError(
    (manifest) => {
      const player = manifestType(manifest, "IdlePlayerState");
      player.fields = player.fields.filter((candidate) => candidate.name !== "name");
    },
    /root player type must declare lifecycle field "name"/,
  );
  // `id` 已有更早的既存闸（map 的 key.field 指向它），⛔ 不要谎称是本轮新增覆盖：
  // 这里钉住它确实仍被挡住，以及挡它的是哪一条。
  assertManifestError(
    (manifest) => {
      const player = manifestType(manifest, "IdlePlayerState");
      player.fields = player.fields.filter((candidate) => candidate.name !== "id");
    },
    /players\.key\.field: missing field on IdlePlayerState: id/,
  );
});

test("真实 manifest 必须通过生命周期断言，否则上面的反例只是恒真", () => {
  const descriptor = parseRoomStateDescriptor(manifestFixture());
  assert.equal(descriptor.roots.length >= 2, true, "至少两个 root 才谈得上「玩法无关」");
  for (const root of descriptor.roots) {
    const type = descriptor.types.find((candidate) => candidate.name === root.type);
    assert.ok(type, `missing root type ${root.type}`);
    assert.deepEqual(
      ["tick", "phase", "matchId", "players"].filter((name) =>
        type.fields.some((field) => field.name === name)),
      ["tick", "phase", "matchId", "players"],
      `${root.type} 必须声明全部生命周期字段`,
    );
  }
});

test("生成的 RoomStateLifecycle 是独立接口，⛔ 不得是某个具体 root 的别名", () => {
  const artifacts = renderRoomStateArtifacts(parseRoomStateDescriptor(manifestFixture()));
  assert.match(artifacts.server, /export interface RoomStateLifecycle \{/u);
  assert.match(artifacts.server, /export interface RoomStatePlayerLifecycle \{/u);
  // 别名形态（= GameRoomState）会让 shell 重新拥有 ballMove 的全部字段
  assert.doesNotMatch(artifacts.server, /RoomStateLifecycle\s*=\s*GameRoomState/u);
  assert.match(artifacts.server, /players: MapSchema<RoomStatePlayerLifecycle>;/u);
  // 生命周期接口不属于 wire 契约，⛔ 不得泄进 shared 生成物（否则会改协议指纹）
  assert.doesNotMatch(artifacts.shared, /RoomStateLifecycle/u);
});
