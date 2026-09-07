/**
 * `plugin -- changed`：内循环用的**收窄跑法**（根别名 `npm run test:changed`）。
 *
 * 判据是**反过来**的：⛔ 不是「插件目录变了就只跑插件测试」。包测试直接 import 宿主
 * （GameRoom / GameMode / GameRoomState / core/infra/keys / core/errors / @game/shared / http），
 * 改宿主不改插件照样能把它们打红——那正是这些测试存在的理由（F13 是宿主改 admission 流程时被
 * `snake-run-rewards.test.ts` 抓到的，snake 目录一个字没动）。所以这里只在**整次改动都落在包的
 * 所有权推导集内**时才收窄；只要有一条路径不属于任何包，立刻退回 `npm run verify:all`。
 *
 * 收窄后**仍然跑**：
 *  - 全部 `verify:*` 校验脚本（合计约 2s；它们检查的是工作树，不是工具自身）
 *  - 两个 codegen 的 `--check`（生成物漂移）与 `plugin -- check`（锁 / 所有权 / 版本闸）
 *  - `typecheck`、`test:fgui`、`test:client`
 *  - **包机制**服务端测试（`plugin-*` / `kit-*` / `gameplay-codegen`：任何 plugin.json 改动都碰得到）
 *  - 变更包**自己**的测试，按所有权推导的 `<id>-*.test.ts` 前缀规则从**工作树**取
 *    （⛔ 不从锁取：新写的测试文件在重装前不在锁里，从锁取会静默漏掉它）
 *
 * ⛔ 只跳过**测工具本身**的那些套件（test:inventory / test:sync-mirror-matrix / test:launcher-matrix /
 * test:npm-reference-matrix / test:aggregate-chain-matrix / test:toolchain-runtime-matrix）与宿主自己的
 * 服务端测试：它们验的是校验器与工具链的逻辑，而工具链一变就已经算「宿主改动」、会走全量。
 *
 * ⚠ 这是**内循环便利**，⛔ 不是审核闸。提交前与 CI 仍然跑 `npm run verify:all`。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runCommand } from "./install";
import { readTreePackageManifest, treeIdentityOf } from "./manifest";
import {
  KITS_ROOT,
  PLUGINS_ROOT,
  classifyPath,
  deriveOwnership,
  matchesPrefixRule,
  readGeneratedWriterPaths,
  readProtectedPaths,
  type OwnershipRule,
} from "./ownership";

/** 收窄时仍要跑的**包机制**服务端测试：任何 plugin.json / kit.json 改动都能碰到它们。 */
export const MACHINERY_TESTS: readonly string[] = [
  "apps/server/test/archive-kits.test.ts",
  "apps/server/test/gameplay-codegen.test.ts",
  "apps/server/test/kit-api.test.ts",
  "apps/server/test/kit-drop-data.test.ts",
  "apps/server/test/kit-import-boundary.test.ts",
  "apps/server/test/kit-keys.test.ts",
  "apps/server/test/kit-migrations.test.ts",
  "apps/server/test/plugin-changed.test.ts",
  "apps/server/test/plugin-codegen.test.ts",
  "apps/server/test/plugin-keys.test.ts",
  "apps/server/test/plugin-lock.test.ts",
  "apps/server/test/plugin-tool.test.ts",
];

/** 包自有测试的发现目录（与 ownership 的 testPrefixRules 同口径；⛔ int/ 不进内循环，它要本地 Redis/MySQL）。 */
const TEST_DIRS: readonly string[] = ["apps/server/test", "apps/client/test"];

export interface ChangedPlan {
  /** 本次改动的全部路径（工作树 + 可选 base 比对），已排序去重。 */
  readonly changed: readonly string[];
  /** 改动覆盖到的包 id（按 id 排序）。 */
  readonly packages: readonly string[];
  /** 不属于任何包的改动路径——有一条就必须全量。 */
  readonly foreign: readonly string[];
  /** 生成物 / 镜像（`generatedWriterOwned` 登记）：既不算包的也不算宿主的，见 isDerived。 */
  readonly derived: readonly string[];
  /** 推导不出所有权集的登记（见 PackageOwnershipScan.undeducible）。 */
  readonly undeducible: readonly { readonly id: string; readonly reason: string }[];
  readonly fast: boolean;
  readonly reason: string;
  /** 收窄时要跑的服务端/客户端测试文件（相对 apps/server，node --test 的参数形态）。 */
  readonly tests: readonly string[];
}

function fail(message: string): never {
  throw new Error(`[plugin] ${message}`);
}

function git(root: string, args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.error) fail(`git ${args.join(" ")} 无法启动：${result.error.message}`);
  if (result.status !== 0) fail(`git ${args.join(" ")} 失败（不是 git 仓库？）：${result.stderr.trim()}`);
  return result.stdout;
}

