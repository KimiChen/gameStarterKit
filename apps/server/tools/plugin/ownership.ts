/**
 * 插件所有权推导（docs/PLUGIN.md §1/§5「目录即所有权」的机检形态）。
 *
 * 一个插件能写入仓库的路径集合由它的身份 (id, kinds, constantName, domains, fguiPackages,
 * plugin.json 声明的客户端目录) **纯函数推导**，fail-closed：不在推导集内的路径一律拒绝——
 * 这是 allowlist，⛔ 不是「protected-paths.json 挡一下」的 denylist（PLUGIN-REVIEW F03/F04）。
 *
 * 推导集与仓库既有的 per-id 目录约定同构（gameplay-codegen / plugin-codegen 发现的正是这些目录）；
 * 扁平目录（net/rooms、lobbyRpc/domains、websocket）按精确文件名归属；测试目录按 `<id>-*` / `<id>.*`
 * 前缀归属——前缀后**必须**紧跟分隔符（`-` 或 `.`），⛔ 不是裸 startsWith：否则 `tally` 会吞掉
 * `tallyBoard-*.test.ts`、`red` 会拥有 `redis-route.test.ts`（PLUGIN-REGISTRY §1-4）。
 * 镜像（apps/Cocos/assets/src/**）与 `.meta` 由对应真源路径的归属推导，⛔ 不单独声明。
 *
 * 硬排除先于 allowlist 求值：脚本、工具、包清单、生成物、锁、场景文件与全部受保护路径永远不可由包写入。
 */
import fs from "node:fs";
import path from "node:path";
import { INSTALLED_LOCK_DIR } from "./lock";

/**
 * 派生的包形态：client = 有客户端登记（entry / views / routes / menu），gameplay = 有玩法单源，server = 只有 kit 会有——
 * 带 SQL 迁移或 `apps/server/src/kits/<id>/`（纯 SQL + 服务的 kit 合法，docs/KIT.md §3）；可并存。
 */
export type PluginKind = "gameplay" | "client" | "server";

/** 包的类别（docs/KIT.md §1）：plugin 只消费；kit 是被审核的定义方，落点在 kits/ 命名空间。 */
export type PackageClass = "plugin" | "kit";

/** kit 自带的一个玩法（docs/KIT.md §3 `modes`）；插件的单个玩法由 constantName 表达，⛔ 不用本结构。 */
export interface PackageMode {
  readonly id: string;
  readonly constantName: string;
}

export interface PluginIdentity {
  readonly class: PackageClass;
  readonly id: string;
  readonly kinds: readonly PluginKind[];
  /** 插件：kinds 含 gameplay 时必填（`register<ConstantName>GameMode` / `<ConstantName>Room.ts` 的派生源）；kit 恒为 null。 */
  readonly constantName: string | null;
  /** kit：自带玩法清单（每个 mode 各推一组玩法规则）；插件恒为空。 */
  readonly modes: readonly PackageMode[];
  /** 可声明的 Lobby RPC 域（`domains/<d>.ts` / `websocket/<d>/` / 向量 sidecar）。 */
  readonly domains: readonly string[];
  /** 声明的 FGUI 包名（ART 源目录 + resources/ui 发布物）。 */
  readonly fguiPackages: readonly string[];
  /** plugin.json 声明的 viewDirs / owners[].logicDir（安装期校验必须落在本插件命名空间内）。 */
  readonly clientDirs: readonly string[];
}

export interface OwnershipRule {
  readonly kind: "dir" | "file" | "prefix";
  /** dir：目录（含其下全部文件）；file：精确文件；prefix：`path` 目录下以 `prefix` 开头的文件。 */
  readonly path: string;
  readonly prefix?: string;
  /**
   * prefix 规则的边界：`separator`（缺省）要求前缀后紧跟 `-` 或 `.`；`any` 允许任意续接
   * （只给 FGUI 发布物 `<Pkg>_atlas*` 这种自带分隔符的前缀用）。
   */
  readonly boundary?: "separator" | "any";
  readonly reason: string;
}

export interface PathVerdict {
  readonly allowed: boolean;
  readonly reason: string;
}

