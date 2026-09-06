/**
 * 安装 / 升级 = 「zip 清单 ⟷ 已安装锁 ⟷ 工作树」三方比对，然后原子落盘：
 *  - 首装：目标路径已存在且不属本插件 ⇒ 拒绝（所有权冲突，⛔ 不覆盖别人的文件）；
 *  - 升级：工作树与旧锁不符（本地改动）⇒ 拒绝；同版本不同内容 ⇒ 拒绝；降级须显式 --allow-downgrade；
 *    旧锁有、新包无 ⇒ 按清单删除（陈旧文件不残留）；
 *  - 写盘前工作树受影响路径必须干净（git status），失败前不碰工作树；
 *  - 落盘后写 scripts/packages/<id>.lock、git add，再跑 codegen:gameplays / codegen:plugins / sync:shared；
 *    协议指纹与 FGUI manifest 的重钉是人的决策（⛔ 脚本不隐式 --write），只打印下一步；
 *  - postinstall（codegen / sync）失败 ⇒ **精确回滚**：本次写入/删除的插件文件与锁按落盘前字节复原、git 索引同步、
 *    生成物路径里「本次新变脏」的部分 restore/删除——树回到安装前，⛔ 不留「文件已写、锁已写、生成物过期」的半安装态
 *    （PLUGIN-REGISTRY §1-1）；升级删掉的域 / View / plugin / gameplay 以显式 --allow-delete 交给 codegen（§1-2）。
 *  - `install --reinstall-from-tree <id>`（plan-v5 E6 方案 ②）：同仓「作者=宿主」迭代——以工作树为真相
 *    重写已安装锁，等价于「pack 当前树 → install 该包」但不要求树≡旧锁；版本规则原样保留。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareVersions, identityDifferences, readTreePackageManifest, type PackageManifest } from "./manifest";
import { EMPTY_REQUIRES, type KitApiSurface } from "../plugin-codegen/pluginManifestSchema";
import { INSTALLED_LOCK_DIR, dependentsOfKit, filesLockSha256Of, foreignLockOwners, kitApiViolations, parseInstalledLock, readInstalledLock, verifyLockAgainstTree, writeInstalledLock, type LockEntry, type LockManifestSummary, type LockSource, type LockSourceRegistry } from "./lock";
import { packPlugin } from "./pack";
import { assertInstalledLockOwned, packageMetaUuids, pluginDeclarations, readPackage, validatePackage, type ValidatedPackage } from "./package";
import { hostMetaUuids, parseMeta } from "./meta";
import { kitDir, matchesPrefixRule, mirrorPathOf, modesOf, packageManifestPath, pluginDir, readGeneratedWriterPaths, type OwnershipRule, type PackageClass, type PluginKind } from "./ownership";

/** 外部命令执行器（npm / git）；测试 fixture 用它替换掉真实的 codegen/sync 以模拟 postinstall 失败与参数断言。 */
export type CommandRunner = (root: string, command: string, args: readonly string[], env?: NodeJS.ProcessEnv) => void;

/** 升级删除面：交给两个 codegen 的显式 --allow-delete 集合（uninstall 同口径）。 */
export interface AllowDelete {
  readonly gameplays: readonly string[];
  readonly plugins: readonly string[];
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
  /** kit 升级的反向闸（docs/KIT.md §4）：已安装插件对本 kit 的 api 声明落到新 [minSupported, version] 之外时默认拒绝，显式放行。 */
  readonly breakDependents?: boolean;
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
  /** 旧锁的来源抬头（首装为 null；旧锁无 source 行也是 null）——CLI 据此打印 source 变迁。 */
  readonly previousSource: LockSource | null;
  /** 升级时同路径 .meta 的 uuid 变化（只报告）。 */
  readonly uuidChanged: readonly UuidChange[];
  /**
   * 仅 --reinstall-from-tree：被锁吸收的树上改动（新增 / 内容变化），文件本身不被写；`review` 是新增里落在共享
   * 命名空间（测试目录前缀 / 域目录 / resources/ui …）的路径——未跟踪即吸收，请人工确认它们确属本插件。
   */
  readonly adopted?: { readonly added: readonly string[]; readonly changed: readonly string[]; readonly review: readonly string[] };
  /** 仅 kit + --break-dependents：被本次升级破坏的插件依赖声明（CLI 打印；plugin -- check 也会红）。 */
  readonly brokenDependents: readonly string[];
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
  /** 同 InstallOptions.breakDependents。 */
  readonly breakDependents?: boolean;
}

function fail(message: string): never {
  throw new Error(`[plugin] ${message}`);
}

function sameEntries(left: readonly LockEntry[], right: readonly LockEntry[]): boolean {
  return left.length === right.length
    && left.every((entry, index) => entry.path === right[index].path && entry.sha256 === right[index].sha256);
}

function forkLikeSource(source: LockSource | null | undefined): boolean {
  return source === null || source === undefined || source.kind === "tree";
}

const NO_DELETE: AllowDelete = { gameplays: [], plugins: [] };

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
  // 每个 apps/plugins/<id>/plugin.json 都是 codegen:plugins 的输入（登记面 + 域），所以它总要跑。
  run(root, "npm", withAllowDelete("codegen:plugins", allowDelete.plugins));
  const deleting = allowDelete.gameplays.length + allowDelete.plugins.length > 0;
  run(root, "npm", ["run", "sync:shared"], deleting ? { SYNC_FORCE: "1" } : {});
  if (useGit) {
    // 只把工作树里存在的 pathspec 交给 git（不存在的 pathspec 让 git add fatal；fixture 根未必齐全）。
    const present = (paths: readonly string[]): readonly string[] => paths.filter((relative) => fs.existsSync(path.join(root, relative)));
    const generated = present(["apps/shared/src", "apps/server/src", "apps/client/src", "docs/plugins.generated.md", "apps/server/test/lobbyRpcVectors", "apps/server/test/wire-vectors"]);
    if (generated.length > 0) run(root, "git", ["add", "-A", "--", ...generated]);
    // Cocos 镜像只暂存已跟踪文件的改动：sync:shared 新建的镜像没有 .meta，暂存它会让 verify:sync 红
    //（.meta 断言只遍历已跟踪文件）；新镜像文件等 Creator 生成 .meta 后再由人 git add（nextSteps）。
    const mirror = present(["apps/Cocos/assets/src"]);
    if (mirror.length > 0) run(root, "git", ["add", "-u", "--", ...mirror]);
  }
}

