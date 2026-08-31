/**
 * codegen:features 全闸（Non-intrusive §4.2/§5.5 阶段 3）。
 *
 * 覆盖：freshness 对真仓、mkdtemp 隔离根、--check 只读三态（stale/missing/extra 点名）、
 * 运行时 descriptor ⇔ generated 表双向对拍（route/mode/errorCodes/pushes 全覆盖）、
 * domain 文件形态负例（computed/spread/副作用/let/未知调用点名拒绝）、重复 id 拒绝、
 * 幂等路由 clientReqId 的 AST 层校验反例、错误码顺序钉、删除保护与
 * 「新增 fixture domain 只加文件不改人工中央源码」的阶段 3 退出条件。
 * ⚠ 本文件的值导入把生成器自身的 .ts 纳入 tsc（§5.5 的先例形态）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ALL_LOBBY_RPC_TYPES,
  LOBBY_RPC_CONTRACT_VERSIONS,
  LOBBY_RPC_DOMAINS,
  LOBBY_RPC_INSPECTABLE,
  LOBBY_RPC_OPERATION_GROUPS,
  LOBBY_RPC_ROUTE_MODES,
  LobbyPush,
  PUSH_RUNTIME_VALIDATORS,
  RPC_ERR_CODES,
  type LobbyPushType,
  type LobbyRpcType,
} from "@game/shared";
import guildDomain from "../../shared/src/protocol/lobbyRpc/domains/guild";
import mailDomain from "../../shared/src/protocol/lobbyRpc/domains/mail";
import shopDomain from "../../shared/src/protocol/lobbyRpc/domains/shop";
import userDomain from "../../shared/src/protocol/lobbyRpc/domains/user";
import {
  CORE_LOBBY_PUSHES,
  CORE_RPC_ERROR_CODES,
  RPC_ERR_CODE_ORDER,
} from "../../shared/src/protocol/lobbyRpc/coreErrors";
import { parseCoreErrorsModule, parseDomainModule } from "../tools/feature-codegen/astReader";
import {
  assertFeatureArtifactsFresh,
  parseCli,
  readFeatureDescriptors,
  renderFeatureArtifacts,
  writeFeatureArtifacts,
  type FeatureCodegenOptions,
} from "../tools/feature-codegen/lib";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LOBBY_RPC_DIR = "apps/shared/src/protocol/lobbyRpc";
const REGISTRY_RELATIVE = `${LOBBY_RPC_DIR}/registry.generated.ts`;

function createFixture(): { readonly root: string; readonly options: FeatureCodegenOptions } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feature-codegen-"));
  fs.cpSync(path.join(REPOSITORY_ROOT, LOBBY_RPC_DIR), path.join(root, LOBBY_RPC_DIR), { recursive: true });
  return { root, options: { repositoryRoot: root } };
}

/** lobbyRpc 目录里除 registry 外全部文件的字节快照（证明生成器不改人工源码）。 */
function snapshotHandwritten(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const base = path.join(root, LOBBY_RPC_DIR);
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (relative === REGISTRY_RELATIVE) continue;
      out.set(relative, fs.readFileSync(full, "utf8"));
    }
  };
  walk(base);
  return out;
}

// ── freshness 与 --check 三态 ───────────────────────────────────────────────

test("checked-in feature registry is fresh", () => {
  assertFeatureArtifactsFresh();
});

