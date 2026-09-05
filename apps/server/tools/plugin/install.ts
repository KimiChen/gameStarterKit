/**
 * 安装 / 升级 = 「zip 清单 ⟷ 已安装锁 ⟷ 工作树」三方比对，然后原子落盘：
 *  - 首装：目标路径已存在且不属本插件 ⇒ 拒绝（所有权冲突，⛔ 不覆盖别人的文件）；
 *  - 升级：工作树与旧锁不符（本地改动）⇒ 拒绝；同版本不同内容 ⇒ 拒绝；降级须显式 --allow-downgrade；
 *    旧锁有、新包无 ⇒ 按清单删除（陈旧文件不残留）；
 *  - 写盘前工作树受影响路径必须干净（git status），失败前不碰工作树；
 *  - 落盘后写 scripts/plugins/<id>.lock、git add，再跑 codegen:gameplays / codegen:features / sync:shared；
 *    协议指纹与 FGUI manifest 的重钉是人的决策（⛔ 脚本不隐式 --write），只打印下一步；
 *  - postinstall（codegen / sync）失败 ⇒ **精确回滚**：本次写入/删除的插件文件与锁按落盘前字节复原、git 索引同步、
 *    生成物路径里「本次新变脏」的部分 restore/删除——树回到安装前，⛔ 不留「文件已写、锁已写、生成物过期」的半安装态
 *    （PLUGIN-REGISTRY §1-1）；升级删掉的域 / View / feature / gameplay 以显式 --allow-delete 交给 codegen（§1-2）。
 *  - `install --reinstall-from-tree <id>`（plan-v5 E6 方案 ②）：同仓「作者=宿主」迭代——以工作树为真相
 *    重写已安装锁，等价于「pack 当前树 → install 该包」但不要求树≡旧锁；版本规则原样保留。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareVersions, identityDifferences } from "./manifest";
import { INSTALLED_LOCK_DIR, filesLockSha256Of, foreignLockOwners, readInstalledLock, verifyLockAgainstTree, writeInstalledLock, type LockEntry, type LockSource, type LockSourceRegistry } from "./lock";
import { packPlugin } from "./pack";
import { assertInstalledLockOwned, readPackage, validatePackage, type ValidatedPackage } from "./package";
import { matchesPrefixRule, mirrorPathOf, readGeneratedWriterPaths, type OwnershipRule } from "./ownership";
import { featureDeclarations } from "./package";
import type { PluginManifest } from "./manifest";

/** 外部命令执行器（npm / git）；测试 fixture 用它替换掉真实的 codegen/sync 以模拟 postinstall 失败与参数断言。 */
export type CommandRunner = (root: string, command: string, args: readonly string[], env?: NodeJS.ProcessEnv) => void;

/** 升级删除面：交给两个 codegen 的显式 --allow-delete 集合（uninstall 同口径）。 */
export interface AllowDelete {
  readonly gameplays: readonly string[];
  readonly features: readonly string[];
}

export interface InstallOptions {
  readonly root: string;
  readonly source: string;
  readonly allowDowngrade?: boolean;
  /** 缺省 true：工作树干净检查 + 落盘后 git add。测试 fixture（非 git 仓）传 false。 */
  readonly git?: boolean;
  /** 缺省 true：落盘后跑 codegen 与 sync:shared。 */
  readonly postinstall?: boolean;
  readonly dryRun?: boolean;
  /** 测试接缝：替换 postinstall 里的 npm/git 调用（缺省 runCommand）。 */
  readonly runner?: CommandRunner;
  /** 已安装锁 source.kind === "tree"（本地分叉）时，内容不同的包默认拒绝；显式放行后按三方比对覆盖分叉。 */
  readonly replaceLocalFork?: boolean;
  /** 注册表来源（`install --from-registry` 填；本地 zip 安装省略），原样写进锁的 `# source`。 */
  readonly registry?: LockSourceRegistry;
}

export interface InstallReport {
  readonly id: string;
  readonly version: string;
  readonly previousVersion: string | null;
  readonly written: readonly string[];
  readonly unchanged: readonly string[];
  readonly deleted: readonly string[];
  readonly nextSteps: readonly string[];
  /** 升级时交给 codegen 的显式删除面（首装为空）。 */
  readonly allowDelete: AllowDelete;
  /** 本次写进锁的来源抬头（dry-run 也算出来）。 */
  readonly source: LockSource;
  /** 仅 --reinstall-from-tree：被锁吸收的树上改动（新增 / 内容变化），文件本身不被写。 */
  readonly adopted?: { readonly added: readonly string[]; readonly changed: readonly string[] };
}

