/**
 * codegen:features 的编排层（Non-intrusive §4.2/§5.5 阶段 3；§7.5 阶段 6 扩展）：
 *  - 发现 Lobby RPC domain descriptor（apps/shared/src/protocol/lobbyRpc/domains/*.ts +
 *    coreErrors.ts），语法读取后渲染 `registry.generated.ts`；
 *  - 发现 features/<dir>/feature.json + `<Name>View.view.json` sidecar + FGUI XML（viewCatalog.ts），
 *    渲染客户端三产物 `apps/client/src/generated/{fguiContracts,views,features}.generated.ts`
 *    ——全仓唯一的客户端 View catalog/FGUI contract writer（§3.1 交汇点）；
 *  - 发现 `apps/server/test/lobbyRpcVectors/<域>.ts` 向量 sidecar 并与 domain 集合双向对齐，渲染
 *    `lobbyRpcVectors/index.generated.ts`（§5.6：向量由 feature 持有，两份 vectors 测试只消费此表，
 *    新增域 ⛔ 不再手改任何中央测试登记表）；
 *  - 渲染能力索引 `docs/features.generated.md`（§5.7 阶段 7：id/category/docs/结构状态，
 *    状态词汇表仅 planned/registered/source-present；⛔ 生成器不写 plan-*.md——
 *    `assertWriterOutputSetSafe` 对允许输出集合自检，塞进计划文件即红）。
 * freshness（--check 只读）与原子写盘（--write）对五件产物同一口径。
 *
 * §5.5 通用约束的落点（形态沿用 gameplay-codegen）：
 *  - 稳定排序（域按 id 排序、域内按声明序）⇒ 相同输入字节级相同输出；
 *  - `--check` 只读：stale/missing/extra 三态失败并点名，不创建目录、不改 mtime；
 *  - 先在内存完成全部校验与渲染，再临时文件原子替换；
 *  - 重复 domain/route/error/push id（含大小写归一化）、路径越界、符号链接逃逸拒绝；
 *  - domain 文件形态违规（computed/spread/顶层副作用）由 astReader 点名拒绝；
 *  - 已登记域的源文件消失必须显式 `--allow-delete <域>`；
 *  - 域契约闸：`domains/<域>.ts` 字节 digest 变化必须伴随 defineLobbyRpcDomain 的 contractVersion 递增
 *    （registry 渲染 LOBBY_RPC_DOMAIN_CONTRACTS 作为历史记录；与 gameplay 的 modeVersion 闸对称）；
 *  - 生成文件带「AUTO-GENERATED … Do not edit」抬头与来源。
 *
 * ⚠ 与 gameplay-codegen 相同的职责偏差（docs/Non-intrusive.md §5.5 已登记）：生成器住在
 * @game/server workspace，却直写 apps/shared 的 registry 与 **apps/client 的 generated 目录**
 * （apps/client 不是 npm workspace，客户端产物的 freshness 沿 §5.4 口径由
 * `apps/server/test/feature-codegen.test.ts` 的只读断言守门）。
 * ⚠ registry 落在 protocol/ 内 ⇒ `--write` 后必须 `node scripts/protocol-fingerprint.mjs --write`
 * 重钉协议指纹（--check ⛔ 不碰指纹，那是显式审计锁）。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  parseCoreErrorsModule,
  parseDomainModule,
  type CoreErrorsDeclaration,
  type DomainDeclaration,
  type PushDeclaration,
  type RouteDeclaration,
  type TypeRef,
} from "./astReader";
import {
  FEATURE_INDEX_RELATIVE,
  previousGeneratedFeatureIds,
  previousGeneratedViewNames,
  readViewCatalog,
  renderViewCatalogArtifacts,
} from "./viewCatalog";

const TOOL_REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const LOBBY_RPC_DIR_RELATIVE = "apps/shared/src/protocol/lobbyRpc";
const DOMAINS_DIR_RELATIVE = `${LOBBY_RPC_DIR_RELATIVE}/domains`;
const CORE_ERRORS_RELATIVE = `${LOBBY_RPC_DIR_RELATIVE}/coreErrors.ts`;
const REGISTRY_RELATIVE = `${LOBBY_RPC_DIR_RELATIVE}/registry.generated.ts`;
/** Lobby RPC 测试向量 sidecar 目录（Non-intrusive §5.6：向量由 feature 持有，⛔ 中央不再手写登记表）。 */
const VECTORS_DIR_RELATIVE = "apps/server/test/lobbyRpcVectors";
export const VECTORS_INDEX_RELATIVE = `${VECTORS_DIR_RELATIVE}/index.generated.ts`;
const VECTORS_TYPES_FILE = "vectorTypes.ts";

const DOMAIN_ID = /^[a-z][A-Za-z0-9]{0,63}$/u;
/** --allow-delete 同时接受域/feature（camelCase）与 View 名（PascalCase）。 */
const ALLOW_DELETE_ID = /^[A-Za-z][A-Za-z0-9]{0,63}$/u;
const ROUTE_METHOD = /^[A-Za-z][A-Za-z0-9]{0,63}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const OPERATION_GROUP_ID = /^[a-z][A-Za-z0-9]{0,63}$/u;
const RUN_HINT = "Run npm --workspace @game/server run codegen:features";
const SOURCE_LABEL = `${DOMAINS_DIR_RELATIVE}/*.ts + ${LOBBY_RPC_DIR_RELATIVE}/coreErrors.ts`;

export type FeatureCodegenOptions = {
  readonly repositoryRoot?: string;
  readonly allowDelete?: readonly string[];
};

/** 域契约身份：`domains/<域>.ts` 的字节 digest + 人工 contractVersion（与 gameplay 的 contractDigest/modeVersion 对称）。 */
export type DomainContract = {
  readonly domain: string;
  readonly contractVersion: number;
  readonly digest: string;
};

export type FeatureDescriptors = {
  readonly domains: readonly DomainDeclaration[];
  readonly core: CoreErrorsDeclaration;
  /** 按域名排序；与 domains 同集。 */
  readonly contracts: readonly DomainContract[];
};

