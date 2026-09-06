/**
 * plugin.json v2 = 一个插件一个文件：**身份**（id / version / domains / fguiPackages / description）+ **客户端登记**
 *（entry / viewDirs / views / owners / routes / menu / dependencies / resident / category / docs / capabilities）。
 * schema 单源在同目录 `plugin-schema-v2.json`，解释器复用 plugin-codegen/pluginManifestSchema.ts（同一份 schema、同一个
 * 解释器，登记面由 codegen 消费、身份面由本工具消费）。
 *
 *  - ⛔ 没有 `kinds`：有客户端登记（entry / views / routes / menu 任一）⇒ client，包或树上有 `gameplay/manifest.json`
 *    ⇒ gameplay；⛔ 没有 `constantName`：从 gameplay manifest 派生；⛔ 没有 `requires.*SchemaVersion`：plugin.json
 *    自己的 `schemaVersion` 是 const，gameplay manifest 的 schemaVersion 与 gameplay-schema 比对（PLUGIN.md §5.3）；
 *  - 没有 `version` = 宿主自有插件（builtin / snake …）：可被 codegen 登记，⛔ 不可打包、不进锁；
 *  - ⛔ 不放路径映射（仓库布局不能成为第二真源），⛔ 不放 slot/order（位置归宿主 apps/plugins/host.json，§6）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kitDir, packageManifestPath, type PackageClass, type PackageMode, type PluginIdentity, type PluginKind } from "./ownership";
import {
  KIT_SCHEMA_FILE,
  PLUGIN_SCHEMA_FILE,
  parseKitRegistration,
  parsePluginRegistration,
  type KitApiSurface,
  type KitEffect,
  type KitRegistration,
  type KitSqlTable,
  type PluginRegistration,
  type PluginRequires,
} from "../plugin-codegen/pluginManifestSchema";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export { KIT_SCHEMA_FILE, PLUGIN_SCHEMA_FILE };
export const GAMEPLAY_SCHEMA_FILE = path.resolve(TOOL_DIR, "../gameplay-codegen/gameplay-schema-v1.json");

function readSchemaVersionConst(file: string): number {
  if (!fs.existsSync(file)) throw new Error(`[plugin] 兼容轴真源缺失：${file}`);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { readonly properties?: { readonly schemaVersion?: { readonly const?: unknown } } };
  const value = parsed.properties?.schemaVersion?.const;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`[plugin] ${file} 的 properties.schemaVersion.const 不是正整数`);
  return value;
}

/** 三个 schemaVersion 真源（读自 schema 文件，⛔ 不手抄）：plugin.json / kit.json 自身与 gameplay manifest.json。 */
export const CURRENT_PLUGIN_SCHEMA_VERSION: number = readSchemaVersionConst(PLUGIN_SCHEMA_FILE);
export const CURRENT_KIT_SCHEMA_VERSION: number = readSchemaVersionConst(KIT_SCHEMA_FILE);
export const CURRENT_GAMEPLAY_SCHEMA_VERSION: number = readSchemaVersionConst(GAMEPLAY_SCHEMA_FILE);

/** 打包工具视角的 plugin.json：身份字段 + 完整登记面（登记面原样来自 codegen 的解析器）。 */
export interface PluginManifest {
  readonly class: "plugin";
  readonly schemaVersion: 2;
  readonly id: string;
  /** null = 宿主自有插件（不可打包、不进锁）。 */
  readonly version: string | null;
  readonly domains: readonly string[];
  readonly fguiPackages: readonly string[];
  readonly description: string;
  /** 对 kit / 框架门面的依赖（docs/KIT.md §4）；来自登记面，缺省空。 */
  readonly requires: PluginRequires;
  readonly registration: PluginRegistration;
}

/** 打包工具视角的 kit.json（docs/KIT.md §3）：身份 + api 面 + 玩法清单 + SQL 声明 + 冷档键 + effects + 登记面。 */
export interface KitManifest {
  readonly class: "kit";
  readonly schemaVersion: 1;
  readonly id: string;
  /** null = 宿主自有 kit（不可打包、不进锁）。 */
  readonly version: string | null;
  readonly domains: readonly string[];
  readonly fguiPackages: readonly string[];
  readonly description: string;
  readonly api: Readonly<Record<string, KitApiSurface>>;
  readonly modes: readonly PackageMode[];
  readonly sql: { readonly files: readonly string[]; readonly tables: readonly KitSqlTable[] };
  readonly userKeys: readonly string[];
  readonly effects: Readonly<Record<string, KitEffect>>;
  readonly registration: KitRegistration;
}

