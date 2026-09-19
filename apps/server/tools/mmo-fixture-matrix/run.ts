/**
 * MMO「框架侧完成」夹具矩阵（MMO MF11-B4；docs/MMO.md §10「框架侧完成」/ §12 MF11、docs/MMO-PLAN.md MF11-B4、Non-intrusive §10.7 夹具矩阵先例）。
 * `npm run verify:mmo-fixture-matrix`（根 package.json 直接 `node --import tsx` 本文件；⛔ 不进 verify:core：建一次性检出 + 两端 typecheck 约 2–4 分钟）。
 *
 * 命题：**worldFixture + kitfix + kitfixContent 在临时根只新增文件，即通过全部 check，且不改任何手写框架文件**。
 * 流程（一次性检出 = `scripts/lib/fixture-checkout.mjs` 的 git 可见文件副本 + git init 提交；node_modules 以符号链接接入，@game/* 指回检出自己的 workspace）：
 *  ① 基线：检出干净；`sync-client --check` 的既有问题行存档（入库 Cocos 镜像缺 .meta 的基线红项）；
 *  ② 物化 kitfix / kitfixContent（fixtures.ts；kitfixWorld 由 worldFixture 派生）→ **红证明**：两个 codegen 的 `--check` 必须转红并点名夹具（检查器看得见新包）；
 *  ③ `plugin -- pack` 两包 → 清掉树上的物化文件 → `plugin -- install <包目录>`（首装真流程：所有权冲突闸 / kit 依赖闸 / 贡献闸 / 写锁）；
 *  ④ writers：codegen:gameplays → codegen:plugins → sync:shared → sync:client；
 *  ⑤ 绿证明：两个 codegen `--check`、sync-shared `--check`、sync-client `--check` 增量（只允许夹具 / writer 路径的 .meta 行）、`plugin -- check`、
 *     protected-paths `--check`、verify-inventory、生成物登记（worldModeRegistry 分表 / kit 目录 / 贡献点 / PluginHost 依赖 / 锁）、两端 typecheck、
 *     K1 导入边界 + gameplay-codegen 双向同集 + 锁形态 + 客户端 K1 / protectedPaths 用例；
 *  ⑥ 分类：`git status` 每一项——新增 ⇒ 必须 ∈ 夹具所有权推导集（tools/plugin/ownership.ts `deriveOwnership` / `classifyPath`）∪ writer 生成物家族；
 *     修改 ⇒ 必须 ∈ writer 生成物家族（scripts/protected-paths.json generatedWriterOwned）；删除 ⇒ 红。任何手写框架文件被改 ⇒ 红；
 *  ⑦ 幂等：writers 再跑一遍，status 与全部文件 sha256 一字不差；
 *  ⑧ 反向控制（探测器自证）：a. 往 GameRoom.ts 追加一行 ⇒ 分类红 + protected-paths 红，回退后绿；b. 往已安装的 worker 注入 K1 违规 import ⇒
 *     kit-import-boundary 红 + `plugin -- check` 红（锁不符），回写原文后绿。
 * 报告：stdout 表 + `--report <file>`（缺省 docs/evidence/mmo-fixture-matrix/<时间戳>.json，按 .gitignore 政策只留本机）；`--keep` 保留检出供排查。
 * ⛔ 本矩阵不碰 Redis / MySQL：运行时行为（建房 / 准入 / 裁剪 / 聊天 / 交接 / 检查点）由 test/int 的 worldFixture / kitfix 用例覆盖，这里只证「只新增文件 + 全部 check」。
 */