const ID = /^[a-z][A-Za-z0-9]{0,63}$/u;
/** 保留 id：与注册表/工具/宿主 placement 的落点同名会让 `apps/plugins/<id>/` 与配置文件混淆（PLUGIN-REGISTRY §2.2；codegen 同口径保留 host）。 */
export const RESERVED_IDS: readonly string[] = ["host", "registry"];
/** prefix 规则（缺省边界）允许的续接字符：`<id>-x.test.ts` / `<id>.x.test.ts`。 */
const PREFIX_SEPARATORS: readonly string[] = ["-", "."];
const CONSTANT = /^[A-Z][A-Za-z0-9]{0,63}$/u;
const FGUI_PACKAGE = /^[A-Za-z0-9_]{1,64}$/u;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;

const CLIENT_SRC = "apps/client/src";
const COCOS_SRC = "apps/Cocos/assets/src";
const RESOURCES = "apps/Cocos/assets/resources";
/**
 * 插件根（PLUGIN.md §5.5 阶段 1）：`apps/plugins/<id>/` 装插件自己的登记面——plugin.json、plugin.json、README.md、
 * gameplay/{manifest,state}.json；⛔ 不再散落到 plugins/、docs/、apps/shared/schema/gameplays/。
 */
export const PLUGINS_ROOT = "apps/plugins";
export function pluginDir(id: string): string {
  return `${PLUGINS_ROOT}/${id}`;
}
/** kit 根（docs/KIT.md §2）：`apps/kits/<id>/` 装 kit.json、README.md、gameplays/<modeId>/、sql/。 */
export const KITS_ROOT = "apps/kits";
export function kitDir(id: string): string {
  return `${KITS_ROOT}/${id}`;
}
export function packageDir(cls: PackageClass, id: string): string {
  return cls === "kit" ? kitDir(id) : pluginDir(id);
}
/** 包根清单文件名（zip 根与树上包目录内同名）。 */
export function packageManifestName(cls: PackageClass): string {
  return cls === "kit" ? "kit.json" : "plugin.json";
}
export function packageManifestPath(cls: PackageClass, id: string): string {
  return `${packageDir(cls, id)}/${packageManifestName(cls)}`;
}

/**
 * 域名前缀规则（docs/KIT.md §2，对插件同样生效）：包声明的每个 Lobby RPC 域必须等于包 id，或以包 id 开头且紧跟
 * 大写字母 / 数字（`slg` → `slg`、`slgAdmin`；⛔ `slgx`）。否则插件可以先占别的 kit 的前缀，或把框架域写进 domains
 * 让采集把框架文件吸进锁。
 */
