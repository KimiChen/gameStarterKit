/**
 * codegen:features 全闸（Non-intrusive §4.2/§5.5 阶段 3；§7.5 阶段 6 扩展）。
 *
 * 覆盖：freshness 对真仓（registry + 客户端三件产物，apps/client 非 workspace 故其
 * freshness 沿 §5.4 口径由本测试断言）、mkdtemp 隔离根、--check 只读三态
 * （stale/missing/extra 点名）、运行时 descriptor ⇔ generated 表双向对拍、domain 文件
 * 形态负例、重复 id 拒绝、幂等路由 clientReqId 的 AST 层校验反例、错误码顺序钉、
 * 删除保护、「新增 fixture domain 只加文件不改人工中央源码」的阶段 3 退出条件，以及
 * 阶段 6 的 View catalog 闸：fixture view sidecar 增量（三产物收录、既有条目字节不动、
 * 手写源零 diff）、sidecar⇔View 双向、owner/logic 校验、aliasOf 迁移期兼容、
 * sharedPkgs 闭包 fail-fast、删除走 --allow-delete。
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
  LOBBY_RPC_DOMAIN_CONTRACTS,
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
import type { LobbyRpcDomainDescriptor } from "../../shared/src/protocol/lobbyRpc/defineDomain";
import {
  CORE_LOBBY_PUSHES,
  CORE_RPC_ERROR_CODES,
  RPC_ERR_CODE_ORDER,
} from "../../shared/src/protocol/lobbyRpc/coreErrors";
import { parseCoreErrorsModule, parseDomainModule } from "../tools/feature-codegen/astReader";
import {
  assertFeatureArtifactsFresh,
  assertWriterOutputSetSafe,
  parseCli,
  readFeatureDescriptors,
  readVectorSidecars,
  renderFeatureArtifacts,
  VECTORS_INDEX_RELATIVE,
  writeFeatureArtifacts,
  type FeatureCodegenOptions,
} from "../tools/feature-codegen/lib";
import {
  FEATURE_INDEX_RELATIVE,
  FEATURES_RELATIVE,
  FGUI_CONTRACTS_RELATIVE,
  VIEWS_RELATIVE,
  readViewCatalog,
  renderFeatureIndex,
  renderViewCatalogArtifacts,
} from "../tools/feature-codegen/viewCatalog";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LOBBY_RPC_DIR = "apps/shared/src/protocol/lobbyRpc";
const REGISTRY_RELATIVE = `${LOBBY_RPC_DIR}/registry.generated.ts`;
const CLIENT_ARTIFACTS = [FGUI_CONTRACTS_RELATIVE, VIEWS_RELATIVE, FEATURES_RELATIVE] as const;
const VECTORS_DIR = "apps/server/test/lobbyRpcVectors";
const ALL_ARTIFACTS = [REGISTRY_RELATIVE, ...CLIENT_ARTIFACTS, FEATURE_INDEX_RELATIVE, VECTORS_INDEX_RELATIVE] as const;

/**
 * 隔离根：拷贝生成器的全部输入面（lobbyRpc + features + 客户端 view/logic/generated +
 * art XML——闭包计算只读 XML，图集/位图不拷）。
 */