test("--check 只读：stale/missing/extra 三态失败并点名", () => {
  const { root, options } = createFixture();
  assertFeatureArtifactsFresh(options); // 拷贝出的固定根初始即新鲜

  // stale：shop 域加一个错误码，registry 未再生成
  const shopFile = path.join(root, LOBBY_RPC_DIR, "domains/shop.ts");
  const shopSource = fs.readFileSync(shopFile, "utf8");
  fs.writeFileSync(shopFile, shopSource.replace('"ORDER_MISMATCH",', '"ORDER_MISMATCH",\n        "SHOP_TEST_ONLY",'));
  const registryFile = path.join(root, REGISTRY_RELATIVE);
  const registryBytes = fs.readFileSync(registryFile, "utf8");
  assert.throws(() => assertFeatureArtifactsFresh(options), /stale: .*registry\.generated\.ts/u);
  assert.equal(fs.readFileSync(registryFile, "utf8"), registryBytes, "--check 不得改写生成物");

  // missing：删掉 registry
  fs.rmSync(registryFile);
  assert.throws(() => assertFeatureArtifactsFresh(options), /missing: .*registry\.generated\.ts/u);

  // extra：恢复后在 lobbyRpc/ 放一个陌生 *.generated.ts
  writeFeatureArtifacts(options);
  assertFeatureArtifactsFresh(options);
  const bogus = path.join(root, LOBBY_RPC_DIR, "bogus.generated.ts");
  fs.writeFileSync(bogus, "export const bogus = 1;\n");
  assert.throws(() => assertFeatureArtifactsFresh(options), /extra: .*bogus\.generated\.ts/u);
  assert.throws(() => writeFeatureArtifacts(options), /bogus\.generated\.ts/u);
});

// ── 运行时 descriptor ⇔ generated 表双向对拍 ────────────────────────────────

test("descriptor 运行时值 ⇔ generated 表双向相等（route/mode/errorCodes/pushes 全覆盖）", () => {
  const domains = [guildDomain, mailDomain, shopDomain, userDomain];
  assert.deepEqual(domains.map((d) => d.domain).sort(), [...LOBBY_RPC_DOMAINS].sort());

  // routes/mode：双向
  const declaredModes = new Map<string, string>();
  for (const domain of domains) {
    for (const route of domain.routes) declaredModes.set(route.type, route.mode);
  }
  assert.deepEqual(new Set(declaredModes.keys()), new Set(ALL_LOBBY_RPC_TYPES));
  for (const type of ALL_LOBBY_RPC_TYPES as readonly LobbyRpcType[]) {
    assert.equal(LOBBY_RPC_ROUTE_MODES[type], declaredModes.get(type), `${type} 的 mode 与 descriptor 不一致`);
  }

  // errorCodes：core + 域 = 生成全集（集合相等），且生成顺序 = 历史钉在前、未上钉新码按
  // 「core 声明序 → 域名序 → 域内声明序」追加（阶段 4 新增两个 core 码不上钉）
  const declaredCodes = [...CORE_RPC_ERROR_CODES, ...domains.flatMap((d) => [...d.errorCodes])];
  assert.deepEqual(new Set(RPC_ERR_CODES), new Set(declaredCodes));
  assert.deepEqual(
    [...RPC_ERR_CODES],
    [...RPC_ERR_CODE_ORDER, "OPERATION_CONFLICT", "OPERATION_RESULT_EXPIRED"],
    "钉表 15 码逐字复现拆分前 envelope.ts 顺序；阶段 4 的两个新 core 码按声明序追加在钉表之后");

  // pushes：key/type/validator 双向
  const declaredPushes = [...CORE_LOBBY_PUSHES, ...domains.flatMap((d) => [...d.pushes])];
  assert.deepEqual(
    Object.fromEntries(declaredPushes.map((p) => [p.key, p.type])),
    { ...LobbyPush },
  );
  for (const push of declaredPushes) {
    const validator = PUSH_RUNTIME_VALIDATORS[push.type as LobbyPushType];
    assert.equal(typeof validator, "function", `${push.type} 缺少生成的 push validator`);
    assert.equal(validator.name, push.data.name, `${push.type} 的生成 validator 必须与 descriptor 引用同名函数`);
  }

  // operation 元数据：生产路由一律不声明（undergroundIdle 未实现）⇒ 生成表为空但机制在位
  assert.deepEqual({ ...LOBBY_RPC_OPERATION_GROUPS }, {});
  assert.deepEqual([...LOBBY_RPC_INSPECTABLE], []);
  for (const domain of domains) {
    assert.deepEqual([...domain.ownsOperationGroups], [], `${domain.domain} 生产域不得声明 ownsOperationGroups`);
    for (const route of domain.routes) {
      assert.equal(route.operationGroup ?? undefined, undefined, `${route.type} 生产路由不得声明 operationGroup`);
      assert.notEqual(route.inspectable, true, `${route.type} 生产路由不得声明 inspectable`);
      assert.equal(route.contractVersion ?? undefined, undefined, `${route.type} 当前不显式声明 contractVersion（缺省 1）`);
    }
  }
  // contractVersion：全部生产路由缺省 1（§6.11：随 validator 语义变更人工 bump）
  for (const type of ALL_LOBBY_RPC_TYPES as readonly LobbyRpcType[]) {
    assert.equal(LOBBY_RPC_CONTRACT_VERSIONS[type], 1, `${type} 的生成契约版本应缺省 1`);
  }
});