export function domainBelongsTo(id: string, domain: string): boolean {
  if (domain === id) return true;
  return domain.startsWith(id) && /^[A-Z0-9]$/u.test(domain.charAt(id.length));
}

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
  if (identity.class !== "plugin" && identity.class !== "kit") throw new Error(`[plugin] 未知包类别: ${String(identity.class)}`);
  assertSegment(identity.id, ID, "id");
  if (RESERVED_IDS.includes(identity.id)) throw new Error(`[plugin] id "${identity.id}" 是保留字（${RESERVED_IDS.join(", ")}）`);
  if (identity.kinds.length === 0) throw new Error("[plugin] kinds 不能为空");
  for (const kind of identity.kinds) {
    if (kind !== "gameplay" && kind !== "client" && kind !== "server") throw new Error(`[plugin] 未知 kind: ${String(kind)}`);
  }
  if (new Set(identity.kinds).size !== identity.kinds.length) throw new Error("[plugin] kinds 重复");
  if (identity.class === "plugin") {
    if (identity.kinds.includes("server")) throw new Error("[plugin] 只有 kit 才有 server 形态（插件不能带 SQL / kits 命名空间）");
    if (identity.modes.length > 0) throw new Error("[plugin] 插件不声明 modes（单个玩法由 gameplay/manifest.json 的 constantName 派生）");
    if (identity.kinds.includes("gameplay")) {
      if (!identity.constantName) throw new Error("[plugin] kinds 含 gameplay 时必须声明 constantName");
      assertSegment(identity.constantName, CONSTANT, "constantName");
    } else if (identity.constantName !== null) {
      throw new Error("[plugin] 只有 kinds 含 gameplay 的插件才声明 constantName");
    }
  } else {
    if (identity.constantName !== null) throw new Error("[plugin] kit 的玩法常量名在 modes[].constantName，⛔ 不用 constantName");
    if (identity.kinds.includes("gameplay") !== identity.modes.length > 0) throw new Error("[plugin] kit 的 kinds 含 gameplay 当且仅当 modes 非空");
    for (const mode of identity.modes) {
      assertSegment(mode.id, ID, "mode id");
      assertSegment(mode.constantName, CONSTANT, "mode constantName");
      if (mode.id.toLowerCase() === identity.id.toLowerCase()) throw new Error(`[plugin] kit 的 mode id "${mode.id}" 不得与包 id 大小写归一相等（docs/KIT.md §2）`);
    }
    if (new Set(identity.modes.map((mode) => mode.id.toLowerCase())).size !== identity.modes.length) throw new Error("[plugin] modes 的 id 大小写归一后重复");
    if (new Set(identity.modes.map((mode) => mode.constantName)).size !== identity.modes.length) throw new Error("[plugin] modes 的 constantName 重复");
  }

  for (const domain of identity.domains) {
    assertSegment(domain, ID, "domain");
    if (!domainBelongsTo(identity.id, domain)) {
      throw new Error(`[plugin] 域 "${domain}" 不以包 id "${identity.id}" 开头（域名前缀规则：等于 id 或 id + 大写字母/数字续接，docs/KIT.md §2）`);
    }
  }
  if (new Set(identity.domains).size !== identity.domains.length) throw new Error("[plugin] domains 重复");
  for (const pkg of identity.fguiPackages) assertSegment(pkg, FGUI_PACKAGE, "fguiPackage");
  if (new Set(identity.fguiPackages).size !== identity.fguiPackages.length) throw new Error("[plugin] fguiPackages 重复");
  if (identity.clientDirs.length > 0 && !identity.kinds.includes("client")) {
    throw new Error("[plugin] 没有客户端登记的插件不该有 viewDirs / owners.logicDir");
  }
  for (const dir of identity.clientDirs) {
    if (!isPackageClientDir(identity, dir)) {
      const ns = identity.class === "kit" ? "kits" : "plugins";
      const names = [identity.id, ...identity.modes.map((mode) => mode.id)].join("|");
      throw new Error(
        `[plugin] ${packageManifestName(identity.class)} 声明的客户端目录 "${dir}" 不在${identity.class === "kit" ? " kit" : "插件"} "${identity.id}" 的命名空间内`
        + `（允许：${CLIENT_SRC}/${ns}/${identity.id}[/…]、${CLIENT_SRC}/view/**/${names}、${CLIENT_SRC}/logic/**/${names}）`,
      );
    }
  }
}

/** plugin.json 的 viewDirs / logicDir 是否落在插件自己的客户端命名空间内。 */
export function isPluginClientDir(id: string, dir: string): boolean {
  return isPackageClientDir({ class: "plugin", id, modes: [] }, dir);
}

/**
 * 登记面的 viewDirs / logicDir 是否落在包自己的客户端命名空间内：插件 = `plugins/<id>`、`(view|logic)/…/<id>`；
 * kit = `kits/<id>`、`(view|logic)/…/<id>` 与每个 mode 的 `(view|logic)/…/<modeId>`。
 */
export function isPackageClientDir(identity: Pick<PluginIdentity, "class" | "id" | "modes">, dir: string): boolean {
  const normalized = dir.replace(/\/+$/u, "");
  const ns = identity.class === "kit" ? "kits" : "plugins";
  if (normalized === `${CLIENT_SRC}/${ns}/${identity.id}` || normalized.startsWith(`${CLIENT_SRC}/${ns}/${identity.id}/`)) return true;
  const names = [identity.id, ...identity.modes.map((mode) => mode.id)];
  return names.some((name) => new RegExp(`^${CLIENT_SRC.replace(/\//gu, "\\/")}\\/(view|logic)\\/(?:[A-Za-z0-9_-]+\\/)*${name}$`, "u").test(normalized));
}

/** 一个玩法（插件的单个 gameplay 或 kit 的一个 mode）在仓库既有落点上的规则集。 */
function gameplayRules(modeId: string, constant: string): OwnershipRule[] {
  return [
    { kind: "dir", path: `apps/shared/src/gameplays/${modeId}`, reason: "玩法自有 shared 模块（wire.ts / ruleset.ts …）" },
    { kind: "dir", path: `apps/server/src/rooms/modes/${modeId}`, reason: "服务端 GameMode（index.ts 导出 register<Constant>GameMode）" },
    { kind: "dir", path: `${CLIENT_SRC}/gameplay/modes/${modeId}`, reason: "客户端 GameplayModule 装配件" },
    { kind: "dir", path: `${CLIENT_SRC}/logic/rooms/${modeId}`, reason: "客户端玩法 Logic" },
    { kind: "dir", path: `${CLIENT_SRC}/view/rooms/${modeId}`, reason: "客户端玩法 View" },
    { kind: "file", path: `${CLIENT_SRC}/net/rooms/${constant}Room.ts`, reason: "客户端玩法 joiner/adapter（<Constant>Room.ts）" },
    { kind: "file", path: `apps/server/test/wire-vectors/${modeId}.ts`, reason: "玩法 wire 向量 sidecar（随 codegen:gameplays 汇入 wire-vectors/index.generated.ts）" },
    { kind: "dir", path: `${RESOURCES}/${modeId}`, reason: "玩法运行时资源（resources/<id>/）" },
  ];
}