/** 删除面输入：身份摘要（派生 kinds / domains）+ 登记的 View 名 + 玩法 id 清单（省略 = 插件形态：kinds 含 gameplay ⇒ [id]）。 */
export interface AllowDeleteSide {
  readonly id: string;
  readonly kinds: readonly PluginKind[];
  readonly domains: readonly string[];
  readonly viewNames: readonly string[];
  readonly modes?: readonly string[];
}

function modeIdsOf(side: AllowDeleteSide): readonly string[] {
  if (side.modes) return side.modes;
  return side.kinds.includes("gameplay") ? [side.id] : [];
}

/** 升级删除面：旧身份/旧登记有、新包没有的 gameplay（kit：逐个 mode）/ 包 id / 域 / View（与 uninstall 的 allowDelete 同口径）。 */
export function allowDeleteFor(previous: AllowDeleteSide, next: AllowDeleteSide): AllowDelete {
  const id = previous.id;
  const nextModes = new Set(modeIdsOf(next));
  const gameplays = modeIdsOf(previous).filter((mode) => !nextModes.has(mode)).sort();
  const plugins = new Set<string>();
  const previousRegistered = previous.kinds.includes("client") || previous.domains.length > 0;
  if (previousRegistered) {
    const keeps = next.kinds.includes("client") || next.domains.length > 0;
    if (!keeps) plugins.add(id);
    for (const domain of previous.domains) {
      if (!keeps || !next.domains.includes(domain)) plugins.add(domain);
    }
    for (const view of previous.viewNames) {
      if (!keeps || !next.viewNames.includes(view)) plugins.add(view);
    }
  }
  return { gameplays, plugins: [...plugins].sort() };
}

/** 树上（升级前）的 plugin.json / kit.json 登记的 View 名；文件不在（旧包没有 client kind）则为空。 */
function treeViewNames(root: string, id: string): readonly string[] {
  const tree = readTreePackageManifest(root, id);
  return tree ? pluginDeclarations(tree).viewNames : [];
}

/** 校验通过的包 → 锁抬头摘要（派生 kinds / constantName / modes 已在 identity 里；kit 带 api，插件带 requires）。 */
function summaryOf(pkg: ValidatedPackage): LockManifestSummary {
  const { manifest, identity } = pkg;
  return {
    class: manifest.class,
    id: manifest.id,
    version: manifest.version as string,
    kinds: identity.kinds,
    constantName: identity.constantName,
    modes: identity.modes,
    domains: manifest.domains,
    fguiPackages: manifest.fguiPackages,
    api: manifest.class === "kit" ? manifest.api : {},
    requires: manifest.class === "plugin" ? manifest.requires : EMPTY_REQUIRES,
  };
}

/**
 * 宿主上一个 kit 提供的 api 面：已安装锁抬头优先；没有锁但树上有无 version 的 kit.json = 宿主自有 kit，也算提供；
 * 都没有 = 未安装。锁存在却是插件 ⇒ 点名（requires.kits 只能指向 kit）。
 */
export function resolveKitApi(root: string, kitId: string): { readonly api: Readonly<Record<string, KitApiSurface>>; readonly source: "lock" | "host" } | null {
  const lock = readInstalledLock(root, kitId);
  if (lock) {
    if (lock.manifest.class !== "kit") fail(`requires.kits 指向的 "${kitId}" 是已安装插件，不是 kit（插件之间 ⛔ 不做依赖解析，docs/KIT.md §4）`);
    return { api: lock.manifest.api, source: "lock" };
  }
  const tree = readTreePackageManifest(root, kitId);
  if (tree?.class === "kit" && tree.version === null) return { api: tree.api, source: "host" };
  return null;
}

/** 插件正向闸（docs/KIT.md §4）：声明依赖的每个 kit 都在宿主上，且每个 api 面 `minSupported ≤ 声明 ≤ version`。 */
export function assertKitRequirements(root: string, manifest: PackageManifest): void {
  if (manifest.class !== "plugin") return;
  const problems: string[] = [];
  for (const [kitId, declared] of Object.entries(manifest.requires.kits)) {
    const provided = resolveKitApi(root, kitId);
    if (!provided) {
      problems.push(`kit "${kitId}" 未安装（没有 ${INSTALLED_LOCK_DIR}/${kitId}.lock，树上也没有宿主自有的 ${packageManifestPath("kit", kitId)}）`);
      continue;
    }
    for (const violation of kitApiViolations(declared, provided.api)) problems.push(`kit "${kitId}"：${violation}`);
  }
  if (problems.length > 0) fail(`拒绝：插件 "${manifest.id}" 声明的 kit 依赖无法满足（先安装 / 升级对应 kit）：\n  ${problems.join("\n  ")}`);
}

/**
 * kit 反向闸（docs/KIT.md §4）：落盘前读全部已安装插件锁的 `requires.kits[本 kit]`，任一声明落到新 api 的
 * [minSupported, version] 之外（或面被删）即拒绝并点名插件；显式 --break-dependents 才放行。
 */
