/**
 * `commandReferences` vs 真实 npm 的逐条一致性矩阵。
 *
 * 姊妹文件 `launcher-matrix.test.mjs` 守的是 `commandInvokesEntry`（launch 判定）。
 * 这个文件守另一条线：`commandReferences` 判断「这条 package script 实际调用了哪些 npm 脚本」，
 * 它经 `commandCovers` 喂给两个登记性断言——`workspaceCommandScope.supersededBy` 与
 * `verification.requires`。判错的后果是给一条**从未被执行**的命令盖绿章。
 *
 * 这里也是同时问两边：
 *   A. 门禁怎么说：把形态写进 fixture，看 verify-inventory 是否报「未实际覆盖」/「并未实际调用」；
 *   B. 真实 npm 怎么做：在一个最小 workspace 探针里跑同样的形态，看 root 还是 workspace
 *      的目标脚本打出了 marker。
 *
 * 真实 npm 的关键语义（本文件逐条实测得出，不是照文档抄）：
 * `npm run X --workspace Y` 与 `npm --workspace Y run X` **等价**，跑的都是 workspace 脚本——
 * 后缀写法曾让门禁把它记成 `root:X`，是第四轮修掉的一个真实假绿。
 *
 * 两类**已登记的有意背离**用 `failClosed` / `staticBlind` 显式钉住，而不是从表里删掉：
 * 将来谁把它们「修好」了，这里会红，提醒同步更新 plan-v3 的边界登记。
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERIFY_SCRIPT = join(REPO_ROOT, "scripts", "verify-inventory.mjs");

/** 探针侧的名字 */
const PROBE_WS = "@probe/ws";
const ROOT_MARKER = "NPM_MATRIX_ROOT";
const WS_MARKER = "NPM_MATRIX_WS";
/** 门禁侧借用的真实登记：verify:core requires root:verify:vendor；start:server supersedes @game/server#start */
const GATE_ROOT_SCRIPT = "verify:vendor";
const GATE_WS = "@game/server";
const GATE_WS_SCRIPT = "start";

/**
 * `{SCRIPT}` / `{WS}` 由两侧各自代入自己的名字。`expect` 是**真实 npm** 的结果：
 * "root" 跑根脚本、"workspace" 跑 workspace 脚本、"none" 目标脚本没跑。
 */
const CASES = [
  { form: "npm run {SCRIPT}", expect: "root" },
  { form: "npm --silent run {SCRIPT}", expect: "root" },
  { form: "npm run {SCRIPT} --if-present", expect: "root" },
  { form: "npm --workspace {WS} run {SCRIPT}", expect: "workspace" },
  { form: "npm -w {WS} run {SCRIPT}", expect: "workspace" },
  { form: "npm run {SCRIPT} --workspace {WS}", expect: "workspace" },
  { form: "npm run {SCRIPT} -w {WS}", expect: "workspace" },
  { form: "npm run {SCRIPT} -w={WS}", expect: "workspace" },

  // 写出了命令原文却不执行
  { form: "echo npm run {SCRIPT}", expect: "none" },
  { form: "# npm run {SCRIPT}", expect: "none" },
  { form: 'echo "ignored; npm run {SCRIPT}"', expect: "none" },
  { form: "true -- npm run {SCRIPT}", expect: "none" },

  // 已登记的有意背离：真实 npm 会跑，门禁失败关闭（宁可红灯不误盖绿章）
  {
    form: "npm run -s {SCRIPT}",
    expect: "root",
    failClosed: "run 与脚本名之间的中性 flag：真实 npm 执行，门禁判未覆盖（plan-v3 §12.3）",
  },
  {
    form: "npm run {SCRIPT} --prefix .",
    expect: "root",
    failClosed: "--prefix 会改变被执行的脚本，形态未知一律失败关闭（plan-v3 §11.3）",
  },

  // 已登记的有意背离：真实 npm 不跑，门禁仍算覆盖（shell 可达性静态不可判定）
  {
    form: "false && npm run {SCRIPT}",
    expect: "none",
    staticBlind: "短路操作符右侧不做可达性判定（plan-v3 §9.5 收窄口径）",
  },
];