// ── domain 文件形态负例（AST 语法读取，⛔ 不执行） ──────────────────────────

const BASE_DOMAIN = [
  'import { type RuntimeValidator } from "../../http";',
  'import { defineLobbyRpcDomain, defineRpcQuery } from "../defineDomain";',
  "export interface IPingReq {}",
  "export interface IPingRes {}",
  "export const validatePingReq: RuntimeValidator<IPingReq> = () => ({});",
  "export const validatePingRes: RuntimeValidator<IPingRes> = () => ({});",
  "export default defineLobbyRpcDomain({",
  '    domain: "ping",',
  "    errorCodes: [],",
  '    routes: [defineRpcQuery("ping.echo", { request: validatePingReq, response: validatePingRes })],',
  "});",
  "",
].join("\n");

test("domain 形态违规点名拒绝：副作用/let/computed/spread/未知调用/未导出/缺注解/重复路由", () => {
  assert.doesNotThrow(() => parseDomainModule(BASE_DOMAIN, "fixture"));
  assert.throws(
    () => parseDomainModule(`console.log("boot");\n${BASE_DOMAIN}`, "fixture"),
    /顶层只允许/u,
  );
  assert.throws(
    () => parseDomainModule(`let leak = 1;\n${BASE_DOMAIN}`, "fixture"),
    /禁 let\/var/u,
  );
  assert.throws(
    () => parseDomainModule(BASE_DOMAIN.replace('domain: "ping",', '["domain"]: "ping",'), "fixture"),
    /computed property/u,
  );
  assert.throws(
    () => parseDomainModule(
      `const extra = { errorCodes: [] };\n${BASE_DOMAIN.replace("    errorCodes: [],", "    errorCodes: [],\n    ...extra,")}`,
      "fixture",
    ),
    /spread/u,
  );
  assert.throws(
    () => parseDomainModule(
      BASE_DOMAIN.replace("defineRpcQuery(", "defineRpcMystery(").replace(", defineRpcQuery }", ", defineRpcMystery }"),
      "fixture",
    ),
    /define\* 之外的函数调用/u,
  );
  assert.throws(
    () => parseDomainModule(
      BASE_DOMAIN.replace("export const validatePingReq", "const validatePingReq"),
      "fixture",
    ),
    /必须导出/u,
  );
  assert.throws(
    () => parseDomainModule(
      BASE_DOMAIN.replace(
        "export const validatePingReq: RuntimeValidator<IPingReq> = () => ({});",
        "export function validatePingReq(input: unknown) { return {}; }",
      ),
      "fixture",
    ),
    /载荷类型注解/u,
  );
  assert.throws(
    () => parseDomainModule(
      BASE_DOMAIN.replace(
        'routes: [defineRpcQuery("ping.echo", { request: validatePingReq, response: validatePingRes })],',
        'routes: [defineRpcQuery("ping.echo", { request: validatePingReq, response: validatePingRes }), '
        + 'defineRpcQuery("ping.echo", { request: validatePingReq, response: validatePingRes })],',
      ),
      "fixture",
    ),
    /重复声明路由/u,
  );
});