export function assertKitDependentsCompatible(root: string, manifest: PackageManifest, breakDependents: boolean): readonly string[] {
  if (manifest.class !== "kit") return [];
  const broken: string[] = [];
  for (const [pluginId, declared] of dependentsOfKit(root, manifest.id)) {
    for (const violation of kitApiViolations(declared, manifest.api)) broken.push(`插件 "${pluginId}"：${violation}`);
  }
  if (broken.length > 0 && !breakDependents) {
    fail(`拒绝：kit "${manifest.id}" 的新 api 面会破坏已安装插件的依赖声明（显式 --break-dependents 才放行，之后这些插件在 plugin -- check 里红，需各自升级）：\n  ${broken.join("\n  ")}`);
  }
  return broken;
}

/** 落盘日志：每个被本次安装触碰的路径的落盘前字节（null = 原本不存在），回滚就是按它逐条复原。 */
interface JournalEntry {
  readonly path: string;
  readonly before: Buffer | null;
}

function snapshot(root: string, relative: string): JournalEntry {
  // 按目录项真实名字判定：大小写不敏感文件系统上 Readme.md 不能「继承」README.md 的字节，否则回滚会把改名前的名字弄丢。
  return { path: relative, before: readExact(root, relative) };
}

function restoreJournal(root: string, journal: readonly JournalEntry[]): void {
  for (const entry of journal) {
    if (entry.before === null) removeFileAndEmptyDirs(root, entry.path);
    else atomicWrite(path.join(root, entry.path), entry.before);
  }
}

/** 大小写不敏感文件系统上 existsSync 会命中「同名异案」的文件：按目录项的真实名字判定存在与否。 */
function readExact(root: string, relative: string): Buffer | null {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  if (!fs.readdirSync(path.dirname(file)).includes(path.basename(file))) return null;
  return fs.readFileSync(file);
}

export interface StatusEntry {
  readonly status: string;
  readonly path: string;
}

/** `git status --porcelain -z`（NUL 分隔、不加引号，非 ASCII 路径不会被 C 风格转义；重命名条目跳过其原路径字段）。 */
export function gitStatusEntries(root: string, paths: readonly string[]): readonly StatusEntry[] {
  if (paths.length === 0) return [];
  const result = spawnSync("git", ["status", "--porcelain", "-z", "--untracked-files=all", "--", ...paths], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) fail(`git status 失败（不是 git 仓库？用 --no-git 跳过）：${result.stderr ?? result.error?.message ?? ""}`);
  const fields = result.stdout.split("\0").filter((field) => field !== "");
  const entries: StatusEntry[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const status = field.slice(0, 2);
    entries.push({ status, path: field.slice(3) });
    if (status.startsWith("R") || status.startsWith("C")) index += 1; // 下一字段是原路径
  }
  return entries;
}

interface IndexEntry {
  readonly mode: string;
  readonly sha: string;
}

/** 索引快照：路径 → { mode, blob sha }（`git ls-files -s`），回滚时逐条恢复到**操作前**的索引状态而不是 HEAD。 */
function gitIndexSnapshot(root: string, paths: readonly string[]): ReadonlyMap<string, IndexEntry> {
  const out = new Map<string, IndexEntry>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return out;
  const result = spawnSync("git", ["ls-files", "-s", "-z", "--", ...unique], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) fail(`git ls-files -s 失败：${result.stderr ?? result.error?.message ?? ""}`);
  for (const field of result.stdout.split("\0").filter((line) => line !== "")) {
    const match = /^(\d{6}) ([0-9a-f]{40,64}) \d\t(.+)$/su.exec(field);
    if (match) out.set(match[3], { mode: match[1], sha: match[2] });
  }
  return out;
}

function gitIndexRestore(root: string, before: ReadonlyMap<string, IndexEntry>, paths: readonly string[], run: CommandRunner): void {
  const unique = [...new Set(paths)];
  const absent = unique.filter((relative) => !before.has(relative));
  if (absent.length > 0) run(root, "git", ["rm", "--cached", "-q", "--ignore-unmatch", "--", ...absent]);
  for (const relative of unique) {
    const entry = before.get(relative);
    if (entry) run(root, "git", ["update-index", "--add", "--cacheinfo", `${entry.mode},${entry.sha},${relative}`]);
  }
}

function generatedRootsOf(root: string): readonly string[] {
  return readGeneratedWriterPaths(root).map((entry) => (entry.endsWith("/**") ? entry.slice(0, -3) : entry));
}

/**
 * 一次落盘（含 postinstall）的回滚上下文：插件文件与锁的落盘前字节、生成物根下**操作前已脏**路径的工作树字节、
 * 以及这两组路径的索引快照。回滚 = 字节复原 + 索引复原到操作前（⛔ 不是 restore 到 HEAD：用户已暂存 / 未暂存的 WIP
 * 必须逐字回来），生成物根下「本次新变脏」的路径按 HEAD 收回（未跟踪的删掉）。
 */
interface MutationContext {
  readonly journal: readonly JournalEntry[];
  readonly affected: readonly string[];
  readonly generatedBefore: ReadonlyMap<string, Buffer | null>;
  readonly indexBefore: ReadonlyMap<string, IndexEntry>;
  readonly indexPaths: readonly string[];
}

function beginMutation(root: string, useGit: boolean, affected: readonly string[]): MutationContext {
  const journal = affected.map((relative) => snapshot(root, relative));
  const generatedBefore = new Map<string, Buffer | null>();
  if (useGit) {
    for (const entry of gitStatusEntries(root, generatedRootsOf(root))) {
      const file = path.join(root, entry.path);
      generatedBefore.set(entry.path, fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null);
    }
  }
  const indexPaths = [...new Set([...affected, ...generatedBefore.keys()])];
  const indexBefore = useGit ? gitIndexSnapshot(root, indexPaths) : new Map<string, IndexEntry>();
  return { journal, affected, generatedBefore, indexBefore, indexPaths };
}