let fixture = null;
let probe = null;

function setup() {
  if (fixture) return;
  fixture = mkdtempSync(join(tmpdir(), "npm-matrix-gate-"));
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: REPO_ROOT, encoding: "buffer",
  }).toString().split("\0").filter(Boolean);
  for (const file of files) {
    if (file === "apps/website" || file.startsWith("apps/website/")) continue;
    if (file === ".env" || file.startsWith(".env.")) continue;
    const source = join(REPO_ROOT, file);
    if (!existsSync(source)) continue;
    const destination = join(fixture, file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }

  // 真实 npm 探针：一个最小 workspace，root 与 workspace 各有一个同名目标脚本，
  // 靠 marker 区分究竟哪一个被执行。`npm run` 解析 workspaces 不需要先 install。
  probe = mkdtempSync(join(tmpdir(), "npm-matrix-probe-"));
  // npm 探针的环境隔离：cache/logdir 指进探针目录（失败形态会写 _logs debug 日志），
  // userconfig 指向探针内的空文件（不读用户 ~/.npmrc），避免污染开发者环境。
  writeFileSync(join(probe, ".npmrc-isolated"), "\n");
  mkdirSync(join(probe, "ws"), { recursive: true });
  writeFileSync(join(probe, "package.json"), `${JSON.stringify({
    name: "npm-matrix-probe", version: "1.0.0", private: true, workspaces: ["ws"],
    scripts: { target: `node -e "console.log('${ROOT_MARKER}')"`, caller: "true" },
  }, null, 2)}\n`);
  writeFileSync(join(probe, "ws", "package.json"), `${JSON.stringify({
    name: PROBE_WS, version: "1.0.0",
    scripts: { target: `node -e "console.log('${WS_MARKER}')"` },
  }, null, 2)}\n`);
}

