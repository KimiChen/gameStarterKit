/**
 * 已安装插件的只读核对（`plugin -- check` 与 apps/server/test/plugin-lock.test.ts 共用）：
 *  - 每把 scripts/plugins/<id>.lock 的清单文件都在且哈希一致（本地改动 / 缺失点名）；
 *  - plugins/<id>/plugin.json 在场且与锁抬头一致；
 *  - 锁内每条路径仍在该插件的所有权推导集内（规则演进不得让已安装文件变成无主）；
 *  - plugins/<id>/plugin.json 的身份分量（kinds / constantName / domains / fguiPackages）与锁抬头一致
 *    （树上悄悄扩 domains 而锁未重写 = 推导集与登记面脱节，PLUGIN-REGISTRY §1-3）；
 *  - 各锁的清单两两不交（同一路径不可能属于两个插件，PLUGIN-REGISTRY §1-4）。
 * 无插件 = 空报告（通过）。
 */
import fs from "node:fs";
import path from "node:path";
import { classifyPath, deriveOwnership, pluginDir, readProtectedPaths } from "./ownership";
import { assertManifestCompatible, identityDifferences, identityOf, parsePluginManifest } from "./manifest";
import { filesLockSha256Of, listInstalledLocks, verifyLockAgainstTree } from "./lock";
import { featureDeclarations, featureManifestPath, gameplaySourceDir } from "./package";

export interface PluginCheckEntry {
  readonly id: string;
  readonly version: string;
  /** 锁的来源抬头：package（由包安装）/ tree（本地分叉）/ unknown（旧锁无 source 行）。 */
  readonly source: "package" | "tree" | "unknown";
  readonly problems: readonly string[];
}

export interface PluginCheckReport {
  readonly plugins: readonly PluginCheckEntry[];
  readonly ok: boolean;
}

