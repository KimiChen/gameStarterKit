/**
 * 插件包的读取与校验（zip 或已解开的目录两种来源，内容形态相同）：
 *  1. 包根必须有 plugin.json 与 files.lock；files.lock 逐条校验 sha256，清单外条目一律拒绝（包自证）；
 *  2. 身份交叉校验：kinds 含 plugin ⇒ `apps/plugins/<id>/plugin.json` 且 id 一致、viewDirs/logicDir 在插件命名空间；
 *     kinds 含 gameplay ⇒ `apps/plugins/<id>/gameplay/{manifest,state}.json` 且 id/constantName 一致；
 *     每个 domain ⇒ descriptor + 向量 sidecar 同批在包内；每个 FGUI 包 ⇒ ART 源 + 发布物在包内；
 *  3. 每个路径过 ownership.classifyPath（硬排除 → 受保护路径 → allowlist），任一拒绝即整包拒绝并逐条点名；
 *  4. 镜像自洽：`apps/client/src/**` 的每个文件必须带字节相同的 `apps/Cocos/assets/src/**` 镜像及其 `.meta`，
 *     插件专属目录必须带目录 `.meta`；resources 资源同样必须带 `.meta`（Creator 产出、随包分发，安装侧 ⛔ 不合成）；
 *  5. `.meta` 内容闸（tools/plugin/meta.ts）：JSON / uuid 形状 / importer 与目标类型相符 / 包内 uuid 互不重复。
 */
import fs from "node:fs";
import path from "node:path";
import {
  classifyPath,
  deriveOwnership,
  mirrorPathOf,
  normalizePackagePath,
  pluginDir,
  readProtectedPaths,
  type OwnershipRule,
  type PluginIdentity,
} from "./ownership";
import { identityFromSummary, identityOf, parseGameplaySource, parsePluginManifest, type GameplaySourceSummary, type PluginManifest } from "./manifest";
import { PACKAGE_FILES_LOCK, PACKAGE_MANIFEST, parseFilesLock, sha256, type InstalledLock, type LockEntry } from "./lock";
import { expectedImporter, parseMeta } from "./meta";
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
  readonly gameplay: GameplaySourceSummary | null;
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
  // 文件与其子路径并存（`a` 与 `a/b`）：落盘时 mkdir 会撞上文件——在读包阶段就拒绝，⛔ 不让它走到写盘。
  for (const relative of files.keys()) {
    let dir = path.posix.dirname(relative);
    while (dir !== "." && dir !== "") {
      if (files.has(dir)) fail(`包内路径 ${relative} 的祖先 ${dir} 同时是一个文件条目（文件与其子路径并存）`);
      dir = path.posix.dirname(dir);
    }
  }
  return { manifest, manifestBytes, files, entries };
}

/** 插件目录内的登记文件与玩法单源目录（PLUGIN.md §5.5）。 */
export function pluginManifestPath(id: string): string {
  return `${pluginDir(id)}/plugin.json`;
}
export function gameplaySourceDir(id: string): string {
  return `${pluginDir(id)}/gameplay`;
}

/** 从 plugin.json 的登记面抽取客户端目录声明与 View 名（安装/卸载/删除面都要）。 */
export function pluginDeclarations(manifest: PluginManifest): {
  readonly clientDirs: readonly string[];
  readonly viewNames: readonly string[];
} {
  const { registration } = manifest;
  const clientDirs = [...registration.viewDirs, ...registration.owners.map((owner) => owner.logicDir)].map((dir) => dir.replace(/\/+$/u, ""));
  const viewNames = registration.views.map((view) => path.posix.basename(view).replace(/View\.view\.json$/u, ""));
  return { clientDirs: [...new Set(clientDirs)].sort(), viewNames: [...new Set(viewNames)].sort() };
}

/** 树上 apps/plugins/<id>/plugin.json（宿主自有或已安装）；缺失即 null。 */
export function readTreePluginManifest(root: string, id: string): PluginManifest | null {
  const file = path.join(root, pluginManifestPath(id));
  if (!fs.existsSync(file)) return null;
  return parsePluginManifest(JSON.parse(fs.readFileSync(file, "utf8")), pluginManifestPath(id));
}

