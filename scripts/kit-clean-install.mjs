/**
 * kit 干净树全链闭环（docs/KIT.md §5 / docs/MMO-PLAN.md §3 动线；MMO MK0-B6 首用，MK4-B6 冻结复用）：
 *   npm run verify:kit-clean-install -- --kit <id> [--keep]
 * 以仓树为作者侧：`plugin -- pack <id>` → 一次性检出（scripts/lib/fixture-checkout.mjs；node_modules 符号链接，@game/* 指回检出）里把该 kit 的
 * 树内文件与生成物**删干净**（codegen --allow-delete 该 kit / 域 / View / mode）并提交成「没有这个 kit 的干净树」→ `plugin -- install <包目录>`（首装闸：
 * 所有权冲突 / kit 依赖 / 贡献 / 写锁）→ codegen:plugins / codegen:gameplays → sync:shared / sync:client → 指纹重钉 → `db:bootstrap` 两遍
 * （临时库：第二遍必须零新应用）→ `plugin -- check` → `plugin -- test <id>`（按锁枚举）→ 两端 typecheck。任一步失败即退出 1 并打印尾巴。
 * ⛔ 不进 verify:core（约 4 分钟，要本地 MySQL）。临时库跑完即 DROP；`--keep` 保留检出与库供排查。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const kitId = argv[argv.indexOf("--kit") + 1];
const keep = argv.includes("--keep");
if (!argv.includes("--kit") || !kitId || !/^[a-z][A-Za-z0-9]{0,63}$/u.test(kitId)) {
  console.error("用法：node scripts/kit-clean-install.mjs --kit <id> [--keep]");
  process.exit(2);
}
const kitFile = path.join(REPO, "apps/kits", kitId, "kit.json");
if (!fs.existsSync(kitFile)) { console.error(`没有 ${path.relative(REPO, kitFile)}`); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(kitFile, "utf8"));
const modeIds = (manifest.modes ?? []).map((mode) => mode.id);
const viewNames = (manifest.views ?? []).map((file) => path.basename(file).replace(/View\.view\.json$/u, ""));
const pluginDeletes = [...new Set([kitId, ...(manifest.domains ?? []), ...viewNames])];

const { buildCheckout, removeFixtureSync } = await import(pathToFileURL(path.join(REPO, "scripts/lib/fixture-checkout.mjs")).href);
const root = buildCheckout({ prefix: `kit-clean-${kitId}-`, gitCommit: true, repoRoot: REPO });
const packages = fs.mkdtempSync(path.join(path.dirname(root), `.tmp-fixture-kit-clean-${kitId}-pkg-`));
console.log(`[kit-clean-install] kit ${kitId}：检出 ${root}`);

// node_modules 接入（与 apps/server/tools/mmo-fixture-matrix 同法）
const nmSource = path.join(REPO, "node_modules");
const nmTarget = path.join(root, "node_modules");
fs.mkdirSync(nmTarget);
for (const entry of fs.readdirSync(nmSource)) {
  if (entry === "@game") {
    fs.mkdirSync(path.join(nmTarget, "@game"));
    fs.symlinkSync("../../apps/shared", path.join(nmTarget, "@game/shared"));
    fs.symlinkSync("../../apps/server", path.join(nmTarget, "@game/server"));
    continue;
  }
  fs.symlinkSync(path.join(nmSource, entry), path.join(nmTarget, entry));
}
const serverModules = path.join(REPO, "apps/server/node_modules");
if (fs.existsSync(serverModules)) fs.symlinkSync(serverModules, path.join(root, "apps/server/node_modules"));
fs.appendFileSync(path.join(root, ".git/info/exclude"), "node_modules\napps/server/node_modules\n");
const uniflex = path.join(REPO, "apps/client/src/ui-uniflex/generated");
if (fs.existsSync(uniflex)) fs.cpSync(uniflex, path.join(root, "apps/client/src/ui-uniflex/generated"), { recursive: true });

const server = path.join(root, "apps/server");
const steps = [];
let failed = false;
const run = (label, cmd, args, cwd, env = {}) => {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...env } });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const ok = r.status === 0;
  steps.push({ label, ok, ms: Date.now() - started });
  console.log(`${ok ? "✔" : "✖"} ${label}${ok ? "" : `（exit ${r.status}）`}`);
  if (!ok) {
    console.log(out.trimEnd().split("\n").slice(-25).join("\n"));
    failed = true;
    throw new Error(label);
  }
  return out;
};
const tsx = (label, args, cwd = server, env = {}) => run(label, process.execPath, ["--import", "tsx", ...args], cwd, env);

const dbName = `kitclean_${kitId.toLowerCase()}_${Date.now().toString(36)}`;
// 与 core/infra/config.ts 的缺省同形（mysql://root@127.0.0.1:3316/game_<PROJECT_ID>）；只换库名
const mysqlUrl = new URL(process.env.MYSQL_URL ?? "mysql://root@127.0.0.1:3316/game_gono");
mysqlUrl.pathname = `/${dbName}`;
async function dropDatabase() {
  try {
    const mysql = await import("mysql2/promise");
    const admin = new URL(mysqlUrl);
    admin.pathname = "/";
    const connection = await mysql.createConnection(admin.toString());
    await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await connection.end();
  } catch (error) {
    console.log(`[kit-clean-install] 临时库 ${dbName} 未能自动 DROP：${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  // ① 作者侧打包（仓树）
  tsx(`pack ${kitId}（仓树）`, ["tools/plugin/cli.ts", "pack", kitId, "--out-dir", packages, "--root", REPO], path.join(REPO, "apps/server"));
  // ② 检出去掉该 kit：包清单里的树文件 + apps/kits/<id>/ + 生成物回退（codegen --allow-delete）
  const files = fs.readdirSync(packages, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(packages, f)).isFile() && f !== "files.lock" && f !== "kit.json");
  for (const f of files) fs.rmSync(path.join(root, f), { force: true });
  fs.rmSync(path.join(root, "apps/kits", kitId), { recursive: true, force: true });
  // 仓里若已装过该 kit（scripts/packages/<id>.lock），检出也要当作从未安装：否则首装被当成「已安装但文件缺失」拒
  const lockRelative = `scripts/packages/${kitId}.lock`;
  fs.rmSync(path.join(root, lockRelative), { force: true });
  run("git rm --cached（kit 文件 + 锁）", "git", ["rm", "-rq", "--cached", "--ignore-unmatch", "--", ...files, `apps/kits/${kitId}`, lockRelative], root);
  tsx(`codegen:plugins --allow-delete ${pluginDeletes.join(",")}`, ["tools/plugin-codegen/cli.ts", ...pluginDeletes.flatMap((id) => ["--allow-delete", id])]);
  if (modeIds.length > 0) tsx(`codegen:gameplays --allow-delete ${modeIds.join(",")}`, ["tools/gameplay-codegen/cli.ts", ...modeIds.flatMap((id) => ["--allow-delete", id])]);
  run("sync:shared（无 kit）", process.execPath, ["scripts/sync-shared.mjs"], root);
  run("sync:client（无 kit）", process.execPath, ["scripts/sync-client.mjs"], root);
  run("protocol-fingerprint --write（无 kit）", process.execPath, ["scripts/protocol-fingerprint.mjs", "--write"], root);
  run("git add -A", "git", ["add", "-A"], root);
  run("git commit（没有该 kit 的干净树）", "git", ["commit", "-qm", `without ${kitId}`], root);
  const before = run("检出干净", "git", ["status", "--porcelain"], root);
  if (before.trim() !== "") throw new Error(`检出不干净：${before}`);
  // ③ 首装 + writers
  tsx(`plugin install ${kitId}（干净树首装）`, ["tools/plugin/cli.ts", "install", packages, "--no-git", "--no-postinstall", "--root", root]);
  tsx("codegen:plugins", ["tools/plugin-codegen/cli.ts"]);
  tsx("codegen:gameplays", ["tools/gameplay-codegen/cli.ts"]);
  run("sync:shared", process.execPath, ["scripts/sync-shared.mjs"], root);
  run("sync:client", process.execPath, ["scripts/sync-client.mjs"], root);
  run("protocol-fingerprint --write", process.execPath, ["scripts/protocol-fingerprint.mjs", "--write"], root);
  tsx("codegen:plugins --check", ["tools/plugin-codegen/cli.ts", "--check"]);
  tsx("codegen:gameplays --check", ["tools/gameplay-codegen/cli.ts", "--check"]);
  // ④ bootstrap ×2（临时库）
  const first = tsx(`db:bootstrap #1（临时库 ${dbName}）`, ["tools/db-bootstrap.ts"], server, { MYSQL_URL: mysqlUrl.toString() });
  console.log(first.split("\n").filter((line) => line.includes(`kit ${kitId}`) || line.includes("kit 迁移") || line.includes("租约行")).map((line) => `    ${line.trim()}`).join("\n"));
  const second = tsx("db:bootstrap #2", ["tools/db-bootstrap.ts"], server, { MYSQL_URL: mysqlUrl.toString() });
  const applied = /kit 迁移：\d+ 个 kit，新应用 (\d+) 个文件/u.exec(second)?.[1];
  const leases = /租约行：新增 (\d+)/u.exec(second)?.[1];
  console.log(`    第二遍：新应用 ${applied ?? "?"} 个文件、租约行新增 ${leases ?? "?"}`);
  if (applied !== "0" || leases !== "0") throw new Error("第二遍 bootstrap 不是零 DDL / 零新增");
  // ⑤ check / test / typecheck
  const check = tsx("plugin check", ["tools/plugin/cli.ts", "check", "--root", root]);
  console.log(check.split("\n").filter((line) => line.includes(kitId)).map((line) => `    ${line.trim()}`).join("\n"));
  const tests = tsx(`plugin test ${kitId}（按锁枚举单测）`, ["tools/plugin/cli.ts", "test", kitId, "--root", root]);
  console.log(tests.split("\n").filter((line) => /^\[plugin\]|^ℹ (tests|pass|fail)/u.test(line)).map((line) => `    ${line.trim()}`).join("\n"));
  run("typecheck 服务端", process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit"], server);
  run("typecheck 客户端（tsconfig.test.json）", process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-p", "apps/client/tsconfig.test.json", "--noEmit"], root);
  const status = run("git status", "git", ["status", "--porcelain", "--untracked-files=all"], root).trim().split("\n").filter(Boolean);
  const modified = status.filter((line) => !line.startsWith("??"));
  console.log(`    安装后 status：新增 ${status.length - modified.length} / 修改 ${modified.length}（修改应全是 writer 生成物）`);
  for (const line of modified) console.log(`      ${line}`);
} catch (error) {
  if (!failed) console.log(`✖ ${error instanceof Error ? error.message : String(error)}`);
  failed = true;
} finally {
  if (!keep) {
    await dropDatabase();
    removeFixtureSync(root);
    fs.rmSync(packages, { recursive: true, force: true });
  } else {
    console.log(`[kit-clean-install] --keep：检出 ${root}、包 ${packages}、临时库 ${dbName}`);
  }
}
console.log(failed ? `[kit-clean-install] ✖ ${kitId} 未通过` : `[kit-clean-install] ✔ ${kitId} 干净树全链闭环 ${steps.length} 步通过`);
process.exitCode = failed ? 1 : 0;
