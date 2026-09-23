/**
 * codegen:plugins 的编排层（Non-intrusive §4.2/§5.5 阶段 3；§7.5 阶段 6 扩展）：
 *  - 发现 Lobby RPC domain descriptor（apps/shared/src/protocol/lobbyRpc/domains/*.ts +
 *    coreErrors.ts），语法读取后渲染 `registry.generated.ts`；
 *  - 发现 apps/plugins/<id>/plugin.json + `<Name>View.view.json` sidecar + FGUI XML（viewCatalog.ts），
 *    渲染客户端三产物 `apps/client/src/generated/{fguiContracts,views,plugins}.generated.ts`
 *    ——全仓唯一的客户端 View catalog/FGUI contract writer（§3.1 交汇点）；
 *  - 发现 `apps/server/test/lobbyRpcVectors/<域>.ts` 向量 sidecar 并与 domain 集合双向对齐，渲染
 *    `lobbyRpcVectors/index.generated.ts`（§5.6：向量由 plugin 持有，两份 vectors 测试只消费此表，
 *    新增域 ⛔ 不再手改任何中央测试登记表）；
 *  - 渲染能力索引 `docs/plugins.generated.md`（§5.7 阶段 7：id/class/category/docs/结构状态，
 *    状态词汇表仅 planned/registered/source-present；⛔ 生成器不写 plan-*.md——
 *    `assertWriterOutputSetSafe` 对允许输出集合自检，塞进计划文件即红）；
 *  - 发现 `apps/kits/<id>/kit.json`（docs/KIT.md §3/§7，与插件同一 catalog），渲染 kit 登记的双端形态
 *    `apps/shared/src/kits/catalog.generated.ts` + `apps/server/src/kits/catalog.generated.ts`（零 kit 时与占位相同），
 *    并按登记面 `domains` 对域 descriptor 集做域名前缀规则交叉核对（KIT.md §2，viewCatalog.assertDomainOwnership）。
 * freshness（--check 只读）与原子写盘（--write）对七件产物同一口径。
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
 * `apps/server/test/plugin-codegen.test.ts` 的只读断言守门）。
 * ⚠ registry 落在 protocol/ 内 ⇒ `--write` 后必须 `node scripts/protocol-fingerprint.mjs --write`
 * 重钉协议指纹（--check ⛔ 不碰指纹，那是显式审计锁）。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  KIT_CATALOG_SERVER_RELATIVE,
  KIT_CATALOG_SHARED_RELATIVE,
  KITS_DIR_RELATIVE,
  PLUGIN_INDEX_RELATIVE,
  PLUGINS_DIR_RELATIVE,
  assertDomainOwnership,
  previousGeneratedKitIds,
  previousGeneratedPluginIds,
  previousGeneratedViewNames,
  readViewCatalog,
  renderViewCatalogArtifacts,
} from "./viewCatalog";
import { CONTRIBUTIONS_BASENAME, CONTRIBUTIONS_FILE_RE } from "./contributions";
import { CONTRIBUTION_ENDS } from "./pluginManifestSchema";
import {
  assertSchemaDomainArtifactsFresh,
  renderSchemaDomainArtifacts,
  writeSchemaDomainArtifacts,
} from "./schemaDomainCodegen";

const TOOL_REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const LOBBY_RPC_DIR_RELATIVE = "apps/shared/src/protocol/lobbyRpc";
const DOMAINS_DIR_RELATIVE = `${LOBBY_RPC_DIR_RELATIVE}/domains`;
const REGISTRY_RELATIVE = `${LOBBY_RPC_DIR_RELATIVE}/registry.generated.ts`;
/** Lobby RPC 测试向量 sidecar 目录（Non-intrusive §5.6：向量由 plugin 持有，⛔ 中央不再手写登记表）。 */
const VECTORS_DIR_RELATIVE = "apps/server/test/lobbyRpcVectors";
export const VECTORS_INDEX_RELATIVE = `${VECTORS_DIR_RELATIVE}/index.generated.ts`;
const VECTORS_TYPES_FILE = "vectorTypes.ts";