export type FeatureWriteResult = {
  readonly changed: readonly string[];
  readonly deleted: readonly string[];
};

function fail(pathLabel: string, message: string): never {
  throw new Error(`[feature-codegen] ${pathLabel}: ${message}`);
}

function resolvedRoot(options: FeatureCodegenOptions): string {
  return path.resolve(options.repositoryRoot ?? TOOL_REPOSITORY_ROOT);
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

function posixPath(value: string): string {
  return value.split(path.sep).join("/");
}

// ── 发现与跨域校验 ───────────────────────────────────────────────────────────

/** 发现并解析全部 domain descriptor 与 core 段；域按 id 稳定排序。 */
export function readFeatureDescriptors(options: FeatureCodegenOptions = {}): FeatureDescriptors {
  const root = resolvedRoot(options);
  const domainsDir = path.join(root, DOMAINS_DIR_RELATIVE);
  if (!fs.existsSync(domainsDir)) fail(DOMAINS_DIR_RELATIVE, "domains directory is missing");

  const entries = fs.readdirSync(domainsDir, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  const domains: DomainDeclaration[] = [];
  const contracts: DomainContract[] = [];
  const seenNormalized = new Map<string, string>();
  for (const name of entries) {
    const label = `${DOMAINS_DIR_RELATIVE}/${name}`;
    const file = path.join(domainsDir, name);
    assertRegularFile(file, label);
    if (!name.endsWith(".ts")) fail(label, "domains/ 只允许 .ts domain 文件");
    const id = name.slice(0, -".ts".length);
    if (!DOMAIN_ID.test(id)) fail(label, `域名 "${id}" 必须是 camelCase 标识符（^[a-z][A-Za-z0-9]{0,63}$）`);
    const normalized = id.toLowerCase();
    const clash = seenNormalized.get(normalized);
    if (clash) fail(label, `域名与 "${clash}" 大小写归一化后冲突`);
    seenNormalized.set(normalized, id);

    const bytes = fs.readFileSync(file);
    const declaration = parseDomainModule(bytes.toString("utf8"), label);
    if (declaration.domain !== id) {
      fail(label, `descriptor.domain ("${declaration.domain}") 必须等于文件名 ("${id}")`);
    }
    contracts.push({
      domain: id,
      contractVersion: declaration.contractVersion,
      digest: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
    for (const route of declaration.routes) {
      const prefix = `${id}.`;
      if (!route.type.startsWith(prefix) || !ROUTE_METHOD.test(route.type.slice(prefix.length))) {
        fail(label, `路由名 "${route.type}" 必须是 "${id}.<method>"（method 为标识符，loader 按路径映射）`);
      }
    }
    for (const code of declaration.errorCodes) {
      if (!ERROR_CODE.test(code)) fail(label, `错误码 "${code}" 必须是大写蛇形（^[A-Z][A-Z0-9_]*$）`);
    }
    domains.push(declaration);
  }
  domains.sort((left, right) => (left.domain < right.domain ? -1 : 1));

  assertRegularFile(path.join(root, CORE_ERRORS_RELATIVE), CORE_ERRORS_RELATIVE);
  const core = parseCoreErrorsModule(fs.readFileSync(path.join(root, CORE_ERRORS_RELATIVE), "utf8"), CORE_ERRORS_RELATIVE);
  for (const code of core.coreErrorCodes) {
    if (!ERROR_CODE.test(code)) fail(CORE_ERRORS_RELATIVE, `错误码 "${code}" 必须是大写蛇形`);
  }

  assertCrossDescriptorUniqueness(domains, core);
  assertErrorCodeOrderPin(domains, core);
  assertOperationGroupOwnership(domains);
  assertImportSymbolUniqueness(domains, core);
  contracts.sort((left, right) => (left.domain < right.domain ? -1 : 1));
  return { domains, core, contracts };
}

// ── 域契约闸（digest 变化必须伴随 contractVersion 递增；与 gameplay-codegen 的 modeVersion 闸对称）──

/** 从既有 registry 生成物恢复 per-domain 契约记录（生成物格式由本生成器唯一拥有；解析不动 = 无历史）。 */
export function previousDomainContracts(options: FeatureCodegenOptions = {}): ReadonlyMap<string, DomainContract> {
  const file = path.join(resolvedRoot(options), REGISTRY_RELATIVE);
  const records = new Map<string, DomainContract>();
  if (!fs.existsSync(file)) return records;
  const text = fs.readFileSync(file, "utf8");
  const entry = /^ {4}([A-Za-z0-9]+): \{ contractVersion: (\d+), digest: "([0-9a-f]{64})" \},$/gmu;
  for (const match of text.matchAll(entry)) {
    records.set(match[1], { domain: match[1], contractVersion: Number(match[2]), digest: match[3] });
  }
  return records;
}

/**
 * 域 descriptor 的字节 digest 变化必须伴随 `contractVersion` 递增；首次生成（无旧记录）放行。
 * 这是 feature 侧 codegen 层的契约变更确认位（PLUGIN.md §8/§9）——⛔ 不做「注释也算」的豁免：digest 与
 * gameplay 的 wire.ts 同口径**只按域 descriptor 文件自身字节**算。覆盖面如实登记：跨文件复用的
 * validator/类型（primitives.ts / economy.ts / ../http，或被他域 import 的域文件如 mail→shop）变化
 * 不会触发本闸，只由 protocol-fingerprint 点名漂移，其语义兼容靠路由级 contractVersion 与向量测试。
 */
export function assertDomainContractVersionBumped(
  descriptors: FeatureDescriptors,
  previous: ReadonlyMap<string, DomainContract>,
): void {
  for (const contract of descriptors.contracts) {
    const record = previous.get(contract.domain);
    if (!record) continue;
    if (record.digest === contract.digest) continue;
    if (contract.contractVersion > record.contractVersion) continue;
    fail(
      `${DOMAINS_DIR_RELATIVE}/${contract.domain}.ts`,
      `domain contract digest changed but contractVersion did not increase (kept ${contract.contractVersion}, `
      + `previous ${record.contractVersion}). Bump contractVersion in defineLobbyRpcDomain({ domain: "${contract.domain}", contractVersion: ${record.contractVersion + 1}, … })`,
    );
  }
}

function assertCrossDescriptorUniqueness(domains: readonly DomainDeclaration[], core: CoreErrorsDeclaration): void {
  const routeOwner = new Map<string, string>();
  const errorOwner = new Map<string, string>();
  const pushTypeOwner = new Map<string, string>();
  const pushKeyOwner = new Map<string, string>();
  const claim = (table: Map<string, string>, key: string, owner: string, kind: string): void => {
    const existing = table.get(key);
    if (existing) fail(SOURCE_LABEL, `${kind} "${key}" 同时由 ${existing} 与 ${owner} 声明`);
    table.set(key, owner);
  };
  for (const code of core.coreErrorCodes) claim(errorOwner, code, "coreErrors", "错误码");
  for (const push of core.pushes) {
    claim(pushTypeOwner, push.type, "coreErrors", "推送消息名");
    claim(pushKeyOwner, push.key.toLowerCase(), "coreErrors", "推送 key");
  }
  // §6.13/§5.5：operationGroup 进重复 id 拒绝清单——一个组由且仅由一个域拥有
  const groupOwner = new Map<string, string>();
  for (const domain of domains) {
    for (const route of domain.routes) claim(routeOwner, route.type, domain.domain, "路由");
    for (const code of domain.errorCodes) claim(errorOwner, code, domain.domain, "错误码");
    for (const group of domain.ownsOperationGroups) claim(groupOwner, group, domain.domain, "operationGroup");
    for (const push of domain.pushes) {
      claim(pushTypeOwner, push.type, domain.domain, "推送消息名");
      claim(pushKeyOwner, push.key.toLowerCase(), domain.domain, "推送 key");
    }
  }
}

/**
 * §6.13 operation group 所有权/暴露双向校验（fail closed）：
 *  - group id 形态校验 + 跨域重复由 assertCrossDescriptorUniqueness 拒绝；
 *  - 路由的 operationGroup 必须由本域 ownsOperationGroups 声明；
 *  - inspectable=true 必须同时声明 operationGroup；
 *  - inspectsOperationGroup 默认只能引用本域拥有的组；跨域引用必须由 owner 在
 *    exposesOperationGroupTo[group] 显式列出查询方域名；
 *  - exposesOperationGroupTo 的 key 必须是本域拥有的组、value 必须是已存在的其他域；
 *  - 同一路由不得双声明 operationGroup 与 inspectsOperationGroup（builder 形态已排除，仍复核）。
 */
function assertOperationGroupOwnership(domains: readonly DomainDeclaration[]): void {
  const ownerOf = new Map<string, DomainDeclaration>();
  const domainIds = new Set(domains.map((domain) => domain.domain));
  for (const domain of domains) {
    const label = `${DOMAINS_DIR_RELATIVE}/${domain.domain}.ts`;
    for (const group of domain.ownsOperationGroups) {
      if (!OPERATION_GROUP_ID.test(group)) {
        fail(label, `operationGroup "${group}" 必须是 camelCase 标识符（^[a-z][A-Za-z0-9]{0,63}$）`);
      }
      ownerOf.set(group, domain);
    }
  }
  for (const domain of domains) {
    const label = `${DOMAINS_DIR_RELATIVE}/${domain.domain}.ts`;
    for (const [group, consumers] of Object.entries(domain.exposesOperationGroupTo)) {
      if (ownerOf.get(group)?.domain !== domain.domain) {
        fail(label, `exposesOperationGroupTo 的组 "${group}" 不由本域 ownsOperationGroups 声明——只能暴露自己拥有的组`);
      }
      for (const consumer of consumers) {
        if (consumer === domain.domain) fail(label, `exposesOperationGroupTo["${group}"] 不需要（也不允许）列出本域自身`);
        if (!domainIds.has(consumer)) {
          fail(label, `exposesOperationGroupTo["${group}"] 引用了不存在的域 "${consumer}"（悬空暴露 fail closed）`);
        }
      }
    }
    for (const route of domain.routes) {
      if (route.operationGroup !== null && route.inspectsOperationGroup !== null) {
        fail(label, `路由 ${route.type} 不得同时声明 operationGroup 与 inspectsOperationGroup`);
      }
      if (route.operationGroup !== null && ownerOf.get(route.operationGroup)?.domain !== domain.domain) {
        fail(label, `路由 ${route.type} 的 operationGroup "${route.operationGroup}" 必须先由本域 ownsOperationGroups 声明所有权`);
      }
      if (route.inspectable && route.operationGroup === null) {
        fail(label, `路由 ${route.type} 声明了 inspectable 但缺 operationGroup——无组的可查路由无意义`);
      }
      const inspects = route.inspectsOperationGroup;
      if (inspects !== null) {
        const owner = ownerOf.get(inspects);
        if (!owner) fail(label, `路由 ${route.type} 的 inspectsOperationGroup "${inspects}" 无任何域声明所有权`);
        if (owner.domain !== domain.domain
          && !(owner.exposesOperationGroupTo[inspects] ?? []).includes(domain.domain)) {
          fail(label, `路由 ${route.type} 的 inspectsOperationGroup "${inspects}" 属于域 ${owner.domain}，`
            + `且未经 exposesOperationGroupTo["${inspects}"] 显式暴露给 ${domain.domain}（fail closed）`);
        }
      }
    }
  }
}

/** RPC_ERR_CODE_ORDER 钉表：引用不存在的码即拒绝（防钉表漂移成第二真源）。 */
function assertErrorCodeOrderPin(domains: readonly DomainDeclaration[], core: CoreErrorsDeclaration): void {
  const known = new Set<string>(core.coreErrorCodes);
  for (const domain of domains) for (const code of domain.errorCodes) known.add(code);
  const dangling = core.errorCodeOrder.filter((code) => !known.has(code));
  if (dangling.length > 0) {
    fail(CORE_ERRORS_RELATIVE, `RPC_ERR_CODE_ORDER 引用了不属于任何 descriptor 的码：${dangling.join(", ")}`);
  }
}

type ResolvedTypeRef = { readonly name: string; readonly specifier: string };

/** 把 domain/core 文件内的类型 import specifier 重定位为 registry（lobbyRpc/ 目录）视角。 */
function resolveTypeRef(ref: TypeRef, ownerDir: string, ownerLabel: string): ResolvedTypeRef {
  if (ref.specifier === null) {
    fail(ownerLabel, `内部错误：本地类型 "${ref.name}" 不应走 specifier 重定位`);
  }
  if (!ref.specifier.startsWith(".")) {
    fail(ownerLabel, `类型 "${ref.name}" 来自非相对 specifier "${ref.specifier}"（shared 零依赖，禁 npm 包类型）`);
  }
  const resolved = path.posix.normalize(path.posix.join(ownerDir, ref.specifier));
  if (!resolved.startsWith("apps/shared/src/")) {
    fail(ownerLabel, `类型 "${ref.name}" 的 specifier "${ref.specifier}" 越出 apps/shared/src`);
  }
  for (const banned of ["index", "envelope", "registry.generated"]) {
    if (resolved === `${LOBBY_RPC_DIR_RELATIVE}/${banned}`) {
      fail(ownerLabel, `类型 "${ref.name}" 不得取自 ${banned}（registry 会形成 import 环）`);
    }
  }
  let relative = path.posix.relative(LOBBY_RPC_DIR_RELATIVE, resolved);
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return { name: ref.name, specifier: relative };
}

/** registry 要 import 的符号必须全仓唯一：同名 validator/类型来自不同模块即拒绝。 */
function assertImportSymbolUniqueness(domains: readonly DomainDeclaration[], core: CoreErrorsDeclaration): void {
  const owners = new Map<string, string>();
  const claim = (symbol: string, module: string): void => {
    const existing = owners.get(symbol);
    if (existing && existing !== module) {
      fail(SOURCE_LABEL, `符号 "${symbol}" 同时来自 ${existing} 与 ${module}——registry 无法同名 import`);
    }
    owners.set(symbol, module);
  };
  const claimType = (ref: TypeRef, ownerModule: string, ownerDir: string, ownerLabel: string): void => {
    if (ref.specifier === null) claim(ref.name, ownerModule);
    else claim(ref.name, resolveTypeRef(ref, ownerDir, ownerLabel).specifier);
  };
  const corePushes = core.pushes;
  for (const push of corePushes) {
    claim(push.validator, "./coreErrors");
    claimType(push.dataType, "./coreErrors", LOBBY_RPC_DIR_RELATIVE, CORE_ERRORS_RELATIVE);
  }
  for (const domain of domains) {
    const module = `./domains/${domain.domain}`;
    const label = `${DOMAINS_DIR_RELATIVE}/${domain.domain}.ts`;
    for (const route of domain.routes) {
      claim(route.requestValidator, module);
      claim(route.responseValidator, module);
      claimType(route.requestType, module, DOMAINS_DIR_RELATIVE, label);
      claimType(route.responseType, module, DOMAINS_DIR_RELATIVE, label);
    }
    for (const push of domain.pushes) {
      claim(push.validator, module);
      claimType(push.dataType, module, DOMAINS_DIR_RELATIVE, label);
    }
  }
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

function generatedHeader(): string {
  return `/** AUTO-GENERATED by apps/server/tools/feature-codegen/cli.ts from ${SOURCE_LABEL}. Do not edit. */`;
}

function typeRefName(ref: TypeRef): string {
  return ref.name;
}

function orderedErrorCodes(domains: readonly DomainDeclaration[], core: CoreErrorsDeclaration): readonly string[] {
  const aggregate: string[] = [...core.coreErrorCodes];
  for (const domain of domains) aggregate.push(...domain.errorCodes);
  const pinned = core.errorCodeOrder.filter((code) => aggregate.includes(code));
  const rest = aggregate.filter((code) => !core.errorCodeOrder.includes(code));
  return [...pinned, ...rest];
}

function allPushes(domains: readonly DomainDeclaration[], core: CoreErrorsDeclaration): readonly (PushDeclaration & { readonly owner: string })[] {
  const pushes: (PushDeclaration & { owner: string })[] = core.pushes.map((push) => ({ ...push, owner: "core" }));
  for (const domain of domains) {
    for (const push of domain.pushes) pushes.push({ ...push, owner: domain.domain });
  }
  return pushes;
}

function allRoutes(domains: readonly DomainDeclaration[]): readonly RouteDeclaration[] {
  return domains.flatMap((domain) => domain.routes);
}

function renderImportLine(specifier: string, values: readonly string[], types: readonly string[]): string | null {
  const members = [
    ...[...new Set(values)].sort(),
    ...[...new Set(types)].sort().map((name) => `type ${name}`),
  ];
  if (members.length === 0) return null;
  if (values.length === 0) {
    const typeMembers = [...new Set(types)].sort();
    return `import type { ${typeMembers.join(", ")} } from "${specifier}";`;
  }
  return `import { ${members.join(", ")} } from "${specifier}";`;
}

function renderRegistry(descriptors: FeatureDescriptors): string {
  const { domains, core } = descriptors;
  const routes = allRoutes(domains);
  const pushes = allPushes(domains, core);
  const errorCodes = orderedErrorCodes(domains, core);

  // 导入归集：域本地类型/validator → ./domains/<id>；core 段 → ./coreErrors；
  // import 进 domain 的类型 → 重定位后的外部 specifier。
  const externalTypes = new Map<string, Set<string>>();
  const domainValues = new Map<string, Set<string>>();
  const domainTypes = new Map<string, Set<string>>();
  const coreValues = new Set<string>();
  const coreTypes = new Set<string>();

  const addType = (ref: TypeRef, domainId: string | null, ownerDir: string, ownerLabel: string): void => {
    if (ref.specifier === null) {
      if (domainId === null) coreTypes.add(ref.name);
      else {
        const bucket = domainTypes.get(domainId) ?? new Set<string>();
        bucket.add(ref.name);
        domainTypes.set(domainId, bucket);
      }
      return;
    }
    const resolved = resolveTypeRef(ref, ownerDir, ownerLabel);
    const bucket = externalTypes.get(resolved.specifier) ?? new Set<string>();
    bucket.add(resolved.name);
    externalTypes.set(resolved.specifier, bucket);
  };
  for (const domain of domains) {
    const label = `${DOMAINS_DIR_RELATIVE}/${domain.domain}.ts`;
    const values = domainValues.get(domain.domain) ?? new Set<string>();
    domainValues.set(domain.domain, values);
    for (const route of domain.routes) {
      values.add(route.requestValidator);
      values.add(route.responseValidator);
      addType(route.requestType, domain.domain, DOMAINS_DIR_RELATIVE, label);
      addType(route.responseType, domain.domain, DOMAINS_DIR_RELATIVE, label);
    }
    for (const push of domain.pushes) {
      values.add(push.validator);
      addType(push.dataType, domain.domain, DOMAINS_DIR_RELATIVE, label);
    }
  }
  for (const push of core.pushes) {
    coreValues.add(push.validator);
    addType(push.dataType, null, LOBBY_RPC_DIR_RELATIVE, CORE_ERRORS_RELATIVE);
  }

  const lines: string[] = [generatedHeader()];
  lines.push(`import { assertExactKeys, guardWire, WireValidationError, type RuntimeValidator } from "../http";`);
  lines.push(`import type { LobbyRpcRouteMode } from "./defineDomain";`);
  const primitiveValues = ["pushRecord", ...(routes.length > 0 ? ["guardRpcValidator"] : [])].sort();
  lines.push(`import { ${primitiveValues.join(", ")} } from "./primitives";`);
  const coreImport = renderImportLine("./coreErrors", [...coreValues], [...coreTypes]);
  if (coreImport) lines.push(coreImport);
  for (const specifier of [...externalTypes.keys()].sort()) {
    const line = renderImportLine(specifier, [], [...externalTypes.get(specifier) ?? []]);
    if (line) lines.push(line);
  }
  for (const domain of domains) {
    const line = renderImportLine(
      `./domains/${domain.domain}`,
      [...domainValues.get(domain.domain) ?? []],
      [...domainTypes.get(domain.domain) ?? []],
    );
    if (line) lines.push(line);
  }
  lines.push("");

  lines.push("/** 领域全集（生成器删除保护锚 + 向量 sidecar 的域集合闸）。 */");
  lines.push("export const LOBBY_RPC_DOMAINS: readonly string[] = [");
  for (const domain of domains) lines.push(`    "${domain.domain}",`);
  lines.push("];");
  lines.push("");

  lines.push("/** 全量路由契约（服务端 defineRpc 与客户端 WebSocketClient.rpc 的公共类型域） */");
  lines.push("export interface LobbyRpcMap {");
  for (const route of routes) {
    lines.push(`    "${route.type}": { req: ${typeRefName(route.requestType)}; res: ${typeRefName(route.responseType)} };`);
  }
  lines.push("}");
  lines.push("");
  lines.push("export type LobbyRpcType = keyof LobbyRpcMap;");
  lines.push('export type RpcReq<T extends LobbyRpcType> = LobbyRpcMap[T]["req"];');
  lines.push('export type RpcRes<T extends LobbyRpcType> = LobbyRpcMap[T]["res"];');
  lines.push("");

  const idemRoutes = routes.filter((route) => route.mode === "idempotent-write");
  const naturalRoutes = routes.filter((route) => route.mode === "natural-write");
  lines.push("/** 幂等写路由子集（mode=idempotent-write 的显式字面量联合——由 metadata 生成，⛔ 非 clientReqId 结构推断） */");
  if (idemRoutes.length === 0) {
    lines.push("export type LobbyRpcIdemType = never;");
  } else {
    lines.push("export type LobbyRpcIdemType =");
    idemRoutes.forEach((route, index) => {
      lines.push(`    | "${route.type}"${index === idemRoutes.length - 1 ? ";" : ""}`);
    });
  }
  lines.push("");
  lines.push("/** natural-write 路由子集（写入天然可安全重复；不进通用幂等层） */");
  if (naturalRoutes.length === 0) {
    lines.push("export type LobbyRpcNaturalWriteType = never;");
  } else {
    lines.push("export type LobbyRpcNaturalWriteType =");
    naturalRoutes.forEach((route, index) => {
      lines.push(`    | "${route.type}"${index === naturalRoutes.length - 1 ? ";" : ""}`);
    });
  }
  lines.push("");

  lines.push("/** 路由 → 执行模式（服务端 defineRpc 据此派生 schema/幂等行为，endpoint 不再自填） */");
  lines.push("export const LOBBY_RPC_ROUTE_MODES: { readonly [K in LobbyRpcType]: LobbyRpcRouteMode } = {");
  for (const route of routes) lines.push(`    "${route.type}": "${route.mode}",`);
  lines.push("};");
  lines.push("");

  lines.push("/** 运行时全集：服务端 loader 启动校验 + 契约测试用。新增路由若漏在此处，服务端拒绝启动。 */");
  lines.push("export const ALL_LOBBY_RPC_TYPES: readonly LobbyRpcType[] = [");
  for (const route of routes) lines.push(`    "${route.type}",`);
  lines.push("];");
  lines.push("");

  lines.push("/** 路由 → 契约版本（§6.11：随 validator 语义变更人工 bump；幂等 v2 记录持久化并 fail-closed 比对，");
  lines.push(" *  ⛔ 不进摘要 preimage、不进 Redis key）。缺省 1。 */");
  lines.push("export const LOBBY_RPC_CONTRACT_VERSIONS: { readonly [K in LobbyRpcType]: number } = {");
  for (const route of routes) lines.push(`    "${route.type}": ${route.contractVersion},`);
  lines.push("};");
  lines.push("");
  lines.push("/** 域契约身份（codegen 闸：domains/<域>.ts 的 sha256 变化必须伴随 contractVersion 递增；⛔ 不进 wire）。 */");
  lines.push("export const LOBBY_RPC_DOMAIN_CONTRACTS: { readonly [domain: string]: { readonly contractVersion: number; readonly digest: string } } = {");
  for (const contract of descriptors.contracts) {
    lines.push(`    ${contract.domain}: { contractVersion: ${contract.contractVersion}, digest: ${JSON.stringify(contract.digest)} },`);
  }
  lines.push("};");
  lines.push("");

  const groupRoutes = idemRoutes.filter((route) => route.operationGroup !== null);
  lines.push("/** idempotent-write 路由 → operation group（§6.13 inspect 机制的元数据；未声明不入表）。 */");
  lines.push("export const LOBBY_RPC_OPERATION_GROUPS: { readonly [K in LobbyRpcType]?: string } = {");
  for (const route of groupRoutes) lines.push(`    "${route.type}": "${route.operationGroup}",`);
  lines.push("};");
  lines.push("");
  const inspectableRoutes = idemRoutes.filter((route) => route.inspectable);
  lines.push("/** 可通用查询操作状态的路由集合（inspectable=true）。 */");
  lines.push("export const LOBBY_RPC_INSPECTABLE: readonly LobbyRpcType[] = [");
  for (const route of inspectableRoutes) lines.push(`    "${route.type}",`);
  lines.push("];");
  lines.push("");
  const inspectsRoutes = routes.filter((route) => route.inspectsOperationGroup !== null);
  lines.push("/** query 路由 → 其可查询的 operation group（inspectsOperationGroup）。 */");
  lines.push("export const LOBBY_RPC_INSPECTS: { readonly [K in LobbyRpcType]?: string } = {");
  for (const route of inspectsRoutes) lines.push(`    "${route.type}": "${route.inspectsOperationGroup}",`);
  lines.push("};");
  lines.push("");

  lines.push("/** Route request validators: exact fields + finite/range checks, shared by client and server adapters. */");
  lines.push("export const LOBBY_RPC_REQUEST_VALIDATORS: { readonly [K in LobbyRpcType]: RuntimeValidator<RpcReq<K>> } = {");
  for (const route of routes) lines.push(`    "${route.type}": guardRpcValidator("payload", ${route.requestValidator}),`);
  lines.push("};");
  lines.push("");
  lines.push("/** Route response validators. */");
  lines.push("export const LOBBY_RPC_RESPONSE_VALIDATORS: { readonly [K in LobbyRpcType]: RuntimeValidator<RpcRes<K>> } = {");
  for (const route of routes) lines.push(`    "${route.type}": guardRpcValidator("response", ${route.responseValidator}),`);
  lines.push("};");
  lines.push("");
  lines.push("export function validateLobbyRpcRequest<T extends LobbyRpcType>(type: T, input: unknown): RpcReq<T> {");
  lines.push('    return guardWire("payload", () => {');
  lines.push("        const validator = LOBBY_RPC_REQUEST_VALIDATORS[type] as RuntimeValidator<RpcReq<T>> | undefined;");
  lines.push('        if (!validator) throw new WireValidationError("RPC_TYPE", "type");');
  lines.push("        return validator(input);");
  lines.push("    });");
  lines.push("}");
  lines.push("");
  lines.push("export function validateLobbyRpcResponse<T extends LobbyRpcType>(type: T, input: unknown): RpcRes<T> {");
  lines.push('    return guardWire("response", () => {');
  lines.push("        const validator = LOBBY_RPC_RESPONSE_VALIDATORS[type] as RuntimeValidator<RpcRes<T>> | undefined;");
  lines.push('        if (!validator) throw new WireValidationError("RPC_TYPE", "type");');
  lines.push("        return validator(input);");
  lines.push("    });");
  lines.push("}");
  lines.push("");

  lines.push("/** 服务端错误码全集（core + 域聚合；顺序由 coreErrors.ts 的 RPC_ERR_CODE_ORDER 历史钉决定，");
  lines.push(" *  未上钉的新码按「core 声明序 → 域名序 → 域内声明序」追加）。服务端 ErrCode 即此联合类型。 */");
  lines.push("export const RPC_ERR_CODES = [");
  for (const code of errorCodes) lines.push(`    "${code}",`);
  lines.push("] as const;");
  lines.push("");
  lines.push("export type RpcErrCode = (typeof RPC_ERR_CODES)[number];");
  lines.push("");
  lines.push("export function isRpcErrCode(value: unknown): value is RpcErrCode {");
  lines.push("    return typeof value === \"string\" && (RPC_ERR_CODES as readonly string[]).includes(value);");
  lines.push("}");
  lines.push("");

  lines.push("/** 推送类型名（core + 各域 pushes 的显式字面量聚合） */");
  lines.push("export const LobbyPush = {");
  for (const push of pushes) lines.push(`    ${push.key}: "${push.type}",`);
  lines.push("} as const;");
  lines.push("");
  lines.push("/** 推送类型名 → data 形状（客户端 WebSocketClient.onPush 的类型域） */");
  lines.push("export interface LobbyPushMap {");
  for (const push of pushes) lines.push(`    "${push.type}": ${typeRefName(push.dataType)};`);
  lines.push("}");
  lines.push("");
  lines.push("export type LobbyPushType = keyof LobbyPushMap;");
  lines.push("");
  lines.push("/** 推送 data runtime validators（与各 descriptor 引用同一函数）。 */");
  lines.push("export const PUSH_RUNTIME_VALIDATORS: { readonly [K in LobbyPushType]: RuntimeValidator<LobbyPushMap[K]> } = {");
  for (const push of pushes) lines.push(`    "${push.type}": ${push.validator},`);
  lines.push("};");
  lines.push("");
  lines.push("export function validatePushData<K extends LobbyPushType>(type: K, input: unknown): LobbyPushMap[K] {");
  lines.push("    const validator = Object.prototype.hasOwnProperty.call(PUSH_RUNTIME_VALIDATORS, type)");
  lines.push("        ? (PUSH_RUNTIME_VALIDATORS[type] as RuntimeValidator<LobbyPushMap[K]>)");
  lines.push("        : undefined;");
  lines.push('    if (!validator) throw new WireValidationError("PUSH_TYPE", "push.type");');
  lines.push("    return validator(input);");
  lines.push("}");
  lines.push("");
  lines.push("/** Discriminated push envelope; narrowing `type` also narrows `data`. */");
  lines.push("export type LobbyPushEnvelope = {");
  lines.push("    [K in LobbyPushType]: { type: K; data: LobbyPushMap[K] };");
  lines.push("}[LobbyPushType];");
  lines.push("");
  lines.push("/** 主动推送 envelope（{type,data}）的 exact runtime validator。 */");
  lines.push("export function validateLobbyPush(input: unknown): LobbyPushEnvelope {");
  lines.push('    return guardWire("push", () => {');
  lines.push('        const value = pushRecord(input, "push");');
  lines.push('        assertExactKeys(value, ["type", "data"], [], "push");');
  lines.push("        const type = value.type;");
  if (pushes.length === 0) {
    lines.push('        throw new WireValidationError("PUSH_TYPE", "push.type");');
  } else {
    const conditions = pushes.map((push) => `type !== "${push.type}"`);
    lines.push(`        if (${conditions.join("\n            && ")}) {`);
    lines.push('            throw new WireValidationError("PUSH_TYPE", "push.type");');
    lines.push("        }");
    lines.push("        return { type, data: validatePushData(type, value.data) } as LobbyPushEnvelope;");
  }
  lines.push("    });");
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/**
 * 发现 Lobby RPC 向量 sidecar（`apps/server/test/lobbyRpcVectors/<域>.ts`）并与 domain 集合双向对齐：
 *  - 每个 domain 必须有同名 sidecar（新增域必须同批提供最小合法 request/response 向量）；
 *  - 每个 sidecar 必须对应一个 domain（域删除时同批删 sidecar，⛔ 不留孤儿）。
 * 返回按 id 排序的域名集（= sidecar 集）；⛔ 不执行 sidecar，只做存在性/形态校验。
 */
export function readVectorSidecars(root: string, descriptors: FeatureDescriptors): readonly string[] {
  const dir = path.join(root, VECTORS_DIR_RELATIVE);
  if (!fs.existsSync(dir)) fail(VECTORS_DIR_RELATIVE, "vectors directory is missing");
  const sidecars = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && name !== VECTORS_TYPES_FILE && !name.endsWith(".generated.ts") && !name.endsWith(".d.ts"))
    .map((name) => name.slice(0, -".ts".length))
    .sort();
  const domains = descriptors.domains.map((domain) => domain.domain).sort();
  for (const domain of domains) {
    const label = `${VECTORS_DIR_RELATIVE}/${domain}.ts`;
    assertRegularFile(path.join(dir, `${domain}.ts`), label);
  }
  for (const sidecar of sidecars) {
    if (!domains.includes(sidecar)) {
      fail(`${VECTORS_DIR_RELATIVE}/${sidecar}.ts`, `向量 sidecar 没有对应的 domain descriptor（域已删除？同批删除该 sidecar）`);
    }
  }
  return domains;
}

/** 向量登记表 `lobbyRpcVectors/index.generated.ts`：域 → sidecar default（两份 vectors 测试的唯一消费面）。 */
function renderVectorsIndex(domains: readonly string[]): string {
  const lines = [
    "/** AUTO-GENERATED by apps/server/tools/feature-codegen/cli.ts from"
      + ` ${DOMAINS_DIR_RELATIVE}/*.ts + ${VECTORS_DIR_RELATIVE}/<域>.ts. Do not edit. */`,
  ];
  for (const domain of domains) lines.push(`import ${domain}Vectors from "./${domain}";`);
  lines.push(
    "import type { LobbyRpcVectorFile } from \"./vectorTypes\";",
    "",
    "/** 域 → sidecar default（= LOBBY_RPC_DOMAINS；新增域只新增 lobbyRpcVectors/<域>.ts 并重跑 codegen:features）。 */",
    "export const LOBBY_RPC_VECTOR_FILES: Readonly<Record<string, LobbyRpcVectorFile>> = {",
    ...domains.map((domain) => `    ${domain}: ${domain}Vectors,`),
    "};",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

/** 渲染全部产物（registry + 客户端三件 + 向量登记表；保持 Map 形态与 gameplay-codegen 同构）。 */
export function renderFeatureArtifacts(
  descriptors: FeatureDescriptors,
  catalog: ReturnType<typeof readViewCatalog>,
): ReadonlyMap<string, string> {
  const artifacts = new Map<string, string>([[REGISTRY_RELATIVE, renderRegistry(descriptors)]]);
  for (const [relative, content] of renderViewCatalogArtifacts(catalog)) artifacts.set(relative, content);
  artifacts.set(VECTORS_INDEX_RELATIVE, renderVectorsIndex(readVectorSidecars(catalog.root, descriptors)));
  return artifacts;
}

// ── 删除保护 ────────────────────────────────────────────────────────────────

/** 从既有 registry 生成物恢复域集合（生成物格式由本生成器唯一拥有）。 */
export function previousRegistryDomains(options: FeatureCodegenOptions = {}): readonly string[] {
  const file = path.join(resolvedRoot(options), REGISTRY_RELATIVE);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const block = text.match(/^export const LOBBY_RPC_DOMAINS: readonly string\[\] = \[\n((?: {4}"[^"\n]+",\n)*)\];$/mu);
  if (!block) return [];
  return [...block[1].matchAll(/"([^"\n]+)"/gu)].map((match) => match[1]);
}

// ── freshness 与写盘 ────────────────────────────────────────────────────────

/** 生成器独占所有权面：lobbyRpc/、apps/client/src/generated/ 与 test/lobbyRpcVectors/ 下的全部
 *  *.generated.ts，外加能力索引 docs/features.generated.md；预期之外的即 extra。 */
function collectOwnedFiles(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string, base: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, base);
      else if (entry.name.endsWith(".generated.ts")) out.push(posixPath(path.relative(base, full)));
    }
  };
  walk(path.join(root, LOBBY_RPC_DIR_RELATIVE), root);
  walk(path.join(root, "apps/client/src/generated"), root);
  walk(path.join(root, VECTORS_DIR_RELATIVE), root);
  if (fs.existsSync(path.join(root, FEATURE_INDEX_RELATIVE))) out.push(FEATURE_INDEX_RELATIVE);
  return [...new Set(out)].sort();
}

// ── writer 允许输出集合自检（§5.7：⛔ 生成器不写当前计划文件） ───────────────

/**
 * writer 输出路径的显式允许形态：protocol/lobbyRpc 与客户端 generated/ 的 `*.generated.ts`
 * + 能力索引 `docs/features.generated.md`。集合外的任何路径都拒绝。
 */
const WRITER_OUTPUT_ALLOWED = [
  /^apps\/shared\/src\/protocol\/lobbyRpc\/[A-Za-z0-9_/.-]*\.generated\.ts$/u,
  /^apps\/client\/src\/generated\/[A-Za-z0-9_.-]+\.generated\.ts$/u,
  /^docs\/features\.generated\.md$/u,
  /^apps\/server\/test\/lobbyRpcVectors\/index\.generated\.ts$/u,
] as const;

/**
 * 自检 writer 的允许输出集合（每次渲染/写盘前执行）。§5.7 硬约束：生成器⛔ 不能自动写
 * **当前计划文件**（plan-*.md）——验收结果、实跑证据与「已完成」判断由人工维护。
 * 把任一 plan-*.md 加进允许输出集合，本自检立即红（feature-codegen.test 反例钉住）。
 */
export function assertWriterOutputSetSafe(outputs: readonly string[]): void {
  for (const output of outputs) {
    const normalized = posixPath(output);
    if (/(^|\/)plan(-v\d+)?\.md$/u.test(normalized)) {
      fail(normalized, "当前计划文件（plan-*.md）不得进入生成器允许输出集合——验收与实跑证据由人工维护（§5.7）");
    }
    if (!WRITER_OUTPUT_ALLOWED.some((pattern) => pattern.test(normalized))) {
      fail(normalized, "不在生成器允许输出集合内（lobbyRpc/客户端 generated 的 *.generated.ts + docs/features.generated.md + lobbyRpcVectors/index.generated.ts）");
    }
  }
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
export function assertFeatureArtifactsFresh(options: FeatureCodegenOptions = {}): void {
  const root = resolvedRoot(options);
  const descriptors = readFeatureDescriptors(options);
  assertDomainContractVersionBumped(descriptors, previousDomainContracts(options));
  const catalog = readViewCatalog(root);
  const expected = renderFeatureArtifacts(descriptors, catalog);
  assertWriterOutputSetSafe([...expected.keys()]);
  const { stale, missing, extra } = diffArtifacts(root, expected);
  const problems: string[] = [];
  if (stale.length > 0) problems.push(`stale: ${stale.join(", ")}`);
  if (missing.length > 0) problems.push(`missing: ${missing.join(", ")}`);
  if (extra.length > 0) problems.push(`extra: ${extra.join(", ")}`);
  if (problems.length > 0) {
    throw new Error(
      `[feature-codegen] generated feature artifacts are not fresh — ${problems.join("; ")}. ${RUN_HINT}`,
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
 * 写盘。已登记而真源消失的域 / feature / View 必须显式 `--allow-delete <id>`；
 * 普通 `--write` 不得静默接受整个域、feature 或 View 消失。
 */
export function writeFeatureArtifacts(options: FeatureCodegenOptions = {}): FeatureWriteResult {
  const root = resolvedRoot(options);
  const allowDelete = new Set(options.allowDelete ?? []);
  const descriptors = readFeatureDescriptors(options);
  assertDomainContractVersionBumped(descriptors, previousDomainContracts(options));
  const catalog = readViewCatalog(root);
  const currentIds = new Set(descriptors.domains.map((domain) => domain.domain));
  const removed = previousRegistryDomains(options).filter((id) => !currentIds.has(id));
  const currentFeatureIds = new Set(catalog.features.map((feature) => feature.id));
  const removedFeatures = previousGeneratedFeatureIds(root).filter((id) => !currentFeatureIds.has(id));
  const currentViewNames = new Set(catalog.entries.map((entry) => entry.name));
  const removedViews = previousGeneratedViewNames(root).filter((name) => !currentViewNames.has(name));
  const refused = [...removed, ...removedFeatures, ...removedViews].filter((id) => !allowDelete.has(id));
  if (refused.length > 0) {
    fail(
      `${DOMAINS_DIR_RELATIVE} + features/`,
      `已登记但真源消失的域/feature/View：${refused.join(", ")}。`
      + "删除需要显式 --allow-delete <id>",
    );
  }

  const expected = renderFeatureArtifacts(descriptors, catalog);
  assertWriterOutputSetSafe([...expected.keys()]);
  const orphans = collectOwnedFiles(root).filter((relative) => !expected.has(relative));
  for (const relative of orphans) {
    fail(relative, `unexpected generated file in an owned generated directory. ${RUN_HINT}`);
  }

  const changed: string[] = [];
  for (const [relative, content] of expected) {
    const file = path.join(root, relative);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) continue;
    atomicWrite(file, content);
    changed.push(relative);
  }
  return {
    changed,
    deleted: [...removed, ...removedFeatures, ...removedViews].filter((id) => allowDelete.has(id)),
  };
}

// ── CLI 参数 ────────────────────────────────────────────────────────────────

export type FeatureCliArguments = {
  readonly check: boolean;
  readonly repositoryRoot?: string;
  readonly allowDelete?: readonly string[];
};

/** 沿用仓内惯例：`--check`、`--root <dir>`/`--root=<dir>`、`--allow-delete`；重复/未知参数 throw。 */
export function parseCli(argv: readonly string[]): FeatureCliArguments {
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
      if (!value || !ALLOW_DELETE_ID.test(value)) throw new Error("--allow-delete requires a domain/feature/View id");
      if (allowDelete.includes(value)) throw new Error(`duplicate argument: --allow-delete ${value}`);
      allowDelete.push(value);
    } else if (arg.startsWith("--allow-delete=")) {
      const value = arg.slice("--allow-delete=".length);
      if (!value || !ALLOW_DELETE_ID.test(value)) throw new Error("--allow-delete requires a domain/feature/View id");
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
