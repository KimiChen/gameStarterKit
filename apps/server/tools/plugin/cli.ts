/**
 * 插件命令（workspace 脚本，⛔ 不新增根命令）：
 *   npm --workspace @game/server run plugin -- pack <id> (--out <zip> | --out-dir <dir>)
 *   npm --workspace @game/server run plugin -- install <zip|dir> [--allow-downgrade] [--replace-local-fork] [--break-dependents] [--no-git] [--no-postinstall] [--dry-run]
 *   npm --workspace @game/server run plugin -- install --reinstall-from-tree <id> [--allow-identity-change] [--adopt-tracked] [--allow-downgrade] [--break-dependents] [--no-git] [--no-postinstall] [--dry-run]
 *   npm --workspace @game/server run plugin -- uninstall <id> [--force] [--drop-data] [--no-git] [--no-postinstall] [--dry-run]
 *   npm --workspace @game/server run plugin -- check
 *   npm --workspace @game/server run plugin -- test <id> [--int]
 * 全部子命令接受 --root <dir>（测试 fixture seam）。包 = 插件（apps/plugins/<id>/plugin.json）或 kit（apps/kits/<id>/kit.json，docs/KIT.md）。
 *
 * 设计基线见 docs/PLUGIN.md §5；判据与推导见 tools/plugin/ownership.ts。
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { checkInstalledPlugins } from "./check";
import { dropKitData } from "./dropData";
import { installPlugin, reinstallFromTree, type InstallReport } from "./install";
import { packPlugin } from "./pack";
import { runPackageTests } from "./test";
import { uninstallPlugin } from "./uninstall";

const TOOL_REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export type PluginCliArguments =
  | { readonly command: "pack"; readonly root: string; readonly id: string; readonly outFile?: string; readonly outDir?: string }
  | { readonly command: "install"; readonly root: string; readonly source: string; readonly allowDowngrade: boolean; readonly git: boolean; readonly postinstall: boolean; readonly dryRun: boolean; readonly replaceLocalFork: boolean; readonly breakDependents: boolean }
  | { readonly command: "reinstall-from-tree"; readonly root: string; readonly id: string; readonly allowDowngrade: boolean; readonly git: boolean; readonly postinstall: boolean; readonly dryRun: boolean; readonly allowIdentityChange: boolean; readonly adoptTracked: boolean; readonly breakDependents: boolean }
  | { readonly command: "uninstall"; readonly root: string; readonly id: string; readonly force: boolean; readonly git: boolean; readonly postinstall: boolean; readonly dryRun: boolean; readonly dropData: boolean }
  | { readonly command: "check"; readonly root: string }
  | { readonly command: "test"; readonly root: string; readonly id: string; readonly int: boolean };

const USAGE = [
  "用法：npm --workspace @game/server run plugin -- <pack|install|uninstall|check|test> …",
  "  pack <id> (--out <zip> | --out-dir <dir>)",
  "  install <zip|dir> [--allow-downgrade] [--replace-local-fork] [--break-dependents] [--no-git] [--no-postinstall] [--dry-run]",
  "  install --reinstall-from-tree <id> [--allow-identity-change] [--adopt-tracked] [--allow-downgrade] [--break-dependents] [--no-git] [--no-postinstall] [--dry-run]（同仓作者迭代：以工作树重写已安装锁）",
  "  uninstall <id> [--force] [--drop-data] [--no-git] [--no-postinstall] [--dry-run]（--drop-data 仅 kit：按账本 + 表前缀 drop 表并清理 kt: 键）",
  "  check",
  "  test <id> [--int]（按锁枚举包自带测试单跑）",
  "  （均可带 --root <dir>；包 = 插件 apps/plugins/<id> 或 kit apps/kits/<id>）",
].join("\n");

export function parseCli(argv: readonly string[]): PluginCliArguments {
  const [command, ...rest] = argv;
  let root = TOOL_REPOSITORY_ROOT;
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--root" || arg === "--out" || arg === "--out-dir") {
      const value = rest[++index];
      if (!value) throw new Error(`${arg} 需要一个值`);
      if (flags.has(arg)) throw new Error(`duplicate argument: ${arg}`);
      flags.set(arg, value);
    } else if (arg.startsWith("--")) {
      if (flags.has(arg)) throw new Error(`duplicate argument: ${arg}`);
      flags.set(arg, true);
    } else {
      positional.push(arg);
    }
  }
  const rootFlag = flags.get("--root");
  if (typeof rootFlag === "string") root = path.resolve(rootFlag);
  const known = (allowed: readonly string[]): void => {
    for (const flag of flags.keys()) {
      if (flag !== "--root" && !allowed.includes(flag)) throw new Error(`unknown argument: ${flag}\n${USAGE}`);
    }
  };
  if (command === "pack") {
    known(["--out", "--out-dir"]);
    if (positional.length !== 1) throw new Error(`pack 需要且只需要一个 <id>\n${USAGE}`);
    const outFile = flags.get("--out");
    const outDir = flags.get("--out-dir");
    return {
      command: "pack",
      root,
      id: positional[0],
      ...(typeof outFile === "string" ? { outFile } : {}),
      ...(typeof outDir === "string" ? { outDir } : {}),
    };
  }
  if (command === "install") {
    known(["--allow-downgrade", "--no-git", "--no-postinstall", "--dry-run", "--reinstall-from-tree", "--allow-identity-change", "--adopt-tracked", "--replace-local-fork", "--break-dependents"]);
    if (flags.has("--reinstall-from-tree")) {
      if (flags.has("--replace-local-fork")) throw new Error(`--replace-local-fork 只对 install <zip|dir> 有效（从树重装本身就是在写分叉）\n${USAGE}`);
      if (positional.length !== 1) throw new Error(`install --reinstall-from-tree 需要且只需要一个已安装插件 <id>\n${USAGE}`);
      if (positional[0].includes("/") || positional[0].endsWith(".zip")) throw new Error(`install --reinstall-from-tree 的参数是插件 id，不是包路径：${positional[0]}\n${USAGE}`);
      return {
        command: "reinstall-from-tree",
        root,
        id: positional[0],
        allowDowngrade: flags.has("--allow-downgrade"),
        git: !flags.has("--no-git"),
        postinstall: !flags.has("--no-postinstall"),
        dryRun: flags.has("--dry-run"),
        allowIdentityChange: flags.has("--allow-identity-change"),
        adoptTracked: flags.has("--adopt-tracked"),
        breakDependents: flags.has("--break-dependents"),
      };
    }
    for (const flag of ["--allow-identity-change", "--adopt-tracked"]) {
      if (flags.has(flag)) throw new Error(`${flag} 只对 install --reinstall-from-tree 有效\n${USAGE}`);
    }
    if (positional.length !== 1) throw new Error(`install 需要且只需要一个 <zip|dir>\n${USAGE}`);
    return {
      command: "install",
      root,
      source: path.resolve(positional[0]),
      allowDowngrade: flags.has("--allow-downgrade"),
      git: !flags.has("--no-git"),
      postinstall: !flags.has("--no-postinstall"),
      dryRun: flags.has("--dry-run"),
      replaceLocalFork: flags.has("--replace-local-fork"),
      breakDependents: flags.has("--break-dependents"),
    };
  }
  if (command === "uninstall") {
    known(["--force", "--no-git", "--no-postinstall", "--dry-run", "--drop-data"]);
    if (positional.length !== 1) throw new Error(`uninstall 需要且只需要一个 <id>\n${USAGE}`);
    return {
      command: "uninstall",
      root,
      id: positional[0],
      force: flags.has("--force"),
      git: !flags.has("--no-git"),
      postinstall: !flags.has("--no-postinstall"),
      dryRun: flags.has("--dry-run"),
      dropData: flags.has("--drop-data"),
    };
  }
  if (command === "check") {
    known([]);
    if (positional.length !== 0) throw new Error(`check 不接受位置参数\n${USAGE}`);
    return { command: "check", root };
  }
  if (command === "test") {
    known(["--int"]);
    if (positional.length !== 1) throw new Error(`test 需要且只需要一个已安装包 <id>\n${USAGE}`);
    return { command: "test", root, id: positional[0], int: flags.has("--int") };
  }
  throw new Error(USAGE);
}

function printAllowDelete(allowDelete: { readonly gameplays: readonly string[]; readonly plugins: readonly string[] }): void {
  if (allowDeleteCount(allowDelete) === 0) return;
  console.log(`[plugin]   升级删除面 → codegen --allow-delete：gameplays ${allowDelete.gameplays.join(", ") || "-"}；plugins ${allowDelete.plugins.join(", ") || "-"}`);
}

function allowDeleteCount(allowDelete: { readonly gameplays: readonly string[]; readonly plugins: readonly string[] }): number {
  return allowDelete.gameplays.length + allowDelete.plugins.length;
}

/** source 变迁与 uuid 变化：都是宿主该看一眼的事实（不拦，只讲清）。 */
function printProvenance(report: InstallReport): void {
  const before = report.previousSource?.kind ?? (report.previousVersion === null ? null : "unknown");
  if (before !== null && before !== report.source.kind) console.log(`[plugin]   锁来源变迁：${before} → ${report.source.kind}`);
  else if (before === "tree" && report.source.kind === "tree" && report.adopted === undefined) console.log("[plugin]   锁来源：仍是本地分叉（tree）——与分叉内容相同的包不改变来源，--replace-local-fork 才改标为 package");
  for (const change of report.uuidChanged) console.log(`[plugin]   ⚠ 同路径 .meta 的 uuid 变了（Creator 视为另一个资源，宿主对它的引用会断）：${change.path} ${change.from} → ${change.to}`);
  for (const relative of report.adopted?.review ?? []) console.log(`[plugin]   ⚠ 吸收了共享命名空间里的新文件（未跟踪即吸收）：${relative}——请确认它确属本插件`);
  for (const broken of report.brokenDependents) console.log(`[plugin]   ⚠ --break-dependents 放行，已破坏依赖：${broken}（plugin -- check 会红，需各自升级）`);
}

