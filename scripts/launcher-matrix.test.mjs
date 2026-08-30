/**
 * 门禁 vs 真实解释器的逐条一致性矩阵。
 *
 * `commandInvokesEntry` 判断的是「这条 package script 会不会真的启动 defaultEntry」。
 * 前九轮里这个判定被反复打补丁，每轮都是人工构造几种形态、手工跑一遍真实 bash/node
 * 比对——想不到的形态就是盲区。这个文件把那套手工比对固化下来：
 *
 *   对每种启动器形态，同时问两边——
 *     A. 门禁怎么说：把它写进 fixture 的 `scripts.relayer`，跑 `verify-inventory --root`，
 *        看是否报「未实际启动 defaultEntry」；
 *     B. 真实解释器怎么做：用同样的 flag 跑一个只打 marker 的入口脚本，看 marker 有没有出现。
 *   两者必须一致。不一致就是假绿（门禁放行但入口没跑）或假红（门禁拒绝但入口跑了）。
 *
 * 新增启动器或 flag 形态时，往 `CASES` 里加一行即可，不需要再手工跑矩阵。
 * 判定依据是**实测**而非文档。探针入口的 marker 放在第二行，衡量的是「入口被跑完」：
 * `bash -t` 只执行第一条命令就退出，按这个口径不算启动——这类语义分歧写在用例的 `note` 里。
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
const MARKER = "LAUNCHER_MATRIX_MARKER";
/** inventory 里 outbox-relayer 的 defaultEntry，相对 `apps/server`。 */
const ENTRY = "src/core/economy/relayer.ts";

/**
 * 形态表。`shell` 用 bash 跑，`node` 用 node 跑（tsx 与 node 同族，flag 语义一致，
 * 由 node 侧代表）。`args` 是启动器与入口之间的 token，入口固定追加在末尾。
 */
const CASES = [
  // ---- bash：白名单内，应放行 ----
  ...["-e", "-x", "-u", "-v", "-f", "-a", "-b", "-m", "-h", "-i", "-r", "-l", "-E", "-P",
    "-k", "-p", "-B", "-C", "-H", "-T", "-ex", "-eu", "-euv"].map((flag) => ({ kind: "shell", args: [flag] })),
  ...["+e", "+x", "+u", "+ex"].map((flag) => ({ kind: "shell", args: [flag] })),
  ...["--noprofile", "--norc", "--posix", "--verbose", "--noediting", "--login"]
    .map((flag) => ({ kind: "shell", args: [flag] })),
  { kind: "shell", args: [] },
  { kind: "shell", args: ["--"] },
  { kind: "shell", args: ["-o", "errexit"] },
  { kind: "shell", args: ["-O", "expand_aliases"] },
  { kind: "shell", args: ["+o", "errexit"] },

  // ---- bash：入口不会执行，应拒绝 ----
  ...["-c", "-s", "-n", "-D", "+s", "-ce", "-es", "-oe", "-eo", "-xo", "-ox",
    "--help", "--version", "--dump-strings", "--dump-po-strings", "--pretty-print"]
    .map((flag) => ({ kind: "shell", args: [flag] })),
  { kind: "shell", args: ["-o"], note: "选项值恰为入口，入口被吃成 -o 的值" },
  { kind: "shell", args: ["-t"], note: "只执行第一条命令即退出，入口跑不完，不算启动" },

  // ---- node：应放行 ----
  { kind: "node", args: [] },
  { kind: "node", args: ["--enable-source-maps"] },
  { kind: "node", args: ["-C", "production"] },
  // ---- node：应拒绝 ----
  ...["--check", "-c", "--eval=1", "-e1", "-p1", "--print=1", "-v", "--version", "-h", "--help"]
    .map((flag) => ({ kind: "node", args: [flag] })),
  { kind: "node", args: ["--import", "tsx", "--check"] },
];

let fixture = null;
let probeDir = null;