/** 回滚；返回生成物侧被收回的路径清单。任何一步失败都向上抛（调用方把它标成「回滚也失败」）。 */
function rollback(root: string, useGit: boolean, context: MutationContext, run: CommandRunner): readonly string[] {
  restoreJournal(root, context.journal);
  if (!useGit) return [];
  const restored: string[] = [];
  const restoreToHead: string[] = [];
  const dropFromIndex: string[] = [];
  const affected = new Set(context.affected);
  for (const entry of gitStatusEntries(root, generatedRootsOf(root))) {
    if (affected.has(entry.path)) continue; // 插件自己的文件（含 Cocos 镜像）由日志与索引快照负责
    if (context.generatedBefore.has(entry.path)) {
      // 操作前就脏的路径：按操作前字节复原（用户 WIP 逐字回来）；没被碰过的不计入清单。
      const bytes = context.generatedBefore.get(entry.path) ?? null;
      const current = readExact(root, entry.path);
      if (bytes === null ? current === null : current !== null && current.equals(bytes)) continue;
      if (bytes === null) removeFileAndEmptyDirs(root, entry.path);
      else atomicWrite(path.join(root, entry.path), bytes);
      restored.push(entry.path);
      continue;
    }
    restored.push(entry.path);
    if (entry.status === "??") {
      removeFileAndEmptyDirs(root, entry.path);
    } else if (entry.status.startsWith("A")) {
      removeFileAndEmptyDirs(root, entry.path);
      dropFromIndex.push(entry.path);
    } else {
      restoreToHead.push(entry.path);
    }
  }
  if (restoreToHead.length > 0) run(root, "git", ["restore", "--staged", "--worktree", "--", ...restoreToHead]);
  if (dropFromIndex.length > 0) run(root, "git", ["rm", "--cached", "-q", "--ignore-unmatch", "--", ...dropFromIndex]);
  gitIndexRestore(root, context.indexBefore, context.indexPaths, run);
  return restored.sort();
}