export interface ReinstallFromTreeOptions {
  readonly root: string;
  readonly id: string;
  readonly allowDowngrade?: boolean;
  readonly git?: boolean;
  readonly postinstall?: boolean;
  readonly dryRun?: boolean;
  /** 树上 plugin.json 的身份（kinds / constantName / domains / fguiPackages）与旧锁不同时必须显式放行。 */
  readonly allowIdentityChange?: boolean;
  /** 把「git 已跟踪但不在旧锁」的推导集内文件吸收进锁（缺省视为框架文件而拒绝）。 */
  readonly adoptTracked?: boolean;
  readonly runner?: CommandRunner;
}

function fail(message: string): never {
  throw new Error(`[plugin] ${message}`);
}

function sameEntries(left: readonly LockEntry[], right: readonly LockEntry[]): boolean {
  return left.length === right.length
    && left.every((entry, index) => entry.path === right[index].path && entry.sha256 === right[index].sha256);
}

const NO_DELETE: AllowDelete = { gameplays: [], features: [] };

/**
 * codegen（按新旧 kinds 的并集跑：升级去掉某个 kind 时对应 codegen 仍要跑一次来收缩）→ sync:shared → git add。
 * 删除面以显式 --allow-delete 交给 codegen；成批删除时 SYNC_FORCE=1 放行 sync 熔断（与 uninstall 同口径）。
 */
function runPostinstall(root: string, kinds: readonly string[], useGit: boolean, allowDelete: AllowDelete, run: CommandRunner): void {
  const withAllowDelete = (script: string, ids: readonly string[]): readonly string[] => {
    const extra = ids.flatMap((id) => ["--allow-delete", id]);
    return ["--workspace", "@game/server", "run", script, ...(extra.length > 0 ? ["--", ...extra] : [])];
  };
  if (kinds.includes("gameplay")) run(root, "npm", withAllowDelete("codegen:gameplays", allowDelete.gameplays));
  if (kinds.includes("feature")) run(root, "npm", withAllowDelete("codegen:features", allowDelete.features));
  const deleting = allowDelete.gameplays.length + allowDelete.features.length > 0;
  run(root, "npm", ["run", "sync:shared"], deleting ? { SYNC_FORCE: "1" } : {});
  if (useGit) {
    run(root, "git", ["add", "-A", "--", "apps/shared/src", "apps/server/src", "apps/client/src", "docs/features.generated.md", "apps/server/test/lobbyRpcVectors", "apps/server/test/wire-vectors"]);
    // Cocos 镜像只暂存已跟踪文件的改动：sync:shared 新建的镜像没有 .meta，暂存它会让 verify:sync 红
    //（.meta 断言只遍历已跟踪文件）；新镜像文件等 Creator 生成 .meta 后再由人 git add（nextSteps）。
    run(root, "git", ["add", "-u", "--", "apps/Cocos/assets/src"]);
  }
}

/** 升级删除面：旧身份/旧 feature.json 有、新包没有的 gameplay / feature / 域 / View（与 uninstall 的 allowDelete 同口径）。 */
export function allowDeleteFor(
  previous: { readonly manifest: PluginManifest; readonly viewNames: readonly string[] },
  next: { readonly manifest: PluginManifest; readonly viewNames: readonly string[] },
): AllowDelete {
  const id = previous.manifest.id;
  const gameplays = previous.manifest.kinds.includes("gameplay") && !next.manifest.kinds.includes("gameplay") ? [id] : [];
  const features = new Set<string>();
  if (previous.manifest.kinds.includes("feature")) {
    const keepsFeature = next.manifest.kinds.includes("feature");
    if (!keepsFeature) features.add(id);
    for (const domain of previous.manifest.domains) {
      if (!keepsFeature || !next.manifest.domains.includes(domain)) features.add(domain);
    }
    for (const view of previous.viewNames) {
      if (!keepsFeature || !next.viewNames.includes(view)) features.add(view);
    }
  }
  return { gameplays, features: [...features].sort() };
}

