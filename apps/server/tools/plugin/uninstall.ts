/**
 * 卸载 = 按已安装锁的文件清单删除（⛔ 不按目录猜）+ 删除 plugins/<id>/ 与锁 + 显式 --allow-delete
 * 驱动两个 codegen 收缩生成物 + SYNC_FORCE=1 放行 sync 熔断（成批删除是有意的）。
 * 本地改动过的文件默认拒绝删除（--force 放行），与 install 的三方比对同一口径。
 */
import fs from "node:fs";
import path from "node:path";
import { installedLockPath, readInstalledLock, verifyLockAgainstTree } from "./lock";
import { featureDeclarations } from "./package";
import { runCommand } from "./install";

export interface UninstallOptions {
  readonly root: string;
  readonly id: string;
  readonly force?: boolean;
  readonly git?: boolean;
  readonly postinstall?: boolean;
  readonly dryRun?: boolean;
}

export interface UninstallReport {
  readonly id: string;
  readonly version: string;
  readonly deleted: readonly string[];
  readonly missing: readonly string[];
  readonly allowDelete: readonly string[];
}

function fail(message: string): never {
  throw new Error(`[plugin] ${message}`);
}

function removeFileAndEmptyDirs(root: string, relative: string): void {
  const file = path.join(root, relative);
  if (fs.existsSync(file)) fs.rmSync(file);
  let dir = path.dirname(file);
  while (dir.startsWith(root) && dir !== root) {
    if (!fs.existsSync(dir) || fs.readdirSync(dir).length > 0) break;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

export function uninstallPlugin(options: UninstallOptions): UninstallReport {
  const root = path.resolve(options.root);
  const { id } = options;
  const lock = readInstalledLock(root, id);
  if (!lock) fail(`插件 "${id}" 未安装（没有 scripts/plugins/${id}.lock）`);
  const verification = verifyLockAgainstTree(root, lock.entries);
  if (verification.modified.length > 0 && !options.force) {
    fail(`拒绝卸载：以下文件与已安装锁不符（本地改动会随卸载丢失；--force 放行）：\n  ${verification.modified.join("\n  ")}`);
  }
  // --allow-delete 集合：feature id、各 domain、feature.json 登记的 View 名、gameplay id。
  const allowFeatures: string[] = [];
  if (lock.manifest.kinds.includes("feature")) {
    allowFeatures.push(id, ...lock.manifest.domains);
    const featureFile = path.join(root, `features/${id}/feature.json`);
    if (fs.existsSync(featureFile)) {
      allowFeatures.push(...featureDeclarations(new Map([[`features/${id}/feature.json`, fs.readFileSync(featureFile)]]), id).viewNames);
    }
  }
  const report: UninstallReport = {
    id,
    version: lock.manifest.version,
    deleted: lock.entries.map((entry) => entry.path).filter((relative) => fs.existsSync(path.join(root, relative))),
    missing: verification.missing,
    allowDelete: [...new Set(allowFeatures)].sort(),
  };
  if (options.dryRun) return report;

  for (const entry of lock.entries) removeFileAndEmptyDirs(root, entry.path);
  removeFileAndEmptyDirs(root, `plugins/${id}/plugin.json`);
  fs.rmSync(installedLockPath(root, id));

  const useGit = options.git !== false;
  if (useGit) runCommand(root, "git", ["add", "-A", "--", ...lock.entries.map((entry) => entry.path), `plugins/${id}`, installedLockPath(root, id)]);
  if (options.postinstall !== false) {
    if (lock.manifest.kinds.includes("gameplay")) {
      runCommand(root, "npm", ["--workspace", "@game/server", "run", "codegen:gameplays", "--", "--allow-delete", id]);
    }
    if (lock.manifest.kinds.includes("feature")) {
      runCommand(root, "npm", ["--workspace", "@game/server", "run", "codegen:features", "--", ...report.allowDelete.flatMap((value) => ["--allow-delete", value])]);
    }
    runCommand(root, "npm", ["run", "sync:shared"], { SYNC_FORCE: "1" });
    if (useGit) runCommand(root, "git", ["add", "-A", "--", "apps/shared/src", "apps/server/src", "apps/client/src", "apps/Cocos/assets/src", "docs/features.generated.md", "apps/server/test/lobbyRpcVectors"]);
  }
  return report;
}