export type PackageManifest = PluginManifest | KitManifest;

/** gameplay 单源（包内或树上的 gameplay/manifest.json）里与身份相关的两个字段。 */
export interface GameplaySourceSummary {
  readonly constantName: string;
  readonly schemaVersion: number;
}

function fail(pathLabel: string, message: string): never {
  throw new Error(`[plugin] ${pathLabel}: ${message}`);
}

/** 校验并归一化 plugin.json v2（schema 校验 + 登记面解析都在 codegen 的解释器里，这里只补身份字段）。 */
export function parsePluginManifest(input: unknown, pathLabel = "plugin.json"): PluginManifest {
  const registration = parsePluginRegistration(input, pathLabel);
  const value = input as Record<string, unknown>;
  return {
    class: "plugin",
    schemaVersion: 2,
    id: registration.id,
    version: typeof value.version === "string" ? value.version : null,
    domains: Array.isArray(value.domains) ? [...(value.domains as string[])] : [],
    fguiPackages: Array.isArray(value.fguiPackages) ? [...(value.fguiPackages as string[])] : [],
    description: typeof value.description === "string" ? value.description : "",
    requires: registration.requires,
    registration,
  };
}

/** 校验并归一化 kit.json v1（schema 校验 + 登记面 + kit 跨字段规则都在 codegen 的解释器里，这里只补身份字段）。 */
export function parseKitManifest(input: unknown, pathLabel = "kit.json"): KitManifest {
  const registration = parseKitRegistration(input, pathLabel);
  const value = input as Record<string, unknown>;
  return {
    class: "kit",
    schemaVersion: 1,
    id: registration.id,
    version: typeof value.version === "string" ? value.version : null,
    domains: Array.isArray(value.domains) ? [...(value.domains as string[])] : [],
    fguiPackages: Array.isArray(value.fguiPackages) ? [...(value.fguiPackages as string[])] : [],
    description: typeof value.description === "string" ? value.description : "",
    api: registration.api,
    modes: registration.modes,
    sql: registration.sql,
    userKeys: registration.userKeys,
    effects: registration.effects,
    registration,
  };
}

/** 按包根清单文件名分派解析（zip 根 / 树上包目录都只允许恰好一种）。 */
export function parsePackageManifest(cls: PackageClass, input: unknown, pathLabel?: string): PackageManifest {
  return cls === "kit" ? parseKitManifest(input, pathLabel ?? "kit.json") : parsePluginManifest(input, pathLabel ?? "plugin.json");
}

/** 有没有客户端登记：entry / views / routes / menu 任一非空即算（纯 gameplay 插件四者皆空）。 */
export function hasClientRegistration(manifest: PackageManifest): boolean {
  const { registration } = manifest;
  return registration.entry !== null || registration.views.length > 0 || registration.routes.length > 0 || registration.menu.length > 0;
}