test("idempotent-write 的 request 接口必须字面含必选 clientReqId: string（AST 层校验反例）", () => {
  const build = (reqInterface: string): string => [
    'import { type RuntimeValidator } from "../../http";',
    'import { defineLobbyRpcDomain, defineRpcIdempotentWrite } from "../defineDomain";',
    reqInterface,
    "export interface ICommitRes {}",
    "export const validateCommitReq: RuntimeValidator<ICommitReq> = () => (undefined as never);",
    "export const validateCommitRes: RuntimeValidator<ICommitRes> = () => ({});",
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    routes: [defineRpcIdempotentWrite("room.commit", { request: validateCommitReq, response: validateCommitRes })],',
    "});",
    "",
  ].join("\n");
  assert.doesNotThrow(() => parseDomainModule(build("export interface ICommitReq { clientReqId: string; }"), "fixture"));
  assert.throws(
    () => parseDomainModule(build("export interface ICommitReq { other: string; }"), "fixture"),
    /字面缺少必选 clientReqId/u,
  );
  assert.throws(
    () => parseDomainModule(build("export interface ICommitReq { clientReqId?: string; }"), "fixture"),
    /不得是可选字段/u,
  );
  assert.throws(
    () => parseDomainModule(build("export interface ICommitReq { clientReqId: number; }"), "fixture"),
    /必须是 string/u,
  );
});

test("coreErrors 解析 + 顺序钉：钉表引用不存在的码必须拒绝", () => {
  const { root, options } = createFixture();
  const coreFile = path.join(root, LOBBY_RPC_DIR, "coreErrors.ts");
  assert.doesNotThrow(() => parseCoreErrorsModule(fs.readFileSync(coreFile, "utf8"), "coreErrors"));
  // shop 不再声明 ORDER_MISMATCH ⇒ 钉表 dangling
  const shopFile = path.join(root, LOBBY_RPC_DIR, "domains/shop.ts");
  fs.writeFileSync(shopFile, fs.readFileSync(shopFile, "utf8").replace('        "ORDER_MISMATCH",\n', ""));
  assert.throws(() => readFeatureDescriptors(options), /RPC_ERR_CODE_ORDER 引用了不属于任何 descriptor 的码：ORDER_MISMATCH/u);
});

test("重复 id 拒绝：跨域错误码 / 推送消息名 / 推送 key / 路由前缀与文件名闸", () => {
  const makeDomain = (body: string): string => [
    'import { type RuntimeValidator } from "../../http";',
    'import { defineLobbyPush, defineLobbyRpcDomain, defineRpcQuery } from "../defineDomain";',
    "export interface IPeekReq {}",
    "export interface IPeekRes {}",
    "export interface IRoomEventPush {}",
    "export const validatePeekReq: RuntimeValidator<IPeekReq> = () => ({});",
    "export const validatePeekRes: RuntimeValidator<IPeekRes> = () => ({});",
    "export const validateRoomEventPush: RuntimeValidator<IRoomEventPush> = () => ({});",
    body,
    "",
  ].join("\n");
  const withFixtureDomain = (source: string): FeatureCodegenOptions => {
    const { root, options } = createFixture();
    fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/room.ts"), source);
    return options;
  };

  assert.throws(() => readFeatureDescriptors(withFixtureDomain(makeDomain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    '    errorCodes: ["INSUFFICIENT_BALANCE"],',
    '    routes: [defineRpcQuery("room.peek", { request: validatePeekReq, response: validatePeekRes })],',
    "});",
  ].join("\n")))), /错误码 "INSUFFICIENT_BALANCE" 同时由/u);

  assert.throws(() => readFeatureDescriptors(withFixtureDomain(makeDomain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    pushes: [defineLobbyPush("RoomEvent", "mail.new", validateRoomEventPush)],',
    '    routes: [defineRpcQuery("room.peek", { request: validatePeekReq, response: validatePeekRes })],',
    "});",
  ].join("\n")))), /推送消息名 "mail.new" 同时由/u);

  assert.throws(() => readFeatureDescriptors(withFixtureDomain(makeDomain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    pushes: [defineLobbyPush("MailNew", "room.event", validateRoomEventPush)],',
    '    routes: [defineRpcQuery("room.peek", { request: validatePeekReq, response: validatePeekRes })],',
    "});",
  ].join("\n")))), /推送 key "mailnew" 同时由/u);

  assert.throws(() => readFeatureDescriptors(withFixtureDomain(makeDomain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    routes: [defineRpcQuery("shop.peek", { request: validatePeekReq, response: validatePeekRes })],',
    "});",
  ].join("\n")))), /路由名 "shop\.peek" 必须是 "room\.<method>"/u);

  assert.throws(() => readFeatureDescriptors(withFixtureDomain(makeDomain([
    "export default defineLobbyRpcDomain({",
    '    domain: "chamber",',
    "    errorCodes: [],",
    '    routes: [defineRpcQuery("chamber.peek", { request: validatePeekReq, response: validatePeekRes })],',
    "});",
  ].join("\n")))), /descriptor\.domain \("chamber"\) 必须等于文件名 \("room"\)/u);
});

