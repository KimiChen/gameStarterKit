/**
 * 两把清单锁（形态沿用 scripts/protected-paths.lock：`#` 注释行 + 每行 `<路径> <sha256>`，按路径排序）：
 *  - 包内 `files.lock`：pack 写出、install 校验（包自证完整性：清单外条目 / 哈希不符即拒绝）；
 *  - 已安装锁 `scripts/plugins/<id>.lock`：install 写出、check/upgrade/uninstall 消费，是「已安装插件」
 *    的唯一登记面（版本比较、本地改动检测、旧有新无删除、卸载范围都只看它，PLUGIN-REVIEW F14/F21）。
 * 哈希就是文件内容的 sha256（不掺路径），可用 `shasum -a 256 <file>` 复核。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PluginManifest } from "./manifest";

export const INSTALLED_LOCK_DIR = "scripts/plugins";
export const PACKAGE_FILES_LOCK = "files.lock";
export const PACKAGE_MANIFEST = "plugin.json";

export interface LockEntry {
  readonly path: string;
  readonly sha256: string;
}

/** 注册表来源（PLUGIN-REGISTRY §4.2；`install --from-registry` 写入，本地 zip 安装没有）。 */
export interface LockSourceRegistry {
  readonly url: string;
  readonly version: string;
  readonly zipSha256: string;
  readonly publisher?: string;
}

/**
 * 已安装锁的来源抬头（`# source <json>`）：
 *  - `package`：由某个包（zip / 目录）安装，`filesLockSha256` = 该包 files.lock 规范文本的 sha256（内容身份，可离线复算）；
 *  - `tree`：经 `install --reinstall-from-tree` 以工作树为真相重写（本地分叉），`forkedFrom` 保留上一把锁的来源。
 * 旧锁没有这一行 ⇒ null（未知来源）。
 */
export type LockSource =
  | { readonly kind: "package"; readonly filesLockSha256: string; readonly registry?: LockSourceRegistry }
  | { readonly kind: "tree"; readonly filesLockSha256: string; readonly forkedFrom: LockSource | null };

export interface InstalledLock {
  readonly manifest: PluginManifest;
  readonly entries: readonly LockEntry[];
  readonly source?: LockSource | null;
}

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function installedLockPath(root: string, id: string): string {
  return path.join(root, INSTALLED_LOCK_DIR, `${id}.lock`);
}

function sortEntries(entries: readonly LockEntry[]): readonly LockEntry[] {
  return [...entries].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function assertUnique(entries: readonly LockEntry[], label: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`[plugin] ${label} 清单重复条目：${entry.path}`);
    seen.add(entry.path);
  }
}

function renderEntries(entries: readonly LockEntry[]): string {
  return sortEntries(entries).map((entry) => `${entry.path} ${entry.sha256}`).join("\n");
}

function parseEntries(lines: readonly string[], label: string): readonly LockEntry[] {
  const entries: LockEntry[] = [];
  for (const line of lines) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const match = /^(\S+) ([0-9a-f]{64})$/u.exec(line);
    if (!match) throw new Error(`[plugin] ${label} 行格式非法：${line}`);
    entries.push({ path: match[1], sha256: match[2] });
  }
  assertUnique(entries, label);
  return sortEntries(entries);
}

/** 包内 files.lock（不含 plugin.json / files.lock 自身）。 */
export function renderFilesLock(entries: readonly LockEntry[]): string {
  return [
    "# files.lock —— 插件包文件清单（<仓库相对路径> <sha256>）。Do not edit by hand.",
    "# writer: npm --workspace @game/server run plugin -- pack ；install 按本清单逐条校验，清单外条目一律拒绝。",
    renderEntries(entries),
    "",
  ].join("\n");
}

export function parseFilesLock(text: string): readonly LockEntry[] {
  return parseEntries(text.split(/\r?\n/u), PACKAGE_FILES_LOCK);
}

/** 内容身份：files.lock 规范文本的 sha256（pack 产物里的 files.lock 字节正是它；宿主从已安装锁 entries 可离线复算）。 */
export function filesLockSha256Of(entries: readonly LockEntry[]): string {
  return sha256(renderFilesLock(entries));
}

