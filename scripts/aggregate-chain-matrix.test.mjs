/**
 * `verify-toolchain` 的聚合链声明 vs 真实 npm 执行的一致性矩阵。
 *
 * `verify-toolchain` 用 `TYPECHECK_COMMANDS` / `VERIFY_SYNC_COMMANDS` / `VERIFY_CORE_COMMANDS` /
 * `VERIFY_ALL_COMMANDS` 四张表，按 `&&` 切分 script 文本做集合与顺序比对。它守的是
 * 「script 文本长得像声明」，**不是**「跑起来真的会执行这些命令」——两者不是一回事：
 * 文本里写着的命令可能因为拼错、被 `echo` 包住、或前一条短路而根本不执行。
 *
 * 这里给它配一条独立的地面真相：
 *   A. 声明怎么说：从 `verify-toolchain.mjs` 里读出那四张表。
 *   B. 真实 npm 怎么跑：在探针 workspace 里把链条文本**原样**搬过去，但把它引用的每一条
 *      子命令换成只打 marker 的桩，然后真的 `npm run <链名>`，按顺序收集 marker。
 *   两者的**序列**必须逐项相等（顺序也算，短路会让后半截 marker 消失）。
 *
 * 桩全部 exit 0：`&&` 链遇到失败会短路，桩失败会把「后面没跑」误报成声明不符。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOLCHAIN_SCRIPT = join(REPO_ROOT, "scripts", "verify-toolchain.mjs");
const MARK = "CHAIN_MARK:";

/** 从 verify-toolchain.mjs 里读出声明表——不复制一份，避免两边各自漂移。 */
function declaredChain(constantName) {
  const source = readFileSync(TOOLCHAIN_SCRIPT, "utf8");
  const match = source.match(new RegExp(`const ${constantName} = \\[([\\s\\S]*?)\\];`, "u"));
  assert.ok(match, `verify-toolchain.mjs 中找不到 ${constantName} 声明`);
  return [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/gu)].map((entry) => entry[1]);
}

const CHAINS = [
  { script: "typecheck", constant: "TYPECHECK_COMMANDS" },
  { script: "verify:sync", constant: "VERIFY_SYNC_COMMANDS" },
  { script: "verify:core", constant: "VERIFY_CORE_COMMANDS" },
  { script: "verify:all", constant: "VERIFY_ALL_COMMANDS" },
];

const probes = [];
after(() => { for (const dir of probes) rmSync(dir, { recursive: true, force: true }); });

const stubBody = (command) => `console.log(${JSON.stringify(MARK + command)});\n`;
/**
 * npm 在执行前会把命令行原样回显（`> node -e "…"`），marker 字面量若出现在命令行里就会被
 * 数两次。所以 inline 桩把 marker 拆开拼接：回显里是 `'CHAIN'+'_MARK:…'`，只有真正的输出
 * 才是完整的 `CHAIN_MARK:…`。写成文件的桩没有这个问题（文件内容不回显）。
 */
const inlineStub = (command) => `node -e "console.log('CHAIN'+'_MARK:${command}')"`;

/**
 * 为一条链搭探针：链条文本原样搬过来，它引用的每条子命令换成打 marker 的桩。
 * 桩是**叶子**——`verify:core` 引用的 `npm run typecheck` 只打一个 marker，不再展开，
 * 因为声明表描述的就是直接子命令。
 */
function buildProbe(chainScript, commands) {
  const probe = mkdtempSync(join(tmpdir(), "chain-matrix-"));
  probes.push(probe);
  const rootScripts = {};
  const workspaces = new Map();

  for (const command of commands) {
    const workspaceRun = command.match(/^npm\s+--workspace\s+(\S+)\s+run\s+(\S+)$/u);
    const rootRun = command.match(/^npm\s+run\s+(\S+)$/u);
    const nodeRun = command.match(/^node\s+(\S+)(?:\s+(.*))?$/u);
    if (workspaceRun) {
      const [, workspace, script] = workspaceRun;
      if (!workspaces.has(workspace)) workspaces.set(workspace, {});
      workspaces.get(workspace)[script] = inlineStub(command);
    } else if (rootRun) {
      rootScripts[rootRun[1]] = inlineStub(command);
    } else if (nodeRun) {
      const file = join(probe, nodeRun[1]);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, stubBody(command));
    } else {
      assert.fail(`探针不认识的命令形态，需要扩展 buildProbe：${command}`);
    }
  }

  // 链条文本从真实 package.json 原样取用，不重新拼装——重新拼装就变成拿声明验声明了。
  const realScript = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts[chainScript];
  assert.ok(realScript, `根 package.json 缺少 scripts.${chainScript}`);
  rootScripts[chainScript] = realScript;

  const workspaceDirs = [];
  for (const [name, scripts] of workspaces) {
    const dir = `ws/${name.replace(/[^A-Za-z0-9]+/gu, "-")}`;
    mkdirSync(join(probe, dir), { recursive: true });
    writeFileSync(join(probe, dir, "package.json"), `${JSON.stringify({ name, version: "1.0.0", scripts }, null, 2)}\n`);
    workspaceDirs.push(dir);
  }
  writeFileSync(join(probe, "package.json"), `${JSON.stringify({
    name: "chain-matrix-probe", version: "1.0.0", private: true,
    ...(workspaceDirs.length > 0 ? { workspaces: workspaceDirs } : {}),
    scripts: rootScripts,
  }, null, 2)}\n`);
  return probe;
}

