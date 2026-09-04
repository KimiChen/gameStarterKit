/**
 * 插件所有权推导（docs/PLUGIN.md §1/§5「目录即所有权」的机检形态）。
 *
 * 一个插件能写入仓库的路径集合由它的身份 (id, kinds, constantName, domains, fguiPackages,
 * feature.json 声明的客户端目录) **纯函数推导**，fail-closed：不在推导集内的路径一律拒绝——
 * 这是 allowlist，⛔ 不是「protected-paths.json 挡一下」的 denylist（PLUGIN-REVIEW F03/F04）。
 *
 * 推导集与仓库既有的 per-id 目录约定同构（gameplay-codegen / feature-codegen 发现的正是这些目录）；
 * 扁平目录（net/rooms、lobbyRpc/domains、websocket、test）按「文件名以 id / ConstantName 开头」归属。
 * 镜像（apps/Cocos/assets/src/**）与 `.meta` 由对应真源路径的归属推导，⛔ 不单独声明。
 *
 * 硬排除先于 allowlist 求值：脚本、工具、包清单、生成物、锁、场景文件与全部受保护路径永远不可由包写入。
 */
import fs from "node:fs";
import path from "node:path";

export type PluginKind = "gameplay" | "feature";

export interface PluginIdentity {
  readonly id: string;
  readonly kinds: readonly PluginKind[];
  /** kinds 含 gameplay 时必填（`register<ConstantName>GameMode` / `<ConstantName>Room.ts` 的派生源）。 */
  readonly constantName: string | null;
  /** kinds 含 feature 时可声明的 Lobby RPC 域（`domains/<d>.ts` / `websocket/<d>/` / 向量 sidecar）。 */
  readonly domains: readonly string[];
  /** 声明的 FGUI 包名（ART 源目录 + resources/ui 发布物）。 */
  readonly fguiPackages: readonly string[];
  /** feature.json 声明的 viewDirs / owners[].logicDir（安装期校验必须落在本插件命名空间内）。 */
  readonly clientDirs: readonly string[];
}

export interface OwnershipRule {
  readonly kind: "dir" | "file" | "prefix";
  /** dir：目录（含其下全部文件）；file：精确文件；prefix：`path` 目录下以 `prefix` 开头的文件。 */
  readonly path: string;
  readonly prefix?: string;
  readonly reason: string;
}

export interface PathVerdict {
  readonly allowed: boolean;
  readonly reason: string;
}

const ID = /^[a-z][A-Za-z0-9]{0,63}$/u;
const CONSTANT = /^[A-Z][A-Za-z0-9]{0,63}$/u;
const FGUI_PACKAGE = /^[A-Za-z0-9_]{1,64}$/u;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;

const CLIENT_SRC = "apps/client/src";
const COCOS_SRC = "apps/Cocos/assets/src";
const RESOURCES = "apps/Cocos/assets/resources";

/** 永远不可由包写入的路径前缀（目录）。 */
export const HARD_EXCLUDED_DIRS: readonly string[] = [
  ".git", ".github", "node_modules", "vendor", "scripts", "tools",
  "apps/server/tools", "apps/server/sql",
  `${CLIENT_SRC}/shared`, `${CLIENT_SRC}/lib`, `${CLIENT_SRC}/generated`, `${CLIENT_SRC}/app`,
  `${COCOS_SRC}/shared`, `${COCOS_SRC}/lib`, `${COCOS_SRC}/generated`, `${COCOS_SRC}/app`,
  "apps/shared/src/generated", "apps/shared/src/gameplays/generated", "apps/shared/src/protocol",
  "apps/server/src/rooms/schema", "apps/server/src/rooms/core", "apps/server/src/core/infra",
];

/** 永远不可由包写入的文件名形态。 */
export const HARD_EXCLUDED_BASENAMES: readonly RegExp[] = [
  /^package(-lock)?\.json$/u,
  /^\.npmrc$/u,
  /^tsconfig[A-Za-z0-9._-]*\.json$/u,
  /^\.env(\..*)?$/u,
  /\.generated\.(ts|md|json)$/u,
  /\.(lock|fingerprint|sha256)$/u,
  /^scene\.scene$/u,
];

/** 永远不可由包写入的精确文件。 */
export const HARD_EXCLUDED_FILES: readonly string[] = [
  "apps/shared/src/gameplays/index.ts",
  "apps/shared/src/gameplays/defineGameplayWire.ts",
  "apps/Cocos/assets/scene.scene",
];

/** 域 descriptor 是硬排除目录 protocol/ 下唯一允许的插件落点：按 (domain) 精确放行。 */
function domainDescriptorPath(domain: string): string {
  return `apps/shared/src/protocol/lobbyRpc/domains/${domain}.ts`;
}

