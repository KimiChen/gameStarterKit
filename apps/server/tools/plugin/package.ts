/**
 * 插件包的读取与校验（zip 或已解开的目录两种来源，内容形态相同）：
 *  1. 包根必须有 plugin.json 与 files.lock；files.lock 逐条校验 sha256，清单外条目一律拒绝（包自证）；
 *  2. 身份交叉校验：kinds 含 feature ⇒ `features/<id>/feature.json` 且 id 一致、viewDirs/logicDir 在插件命名空间；
 *     kinds 含 gameplay ⇒ `apps/shared/schema/gameplays/<id>/{manifest,state}.json` 且 id/constantName 一致；
 *     每个 domain ⇒ descriptor + 向量 sidecar 同批在包内；每个 FGUI 包 ⇒ ART 源 + 发布物在包内；
 *  3. 每个路径过 ownership.classifyPath（硬排除 → 受保护路径 → allowlist），任一拒绝即整包拒绝并逐条点名；
 *  4. 镜像自洽：`apps/client/src/**` 的每个文件必须带字节相同的 `apps/Cocos/assets/src/**` 镜像及其 `.meta`，
 *     插件专属目录必须带目录 `.meta`；resources 资源同样必须带 `.meta`（Creator 产出、随包分发，安装侧 ⛔ 不合成）。
 */
import fs from "node:fs";
import path from "node:path";
import {
  classifyPath,
  deriveOwnership,
  mirrorPathOf,
  normalizePackagePath,
  readProtectedPaths,
  type OwnershipRule,
  type PluginIdentity,
} from "./ownership";
import { assertManifestCompatible, identityOf, parsePluginManifest, type PluginManifest } from "./manifest";
import { PACKAGE_FILES_LOCK, PACKAGE_MANIFEST, parseFilesLock, sha256, type InstalledLock, type LockEntry } from "./lock";
import { readZip } from "./zip";

export interface PluginPackage {
  readonly manifest: PluginManifest;
  readonly manifestBytes: Buffer;
  /** 仓库相对路径 → 内容（不含 plugin.json / files.lock）。 */
  readonly files: ReadonlyMap<string, Buffer>;
  readonly entries: readonly LockEntry[];
}

export interface ValidatedPackage extends PluginPackage {
  readonly identity: PluginIdentity;
  readonly rules: readonly OwnershipRule[];
  readonly viewNames: readonly string[];
}

const CLIENT_SRC = "apps/client/src";
const RESOURCES = "apps/Cocos/assets/resources";

function fail(message: string): never {
  throw new Error(`[plugin] ${message}`);
}

function walkDirectory(base: string): ReadonlyMap<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`包目录含符号链接：${path.relative(base, full)}`);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) fail(`包目录含非常规文件：${path.relative(base, full)}`);
      out.set(path.relative(base, full).split(path.sep).join("/"), fs.readFileSync(full));
    }
  };
  walk(base);
  return out;
}