export async function runCli(args: PluginCliArguments): Promise<number> {
  if (args.command === "pack") {
    const result = packPlugin({ root: args.root, id: args.id, ...(args.outFile ? { outFile: args.outFile } : {}), ...(args.outDir ? { outDir: args.outDir } : {}) });
    console.log(`[plugin] packed ${result.manifest.id}@${result.manifest.version}: ${result.entries.length} files → ${result.output}`);
    if (result.skipped.length > 0) console.log(`[plugin] ⚠ 跳过不可随包分发的文件（生成物/硬排除）：${result.skipped.join(", ")}`);
    return 0;
  }
  if (args.command === "install") {
    const report = installPlugin({ root: args.root, source: args.source, allowDowngrade: args.allowDowngrade, git: args.git, postinstall: args.postinstall, dryRun: args.dryRun, replaceLocalFork: args.replaceLocalFork, breakDependents: args.breakDependents });
    const verb = report.previousVersion ? `upgraded ${report.previousVersion} → ${report.version}` : `installed ${report.version}`;
    console.log(`[plugin] ${args.dryRun ? "(dry-run) " : ""}${report.id}: ${verb}; written ${report.written.length}, unchanged ${report.unchanged.length}, deleted ${report.deleted.length}`);
    for (const relative of report.deleted) console.log(`[plugin]   deleted ${relative}`);
    printAllowDelete(report.allowDelete);
    printProvenance(report);
    console.log("[plugin] 下一步（人工）：");
    for (const step of report.nextSteps) console.log(`[plugin]   - ${step}`);
    return 0;
  }
  if (args.command === "reinstall-from-tree") {
    const report = reinstallFromTree({ root: args.root, id: args.id, allowDowngrade: args.allowDowngrade, git: args.git, postinstall: args.postinstall, dryRun: args.dryRun, allowIdentityChange: args.allowIdentityChange, adoptTracked: args.adoptTracked, breakDependents: args.breakDependents });
    const adopted = report.adopted ?? { added: [], changed: [] };
    console.log(`[plugin] ${args.dryRun ? "(dry-run) " : ""}${report.id}: lock rewritten from tree ${report.previousVersion} → ${report.version}; adopted changed ${adopted.changed.length}, added ${adopted.added.length}, deleted ${report.deleted.length}, unchanged ${report.unchanged.length}`);
    for (const relative of adopted.changed) console.log(`[plugin]   changed ${relative}`);
    for (const relative of adopted.added) console.log(`[plugin]   added ${relative}`);
    for (const relative of report.deleted) console.log(`[plugin]   deleted ${relative}`);
    printAllowDelete(report.allowDelete);
    printProvenance(report);
    console.log("[plugin] 下一步（人工）：");
    for (const step of report.nextSteps) console.log(`[plugin]   - ${step}`);
    return 0;
  }
  if (args.command === "uninstall") {
    const report = uninstallPlugin({ root: args.root, id: args.id, force: args.force, git: args.git, postinstall: args.postinstall, dryRun: args.dryRun });
    console.log(`[plugin] ${args.dryRun ? "(dry-run) " : ""}uninstalled ${report.class} ${report.id}@${report.version} [${report.source}]: ${report.deleted.length} files（--allow-delete ${report.allowDelete.join(", ") || "-"}）`);
    if (report.source !== "package") console.log(`[plugin]   ⚠ 锁来源是 ${report.source}：被删的是宿主本地内容（分叉 / 来源未知），⛔ 无法从任何包恢复——确认无误再提交`);
    if (report.missing.length > 0) console.log(`[plugin] ⚠ 锁登记但工作树已缺失：${report.missing.join(", ")}`);
    if (args.dropData) {
      if (report.class !== "kit") throw new Error(`--drop-data 只对 kit 有效（${report.id} 是 ${report.class}）`);
      const dropped = await dropKitData({ kitId: report.id, dryRun: args.dryRun });
      console.log(`[plugin]   ${args.dryRun ? "(dry-run) " : ""}drop-data：表 ${dropped.tables.join(", ") || "-"}；账本行 ${dropped.ledgerRows}；Redis 键 ${dropped.redisKeys}`);
    } else if (report.class === "kit") {
      console.log("[plugin]   kit 的表与账本行保留（docs/KIT.md §5）；确认不再需要数据时 uninstall --drop-data");
    }
    console.log("[plugin] 下一步（人工）：node scripts/protocol-fingerprint.mjs --write（若 registry 变化）、node scripts/fgui-manifest.mjs --write（若删了 FGUI 包）、npm run verify:all");
    return 0;
  }
  if (args.command === "test") {
    return runPackageTests({ root: args.root, id: args.id, int: args.int });
  }
  const report = checkInstalledPlugins(args.root);
  if (report.plugins.length === 0) {
    console.log("[plugin] 没有已安装包（scripts/packages/ 为空）");
    return 0;
  }
  for (const plugin of report.plugins) {
    console.log(`[plugin] ${plugin.class} ${plugin.id}@${plugin.version} [${plugin.source}]: ${plugin.problems.length === 0 ? "✔ 一致" : "✖ 有问题"}`);
    for (const problem of plugin.problems) console.log(`[plugin]   - ${problem}`);
  }
  return report.ok ? 0 : 1;
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  runCli(parseCli(process.argv.slice(2)))
    .then((code) => { process.exitCode = code; })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