function assertSegment(value: string, pattern: RegExp, label: string): void {
  if (!pattern.test(value)) throw new Error(`[plugin] ${label} "${value}" 非法（须匹配 ${pattern.source}）`);
}

/** 校验身份分量的字面量形态（推导前置：坏 id 会让 allowlist 变成任意前缀）。 */
export function assertPluginIdentity(identity: PluginIdentity): void {
  assertSegment(identity.id, ID, "id");
  if (identity.kinds.length === 0) throw new Error("[plugin] kinds 不能为空");
  for (const kind of identity.kinds) {
    if (kind !== "gameplay" && kind !== "feature") throw new Error(`[plugin] 未知 kind: ${String(kind)}`);
  }
  if (new Set(identity.kinds).size !== identity.kinds.length) throw new Error("[plugin] kinds 重复");
  if (identity.kinds.includes("gameplay")) {
    if (!identity.constantName) throw new Error("[plugin] kinds 含 gameplay 时必须声明 constantName");
    assertSegment(identity.constantName, CONSTANT, "constantName");
  } else if (identity.constantName !== null) {
    throw new Error("[plugin] 只有 kinds 含 gameplay 的插件才声明 constantName");
  }
  if (identity.domains.length > 0 && !identity.kinds.includes("feature")) {
    throw new Error("[plugin] 只有 kinds 含 feature 的插件可以声明 domains");
  }
  for (const domain of identity.domains) assertSegment(domain, ID, "domain");
  if (new Set(identity.domains).size !== identity.domains.length) throw new Error("[plugin] domains 重复");
  for (const pkg of identity.fguiPackages) assertSegment(pkg, FGUI_PACKAGE, "fguiPackage");
  if (new Set(identity.fguiPackages).size !== identity.fguiPackages.length) throw new Error("[plugin] fguiPackages 重复");
  if (identity.clientDirs.length > 0 && !identity.kinds.includes("feature")) {
    throw new Error("[plugin] 只有 kinds 含 feature 的插件才有 feature.json 客户端目录声明");
  }
  for (const dir of identity.clientDirs) {
    if (!isPluginClientDir(identity.id, dir)) {
      throw new Error(
        `[plugin] feature.json 声明的客户端目录 "${dir}" 不在插件 "${identity.id}" 的命名空间内`
        + `（允许：${CLIENT_SRC}/features/${identity.id}[/…]、${CLIENT_SRC}/view/**/${identity.id}、${CLIENT_SRC}/logic/**/${identity.id}）`,
      );
    }
  }
}

/** feature.json 的 viewDirs / logicDir 是否落在插件自己的客户端命名空间内。 */
export function isPluginClientDir(id: string, dir: string): boolean {
  const normalized = dir.replace(/\/+$/u, "");
  if (normalized === `${CLIENT_SRC}/features/${id}` || normalized.startsWith(`${CLIENT_SRC}/features/${id}/`)) return true;
  return new RegExp(`^${CLIENT_SRC.replace(/\//gu, "\\/")}\\/(view|logic)\\/(?:[A-Za-z0-9_-]+\\/)*${id}$`, "u").test(normalized);
}