/** 一次性建好 fixture 与探针目录：每条形态只改 `scripts.relayer`，避免逐条重建。 */
function setup() {
  if (fixture) return;
  fixture = mkdtempSync(join(tmpdir(), "launcher-matrix-"));
  const checkoutFiles = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: REPO_ROOT, encoding: "buffer" },
  ).toString().split("\0").filter(Boolean);
  for (const file of checkoutFiles) {
    if (file === "apps/website" || file.startsWith("apps/website/")) continue;
    if (file === ".env" || file.startsWith(".env.")) continue;
    const source = join(REPO_ROOT, file);
    if (!existsSync(source)) continue;
    const destination = join(fixture, file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }

  // 探针目录：入口只打 marker。node 侧的 `--import tsx` / `-r` 需要真实依赖，
  // 因此把仓库的 node_modules 接进来——探针缺依赖会让「真实未执行」变成环境假象。
  probeDir = mkdtempSync(join(tmpdir(), "launcher-probe-"));
  // marker 刻意放在**第二行**：我们要判的是「入口被跑完」，不是「跑了第一条命令」。
  // `bash -t` 只执行第一条就退出，marker 因此不出现——与门禁把它判为「未启动」一致。
  writeFileSync(join(probeDir, "entry.sh"), `: first command\necho ${MARKER}\n`);
  writeFileSync(join(probeDir, "entry.mjs"), `console.log(${JSON.stringify(MARKER)});\n`);
  try {
    cpSync(join(REPO_ROOT, "node_modules"), join(probeDir, "node_modules"), {
      recursive: true, dereference: false, force: false, errorOnExist: false,
    });
  } catch { /* 依赖缺失只会影响需要 loader 的形态；矩阵会把它报成背离而不是静默放过 */ }
}

after(() => {
  for (const dir of [fixture, probeDir]) {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** A：门禁怎么说。true = 认为入口被启动。 */
function gateSaysLaunched(script) {
  const packageFile = join(fixture, "apps", "server", "package.json");
  const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
  pkg.scripts.relayer = script;
  writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
  const result = spawnSync(process.execPath, [VERIFY_SCRIPT, "--root", fixture], {
    cwd: REPO_ROOT, encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`;
  const missed = /未实际启动 defaultEntry/u.test(output);
  // 除 launch 判定外的任何失败都说明 fixture 本身坏了，不能当成「门禁说没启动」。
  if (!missed && result.status !== 0) {
    throw new Error(`fixture 出现无关失败，矩阵结论不可信：\n${output}`);
  }
  return !missed;
}

/** B：真实解释器怎么做。true = 入口真的执行了。 */
function reallyLaunched(kind, args) {
  const binary = kind === "shell" ? "bash" : process.execPath;
  const entryFile = kind === "shell" ? "entry.sh" : "entry.mjs";
  const result = spawnSync(binary, [...args, entryFile], {
    cwd: probeDir, encoding: "utf8", input: "", timeout: 20_000,
  });
  return `${result.stdout}\n${result.stderr}`.includes(MARKER);
}

function describe(kind, args) {
  return `${kind === "shell" ? "bash" : "node"} ${[...args, ENTRY].join(" ")}`.trim();
}

test("启动器判定与真实解释器逐条一致", () => {
  setup();
  const divergences = [];
  for (const { kind, args, note } of CASES) {
    const launcher = kind === "shell" ? "bash" : "node";
    const script = [launcher, ...args, ENTRY].join(" ");
    const gate = gateSaysLaunched(script);
    const real = reallyLaunched(kind, args);
    if (gate !== real) {
      divergences.push(
        `${describe(kind, args)}\n    门禁=${gate ? "放行" : "拒绝"} 真实=${real ? "执行" : "未执行"}`
        + `  → ${gate ? "假绿（放行了不会执行入口的形态）" : "假红（拒绝了会执行入口的形态）"}`
        + (note ? `\n    备注：${note}` : ""),
      );
    }
  }
  assert.deepEqual(
    divergences,
    [],
    `${divergences.length}/${CASES.length} 种形态与真实解释器背离：\n  ${divergences.join("\n  ")}`,
  );
});

test("矩阵本身有判别力：入口路径写错时门禁必须说未启动", () => {
  setup();
  // 防止 gateSaysLaunched 恒真——若它永远返回 true，上面那条用例就是空跑。
  assert.equal(gateSaysLaunched(`bash ${ENTRY}`), true, "正常形态必须被判为已启动");
  assert.equal(
    gateSaysLaunched("bash src/core/economy/not-the-entry.ts"),
    false,
    "入口路径不匹配时必须被判为未启动",
  );
});

test("探针本身有判别力：marker 判定不是恒真", () => {
  setup();
  assert.equal(reallyLaunched("shell", []), true, "裸 bash 必须真的执行入口");
  assert.equal(reallyLaunched("shell", ["-n"]), false, "bash -n 不执行入口，探针必须能看出来");
});
