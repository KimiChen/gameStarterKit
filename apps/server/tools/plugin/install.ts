/**
 * 安装 / 升级 = 「zip 清单 ⟷ 已安装锁 ⟷ 工作树」三方比对，然后原子落盘：
 *  - 首装：目标路径已存在且不属本插件 ⇒ 拒绝（所有权冲突，⛔ 不覆盖别人的文件）；
 *  - 升级：工作树与旧锁不符（本地改动）⇒ 拒绝；同版本不同内容 ⇒ 拒绝；降级须显式 --allow-downgrade；
 *    旧锁有、新包无 ⇒ 按清单删除（陈旧文件不残留）；
 *  - 写盘前工作树受影响路径必须干净（git status），失败前不碰工作树；
 *  - 落盘后写 scripts/plugins/<id>.lock、git add，再跑 codegen:gameplays / codegen:features / sync:shared；
 *    协议指纹与 FGUI manifest 的重钉是人的决策（⛔ 脚本不隐式 --write），只打印下一步。
 *  - `install --reinstall-from-tree <id>`（plan-v5 E6 方案 ②）：同仓「作者=宿主」迭代——以工作树为真相
 *    重写已安装锁，等价于「pack 当前树 → install 该包」但不要求树≡旧锁；版本规则原样保留。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareVersions } from "./manifest";
import { INSTALLED_LOCK_DIR, readInstalledLock, verifyLockAgainstTree, writeInstalledLock, type LockEntry } from "./lock";
import { packPlugin } from "./pack";
import { assertInstalledLockOwned, readPackage, validatePackage, type ValidatedPackage } from "./package";
import { mirrorPathOf, type OwnershipRule } from "./ownership";

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
}

function fail(message: string): never {
  throw new Error(`[plugin] ${message}`);
}

function sameEntries(left: readonly LockEntry[], right: readonly LockEntry[]): boolean {
  return left.length === right.length
    && left.every((entry, index) => entry.path === right[index].path && entry.sha256 === right[index].sha256);
}

function runPostinstall(root: string, kinds: readonly string[], useGit: boolean): void {
  if (kinds.includes("gameplay")) runCommand(root, "npm", ["--workspace", "@game/server", "run", "codegen:gameplays"]);
  if (kinds.includes("feature")) runCommand(root, "npm", ["--workspace", "@game/server", "run", "codegen:features"]);
  runCommand(root, "npm", ["run", "sync:shared"]);
  if (useGit) {
    runCommand(root, "git", ["add", "-A", "--", "apps/shared/src", "apps/server/src", "apps/client/src", "docs/features.generated.md", "apps/server/test/lobbyRpcVectors", "apps/server/test/wire-vectors"]);
    // Cocos 镜像只暂存已跟踪文件的改动：sync:shared 新建的镜像没有 .meta，暂存它会让 verify:sync 红
    //（.meta 断言只遍历已跟踪文件）；新镜像文件等 Creator 生成 .meta 后再由人 git add（nextSteps）。
    runCommand(root, "git", ["add", "-u", "--", "apps/Cocos/assets/src"]);
  }
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
function ownershipConflicts(root: string, rules: readonly OwnershipRule[], owned: ReadonlySet<string>): readonly string[] {
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
    if (!owned.has(relative)) conflicts.add(relative);
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
          if (name.startsWith(rule.prefix ?? "") && name !== rule.prefix && fs.statSync(path.join(dir, name)).isFile()) check(`${target}/${name}`);
        }
      }
    }
  }
  return [...conflicts].sort();
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
    if (cmp === 0 && !sameContent) fail(`拒绝：包版本 ${manifest.version} 与已安装版本相同但内容不同——升级必须 bump version`);
    const verification = verifyLockAgainstTree(root, previous.entries);
    if (verification.modified.length > 0) {
      fail(`拒绝升级：以下文件与已安装锁不符（本地改动会被覆盖丢失，请先提交/回退或改走框架 PR）：\n  ${verification.modified.join("\n  ")}`);
    }
    if (verification.missing.length > 0) {
      fail(`拒绝升级：已安装锁登记的文件在工作树缺失（锁与树不一致；先 plugin -- check 核对并修正锁，或 plugin -- uninstall ${id} --force 后重装）：\n  ${verification.missing.join("\n  ")}`);
    }
  }

  // 所有权冲突：推导集内（含镜像）已有不属本插件的文件——文件级同名与目录级占用（id/domain 撞框架目录）都拒绝。
  const conflicts = ownershipConflicts(root, pkg.rules, new Set(previousEntries.keys()));
  if (conflicts.length > 0) fail(`拒绝：以下目标路径已存在且不属插件 "${id}"（所有权冲突，⛔ 不覆盖、不混入框架目录）：\n  ${conflicts.join("\n  ")}`);

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
  const base = {
    id,
    version: manifest.version,
    previousVersion: previous?.manifest.version ?? null,
    written: written.sort(),
    unchanged: unchanged.sort(),
    deleted: stale.sort(),
  };
  if (options.dryRun) return { ...base, nextSteps: nextStepsFor(pkg, root) };

  for (const relative of written) atomicWrite(path.join(root, relative), pkg.files.get(relative) as Buffer);
  for (const relative of stale) removeFileAndEmptyDirs(root, relative);
  writeInstalledLock(root, { manifest, entries: pkg.entries });

  if (useGit) gitAddExisting(root, affected);
  if (options.postinstall === false) return { ...base, nextSteps: nextStepsFor(pkg, root) };
  runPostinstall(root, manifest.kinds, useGit);
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
  const conflicts = ownershipConflicts(root, pkg.rules, new Set([...previousByPath.keys(), ...pkg.files.keys()]));
  if (conflicts.length > 0) fail(`拒绝：以下路径在插件 "${id}" 的推导集内却既不在旧锁也不在树上采集结果里（生成物/硬排除混入插件目录？）：\n  ${conflicts.join("\n  ")}`);

  const lockRelative = path.posix.join(INSTALLED_LOCK_DIR, `${id}.lock`);
  const base = {
    id,
    version: manifest.version,
    previousVersion: previous.manifest.version,
    written: [] as readonly string[],
    unchanged: pkg.entries.map((entry) => entry.path).filter((relative) => !added.includes(relative) && !changed.includes(relative)),
    deleted: stale,
    adopted: { added, changed },
  };
  if (options.dryRun) return { ...base, nextSteps: nextStepsFor(pkg, root) };

  // 旧锁登记、树上已删的文件：树就是真相，只需把可能残留的空目录清掉（文件已不存在时 removeFileAndEmptyDirs 只清目录）。
  for (const relative of stale) removeFileAndEmptyDirs(root, relative);
  writeInstalledLock(root, { manifest, entries: pkg.entries });
  if (useGit) gitAddExisting(root, [...pkg.files.keys(), ...stale, lockRelative]);
  if (options.postinstall === false) return { ...base, nextSteps: nextStepsFor(pkg, root) };
  runPostinstall(root, manifest.kinds, useGit);
  return { ...base, nextSteps: nextStepsFor(pkg, root, { protocolStale: protocolFingerprintStale(root) }) };
}