/** 已安装锁：抬头 `# manifest <json>` 承载 plugin.json 的归一化值。 */
export function renderInstalledLock(lock: InstalledLock): string {
  const { manifest } = lock;
  const summary = JSON.stringify({
    id: manifest.id,
    version: manifest.version,
    kinds: manifest.kinds,
    constantName: manifest.constantName,
    domains: manifest.domains,
    fguiPackages: manifest.fguiPackages,
  });
  return [
    `# ${INSTALLED_LOCK_DIR}/${manifest.id}.lock —— 已安装插件 ${manifest.id}@${manifest.version} 的登记与文件清单锁。Do not edit by hand.`,
    "# writer: npm --workspace @game/server run plugin -- install ；checker: apps/server/test/plugin-lock.test.ts（随 verify:all）与 plugin -- check",
    `# manifest ${summary}`,
    ...(lock.source ? [`# source ${JSON.stringify(lock.source)}`] : []),
    renderEntries(lock.entries),
    "",
  ].join("\n");
}

function parseLockSource(line: string | undefined, label: string): LockSource | null {
  if (!line) return null;
  const value = JSON.parse(line.slice("# source ".length)) as LockSource;
  if (value.kind !== "package" && value.kind !== "tree") throw new Error(`[plugin] ${label} 的 "# source" 抬头 kind 非法：${String((value as { kind: unknown }).kind)}`);
  if (typeof value.filesLockSha256 !== "string") throw new Error(`[plugin] ${label} 的 "# source" 抬头缺 filesLockSha256`);
  return value;
}

export function parseInstalledLock(text: string, label: string): InstalledLock {
  const lines = text.split(/\r?\n/u);
  const manifestLine = lines.find((line) => line.startsWith("# manifest "));
  if (!manifestLine) throw new Error(`[plugin] ${label} 缺少 "# manifest" 抬头`);
  const summary = JSON.parse(manifestLine.slice("# manifest ".length)) as {
    readonly id: string;
    readonly version: string;
    readonly kinds: readonly ("gameplay" | "feature")[];
    readonly constantName: string | null;
    readonly domains: readonly string[];
    readonly fguiPackages: readonly string[];
  };
  const manifest: PluginManifest = {
    schemaVersion: 1,
    id: summary.id,
    version: summary.version,
    kinds: summary.kinds,
    constantName: summary.constantName ?? null,
    domains: summary.domains ?? [],
    fguiPackages: summary.fguiPackages ?? [],
    requires: { featureSchemaVersion: null, gameplaySchemaVersion: null },
    description: "",
  };
  return { manifest, entries: parseEntries(lines, label), source: parseLockSource(lines.find((line) => line.startsWith("# source ")), label) };
}

export function readInstalledLock(root: string, id: string): InstalledLock | null {
  const file = installedLockPath(root, id);
  if (!fs.existsSync(file)) return null;
  const lock = parseInstalledLock(fs.readFileSync(file, "utf8"), `${INSTALLED_LOCK_DIR}/${id}.lock`);
  if (lock.manifest.id !== id) throw new Error(`[plugin] ${INSTALLED_LOCK_DIR}/${id}.lock 的 manifest.id 与文件名不一致：${lock.manifest.id}`);
  return lock;
}

export function writeInstalledLock(root: string, lock: InstalledLock): void {
  const file = installedLockPath(root, lock.manifest.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, renderInstalledLock(lock), "utf8");
  fs.renameSync(temporary, file);
}

/** 全部已安装插件（按 id 排序）；目录不存在 = 无插件。 */
export function listInstalledLocks(root: string): readonly InstalledLock[] {
  const dir = path.join(root, INSTALLED_LOCK_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".lock"))
    .sort()
    .map((name) => {
      const id = name.slice(0, -".lock".length);
      const lock = readInstalledLock(root, id);
      if (!lock) throw new Error(`[plugin] 无法读取 ${INSTALLED_LOCK_DIR}/${name}`);
      return lock;
    });
}

/** 其它已安装插件的锁登记的路径 → 所属插件 id（本插件 id 除外；pack/install/check 的「两两不交」依据）。 */
export function foreignLockOwners(root: string, id: string): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const lock of listInstalledLocks(root)) {
    if (lock.manifest.id === id) continue;
    for (const entry of lock.entries) owners.set(entry.path, lock.manifest.id);
  }
  return owners;
}

export interface LockVerification {
  readonly modified: readonly string[];
  readonly missing: readonly string[];
}

/** 工作树 vs 锁：逐文件哈希比对（本地改动 / 缺失）。 */
export function verifyLockAgainstTree(root: string, entries: readonly LockEntry[]): LockVerification {
  const modified: string[] = [];
  const missing: string[] = [];
  for (const entry of entries) {
    const file = path.join(root, entry.path);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      missing.push(entry.path);
      continue;
    }
    if (sha256(fs.readFileSync(file)) !== entry.sha256) modified.push(entry.path);
  }
  return { modified, missing };
}