// ── 阶段 3 退出条件：fixture domain 增量 ────────────────────────────────────

const FIXTURE_ROOM_DOMAIN = [
  'import { type RuntimeValidator } from "../../http";',
  'import { defineLobbyPush, defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";',
  "export interface IRoomPeekReq {}",
  "export interface IRoomPeekRes { ok: boolean; }",
  "export interface IRoomCommitReq { clientReqId: string; }",
  "export interface IRoomCommitRes { ok: boolean; }",
  "export interface IRoomEventPush { seq: number; }",
  "export const validateRoomPeekReq: RuntimeValidator<IRoomPeekReq> = () => ({});",
  "export const validateRoomPeekRes: RuntimeValidator<IRoomPeekRes> = () => ({ ok: true });",
  "export const validateRoomCommitReq: RuntimeValidator<IRoomCommitReq> = () => (undefined as never);",
  "export const validateRoomCommitRes: RuntimeValidator<IRoomCommitRes> = () => ({ ok: true });",
  "export const validateRoomEventPush: RuntimeValidator<IRoomEventPush> = () => ({ seq: 1 });",
  "export default defineLobbyRpcDomain({",
  '    domain: "room",',
  '    errorCodes: ["ROOM_TEST_FAILED"],',
  '    pushes: [defineLobbyPush("RoomEvent", "room.event", validateRoomEventPush)],',
  "    routes: [",
  '        defineRpcQuery("room.peek", { request: validateRoomPeekReq, response: validateRoomPeekRes }),',
  '        defineRpcIdempotentWrite("room.commit", { request: validateRoomCommitReq, response: validateRoomCommitRes }),',
  "    ],",
  "});",
  "",
].join("\n");

test("退出条件：新增 fixture domain 只加 domains/room.ts，生成 registry 即收录，人工中央源码零改", () => {
  const { root, options } = createFixture();
  const before = snapshotHandwritten(root);
  fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/room.ts"), FIXTURE_ROOM_DOMAIN);
  const result = writeFeatureArtifacts(options);
  assert.deepEqual(result.changed, [REGISTRY_RELATIVE], "只允许 registry 一件产物变化");
  assert.deepEqual(result.deleted, []);
  const after = snapshotHandwritten(root);
  assert.deepEqual([...after.keys()].filter((key) => !before.has(key)), [`${LOBBY_RPC_DIR}/domains/room.ts`]);
  for (const [key, bytes] of before) {
    assert.equal(after.get(key), bytes, `人工源码被生成器改动：${key}`);
  }

  const registry = fs.readFileSync(path.join(root, REGISTRY_RELATIVE), "utf8");
  assert.match(registry, /^ {4}"room",$/mu, "LOBBY_RPC_DOMAINS 收录 room");
  assert.match(registry, /^ {4}"room\.peek": "query",$/mu);
  assert.match(registry, /^ {4}"room\.commit": "idempotent-write",$/mu);
  assert.match(registry, /^ {4}\| "room\.commit"[;,]?$/mu, "LobbyRpcIdemType 显式收录 room.commit");
  assert.ok(registry.includes('RoomEvent: "room.event",'), "LobbyPush 聚合 room.event");
  assert.ok(
    registry.indexOf('"INTERNAL",') < registry.indexOf('"ROOM_TEST_FAILED",'),
    "未上钉的新码追加在历史钉之后",
  );
  assertFeatureArtifactsFresh(options); // 写盘后新鲜
});