/**
 * 本次改动的路径集：工作树（暂存 + 未暂存 + 未跟踪）∪（给了 `base` 时）与 base 的提交差异。
 * ⚠ 重命名/复制的**两端**都算改动——旧路径消失本身就可能打破别处的引用。
 */
export function collectChangedPaths(root: string, base?: string): readonly string[] {
  const paths = new Set<string>();
  // `--porcelain=v1 -z`：每条是 `XY<空格>路径\0`；R/C 额外跟一个 `\0` 分隔的旧路径。
  const status = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0");
  for (let index = 0; index < status.length; index += 1) {
    const record = status[index];
    if (!record) continue;
    const code = record.slice(0, 2);
    paths.add(record.slice(3));
    if (code.includes("R") || code.includes("C")) {
      index += 1;
      if (status[index]) paths.add(status[index]);
    }
  }
  if (base !== undefined) {
    for (const line of git(root, ["diff", "--name-only", `${base}...HEAD`]).split("\n")) {
      if (line.trim() !== "") paths.add(line);
    }
  }
  return [...paths].sort();
}

interface PackageOwnership {
  readonly id: string;
  readonly rules: readonly OwnershipRule[];
}

export interface PackageOwnershipScan {
  readonly owners: readonly PackageOwnership[];
  /**
   * 推导不出所有权集的登记——目前只有宿主自有的 `builtin`（`category: "core"`，`viewDirs` 指向
   * 宿主的 `view/` 根，没有锁）。⚠ 它们的路径因此算「不属于任何包」→ 走全量，这是对的：
   * 宿主自有登记本来就是宿主改动。⛔ 但不静默——真坏掉的 manifest 也走这条路，得看得见。
   */
  readonly undeducible: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * 工作树上的全部包及其所有权推导集。
 * ⚠ 按**工作树 manifest** 枚举而不是按锁：新建但还没装的包，其目录也应算它自己的（是否已装由
 * 快路径里的 `plugin -- check` 去判）。
 */
export function loadPackageOwnerships(root: string): PackageOwnershipScan {
  const owners: PackageOwnership[] = [];
  const undeducible: { id: string; reason: string }[] = [];
  for (const packagesRoot of [PLUGINS_ROOT, KITS_ROOT]) {
    const dir = path.join(root, packagesRoot);
    if (!fs.existsSync(dir)) continue;
    for (const id of fs.readdirSync(dir).sort()) {
      if (!fs.statSync(path.join(dir, id)).isDirectory()) continue;
      const manifest = readTreePackageManifest(root, id);
      if (!manifest) continue;
      try {
        owners.push({ id, rules: deriveOwnership(treeIdentityOf(root, manifest)) });
      } catch (error) {
        undeducible.push({ id, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { owners, undeducible };
}

/**
 * 生成物与镜像：codegen / sync 的确定性产物，跟着**包自己的输入**走，所以 ⛔ 不算「宿主改动」。
 * 判据取仓里已有的单一登记 `scripts/protected-paths.json` 的 `generatedWriterOwned`
 * （registry.generated / client/src/generated / Cocos 镜像 / client/src/shared 镜像 …）。
 * 快路径里的两个 `codegen --check` 与 `verify:sync` 正是验这些产物是否新鲜，所以放它们过不降低强度。
 *
 * ⚠ 唯一的例外是 `scripts/packages/**`（锁）——`readGeneratedWriterPaths` 自己就把它排除在外，
 * 这里照办：锁变了说明刚做过 install/reinstall，那是**身份**变更，该跑全量而不是收窄。
 * ⚠ 只有生成物变、没有任何包变时也**不收窄**（有人手改了生成物，或改动来自宿主真源）。
 */
function makeIsDerived(root: string): (relative: string) => boolean {
  const entries = readGeneratedWriterPaths(root);
  return (relative) => entries.some((entry) => (entry.endsWith("/**")
    ? relative === entry.slice(0, -3) || relative.startsWith(`${entry.slice(0, -3)}/`)
    : relative === entry));
}

/** 一个包按前缀规则在工作树上拥有的测试文件（⛔ 不读锁，见文件头注释）。 */
function worktreeTestsOf(root: string, rules: readonly OwnershipRule[]): readonly string[] {
  const files: string[] = [];
  for (const dir of TEST_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const base of fs.readdirSync(abs).sort()) {
      if (!base.endsWith(".test.ts")) continue;
      const owned = rules.some((rule) => rule.kind === "prefix" && rule.path === dir && matchesPrefixRule(base, rule));
      if (owned) files.push(path.posix.join(dir, base));
    }
  }
  return files;
}

/** 决定这次改动能不能收窄，以及收窄后要跑哪些测试。 */
export function planChanged(root: string, changed: readonly string[]): ChangedPlan {
  const { owners, undeducible } = loadPackageOwnerships(root);
  const protectedPaths = readProtectedPaths(root);
  const isDerived = makeIsDerived(root);
  const packages = new Set<string>();
  const foreign: string[] = [];
  const derived: string[] = [];
  for (const relative of changed) {
    const claimants = owners.filter((owner) => classifyPath(relative, owner.rules, protectedPaths).allowed);
    // ⚠ 两个包同时认领 = 所有权推导出了问题（推导集本该互斥）；⛔ 不猜，退全量。
    if (claimants.length === 1) packages.add(claimants[0].id);
    else if (isDerived(relative)) derived.push(relative);
    else foreign.push(relative);
  }
  const tests = new Set<string>(MACHINERY_TESTS);
  for (const owner of owners) {
    if (packages.has(owner.id)) for (const file of worktreeTestsOf(root, owner.rules)) tests.add(file);
  }
  const plan = {
    changed,
    packages: [...packages].sort(),
    foreign,
    derived,
    undeducible,
    tests: [...tests].sort().map((file) => path.posix.relative("apps/server", file)),
  };
  if (changed.length === 0) return { ...plan, fast: false, reason: "工作树干净：没有可收窄的改动面，跑全量" };
  if (foreign.length > 0) {
    const sample = foreign.slice(0, 5).join("、");
    return { ...plan, fast: false, reason: `有 ${foreign.length} 条改动不属于任何包（${sample}${foreign.length > 5 ? " …" : ""}）：宿主改动能打红任何包的测试，跑全量` };
  }
  if (packages.size === 0) return { ...plan, fast: false, reason: `${derived.length} 条改动全是生成物/镜像，没有任何包的真源在动：可能是手改了生成物，跑全量` };
  const suffix = derived.length > 0 ? `（另有 ${derived.length} 条生成物/镜像，由 codegen --check 与 verify:sync 把关）` : "";
  return { ...plan, fast: true, reason: `全部 ${changed.length} 条改动都落在包 ${[...packages].sort().join("、")} 的所有权推导集内${suffix}` };
}

/** 收窄时依次跑的 npm 脚本（⛔ 顺序即 fail-fast 顺序：先查生成物漂移，再查类型，最后跑测试）。 */
export const FAST_STEPS: readonly (readonly [string, readonly string[]])[] = [
  ["codegen:plugins --check", ["--workspace", "@game/server", "run", "codegen:plugins", "--", "--check"]],
  ["codegen:gameplays --check", ["--workspace", "@game/server", "run", "codegen:gameplays", "--", "--check"]],
  ["plugin -- check", ["--workspace", "@game/server", "run", "plugin", "--", "check"]],
  ["verify:webplatform-contract", ["run", "verify:webplatform-contract"]],
  ["verify:sync", ["run", "verify:sync"]],
  ["verify:project", ["run", "verify:project"]],
  ["verify:ecs", ["run", "verify:ecs"]],
  ["verify:vendor", ["run", "verify:vendor"]],
  ["verify:fgui", ["run", "verify:fgui"]],
  ["verify:protected-paths", ["run", "verify:protected-paths"]],
  ["verify:inventory", ["run", "verify:inventory"]],
  ["verify:perf", ["run", "verify:perf"]],
  ["typecheck", ["run", "typecheck"]],
  ["test:fgui", ["run", "test:fgui"]],
  ["test:client", ["run", "test:client"]],
];

export interface ChangedRunOptions {
  readonly root: string;
  readonly base?: string;
  /** 只打印计划，不跑任何东西。 */
  readonly dryRun?: boolean;
}

/** 跑收窄计划（或退回全量）；返回退出码。 */
export function runChanged(options: ChangedRunOptions): number {
  const root = path.resolve(options.root);
  const plan = planChanged(root, collectChangedPaths(root, options.base));
  console.log(`[plugin] changed：${plan.changed.length} 条改动 → ${plan.fast ? "收窄" : "全量"}`);
  console.log(`[plugin]   ${plan.reason}`);
  for (const entry of plan.undeducible) console.log(`[plugin]   ⚠ ${entry.id} 推导不出所有权集，其路径按宿主算：${entry.reason}`);
  if (options.dryRun === true) {
    if (plan.fast) console.log(`[plugin]   将跑 ${plan.tests.length} 个测试文件：${plan.tests.join(" ")}`);
    return 0;
  }
  if (!plan.fast) {
    runCommand(root, "npm", ["run", "verify:all"]);
    return 0;
  }
  for (const [label, args] of FAST_STEPS) {
    console.log(`[plugin]   ▶ ${label}`);
    runCommand(root, "npm", args);
  }
  console.log(`[plugin]   ▶ ${plan.tests.length} 个测试文件（包机制 + ${plan.packages.join("、")} 自有）`);
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...plan.tests], {
    cwd: path.join(root, "apps/server"),
    stdio: "inherit",
  });
  if (result.error) fail(`无法启动测试：${result.error.message}`);
  if (result.status !== 0) return result.status ?? 1;
  console.log("[plugin] changed 通过。⚠ 这是内循环收窄跑法，提交前仍应跑 npm run verify:all");
  return 0;
}