/** B：真实 npm 按顺序执行了哪些子命令。 */
function reallyExecuted(probe, chainScript) {
  const result = spawnSync("npm", ["run", chainScript], {
    cwd: probe, encoding: "utf8", input: "", timeout: 180_000,
  });
  const output = `${result.stdout}\n${result.stderr}`;
  return [...output.matchAll(new RegExp(`${MARK}(.+)`, "gu"))].map((entry) => entry[1].trim());
}

test("聚合链声明与真实 npm 执行序列逐条一致", () => {
  for (const { script, constant } of CHAINS) {
    const declared = declaredChain(constant);
    assert.ok(declared.length > 0, `${constant} 解析为空，说明声明提取失效`);
    const executed = reallyExecuted(buildProbe(script, declared), script);
    assert.deepEqual(
      executed,
      declared,
      `scripts.${script} 的真实执行序列与 ${constant} 声明不符\n`
      + `  声明：${declared.join(" -> ")}\n`
      + `  实跑：${executed.join(" -> ") || "（空——链条可能在第一条就短路了）"}`,
    );
  }
});

test("矩阵本身有判别力：桩缺一条时必须报出来", () => {
  const declared = declaredChain("VERIFY_SYNC_COMMANDS");
  const probe = buildProbe("verify:sync", declared);
  // 把第一条子命令的桩改成失败：`&&` 会短路，后面的 marker 应当消失。
  const first = declared[0].match(/^node\s+(\S+)/u);
  assert.ok(first, "该链首条命令应为 node 脚本形态");
  writeFileSync(join(probe, first[1]), "process.exit(1);\n");
  const executed = reallyExecuted(probe, "verify:sync");
  assert.deepEqual(executed, [], "首条失败后不应有任何 marker——否则说明矩阵读不到短路");
});

test("声明表里的每条命令在真实仓库中都必须可解析", () => {
  // 上一条用例的探针**替所有子命令生成桩**，因此它证明的是「链条文本的执行序列 == 声明」，
  // 证明不了「这些命令在真实仓库里真的存在」——把 scripts.verify:ecs 删掉，链条文本不变，
  // 上一条用例仍然全绿（实测），verify-toolchain 也只看文本、同样放行。这条补上那个缺口。
  const rootPackage = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  const workspaceName = (dir) => JSON.parse(
    readFileSync(join(REPO_ROOT, dir, "package.json"), "utf8"),
  ).name;
  const workspaceScripts = new Map(
    (rootPackage.workspaces ?? []).map((dir) => [
      workspaceName(dir),
      JSON.parse(readFileSync(join(REPO_ROOT, dir, "package.json"), "utf8")).scripts ?? {},
    ]),
  );

  const missing = [];
  for (const { constant } of CHAINS) {
    for (const command of declaredChain(constant)) {
      const workspaceRun = command.match(/^npm\s+--workspace\s+(\S+)\s+run\s+(\S+)$/u);
      const rootRun = command.match(/^npm\s+run\s+(\S+)$/u);
      const nodeRun = command.match(/^node\s+(\S+)/u);
      if (workspaceRun) {
        const scripts = workspaceScripts.get(workspaceRun[1]);
        if (!scripts) missing.push(`${constant}: workspace 不存在 ${workspaceRun[1]}（${command}）`);
        else if (typeof scripts[workspaceRun[2]] !== "string") {
          missing.push(`${constant}: ${workspaceRun[1]} 没有脚本 ${workspaceRun[2]}（${command}）`);
        }
      } else if (rootRun) {
        if (typeof rootPackage.scripts?.[rootRun[1]] !== "string") {
          missing.push(`${constant}: 根 package.json 没有脚本 ${rootRun[1]}（${command}）`);
        }
      } else if (nodeRun) {
        if (!existsSync(join(REPO_ROOT, nodeRun[1]))) {
          missing.push(`${constant}: 脚本文件不存在 ${nodeRun[1]}（${command}）`);
        }
      } else {
        missing.push(`${constant}: 无法解析的命令形态 ${command}`);
      }
    }
  }
  assert.deepEqual(missing, [], `声明表引用了真实仓库中不存在的命令：\n  ${missing.join("\n  ")}`);
});

test("声明提取本身有判别力：读不到的常量必须失败而不是静默返回空", () => {
  assert.throws(() => declaredChain("NO_SUCH_COMMANDS_TABLE"), /找不到 NO_SUCH_COMMANDS_TABLE 声明/u);
});