/** 包（或它的一个 mode）自有测试的前缀规则：`<name>-*.test.ts` / `<name>.*.test.ts`。 */
function testPrefixRules(name: string, what: string): OwnershipRule[] {
  return [
    { kind: "prefix", path: "apps/server/test", prefix: name, reason: `${what}自有服务端测试（<${name}>-*.test.ts / <${name}>.*.test.ts）` },
    { kind: "prefix", path: "apps/server/test/int", prefix: name, reason: `${what}自有集成测试（<${name}>-*.test.ts / <${name}>.*.test.ts）` },
    { kind: "prefix", path: "apps/client/test", prefix: name, reason: `${what}自有客户端测试（<${name}>-*.test.ts / <${name}>.*.test.ts）` },
  ];
}

/** 包的玩法清单（插件：constantName 派生的单个玩法；kit：modes）。 */
export function modesOf(identity: Pick<PluginIdentity, "class" | "id" | "kinds" | "constantName" | "modes">): readonly PackageMode[] {
  if (identity.class === "kit") return identity.modes;
  return identity.kinds.includes("gameplay") && identity.constantName ? [{ id: identity.id, constantName: identity.constantName }] : [];
}

/** 由身份推导允许写入的规则集（稳定排序；⛔ 不读工作树）。 */
export function deriveOwnership(identity: PluginIdentity): readonly OwnershipRule[] {
  assertPluginIdentity(identity);
  const { id } = identity;
  const isKit = identity.class === "kit";
  const what = isKit ? "kit" : "插件";
  const rules: OwnershipRule[] = [
    isKit
      ? { kind: "dir", path: kitDir(id), reason: "kit 目录（kit.json / README.md / gameplays/<modeId>/ 单源 / sql/ 迁移）" }
      : { kind: "dir", path: pluginDir(id), reason: "插件目录（plugin.json / README.md / gameplay 单源）" },
    ...testPrefixRules(id, what),
  ];
  for (const mode of modesOf(identity)) {
    rules.push(...gameplayRules(mode.id, mode.constantName));
    if (isKit) rules.push(...testPrefixRules(mode.id, `kit 玩法 ${mode.id} `));
  }
  if (identity.kinds.includes("client")) {
    rules.push(
      isKit
        ? { kind: "dir", path: `${CLIENT_SRC}/kits/${id}`, reason: "kit 客户端源码（index/logic/view + api/<surface>/ 门面）" }
        : { kind: "dir", path: `${CLIENT_SRC}/plugins/${id}`, reason: "插件客户端源码（index/logic/net/view）" },
    );
  }
  if (isKit) {
    // kit 的服务端 / shared 落点是 kits/ 命名空间（docs/KIT.md §2），⛔ 不给 core/<id>/（那是插件的落点）。
    rules.push(
      { kind: "dir", path: `apps/shared/src/kits/${id}`, reason: "kit shared 类型 / 校验器 / api 门面（零依赖）" },
      { kind: "dir", path: `apps/server/src/kits/${id}`, reason: "kit 服务端服务与 api 门面（键经 kKit* 工厂）" },
      { kind: "dir", path: `apps/server/src/core/compute/tasks/kits/${id}`, reason: "kit 长计算任务（铁律 11）" },
      { kind: "dir", path: `${RESOURCES}/kits/${id}`, reason: "kit 运行时资源（resources/kits/<id>/）" },
    );
  } else {
    // 服务端领域逻辑与 Lobby RPC 域不依赖客户端登记：纯服务端插件（只有域）也成立。
    rules.push({ kind: "dir", path: `apps/server/src/core/${id}`, reason: "插件服务端领域逻辑与自有键（keys.ts 经 kPlugin* 工厂）" });
  }
  {
    for (const domain of identity.domains) {
      rules.push(
        { kind: "file", path: domainDescriptorPath(domain), reason: `Lobby RPC 域 descriptor（${domain}）` },
        { kind: "dir", path: `apps/server/src/websocket/${domain}`, reason: `Lobby RPC 端点（${domain}.<method>）` },
        { kind: "file", path: `apps/server/test/lobbyRpcVectors/${domain}.ts`, reason: `RPC 向量 sidecar（${domain}）` },
      );
      if (!isKit && domain !== id) rules.push({ kind: "dir", path: `apps/server/src/core/${domain}`, reason: `域 ${domain} 的服务端领域逻辑` });
    }
    for (const dir of identity.clientDirs) rules.push({ kind: "dir", path: dir.replace(/\/+$/u, ""), reason: `${packageManifestName(identity.class)} 声明的客户端目录` });
  }
  for (const pkg of identity.fguiPackages) {
    rules.push(
      { kind: "dir", path: `apps/art/fairygui/assets/${pkg}`, reason: `FGUI 包源（${pkg}）` },
      { kind: "file", path: `${RESOURCES}/ui/${pkg}.bin`, reason: `FGUI 发布物（${pkg}.bin）` },
      { kind: "prefix", path: `${RESOURCES}/ui`, prefix: `${pkg}_atlas`, boundary: "any", reason: `FGUI 图集（${pkg}_atlas*）` },
    );
  }
  const dedup = new Map<string, OwnershipRule>();
  for (const rule of rules) dedup.set(`${rule.kind}:${rule.path}:${rule.prefix ?? ""}`, rule);
  return [...dedup.values()].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/** prefix 规则对一个文件名（不含目录）的判定；pack 采集 / install 冲突扫描 / classifyPath 共用同一判据。 */
export function matchesPrefixRule(base: string, rule: OwnershipRule): boolean {
  if (rule.kind !== "prefix") return false;
  const prefix = rule.prefix ?? "";
  if (prefix === "" || !base.startsWith(prefix) || base === prefix) return false;
  if (rule.boundary === "any") return true;
  return PREFIX_SEPARATORS.includes(base.charAt(prefix.length));
}

function matchesRule(relative: string, rule: OwnershipRule): boolean {
  if (rule.kind === "dir") return relative === rule.path || relative.startsWith(`${rule.path}/`);
  if (rule.kind === "file") return relative === rule.path;
  return path.posix.dirname(relative) === rule.path && matchesPrefixRule(path.posix.basename(relative), rule);
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
  readonly pluginFlow?: { readonly paths?: readonly string[] };
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
    ...(rules.pluginFlow?.paths ?? []),
    ...(rules.gameplayFlow?.paths ?? []),
    ...(rules.generatedWriterOwned?.entries ?? []).map((entry) => entry.path).filter((entry) => entry !== `${COCOS_SRC}/**`),
  ];
}