/** 由身份推导允许写入的规则集（稳定排序；⛔ 不读工作树）。 */
export function deriveOwnership(identity: PluginIdentity): readonly OwnershipRule[] {
  assertPluginIdentity(identity);
  const { id } = identity;
  const rules: OwnershipRule[] = [
    { kind: "dir", path: `plugins/${id}`, reason: "插件自述（plugin.json）" },
    { kind: "dir", path: `docs/${id}`, reason: "插件自有文档" },
    { kind: "prefix", path: "apps/server/test", prefix: id, reason: "插件自有服务端测试（文件名以 id 开头）" },
    { kind: "prefix", path: "apps/server/test/int", prefix: id, reason: "插件自有集成测试（文件名以 id 开头）" },
    { kind: "prefix", path: "apps/client/test", prefix: id, reason: "插件自有客户端测试（文件名以 id 开头）" },
  ];
  if (identity.kinds.includes("gameplay")) {
    const constant = identity.constantName as string;
    rules.push(
      { kind: "dir", path: `apps/shared/schema/gameplays/${id}`, reason: "玩法单源（manifest.json + state.json）" },
      { kind: "dir", path: `apps/shared/src/gameplays/${id}`, reason: "玩法自有 shared 模块（wire.ts / ruleset.ts …）" },
      { kind: "dir", path: `apps/server/src/rooms/modes/${id}`, reason: "服务端 GameMode（index.ts 导出 register<Constant>GameMode）" },
      { kind: "dir", path: `${CLIENT_SRC}/gameplay/modes/${id}`, reason: "客户端 GameplayModule 装配件" },
      { kind: "dir", path: `${CLIENT_SRC}/logic/rooms/${id}`, reason: "客户端玩法 Logic" },
      { kind: "dir", path: `${CLIENT_SRC}/view/rooms/${id}`, reason: "客户端玩法 View" },
      { kind: "file", path: `${CLIENT_SRC}/net/rooms/${constant}Room.ts`, reason: "客户端玩法 joiner/adapter（<Constant>Room.ts）" },
      { kind: "dir", path: `${RESOURCES}/${id}`, reason: "玩法运行时资源（resources/<id>/）" },
    );
  }
  if (identity.kinds.includes("feature")) {
    rules.push(
      { kind: "dir", path: `features/${id}`, reason: "feature 登记（feature.json）" },
      { kind: "dir", path: `${CLIENT_SRC}/features/${id}`, reason: "feature 客户端源码（index/logic/net/view）" },
      { kind: "dir", path: `apps/server/src/core/${id}`, reason: "feature 服务端领域逻辑与自有键（keys.ts 经 kFeature* 工厂）" },
    );
    for (const domain of identity.domains) {
      rules.push(
        { kind: "file", path: domainDescriptorPath(domain), reason: `Lobby RPC 域 descriptor（${domain}）` },
        { kind: "dir", path: `apps/server/src/websocket/${domain}`, reason: `Lobby RPC 端点（${domain}.<method>）` },
        { kind: "file", path: `apps/server/test/lobbyRpcVectors/${domain}.ts`, reason: `RPC 向量 sidecar（${domain}）` },
      );
      if (domain !== id) rules.push({ kind: "dir", path: `apps/server/src/core/${domain}`, reason: `域 ${domain} 的服务端领域逻辑` });
    }
    for (const dir of identity.clientDirs) rules.push({ kind: "dir", path: dir.replace(/\/+$/u, ""), reason: "feature.json 声明的客户端目录" });
  }
  for (const pkg of identity.fguiPackages) {
    rules.push(
      { kind: "dir", path: `apps/art/fairygui/assets/${pkg}`, reason: `FGUI 包源（${pkg}）` },
      { kind: "file", path: `${RESOURCES}/ui/${pkg}.bin`, reason: `FGUI 发布物（${pkg}.bin）` },
      { kind: "prefix", path: `${RESOURCES}/ui`, prefix: `${pkg}_atlas`, reason: `FGUI 图集（${pkg}_atlas*）` },
    );
  }
  const dedup = new Map<string, OwnershipRule>();
  for (const rule of rules) dedup.set(`${rule.kind}:${rule.path}:${rule.prefix ?? ""}`, rule);
  return [...dedup.values()].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function matchesRule(relative: string, rule: OwnershipRule): boolean {
  if (rule.kind === "dir") return relative === rule.path || relative.startsWith(`${rule.path}/`);
  if (rule.kind === "file") return relative === rule.path;
  const dir = path.posix.dirname(relative);
  const base = path.posix.basename(relative);
  return dir === rule.path && base.startsWith(rule.prefix ?? "") && base !== rule.prefix;
}

/** 规范化并校验包内相对路径形态（zip-slip / 绝对路径 / 反斜杠 / 空段 / 控制字符）。 */
export function normalizePackagePath(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) throw new Error("[plugin] 包内路径不能为空");
  if (raw.includes("\\")) throw new Error(`[plugin] 包内路径不得含反斜杠：${raw}`);
  if (raw.startsWith("/") || /^[A-Za-z]:/u.test(raw)) throw new Error(`[plugin] 包内路径必须是仓库相对路径：${raw}`);
  if (CONTROL_CHARS.test(raw)) throw new Error(`[plugin] 包内路径含控制字符：${JSON.stringify(raw)}`);
  const segments = raw.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") throw new Error(`[plugin] 包内路径含非法段（空 / . / ..）：${raw}`);
  }
  return segments.join("/");
}

/** 硬排除判定（先于 allowlist；域 descriptor 是 protocol/ 下的唯一例外，由调用方按 allowlist 放行）。 */
export function hardExclusionReason(relative: string, rules: readonly OwnershipRule[]): string | null {
  const segments = relative.split("/");
  if (segments.includes("node_modules") || segments.includes(".git")) return "node_modules/.git 段永不可写";
  if (rules.some((rule) => rule.kind === "file" && rule.path === relative && relative.startsWith("apps/shared/src/protocol/lobbyRpc/domains/"))) {
    return null;
  }
  for (const dir of HARD_EXCLUDED_DIRS) {
    if (relative === dir || relative.startsWith(`${dir}/`)) return `硬排除目录 ${dir}`;
  }
  if (HARD_EXCLUDED_FILES.includes(relative)) return "硬排除文件";
  const base = path.posix.basename(relative);
  for (const pattern of HARD_EXCLUDED_BASENAMES) {
    if (pattern.test(base)) return `硬排除文件名形态 ${pattern.source}`;
  }
  return null;
}