/** 树上（升级前）的 feature.json 登记的 View 名；文件不在（旧包没有 feature kind）则为空。 */
function treeViewNames(root: string, id: string): readonly string[] {
  const featureFile = path.join(root, `features/${id}/feature.json`);
  if (!fs.existsSync(featureFile)) return [];
  return featureDeclarations(new Map([[`features/${id}/feature.json`, fs.readFileSync(featureFile)]]), id).viewNames;
}

/** 落盘日志：每个被本次安装触碰的路径的落盘前字节（null = 原本不存在），回滚就是按它逐条复原。 */
interface JournalEntry {
  readonly path: string;
  readonly before: Buffer | null;
}

function snapshot(root: string, relative: string): JournalEntry {
  const file = path.join(root, relative);
  return { path: relative, before: fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null };
}

function restoreJournal(root: string, journal: readonly JournalEntry[]): void {
  for (const entry of journal) {
    if (entry.before === null) removeFileAndEmptyDirs(root, entry.path);
    else atomicWrite(path.join(root, entry.path), entry.before);
  }
}

/** `git status --porcelain` 一行 → { status, path }（重命名行取箭头右侧；带引号的路径去引号）。 */
function parsePorcelain(line: string): { readonly status: string; readonly path: string } {
  const status = line.slice(0, 2);
  let rest = line.slice(3);
  const arrow = rest.indexOf(" -> ");
  if (arrow !== -1) rest = rest.slice(arrow + 4);
  if (rest.startsWith('"') && rest.endsWith('"')) rest = JSON.parse(rest) as string;
  return { status, path: rest };
}

/** 生成物路径里「本次新变脏」的部分：未跟踪的删掉，已跟踪的 restore 回索引与工作树；之前就脏的原样留下。 */
function rollbackGenerated(root: string, dirtyBefore: ReadonlySet<string>, run: CommandRunner): readonly string[] {
  const roots = readGeneratedWriterPaths(root).map((entry) => (entry.endsWith("/**") ? entry.slice(0, -3) : entry));
  const now = gitStatusDirty(root, roots).filter((line) => !dirtyBefore.has(line));
  const restored: string[] = [];
  const tracked: string[] = [];
  for (const line of now) {
    const { status, path: relative } = parsePorcelain(line);
    restored.push(relative);
    if (status === "??") removeFileAndEmptyDirs(root, relative);
    else tracked.push(relative);
  }
  if (tracked.length > 0) run(root, "git", ["restore", "--staged", "--worktree", "--", ...tracked]);
  return restored.sort();
}

/**
 * 跑 postinstall；失败即回滚到落盘前（插件文件与锁按日志复原、受影响路径的索引重新同步、生成物只回退本次新变脏的部分），
 * 然后把原错误连同回滚清单一起抛出。⛔ 不留半安装态。
 */
