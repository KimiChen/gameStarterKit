/**
 * 安装 / 升级 = 「zip 清单 ⟷ 已安装锁 ⟷ 工作树」三方比对，然后原子落盘：
 *  - 首装：目标路径已存在且不属本插件 ⇒ 拒绝（所有权冲突，⛔ 不覆盖别人的文件）；
 *  - 升级：工作树与旧锁不符（本地改动）⇒ 拒绝；同版本不同内容 ⇒ 拒绝；降级须显式 --allow-downgrade；
 *    旧锁有、新包无 ⇒ 按清单删除（陈旧文件不残留）；
 *  - 写盘前工作树受影响路径必须干净（git status），失败前不碰工作树；
 *  - 落盘后写 scripts/plugins/<id>.lock、git add，再跑 codegen:gameplays / codegen:features / sync:shared；
 *    协议指纹与 FGUI manifest 的重钉是人的决策（⛔ 脚本不隐式 --write），只打印下一步。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { compareVersions } from "./manifest";
import { INSTALLED_LOCK_DIR, installedLockPath, readInstalledLock, verifyLockAgainstTree, writeInstalledLock, type LockEntry } from "./lock";
import { readPackage, validatePackage, type ValidatedPackage } from "./package";

export interface InstallOptions {
  readonly root: string;
  readonly source: string;
  readonly allowDowngrade?: boolean;
  /** 缺省 true：工作树干净检查 + 落盘后 git add。测试 fixture（非 git 仓）传 false。 */
  readonly git?: boolean;
  /** 缺省 true：落盘后跑 codegen 与 sync:shared。 */
  readonly postinstall?: boolean;
  readonly dryRun?: boolean;
}

export interface InstallReport {
  readonly id: string;
  readonly version: string;
  readonly previousVersion: string | null;
  readonly written: readonly string[];
  readonly unchanged: readonly string[];
  readonly deleted: readonly string[];
  readonly nextSteps: readonly string[];
}

function fail(message: string): never {
  throw new Error(`[plugin] ${message}`);
}

export function runCommand(root: string, command: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): void {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.error) fail(`${command} ${args.join(" ")} 无法启动：${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(" ")} 退出码 ${String(result.status)}`);
}

function gitStatusDirty(root: string, paths: readonly string[]): readonly string[] {
  if (paths.length === 0) return [];
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) fail(`git status 失败（不是 git 仓库？用 --no-git 跳过）：${result.stderr ?? result.error?.message ?? ""}`);
  return result.stdout.split(/\r?\n/u).filter((line) => line.trim() !== "");
}

function atomicWrite(file: string, data: Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, data);
  fs.renameSync(temporary, file);
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

/** 安装后的人工步骤清单（按包身份派生）。 */
export function nextStepsFor(pkg: ValidatedPackage): readonly string[] {
  const steps: string[] = [];
  if (pkg.manifest.domains.length > 0) {
    steps.push("registry.generated.ts 已随新域变化：人工决定是否 bump LOBBY_PROTOCOL_VERSION，然后 node scripts/protocol-fingerprint.mjs --write");
  }
  if (pkg.manifest.fguiPackages.length > 0) {
    steps.push("新 FGUI 包已入仓：node scripts/fgui-manifest.mjs --write 重钉 FGUI 发布闭包锁");
  }
  steps.push("npm run verify:all（生成物新鲜度、镜像、协议指纹、测试全链）");
  steps.push("打开一次 Cocos Creator 确认随包 .meta 的 uuid 稳定（Creator 只会重写键序/版本，uuid 不变）");
  return steps;
}

export function installPlugin(options: InstallOptions): InstallReport {
  const root = path.resolve(options.root);
  const useGit = options.git !== false;
  const pkg = validatePackage(readPackage(options.source), root);
  const { manifest } = pkg;
  const id = manifest.id;

  const previous = readInstalledLock(root, id);
  const previousEntries = new Map<string, LockEntry>((previous?.entries ?? []).map((entry) => [entry.path, entry]));
  if (previous) {
    const cmp = compareVersions(manifest.version, previous.manifest.version);
    if (cmp < 0 && !options.allowDowngrade) {
      fail(`拒绝降级：已安装 ${id}@${previous.manifest.version}，包为 ${manifest.version}（显式 --allow-downgrade 才放行）`);
    }
    const sameContent = previous.entries.length === pkg.entries.length
      && previous.entries.every((entry, index) => entry.path === pkg.entries[index].path && entry.sha256 === pkg.entries[index].sha256);
    if (cmp === 0 && !sameContent) fail(`拒绝：包版本 ${manifest.version} 与已安装版本相同但内容不同——升级必须 bump version`);
    const verification = verifyLockAgainstTree(root, previous.entries);
    if (verification.modified.length > 0) {
      fail(`拒绝升级：以下文件与已安装锁不符（本地改动会被覆盖丢失，请先提交/回退或改走框架 PR）：\n  ${verification.modified.join("\n  ")}`);
    }
  }

  // 首装冲突：目标已存在且不属本插件（旧锁未登记）。
  const conflicts: string[] = [];
  for (const relative of pkg.files.keys()) {
    if (!previousEntries.has(relative) && fs.existsSync(path.join(root, relative))) conflicts.push(relative);
  }
  if (conflicts.length > 0) fail(`拒绝：以下目标路径已存在且不属插件 "${id}"（所有权冲突，⛔ 不覆盖）：\n  ${conflicts.join("\n  ")}`);

  const stale = [...previousEntries.keys()].filter((relative) => !pkg.files.has(relative));
  const affected = [...pkg.files.keys(), ...stale, path.posix.join(INSTALLED_LOCK_DIR, `${id}.lock`)];
  if (useGit) {
    const dirty = gitStatusDirty(root, affected);
    if (dirty.length > 0) fail(`拒绝：受影响路径的工作树不干净（先提交或清理）：\n  ${dirty.join("\n  ")}`);
  }

  const written: string[] = [];
  const unchanged: string[] = [];
  for (const [relative, data] of pkg.files) {
    const target = path.join(root, relative);
    const existing = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (existing && existing.equals(data)) {
      unchanged.push(relative);
      continue;
    }
    written.push(relative);
  }
  const report: InstallReport = {
    id,
    version: manifest.version,
    previousVersion: previous?.manifest.version ?? null,
    written: written.sort(),
    unchanged: unchanged.sort(),
    deleted: stale.sort(),
    nextSteps: nextStepsFor(pkg),
  };
  if (options.dryRun) return report;

  for (const relative of written) atomicWrite(path.join(root, relative), pkg.files.get(relative) as Buffer);
  for (const relative of stale) removeFileAndEmptyDirs(root, relative);
  writeInstalledLock(root, { manifest, entries: pkg.entries });

  if (useGit) {
    runCommand(root, "git", ["add", "-A", "--", ...affected.filter((relative) => relative !== path.posix.join(INSTALLED_LOCK_DIR, `${id}.lock`)), installedLockPath(root, id)]);
  }
  if (options.postinstall !== false) {
    if (manifest.kinds.includes("gameplay")) runCommand(root, "npm", ["--workspace", "@game/server", "run", "codegen:gameplays"]);
    if (manifest.kinds.includes("feature")) runCommand(root, "npm", ["--workspace", "@game/server", "run", "codegen:features"]);
    runCommand(root, "npm", ["run", "sync:shared"]);
    if (useGit) runCommand(root, "git", ["add", "-A", "--", "apps/shared/src", "apps/server/src", "apps/client/src", "apps/Cocos/assets/src", "docs/features.generated.md", "apps/server/test/lobbyRpcVectors"]);
  }
  return report;
}