/** 执行一个可能失败的阶段；失败即回滚并把原错误连同回滚清单一起抛出（回滚自身失败则如实说明半安装态）。 */
function guarded(root: string, useGit: boolean, context: MutationContext, run: CommandRunner, stage: string, action: () => void): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let restoredGenerated: readonly string[] = [];
    try {
      restoredGenerated = rollback(root, useGit, context, run);
    } catch (rollbackError) {
      fail(`${stage}失败：${message}\n⚠ 回滚也失败（树处于半安装态，请按 git status 手工收拾）：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    fail(`${stage}失败，已回滚到操作前（插件文件与锁 ${context.journal.length} 项按落盘前字节复原、索引复原${restoredGenerated.length > 0 ? `，生成物收回 ${restoredGenerated.length} 项：${restoredGenerated.join("、")}` : ""}）：\n${message}`);
  }
}

/** HEAD 里本插件锁登记的路径（uninstall 未提交即重装时，只有这些路径的暂存删除算干净）。 */
function headLockPaths(root: string, id: string): ReadonlySet<string> {
  const result = spawnSync("git", ["show", `HEAD:${INSTALLED_LOCK_DIR}/${id}.lock`], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) return new Set();
  try {
    return new Set(parseInstalledLock(result.stdout, `HEAD:${INSTALLED_LOCK_DIR}/${id}.lock`).entries.map((entry) => entry.path));
  } catch {
    return new Set();
  }
}

/**
 * 干净检查里可忽略的形态：索引里已暂存删除且工作树不存在——但只限 HEAD 里本插件自己的锁登记过的路径（uninstall 后未提交
 * 即重装）；别人对框架文件的暂存删除不算干净（否则安装会把框架路径改写成插件内容并纳入锁）。
 */
function blockingDirty(root: string, id: string, entries: readonly StatusEntry[]): readonly StatusEntry[] {
  const lockRelative = path.posix.join(INSTALLED_LOCK_DIR, `${id}.lock`);
  let owned: ReadonlySet<string> | null = null;
  return entries.filter((entry) => {
    if (entry.status !== "D " || fs.existsSync(path.join(root, entry.path))) return true;
    if (entry.path === lockRelative || entry.path === packageManifestPath("plugin", id) || entry.path === packageManifestPath("kit", id)) return false;
    owned ??= headLockPaths(root, id);
    return !owned.has(entry.path);
  });
}

/** 旧锁清单里的 View sidecar 路径 → View 名（与 pluginDeclarations 同一 basename 规则）；reinstall 的删除面由此推出。 */
export function viewNamesFromEntries(entries: readonly LockEntry[]): readonly string[] {
  return [...new Set(entries
    .map((entry) => entry.path)
    .filter((relative) => relative.startsWith("apps/client/src/") && relative.endsWith("View.view.json"))
    .map((relative) => path.posix.basename(relative).replace(/View\.view\.json$/u, "")))].sort();
}

/** 升级时同路径 .meta 的 uuid 变化（Creator 眼里就是「另一个资源」，宿主对它的引用会断）：只报告，不拦。 */
export interface UuidChange {
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

function uuidChanges(root: string, pkg: ValidatedPackage, previousEntries: ReadonlyMap<string, LockEntry>): readonly UuidChange[] {
  const changes: UuidChange[] = [];
  for (const [relative, data] of pkg.files) {
    if (!relative.endsWith(".meta") || !previousEntries.has(relative)) continue;
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) continue;
    try {
      const from = parseMeta(fs.readFileSync(file), relative).uuid;
      const to = parseMeta(data, relative).uuid;
      if (from !== to) changes.push({ path: relative, from, to });
    } catch {
      // 树上的 .meta 坏了由 verify:sync / 宿主撞车闸负责，这里只比对能解析的。
    }
  }
  return changes;
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

/**
 * 随包 .meta 的 uuid 与宿主 assets 树的比对（PLUGIN-REGISTRY §1-11）：Creator 的 uuid 命名空间是整个资源库，
 * 撞车时另一资源的引用会静默解析到错资源；本插件旧锁登记的与本包将覆盖的 .meta 不算。落盘前拒绝并点名两侧路径。
 */
function assertNoHostUuidCollision(root: string, id: string, pkg: ValidatedPackage, skip: ReadonlySet<string>): void {
  const incoming = packageMetaUuids(pkg.files);
  if (incoming.size === 0) return;
  const host = hostMetaUuids(root, "apps/Cocos/assets", skip);
  if (host.unreadable.length > 0) {
    fail(`拒绝：宿主 apps/Cocos/assets 下有无法解析的 .meta，无从判定 uuid 撞车（先修好它们，或 verify:sync 会同样点名）：\n  ${host.unreadable.join("\n  ")}`);
  }
  const clashes: string[] = [];
  for (const [uuid, relative] of incoming) {
    const holders = host.byUuid.get(uuid);
    if (holders) clashes.push(`${uuid}：包内 ${relative} ⟷ 宿主 ${holders.join("、")}`);
  }
  if (clashes.length > 0) {
    fail(`拒绝：插件 "${id}" 随包 .meta 的 uuid 与宿主资源撞车（Creator 只认一个 uuid，另一个的引用会静默指错；作者侧删掉包内那个 .meta 让 Creator 重铸后重新 pack）：\n  ${clashes.join("\n  ")}`);
  }
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
  } else if (context.protocolStale === null && (pkg.manifest.domains.length > 0 || pkg.identity.kinds.includes("gameplay"))) {
    steps.push("本次未跑 codegen：跑完后若 protocol/ 生成物变化（codegen 会提示），人工决定是否 bump LOBBY_PROTOCOL_VERSION，然后 node scripts/protocol-fingerprint.mjs --write");
  }
  if (pkg.manifest.fguiPackages.length > 0) {
    steps.push("新 FGUI 包已入仓：node scripts/fgui-manifest.mjs --write 重钉 FGUI 发布闭包锁");
  }
  if (pkg.manifest.class === "kit" && pkg.manifest.sql.files.length > 0) {
    steps.push("kit 带 SQL 迁移：npm --workspace @game/server run db:bootstrap（迁移账本 kit_migration 只应用未应用过的文件；install ⛔ 不碰数据库，docs/KIT.md §5）");
  }
  steps.push("npm run verify:all（生成物新鲜度、镜像、协议指纹、测试全链；sync:shared 新建的 Cocos 镜像文件保持未跟踪，verify:sync 只查已跟踪文件）");
  const hasClientPluginDir = [...pkg.files.keys()].some((relative) => relative.startsWith("apps/client/src/plugins/"));
  if (hasClientPluginDir && !fs.existsSync(path.join(root, "apps/Cocos/assets/src/plugins.meta"))) {
    steps.push("首个 plugin 插件：打开一次 Cocos Creator 生成共享祖先目录 .meta（apps/Cocos/assets/src/plugins.meta）并提交——它由仓库持有，⛔ 不随包");
  }
  const hasClientKitDir = [...pkg.files.keys()].some((relative) => relative.startsWith("apps/client/src/kits/"));
  if (hasClientKitDir && !fs.existsSync(path.join(root, "apps/Cocos/assets/src/kits.meta"))) {
    steps.push("首个带客户端的 kit：打开一次 Cocos Creator 生成共享祖先目录 .meta（apps/Cocos/assets/src/kits.meta）并提交——它由仓库持有，⛔ 不随包");
  }
  if (pkg.identity.kinds.includes("gameplay") || pkg.manifest.domains.length > 0) {
    steps.push("提交前打开一次 Cocos Creator 为 sync:shared 新建的镜像文件（apps/Cocos/assets/src/shared/**）生成 .meta，再 git add apps/Cocos/assets/src");
  }
  steps.push("打开一次 Cocos Creator 确认随包 .meta 的 uuid 稳定（Creator 只会重写键序/版本，uuid 不变）");
  return steps;
}

/** 一个玩法 id 的专属落点前缀（插件的单个玩法 / kit 的每个 mode 同形）。 */
function gameplayExclusivePrefixes(modeId: string): readonly string[] {
  return [`apps/shared/src/gameplays/${modeId}/`, `apps/server/src/rooms/modes/${modeId}/`,
    `apps/client/src/gameplay/modes/${modeId}/`, `apps/client/src/logic/rooms/${modeId}/`, `apps/client/src/view/rooms/${modeId}/`,
    `apps/Cocos/assets/src/gameplay/modes/${modeId}/`, `apps/Cocos/assets/src/logic/rooms/${modeId}/`, `apps/Cocos/assets/src/view/rooms/${modeId}/`,
    `apps/Cocos/assets/resources/${modeId}/`];
}

/** 推导集里与框架/其它包共用父目录的落点（按前缀或域名归属，而不是 <id> 专属目录）。插件缺省 class=plugin、单玩法 = id。 */
export function isSharedNamespace(relative: string, id: string, cls: PackageClass = "plugin", modeIds: readonly string[] = [id]): boolean {
  const exclusive = cls === "kit"
    ? [`${kitDir(id)}/`, `apps/client/src/kits/${id}/`, `apps/Cocos/assets/src/kits/${id}/`, `apps/shared/src/kits/${id}/`, `apps/server/src/kits/${id}/`,
      `apps/server/src/core/compute/tasks/kits/${id}/`, `apps/Cocos/assets/resources/kits/${id}/`, ...modeIds.flatMap(gameplayExclusivePrefixes)]
    : [`${pluginDir(id)}/`, `apps/client/src/plugins/${id}/`, `apps/Cocos/assets/src/plugins/${id}/`, `apps/server/src/core/${id}/`,
      ...modeIds.flatMap(gameplayExclusivePrefixes)];
  if (exclusive.some((prefix) => relative.startsWith(prefix) || relative === `${prefix.slice(0, -1)}.meta`)) return false;
  return true;
}

export function installPlugin(options: InstallOptions): InstallReport {
  const root = path.resolve(options.root);
  const useGit = options.git !== false;
  const pkg = validatePackage(readPackage(options.source), root);
  const { manifest } = pkg;
  const id = manifest.id;
  const summary = summaryOf(pkg);

  const previous = readInstalledLock(root, id);
  const previousEntries = new Map<string, LockEntry>((previous?.entries ?? []).map((entry) => [entry.path, entry]));
  if (previous) {
    // 删除面（旧有新无）必须与写入面过同一道 allowlist：锁被改过即拒绝，⛔ 不按可疑的锁删文件。
    assertInstalledLockOwned(root, previous, "升级");
    const cmp = compareVersions(summary.version, previous.manifest.version);
    if (cmp < 0 && !options.allowDowngrade) {
      fail(`拒绝降级：已安装 ${id}@${previous.manifest.version}，包为 ${summary.version}（显式 --allow-downgrade 才放行）`);
    }
    const sameContent = sameEntries(previous.entries, pkg.entries);
    // 本地分叉（锁由 --reinstall-from-tree 写出）与来源未知的旧锁（无 # source 行，可能就是分叉）都 fail-closed：
    // 来包内容不同即视为「上游会覆盖宿主改动」，默认拒绝并列出分叉面；--replace-local-fork 显式放行
    //（同版本不同内容也放行：分叉 bump 到的版本号可能恰与上游撞车）。
    const forkLike = previous.source === null || previous.source === undefined || previous.source.kind === "tree";
    if (forkLike && !sameContent) {
      const incoming = new Map(pkg.entries.map((entry) => [entry.path, entry.sha256]));
      const overwritten = previous.entries.filter((entry) => incoming.has(entry.path) && incoming.get(entry.path) !== entry.sha256).map((entry) => entry.path);
      const removed = previous.entries.filter((entry) => !incoming.has(entry.path)).map((entry) => entry.path);
      if (!options.replaceLocalFork) {
        const why = previous.source?.kind === "tree"
          ? "是本地分叉（锁 source=tree，宿主曾以 --reinstall-from-tree 吸收改动）"
          : "的锁没有来源抬头（§1-5 之前的旧锁形态，可能就是本地分叉）";
        fail(`拒绝：已安装 ${id}@${previous.manifest.version} ${why}，`
          + `来包会覆盖/删除这些文件；确认要放弃本地内容再用 --replace-local-fork：\n`
          + `  覆盖 ${overwritten.length}：\n  ${overwritten.join("\n  ") || "-"}\n  删除 ${removed.length}：\n  ${removed.join("\n  ") || "-"}`);
      }
    } else if (cmp === 0 && !sameContent) {
      fail(`拒绝：包版本 ${summary.version} 与已安装版本相同但内容不同——升级必须 bump version`);
    }
    const verification = verifyLockAgainstTree(root, previous.entries);
    if (verification.modified.length > 0) {
      fail(`拒绝升级：以下文件与已安装锁不符（本地改动会被覆盖丢失，请先提交/回退或改走框架 PR）：\n  ${verification.modified.join("\n  ")}`);
    }
    if (verification.missing.length > 0) {
      fail(`拒绝升级：已安装锁登记的文件在工作树缺失（锁与树不一致；先 plugin -- check 核对并修正锁，或 plugin -- uninstall ${id} --force 后重装）：\n  ${verification.missing.join("\n  ")}`);
    }
  }

  // 同一 id 不能既是已安装插件又来装 kit（反之亦然）：类别是身份，⛔ 不能升级着换。
  if (previous && previous.manifest.class !== manifest.class) {
    fail(`拒绝：已安装的 "${id}" 是 ${previous.manifest.class}，来包是 ${manifest.class}——先 uninstall 再装（类别不能升级着换）`);
  }
  // kit 依赖闸（docs/KIT.md §4）：插件正向（所需 kit 在场且 api 兼容），kit 反向（不破坏已安装插件的声明）。
  assertKitRequirements(root, manifest);
  const brokenDependents = assertKitDependentsCompatible(root, manifest, options.breakDependents === true);

  // 所有权冲突：推导集内（含镜像）已有不属本插件的文件——文件级同名与目录级占用（id/domain 撞框架目录）都拒绝；
  // 别的插件锁登记的路径先单独点名（两个插件的推导集相交是硬错误，不是「谁先装谁赢」）。
  const foreign = foreignLockOwners(root, id);
  assertNoForeignClash(id, pkg.files.keys(), foreign);
  const conflicts = ownershipConflicts(root, pkg.rules, new Set(previousEntries.keys()), foreign);
  if (conflicts.length > 0) fail(`拒绝：以下目标路径已存在且不属${manifest.class === "kit" ? " kit" : "插件"} "${id}"（所有权冲突，⛔ 不覆盖、不混入框架目录）：\n  ${conflicts.join("\n  ")}`);
  assertNoHostUuidCollision(root, id, pkg, new Set([...previousEntries.keys(), ...pkg.files.keys()]));

  const stale = [...previousEntries.keys()].filter((relative) => !pkg.files.has(relative));
  const lockRelative = path.posix.join(INSTALLED_LOCK_DIR, `${id}.lock`);
  const affected = [...pkg.files.keys(), ...stale, lockRelative];
  if (useGit) {
    const dirty = blockingDirty(root, id, gitStatusEntries(root, affected));
    if (dirty.length > 0) fail(`拒绝：受影响路径的工作树不干净（先提交或清理）：\n  ${dirty.map((entry) => `${entry.status} ${entry.path}`).join("\n  ")}`);
  }
  // 升级删除面（旧有新无的域 / View / kind）在覆盖 plugin.json 之前从树上读出。
  const allowDelete = previous
    ? allowDeleteFor(
      { id, kinds: previous.manifest.kinds, domains: previous.manifest.domains, viewNames: treeViewNames(root, id), modes: modesOf(previous.manifest).map((mode) => mode.id) },
      { id, kinds: pkg.identity.kinds, domains: manifest.domains, viewNames: pkg.viewNames, modes: modesOf(pkg.identity).map((mode) => mode.id) },
    )
    : NO_DELETE;
  const postinstallKinds = [...new Set([...(previous?.manifest.kinds ?? []), ...pkg.identity.kinds])];

  // 仅大小写不同的改名（README.md → Readme.md）：大小写不敏感文件系统上新名 existsSync 会命中旧文件——必须当作
  // 「删旧写新」而不是 unchanged，且先删后写（同一 inode）。
  const foldedStale = new Map(stale.map((relative) => [relative.toLowerCase(), relative]));
  const written: string[] = [];
  const unchanged: string[] = [];
  for (const [relative, data] of pkg.files) {
    const oldName = foldedStale.get(relative.toLowerCase());
    const existing = oldName !== undefined && oldName !== relative ? null : readExact(root, relative);
    if (existing && existing.equals(data)) {
      unchanged.push(relative);
      continue;
    }
    written.push(relative);
  }
  const sameAsFork = previous !== null && forkLikeSource(previous.source) && sameEntries(previous.entries, pkg.entries) && !options.replaceLocalFork;
  // 与分叉内容相同的包（宿主自己 pack 出来的）⛔ 不能把分叉「洗白」成 package：来源照旧，除非显式 --replace-local-fork。
  const source: LockSource = sameAsFork && previous?.source
    ? previous.source
    : { kind: "package", filesLockSha256: filesLockSha256Of(pkg.entries), ...(options.registry ? { registry: options.registry } : {}) };
  const base = {
    id,
    version: summary.version,
    previousVersion: previous?.manifest.version ?? null,
    written: written.sort(),
    unchanged: unchanged.sort(),
    deleted: stale.sort(),
    allowDelete,
    source,
    previousSource: previous?.source ?? null,
    uuidChanged: uuidChanges(root, pkg, previousEntries),
    brokenDependents,
  };
  if (options.dryRun) return { ...base, nextSteps: nextStepsFor(pkg, root) };

  const run = options.runner ?? runCommand;
  const context = beginMutation(root, useGit, affected);
  guarded(root, useGit, context, run, "落盘", () => {
    for (const relative of stale) removeFileAndEmptyDirs(root, relative);
    for (const relative of written) atomicWrite(path.join(root, relative), pkg.files.get(relative) as Buffer);
    writeInstalledLock(root, { manifest: summary, entries: pkg.entries, source });
    if (useGit) gitAddExisting(root, affected);
  });
  if (options.postinstall === false) return { ...base, nextSteps: nextStepsFor(pkg, root) };
  guarded(root, useGit, context, run, "postinstall", () => runPostinstall(root, postinstallKinds, useGit, allowDelete, run));
  // nextSteps 按 postinstall 的实际结果派生：指纹是否真的过期由 --check 说了算。
  return { ...base, nextSteps: nextStepsFor(pkg, root, { protocolStale: protocolFingerprintStale(root) }) };
}

/**
 * 同仓「作者=宿主」迭代（plan-v5 E6 方案 ②）：以工作树为真相重写已安装锁。
 *
 * 与 install 的差别只有两处：不要求「树 ≡ 旧锁」（本地改动正是要吸收的东西），也不要求受影响路径
 * git 干净。其余闸门一个不少：采集与自检走 pack 同一条路（缺 .meta / 越权 / 镜像不一致即拒绝）、
 * 锁被篡改即拒绝、同版本不同内容拒绝（同仓迭代也必须 bump plugin.json version）、降级须显式、
 * 目录级所有权冲突拒绝。⛔ 不写任何插件文件（它们本来就在树上），只重写 scripts/packages/<id>.lock，
 * 然后照常 postinstall（codegen / sync）并 git add。
 */
export function reinstallFromTree(options: ReinstallFromTreeOptions): InstallReport {
  const root = path.resolve(options.root);
  const { id } = options;
  const useGit = options.git !== false;
  const previous = readInstalledLock(root, id);
  if (!previous) fail(`包 "${id}" 未安装（没有 ${INSTALLED_LOCK_DIR}/${id}.lock）；首装请用 install <zip|dir>`);
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
  const summary = summaryOf(pkg);
  const manifestRelative = packageManifestPath(manifest.class, id);
  if (previous.manifest.class !== manifest.class) fail(`拒绝：已安装的 "${id}" 是 ${previous.manifest.class}，树上是 ${manifest.class}——先 uninstall 再装（类别不能升级着换）`);
  const cmp = compareVersions(summary.version, previous.manifest.version);
  if (cmp < 0 && !options.allowDowngrade) {
    fail(`拒绝降级：已安装 ${id}@${previous.manifest.version}，树上 ${manifestRelative} 为 ${summary.version}（显式 --allow-downgrade 才放行）`);
  }
  // 身份变化闸：kinds / constantName / modes / domains / fguiPackages 一变，推导集就变——树上把一个前缀合规的域写进 domains
  // 会让采集把树上同名域的文件当成「本插件新增」吸进锁（审阅实证：domains 加一个域 ⇒ added 7），必须显式放行。
  const identityChanges = identityDifferences(previous.manifest, pkg.identity);
  if (identityChanges.length > 0 && !options.allowIdentityChange) {
    fail(`拒绝：树上 ${manifestRelative} 的身份与已安装锁不同（推导集随之变化，显式 --allow-identity-change 才放行）：\n  ${identityChanges.join("\n  ")}`);
  }
  assertKitRequirements(root, manifest);
  const brokenDependents = assertKitDependentsCompatible(root, manifest, options.breakDependents === true);
  const previousByPath = new Map(previous.entries.map((entry) => [entry.path, entry.sha256]));
  const added = pkg.entries.map((entry) => entry.path).filter((relative) => !previousByPath.has(relative)).sort();
  const changed = pkg.entries
    .filter((entry) => previousByPath.has(entry.path) && previousByPath.get(entry.path) !== entry.sha256)
    .map((entry) => entry.path)
    .sort();
  const stale = [...previousByPath.keys()].filter((relative) => !pkg.files.has(relative)).sort();
  if (cmp === 0 && !sameEntries(previous.entries, pkg.entries)) {
    fail(`拒绝：树上内容与已安装 ${id}@${previous.manifest.version} 不同但版本未变——同仓迭代也必须 bump ${manifestRelative} 的 version\n`
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
  assertNoHostUuidCollision(root, id, pkg, new Set([...previousByPath.keys(), ...collected]));

  const lockRelative = path.posix.join(INSTALLED_LOCK_DIR, `${id}.lock`);
  // 树就是真相：旧锁登记、树上采集不到、却仍在磁盘的文件（典型：--allow-identity-change 去掉一个域，域文件还留着）
  // 已不在推导集内，⛔ 不能替作者删——拒绝并点名，让作者删文件或改回 plugin.json。
  const staleOnDisk = stale.filter((relative) => fs.existsSync(path.join(root, relative)));
  if (staleOnDisk.length > 0) {
    fail(`拒绝：以下文件在已安装锁里、已不在包 "${id}" 的推导集内、却仍在磁盘上——从树重装不替作者删文件；先删掉它们或改回 ${manifestRelative}：\n  ${staleOnDisk.join("\n  ")}`);
  }
  // 删除面：旧锁身份 vs 树上身份，旧 View 名从旧锁的 sidecar 条目推出（树上清单已是新的）。
  const allowDelete = allowDeleteFor(
    { id, kinds: previous.manifest.kinds, domains: previous.manifest.domains, viewNames: viewNamesFromEntries(previous.entries), modes: modesOf(previous.manifest).map((mode) => mode.id) },
    { id, kinds: pkg.identity.kinds, domains: manifest.domains, viewNames: pkg.viewNames, modes: modesOf(pkg.identity).map((mode) => mode.id) },
  );
  const postinstallKinds = [...new Set([...previous.manifest.kinds, ...pkg.identity.kinds])];
  // 新增里落在共享命名空间的路径：未跟踪即吸收（作者刚写的），但共享目录里也可能是别人刚写、尚未提交的文件——报出来请人确认。
  const review = added.filter((relative) => isSharedNamespace(relative, id, manifest.class, modesOf(pkg.identity).map((mode) => mode.id)));
  // 来源抬头：树 ≡ 旧锁的幂等 no-op 保留原来源（⛔ 不把 package 悄悄改成 tree）；真有改动才标 tree 并把上一来源放进 forkedFrom。
  const noop = sameEntries(previous.entries, pkg.entries) && previous.manifest.version === summary.version;
  const source: LockSource = noop && previous.source
    ? previous.source
    : { kind: "tree", filesLockSha256: filesLockSha256Of(pkg.entries), forkedFrom: previous.source?.kind === "tree" ? previous.source.forkedFrom : (previous.source ?? null) };
  const base = {
    id,
    version: summary.version,
    previousVersion: previous.manifest.version,
    written: [] as readonly string[],
    unchanged: pkg.entries.map((entry) => entry.path).filter((relative) => !added.includes(relative) && !changed.includes(relative)),
    deleted: stale,
    allowDelete,
    source,
    previousSource: previous.source ?? null,
    uuidChanged: [],
    adopted: { added, changed, review },
    brokenDependents,
  };
  if (options.dryRun) return { ...base, nextSteps: nextStepsFor(pkg, root) };

  const run = options.runner ?? runCommand;
  // 触碰面 = 锁 + 树上已删的旧锁路径（只清空目录并暂存删除）+ 采集到的文件（只暂存）；索引快照覆盖全部，回滚回到操作前。
  const affected = [...pkg.files.keys(), ...stale, lockRelative];
  const context = beginMutation(root, useGit, affected);
  guarded(root, useGit, context, run, "落盘", () => {
    for (const relative of stale) removeFileAndEmptyDirs(root, relative);
    writeInstalledLock(root, { manifest: summary, entries: pkg.entries, source });
    if (useGit) gitAddExisting(root, affected);
  });
  if (options.postinstall === false) return { ...base, nextSteps: nextStepsFor(pkg, root) };
  guarded(root, useGit, context, run, "postinstall", () => runPostinstall(root, postinstallKinds, useGit, allowDelete, run));
  return { ...base, nextSteps: nextStepsFor(pkg, root, { protocolStale: protocolFingerprintStale(root) }) };
}