import { createHash } from "node:crypto";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readTreePackageManifest, treeIdentityOf } from "../plugin/manifest";
import { classifyPath, deriveOwnership, protectedPathMatches, readGeneratedWriterPaths, readProtectedPaths, type OwnershipRule } from "../plugin/ownership";
import {
  FIXTURE_DIRS, FIXTURE_FILES_OUTSIDE_DIRS, KITFIX_CONTENT_ID, KITFIX_ID, KITFIX_WORLD_MODE_ID, materializeCreatorMeta, materializeFixtures,
} from "./fixtures";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const COCOS_SRC = "apps/Cocos/assets/src";
/** 仓里 gitignored、但 typecheck include 面引用的构建产物（一次性检出缺它们会得到与仓不同的红）。 */
const IGNORED_BUILD_INPUTS: readonly string[] = ["apps/client/src/ui-uniflex/generated"];
const CLIENT_SRC = "apps/client/src";

interface Args { readonly keep: boolean; readonly report: string | null }

function parseArgs(argv: readonly string[]): Args {
  let keep = false;
  let report: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--keep") keep = true;
    else if (arg === "--report") {
      const value = argv[++index];
      if (!value) throw new Error("--report 需要一个文件路径");
      report = path.resolve(value);
    } else throw new Error(`未知参数：${arg}`);
  }
  return { keep, report };
}

interface StepResult { readonly name: string; readonly ok: boolean; readonly detail: string; readonly ms: number }

class Matrix {
  readonly steps: StepResult[] = [];
  failed = 0;

  /** 记录一项检查（不中断后续）。 */
  check(name: string, fn: () => string): boolean {
    const started = Date.now();
    try {
      const detail = fn();
      this.steps.push({ name, ok: true, detail, ms: Date.now() - started });
      console.log(`✔ ${name}${detail ? ` — ${detail}` : ""}`);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.steps.push({ name, ok: false, detail, ms: Date.now() - started });
      this.failed += 1;
      console.log(`✖ ${name} — ${detail.split("\n").slice(0, 12).join("\n    ")}`);
      return false;
    }
  }

  /** 门步骤：失败即抛（后续步骤没有意义）。 */
  must(name: string, fn: () => string): void {
    if (!this.check(name, fn)) throw new Error(`门步骤失败：${name}`);
  }
}

interface Ran { readonly code: number; readonly out: string }