/** --allow-delete 同时接受域/plugin/kit（camelCase）与 View 名（PascalCase）。 */
const ALLOW_DELETE_ID = /^[A-Za-z][A-Za-z0-9]{0,63}$/u;
const RUN_HINT = "Run npm --workspace @game/server run codegen:plugins";

export {
  readPluginDescriptors,
  previousDomainContracts,
  assertDomainContractVersionBumped,
} from "../../../../tools/lobby-protocol/registryCodegen";
import {
  readPluginDescriptors,
  previousDomainContracts,
  assertDomainContractVersionBumped,
  renderRegistry,
} from "../../../../tools/lobby-protocol/registryCodegen";
import type {
  PluginCodegenOptions,
  PluginDescriptors,
} from "../../../../tools/lobby-protocol/registryCodegen";
export type {
  PluginCodegenOptions,
  PluginDescriptors,
  DomainContract,
} from "../../../../tools/lobby-protocol/registryCodegen";

export type PluginWriteResult = {
  readonly changed: readonly string[];
  readonly deleted: readonly string[];
  /** 被删除的孤儿生成物（MF9：kit 撤销某端贡献点声明后的 contributions.generated.ts）。 */
  readonly removedFiles: readonly string[];
};

function fail(pathLabel: string, message: string): never {
  throw new Error(`[plugin-codegen] ${pathLabel}: ${message}`);
}