// ── 阶段 4：operation group 所有权 + contractVersion（§6.11/§6.13） ──────────

/** fixture room 域模板：head 固定，descriptor 段由调用方拼。 */
const stage4DomainHead = [
  'import { type RuntimeValidator } from "../../http";',
  'import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";',
  "export interface IRoomPeekReq {}",
  "export interface IRoomPeekRes { ok: boolean; }",
  "export interface IRoomCommitReq { clientReqId: string; }",
  "export interface IRoomCommitRes { ok: boolean; }",
  "export const validateRoomPeekReq: RuntimeValidator<IRoomPeekReq> = () => ({});",
  "export const validateRoomPeekRes: RuntimeValidator<IRoomPeekRes> = () => ({ ok: true });",
  "export const validateRoomCommitReq: RuntimeValidator<IRoomCommitReq> = () => (undefined as never);",
  "export const validateRoomCommitRes: RuntimeValidator<IRoomCommitRes> = () => ({ ok: true });",
].join("\n");

function stage4Domain(descriptor: string): string {
  return `${stage4DomainHead}\n${descriptor}\n`;
}

const STAGE4_ROOM_DOMAIN = stage4Domain([
  "export default defineLobbyRpcDomain({",
  '    domain: "room",',
  "    errorCodes: [],",
  '    ownsOperationGroups: ["roomOps"],',
  "    routes: [",
  '        defineRpcQuery("room.peek", { request: validateRoomPeekReq, response: validateRoomPeekRes, inspectsOperationGroup: "roomOps" }),',
  '        defineRpcIdempotentWrite("room.commit", { request: validateRoomCommitReq, response: validateRoomCommitRes, contractVersion: 3, operationGroup: "roomOps", inspectable: true }),',
  "    ],",
  "});",
].join("\n"));

test("阶段 4 fixture：operationGroup/inspectable/inspects/contractVersion 经生成进四张表", () => {
  const { root, options } = createFixture();
  fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/room.ts"), STAGE4_ROOM_DOMAIN);
  writeFeatureArtifacts(options);
  const registry = fs.readFileSync(path.join(root, REGISTRY_RELATIVE), "utf8");
  assert.match(registry, /^ {4}"room\.commit": "roomOps",$/mu, "LOBBY_RPC_OPERATION_GROUPS 收录写路由");
  const inspectableBlock = registry.match(/LOBBY_RPC_INSPECTABLE[^;]+;/u)?.[0] ?? "";
  assert.match(inspectableBlock, /"room\.commit",/u, "LOBBY_RPC_INSPECTABLE 收录写路由");
  const inspectsBlock = registry.match(/LOBBY_RPC_INSPECTS[^;]+;/u)?.[0] ?? "";
  assert.match(inspectsBlock, /"room\.peek": "roomOps",/u, "LOBBY_RPC_INSPECTS 收录查询路由");
  const versionsBlock = registry.match(/LOBBY_RPC_CONTRACT_VERSIONS[^;]+;/u)?.[0] ?? "";
  assert.match(versionsBlock, /"room\.commit": 3,/u, "显式 contractVersion 逐字进表");
  assert.match(versionsBlock, /"room\.peek": 1,/u, "未声明的路由缺省 1");
  assert.match(versionsBlock, /"user\.updateProfile": 1,/u);
  assertFeatureArtifactsFresh(options);
});

