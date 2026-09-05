/**
 * 作者侧打包：从工作树按所有权推导集采集文件，写出 zip（或目录）。
 *
 * 采集范围 = deriveOwnership 展开到工作树的全部文件 + 客户端真源的 Cocos 镜像与 `.meta`
 * + resources 资源的 `.meta`。`.meta` 缺失即失败（作者先开一次 Creator 让它落盘；安装侧 ⛔ 不合成）。
 * 硬排除形态（`*.generated.ts` 等）即使出现在插件目录内也 ⛔ 不采集（它们由 writer 刷新，不随包）。
 * 打包后立刻用 validatePackage 自检一遍——pack 产出的包必须能被 install 原样接受。
 */
import fs from "node:fs";
import path from "node:path";
import { classifyPath, deriveOwnership, hardExclusionReason, matchesPrefixRule, mirrorPathOf, readProtectedPaths, type OwnershipRule } from "./ownership";
import { identityOf, parsePluginManifest, type PluginManifest } from "./manifest";
import { PACKAGE_FILES_LOCK, PACKAGE_MANIFEST, foreignLockOwners, renderFilesLock, sha256, type LockEntry } from "./lock";
import { featureDeclarations, validatePackage, type PluginPackage } from "./package";
import { writeZip } from "./zip";

export interface PackOptions {
  readonly root: string;
  readonly id: string;
  /** 输出 zip 路径；与 outDir 二选一。 */
  readonly outFile?: string;
  /** 输出为目录（测试与人工检视用）。 */
  readonly outDir?: string;
}

export interface PackResult {
  readonly manifest: PluginManifest;
  readonly entries: readonly LockEntry[];
  readonly skipped: readonly string[];
  readonly output: string;
}

const CLIENT_SRC = "apps/client/src";
const RESOURCES = "apps/Cocos/assets/resources";

function fail(message: string): never {
  throw new Error(`[plugin] ${message}`);
}

function listFiles(root: string, relativeDir: string): string[] {
  const base = path.join(root, relativeDir);
  if (!fs.existsSync(base)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`工作树含符号链接，拒绝采集：${path.relative(root, full)}`);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(base);
  return out;
}

/** 读取作者侧 plugins/<id>/plugin.json。 */
export function readAuthoredManifest(root: string, id: string): { readonly manifest: PluginManifest; readonly bytes: Buffer } {
  const file = path.join(root, "plugins", id, PACKAGE_MANIFEST);
  if (!fs.existsSync(file)) fail(`找不到 plugins/${id}/${PACKAGE_MANIFEST}（作者侧插件自述）`);
  const bytes = fs.readFileSync(file);
  const manifest = parsePluginManifest(JSON.parse(bytes.toString("utf8")), `plugins/${id}/${PACKAGE_MANIFEST}`);
  if (manifest.id !== id) fail(`plugins/${id}/${PACKAGE_MANIFEST} 的 id（${manifest.id}）与目录名不一致`);
  return { manifest, bytes };
}

