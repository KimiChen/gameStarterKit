/**
 * 卸载 = 按已安装锁的文件清单删除（⛔ 不按目录猜）+ 删除 plugins/<id>/ 与锁 + 显式 --allow-delete
 * 驱动两个 codegen 收缩生成物 + SYNC_FORCE=1 放行 sync 熔断（成批删除是有意的）。
 * 本地改动过的文件默认拒绝删除（--force 放行），与 install 的三方比对同一口径。
 */
import fs from "node:fs";
import path from "node:path";
import { INSTALLED_LOCK_DIR, installedLockPath, readInstalledLock, verifyLockAgainstTree } from "./lock";
import { assertInstalledLockOwned, featureDeclarations } from "./package";
import { gitAddExisting, gitStatusDirty, runCommand } from "./install";

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
  /** 锁的来源：tree / unknown 意味着被删的是宿主本地内容（分叉），CLI 据此提醒——卸载是显式删除意图，不额外要求 flag。 */
  readonly source: "package" | "tree" | "unknown";
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
  // 删除面与写入面过同一道 allowlist：锁被改过即拒绝（⛔ 不按可疑的锁删文件）。
  assertInstalledLockOwned(root, lock, "卸载");
  const useGit = options.git !== false;
  if (useGit && !options.dryRun) {
    const dirty = gitStatusDirty(root, [...lock.entries.map((entry) => entry.path), `plugins/${id}`, `${INSTALLED_LOCK_DIR}/${id}.lock`]);
    if (dirty.length > 0) fail(`拒绝卸载：受影响路径的工作树不干净（先提交或清理；未提交的锁改动尤其可疑）：\n  ${dirty.join("\n  ")}`);
  }
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
    source: lock.source?.kind ?? "unknown",
    deleted: lock.entries.map((entry) => entry.path).filter((relative) => fs.existsSync(path.join(root, relative))),
    missing: verification.missing,
    allowDelete: [...new Set(allowFeatures)].sort(),
  };
  if (options.dryRun) return report;

  for (const entry of lock.entries) removeFileAndEmptyDirs(root, entry.path);
  removeFileAndEmptyDirs(root, `plugins/${id}/plugin.json`);
  fs.rmSync(installedLockPath(root, id));

  if (useGit) gitAddExisting(root, [...lock.entries.map((entry) => entry.path), `plugins/${id}/plugin.json`, `${INSTALLED_LOCK_DIR}/${id}.lock`]);
  if (options.postinstall !== false) {
    if (lock.manifest.kinds.includes("gameplay")) {
      runCommand(root, "npm", ["--workspace", "@game/server", "run", "codegen:gameplays", "--", "--allow-delete", id]);
    }
    if (lock.manifest.kinds.includes("feature")) {
      runCommand(root, "npm", ["--workspace", "@game/server", "run", "codegen:features", "--", ...report.allowDelete.flatMap((value) => ["--allow-delete", value])]);
    }
    runCommand(root, "npm", ["run", "sync:shared"], { SYNC_FORCE: "1" });
    if (useGit) {
      runCommand(root, "git", ["add", "-A", "--", "apps/shared/src", "apps/server/src", "apps/client/src", "docs/features.generated.md", "apps/server/test/lobbyRpcVectors", "apps/server/test/wire-vectors"]);
      runCommand(root, "git", ["add", "-u", "--", "apps/Cocos/assets/src"]);
    }
  }
  return report;
}