test("operation group 所有权 fail closed：无主/越权/跨域重复/无组可查全部点名拒绝", () => {
  const withRoomDomain = (source: string): FeatureCodegenOptions => {
    const { root, options } = createFixture();
    fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/room.ts"), source);
    return options;
  };

  // 路由声明了组但本域未 ownsOperationGroups → 拒绝
  assert.throws(() => readFeatureDescriptors(withRoomDomain(stage4Domain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    routes: [defineRpcIdempotentWrite("room.commit", { request: validateRoomCommitReq, response: validateRoomCommitRes, operationGroup: "roomOps" })],',
    "});",
  ].join("\n")))), /必须先由本域 ownsOperationGroups 声明所有权/u);

  // inspectable 无 operationGroup → 拒绝
  assert.throws(() => readFeatureDescriptors(withRoomDomain(stage4Domain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    ownsOperationGroups: ["roomOps"],',
    '    routes: [defineRpcIdempotentWrite("room.commit", { request: validateRoomCommitReq, response: validateRoomCommitRes, inspectable: true })],',
    "});",
  ].join("\n")))), /声明了 inspectable 但缺 operationGroup/u);

  // inspects 引用无主组 → 拒绝
  assert.throws(() => readFeatureDescriptors(withRoomDomain(stage4Domain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    routes: [defineRpcQuery("room.peek", { request: validateRoomPeekReq, response: validateRoomPeekRes, inspectsOperationGroup: "ghostOps" })],',
    "});",
  ].join("\n")))), /"ghostOps" 无任何域声明所有权/u);

  // 跨域重复所有权 → 重复 id 拒绝清单
  {
    const { root, options } = createFixture();
    fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/room.ts"), STAGE4_ROOM_DOMAIN);
    fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/annex.ts"), stage4Domain([
      "export default defineLobbyRpcDomain({",
      '    domain: "annex",',
      "    errorCodes: [],",
      '    ownsOperationGroups: ["roomOps"],',
      '    routes: [defineRpcQuery("annex.peek", { request: validateRoomPeekReq, response: validateRoomPeekRes })],',
      "});",
    ].join("\n")));
    assert.throws(() => readFeatureDescriptors(options), /operationGroup "roomOps" 同时由/u);
  }

  // 暴露表：key 必须是本域拥有的组、consumer 必须存在且非自身
  assert.throws(() => readFeatureDescriptors(withRoomDomain(stage4Domain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    exposesOperationGroupTo: { ghostOps: ["user"] },',
    '    routes: [defineRpcQuery("room.peek", { request: validateRoomPeekReq, response: validateRoomPeekRes })],',
    "});",
  ].join("\n")))), /只能暴露自己拥有的组/u);
  assert.throws(() => readFeatureDescriptors(withRoomDomain(stage4Domain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    ownsOperationGroups: ["roomOps"],',
    '    exposesOperationGroupTo: { roomOps: ["phantom"] },',
    '    routes: [defineRpcQuery("room.peek", { request: validateRoomPeekReq, response: validateRoomPeekRes })],',
    "});",
  ].join("\n")))), /引用了不存在的域 "phantom"/u);
  assert.throws(() => readFeatureDescriptors(withRoomDomain(stage4Domain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    '    ownsOperationGroups: ["roomOps"],',
    '    exposesOperationGroupTo: { roomOps: ["room"] },',
    '    routes: [defineRpcQuery("room.peek", { request: validateRoomPeekReq, response: validateRoomPeekRes })],',
    "});",
  ].join("\n")))), /不需要（也不允许）列出本域自身/u);
});

test("跨域 inspects：缺 exposesOperationGroupTo 即 fail closed，显式暴露后放行", () => {
  // 与 room 域符号不重名（registry import 唯一性闸先于生成）
  const annexInspects = [
    'import { type RuntimeValidator } from "../../http";',
    'import { defineLobbyRpcDomain, defineRpcQuery } from "../defineDomain";',
    "export interface IAnnexPeekReq {}",
    "export interface IAnnexPeekRes { ok: boolean; }",
    "export const validateAnnexPeekReq: RuntimeValidator<IAnnexPeekReq> = () => ({});",
    "export const validateAnnexPeekRes: RuntimeValidator<IAnnexPeekRes> = () => ({ ok: true });",
    "export default defineLobbyRpcDomain({",
    '    domain: "annex",',
    "    errorCodes: [],",
    '    routes: [defineRpcQuery("annex.peek", { request: validateAnnexPeekReq, response: validateAnnexPeekRes, inspectsOperationGroup: "roomOps" })],',
    "});",
    "",
  ].join("\n");

  // 未暴露：拒绝
  {
    const { root, options } = createFixture();
    fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/room.ts"), STAGE4_ROOM_DOMAIN);
    fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/annex.ts"), annexInspects);
    assert.throws(() => readFeatureDescriptors(options),
      /属于域 room，且未经 exposesOperationGroupTo\["roomOps"\] 显式暴露给 annex/u);
  }
  // owner 显式暴露：放行且 generated 表收录
  {
    const { root, options } = createFixture();
    fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/room.ts"), STAGE4_ROOM_DOMAIN.replace(
      '    ownsOperationGroups: ["roomOps"],',
      '    ownsOperationGroups: ["roomOps"],\n    exposesOperationGroupTo: { roomOps: ["annex"] },',
    ));
    fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/annex.ts"), annexInspects);
    writeFeatureArtifacts(options);
    const registry = fs.readFileSync(path.join(root, REGISTRY_RELATIVE), "utf8");
    assert.match(registry, /^ {4}"annex\.peek": "roomOps",$/mu, "获准跨域查询的路由进 LOBBY_RPC_INSPECTS");
  }
});