export function checkInstalledPlugins(root: string): PluginCheckReport {
  const plugins: PluginCheckEntry[] = [];
  const locks = listInstalledLocks(root);
  // 锁间两两不交：路径 → 首个登记它的插件；之后再出现即双方都点名。id 按大小写归一也不得重复（codegen 同口径）。
  const claimed = new Map<string, string>();
  const overlaps = new Map<string, string[]>();
  const foldedIds = new Map<string, string>();
  for (const lock of locks) {
    const folded = lock.manifest.id.toLowerCase();
    const other = foldedIds.get(folded);
    if (other !== undefined && other !== lock.manifest.id) {
      for (const id of [other, lock.manifest.id]) {
        if (!overlaps.has(id)) overlaps.set(id, []);
        (overlaps.get(id) as string[]).push(`id 大小写归一后重复：${other} 与 ${lock.manifest.id}（codegen 按归一化拒绝，锁也不允许并存）`);
      }
    } else {
      foldedIds.set(folded, lock.manifest.id);
    }
    for (const entry of lock.entries) {
      const owner = claimed.get(entry.path);
      if (owner === undefined) {
        claimed.set(entry.path, lock.manifest.id);
        continue;
      }
      for (const id of [owner, lock.manifest.id]) {
        if (!overlaps.has(id)) overlaps.set(id, []);
        (overlaps.get(id) as string[]).push(`锁间重叠：${entry.path} 同时登记在 ${owner} 与 ${lock.manifest.id} 的锁里`);
      }
    }
  }
  for (const lock of locks) {
    const problems: string[] = [...(overlaps.get(lock.manifest.id) ?? [])];
    const { id } = lock.manifest;
    const verification = verifyLockAgainstTree(root, lock.entries);
    for (const relative of verification.modified) problems.push(`本地改动（与锁不符）：${relative}`);
    for (const relative of verification.missing) problems.push(`缺失：${relative}`);
    // 来源抬头：缺失即旧锁形态（升级时按分叉待遇 fail-closed）；内容身份必须能从清单复算出来（合并错/手改即红）。
    if (!lock.source) {
      problems.push(`锁未登记 source（旧锁形态；升级时按本地分叉待遇）：install --reinstall-from-tree ${id} 重写锁即补上`);
    } else if (lock.source.filesLockSha256 !== filesLockSha256Of(lock.entries)) {
      problems.push(`锁的 "# source" filesLockSha256 与清单不符（合并错或手改）：${lock.source.filesLockSha256} vs ${filesLockSha256Of(lock.entries)}`);
    }

    const manifestRelative = `${pluginDir(id)}/plugin.json`;
    const manifestFile = path.join(root, manifestRelative);
    let clientDirs: readonly string[] = [];
    if (!fs.existsSync(manifestFile)) {
      problems.push(`缺少 ${manifestRelative}`);
    } else {
      try {
        const authored = parsePluginManifest(JSON.parse(fs.readFileSync(manifestFile, "utf8")), manifestRelative);
        if (authored.version !== lock.manifest.version) problems.push(`${manifestRelative} 的 version（${authored.version}）与锁（${lock.manifest.version}）不一致`);
        for (const difference of identityDifferences(lock.manifest, authored)) {
          problems.push(`${manifestRelative} 的身份与锁不一致（先 install --reinstall-from-tree ${id} --allow-identity-change 重写锁）：${difference}`);
        }
        // 兼容轴：树上 plugin.json 与本仓两个 schemaVersion 比对；锁登记的 requires 也要与之一致（旧锁未登记即点名）。
        try {
          assertManifestCompatible(authored, manifestRelative);
        } catch (error) {
          problems.push(error instanceof Error ? error.message : String(error));
        }
        const lockRequires = lock.manifest.requires;
        if ((lock.manifest.kinds.includes("feature") && lockRequires.featureSchemaVersion === null) || (lock.manifest.kinds.includes("gameplay") && lockRequires.gameplaySchemaVersion === null)) {
          problems.push(`锁未登记 requires（旧锁形态）：install --reinstall-from-tree ${id} 重写锁即补上`);
        } else if (lockRequires.featureSchemaVersion !== authored.requires.featureSchemaVersion || lockRequires.gameplaySchemaVersion !== authored.requires.gameplaySchemaVersion) {
          problems.push(`${manifestRelative} 的 requires 与锁不一致：锁 ${JSON.stringify(lockRequires)} vs 树 ${JSON.stringify(authored.requires)}`);
        }
        // requires 不是自述：树上 feature.json / gameplay manifest.json 的 schemaVersion 必须与之一致。
        const artifactVersion = (relative: string): unknown => {
          const file = path.join(root, relative);
          if (!fs.existsSync(file)) return undefined;
          try {
            return (JSON.parse(fs.readFileSync(file, "utf8")) as { readonly schemaVersion?: unknown }).schemaVersion;
          } catch {
            return "<无法解析>";
          }
        };
        if (authored.kinds.includes("feature")) {
          const actual = artifactVersion(featureManifestPath(id));
          if (actual !== undefined && actual !== authored.requires.featureSchemaVersion) problems.push(`${featureManifestPath(id)} 的 schemaVersion（${String(actual)}）与 requires.featureSchemaVersion（${String(authored.requires.featureSchemaVersion)}）不一致`);
        }
        if (authored.kinds.includes("gameplay")) {
          const actual = artifactVersion(`${gameplaySourceDir(id)}/manifest.json`);
          if (actual !== undefined && actual !== authored.requires.gameplaySchemaVersion) problems.push(`${gameplaySourceDir(id)}/manifest.json 的 schemaVersion（${String(actual)}）与 requires.gameplaySchemaVersion（${String(authored.requires.gameplaySchemaVersion)}）不一致`);
        }
      } catch (error) {
        problems.push(`${manifestRelative} 无法解析：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (lock.manifest.kinds.includes("feature")) {
      const featureFile = path.join(root, featureManifestPath(id));
      if (fs.existsSync(featureFile)) {
        try {
          clientDirs = featureDeclarations(new Map([[featureManifestPath(id), fs.readFileSync(featureFile)]]), id).clientDirs;
        } catch (error) {
          problems.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
    try {
      const rules = deriveOwnership(identityOf(lock.manifest, clientDirs));
      const protectedPaths = readProtectedPaths(root);
      for (const entry of lock.entries) {
        const verdict = classifyPath(entry.path, rules, protectedPaths);
        if (!verdict.allowed) problems.push(`锁内路径已不在所有权推导集内：${entry.path}（${verdict.reason}）`);
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
    plugins.push({ id, version: lock.manifest.version, source: lock.source?.kind ?? "unknown", problems });
  }
  return { plugins, ok: plugins.every((plugin) => plugin.problems.length === 0) };
}