type ProtectedRules = {
  readonly featureFlow?: { readonly paths?: readonly string[] };
  readonly gameplayFlow?: { readonly paths?: readonly string[] };
  readonly generatedWriterOwned?: { readonly entries?: readonly { readonly path: string }[] };
};

/**
 * 读取 scripts/protected-paths.json 的保护/生成物路径（allowlist 之外的第二道闸；缺文件视为空集）。
 * ⚠ 唯一剔除：Cocos 镜像 `apps/Cocos/assets/src/**`——它是 sync:client 的产物，但插件包**必须**携带自己
 * 那部分镜像与 Creator 产出的 `.meta`（安装侧不合成，PLUGIN-REVIEW F11）；镜像路径的可写性由其客户端
 * 真源的归属推导（classifyPath 的 sourceOf），不在这里一刀切。
 */
export function readProtectedPaths(root: string): readonly string[] {
  const file = path.join(root, "scripts/protected-paths.json");
  if (!fs.existsSync(file)) return [];
  const rules = JSON.parse(fs.readFileSync(file, "utf8")) as ProtectedRules;
  return [
    ...(rules.featureFlow?.paths ?? []),
    ...(rules.gameplayFlow?.paths ?? []),
    ...(rules.generatedWriterOwned?.entries ?? []).map((entry) => entry.path).filter((entry) => entry !== `${COCOS_SRC}/**`),
  ];
}

function matchesProtected(relative: string, protectedPath: string): boolean {
  if (protectedPath.endsWith("/**")) {
    const dir = protectedPath.slice(0, -3);
    return relative === dir || relative.startsWith(`${dir}/`);
  }
  return relative === protectedPath;
}

/** 镜像/`.meta` 路径 → 真源路径（供 allowlist 复用）；非镜像/非 .meta 原样返回。 */
function sourceOf(relative: string): { readonly source: string; readonly meta: boolean; readonly mirror: boolean } {
  const meta = relative.endsWith(".meta");
  let source = meta ? relative.slice(0, -".meta".length) : relative;
  let mirror = false;
  if (source === COCOS_SRC || source.startsWith(`${COCOS_SRC}/`)) {
    source = `${CLIENT_SRC}${source.slice(COCOS_SRC.length)}`;
    mirror = true;
  }
  return { source, meta, mirror };
}

/**
 * 判定一个包内路径是否可写。顺序：路径形态 → 硬排除 → 受保护路径 → allowlist。
 * 镜像与 `.meta` 按其真源路径判定（目录 `.meta` 命中 dir 规则本身也放行）；共享祖先目录的
 * `.meta`（如 `view/rooms.meta`）由仓库持有，⛔ 不随包分发。
 */
export function classifyPath(
  rawRelative: string,
  rules: readonly OwnershipRule[],
  protectedPaths: readonly string[],
): PathVerdict {
  const relative = normalizePackagePath(rawRelative);
  const hard = hardExclusionReason(relative, rules);
  if (hard) return { allowed: false, reason: hard };
  for (const protectedPath of protectedPaths) {
    if (matchesProtected(relative, protectedPath)) return { allowed: false, reason: `受保护路径 ${protectedPath}` };
  }
  const { source, meta, mirror } = sourceOf(relative);
  if (mirror && !source.startsWith(`${CLIENT_SRC}/`)) return { allowed: false, reason: "镜像路径无对应客户端真源" };
  for (const rule of rules) {
    if (matchesRule(source, rule)) {
      return { allowed: true, reason: `${rule.reason}${mirror ? "（Cocos 镜像）" : ""}${meta ? "（.meta）" : ""}` };
    }
    if (meta && rule.kind === "dir" && source === rule.path) return { allowed: true, reason: `${rule.reason}（目录 .meta）` };
  }
  return { allowed: false, reason: "不在插件所有权推导集内" };
}

/** 规则展开为工作树采集根（pack 遍历 / uninstall 清理空目录用）。 */
export function ownershipRoots(rules: readonly OwnershipRule[]): readonly string[] {
  const roots = new Set<string>();
  for (const rule of rules) roots.add(rule.kind === "file" ? path.posix.dirname(rule.path) : rule.path);
  return [...roots].sort();
}

/** 客户端真源路径 → Cocos 镜像路径。 */
export function mirrorPathOf(clientRelative: string): string | null {
  if (clientRelative === CLIENT_SRC || clientRelative.startsWith(`${CLIENT_SRC}/`)) {
    return `${COCOS_SRC}${clientRelative.slice(CLIENT_SRC.length)}`;
  }
  return null;
}
