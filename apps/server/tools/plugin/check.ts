/**
 * 已安装插件的只读核对（`plugin -- check` 与 apps/server/test/plugin-lock.test.ts 共用）：
 *  - 每把 scripts/plugins/<id>.lock 的清单文件都在且哈希一致（本地改动 / 缺失点名）；
 *  - plugins/<id>/plugin.json 在场且与锁抬头一致；
 *  - 锁内每条路径仍在该插件的所有权推导集内（规则演进不得让已安装文件变成无主）。
 * 无插件 = 空报告（通过）。
 */
import fs from "node:fs";
import path from "node:path";
import { classifyPath, deriveOwnership, readProtectedPaths } from "./ownership";
import { identityOf, parsePluginManifest } from "./manifest";
import { listInstalledLocks, verifyLockAgainstTree } from "./lock";
import { featureDeclarations } from "./package";

export interface PluginCheckEntry {
  readonly id: string;
  readonly version: string;
  readonly problems: readonly string[];
}

export interface PluginCheckReport {
  readonly plugins: readonly PluginCheckEntry[];
  readonly ok: boolean;
}

export function checkInstalledPlugins(root: string): PluginCheckReport {
  const plugins: PluginCheckEntry[] = [];
  for (const lock of listInstalledLocks(root)) {
    const problems: string[] = [];
    const { id } = lock.manifest;
    const verification = verifyLockAgainstTree(root, lock.entries);
    for (const relative of verification.modified) problems.push(`本地改动（与锁不符）：${relative}`);
    for (const relative of verification.missing) problems.push(`缺失：${relative}`);

    const manifestFile = path.join(root, "plugins", id, "plugin.json");
    let clientDirs: readonly string[] = [];
    if (!fs.existsSync(manifestFile)) {
      problems.push(`缺少 plugins/${id}/plugin.json`);
    } else {
      try {
        const authored = parsePluginManifest(JSON.parse(fs.readFileSync(manifestFile, "utf8")), `plugins/${id}/plugin.json`);
        if (authored.version !== lock.manifest.version) problems.push(`plugins/${id}/plugin.json 的 version（${authored.version}）与锁（${lock.manifest.version}）不一致`);
        if (authored.kinds.join(",") !== lock.manifest.kinds.join(",")) problems.push(`plugins/${id}/plugin.json 的 kinds 与锁不一致`);
      } catch (error) {
        problems.push(`plugins/${id}/plugin.json 无法解析：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (lock.manifest.kinds.includes("feature")) {
      const featureFile = path.join(root, `features/${id}/feature.json`);
      if (fs.existsSync(featureFile)) {
        try {
          clientDirs = featureDeclarations(new Map([[`features/${id}/feature.json`, fs.readFileSync(featureFile)]]), id).clientDirs;
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
    plugins.push({ id, version: lock.manifest.version, problems });
  }
  return { plugins, ok: plugins.every((plugin) => plugin.problems.length === 0) };
}