function postinstallOrRollback(
  root: string,
  kinds: readonly string[],
  useGit: boolean,
  allowDelete: AllowDelete,
  run: CommandRunner,
  journal: readonly JournalEntry[],
  affected: readonly string[],
): void {
  const generatedRoots = readGeneratedWriterPaths(root).map((entry) => (entry.endsWith("/**") ? entry.slice(0, -3) : entry));
  const dirtyBefore = new Set(useGit ? gitStatusDirty(root, generatedRoots) : []);
  try {
    runPostinstall(root, kinds, useGit, allowDelete, run);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let restoredGenerated: readonly string[] = [];
    try {
      restoreJournal(root, journal);
      if (useGit) {
        gitAddExisting(root, affected);
        restoredGenerated = rollbackGenerated(root, dirtyBefore, run);
      }
    } catch (rollbackError) {
      fail(`postinstall 失败：${message}\n⚠ 回滚也失败（树处于半安装态，请按 git status 手工收拾）：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    fail(`postinstall 失败，已回滚到安装前（插件文件 ${journal.length} 项按落盘前字节复原${restoredGenerated.length > 0 ? `，生成物回退 ${restoredGenerated.length} 项：${restoredGenerated.join("、")}` : ""}）：\n${message}`);
  }
}

/** 干净检查里可忽略的形态：索引里已暂存删除且工作树也不存在（uninstall 后未提交即重装）——写入它等价于写入干净路径。 */
function blockingDirty(root: string, lines: readonly string[]): readonly string[] {
  return lines.filter((line) => {
    const { status, path: relative } = parsePorcelain(line);
    return !(status === "D " && !fs.existsSync(path.join(root, relative)));
  });
}

export function runCommand(root: string, command: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): void {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.error) fail(`${command} ${args.join(" ")} 无法启动：${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(" ")} 退出码 ${String(result.status)}`);
}

export function gitStatusDirty(root: string, paths: readonly string[]): readonly string[] {
  if (paths.length === 0) return [];
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) fail(`git status 失败（不是 git 仓库？用 --no-git 跳过）：${result.stderr ?? result.error?.message ?? ""}`);
  return result.stdout.split(/\r?\n/u).filter((line) => line.trim() !== "");
}

/** 只把「工作树存在」或「已跟踪」的路径交给 git add（既不存在又未跟踪的 pathspec 会让 git add fatal）。 */
export function gitAddExisting(root: string, paths: readonly string[]): void {
  const unique = [...new Set(paths)];
  const existing = unique.filter((relative) => fs.existsSync(path.join(root, relative)));
  const absent = unique.filter((relative) => !fs.existsSync(path.join(root, relative)));
  let tracked: string[] = [];
  if (absent.length > 0) {
    const result = spawnSync("git", ["ls-files", "-z", "--", ...absent], { cwd: root, encoding: "utf8" });
    if (result.error || result.status !== 0) fail(`git ls-files 失败：${result.stderr ?? result.error?.message ?? ""}`);
    tracked = result.stdout.split("\0").filter((line) => line !== "");
  }
  const targets = [...existing, ...tracked];
  if (targets.length === 0) return;
  runCommand(root, "git", ["add", "-A", "--", ...targets]);
}

/**
 * 目录级所有权冲突：推导集里的 dir/prefix/file 规则在工作树已有**不属本插件（不在旧锁）**的文件 ⇒ 冲突。
 * 文件级比对挡不住「插件 id/domain 与框架既有目录同名」（core/auth、resources/ui …）——那会把插件代码
 * 放进框架目录随 tsc/测试链一起编译（PLUGIN-REVIEW 实施后审阅）。镜像目录按真源规则一并检查。
 */
export function ownershipConflicts(
  root: string,
  rules: readonly OwnershipRule[],
  owned: ReadonlySet<string>,
  foreign: ReadonlyMap<string, string> = new Map(),
): readonly string[] {
  const conflicts = new Set<string>();
  const listFiles = (relativeDir: string): string[] => {
    const base = path.join(root, relativeDir);
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return [];
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else out.push(path.relative(root, full).split(path.sep).join("/"));
      }
    };
    walk(base);
    return out;
  };
  const check = (relative: string): void => {
    if (owned.has(relative)) return;
    const owner = foreign.get(relative);
    conflicts.add(owner ? `${relative}（属于插件 ${owner}）` : relative);
  };
  for (const rule of rules) {
    const targets = [rule.path];
    const mirror = mirrorPathOf(rule.path);
    if (mirror) targets.push(mirror);
    for (const target of targets) {
      if (rule.kind === "dir") {
        for (const relative of listFiles(target)) check(relative);
        if (fs.existsSync(path.join(root, `${target}.meta`))) check(`${target}.meta`);
      } else if (rule.kind === "file") {
        if (fs.existsSync(path.join(root, target))) check(target);
        if (fs.existsSync(path.join(root, `${target}.meta`))) check(`${target}.meta`);
      } else {
        const dir = path.join(root, target);
        if (!fs.existsSync(dir)) continue;
        for (const name of fs.readdirSync(dir)) {
          if (matchesPrefixRule(name, rule) && fs.statSync(path.join(dir, name)).isFile()) check(`${target}/${name}`);
        }
      }
    }
  }
  return [...conflicts].sort();
}

/** 推导集采集根下 git 已跟踪的文件集合（`git ls-files`；不是 git 仓时由调用方决定退路）。 */
export function gitTrackedFiles(root: string, paths: readonly string[]): ReadonlySet<string> {
  if (paths.length === 0) return new Set();
  const result = spawnSync("git", ["ls-files", "-z", "--", ...paths], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) fail(`git ls-files 失败（不是 git 仓库？用 --no-git 跳过）：${result.stderr ?? result.error?.message ?? ""}`);
  return new Set(result.stdout.split("\0").filter((line) => line !== ""));
}

/** 包内文件与其它已安装插件锁的交集：同一路径不可能同时属于两个插件（PLUGIN-REGISTRY §1-4）。 */
function assertNoForeignClash(id: string, files: Iterable<string>, foreign: ReadonlyMap<string, string>): void {
  const clash = [...files].filter((relative) => foreign.has(relative)).sort();
  if (clash.length > 0) {
    fail(`拒绝：插件 "${id}" 的包内文件已被其它已安装插件的锁登记（同一路径不可能属于两个插件）：\n  ${clash.map((relative) => `${relative}（属于插件 ${foreign.get(relative) as string}）`).join("\n  ")}`);
  }
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

/** 协议指纹是否已过期（只读 --check 的退出码）；postinstall 没跑时不知道，返回 null。 */
export function protocolFingerprintStale(root: string): boolean {
  const result = spawnSync(process.execPath, ["scripts/protocol-fingerprint.mjs", "--check"], { cwd: root, encoding: "utf8" });
  return result.status !== 0;
}

export interface NextStepsContext {
  /** true = --check 已报过期；false = 未变化；null = 未跑 codegen（dry-run / --no-postinstall），只能给条件提示。 */
  readonly protocolStale: boolean | null;
}

/** 安装后的人工步骤清单（按包身份、工作树现状与 postinstall 的实际结果派生；⛔ 不按「带 domain 就一定变了」猜）。 */
export function nextStepsFor(pkg: ValidatedPackage, root: string, context: NextStepsContext = { protocolStale: null }): readonly string[] {
  const steps: string[] = [];
  if (context.protocolStale === true) {
    steps.push("协议指纹已过期（protocol/ 生成物随本插件变化）：人工决定是否 bump LOBBY_PROTOCOL_VERSION，然后 node scripts/protocol-fingerprint.mjs --write");
  } else if (context.protocolStale === null && (pkg.manifest.domains.length > 0 || pkg.manifest.kinds.includes("gameplay"))) {
    steps.push("本次未跑 codegen：跑完后若 protocol/ 生成物变化（codegen 会提示），人工决定是否 bump LOBBY_PROTOCOL_VERSION，然后 node scripts/protocol-fingerprint.mjs --write");
  }
  if (pkg.manifest.fguiPackages.length > 0) {
    steps.push("新 FGUI 包已入仓：node scripts/fgui-manifest.mjs --write 重钉 FGUI 发布闭包锁");
  }
  steps.push("npm run verify:all（生成物新鲜度、镜像、协议指纹、测试全链；sync:shared 新建的 Cocos 镜像文件保持未跟踪，verify:sync 只查已跟踪文件）");
  const hasClientFeatureDir = [...pkg.files.keys()].some((relative) => relative.startsWith("apps/client/src/features/"));
  if (hasClientFeatureDir && !fs.existsSync(path.join(root, "apps/Cocos/assets/src/features.meta"))) {
    steps.push("首个 feature 插件：打开一次 Cocos Creator 生成共享祖先目录 .meta（apps/Cocos/assets/src/features.meta）并提交——它由仓库持有，⛔ 不随包");
  }
  if (pkg.manifest.kinds.includes("gameplay") || pkg.manifest.domains.length > 0) {
    steps.push("提交前打开一次 Cocos Creator 为 sync:shared 新建的镜像文件（apps/Cocos/assets/src/shared/**）生成 .meta，再 git add apps/Cocos/assets/src");
  }
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
    // 删除面（旧有新无）必须与写入面过同一道 allowlist：锁被改过即拒绝，⛔ 不按可疑的锁删文件。
    assertInstalledLockOwned(root, previous, "升级");
    const cmp = compareVersions(manifest.version, previous.manifest.version);
    if (cmp < 0 && !options.allowDowngrade) {
      fail(`拒绝降级：已安装 ${id}@${previous.manifest.version}，包为 ${manifest.version}（显式 --allow-downgrade 才放行）`);
    }
    const sameContent = sameEntries(previous.entries, pkg.entries);
    // 本地分叉（锁由 --reinstall-from-tree 写出）：来包内容不同即视为「上游会覆盖宿主改动」，默认拒绝并列出分叉面；
    // --replace-local-fork 显式放行（同版本不同内容也放行：分叉 bump 到的版本号可能恰与上游撞车）。
    if (previous.source?.kind === "tree" && !sameContent) {
      const incoming = new Map(pkg.entries.map((entry) => [entry.path, entry.sha256]));
      const overwritten = previous.entries.filter((entry) => incoming.has(entry.path) && incoming.get(entry.path) !== entry.sha256).map((entry) => entry.path);
      const removed = previous.entries.filter((entry) => !incoming.has(entry.path)).map((entry) => entry.path);
      if (!options.replaceLocalFork) {
        fail(`拒绝：已安装 ${id}@${previous.manifest.version} 是本地分叉（锁 source=tree，宿主曾以 --reinstall-from-tree 吸收改动），`
          + `来包会覆盖/删除这些分叉文件；确认要放弃本地改动再用 --replace-local-fork：\n`
          + `  覆盖 ${overwritten.length}：\n  ${overwritten.join("\n  ") || "-"}\n  删除 ${removed.length}：\n  ${removed.join("\n  ") || "-"}`);
      }
    } else if (cmp === 0 && !sameContent) {
      fail(`拒绝：包版本 ${manifest.version} 与已安装版本相同但内容不同——升级必须 bump version`);
    }
    const verification = verifyLockAgainstTree(root, previous.entries);
    if (verification.modified.length > 0) {
      fail(`拒绝升级：以下文件与已安装锁不符（本地改动会被覆盖丢失，请先提交/回退或改走框架 PR）：\n  ${verification.modified.join("\n  ")}`);
    }
    if (verification.missing.length > 0) {
      fail(`拒绝升级：已安装锁登记的文件在工作树缺失（锁与树不一致；先 plugin -- check 核对并修正锁，或 plugin -- uninstall ${id} --force 后重装）：\n  ${verification.missing.join("\n  ")}`);
    }
  }

  // 所有权冲突：推导集内（含镜像）已有不属本插件的文件——文件级同名与目录级占用（id/domain 撞框架目录）都拒绝；
  // 别的插件锁登记的路径先单独点名（两个插件的推导集相交是硬错误，不是「谁先装谁赢」）。
  const foreign = foreignLockOwners(root, id);
  assertNoForeignClash(id, pkg.files.keys(), foreign);
  const conflicts = ownershipConflicts(root, pkg.rules, new Set(previousEntries.keys()), foreign);
  if (conflicts.length > 0) fail(`拒绝：以下目标路径已存在且不属插件 "${id}"（所有权冲突，⛔ 不覆盖、不混入框架目录）：\n  ${conflicts.join("\n  ")}`);

  const stale = [...previousEntries.keys()].filter((relative) => !pkg.files.has(relative));
  const affected = [...pkg.files.keys(), ...stale, path.posix.join(INSTALLED_LOCK_DIR, `${id}.lock`)];
  if (useGit) {
    const dirty = blockingDirty(root, gitStatusDirty(root, affected));
    if (dirty.length > 0) fail(`拒绝：受影响路径的工作树不干净（先提交或清理）：\n  ${dirty.join("\n  ")}`);
  }
  // 升级删除面（旧有新无的域 / View / kind）在覆盖 feature.json 之前从树上读出。
  const allowDelete = previous
    ? allowDeleteFor({ manifest: previous.manifest, viewNames: treeViewNames(root, id) }, { manifest, viewNames: pkg.viewNames })
    : NO_DELETE;
  const postinstallKinds = [...new Set([...(previous?.manifest.kinds ?? []), ...manifest.kinds])];

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
  const lockRelative = path.posix.join(INSTALLED_LOCK_DIR, `${id}.lock`);
  const source: LockSource = { kind: "package", filesLockSha256: filesLockSha256Of(pkg.entries), ...(options.registry ? { registry: options.registry } : {}) };
  const base = {
    id,
    version: manifest.version,
    previousVersion: previous?.manifest.version ?? null,
    written: written.sort(),
    unchanged: unchanged.sort(),
    deleted: stale.sort(),
    allowDelete,
    source,
  };
  if (options.dryRun) return { ...base, nextSteps: nextStepsFor(pkg, root) };

  const journal = [...written, ...stale, lockRelative].map((relative) => snapshot(root, relative));
  for (const relative of written) atomicWrite(path.join(root, relative), pkg.files.get(relative) as Buffer);
  for (const relative of stale) removeFileAndEmptyDirs(root, relative);
  writeInstalledLock(root, { manifest, entries: pkg.entries, source });

  if (useGit) gitAddExisting(root, affected);
  if (options.postinstall === false) return { ...base, nextSteps: nextStepsFor(pkg, root) };
  postinstallOrRollback(root, postinstallKinds, useGit, allowDelete, options.runner ?? runCommand, journal, affected);
  // nextSteps 按 postinstall 的实际结果派生：指纹是否真的过期由 --check 说了算。
  return { ...base, nextSteps: nextStepsFor(pkg, root, { protocolStale: protocolFingerprintStale(root) }) };
}

/**
 * 同仓「作者=宿主」迭代（plan-v5 E6 方案 ②）：以工作树为真相重写已安装锁。
 *
 * 与 install 的差别只有两处：不要求「树 ≡ 旧锁」（本地改动正是要吸收的东西），也不要求受影响路径
 * git 干净。其余闸门一个不少：采集与自检走 pack 同一条路（缺 .meta / 越权 / 镜像不一致即拒绝）、
 * 锁被篡改即拒绝、同版本不同内容拒绝（同仓迭代也必须 bump plugin.json version）、降级须显式、
 * 目录级所有权冲突拒绝。⛔ 不写任何插件文件（它们本来就在树上），只重写 scripts/plugins/<id>.lock，
 * 然后照常 postinstall（codegen / sync）并 git add。
 */
export function reinstallFromTree(options: ReinstallFromTreeOptions): InstallReport {
  const root = path.resolve(options.root);
  const { id } = options;
  const useGit = options.git !== false;
  const previous = readInstalledLock(root, id);
  if (!previous) fail(`插件 "${id}" 未安装（没有 ${INSTALLED_LOCK_DIR}/${id}.lock）；首装请用 install <zip|dir>`);
  assertInstalledLockOwned(root, previous, "从树重装");

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), `plugin-reinstall-${id}-`));
  let pkg: ValidatedPackage;
  try {
    packPlugin({ root, id, outDir: staging });
    pkg = validatePackage(readPackage(staging), root);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  const { manifest } = pkg;
  const cmp = compareVersions(manifest.version, previous.manifest.version);
  if (cmp < 0 && !options.allowDowngrade) {
    fail(`拒绝降级：已安装 ${id}@${previous.manifest.version}，树上 plugin.json 为 ${manifest.version}（显式 --allow-downgrade 才放行）`);
  }
  // 身份变化闸：kinds / constantName / domains / fguiPackages 一变，推导集就变——树上把一个框架域写进 domains
  // 会让采集把框架文件当成「本插件新增」吸进锁（审阅实证：domains 加 guild ⇒ added 7），必须显式放行。
  const identityChanges = identityDifferences(previous.manifest, manifest);
  if (identityChanges.length > 0 && !options.allowIdentityChange) {
    fail(`拒绝：树上 plugins/${id}/plugin.json 的身份与已安装锁不同（推导集随之变化，显式 --allow-identity-change 才放行）：\n  ${identityChanges.join("\n  ")}`);
  }
  const previousByPath = new Map(previous.entries.map((entry) => [entry.path, entry.sha256]));
  const added = pkg.entries.map((entry) => entry.path).filter((relative) => !previousByPath.has(relative)).sort();
  const changed = pkg.entries
    .filter((entry) => previousByPath.has(entry.path) && previousByPath.get(entry.path) !== entry.sha256)
    .map((entry) => entry.path)
    .sort();
  const stale = [...previousByPath.keys()].filter((relative) => !pkg.files.has(relative)).sort();
  if (cmp === 0 && !sameEntries(previous.entries, pkg.entries)) {
    fail(`拒绝：树上内容与已安装 ${id}@${previous.manifest.version} 不同但版本未变——同仓迭代也必须 bump plugins/${id}/plugin.json 的 version\n`
      + `  新增 ${added.length}、变化 ${changed.length}、删除 ${stale.length}：\n  ${[...added, ...changed, ...stale].join("\n  ")}`);
  }
  // 谁算「本插件的」：旧锁条目一定是；树上新采集到的文件只有在 git **未跟踪**时才是作者刚写的新文件——已跟踪
  // 却不在旧锁的文件默认视为框架（或别的提交）所有，⛔ 不能仅因落在推导集内就吸收（--adopt-tracked 显式放行；
  // --no-git 时无从判定跟踪状态，退化为全部吸收，与 --adopt-tracked 等价）。
  const foreign = foreignLockOwners(root, id);
  assertNoForeignClash(id, pkg.files.keys(), foreign);
  const collected = [...pkg.files.keys()];
  const tracked = useGit && !options.adoptTracked ? gitTrackedFiles(root, collected) : new Set<string>();
  const owned = new Set([...previousByPath.keys(), ...collected.filter((relative) => !tracked.has(relative))]);
  const trackedNotOwned = collected.filter((relative) => !owned.has(relative)).sort();
  if (trackedNotOwned.length > 0) {
    fail(`拒绝：以下文件落在插件 "${id}" 的推导集内、已被 git 跟踪却不在已安装锁里——像是框架（或另一次提交）的文件，`
      + `⛔ 不静默吸收进插件锁。确认它们确属本插件后用 --adopt-tracked 显式吸收：\n  ${trackedNotOwned.join("\n  ")}`);
  }
  const conflicts = ownershipConflicts(root, pkg.rules, owned, foreign);
  if (conflicts.length > 0) fail(`拒绝：以下路径在插件 "${id}" 的推导集内却既不在旧锁也不在树上采集结果里（生成物/硬排除混入插件目录？）：\n  ${conflicts.join("\n  ")}`);

  const lockRelative = path.posix.join(INSTALLED_LOCK_DIR, `${id}.lock`);
  // 树就是真相：删除面只能从「旧锁身份 vs 树上身份 / feature.json」推出（树上 feature.json 已是新的，View 删除面无从得知——
  // 同仓迭代删 View 时作者自己跑 codegen:features -- --allow-delete <View>）。
  const allowDelete = allowDeleteFor({ manifest: previous.manifest, viewNames: [] }, { manifest, viewNames: pkg.viewNames });
  const postinstallKinds = [...new Set([...previous.manifest.kinds, ...manifest.kinds])];
  // 来源抬头：树 ≡ 旧锁的幂等 no-op 保留原来源（⛔ 不把 package 悄悄改成 tree）；真有改动才标 tree 并把上一来源放进 forkedFrom。
  const noop = sameEntries(previous.entries, pkg.entries) && previous.manifest.version === manifest.version;
  const source: LockSource = noop && previous.source
    ? previous.source
    : { kind: "tree", filesLockSha256: filesLockSha256Of(pkg.entries), forkedFrom: previous.source?.kind === "tree" ? previous.source.forkedFrom : (previous.source ?? null) };
  const base = {
    id,
    version: manifest.version,
    previousVersion: previous.manifest.version,
    written: [] as readonly string[],
    unchanged: pkg.entries.map((entry) => entry.path).filter((relative) => !added.includes(relative) && !changed.includes(relative)),
    deleted: stale,
    allowDelete,
    source,
    adopted: { added, changed },
  };
  if (options.dryRun) return { ...base, nextSteps: nextStepsFor(pkg, root) };

  // 旧锁登记、树上已删的文件：树就是真相，只需把可能残留的空目录清掉（文件已不存在时 removeFileAndEmptyDirs 只清目录）。
  const journal = [snapshot(root, lockRelative)];
  for (const relative of stale) removeFileAndEmptyDirs(root, relative);
  writeInstalledLock(root, { manifest, entries: pkg.entries, source });
  const affected = [...pkg.files.keys(), ...stale, lockRelative];
  if (useGit) gitAddExisting(root, affected);
  if (options.postinstall === false) return { ...base, nextSteps: nextStepsFor(pkg, root) };
  postinstallOrRollback(root, postinstallKinds, useGit, allowDelete, options.runner ?? runCommand, journal, [lockRelative]);
  return { ...base, nextSteps: nextStepsFor(pkg, root, { protocolStale: protocolFingerprintStale(root) }) };
}