/** 从工作树采集插件文件（不写盘）。 */
export function collectPluginFiles(root: string, manifest: PluginManifest): {
  readonly files: ReadonlyMap<string, Buffer>;
  readonly skipped: readonly string[];
  readonly rules: readonly OwnershipRule[];
} {
  let clientDirs: readonly string[] = [];
  if (manifest.kinds.includes("feature")) {
    const featureFile = `features/${manifest.id}/feature.json`;
    const full = path.join(root, featureFile);
    if (!fs.existsSync(full)) fail(`工作树缺少 ${featureFile}`);
    clientDirs = featureDeclarations(new Map([[featureFile, fs.readFileSync(full)]]), manifest.id).clientDirs;
  }
  const rules = deriveOwnership(identityOf(manifest, clientDirs));
  const protectedPaths = readProtectedPaths(root);
  const candidates = new Set<string>();
  for (const rule of rules) {
    if (rule.kind === "dir") for (const file of listFiles(root, rule.path)) candidates.add(file);
    else if (rule.kind === "file") {
      if (fs.existsSync(path.join(root, rule.path))) candidates.add(rule.path);
    } else {
      const dir = path.join(root, rule.path);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isFile() && matchesPrefixRule(name, rule)) candidates.add(`${rule.path}/${name}`);
      }
    }
  }
  // 别的已安装插件锁登记的文件永远不是本插件的：推导集若与之重叠（两个插件的规则相交），是硬错误，
  // ⛔ 不静默采集进本包（否则本包的锁会「拥有」别人的文件，卸载时连带删掉；PLUGIN-REGISTRY §1-4）。
  const foreign = foreignLockOwners(root, manifest.id);
  const overlap = [...candidates].filter((relative) => foreign.has(relative)).sort();
  if (overlap.length > 0) {
    fail(`插件 "${manifest.id}" 的所有权推导集与其它已安装插件的锁重叠，拒绝采集：\n  ${overlap.map((relative) => `${relative}（属于插件 ${foreign.get(relative) as string}）`).join("\n  ")}`);
  }
  const files = new Map<string, Buffer>();
  const skipped: string[] = [];
  const addWithMeta = (relative: string, requireMeta: boolean): void => {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) fail(`采集失败，文件不存在：${relative}`);
    files.set(relative, fs.readFileSync(full));
    if (!requireMeta) return;
    const meta = path.join(root, `${relative}.meta`);
    if (!fs.existsSync(meta)) fail(`缺少 ${relative}.meta——先打开一次 Cocos Creator 让 .meta 落盘再打包（安装侧不合成 .meta）`);
    files.set(`${relative}.meta`, fs.readFileSync(meta));
  };
  const addOwnedAncestorMetas = (relative: string): void => {
    let dir = path.posix.dirname(relative);
    while (dir !== "." && dir !== "") {
      if (!classifyPath(`${dir}.meta`, rules, protectedPaths).allowed) break;
      const meta = path.join(root, `${dir}.meta`);
      if (!fs.existsSync(meta)) fail(`缺少目录 .meta：${dir}.meta——先打开一次 Cocos Creator 让 .meta 落盘再打包`);
      files.set(`${dir}.meta`, fs.readFileSync(meta));
      dir = path.posix.dirname(dir);
    }
  };
  for (const relative of [...candidates].sort()) {
    if (hardExclusionReason(relative, rules) !== null || !classifyPath(relative, rules, protectedPaths).allowed) {
      skipped.push(relative);
      continue;
    }
    if (relative.endsWith(".meta")) continue; // 由真源带出
    if (relative.startsWith(`${RESOURCES}/`)) {
      addWithMeta(relative, true);
      addOwnedAncestorMetas(relative);
      continue;
    }
    addWithMeta(relative, false);
    if (relative.startsWith(`${CLIENT_SRC}/`)) {
      const mirror = mirrorPathOf(relative);
      if (!mirror) continue;
      if (!fs.existsSync(path.join(root, mirror))) fail(`缺少 Cocos 镜像 ${mirror}——先运行 npm run sync:client 再打包`);
      addWithMeta(mirror, true);
      addOwnedAncestorMetas(mirror);
    }
  }
  return { files, skipped, rules };
}

/** 打包：采集 → files.lock → 自检 → 写出 zip/目录。 */
export function packPlugin(options: PackOptions): PackResult {
  const { root, id } = options;
  if ((options.outFile === undefined) === (options.outDir === undefined)) fail("pack 需要 --out <zip> 或 --out-dir <dir> 二选一");
  const { manifest, bytes: manifestBytes } = readAuthoredManifest(root, id);
  const collected = collectPluginFiles(root, manifest);
  const { skipped } = collected;
  const files = new Map<string, Buffer>(collected.files);
  files.set(`plugins/${id}/${PACKAGE_MANIFEST}`, manifestBytes);
  const entries: LockEntry[] = [...files.entries()]
    .map(([relative, data]) => ({ path: relative, sha256: sha256(data) }))
    .sort((left, right) => (left.path < right.path ? -1 : 1));
  const pkg: PluginPackage = { manifest, manifestBytes, files, entries };
  validatePackage(pkg, root);

  const lockText = renderFilesLock(entries);
  if (options.outDir !== undefined) {
    const dir = path.resolve(options.outDir);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) fail(`输出目录非空：${dir}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [relative, data] of files) {
      const target = path.join(dir, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    }
    fs.writeFileSync(path.join(dir, PACKAGE_MANIFEST), manifestBytes);
    fs.writeFileSync(path.join(dir, PACKAGE_FILES_LOCK), lockText, "utf8");
    return { manifest, entries, skipped, output: dir };
  }
  const zip = writeZip([
    ...[...files.entries()].map(([relative, data]) => ({ path: relative, data })),
    { path: PACKAGE_MANIFEST, data: manifestBytes },
    { path: PACKAGE_FILES_LOCK, data: Buffer.from(lockText, "utf8") },
  ]);
  const outFile = path.resolve(options.outFile as string);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, zip);
  return { manifest, entries, skipped, output: outFile };
}