after(() => {
  for (const dir of [fixture, probe]) {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function runVerifier() {
  const result = spawnSync(process.execPath, [VERIFY_SCRIPT, "--root", fixture], {
    cwd: REPO_ROOT, encoding: "utf8",
  });
  return `${result.stdout}\n${result.stderr}`;
}

function writeRootPackage(mutate) {
  const file = join(fixture, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  mutate(pkg);
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

const pristineRoot = () => JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));

/** A1：门禁是否认为该形态调用了 root:verify:vendor。 */
function gateSeesRootReference(form) {
  const script = form.replaceAll("{SCRIPT}", GATE_ROOT_SCRIPT).replaceAll("{WS}", GATE_WS);
  const original = pristineRoot().scripts["verify:core"];
  // 基线形态 `npm run {SCRIPT}` 改写后与原文相同，这是正常的；要断言的是**找到了**待替换的
  // 那段调用，而不是结果必须不同——否则基线用例会因恒等改写而误报夹具失效。
  assert.ok(
    original.includes(`npm run ${GATE_ROOT_SCRIPT}`),
    `夹具前提不成立：verify:core 中找不到 npm run ${GATE_ROOT_SCRIPT}`,
  );
  const rewritten = original.replace(`npm run ${GATE_ROOT_SCRIPT}`, script);
  writeRootPackage((pkg) => { pkg.scripts["verify:core"] = rewritten; });
  const output = runVerifier();
  const missed = new RegExp(`未实际覆盖声明的验证命令：root:${GATE_ROOT_SCRIPT}`, "u").test(output);
  writeRootPackage((pkg) => { pkg.scripts["verify:core"] = original; });
  return !missed;
}

/** A2：门禁是否认为该形态调用了 workspace:@game/server#start。 */
function gateSeesWorkspaceReference(form) {
  const script = form.replaceAll("{SCRIPT}", GATE_WS_SCRIPT).replaceAll("{WS}", GATE_WS);
  const original = pristineRoot().scripts["start:server"];
  writeRootPackage((pkg) => { pkg.scripts["start:server"] = script; });
  const output = runVerifier();
  const missed = new RegExp(
    `supersededBy 并未实际调用 workspace:${GATE_WS}#${GATE_WS_SCRIPT}`, "u",
  ).test(output);
  writeRootPackage((pkg) => { pkg.scripts["start:server"] = original; });
  return !missed;
}

/** B：真实 npm 跑的是哪一个。 */
function realNpmTarget(form) {
  const script = form.replaceAll("{SCRIPT}", "target").replaceAll("{WS}", PROBE_WS);
  const file = join(probe, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.scripts.caller = script;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  const result = spawnSync("npm", ["run", "caller"], {
    cwd: probe, encoding: "utf8", input: "", timeout: 120_000,
    env: {
      ...process.env,
      npm_config_cache: join(probe, ".npm-cache"),
      NPM_CONFIG_USERCONFIG: join(probe, ".npmrc-isolated"),
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (output.includes(WS_MARKER)) return "workspace";
  if (output.includes(ROOT_MARKER)) return "root";
  return "none";
}

test("npm 引用判定与真实 npm 逐条一致", () => {
  setup();
  const divergences = [];
  for (const { form, expect, failClosed, staticBlind } of CASES) {
    const real = realNpmTarget(form);
    assert.equal(real, expect, `用例声明的真实 npm 行为与实测不符：${form} 声明=${expect} 实测=${real}`);

    const gateRoot = gateSeesRootReference(form);
    const gateWorkspace = gateSeesWorkspaceReference(form);
    const gate = gateWorkspace ? "workspace" : (gateRoot ? "root" : "none");

    if (gate === real) {
      if (failClosed || staticBlind) {
        divergences.push(`${form}\n    已登记的有意背离现在与真实 npm 一致了（gate=real=${real}）`
          + `\n    请从 CASES 里去掉该标记并同步更新 plan-v3 的边界登记。`);
      }
      continue;
    }
    if (failClosed && gate === "none") continue;      // 真实会跑、门禁失败关闭：已登记
    if (staticBlind && real === "none") continue;     // 真实不跑、门禁仍算覆盖：已登记
    divergences.push(
      `${form}\n    门禁=${gate} 真实=${real}`
      + `  → ${gate === "none" ? "假红（漏记了真实存在的调用）"
        : real === "none" ? "假绿（给从未执行的命令盖了绿章）"
          : "记错了调用目标（root/workspace 混淆——会给另一条命令盖绿章）"}`,
    );
  }
  assert.deepEqual(
    divergences,
    [],
    `${divergences.length}/${CASES.length} 种形态与真实 npm 背离：\n  ${divergences.join("\n  ")}`,
  );
});

test("矩阵本身有判别力：门禁侧与探针侧都不是恒真", () => {
  setup();
  // 门禁侧：正常形态算覆盖，纯文本形态不算。
  assert.equal(gateSeesRootReference("npm run {SCRIPT}"), true, "正常根调用必须被算作覆盖");
  assert.equal(gateSeesRootReference("echo npm run {SCRIPT}"), false, "echo 伪调用不得被算作覆盖");
  assert.equal(
    gateSeesWorkspaceReference("npm --workspace {WS} run {SCRIPT}"),
    true,
    "正常 workspace 调用必须被算作覆盖",
  );
  assert.equal(
    gateSeesWorkspaceReference("echo npm --workspace {WS} run {SCRIPT}"),
    false,
    "echo 伪调用不得被算作 workspace 覆盖",
  );
  // 探针侧：三种结果都能真的出现。
  assert.equal(realNpmTarget("npm run {SCRIPT}"), "root");
  assert.equal(realNpmTarget("npm --workspace {WS} run {SCRIPT}"), "workspace");
  assert.equal(realNpmTarget("echo npm run {SCRIPT}"), "none");
});