test("contractVersion AST 校验：非数字字面量 / 0 / 小数一律点名拒绝", () => {
  const build = (literal: string): string => stage4Domain([
    "export default defineLobbyRpcDomain({",
    '    domain: "room",',
    "    errorCodes: [],",
    `    routes: [defineRpcQuery("room.peek", { request: validateRoomPeekReq, response: validateRoomPeekRes, contractVersion: ${literal} })],`,
    "});",
  ].join("\n"));
  assert.doesNotThrow(() => parseDomainModule(build("2"), "fixture"));
  assert.throws(() => parseDomainModule(build('"2"'), "fixture"), /必须是数字字面量/u);
  assert.throws(() => parseDomainModule(build("0"), "fixture"), /≥1 的安全整数/u);
  assert.throws(() => parseDomainModule(build("1.5"), "fixture"), /≥1 的安全整数/u);
});

test("删除保护：域源文件消失必须显式 --allow-delete，放行后 registry 同步收缩", () => {
  const { root, options } = createFixture();
  fs.rmSync(path.join(root, LOBBY_RPC_DIR, "domains/guild.ts"));
  assert.throws(() => writeFeatureArtifacts(options), /--allow-delete/u);
  const result = writeFeatureArtifacts({ ...options, allowDelete: ["guild"] });
  assert.deepEqual(result.deleted, ["guild"]);
  const registry = fs.readFileSync(path.join(root, REGISTRY_RELATIVE), "utf8");
  assert.ok(!registry.includes('"guild.join"'), "guild 路由必须随域删除消失");
  assert.ok(!/^ {4}"guild",$/mu.test(registry));
});

test("渲染确定性：相同输入重复渲染字节相同", () => {
  const descriptors = readFeatureDescriptors();
  const first = renderFeatureArtifacts(descriptors);
  const second = renderFeatureArtifacts(readFeatureDescriptors());
  assert.deepEqual([...first.keys()], [REGISTRY_RELATIVE]);
  assert.equal(first.get(REGISTRY_RELATIVE), second.get(REGISTRY_RELATIVE));
});

test("CLI 沿用惯例：--check、--root <dir>/--root=<dir>、--allow-delete；重复/未知参数 throw", () => {
  assert.deepEqual(parseCli([]), { check: false });
  assert.deepEqual(parseCli(["--check"]), { check: true });
  assert.deepEqual(parseCli(["--root", "/tmp/x"]), { check: false, repositoryRoot: "/tmp/x" });
  assert.deepEqual(parseCli(["--root=/tmp/x"]), { check: false, repositoryRoot: "/tmp/x" });
  assert.deepEqual(parseCli(["--allow-delete", "guild"]), { check: false, allowDelete: ["guild"] });
  assert.deepEqual(parseCli(["--allow-delete=guild"]), { check: false, allowDelete: ["guild"] });
  assert.throws(() => parseCli(["--check", "--check"]), /duplicate/u);
  assert.throws(() => parseCli(["--root"]), /--root/u);
  assert.throws(() => parseCli(["--allow-delete", "guild", "--allow-delete", "guild"]), /duplicate/u);
  assert.throws(() => parseCli(["--check", "--allow-delete", "guild"]), /read-only/u);
  assert.throws(() => parseCli(["--mystery"]), /unknown argument/u);
});