function run(cmd: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = {}): Ran {
  const result: SpawnSyncReturns<string> = spawnSync(cmd, [...args], {
    cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...env },
  });
  if (result.error) throw result.error;
  return { code: result.status ?? -1, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function expectOk(ran: Ran, label: string): string {
  if (ran.code !== 0) throw new Error(`${label} 退出码 ${ran.code}：\n${tail(ran.out)}`);
  return "";
}

function expectRed(ran: Ran, label: string, mention: string): string {
  if (ran.code === 0) throw new Error(`${label} 本应转红却绿了`);
  if (!ran.out.includes(mention)) throw new Error(`${label} 红了但没有点名 "${mention}"：\n${tail(ran.out)}`);
  return `退出码 ${ran.code}，点名 ${mention}`;
}

function tail(text: string, lines = 30): string {
  const all = text.trimEnd().split("\n");
  // node:test 输出先摘失败用例名（not ok / ✖ / 汇总行），再附尾巴
  const failures = all.filter((line) => /^(not ok|# (pass|fail|tests))|^\s*✖/u.test(line));
  return [...failures, "…", ...all.slice(Math.max(0, all.length - lines))].join("\n");
}

const sha256 = (file: string): string => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** node_modules 接入检出：逐顶层条目符号链接到仓的 node_modules，`@game/*` 改指检出自己的 workspace（否则类型 / 生成物会读到仓而不是检出）。 */
function linkNodeModules(repoRoot: string, root: string): string {
  const source = path.join(repoRoot, "node_modules");
  const target = path.join(root, "node_modules");
  fs.mkdirSync(target);
  let linked = 0;
  for (const entry of fs.readdirSync(source)) {
    if (entry === "@game") {
      fs.mkdirSync(path.join(target, "@game"));
      fs.symlinkSync("../../apps/shared", path.join(target, "@game/shared"));
      fs.symlinkSync("../../apps/server", path.join(target, "@game/server"));
      continue;
    }
    fs.symlinkSync(path.join(source, entry), path.join(target, entry));
    linked += 1;
  }
  const serverModules = path.join(repoRoot, "apps/server/node_modules");
  if (fs.existsSync(serverModules)) fs.symlinkSync(serverModules, path.join(root, "apps/server/node_modules"));
  // 检出自己的 git 只认仓的 .gitignore（根 node_modules 已忽略）；workspace 级链接按本地排除登记，⛔ 进 status
  fs.appendFileSync(path.join(root, ".git/info/exclude"), "node_modules\napps/server/node_modules\n");
  // gitignored 构建产物：UniFlex 生成物（build:uniflex-ui）不在 git 可见文件里，客户端 typecheck 的 include 面却引用它——照仓复制一份（只读输入，⛔ 被测对象）
  let copied = 0;
  for (const relative of IGNORED_BUILD_INPUTS) {
    const from = path.join(repoRoot, relative);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(root, relative), { recursive: true });
    copied += 1;
  }
  return `${linked} 个顶层包 + @game/{shared,server} → 检出 workspace；复制 gitignored 构建产物 ${copied} 处`;
}

interface StatusEntry { readonly xy: string; readonly path: string }

function gitStatus(root: string): StatusEntry[] {
  const raw = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (raw.status !== 0) throw new Error(`git status 失败：${raw.stderr}`);
  const entries: StatusEntry[] = [];
  const parts = raw.stdout.split("\0").filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] as string;
    const xy = part.slice(0, 2);
    const file = part.slice(3);
    if (xy[0] === "R" || xy[0] === "C") index += 1; // 改名 / 复制带第二个路径
    entries.push({ xy, path: file });
  }
  return entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/** sync-client --check 的问题行（`  - …`）。 */
function syncClientProblems(root: string): { readonly code: number; readonly lines: readonly string[] } {
  const ran = run(process.execPath, ["scripts/sync-client.mjs", "--check"], root);
  return { code: ran.code, lines: ran.out.split("\n").filter((line) => /^\s+- /u.test(line)).map((line) => line.trim()) };
}

interface Classifier {
  readonly rules: readonly OwnershipRule[];
  readonly protectedPaths: readonly string[];
  readonly writerPaths: readonly string[];
}

function loadClassifier(root: string): Classifier {
  const rules: OwnershipRule[] = [];
  for (const id of [KITFIX_ID, KITFIX_CONTENT_ID]) {
    const manifest = readTreePackageManifest(root, id);
    if (!manifest) throw new Error(`树上读不到包 ${id} 的清单`);
    rules.push(...deriveOwnership(treeIdentityOf(root, manifest)));
  }
  return {
    rules,
    protectedPaths: readProtectedPaths(root),
    // Cocos 镜像整目录条目不算 provenance：镜像按其客户端真源路径再判（真源自己会以 M / ?? 出现）。
    // 已安装锁 scripts/packages/<id>.lock 由 `plugin install` 写出（readGeneratedWriterPaths 刻意不含锁目录），这里作为安装器 provenance 显式加回。
    writerPaths: [...readGeneratedWriterPaths(root).filter((entry) => entry !== `${COCOS_SRC}/**`), "scripts/packages/**"],
  };
}

const sourceOfMirror = (relative: string): string =>
  relative === COCOS_SRC || relative.startsWith(`${COCOS_SRC}/`) ? `${CLIENT_SRC}${relative.slice(COCOS_SRC.length)}` : relative;

function writerOwned(classifier: Classifier, relative: string): boolean {
  const source = sourceOfMirror(relative);
  return classifier.writerPaths.some((entry) => protectedPathMatches(relative, entry) || protectedPathMatches(source, entry));
}

interface Verdict { readonly path: string; readonly xy: string; readonly bucket: "fixture" | "writer" | "violation"; readonly reason: string }

/** 分类一份 git status：新增 ⇒ 夹具所有权 ∪ writer；修改 ⇒ writer；其余 ⇒ 违规。 */
function classifyStatus(entries: readonly StatusEntry[], classifier: Classifier): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const entry of entries) {
    const added = entry.xy === "??" || entry.xy === "A ";
    const modified = entry.xy === " M" || entry.xy === "M " || entry.xy === "MM";
    if (writerOwned(classifier, entry.path) && (added || modified)) {
      verdicts.push({ path: entry.path, xy: entry.xy, bucket: "writer", reason: "generatedWriterOwned" });
      continue;
    }
    if (added) {
      const verdict = classifyPath(entry.path, classifier.rules, classifier.protectedPaths);
      verdicts.push(verdict.allowed
        ? { path: entry.path, xy: entry.xy, bucket: "fixture", reason: verdict.reason }
        : { path: entry.path, xy: entry.xy, bucket: "violation", reason: `新增文件不在夹具所有权推导集内：${verdict.reason}` });
      continue;
    }
    verdicts.push({ path: entry.path, xy: entry.xy, bucket: "violation", reason: modified ? "手写文件被修改（不是 writer 生成物）" : `状态 ${entry.xy} 不允许` });
  }
  return verdicts;
}