/** 从 zip 文件或目录读取包，并按 files.lock 自证完整性。 */
export function readPackage(source: string): PluginPackage {
  if (!fs.existsSync(source)) fail(`包不存在：${source}`);
  const raw = fs.statSync(source).isDirectory()
    ? walkDirectory(source)
    : new Map(readZip(fs.readFileSync(source)).map((entry) => [entry.path, entry.data] as const));
  const manifestBytes = raw.get(PACKAGE_MANIFEST);
  if (!manifestBytes) fail(`包根缺少 ${PACKAGE_MANIFEST}`);
  const lockBytes = raw.get(PACKAGE_FILES_LOCK);
  if (!lockBytes) fail(`包根缺少 ${PACKAGE_FILES_LOCK}`);
  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    fail(`${PACKAGE_MANIFEST} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = parsePluginManifest(parsedManifest);
  const entries = parseFilesLock(lockBytes.toString("utf8"));
  const files = new Map<string, Buffer>();
  const listed = new Set(entries.map((entry) => entry.path));
  for (const [relative, data] of raw) {
    if (relative === PACKAGE_MANIFEST || relative === PACKAGE_FILES_LOCK) continue;
    const normalized = normalizePackagePath(relative);
    if (!listed.has(normalized)) fail(`包内条目不在 ${PACKAGE_FILES_LOCK} 清单里：${normalized}`);
    files.set(normalized, data);
  }
  for (const entry of entries) {
    const data = files.get(entry.path);
    if (!data) fail(`${PACKAGE_FILES_LOCK} 登记的文件不在包内：${entry.path}`);
    if (sha256(data) !== entry.sha256) fail(`包内文件与 ${PACKAGE_FILES_LOCK} 的 sha256 不符：${entry.path}`);
  }
  return { manifest, manifestBytes, files, entries };
}

function readJson(files: ReadonlyMap<string, Buffer>, relative: string): unknown {
  const bytes = files.get(relative);
  if (!bytes) fail(`包内缺少 ${relative}`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${relative} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 从包内 feature.json 抽取客户端目录声明与 View 名（安装/卸载都要）。 */
export function featureDeclarations(files: ReadonlyMap<string, Buffer>, id: string): {
  readonly clientDirs: readonly string[];
  readonly viewNames: readonly string[];
} {
  const relative = `features/${id}/feature.json`;
  const feature = readJson(files, relative) as {
    readonly id?: unknown;
    readonly viewDirs?: unknown;
    readonly views?: unknown;
    readonly owners?: unknown;
  };
  if (feature.id !== id) fail(`${relative} 的 id（${String(feature.id)}）必须等于插件 id（${id}）`);
  const viewDirs = Array.isArray(feature.viewDirs) ? (feature.viewDirs as unknown[]) : [];
  const owners = Array.isArray(feature.owners) ? (feature.owners as { readonly logicDir?: unknown }[]) : [];
  const views = Array.isArray(feature.views) ? (feature.views as unknown[]) : [];
  const clientDirs = [
    ...viewDirs.filter((dir): dir is string => typeof dir === "string"),
    ...owners.map((owner) => owner.logicDir).filter((dir): dir is string => typeof dir === "string"),
  ];
  const viewNames = views
    .filter((view): view is string => typeof view === "string")
    .map((view) => path.posix.basename(view).replace(/View\.view\.json$/u, ""));
  return { clientDirs: [...new Set(clientDirs)].sort(), viewNames: [...new Set(viewNames)].sort() };
}

/** 全量校验（身份交叉 + allowlist + 镜像自洽）；返回派生的身份与规则。 */
export function validatePackage(pkg: PluginPackage, root: string): ValidatedPackage {
  const { manifest, files } = pkg;
  assertManifestCompatible(manifest);
  // 仓内自述必须随包且与根 plugin.json 字节相同：否则安装后的树与锁登记的身份不一致（check 才红）。
  const authored = files.get(`plugins/${manifest.id}/${PACKAGE_MANIFEST}`);
  if (!authored) fail(`包内缺少 plugins/${manifest.id}/${PACKAGE_MANIFEST}（须与包根 plugin.json 同批分发）`);
  if (!authored.equals(pkg.manifestBytes)) fail(`包内 plugins/${manifest.id}/${PACKAGE_MANIFEST} 与包根 plugin.json 字节不同`);
  let clientDirs: readonly string[] = [];
  let viewNames: readonly string[] = [];
  if (manifest.kinds.includes("feature")) {
    const declarations = featureDeclarations(files, manifest.id);
    clientDirs = declarations.clientDirs;
    viewNames = declarations.viewNames;
  }
  if (manifest.kinds.includes("gameplay")) {
    const relative = `apps/shared/schema/gameplays/${manifest.id}/manifest.json`;
    const gameplay = readJson(files, relative) as { readonly id?: unknown; readonly constantName?: unknown };
    if (gameplay.id !== manifest.id) fail(`${relative} 的 id（${String(gameplay.id)}）必须等于插件 id`);
    if (gameplay.constantName !== manifest.constantName) {
      fail(`${relative} 的 constantName（${String(gameplay.constantName)}）必须等于 plugin.json 的 constantName（${String(manifest.constantName)}）`);
    }
    if (!files.has(`apps/shared/schema/gameplays/${manifest.id}/state.json`)) fail(`包内缺少 apps/shared/schema/gameplays/${manifest.id}/state.json`);
  }
  for (const domain of manifest.domains) {
    for (const required of [`apps/shared/src/protocol/lobbyRpc/domains/${domain}.ts`, `apps/server/test/lobbyRpcVectors/${domain}.ts`]) {
      if (!files.has(required)) fail(`声明了 domain "${domain}" 但包内缺少 ${required}`);
    }
  }
  for (const fguiPackage of manifest.fguiPackages) {
    const artDir = `apps/art/fairygui/assets/${fguiPackage}/`;
    if (![...files.keys()].some((relative) => relative.startsWith(artDir))) fail(`声明了 FGUI 包 "${fguiPackage}" 但包内缺少 ${artDir}**`);
    if (!files.has(`${RESOURCES}/ui/${fguiPackage}.bin`)) fail(`声明了 FGUI 包 "${fguiPackage}" 但包内缺少 ${RESOURCES}/ui/${fguiPackage}.bin`);
  }

  const identity = identityOf(manifest, clientDirs);
  const rules = deriveOwnership(identity);
  const protectedPaths = readProtectedPaths(root);
  const denied: string[] = [];
  for (const relative of files.keys()) {
    const verdict = classifyPath(relative, rules, protectedPaths);
    if (!verdict.allowed) denied.push(`${relative}（${verdict.reason}）`);
  }
  if (denied.length > 0) fail(`包内路径不在插件 "${manifest.id}" 的所有权推导集内，整包拒绝：\n  ${denied.join("\n  ")}`);

  assertMirrorsAndMetas(files, rules, protectedPaths);
  return { ...pkg, identity, rules, viewNames };
}

function assertMirrorsAndMetas(
  files: ReadonlyMap<string, Buffer>,
  rules: readonly OwnershipRule[],
  protectedPaths: readonly string[],
): void {
  const problems: string[] = [];
  const requireMeta = (target: string): void => {
    if (!files.has(`${target}.meta`)) problems.push(`缺少 ${target}.meta（Creator 产出的 .meta 必须随包分发，安装侧不合成）`);
  };
  const requireOwnedAncestorMetas = (relative: string): void => {
    let dir = path.posix.dirname(relative);
    while (dir !== "." && dir !== "") {
      if (!classifyPath(`${dir}.meta`, rules, protectedPaths).allowed) break;
      requireMeta(dir);
      dir = path.posix.dirname(dir);
    }
  };
  const COCOS_SRC = "apps/Cocos/assets/src";
  for (const [relative, data] of files) {
    if (relative.endsWith(".meta")) continue;
    if (relative.startsWith(`${COCOS_SRC}/`)) {
      // 反向：镜像文件必须有同批、字节相同的客户端真源（镜像才是 Creator 实际编译的代码，⛔ 不能只带镜像）。
      const source = `${CLIENT_SRC}${relative.slice(COCOS_SRC.length)}`;
      const sourceBytes = files.get(source);
      if (!sourceBytes) problems.push(`镜像 ${relative} 没有同批的客户端真源 ${source}（⛔ 不得只带镜像）`);
      else if (!sourceBytes.equals(data)) problems.push(`镜像与真源字节不同：${relative}`);
      continue;
    }
    if (relative.startsWith(`${CLIENT_SRC}/`)) {
      const mirror = mirrorPathOf(relative);
      if (!mirror) continue;
      const mirrored = files.get(mirror);
      if (!mirrored) problems.push(`缺少镜像 ${mirror}（sync:client 产物必须随包，否则 verify:sync 红）`);
      else if (!mirrored.equals(data)) problems.push(`镜像与真源字节不同：${mirror}`);
      requireMeta(mirror);
      requireOwnedAncestorMetas(mirror);
      continue;
    }
    if (relative.startsWith(`${RESOURCES}/`)) {
      requireMeta(relative);
      requireOwnedAncestorMetas(relative);
    }
  }
  if (problems.length > 0) fail(`包的镜像/.meta 不自洽：\n  ${[...new Set(problems)].join("\n  ")}`);
}

/**
 * 已安装锁的所有权复核（install 升级路径与 uninstall 的删除前置）：锁是仓内明文，可能被误改/合并错/规则演进，
 * 而 install 的「旧有新无」删除与 uninstall 的逐条删除都以它为依据——删除面必须与写入面过同一道 allowlist，
 * 任一条不在推导集内即拒绝（先用 plugin -- check 核对并修正锁），⛔ 不按可疑的锁删任何文件。
 */
export function assertInstalledLockOwned(root: string, lock: InstalledLock, action: string): void {
  const { manifest } = lock;
  let clientDirs: readonly string[] = [];
  if (manifest.kinds.includes("feature")) {
    const featureFile = path.join(root, `features/${manifest.id}/feature.json`);
    if (fs.existsSync(featureFile)) {
      clientDirs = featureDeclarations(new Map([[`features/${manifest.id}/feature.json`, fs.readFileSync(featureFile)]]), manifest.id).clientDirs;
    }
  }
  const rules = deriveOwnership(identityOf(manifest, clientDirs));
  const protectedPaths = readProtectedPaths(root);
  const denied: string[] = [];
  for (const entry of lock.entries) {
    // 工作树里已不存在的路径构不成「按锁误删」的风险：规则演进（如测试前缀收紧）后作者改名了旧文件，
    // 旧锁条目自然漂出推导集——reinstall-from-tree 正是吸收这种变化的路径，⛔ 不能被它自己挡住。
    if (!fs.existsSync(path.join(root, entry.path))) continue;
    const verdict = classifyPath(entry.path, rules, protectedPaths);
    if (!verdict.allowed) denied.push(`${entry.path}（${verdict.reason}）`);
  }
  if (denied.length > 0) {
    fail(`${action}拒绝：已安装锁 scripts/plugins/${manifest.id}.lock 登记了不在插件所有权推导集内的路径（锁被改过或规则演进），`
      + `⛔ 不按此锁删除任何文件——先用 plugin -- check 核对并修正锁：\n  ${denied.join("\n  ")}`);
  }
}