/**
 * 生成物 writer 登记的路径（含 Cocos 镜像；不含插件锁目录）：postinstall 失败回滚时只看这些路径「新变脏」的部分，
 * ⛔ 不整目录 restore（用户无关的 WIP 必须原样留下）。
 */
export function readGeneratedWriterPaths(root: string): readonly string[] {
  const file = path.join(root, "scripts/protected-paths.json");
  if (!fs.existsSync(file)) return [];
  const rules = JSON.parse(fs.readFileSync(file, "utf8")) as ProtectedRules;
  return (rules.generatedWriterOwned?.entries ?? []).map((entry) => entry.path).filter((entry) => !entry.startsWith(`${INSTALLED_LOCK_DIR}/`));
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
  const { source, meta, mirror } = sourceOf(relative);
  if (mirror && !source.startsWith(`${CLIENT_SRC}/`)) return { allowed: false, reason: "镜像路径无对应客户端真源" };
  // 受保护路径按原始路径与真源路径**都**查：镜像继承真源的保护（否则 logic/gameplay/<id>/ 这类受保护
  // 目录的镜像会从 allowlist 漏出去）。
  for (const protectedPath of protectedPaths) {
    if (matchesProtected(relative, protectedPath)) return { allowed: false, reason: `受保护路径 ${protectedPath}` };
    if (mirror && matchesProtected(source, protectedPath)) return { allowed: false, reason: `受保护路径 ${protectedPath}（镜像继承真源的保护）` };
  }
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