function createFixture(): { readonly root: string; readonly options: FeatureCodegenOptions } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feature-codegen-"));
  // apps/client/src/features 是 feature 目录形态（PLUGIN.md §6.1 插件标准形态）的源目录：真仓无插件时不存在，按需拷。
  for (const dir of [LOBBY_RPC_DIR, "features", "apps/plugins", "apps/client/src/view", "apps/client/src/logic", "apps/client/src/features", "apps/client/src/generated", VECTORS_DIR, "apps/shared/schema/gameplays"]) {
    if ((dir === "apps/client/src/features" || dir === "apps/plugins") && !fs.existsSync(path.join(REPOSITORY_ROOT, dir))) continue;
    fs.cpSync(path.join(REPOSITORY_ROOT, dir), path.join(root, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.cpSync(path.join(REPOSITORY_ROOT, FEATURE_INDEX_RELATIVE), path.join(root, FEATURE_INDEX_RELATIVE));
  fs.cpSync(
    path.join(REPOSITORY_ROOT, "apps/art/fairygui/assets"),
    path.join(root, "apps/art/fairygui/assets"),
    {
      recursive: true,
      filter: (source) => fs.statSync(source).isDirectory() || source.endsWith(".xml"),
    },
  );
  return { root, options: { repositoryRoot: root } };
}

/** 生成器输入/输出树里除四件生成物外全部文件的字节快照（证明生成器不改人工源码）。 */
function snapshotHandwritten(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const generated = new Set<string>(ALL_ARTIFACTS);
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (generated.has(relative)) continue;
      out.set(relative, fs.readFileSync(full, "utf8"));
    }
  };
  for (const dir of [LOBBY_RPC_DIR, "features", "apps/plugins", "apps/client/src/view", "apps/client/src/logic", "apps/client/src/features", "apps/client/src/generated", "apps/art/fairygui/assets", "docs", VECTORS_DIR]) {
    const base = path.join(root, dir);
    if (fs.existsSync(base)) walk(base);
  }
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
  // 改 descriptor 必须同批 bump 域 contractVersion，否则会先被域契约闸拦住（单独有用例钉闸）。
  fs.writeFileSync(shopFile, shopSource
    .replace('"ORDER_MISMATCH",', '"ORDER_MISMATCH",\n        "SHOP_TEST_ONLY",')
    .replace('    domain: "shop",', '    domain: "shop",\n    contractVersion: 2,'));
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

test("descriptor 运行时值 ⇔ generated 表双向相等（route/mode/errorCodes/pushes 全覆盖）", async () => {
  // ⛔ 不手写域列表：按 generated LOBBY_RPC_DOMAINS 发现并动态 import 各域 descriptor（新增域本文件不动）。
  const domains = await Promise.all(
    [...LOBBY_RPC_DOMAINS].sort().map(async (domain) => {
      const module = await import(`../../shared/src/protocol/lobbyRpc/domains/${domain}`) as {
        readonly default: LobbyRpcDomainDescriptor;
      };
      return module.default;
    }),
  );
  assert.deepEqual(domains.map((d) => d.domain).sort(), [...LOBBY_RPC_DOMAINS].sort());
  for (const domain of domains) {
    assert.equal(LOBBY_RPC_DOMAIN_CONTRACTS[domain.domain]?.contractVersion, domain.contractVersion,
      `${domain.domain} 的域 contractVersion 必须与 generated LOBBY_RPC_DOMAIN_CONTRACTS 一致`);
  }

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
  // 未上钉尾段按规则独立重算（⛔ 不再硬编码域清单：插件域进来不得需要改本测试——PLUGIN.md §3）。
  const pinned = new Set<string>(RPC_ERR_CODE_ORDER);
  const unpinnedCore = CORE_RPC_ERROR_CODES.filter((code) => !pinned.has(code));
  const unpinnedByDomain = [...domains]
    .sort((a, b) => (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0))
    .flatMap((d) => [...d.errorCodes].filter((code) => !pinned.has(code)));
  assert.deepEqual(
    [...RPC_ERR_CODES],
    [...RPC_ERR_CODE_ORDER, ...unpinnedCore, ...unpinnedByDomain],
    "钉表 15 码逐字复现拆分前 envelope.ts 顺序；未上钉新码按「core 声明序 → 域名序 → 域内声明序」追加");
  // 历史回归钉：阶段 4 的两个 core 码紧随钉表；阶段 8 的 room 域码按域内声明序连续出现。
  assert.deepEqual(unpinnedCore, ["OPERATION_CONFLICT", "OPERATION_RESULT_EXPIRED"]);
  const roomCodes = ["ROOM_CODE_UNAVAILABLE", "ROOM_FULL", "ROOM_START_IN_PROGRESS", "ROOM_QUOTA_EXCEEDED", "ROOM_SERVICE_UNAVAILABLE", "ROOM_RESULT_UNKNOWN"];
  const roomStart = RPC_ERR_CODES.indexOf("ROOM_CODE_UNAVAILABLE");
  assert.deepEqual([...RPC_ERR_CODES].slice(roomStart, roomStart + roomCodes.length), roomCodes);

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

// ⚠ 阶段 8 起真仓已有 domains/room.ts（私房 prepareCreate/resolve），fixture 域改名 chamber
// 以保持「新增 domain 只加一个新文件」的退出条件语义不变。
const FIXTURE_CHAMBER_DOMAIN = [
  'import { type RuntimeValidator } from "../../http";',
  'import { defineLobbyPush, defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";',
  "export interface IChamberPeekReq {}",
  "export interface IChamberPeekRes { ok: boolean; }",
  "export interface IChamberCommitReq { clientReqId: string; }",
  "export interface IChamberCommitRes { ok: boolean; }",
  "export interface IChamberEventPush { seq: number; }",
  "export const validateChamberPeekReq: RuntimeValidator<IChamberPeekReq> = () => ({});",
  "export const validateChamberPeekRes: RuntimeValidator<IChamberPeekRes> = () => ({ ok: true });",
  "export const validateChamberCommitReq: RuntimeValidator<IChamberCommitReq> = () => (undefined as never);",
  "export const validateChamberCommitRes: RuntimeValidator<IChamberCommitRes> = () => ({ ok: true });",
  "export const validateChamberEventPush: RuntimeValidator<IChamberEventPush> = () => ({ seq: 1 });",
  "export default defineLobbyRpcDomain({",
  '    domain: "chamber",',
  '    errorCodes: ["CHAMBER_TEST_FAILED"],',
  '    pushes: [defineLobbyPush("ChamberEvent", "chamber.event", validateChamberEventPush)],',
  "    routes: [",
  '        defineRpcQuery("chamber.peek", { request: validateChamberPeekReq, response: validateChamberPeekRes }),',
  '        defineRpcIdempotentWrite("chamber.commit", { request: validateChamberCommitReq, response: validateChamberCommitRes }),',
  "    ],",
  "});",
  "",
].join("\n");

/** annex 域（阶段 4 跨域 inspects 夹具）的最小向量 sidecar：domain 一旦写盘就必须配对，否则生成器点名缺失。 */
const FIXTURE_ANNEX_VECTORS = [
  'import type { LobbyRpcVectorFile } from "./vectorTypes";',
  "",
  "export default {",
  '  "annex.peek": { request: {}, response: { ok: true } },',
  "} satisfies LobbyRpcVectorFile;",
  "",
].join("\n");

/** chamber 域的最小向量 sidecar（fixture 内只做存在性/登记表断言，⛔ 不执行）。 */
const FIXTURE_CHAMBER_VECTORS = [
  'import type { LobbyRpcVectorFile } from "./vectorTypes";',
  "",
  "export default {",
  '  "chamber.peek": { request: {}, response: { ok: true } },',
  '  "chamber.commit": { request: { clientReqId: "c1" }, response: { ok: true } },',
  "} satisfies LobbyRpcVectorFile;",
  "",
].join("\n");

test("向量 sidecar ⇔ domain 双向对齐：孤儿 sidecar 与缺失 sidecar 都必须 fail-fast", () => {
  const { root, options } = createFixture();
  try {
    assertFeatureArtifactsFresh(options);
    // 孤儿：sidecar 没有对应 domain（域已删除但向量没删）。
    fs.writeFileSync(path.join(root, VECTORS_DIR, "ghost.ts"), FIXTURE_CHAMBER_VECTORS);
    assert.throws(() => assertFeatureArtifactsFresh(options), /lobbyRpcVectors\/ghost\.ts.*没有对应的 domain descriptor/u);
    assert.throws(() => writeFeatureArtifacts(options), /ghost\.ts/u);
    fs.rmSync(path.join(root, VECTORS_DIR, "ghost.ts"));
    // 缺失：domain 在、sidecar 没了。
    fs.rmSync(path.join(root, VECTORS_DIR, "guild.ts"));
    assert.throws(() => assertFeatureArtifactsFresh(options), /lobbyRpcVectors\/guild\.ts: missing required file/u);
    // 只读发现函数直接暴露同一判定（供其他工具复用）。
    assert.throws(() => readVectorSidecars(root, readFeatureDescriptors(options)), /guild\.ts/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("退出条件：新增 fixture domain 只加 domains/chamber.ts + 向量 sidecar，生成 registry/向量表即收录，人工中央源码零改", () => {
  const { root, options } = createFixture();
  const before = snapshotHandwritten(root);
  fs.writeFileSync(path.join(root, LOBBY_RPC_DIR, "domains/chamber.ts"), FIXTURE_CHAMBER_DOMAIN);
  // 只有 descriptor 没有向量 sidecar：生成器点名缺失（新增域必须同批带最小合法向量），⛔ 不静默。
  assert.throws(() => writeFeatureArtifacts(options), /lobbyRpcVectors\/chamber\.ts: missing required file/u);
  fs.writeFileSync(path.join(root, VECTORS_DIR, "chamber.ts"), FIXTURE_CHAMBER_VECTORS);
  const result = writeFeatureArtifacts(options);
  assert.deepEqual(result.changed, [REGISTRY_RELATIVE, VECTORS_INDEX_RELATIVE],
    "只允许 registry 与向量登记表两件产物变化");
  assert.deepEqual(result.deleted, []);
  const after = snapshotHandwritten(root);
  assert.deepEqual(
    [...after.keys()].filter((key) => !before.has(key)).sort(),
    [`${VECTORS_DIR}/chamber.ts`, `${LOBBY_RPC_DIR}/domains/chamber.ts`].sort(),
  );
  const vectorsIndex = fs.readFileSync(path.join(root, VECTORS_INDEX_RELATIVE), "utf8");
  assert.match(vectorsIndex, /^import chamberVectors from "\.\/chamber";$/mu, "向量登记表静态 import 新 sidecar");
  assert.match(vectorsIndex, /^ {4}chamber: chamberVectors,$/mu);
  for (const [key, bytes] of before) {
    assert.equal(after.get(key), bytes, `人工源码被生成器改动：${key}`);
  }

  const registry = fs.readFileSync(path.join(root, REGISTRY_RELATIVE), "utf8");
  assert.match(registry, /^ {4}"chamber",$/mu, "LOBBY_RPC_DOMAINS 收录 chamber");
  assert.match(registry, /^ {4}"chamber\.peek": "query",$/mu);
  assert.match(registry, /^ {4}"chamber\.commit": "idempotent-write",$/mu);
  assert.match(registry, /^ {4}\| "chamber\.commit"[;,]?$/mu, "LobbyRpcIdemType 显式收录 chamber.commit");
  assert.ok(registry.includes('ChamberEvent: "chamber.event",'), "LobbyPush 聚合 chamber.event");
  assert.ok(
    registry.indexOf('"INTERNAL",') < registry.indexOf('"CHAMBER_TEST_FAILED",'),
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
  "    contractVersion: 2,",
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
    fs.writeFileSync(path.join(root, VECTORS_DIR, "annex.ts"), FIXTURE_ANNEX_VECTORS);
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
  // 域删了但向量 sidecar 还在：即使显式 --allow-delete 也拒绝——sidecar 必须同批删除（⛔ 不留孤儿）。
  assert.throws(
    () => writeFeatureArtifacts({ ...options, allowDelete: ["guild"] }),
    /lobbyRpcVectors\/guild\.ts.*没有对应的 domain descriptor/u,
  );
  fs.rmSync(path.join(root, VECTORS_DIR, "guild.ts"));
  const result = writeFeatureArtifacts({ ...options, allowDelete: ["guild"] });
  assert.deepEqual(result.deleted, ["guild"]);
  assert.ok(!fs.readFileSync(path.join(root, VECTORS_INDEX_RELATIVE), "utf8").includes("guildVectors"),
    "向量登记表必须随域删除收缩");
  const registry = fs.readFileSync(path.join(root, REGISTRY_RELATIVE), "utf8");
  assert.ok(!registry.includes('"guild.join"'), "guild 路由必须随域删除消失");
  assert.ok(!/^ {4}"guild",$/mu.test(registry));
});

test("渲染确定性：相同输入重复渲染字节相同（registry + 客户端三件）", () => {
  const descriptors = readFeatureDescriptors();
  const catalog = readViewCatalog(REPOSITORY_ROOT);
  const first = renderFeatureArtifacts(descriptors, catalog);
  const second = renderFeatureArtifacts(readFeatureDescriptors(), readViewCatalog(REPOSITORY_ROOT));
  assert.deepEqual([...first.keys()], [...ALL_ARTIFACTS]);
  for (const relative of ALL_ARTIFACTS) {
    assert.equal(first.get(relative), second.get(relative), `${relative} 渲染不确定`);
  }
});

// ── 阶段 6：View catalog（features + sidecar + XML → 客户端三产物） ──────────

const FIXTURE_PKG_ID = "zzfx0001";
const FIXTURE_PKG_NAME = "View_Fixture_Fx";

const FIXTURE_PACKAGE_XML = [
  `<?xml version="1.0" encoding="utf-8"?>`,
  `<packageDescription id="${FIXTURE_PKG_ID}">`,
  "  <resources>",
  `    <component id="fx000001" name="Fx.xml" exported="true"/>`,
  "  </resources>",
  "</packageDescription>",
  "",
].join("\n");

const FIXTURE_COMPONENT_XML = [
  `<?xml version="1.0" encoding="utf-8"?>`,
  `<component size="200,200">`,
  "  <displayList>",
  `    <text id="n0_fx1" name="txt_fx" xy="0,0" size="100,30" text=""/>`,
  `    <component id="n1_fx1" name="btn_go" src="vjb22f" fileName="BtnCommon210x70.xml" pkg="qdouwnr2" xy="0,50" size="100,30"/>`,
  "  </displayList>",
  "</component>",
  "",
].join("\n");

function fixtureSidecar(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    owner: "builtin",
    kind: "fgui",
    layer: "popup",
    fullscreen: true,
    onlyOne: true,
    permanent: false,
    interactive: true,
    package: FIXTURE_PKG_NAME,
    component: "Fx",
    logic: "apps/client/src/logic/page/FxLogic.ts",
    sharedPkgs: ["ui/Common_Btn", "ui/Common_RGBA"],
    ...overrides,
  }, null, 2)}\n`;
}

/** 在隔离根加入一个 fixture view（sidecar + 假 XML + View/Logic 桩 + feature.json 登记）。 */
function addFixtureView(root: string): void {
  const artDir = path.join(root, "apps/art/fairygui/assets", FIXTURE_PKG_NAME);
  fs.mkdirSync(artDir, { recursive: true });
  fs.writeFileSync(path.join(artDir, "package.xml"), FIXTURE_PACKAGE_XML);
  fs.writeFileSync(path.join(artDir, "Fx.xml"), FIXTURE_COMPONENT_XML);
  fs.writeFileSync(path.join(root, "apps/client/src/view/FxView.ts"), "export class FxView {}\n");
  fs.writeFileSync(path.join(root, "apps/client/src/view/FxView.view.json"), fixtureSidecar());
  fs.writeFileSync(path.join(root, "apps/client/src/logic/page/FxLogic.ts"), "export class FxLogic {}\n");
  const manifestFile = path.join(root, "features/built-in/feature.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.views.push("apps/client/src/view/FxView.view.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * 在隔离根加入一个 fixture cocos view（无 FGUI 段；可选挂路由 / 可选声明 group+restore）。
 * `route:true` 是「它是页面」的唯一信号——⛔ sidecar 里没有第二个标记字段可用。
 */
function addFixtureCocosView(
  root: string,
  options: { readonly route?: boolean; readonly restore?: boolean } = {},
): void {
  fs.writeFileSync(path.join(root, "apps/client/src/view/CxView.ts"), "export class CxView {}\n");
  fs.writeFileSync(
    path.join(root, "apps/client/src/view/CxView.view.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      owner: "builtin",
      kind: "cocos",
      layer: "base",
      fullscreen: true,
      onlyOne: true,
      permanent: false,
      interactive: false,
      logic: "apps/client/src/logic/page/CxLogic.ts",
      ...(options.restore === false ? {} : { group: "authenticated", restore: "reopen" }),
    }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(root, "apps/client/src/logic/page/CxLogic.ts"), "export class CxLogic {}\n");
  const manifestFile = path.join(root, "features/built-in/feature.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.views.push("apps/client/src/view/CxView.view.json");
  if (options.route) manifest.routes.push({ id: "cx", view: "Cx" });
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

test("cocos View 进 ViewMgr catalog 的判别信号 = 被 feature routes 引用（⛔ 无标记字段）", () => {
  {
    // 未挂路由：玩法表现件形态（BallMove/SnakeWorld 同款）——只进源文件清单。
    const { root, options } = createFixture();
    addFixtureCocosView(root, { restore: false });
    writeFeatureArtifacts(options);
    const views = fs.readFileSync(path.join(root, VIEWS_RELATIVE), "utf8");
    assert.match(views, /\{ name: "Cx", owner: "builtin", kind: "cocos", /u,
      "未挂路由的 cocos View 仍必须出现在 VIEW_SOURCE_RECORDS");
    assert.doesNotMatch(views, /^ {4}Cx: defineView\(\{/mu,
      "未被任何 route 引用的 cocos View ⛔ 不得进 ViewMgr catalog");
  }
  {
    // 挂了路由：页面形态——进 catalog，且结构上没有 FGUI 段。
    const { root, options } = createFixture();
    addFixtureCocosView(root, { route: true });
    writeFeatureArtifacts(options);
    const views = fs.readFileSync(path.join(root, VIEWS_RELATIVE), "utf8");
    const entry = /^ {4}Cx: defineView\(\{\n([\s\S]*?)^ {4}\}\),$/mu.exec(views);
    assert.ok(entry, "被 route 引用的 cocos View 必须进 ViewMgr catalog");
    assert.match(entry[1], /name: "Cx", kind: "cocos", layer: "base",/u);
    assert.doesNotMatch(entry[1], /contract:|sharedPkgs:/u,
      "cocos catalog 条目 ⛔ 不得带 FGUI 段（ViewMeta 判别联合里 CocosViewMeta 没有这些字段）");
    assert.match(entry[1], /load: \(\) => import\("\.\.\/view\/CxView"\)\.then\(\(m\) => m\.CxView\),/u);
    const features = fs.readFileSync(path.join(root, FEATURES_RELATIVE), "utf8");
    assert.match(features, /\{ id: "cx", view: "Cx", group: "authenticated", restore: "reopen" \}/u,
      "cocos 路由与 fgui 路由同形：group/restore 逐字来自 sidecar");
  }
  {
    // 收录放宽 ⛔ 不放宽 group/restore 闸：被路由引用就必须声明恢复策略。
    const { root } = createFixture();
    addFixtureCocosView(root, { route: true, restore: false });
    assert.throws(() => readViewCatalog(root), /必须在 sidecar 声明 group 与 restore/u);
  }
});

test("checked-in client view artifacts are fresh（客户端 freshness 由 server 侧断言，§5.4 口径）", () => {
  // assertFeatureArtifactsFresh 已覆盖四件产物；此处显式核对三件客户端产物在盘上存在。
  for (const relative of CLIENT_ARTIFACTS) {
    assert.ok(fs.existsSync(path.join(REPOSITORY_ROOT, relative)), `${relative} 缺失`);
  }
  assertFeatureArtifactsFresh();
});

test("阶段 6 退出条件：fixture view 只新增文件 + feature.json 登记，三产物收录且既有条目字节不动", () => {
  const { root, options } = createFixture();
  const before = snapshotHandwritten(root);
  const viewsBefore = fs.readFileSync(path.join(root, VIEWS_RELATIVE), "utf8");
  const contractsBefore = fs.readFileSync(path.join(root, FGUI_CONTRACTS_RELATIVE), "utf8");
  addFixtureView(root);

  const result = writeFeatureArtifacts(options);
  // 未挂路由/菜单的 view 只影响 contracts + views 两件；features.generated（feature/
  // route/menu 数据）与 registry 字节不动。
  assert.deepEqual(result.changed, [FGUI_CONTRACTS_RELATIVE, VIEWS_RELATIVE],
    "只允许受影响的客户端产物变化（registry 与手写源零 diff）");
  assert.deepEqual(result.deleted, []);

  // 手写源零 diff：唯一被修改的手写文件是 feature.json（单源登记点），其余只新增。
  const after = snapshotHandwritten(root);
  const added = [...after.keys()].filter((key) => !before.has(key)).sort();
  assert.deepEqual(added, [
    `apps/art/fairygui/assets/${FIXTURE_PKG_NAME}/Fx.xml`,
    `apps/art/fairygui/assets/${FIXTURE_PKG_NAME}/package.xml`,
    "apps/client/src/logic/page/FxLogic.ts",
    "apps/client/src/view/FxView.ts",
    "apps/client/src/view/FxView.view.json",
  ]);
  for (const [key, bytes] of before) {
    if (key === "features/built-in/feature.json") continue; // 测试自己的登记改动
    assert.equal(after.get(key), bytes, `人工源码被生成器改动：${key}`);
  }

  // 三产物收录 fixture view；既有条目逐行字节保留。
  const views = fs.readFileSync(path.join(root, VIEWS_RELATIVE), "utf8");
  assert.match(views, /^ {4}Fx: defineView\(\{$/mu, "catalog 收录 Fx");
  assert.ok(views.includes('load: () => import("../view/FxView").then((m) => m.FxView),'),
    "load 必须是生成的字面量动态 import（铁律 10）");
  assert.match(views, /^ {4}\{ name: "Fx", owner: "builtin", kind: "fgui", pkg: "View_Fixture_Fx", comp: "Fx", /mu,
    "VIEW_SOURCE_RECORDS 收录 Fx");
  for (const line of viewsBefore.split("\n").filter((candidate) => /^ {4}\{ name: /.test(candidate))) {
    assert.ok(views.includes(line), `既有 manifest 条目字节变化：${line}`);
  }
  const contracts = fs.readFileSync(path.join(root, FGUI_CONTRACTS_RELATIVE), "utf8");
  assert.match(contracts, /^export const FX_CONTRACT: FguiContract = \{$/mu);
  assert.ok(contracts.includes('"name": "txt_fx"'), "required 必须从 XML 按 binding 规则算出");
  assert.ok(contracts.includes('"name": "btn_go"'), "required 必须包含带前缀 component 元素");
  for (const line of contractsBefore.split("\n").filter((candidate) => candidate.startsWith("export const "))) {
    assert.ok(contracts.includes(line), `既有契约常量声明消失：${line}`);
  }
  const featuresOut = fs.readFileSync(path.join(root, FEATURES_RELATIVE), "utf8");
  assert.ok(featuresOut.includes('"builtin"'), "features 产物保持 feature 全集");

  assertFeatureArtifactsFresh(options);
});

test("阶段 6 --check 三态：sidecar 变更 → stale 点名客户端产物；删/多余 generated 也红", () => {
  const { root, options } = createFixture();
  assertFeatureArtifactsFresh(options);
  const homeSidecar = path.join(root, "apps/client/src/view/HomeView.view.json");
  const sidecar = JSON.parse(fs.readFileSync(homeSidecar, "utf8"));
  sidecar.layer = "popup";
  fs.writeFileSync(homeSidecar, `${JSON.stringify(sidecar, null, 2)}\n`);
  const viewsFile = path.join(root, VIEWS_RELATIVE);
  const viewsBytes = fs.readFileSync(viewsFile, "utf8");
  assert.throws(() => assertFeatureArtifactsFresh(options), /stale: .*views\.generated\.ts/u);
  assert.equal(fs.readFileSync(viewsFile, "utf8"), viewsBytes, "--check 不得改写生成物");

  writeFeatureArtifacts(options);
  assertFeatureArtifactsFresh(options);
  fs.rmSync(path.join(root, FGUI_CONTRACTS_RELATIVE));
  assert.throws(() => assertFeatureArtifactsFresh(options), /missing: .*fguiContracts\.generated\.ts/u);
  writeFeatureArtifacts(options);
  const bogus = path.join(root, "apps/client/src/generated/bogus.generated.ts");
  fs.writeFileSync(bogus, "export const bogus = 1;\n");
  assert.throws(() => assertFeatureArtifactsFresh(options), /extra: .*bogus\.generated\.ts/u);
  assert.throws(() => writeFeatureArtifacts(options), /bogus\.generated\.ts/u);
});

test("sidecar⇔View 双向：未登记的 *View.ts 红；登记的 sidecar 缺 View/logic 也红", () => {
  {
    const { root } = createFixture();
    fs.writeFileSync(path.join(root, "apps/client/src/view/OrphanView.ts"), "export class OrphanView {}\n");
    assert.throws(() => readViewCatalog(root), /发现未登记的 \*View\.ts/u);
  }
  {
    const { root } = createFixture();
    addFixtureView(root);
    fs.rmSync(path.join(root, "apps/client/src/view/FxView.ts"));
    assert.throws(() => readViewCatalog(root), /FxView\.view\.json → apps\/client\/src\/view\/FxView\.ts: missing required file/u);
  }
  {
    const { root } = createFixture();
    addFixtureView(root);
    fs.rmSync(path.join(root, "apps/client/src/logic/page/FxLogic.ts"));
    assert.throws(() => readViewCatalog(root), /FxLogic\.ts: missing required file/u);
  }
  {
    const { root } = createFixture();
    addFixtureView(root);
    fs.writeFileSync(
      path.join(root, "apps/client/src/view/FxView.view.json"),
      fixtureSidecar({ logic: "apps/client/src/logic/rooms/ballMove/BallMoveGameplay.ts" }),
    );
    assert.throws(() => readViewCatalog(root), /不在 owner "builtin" 的目录/u);
  }
  {
    const { root } = createFixture();
    addFixtureView(root);
    fs.writeFileSync(
      path.join(root, "apps/client/src/view/FxView.view.json"),
      fixtureSidecar({ owner: "phantom" }),
    );
    assert.throws(() => readViewCatalog(root), /owner "phantom" 未在 .*owners 表登记/u);
  }
});

test("sharedPkgs ⊇ 闭包 fail-fast：漏声明依赖包点名拒绝（art 闭包与 assetUrls 所属包同口径）", () => {
  const { root } = createFixture();
  const homeSidecar = path.join(root, "apps/client/src/view/HomeView.view.json");
  const sidecar = JSON.parse(fs.readFileSync(homeSidecar, "utf8"));
  sidecar.sharedPkgs = ["ui/Common_RGBA"];
  fs.writeFileSync(homeSidecar, `${JSON.stringify(sidecar, null, 2)}\n`);
  assert.throws(() => readViewCatalog(root), /HomeView\.view\.json: sharedPkgs 缺依赖包 \["Common_Btn"\]/u);
});

test("aliasOf 迁移期兼容：无 alias 的重复 package\\/component 必败；显式 aliasOf 放行且不产重复所有权", () => {
  const makeAliasFixture = (aliasOf?: string): string => {
    const { root } = createFixture();
    fs.writeFileSync(path.join(root, "apps/client/src/view/HomeNextView.ts"), "export class HomeNextView {}\n");
    fs.writeFileSync(
      path.join(root, "apps/client/src/view/HomeNextView.view.json"),
      fixtureSidecar({
        package: "View_Home_Home",
        component: "Home",
        logic: "apps/client/src/logic/page/HomeLogic.ts",
        ...(aliasOf === undefined ? {} : { aliasOf }),
      }),
    );
    const manifestFile = path.join(root, "features/built-in/feature.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    manifest.views.push("apps/client/src/view/HomeNextView.view.json");
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    return root;
  };

  assert.throws(() => readViewCatalog(makeAliasFixture()), /重复引用/u);
  assert.throws(() => readViewCatalog(makeAliasFixture("HomeNext")), /aliasOf 不得指向自身|aliasOf 必须指向同组件的 canonical View/u);

  const root = makeAliasFixture("Home");
  const catalog = readViewCatalog(root);
  const names = catalog.entries.map((entry) => entry.name);
  assert.ok(names.includes("Home") && names.includes("HomeNext"), "alias 条目与 canonical 同时在册");
  const result = writeFeatureArtifacts({ repositoryRoot: root });
  assert.deepEqual(result.changed, [FGUI_CONTRACTS_RELATIVE, VIEWS_RELATIVE]);
  const views = fs.readFileSync(path.join(root, VIEWS_RELATIVE), "utf8");
  assert.match(views, /^ {4}HomeNext: defineView\(\{$/mu, "alias 条目仍是独立 catalog 键（不抢占 canonical）");
  assertFeatureArtifactsFresh({ repositoryRoot: root });
});

test("阶段 6 删除保护：View 真源消失必须显式 --allow-delete，放行后三产物同步收缩", () => {
  const { root, options } = createFixture();
  addFixtureView(root);
  writeFeatureArtifacts(options);
  assertFeatureArtifactsFresh(options);

  fs.rmSync(path.join(root, "apps/client/src/view/FxView.ts"));
  fs.rmSync(path.join(root, "apps/client/src/view/FxView.view.json"));
  const manifestFile = path.join(root, "features/built-in/feature.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.views = manifest.views.filter((entry: string) => !entry.endsWith("FxView.view.json"));
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  assert.throws(() => writeFeatureArtifacts(options), /--allow-delete/u);
  const result = writeFeatureArtifacts({ ...options, allowDelete: ["Fx"] });
  assert.deepEqual(result.deleted, ["Fx"]);
  const views = fs.readFileSync(path.join(root, VIEWS_RELATIVE), "utf8");
  assert.ok(!views.includes('"Fx"'), "Fx 必须随删除从 manifest 消失");
  assert.ok(!fs.readFileSync(path.join(root, FGUI_CONTRACTS_RELATIVE), "utf8").includes("FX_CONTRACT"));
  assertFeatureArtifactsFresh(options);
});

test("路由/菜单校验：route 引用未登记 View、缺 group\\/restore、menu entryId 重复均点名拒绝", () => {
  {
    const { root } = createFixture();
    const manifestFile = path.join(root, "features/built-in/feature.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    manifest.routes.push({ id: "fx", view: "Fx" });
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => readViewCatalog(root), /route "fx" 引用未登记的 View "Fx"/u);
  }
  {
    const { root } = createFixture();
    addFixtureView(root);
    const manifestFile = path.join(root, "features/built-in/feature.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    manifest.routes.push({ id: "fx", view: "Fx" });
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => readViewCatalog(root), /必须在 sidecar 声明 group 与 restore/u);
  }
  {
    const { root } = createFixture();
    const manifestFile = path.join(root, "features/built-in/feature.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    manifest.menu.push({ ...manifest.menu[0] });
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => readViewCatalog(root), /menu entryId "ballMove" 重复/u);
  }
});

test("入口治理闸：entryId 全仓唯一、一 gameplayId 一贡献者、route 形态 launch 必须引用已登记 route", () => {
  const withSnakeMenu = (mutate: (menu: Record<string, unknown>[]) => void): string => {
    const { root } = createFixture();
    const manifestFile = path.join(root, "features/snake/feature.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    mutate(manifest.menu);
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    return root;
  };
  // entryId 与 builtin 的 ballMove 撞名（跨 feature）。
  assert.throws(
    () => readViewCatalog(withSnakeMenu((menu) => menu.push({
      entryId: "ballMove", label: "x", labelKey: "menu.x", launch: { kind: "gameplay", gameplayId: "idle" },
    }))),
    /menu entryId "ballMove" 已被 feature "builtin" 使用（entryId 全仓唯一）/u,
  );
  // 同一 gameplayId 第二贡献者。
  assert.throws(
    () => readViewCatalog(withSnakeMenu((menu) => menu.push({
      entryId: "snakeAgain", label: "x", labelKey: "menu.x", launch: { kind: "gameplay", gameplayId: "ballMove" },
    }))),
    /玩法 "ballMove" 的入口已由 feature "builtin" 贡献（一 gameplayId 一贡献者）/u,
  );
  // route 形态：引用未登记 route 拒绝；引用他 feature 的已登记 route 放行并渲染。
  assert.throws(
    () => readViewCatalog(withSnakeMenu((menu) => menu.push({
      entryId: "snakePanel", label: "x", labelKey: "menu.x", launch: { kind: "route", routeId: "nowhere" },
    }))),
    /launch 引用未登记的 route "nowhere"/u,
  );
  const root = withSnakeMenu((menu) => menu.push({
    entryId: "snakePanel", label: "面板", labelKey: "menu.snakePanel", launch: { kind: "route", routeId: "settings" },
  }));
  const catalog = readViewCatalog(root);
  const rendered = renderViewCatalogArtifacts(catalog).get(FEATURES_RELATIVE) ?? "";
  assert.match(rendered, /entryId: "snakePanel".*launch: \{ kind: "route", routeId: "settings" \}/u);
  assert.doesNotMatch(rendered, /slot:|order:/u, "生成物不得再出现位置字段");
  // launch 判别联合的跨字段规则：kind 与 id 必须配对。
  assert.throws(
    () => readViewCatalog(withSnakeMenu((menu) => { menu[0].launch = { kind: "route", gameplayId: "snake" }; })),
    /kind:"route" 必须声明 routeId/u,
  );
  assert.throws(
    () => readViewCatalog(withSnakeMenu((menu) => { menu[0].launch = { kind: "gameplay", gameplayId: "snake", routeId: "settings" }; })),
    /kind:"gameplay" 不得同时声明 routeId/u,
  );
  // launch.gameplayId 必须是 canonical 玩法：fixture 玩法（wireExposed:false）与拼错的 id 都拒绝。
  assert.throws(
    () => readViewCatalog(withSnakeMenu((menu) => { menu[0].launch = { kind: "gameplay", gameplayId: "privateFixture" }; })),
    /引用 fixture 玩法 "privateFixture"/u,
  );
  assert.throws(
    () => readViewCatalog(withSnakeMenu((menu) => { menu[0].launch = { kind: "gameplay", gameplayId: "snak" }; })),
    /引用未登记的玩法 "snak"/u,
  );
  // 位置字段已退役：manifest 出现 slot/order 即 schema 拒绝。
  assert.throws(
    () => readViewCatalog(withSnakeMenu((menu) => { menu[0].slot = 0; })),
    /unknown key\(s\): slot/u,
  );
});

test("feature module：module 必须是本 feature 的 features/<id>/index.ts 且导出 createFeatureModule，渲染为静态字面量 load", () => {
  const withModule = (mutate: (root: string, manifest: Record<string, unknown>) => void): { root: string; options: FeatureCodegenOptions } => {
    const { root, options } = createFixture();
    const manifestFile = path.join(root, "features/snake/feature.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    mutate(root, manifest);
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    return { root, options };
  };
  const writeModule = (root: string, id: string, source: string): void => {
    fs.mkdirSync(path.join(root, `apps/client/src/features/${id}`), { recursive: true });
    fs.writeFileSync(path.join(root, `apps/client/src/features/${id}/index.ts`), source, "utf8");
  };
  // 指向别的 feature 目录 → 拒绝。
  assert.throws(
    () => readViewCatalog(withModule((root, manifest) => {
      writeModule(root, "other", "export function createFeatureModule() { return {}; }\n");
      manifest.module = "apps/client/src/features/other/index.ts";
    }).root),
    /module 必须是本 feature 自己的 apps\/client\/src\/features\/snake\/index\.ts/u,
  );
  // 文件缺失 → 拒绝。
  assert.throws(
    () => readViewCatalog(withModule((_root, manifest) => { manifest.module = "apps/client/src/features/snake/index.ts"; }).root),
    /features\/snake\/index\.ts: missing required file/u,
  );
  // 未导出约定符号 → 拒绝。
  assert.throws(
    () => readViewCatalog(withModule((root, manifest) => {
      writeModule(root, "snake", "export const somethingElse = 1;\n");
      manifest.module = "apps/client/src/features/snake/index.ts";
    }).root),
    /必须导出约定符号 createFeatureModule/u,
  );
  // 形态非法（不是 features/<id>/index.ts）→ schema 拒绝。
  assert.throws(
    () => readViewCatalog(withModule((_root, manifest) => { manifest.module = "apps/client/src/logic/page/HomeLogic.ts"; }).root),
    /module.*does not match pattern/u,
  );
  // 合法：渲染 load 静态字面量 + type-only import；无 module 的 feature 不带 load。
  const { root, options } = withModule((root, manifest) => {
    writeModule(root, "snake", "export function createFeatureModule(): { install(): void } {\n  return { install() {} };\n}\n");
    manifest.module = "apps/client/src/features/snake/index.ts";
  });
  writeFeatureArtifacts(options);
  const rendered = fs.readFileSync(path.join(root, FEATURES_RELATIVE), "utf8");
  assert.match(rendered, /^import type \{ FeatureModule \} from "\.\.\/app\/FeatureHost";$/mu);
  assert.match(rendered, /readonly load\?: \(\) => Promise<FeatureModule>;/u);
  assert.match(rendered, /id: "snake",\n {8}resident: false,\n {8}load: \(\) => import\("\.\.\/features\/snake\/index"\)\.then\(\(m\) => m\.createFeatureModule\(\)\),/u);
  assert.doesNotMatch(rendered, /id: "builtin",\n {8}resident: true,\n {8}load:/u, "无 module 的 feature ⛔ 不带 load");
  // 真仓（当前无 module）：不引入未使用的类型（noUnusedLocals）。
  const real = fs.readFileSync(path.join(REPOSITORY_ROOT, FEATURES_RELATIVE), "utf8");
  if (!real.includes("load: () => import(")) assert.doesNotMatch(real, /import type \{ FeatureModule \}/u);
});

test("宿主 placement（features/host.json）：缺失即 fail-fast；defaultLaunch 须有贡献者；home 引用必须存在且渲染进 GENERATED_HOST", () => {
  {
    const { root } = createFixture();
    fs.rmSync(path.join(root, "features/host.json"));
    assert.throws(() => readViewCatalog(root), /features\/host\.json.*宿主必须显式声明 defaultLaunch/u);
  }
  const withHost = (host: unknown): string => {
    const { root } = createFixture();
    fs.writeFileSync(path.join(root, "features/host.json"), `${JSON.stringify(host, null, 2)}\n`);
    return root;
  };
  assert.throws(
    () => readViewCatalog(withHost({ schemaVersion: 1, defaultLaunch: { kind: "gameplay", gameplayId: "idle" }, home: [] })),
    /defaultLaunch 指向没有任何 feature 贡献入口的玩法 "idle"/u,
  );
  assert.throws(
    () => readViewCatalog(withHost({ schemaVersion: 1, defaultLaunch: { kind: "gameplay", gameplayId: "dropInFixture" }, home: [] })),
    /defaultLaunch 引用 fixture 玩法 "dropInFixture"/u,
  );
  assert.throws(
    () => readViewCatalog(withHost({ schemaVersion: 1, defaultLaunch: { kind: "gameplay", gameplayId: "nope" }, home: [] })),
    /defaultLaunch 引用未登记的玩法 "nope"/u,
  );
  assert.throws(
    () => readViewCatalog(withHost({ schemaVersion: 1, defaultLaunch: { kind: "gameplay", gameplayId: "snake" }, home: ["builtin/snake"] })),
    /home 引用不存在的入口 "builtin\/snake"/u,
  );
  assert.throws(
    () => readViewCatalog(withHost({ schemaVersion: 1, defaultLaunch: { kind: "gameplay", gameplayId: "snake" }, home: ["snake/snake", "snake/snake"] })),
    /home 重复登记/u,
  );
  assert.throws(
    () => readViewCatalog(withHost({ schemaVersion: 1, defaultLaunch: { kind: "gameplay", gameplayId: "snake" }, home: [], slot: 0 })),
    /unknown key\(s\): slot/u,
  );
  // 宿主可以把回归样例 ballMove 摆到首屏并换默认玩法——零代码，只改 host.json。
  const root = withHost({ schemaVersion: 1, defaultLaunch: { kind: "gameplay", gameplayId: "ballMove" }, home: ["builtin/ballMove", "snake/snake"] });
  const rendered = renderViewCatalogArtifacts(readViewCatalog(root)).get(FEATURES_RELATIVE) ?? "";
  assert.match(rendered, /defaultLaunch: \{ kind: "gameplay", gameplayId: "ballMove" \}/u);
  assert.match(rendered, /\{ featureId: "builtin", entryId: "ballMove" \},\n {8}\{ featureId: "snake", entryId: "snake" \},/u);
});

test("域契约闸：descriptor 字节变化而 contractVersion 未增，writer 与只读闸都拒绝；bump 后放行并渲染 LOBBY_RPC_DOMAIN_CONTRACTS", () => {
  const { root, options } = createFixture();
  try {
    assertFeatureArtifactsFresh(options);
    const guildFile = path.join(root, LOBBY_RPC_DIR, "domains/guild.ts");
    const original = fs.readFileSync(guildFile, "utf8");
    // 只改一个注释也算：digest 与 gameplay 的 wire.ts 同口径按字节算（⛔ 不做语义豁免）。
    fs.writeFileSync(guildFile, `${original}// touched\n`, "utf8");
    const gate = /domains\/guild\.ts: domain contract digest changed but contractVersion did not increase \(kept 1, previous 1\)/u;
    assert.throws(() => assertFeatureArtifactsFresh(options), gate);
    assert.throws(() => writeFeatureArtifacts(options), gate);
    // 显式 bump → 放行；registry 记录新版本与新 digest。
    fs.writeFileSync(guildFile, `${original.replace('    domain: "guild",', '    domain: "guild",\n    contractVersion: 2,')}// touched\n`, "utf8");
    const result = writeFeatureArtifacts(options);
    assert.ok(result.changed.includes(REGISTRY_RELATIVE));
    const registry = fs.readFileSync(path.join(root, REGISTRY_RELATIVE), "utf8");
    assert.match(registry, /^ {4}guild: \{ contractVersion: 2, digest: "[0-9a-f]{64}" \},$/mu);
    assert.doesNotThrow(() => assertFeatureArtifactsFresh(options));
    // 降版本同样拒绝（只允许递增）。
    fs.writeFileSync(guildFile, `${original.replace('    domain: "guild",', '    domain: "guild",\n    contractVersion: 1,')}// touched twice\n`, "utf8");
    assert.throws(() => assertFeatureArtifactsFresh(options), /kept 1, previous 2/u);
    // 非法 contractVersion 形态在 AST 层点名。
    fs.writeFileSync(guildFile, original.replace('    domain: "guild",', '    domain: "guild",\n    contractVersion: 0,'), "utf8");
    assert.throws(() => readFeatureDescriptors(options), /域 contractVersion 必须是 ≥1 的安全整数/u);
    fs.writeFileSync(guildFile, original.replace('    domain: "guild",', '    domain: "guild",\n    contractVersion: "2",'), "utf8");
    assert.throws(() => readFeatureDescriptors(options), /域 contractVersion 必须是数字字面量/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

// ── 阶段 7：能力索引（docs/features.generated.md）与 writer 输出集合自检 ─────

test("能力索引：真仓在盘且新鲜；状态词汇表仅 planned/registered/source-present，无实跑冒充词", () => {
  const file = path.join(REPOSITORY_ROOT, FEATURE_INDEX_RELATIVE);
  assert.ok(fs.existsSync(file), "docs/features.generated.md 缺失——运行 codegen:features");
  const rendered = renderFeatureIndex(readViewCatalog(REPOSITORY_ROOT));
  assert.equal(fs.readFileSync(file, "utf8"), rendered, "能力索引不新鲜——重跑 codegen:features");
  // 阶段 7 退出条件：生成索引不得用 implemented/verified 冒充测试实跑或人工验收（§5.7）。
  assert.doesNotMatch(rendered, /implemented|verified/iu);
  assert.match(rendered, /^\| `builtin` \| core \| registered \| /mu, "builtin feature 行在索引中");
  assert.match(rendered, /planned/u);
  assert.match(rendered, /source-present/u);
});

/** 隔离根加入一个最小 extra feature（仅 capability fragment，无 View/路由/菜单）。 */
function addFixtureExtraFeature(root: string, defaultEntry: string): void {
  const dir = path.join(root, "features/fixture-extra");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "feature.json"), `${JSON.stringify({
    schemaVersion: 1,
    id: "fixtureExtra",
    category: "extra",
    docs: ["docs/EXTRAFEATURES.md"],
    capabilities: [{
      id: "fixture-extra-cap",
      category: "extra",
      defaultEntry,
      sourceOfTruth: "apps/client/src/logic/page",
      wireBoundary: "apps/client/src/view/pages.ts",
      verification: [{ kind: "root", script: "verify:core" }],
      docs: ["docs/EXTRAFEATURES.md"],
    }],
    viewDirs: [],
    views: [],
    owners: [],
    routes: [],
    menu: [],
  }, null, 2)}\n`);
}

test("阶段 7：fixture extra feature 只加新文件即进索引；fragment 状态按 defaultEntry 存在性判定", () => {
  const { root, options } = createFixture();
  const before = snapshotHandwritten(root);
  addFixtureExtraFeature(root, "apps/client/src/logic/page/HomeLogic.ts");
  const result = writeFeatureArtifacts(options);
  assert.deepEqual(result.changed, [FEATURES_RELATIVE, FEATURE_INDEX_RELATIVE],
    "仅 features 数据产物与能力索引变化（registry/View 产物与手写源零 diff）");
  const after = snapshotHandwritten(root);
  assert.deepEqual([...after.keys()].filter((key) => !before.has(key)), ["features/fixture-extra/feature.json"]);
  for (const [key, bytes] of before) {
    assert.equal(after.get(key), bytes, `人工源码被生成器改动：${key}`);
  }
  const index = fs.readFileSync(path.join(root, FEATURE_INDEX_RELATIVE), "utf8");
  assert.match(index, /^\| `fixtureExtra` \| extra \| registered \| /mu, "feature 行收录");
  assert.match(index,
    /^\| `fixture-extra-cap` \| `fixtureExtra` \| extra \| `apps\/client\/src\/logic\/page\/HomeLogic\.ts` \| source-present \| /mu,
    "defaultEntry 在仓内存在 ⇒ source-present");
  assertFeatureArtifactsFresh(options);

  // defaultEntry 尚不存在 ⇒ planned（结构状态，生成器不因此失败——存在性硬闸在 verify:inventory）
  addFixtureExtraFeature(root, "apps/client/src/logic/page/GhostLogic.ts");
  writeFeatureArtifacts(options);
  const planned = fs.readFileSync(path.join(root, FEATURE_INDEX_RELATIVE), "utf8");
  assert.match(planned,
    /^\| `fixture-extra-cap` \| `fixtureExtra` \| extra \| `apps\/client\/src\/logic\/page\/GhostLogic\.ts` \| planned \| /mu);
  assertFeatureArtifactsFresh(options);
});

test("⛔ 生成器不写当前计划文件：把 plan-v4.md 加进 writer 允许输出集合 → 自检红（§5.7 反例）", () => {
  assert.doesNotThrow(() => assertWriterOutputSetSafe([...ALL_ARTIFACTS]));
  for (const planFile of ["plan-v4.md", "plan.md", "plan-v2.md", "docs/plan-v4.md"]) {
    assert.throws(
      () => assertWriterOutputSetSafe([...ALL_ARTIFACTS, planFile]),
      /计划文件.*不得进入生成器允许输出集合/u,
      `计划文件必须被 writer 自检拒绝：${planFile}`,
    );
  }
  assert.throws(() => assertWriterOutputSetSafe(["docs/other.generated.md"]), /不在生成器允许输出集合内/u);
  assert.throws(() => assertWriterOutputSetSafe(["apps/shared/src/protocol/rooms.ts"]), /不在生成器允许输出集合内/u);
});