function assertNoViolation(verdicts: readonly Verdict[]): string {
  const violations = verdicts.filter((verdict) => verdict.bucket === "violation");
  if (violations.length > 0) {
    throw new Error(`${violations.length} 项违规：\n${violations.map((v) => `  ${v.xy} ${v.path} — ${v.reason}`).join("\n")}`);
  }
  const fixture = verdicts.filter((v) => v.bucket === "fixture").length;
  const writer = verdicts.filter((v) => v.bucket === "writer").length;
  return `夹具新增 ${fixture} / writer 生成物 ${writer} / 违规 0`;
}

function snapshotHashes(root: string, entries: readonly StatusEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const file = path.join(root, entry.path);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) map.set(entry.path, sha256(file));
  }
  return map;
}

function assertFileIncludes(root: string, relative: string, needles: readonly string[]): string {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`缺少 ${relative}`);
  const text = fs.readFileSync(file, "utf8");
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length > 0) throw new Error(`${relative} 缺少：${missing.join(" / ")}`);
  return `${relative} 含 ${needles.join(" / ")}`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const checkoutModule = await import(pathToFileURL(path.join(REPO_ROOT, "scripts/lib/fixture-checkout.mjs")).href) as {
    buildCheckout(options: { prefix: string; gitCommit?: boolean; repoRoot?: string }): string;
    removeFixtureSync(root: string): void;
  };
  const matrix = new Matrix();
  const startedAt = new Date();
  console.log(`[mmo-fixture-matrix] 仓 ${REPO_ROOT}`);
  const root = checkoutModule.buildCheckout({ prefix: "mmo-fixture-matrix-", gitCommit: true, repoRoot: REPO_ROOT });
  console.log(`[mmo-fixture-matrix] 检出 ${root}`);
  const server = path.join(root, "apps/server");
  const tsx = (cwd: string, ...rest: string[]): Ran => run(process.execPath, ["--import", "tsx", ...rest], cwd);
  const plugin = (...rest: string[]): Ran => tsx(server, "tools/plugin/cli.ts", ...rest, "--root", root);
  const codegenGameplays = (...rest: string[]): Ran => tsx(server, "tools/gameplay-codegen/cli.ts", ...rest);
  const codegenPlugins = (...rest: string[]): Ran => tsx(server, "tools/plugin-codegen/cli.ts", ...rest);
  const tsc = (cwd: string, ...rest: string[]): Ran => run(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), ...rest], cwd);
  // 用例文件串行跑：有的用例在树内临时物化包（并发时会被 gameplay-codegen 的 freshness 用例读到）
  const nodeTest = (cwd: string, ...files: string[]): Ran => tsx(cwd, "--test", "--test-concurrency=1", ...files);
  const runWriters = (): void => {
    expectOk(codegenGameplays(), "codegen:gameplays");
    expectOk(codegenPlugins(), "codegen:plugins");
    expectOk(run(process.execPath, ["scripts/sync-shared.mjs"], root), "sync:shared");
    expectOk(run(process.execPath, ["scripts/sync-client.mjs"], root), "sync:client");
  };
  let report: Record<string, unknown> = {};
  try {
    matrix.must("node_modules 接入检出", () => linkNodeModules(REPO_ROOT, root));
    // ① 基线
    matrix.must("基线：检出干净", () => {
      const entries = gitStatus(root);
      if (entries.length > 0) throw new Error(`检出不干净：${entries.map((e) => `${e.xy} ${e.path}`).join(", ")}`);
      return "git status 空";
    });
    const baselineSync = syncClientProblems(root);
    matrix.check("基线：sync-client --check 既有问题行存档", () => `${baselineSync.lines.length} 行（退出码 ${baselineSync.code}；入库镜像缺 .meta 的基线红项，⛔ 本矩阵不裁决）`);
    // ② 物化 + 红证明
    let materialized: readonly string[] = [];
    matrix.must("物化 kitfix + kitfixContent（kitfixWorld 由 worldFixture 派生）", () => {
      materialized = materializeFixtures(root).files;
      return `${materialized.length} 个文件`;
    });
    matrix.check("红证明：codegen:gameplays --check 看见新玩法即红", () => expectRed(codegenGameplays("--check"), "codegen:gameplays --check", KITFIX_WORLD_MODE_ID));
    matrix.check("红证明：codegen:plugins --check 看见新包即红", () => expectRed(codegenPlugins("--check"), "codegen:plugins --check", KITFIX_ID));
    // ③ 镜像 → pack → 清树 → install
    matrix.must("镜像同步供打包（pack 要求客户端文件的 Cocos 镜像在场）", () => {
      expectOk(run(process.execPath, ["scripts/sync-shared.mjs"], root), "sync:shared");
      expectOk(run(process.execPath, ["scripts/sync-client.mjs"], root), "sync:client");
      const metas = materializeCreatorMeta(root);
      return `镜像就绪；合成 Creator .meta ${metas.length} 份（${metas.join(", ")}）`;
    });
    const packages = fs.mkdtempSync(path.join(path.dirname(root), ".tmp-fixture-mmo-fixture-matrix-pkg-"));
    matrix.must("plugin -- pack kitfix / kitfixContent（从物化树打包）", () => {
      expectOk(plugin("pack", KITFIX_ID, "--out-dir", path.join(packages, KITFIX_ID)), "pack kitfix");
      expectOk(plugin("pack", KITFIX_CONTENT_ID, "--out-dir", path.join(packages, KITFIX_CONTENT_ID)), "pack kitfixContent");
      const count = (dir: string): number => fs.readdirSync(dir, { recursive: true }).filter((entry) => fs.statSync(path.join(dir, String(entry))).isFile()).length;
      return `kitfix ${count(path.join(packages, KITFIX_ID))} 文件 / kitfixContent ${count(path.join(packages, KITFIX_CONTENT_ID))} 文件`;
    });
    matrix.must("清树回到 pristine（首装前推导集内不得已有文件）", () => {
      expectOk(run("git", ["reset", "--hard", "-q"], root), "git reset --hard");
      expectOk(run("git", ["clean", "-fdq"], root), "git clean -fd");
      const entries = gitStatus(root);
      if (entries.length > 0) throw new Error(`清理后仍有：${entries.map((e) => `${e.xy} ${e.path}`).join(", ")}`);
      for (const dir of FIXTURE_DIRS) if (fs.existsSync(path.join(root, dir))) throw new Error(`仍存在 ${dir}`);
      for (const file of FIXTURE_FILES_OUTSIDE_DIRS) if (fs.existsSync(path.join(root, file))) throw new Error(`仍存在 ${file}`);
      return "git status 空，夹具目录全部消失";
    });
    matrix.must("plugin -- install kitfix（首装：所有权 / 依赖 / 贡献闸 + 写锁）", () =>
      expectOk(plugin("install", path.join(packages, KITFIX_ID), "--no-git", "--no-postinstall"), "install kitfix") || "scripts/packages/kitfix.lock");
    matrix.must("plugin -- install kitfixContent（requires.kits + contributes 闸）", () =>
      expectOk(plugin("install", path.join(packages, KITFIX_CONTENT_ID), "--no-git", "--no-postinstall"), "install kitfixContent") || "scripts/packages/kitfixContent.lock");
    matrix.check("安装只新增了包文件与锁", () => {
      const entries = gitStatus(root);
      const bad = entries.filter((e) => e.xy !== "??");
      if (bad.length > 0) throw new Error(`安装改了已跟踪文件：${bad.map((e) => `${e.xy} ${e.path}`).join(", ")}`);
      const locks = entries.filter((e) => e.path.startsWith("scripts/packages/")).map((e) => e.path);
      if (locks.length !== 2) throw new Error(`锁文件应为 2 个，实际 ${locks.join(", ")}`);
      return `${entries.length} 个新增（含 ${locks.join(" / ")}）`;
    });
    // ④ writers
    matrix.must("writers：codegen:gameplays → codegen:plugins → sync:shared → sync:client", () => { runWriters(); return ""; });
    // ⑤ 绿证明
    matrix.check("绿证明：codegen:gameplays --check", () => expectOk(codegenGameplays("--check"), "codegen:gameplays --check"));
    matrix.check("绿证明：codegen:plugins --check", () => expectOk(codegenPlugins("--check"), "codegen:plugins --check"));
    matrix.check("绿证明：sync-shared --check", () => expectOk(run(process.execPath, ["scripts/sync-shared.mjs", "--check"], root), "sync-shared --check"));
    const classifier = loadClassifier(root);
    matrix.check("绿证明：sync-client --check 增量只有夹具 / writer 镜像目录的 .meta 行", () => {
      const after = syncClientProblems(root);
      const baseline = new Set(baselineSync.lines);
      const added = after.lines.filter((line) => !baseline.has(line));
      const removed = baselineSync.lines.filter((line) => !new Set(after.lines).has(line));
      const offending: string[] = [];
      for (const line of added) {
        const match = /：([^（\s]+)/u.exec(line);
        const relative = match ? `${COCOS_SRC}/${match[1]!.replace(/\/$/u, "")}` : null;
        const okPath = relative !== null && (writerOwned(classifier, relative) || classifyPath(relative, classifier.rules, classifier.protectedPaths).allowed);
        if (!line.includes(".meta") || !okPath) offending.push(line);
      }
      if (offending.length > 0) throw new Error(`增量里有非 .meta 或越界行：\n${offending.join("\n")}`);
      return `新增 ${added.length} 行（全部 .meta，落在夹具 / writer 镜像目录）/ 消失 ${removed.length} 行`;
    });
    matrix.check("绿证明：plugin -- check（锁 / 所有权 / 依赖 / 贡献持续核对）", () => expectOk(plugin("check"), "plugin check"));
    matrix.check("绿证明：protected-paths --check（手写受保护文件零改动）", () => expectOk(run(process.execPath, ["scripts/protected-paths-lock.mjs", "--check", "--root", root], root), "protected-paths --check"));
    matrix.check("绿证明：verify-inventory（kit / plugin fragment 与中央清单）", () => expectOk(run(process.execPath, ["scripts/verify-inventory.mjs", "--root", root], root), "verify-inventory"));
    matrix.check("登记：worldModeRegistry 分表含 kitfixWorld", () =>
      assertFileIncludes(root, "apps/server/src/rooms/modes/catalog.generated.ts", ["registerKitfixWorldWorldMode", `"${KITFIX_WORLD_MODE_ID}"`]));
    matrix.check("登记：kit 目录含 kitfix（worker + role:world-event）", () =>
      assertFileIncludes(root, "apps/server/src/kits/catalog.generated.ts", [`"${KITFIX_ID}"`, "world-event", "grant"]));
    matrix.check("登记：贡献点 grants 收到 kitfixContent 的 data", () =>
      assertFileIncludes(root, `apps/server/src/kits/${KITFIX_ID}/contributions.generated.ts`, [`"${KITFIX_CONTENT_ID}"`, `"loot"`]));
    matrix.check("登记：shared 玩法 catalog 含 kitfixWorld", () =>
      assertFileIncludes(root, "apps/shared/src/gameplays/catalog.generated.ts", [KITFIX_WORLD_MODE_ID]));
    matrix.check("登记：PluginHost 装载 kitfixContent（kitfix 无客户端 entry ⇒ 不是装载单元，依赖边不渲染）", () =>
      assertFileIncludes(root, "apps/client/src/generated/plugins.generated.ts", [`"${KITFIX_CONTENT_ID}"`]));
    matrix.check("登记：中央 docs/inventory.json 未被触碰", () => {
      const entry = gitStatus(root).find((e) => e.path === "docs/inventory.json");
      if (entry) throw new Error(`docs/inventory.json 状态 ${entry.xy}`);
      return "未变";
    });
    matrix.check("typecheck：服务端（含夹具 mode / worker / 检查点端口）", () => expectOk(tsc(server, "--noEmit"), "tsc server"));
    matrix.check("typecheck：客户端 tsconfig.test.json（含夹具 client module / plugin entry）", () => expectOk(tsc(root, "-p", "apps/client/tsconfig.test.json", "--noEmit"), "tsc client"));
    // gameplay-codegen 里两条用例以「真仓当前没有 canonical world mode」为前提（MF4-B2 / MF5a-B1 的字节快照断言）；本矩阵的树刻意有一个，
    // 跳过这两条（其余含「modes/ 目录双向同集」照跑）——mmo kit 落地时这两条本身要改成夹具根内断言（docs/MMO.md §12 MF11 偏差）。
    matrix.check("用例：K1 导入边界 + gameplay-codegen 双向同集 + 锁形态（检出内；跳过两条「真仓无 canonical world mode」前提用例）", () =>
      expectOk(nodeTest(server, "--test-skip-pattern=^(MF4-B2|MF5a-B1) 生成", "test/kit-import-boundary.test.ts", "test/gameplay-codegen.test.ts", "test/plugin-lock.test.ts"), "server tests"));
    matrix.check("用例：客户端 K1 + protectedPaths（检出内）", () =>
      expectOk(nodeTest(server, "../client/test/kitImportBoundary.test.ts", "../client/test/protectedPaths.test.ts"), "client tests"));
    // ⑥ 分类
    const verdicts = classifyStatus(gitStatus(root), classifier);
    matrix.check("分类：新增 ⊆ 夹具所有权 ∪ writer；修改 ⊆ writer；无删除", () => assertNoViolation(verdicts));
    // ⑦ 幂等
    matrix.check("幂等：writers 再跑一遍，status 与 sha256 一字不差", () => {
      const before = gitStatus(root);
      const hashesBefore = snapshotHashes(root, before);
      runWriters();
      const after = gitStatus(root);
      const hashesAfter = snapshotHashes(root, after);
      const statusDiff = JSON.stringify(before) !== JSON.stringify(after);
      const changed = [...hashesBefore.keys()].filter((key) => hashesBefore.get(key) !== hashesAfter.get(key));
      if (statusDiff || changed.length > 0) throw new Error(`不幂等：status 变化 ${statusDiff}，内容变化 ${changed.join(", ")}`);
      return `${after.length} 项 / ${hashesAfter.size} 份 sha256 相同`;
    });
    // ⑧ 反向控制
    matrix.check("反向控制 a：改一行 GameRoom.ts ⇒ 分类红 + protected-paths 红，回退后绿", () => {
      const relative = "apps/server/src/rooms/GameRoom.ts";
      const file = path.join(root, relative);
      fs.appendFileSync(file, "\n// mmo-fixture-matrix negative control\n");
      try {
        const red = classifyStatus(gitStatus(root), classifier).filter((v) => v.bucket === "violation");
        if (red.length !== 1 || red[0]!.path !== relative) throw new Error(`分类应恰好点名 ${relative}，实际 ${JSON.stringify(red)}`);
        const lock = run(process.execPath, ["scripts/protected-paths-lock.mjs", "--check", "--root", root], root);
        if (lock.code === 0) throw new Error("protected-paths --check 本应转红");
      } finally {
        expectOk(run("git", ["checkout", "--", relative], root), "git checkout GameRoom.ts");
      }
      assertNoViolation(classifyStatus(gitStatus(root), classifier));
      return "分类点名 GameRoom.ts；protected-paths 红；回退后绿";
    });
    matrix.check("反向控制 b：往已安装 worker 注入 K1 违规 import ⇒ kit-import-boundary 红 + plugin check 红，回写后绿", () => {
      const relative = `apps/server/src/kits/${KITFIX_ID}/workers/grant.ts`;
      const file = path.join(root, relative);
      const original = fs.readFileSync(file);
      fs.writeFileSync(file, `import { getPool } from "../../../core/infra/mysql";\nvoid getPool;\n${original.toString("utf8")}`);
      try {
        const boundary = nodeTest(server, "test/kit-import-boundary.test.ts");
        if (boundary.code === 0) throw new Error("kit-import-boundary 本应转红");
        const check = plugin("check");
        if (check.code === 0 || !check.out.includes(relative)) throw new Error(`plugin check 本应点名 ${relative}：\n${tail(check.out)}`);
      } finally {
        fs.writeFileSync(file, original);
      }
      expectOk(nodeTest(server, "test/kit-import-boundary.test.ts"), "kit-import-boundary 回写后");
      expectOk(plugin("check"), "plugin check 回写后");
      return "两道闸都点名 grant.ts；回写后绿";
    });
    report = {
      startedAt: startedAt.toISOString(), repoRoot: REPO_ROOT, checkout: root, materialized, verdicts, steps: matrix.steps,
      failed: matrix.failed, ok: matrix.failed === 0,
    };
  } catch (error) {
    report = { startedAt: startedAt.toISOString(), repoRoot: REPO_ROOT, checkout: root, steps: matrix.steps, failed: matrix.failed + 1, ok: false, aborted: error instanceof Error ? error.message : String(error) };
    console.log(`✖ 中止：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    const reportFile = args.report ?? path.join(REPO_ROOT, "docs/evidence/mmo-fixture-matrix", `${startedAt.toISOString().replace(/[:.]/gu, "").slice(0, 17)}.json`);
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[mmo-fixture-matrix] 报告 ${reportFile}`);
    if (args.keep) console.log(`[mmo-fixture-matrix] --keep：检出保留在 ${root}`);
    else {
      checkoutModule.removeFixtureSync(root);
      for (const entry of fs.readdirSync(path.dirname(root))) {
        if (entry.startsWith(".tmp-fixture-mmo-fixture-matrix-pkg-")) fs.rmSync(path.join(path.dirname(root), entry), { recursive: true, force: true });
      }
    }
  }
  const ok = report.ok === true;
  console.log(ok ? `[mmo-fixture-matrix] ✔ 全部 ${matrix.steps.length} 步通过` : `[mmo-fixture-matrix] ✖ ${String(report.failed)} 步失败`);
  return ok ? 0 : 1;
}

main().then((code) => { process.exitCode = code; }, (error) => {
  console.error(error);
  process.exitCode = 1;
});