function resolvedRoot(options: PluginCodegenOptions): string {
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

/**
 * 发现 Lobby RPC 向量 sidecar（`apps/server/test/lobbyRpcVectors/<域>.ts`）并与 domain 集合双向对齐：
 *  - 每个 domain 必须有同名 sidecar（新增域必须同批提供最小合法 request/response 向量）；
 *  - 每个 sidecar 必须对应一个 domain（域删除时同批删 sidecar，⛔ 不留孤儿）。
 * 返回按 id 排序的域名集（= sidecar 集）；⛔ 不执行 sidecar，只做存在性/形态校验。
 */
export function readVectorSidecars(
  root: string,
  descriptors: PluginDescriptors,
): readonly string[] {
  const dir = path.join(root, VECTORS_DIR_RELATIVE);
  if (!fs.existsSync(dir))
    fail(VECTORS_DIR_RELATIVE, "vectors directory is missing");
  const sidecars = fs
    .readdirSync(dir)
    .filter(
      (name) =>
        name.endsWith(".ts") &&
        name !== VECTORS_TYPES_FILE &&
        !name.endsWith(".generated.ts") &&
        !name.endsWith(".d.ts"),
    )
    .map((name) => name.slice(0, -".ts".length))
    .sort();
  const domains = descriptors.domains.map((domain) => domain.domain).sort();
  for (const domain of domains) {
    const label = `${VECTORS_DIR_RELATIVE}/${domain}.ts`;
    assertRegularFile(path.join(dir, `${domain}.ts`), label);
  }
  for (const sidecar of sidecars) {
    if (!domains.includes(sidecar)) {
      fail(
        `${VECTORS_DIR_RELATIVE}/${sidecar}.ts`,
        `向量 sidecar 没有对应的 domain descriptor（域已删除？同批删除该 sidecar）`,
      );
    }
  }
  return domains;
}

/** 向量登记表 `lobbyRpcVectors/index.generated.ts`：域 → sidecar default（两份 vectors 测试的唯一消费面）。 */
function renderVectorsIndex(domains: readonly string[]): string {
  const lines = [
    "/** AUTO-GENERATED by apps/server/tools/plugin-codegen/cli.ts from" +
      ` ${DOMAINS_DIR_RELATIVE}/*.ts + ${VECTORS_DIR_RELATIVE}/<域>.ts. Do not edit. */`,
  ];
  for (const domain of domains)
    lines.push(`import ${domain}Vectors from "./${domain}";`);
  lines.push(
    'import type { LobbyRpcVectorFile } from "./vectorTypes";',
    "",
    "/** 域 → sidecar default（= LOBBY_RPC_DOMAINS；新增域只新增 lobbyRpcVectors/<域>.ts 并重跑 codegen:plugins）。 */",
    "export const LOBBY_RPC_VECTOR_FILES: Readonly<Record<string, LobbyRpcVectorFile>> = {",
    ...domains.map((domain) => `    ${domain}: ${domain}Vectors,`),
    "};",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

/** 渲染全部产物（registry + 客户端三件 + 向量登记表；保持 Map 形态与 gameplay-codegen 同构）。 */
export function renderPluginArtifacts(
  descriptors: PluginDescriptors,
  catalog: ReturnType<typeof readViewCatalog>,
): ReadonlyMap<string, string> {
  const artifacts = new Map<string, string>([
    [REGISTRY_RELATIVE, renderRegistry(descriptors)],
  ]);
  for (const [relative, content] of renderViewCatalogArtifacts(catalog))
    artifacts.set(relative, content);
  artifacts.set(
    VECTORS_INDEX_RELATIVE,
    renderVectorsIndex(readVectorSidecars(catalog.root, descriptors)),
  );
  return artifacts;
}

// ── 删除保护 ────────────────────────────────────────────────────────────────

/** 从既有 registry 生成物恢复域集合（生成物格式由本生成器唯一拥有）。 */
export function previousRegistryDomains(
  options: PluginCodegenOptions = {},
): readonly string[] {
  const file = path.join(resolvedRoot(options), REGISTRY_RELATIVE);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const block = text.match(
    /^export const LOBBY_RPC_DOMAINS: readonly string\[\] = \[\n((?: {4}"[^"\n]+",\n)*)\];$/mu,
  );
  if (!block) return [];
  return [...block[1].matchAll(/"([^"\n]+)"/gu)].map((match) => match[1]);
}

// ── freshness 与写盘 ────────────────────────────────────────────────────────

/** 生成器独占所有权面：lobbyRpc/、apps/client/src/generated/ 与 test/lobbyRpcVectors/ 下的全部
 *  *.generated.ts，外加能力索引 docs/plugins.generated.md 与 kit 登记双端生成物（精确两个文件：
 *  ⛔ 不递归 kits/ 命名空间，kit 自己的生成物不归本生成器）；预期之外的即 extra。 */
function collectOwnedFiles(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string, base: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, base);
      else if (entry.name.endsWith(".generated.ts"))
        out.push(posixPath(path.relative(base, full)));
    }
  };
  walk(path.join(root, LOBBY_RPC_DIR_RELATIVE), root);
  walk(path.join(root, "apps/client/src/generated"), root);
  walk(path.join(root, VECTORS_DIR_RELATIVE), root);
  for (const relative of [
    PLUGIN_INDEX_RELATIVE,
    KIT_CATALOG_SHARED_RELATIVE,
    KIT_CATALOG_SERVER_RELATIVE,
  ]) {
    if (fs.existsSync(path.join(root, relative))) out.push(relative);
  }
  // MF9：每 kit 一份的贡献收录文件（只认 kits/<id>/ 一层下的固定文件名，⛔ 不递归 kit 目录）。
  for (const end of CONTRIBUTION_ENDS) {
    const kitsDir = path.join(root, `apps/${end}/src/kits`);
    if (!fs.existsSync(kitsDir) || !fs.statSync(kitsDir).isDirectory())
      continue;
    for (const entry of fs.readdirSync(kitsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(kitsDir, entry.name, CONTRIBUTIONS_BASENAME);
      if (fs.existsSync(file)) out.push(posixPath(path.relative(root, file)));
    }
  }
  return [...new Set(out)].sort();
}

// ── writer 允许输出集合自检（§5.7：⛔ 生成器不写当前计划文件） ───────────────

/**
 * writer 输出路径的显式允许形态：protocol/lobbyRpc 与客户端 generated/ 的 `*.generated.ts`
 * + 能力索引 `docs/plugins.generated.md` + kit 登记双端生成物（精确两个路径）。集合外的任何路径都拒绝。
 */
const WRITER_OUTPUT_ALLOWED = [
  /^apps\/shared\/src\/protocol\/lobbyRpc\/domains\/[A-Za-z0-9_-]+\.ts$/u,
  /^apps\/shared\/src\/protocol\/lobbyRpc\/[A-Za-z0-9_/.-]*\.generated\.ts$/u,
  /^apps\/client\/src\/generated\/[A-Za-z0-9_.-]+\.generated\.ts$/u,
  /^docs\/plugins\.generated\.md$/u,
  /^apps\/server\/test\/lobbyRpcVectors\/index\.generated\.ts$/u,
  /^apps\/shared\/src\/kits\/catalog\.generated\.ts$/u,
  /^apps\/server\/src\/kits\/catalog\.generated\.ts$/u,
  CONTRIBUTIONS_FILE_RE,
] as const;

/**
 * 自检 writer 的允许输出集合（每次渲染/写盘前执行）。§5.7 硬约束：生成器⛔ 不能自动写
 * **当前计划文件**（plan-*.md）——验收结果、实跑证据与「已完成」判断由人工维护。
 * 把任一 plan-*.md 加进允许输出集合，本自检立即红（plugin-codegen.test 反例钉住）。
 */
export function assertWriterOutputSetSafe(outputs: readonly string[]): void {
  for (const output of outputs) {
    const normalized = posixPath(output);
    if (/(^|\/)plan(-v\d+)?\.md$/u.test(normalized)) {
      fail(
        normalized,
        "当前计划文件（plan-*.md）不得进入生成器允许输出集合——验收与实跑证据由人工维护（§5.7）",
      );
    }
    if (!WRITER_OUTPUT_ALLOWED.some((pattern) => pattern.test(normalized))) {
      fail(
        normalized,
        "不在生成器允许输出集合内（lobbyRpc/客户端 generated 的 *.generated.ts + docs/plugins.generated.md + lobbyRpcVectors/index.generated.ts + {shared,server}/src/kits/catalog.generated.ts + apps/{shared,server,client}/src/kits/<id>/contributions.generated.ts）",
      );
    }
  }
}

function diffArtifacts(
  root: string,
  expected: ReadonlyMap<string, string>,
): {
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
  const extra = collectOwnedFiles(root).filter(
    (relative) => !expected.has(relative),
  );
  return { stale, missing, extra };
}

/** 只读 freshness 断言：stale / missing / extra 任一非空即失败并点名。 */
export function assertPluginArtifactsFresh(
  options: PluginCodegenOptions = {},
): void {
  const root = resolvedRoot(options);
  if (!options.skipSchemaDomainCodegen) assertSchemaDomainArtifactsFresh(root);
  const descriptors = readPluginDescriptors(options);
  assertDomainContractVersionBumped(
    descriptors,
    previousDomainContracts(options),
  );
  const catalog = readViewCatalog(root);
  assertDomainOwnership(
    descriptors.domains.map((domain) => domain.domain),
    catalog.plugins,
  );
  const expected = renderPluginArtifacts(descriptors, catalog);
  assertWriterOutputSetSafe([...expected.keys()]);
  const { stale, missing, extra } = diffArtifacts(root, expected);
  const problems: string[] = [];
  if (stale.length > 0) problems.push(`stale: ${stale.join(", ")}`);
  if (missing.length > 0) problems.push(`missing: ${missing.join(", ")}`);
  if (extra.length > 0) problems.push(`extra: ${extra.join(", ")}`);
  if (problems.length > 0) {
    throw new Error(
      `[plugin-codegen] generated plugin artifacts are not fresh — ${problems.join("; ")}. ${RUN_HINT}`,
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
 * 写盘。已登记而真源消失的域 / plugin / kit / View 必须显式 `--allow-delete <id>`；
 * 普通 `--write` 不得静默接受整个域、plugin、kit 或 View 消失（kit 锚在 KIT_CATALOG，
 * PluginHost 单元锚在 PLUGIN_IDS，两处任一命中都要求显式删除）。同一 id 换类别
 * （plugin ⇄ kit：共享 id 空间与锁目录 scripts/packages/）与删除同等重大，两个方向都要显式 --allow-delete。
 */
export function writePluginArtifacts(
  options: PluginCodegenOptions = {},
): PluginWriteResult {
  const root = resolvedRoot(options);
  // schema 域先只在内存渲染。contractVersion / 删除保护 / View 所有权等任一闸失败时，
  // 磁盘必须仍是上一次完整生成的状态，不能留下「domains 新、registry 旧」的半写结果。
  const schemaArtifacts = options.skipSchemaDomainCodegen
    ? undefined
    : renderSchemaDomainArtifacts(root);
  const allowDelete = new Set(options.allowDelete ?? []);
  const descriptors = readPluginDescriptors(options, schemaArtifacts);
  assertDomainContractVersionBumped(
    descriptors,
    previousDomainContracts(options),
  );
  const catalog = readViewCatalog(root);
  assertDomainOwnership(
    descriptors.domains.map((domain) => domain.domain),
    catalog.plugins,
  );
  const currentIds = new Set(
    descriptors.domains.map((domain) => domain.domain),
  );
  const removed = previousRegistryDomains(options).filter(
    (id) => !currentIds.has(id),
  );
  const currentPluginIds = new Set(catalog.plugins.map((plugin) => plugin.id));
  const currentKitIds = new Set(
    catalog.plugins
      .filter((unit) => unit.class === "kit")
      .map((unit) => unit.id),
  );
  const previousKitIds = previousGeneratedKitIds(root);
  const previousPluginIds = previousGeneratedPluginIds(root);
  // PLUGIN_IDS 不带 class：既在 PLUGIN_IDS 又不在 KIT_CATALOG 的 id 才是「原来是 plugin」。
  const previousPluginOnlyIds = previousPluginIds.filter(
    (id) => !previousKitIds.includes(id),
  );
  const removedPlugins = [
    ...new Set([...previousPluginIds, ...previousKitIds]),
  ].filter(
    (id) =>
      !currentPluginIds.has(id) ||
      (previousKitIds.includes(id) && !currentKitIds.has(id)) ||
      (previousPluginOnlyIds.includes(id) && currentKitIds.has(id)),
  );
  const currentViewNames = new Set(catalog.entries.map((entry) => entry.name));
  const removedViews = previousGeneratedViewNames(root).filter(
    (name) => !currentViewNames.has(name),
  );
  // 同一 id 可能同时是域与 kit（kit 声明与自己同名的域是常态）：去重后再判，--allow-delete <id> 一次覆盖两处。
  const refused = [
    ...new Set([...removed, ...removedPlugins, ...removedViews]),
  ].filter((id) => !allowDelete.has(id));
  if (refused.length > 0) {
    fail(
      `${DOMAINS_DIR_RELATIVE} + ${PLUGINS_DIR_RELATIVE} + ${KITS_DIR_RELATIVE}`,
      `已登记但真源消失的域/plugin/kit/View：${refused.join(", ")}。` +
        "删除需要显式 --allow-delete <id>",
    );
  }

  const expected = renderPluginArtifacts(descriptors, catalog);
  assertWriterOutputSetSafe([...expected.keys()]);
  const expectedSchemaFiles = new Set(
    schemaArtifacts?.map((artifact) => artifact.relative) ?? [],
  );
  const schemaOrphans =
    schemaArtifacts === undefined
      ? []
      : fs.existsSync(path.join(root, DOMAINS_DIR_RELATIVE))
        ? fs
            .readdirSync(path.join(root, DOMAINS_DIR_RELATIVE), {
              withFileTypes: true,
            })
            .filter((entry) => entry.isFile())
            .map((entry) => `${DOMAINS_DIR_RELATIVE}/${entry.name}`)
            .filter((relative) => !expectedSchemaFiles.has(relative))
        : [];
  for (const relative of schemaOrphans) {
    const domain = path.basename(relative, ".ts");
    if (!removed.includes(domain) || !allowDelete.has(domain)) {
      fail(relative, "unexpected generated schema domain file. " + RUN_HINT);
    }
  }
  const orphans = collectOwnedFiles(root).filter(
    (relative) => !expected.has(relative),
  );
  const removedFiles: string[] = [];
  for (const relative of orphans) {
    // MF9：kit 撤销了某端的贡献点声明（或 kit 本身已 --allow-delete）⇒ 该端 contributions.generated.ts 是可自动收回的孤儿。
    const contribution = CONTRIBUTIONS_FILE_RE.exec(relative);
    const kitId = contribution?.[2];
    if (
      kitId !== undefined &&
      (currentKitIds.has(kitId) || allowDelete.has(kitId))
    ) {
      fs.rmSync(path.join(root, relative));
      removedFiles.push(relative);
      continue;
    }
    fail(
      relative,
      `unexpected generated file in an owned generated directory. ${RUN_HINT}`,
    );
  }

  const schemaChanged =
    schemaArtifacts === undefined
      ? []
      : writeSchemaDomainArtifacts(root, schemaArtifacts);
  for (const relative of schemaOrphans) {
    fs.rmSync(path.join(root, relative));
    removedFiles.push(relative);
  }
  const changed: string[] = [];
  for (const [relative, content] of expected) {
    const file = path.join(root, relative);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content)
      continue;
    atomicWrite(file, content);
    changed.push(relative);
  }
  return {
    changed: [...schemaChanged, ...changed],
    deleted: [
      ...new Set([...removed, ...removedPlugins, ...removedViews]),
    ].filter((id) => allowDelete.has(id)),
    removedFiles,
  };
}

// ── CLI 参数 ────────────────────────────────────────────────────────────────

export type PluginCliArguments = {
  readonly check: boolean;
  readonly repositoryRoot?: string;
  readonly allowDelete?: readonly string[];
};

/** 沿用仓内惯例：`--check`、`--root <dir>`/`--root=<dir>`、`--allow-delete`；重复/未知参数 throw。 */
export function parseCli(argv: readonly string[]): PluginCliArguments {
  let check = false;
  let repositoryRoot: string | undefined;
  const allowDelete: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      if (check) throw new Error("duplicate argument: --check");
      check = true;
    } else if (arg === "--root") {
      if (repositoryRoot !== undefined)
        throw new Error("duplicate argument: --root");
      const value = argv[++index];
      if (!value) throw new Error("--root requires a non-empty directory");
      repositoryRoot = value;
    } else if (arg.startsWith("--root=")) {
      if (repositoryRoot !== undefined)
        throw new Error("duplicate argument: --root");
      repositoryRoot = arg.slice("--root=".length);
      if (!repositoryRoot)
        throw new Error("--root requires a non-empty directory");
    } else if (arg === "--allow-delete") {
      const value = argv[++index];
      if (!value || !ALLOW_DELETE_ID.test(value))
        throw new Error("--allow-delete requires a domain/plugin/View id");
      if (allowDelete.includes(value))
        throw new Error(`duplicate argument: --allow-delete ${value}`);
      allowDelete.push(value);
    } else if (arg.startsWith("--allow-delete=")) {
      const value = arg.slice("--allow-delete=".length);
      if (!value || !ALLOW_DELETE_ID.test(value))
        throw new Error("--allow-delete requires a domain/plugin/View id");
      if (allowDelete.includes(value))
        throw new Error(`duplicate argument: --allow-delete ${value}`);
      allowDelete.push(value);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (check && allowDelete.length > 0)
    throw new Error("--check is read-only and rejects --allow-delete");
  return {
    check,
    ...(repositoryRoot === undefined ? {} : { repositoryRoot }),
    ...(allowDelete.length === 0 ? {} : { allowDelete }),
  };
}