/** 全量校验（身份交叉 + allowlist + 镜像自洽）；返回派生的身份与规则。 */
export function validatePackage(pkg: PluginPackage, root: string): ValidatedPackage {
  const { manifest, files } = pkg;
  if (manifest.version === null) fail(`${pluginManifestPath(manifest.id)} 没有 version：宿主自有插件不可打包 / 安装`);
  // 仓内自述必须随包且与根 plugin.json 字节相同：否则安装后的树与锁登记的身份不一致（check 才红）。
  const authoredPath = pluginManifestPath(manifest.id);
  const authored = files.get(authoredPath);
  if (!authored) fail(`包内缺少 ${authoredPath}（须与包根 plugin.json 同批分发）`);
  if (!authored.equals(pkg.manifestBytes)) fail(`包内 ${authoredPath} 与包根 plugin.json 字节不同`);
  const viewNames = pluginDeclarations(manifest).viewNames;
  // 玩法单源：包内 gameplay/manifest.json 存在即 gameplay 形态；constantName 与 schemaVersion 都从它派生。
  const gameplayManifestPath = `${gameplaySourceDir(manifest.id)}/manifest.json`;
  const gameplayBytes = files.get(gameplayManifestPath);
  const gameplay: GameplaySourceSummary | null = gameplayBytes ? parseGameplaySource(gameplayBytes, manifest.id, gameplayManifestPath) : null;
  if (gameplay && !files.has(`${gameplaySourceDir(manifest.id)}/state.json`)) fail(`包内缺少 ${gameplaySourceDir(manifest.id)}/state.json`);
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

  const identity = identityOf(manifest, gameplay);
  const rules = deriveOwnership(identity);
  const protectedPaths = readProtectedPaths(root);
  const denied: string[] = [];
  for (const relative of files.keys()) {
    const verdict = classifyPath(relative, rules, protectedPaths);
    if (!verdict.allowed) denied.push(`${relative}（${verdict.reason}）`);
  }
  if (denied.length > 0) fail(`包内路径不在插件 "${manifest.id}" 的所有权推导集内，整包拒绝：\n  ${denied.join("\n  ")}`);

  assertMirrorsAndMetas(files, rules, protectedPaths);
  return { ...pkg, identity, rules, viewNames, gameplay };
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
  // .meta 内容闸：形状、importer、包内 uuid 唯一（与宿主树的比对在 install 侧，那里才有宿主）。
  const byUuid = new Map<string, string[]>();
  for (const [relative, data] of files) {
    if (!relative.endsWith(".meta")) continue;
    const target = relative.slice(0, -".meta".length);
    let summary;
    try {
      summary = parseMeta(data, relative);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    const isDirectory = !files.has(target) && [...files.keys()].some((other) => other.startsWith(`${target}/`));
    if (!isDirectory && !files.has(target)) {
      // 孤儿 .meta：目标既不是包内文件也不是包内隐含目录——Creator 打开工程会删掉它，锁随即红。
      problems.push(`孤儿 .meta：${relative} 的目标 ${target} 既不在包内也没有包内子路径`);
      continue;
    }
    const expected = expectedImporter(target, isDirectory);
    if (expected !== null && summary.importer !== expected) {
      problems.push(`${relative} 的 importer 是 ${JSON.stringify(summary.importer)}，${isDirectory ? "目录" : `"${path.posix.extname(target)}" 文件`}的 .meta 应为 "${expected}"（Creator 打开工程会重写它，锁即红）`);
    }
    if (!byUuid.has(summary.uuid)) byUuid.set(summary.uuid, []);
    (byUuid.get(summary.uuid) as string[]).push(relative);
  }
  for (const [uuid, paths] of byUuid) {
    if (paths.length > 1) problems.push(`.meta uuid 撞车（包内）：${uuid} 同时出现在 ${paths.join("、")}（脚本批量生成 .meta 忘换 uuid？⛔ 别手编，让 Creator 重铸）`);
  }
  if (problems.length > 0) fail(`包的镜像/.meta 不自洽：\n  ${[...new Set(problems)].join("\n  ")}`);
}

/** 包内全部 .meta 的 uuid → 包内路径（validatePackage 已保证可解析且互不重复）。 */
export function packageMetaUuids(files: ReadonlyMap<string, Buffer>): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [relative, data] of files) {
    if (relative.endsWith(".meta")) out.set(parseMeta(data, relative).uuid, relative);
  }
  return out;
}

/**
 * 已安装锁的所有权复核（install 升级路径与 uninstall 的删除前置）：锁是仓内明文，可能被误改/合并错/规则演进，
 * 而 install 的「旧有新无」删除与 uninstall 的逐条删除都以它为依据——删除面必须与写入面过同一道 allowlist，
 * 任一条不在推导集内即拒绝（先用 plugin -- check 核对并修正锁），⛔ 不按可疑的锁删任何文件。
 */
export function assertInstalledLockOwned(root: string, lock: InstalledLock, action: string): void {
  const { manifest } = lock;
  const tree = readTreePluginManifest(root, manifest.id);
  const clientDirs = tree ? pluginDeclarations(tree).clientDirs : [];
  const rules = deriveOwnership(identityFromSummary(manifest, clientDirs));
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