/** 从 gameplay/manifest.json 的字节读出身份相关字段（id 必须等于插件 id / kit 的 modeId；schemaVersion 与 gameplay-schema 比对）。 */
export function parseGameplaySource(bytes: Buffer, id: string, pathLabel: string): GameplaySourceSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(pathLabel, `不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
  const record = parsed as { readonly id?: unknown; readonly constantName?: unknown; readonly schemaVersion?: unknown };
  if (record.id !== id) fail(pathLabel, `id（${String(record.id)}）必须等于玩法 id（${id}）`);
  if (typeof record.constantName !== "string") fail(pathLabel, "缺少 constantName");
  if (record.schemaVersion !== CURRENT_GAMEPLAY_SCHEMA_VERSION) {
    fail(pathLabel, `schemaVersion=${String(record.schemaVersion)} 与本仓 gameplay-schema-v${CURRENT_GAMEPLAY_SCHEMA_VERSION} 不兼容`);
  }
  return { constantName: record.constantName, schemaVersion: record.schemaVersion };
}

/** 派生的 kinds：client（有客户端登记）/ gameplay（有玩法单源）；两者皆无的插件没有任何写入范围，直接拒绝。 */
export function derivedKinds(manifest: PluginManifest, gameplay: GameplaySourceSummary | null): readonly PluginKind[] {
  const kinds: PluginKind[] = [];
  if (hasClientRegistration(manifest)) kinds.push("client");
  if (gameplay) kinds.push("gameplay");
  if (kinds.length === 0) fail(`apps/plugins/${manifest.id}/plugin.json`, "既没有客户端登记（entry / views / routes / menu）也没有 gameplay/manifest.json——插件必须至少占一样");
  return kinds;
}

function clientDirsOf(manifest: PackageManifest): readonly string[] {
  const { registration } = manifest;
  return [...new Set([
    ...registration.viewDirs.map((dir) => dir.replace(/\/+$/u, "")),
    ...registration.owners.map((owner) => owner.logicDir.replace(/\/+$/u, "")),
  ])].sort();
}

/** plugin.json + gameplay 单源 → 所有权身份（clientDirs 来自登记面的 viewDirs / owners.logicDir）。 */
export function identityOf(manifest: PluginManifest, gameplay: GameplaySourceSummary | null): PluginIdentity {
  return {
    class: "plugin",
    id: manifest.id,
    kinds: derivedKinds(manifest, gameplay),
    constantName: gameplay?.constantName ?? null,
    modes: [],
    domains: manifest.domains,
    fguiPackages: manifest.fguiPackages,
    clientDirs: clientDirsOf(manifest),
  };
}

/**
 * kit 的派生形态（docs/KIT.md §3）：client（有登记）/ gameplay（modes 非空）/ server（有 sql 或 kits/<id>/ 服务端目录）；
 * 三者皆无即拒绝（一个什么都不定义的 kit 没有写入范围）。
 */
export function derivedKitKinds(manifest: KitManifest, hasServerDir: boolean): readonly PluginKind[] {
  const kinds: PluginKind[] = [];
  if (hasClientRegistration(manifest)) kinds.push("client");
  if (manifest.modes.length > 0) kinds.push("gameplay");
  if (manifest.sql.files.length > 0 || hasServerDir) kinds.push("server");
  if (kinds.length === 0) fail(`apps/kits/${manifest.id}/kit.json`, "既没有客户端登记、也没有 modes、也没有 sql / apps/server/src/kits/<id>/——kit 必须至少定义一样");
  return kinds;
}

/** kit.json → 所有权身份（modes 逐个推玩法规则；hasServerDir = 包内或树上存在 apps/server/src/kits/<id>/）。 */
export function kitIdentityOf(manifest: KitManifest, hasServerDir: boolean): PluginIdentity {
  return {
    class: "kit",
    id: manifest.id,
    kinds: derivedKitKinds(manifest, hasServerDir),
    constantName: null,
    modes: manifest.modes,
    domains: manifest.domains,
    fguiPackages: manifest.fguiPackages,
    clientDirs: clientDirsOf(manifest),
  };
}

/** 从已安装锁抬头（已含派生 kinds / constantName / modes）还原身份：登记面已不在锁里，clientDirs 由调用方从树上补。 */
export function identityFromSummary(summary: {
  readonly class: PackageClass;
  readonly id: string;
  readonly kinds: readonly PluginKind[];
  readonly constantName: string | null;
  readonly modes: readonly PackageMode[];
  readonly domains: readonly string[];
  readonly fguiPackages: readonly string[];
}, clientDirs: readonly string[]): PluginIdentity {
  return { class: summary.class, id: summary.id, kinds: summary.kinds, constantName: summary.constantName, modes: summary.modes, domains: summary.domains, fguiPackages: summary.fguiPackages, clientDirs };
}

/** 树上 apps/plugins/<id>/gameplay/manifest.json（可缺省 = 无玩法）。 */
export function readTreeGameplaySource(root: string, id: string): GameplaySourceSummary | null {
  const relative = `apps/plugins/${id}/gameplay/manifest.json`;
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return null;
  return parseGameplaySource(fs.readFileSync(file), id, relative);
}

/**
 * kit 的玩法单源目录 ⟷ kit.json.modes 的一致性：每个 mode 都有 `gameplays/<modeId>/{manifest,state}.json`，
 * manifest.id === modeId 且 constantName 与声明一致；多出来的 gameplays/ 子目录也拒绝（单源只能有一份清单）。
 * `read(relative)` 返回文件字节或 null；`subdirs` 是 gameplays/ 下实际存在的子目录名。
 */
export function assertKitModesConsistent(
  manifest: KitManifest,
  read: (relative: string) => Buffer | null,
  subdirs: readonly string[],
): void {
  const base = `${kitDir(manifest.id)}/gameplays`;
  const declared = new Set(manifest.modes.map((mode) => mode.id));
  for (const dir of subdirs) {
    if (!declared.has(dir)) fail(`${base}/${dir}`, `不在 kit.json 的 modes 里（玩法清单单源是 kit.json）`);
  }
  for (const mode of manifest.modes) {
    const manifestPath = `${base}/${mode.id}/manifest.json`;
    const bytes = read(manifestPath);
    if (!bytes) fail(manifestPath, `kit.json 声明了 mode "${mode.id}" 但缺少玩法单源`);
    const source = parseGameplaySource(bytes, mode.id, manifestPath);
    if (source.constantName !== mode.constantName) fail(manifestPath, `constantName（${source.constantName}）与 kit.json modes 声明（${mode.constantName}）不一致`);
    if (!read(`${base}/${mode.id}/state.json`)) fail(`${base}/${mode.id}/state.json`, "缺少玩法状态单源");
  }
}

/** 树上 apps/kits/<id>/gameplays/ 的子目录名（目录不存在 = 空）。 */
export function readTreeKitGameplayDirs(root: string, id: string): readonly string[] {
  const dir = path.join(root, kitDir(id), "gameplays");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/** 树上有没有 kit 的服务端目录（派生 server 形态的第二个依据）。 */
export function treeHasKitServerDir(root: string, id: string): boolean {
  return fs.existsSync(path.join(root, `apps/server/src/kits/${id}`));
}

/** 树上包清单：apps/plugins/<id>/plugin.json 或 apps/kits/<id>/kit.json（两者并存即拒绝——同一 id 只能是一种）。 */
export function readTreePackageManifest(root: string, id: string): PackageManifest | null {
  const pluginFile = path.join(root, packageManifestPath("plugin", id));
  const kitFile = path.join(root, packageManifestPath("kit", id));
  const hasPlugin = fs.existsSync(pluginFile);
  const hasKit = fs.existsSync(kitFile);
  if (hasPlugin && hasKit) fail(id, `${packageManifestPath("plugin", id)} 与 ${packageManifestPath("kit", id)} 并存：同一 id 不能既是插件又是 kit`);
  if (hasKit) return parseKitManifest(JSON.parse(fs.readFileSync(kitFile, "utf8")), packageManifestPath("kit", id));
  if (hasPlugin) return parsePluginManifest(JSON.parse(fs.readFileSync(pluginFile, "utf8")), packageManifestPath("plugin", id));
  return null;
}

/** 树上包的所有权身份（作者侧 pack / 从树重装 / check 共用）。 */
export function treeIdentityOf(root: string, manifest: PackageManifest): PluginIdentity {
  if (manifest.class === "kit") return kitIdentityOf(manifest, treeHasKitServerDir(root, manifest.id));
  return identityOf(manifest, readTreeGameplaySource(root, manifest.id));
}

/** 身份分量（版本以外的一切）：reinstall-from-tree 的身份变化闸与 check 的漂移比对共用（PLUGIN-REGISTRY §1-3）。 */
export interface IdentitySummaryInput {
  readonly class: PackageClass;
  readonly kinds: readonly PluginKind[];
  readonly constantName: string | null;
  readonly modes: readonly PackageMode[];
  readonly domains: readonly string[];
  readonly fguiPackages: readonly string[];
}

export function identitySummary(manifest: IdentitySummaryInput): Record<string, string> {
  return {
    class: manifest.class,
    kinds: [...manifest.kinds].sort().join(","),
    constantName: manifest.constantName ?? "-",
    modes: manifest.modes.map((mode) => `${mode.id}:${mode.constantName}`).sort().join(",") || "-",
    domains: manifest.domains.join(",") || "-",
    fguiPackages: manifest.fguiPackages.join(",") || "-",
  };
}

export function identityDifferences(previous: IdentitySummaryInput, next: IdentitySummaryInput): readonly string[] {
  const before = identitySummary(previous);
  const after = identitySummary(next);
  return Object.keys(before).filter((key) => before[key] !== after[key]).map((key) => `${key}: ${before[key]} → ${after[key]}`);
}

/** semver 三段比较：负 = left 旧，0 = 相等，正 = left 新。 */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] => value.split(".").map((part) => Number(part));
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
