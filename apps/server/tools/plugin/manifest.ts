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
import type { PluginIdentity, PluginKind } from "./ownership";
import { PLUGIN_SCHEMA_FILE, parsePluginRegistration, type PluginRegistration } from "../plugin-codegen/pluginManifestSchema";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export { PLUGIN_SCHEMA_FILE };
export const GAMEPLAY_SCHEMA_FILE = path.resolve(TOOL_DIR, "../gameplay-codegen/gameplay-schema-v1.json");

function readSchemaVersionConst(file: string): number {
  if (!fs.existsSync(file)) throw new Error(`[plugin] 兼容轴真源缺失：${file}`);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { readonly properties?: { readonly schemaVersion?: { readonly const?: unknown } } };
  const value = parsed.properties?.schemaVersion?.const;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`[plugin] ${file} 的 properties.schemaVersion.const 不是正整数`);
  return value;
}

/** 两个 schemaVersion 真源（读自 schema 文件，⛔ 不手抄）：plugin.json 自身与 gameplay manifest.json。 */
export const CURRENT_PLUGIN_SCHEMA_VERSION: number = readSchemaVersionConst(PLUGIN_SCHEMA_FILE);
export const CURRENT_GAMEPLAY_SCHEMA_VERSION: number = readSchemaVersionConst(GAMEPLAY_SCHEMA_FILE);

/** 打包工具视角的 plugin.json：身份字段 + 完整登记面（登记面原样来自 codegen 的解析器）。 */
export interface PluginManifest {
  readonly schemaVersion: 2;
  readonly id: string;
  /** null = 宿主自有插件（不可打包、不进锁）。 */
  readonly version: string | null;
  readonly domains: readonly string[];
  readonly fguiPackages: readonly string[];
  readonly description: string;
  readonly registration: PluginRegistration;
}

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
    schemaVersion: 2,
    id: registration.id,
    version: typeof value.version === "string" ? value.version : null,
    domains: Array.isArray(value.domains) ? [...(value.domains as string[])] : [],
    fguiPackages: Array.isArray(value.fguiPackages) ? [...(value.fguiPackages as string[])] : [],
    description: typeof value.description === "string" ? value.description : "",
    registration,
  };
}

/** 有没有客户端登记：entry / views / routes / menu 任一非空即算（纯 gameplay 插件四者皆空）。 */
export function hasClientRegistration(manifest: PluginManifest): boolean {
  const { registration } = manifest;
  return registration.entry !== null || registration.views.length > 0 || registration.routes.length > 0 || registration.menu.length > 0;
}

/** 从 gameplay/manifest.json 的字节读出身份相关字段（id 必须等于插件 id；schemaVersion 与 gameplay-schema 比对）。 */
export function parseGameplaySource(bytes: Buffer, id: string, pathLabel: string): GameplaySourceSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(pathLabel, `不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
  const record = parsed as { readonly id?: unknown; readonly constantName?: unknown; readonly schemaVersion?: unknown };
  if (record.id !== id) fail(pathLabel, `id（${String(record.id)}）必须等于插件 id（${id}）`);
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

/** plugin.json + gameplay 单源 → 所有权身份（clientDirs 来自登记面的 viewDirs / owners.logicDir）。 */
export function identityOf(manifest: PluginManifest, gameplay: GameplaySourceSummary | null): PluginIdentity {
  const { registration } = manifest;
  const clientDirs = [...new Set([
    ...registration.viewDirs.map((dir) => dir.replace(/\/+$/u, "")),
    ...registration.owners.map((owner) => owner.logicDir.replace(/\/+$/u, "")),
  ])].sort();
  return {
    id: manifest.id,
    kinds: derivedKinds(manifest, gameplay),
    constantName: gameplay?.constantName ?? null,
    domains: manifest.domains,
    fguiPackages: manifest.fguiPackages,
    clientDirs,
  };
}

/** 从已安装锁抬头（已含派生 kinds / constantName）还原身份：登记面已不在锁里，clientDirs 由调用方从树上补。 */
export function identityFromSummary(summary: {
  readonly id: string;
  readonly kinds: readonly PluginKind[];
  readonly constantName: string | null;
  readonly domains: readonly string[];
  readonly fguiPackages: readonly string[];
}, clientDirs: readonly string[]): PluginIdentity {
  return { id: summary.id, kinds: summary.kinds, constantName: summary.constantName, domains: summary.domains, fguiPackages: summary.fguiPackages, clientDirs };
}

/** 树上 apps/plugins/<id>/gameplay/manifest.json（可缺省 = 无玩法）。 */
export function readTreeGameplaySource(root: string, id: string): GameplaySourceSummary | null {
  const relative = `apps/plugins/${id}/gameplay/manifest.json`;
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return null;
  return parseGameplaySource(fs.readFileSync(file), id, relative);
}

/** 身份分量（版本以外的一切）：reinstall-from-tree 的身份变化闸与 check 的漂移比对共用（PLUGIN-REGISTRY §1-3）。 */
export interface IdentitySummaryInput {
  readonly kinds: readonly PluginKind[];
  readonly constantName: string | null;
  readonly domains: readonly string[];
  readonly fguiPackages: readonly string[];
}

export function identitySummary(manifest: IdentitySummaryInput): Record<string, string> {
  return {
    kinds: [...manifest.kinds].sort().join(","),
    constantName: manifest.constantName ?? "-",
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
