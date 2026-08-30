/**
 * `verify-toolchain` 的**非链条**检查 vs 真实运行时/安装态的一致性矩阵。
 *
 * `verify-toolchain` 的非链条部分（Node 版本声明、`engines.node`、`@types/node` 主版本、
 * lockfile 投影、工具依赖版本范围）全部是**声明之间互相比对**——它读 `package.json`、
 * `.node-version`、`package-lock.json`，从不看真正在跑的 Node，也从不看 `node_modules` 里
 * 真正装着什么。于是「声明自洽」与「装出来的东西符合声明」是两件事，后者此前无人守。
 *
 * 这里给它配的地面真相是**真实运行时与真实安装态**：
 *   A. 声明怎么说：`.node-version`、两处 `engines.node`、根 devDependencies 的版本范围、
 *      lockfile 里的 resolved 版本。
 *   B. 真实是什么：`process.versions.node`（正在跑的 Node）、
 *      `node_modules/<dep>/package.json` 里真正装着的版本。
 *
 * 判别力靠纯函数：`divergences()` 接受一组输入返回背离清单，既用真实值跑一遍（应为空），
 * 也用构造值跑几遍（应精确命中），避免「真实恰好全绿」把用例变成空跑。
 *
 * **刻意不断言**「正在跑的 Node 主版本 == `.node-version`」：`.node-version` 是给版本管理器的
 * 钉子，而契约是 `engines.node`（`>=22`）。本机跑 Node 25 满足契约却不等于 22，断言相等会让
 * 任何没精确切到 22 的开发机变红。该差异登记为边界而不是失败。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ROOT_TOOL_DEPENDENCIES } from "./verify-toolchain.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/**
 * 「闸哪些工具依赖」的唯一真源是 verify-toolchain.mjs 的 ROOT_TOOL_DEPENDENCIES——这里导入，
 * 不再保留复制件（复制件曾是无守门的第二真源）。刻意保持独立的只有下方的**版本判定逻辑**：
 * 拿被验对象自己的判定去验它自己就成了同义反复，但「清单」是声明不是判定，必须单源。
 */
const TOOL_DEPENDENCIES = ROOT_TOOL_DEPENDENCIES;

const readJson = (relative) => JSON.parse(readFileSync(join(REPO_ROOT, relative), "utf8"));

/**
 * 独立的最小 semver 判定——刻意不复用 `verify-toolchain.mjs` 的实现：拿被验对象自己的
 * 判定去验它自己就成了同义反复。只支持仓内实际出现的两种形态，遇到没见过的形态**抛错**
 * 而不是静默放行。
 */
function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(String(value).trim());
  assert.ok(match, `无法解析版本号：${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function satisfies(range, version) {
  const target = parseVersion(version);
  const gte = /^>=\s*(\d+(?:\.\d+){0,2})$/u.exec(range.trim());
  if (gte) {
    const low = parseVersion(`${gte[1]}.0.0`.split(".").slice(0, 3).join("."));
    return compare(target, low) >= 0;
  }
  const caret = /^\^(\d+\.\d+\.\d+)$/u.exec(range.trim());
  if (caret) {
    const low = parseVersion(caret[1]);
    // ^X.Y.Z（X>0）允许 >=X.Y.Z 且 <X+1.0.0
    return compare(target, low) >= 0 && target[0] === low[0];
  }
  assert.fail(`矩阵不认识的版本范围形态，需要显式扩展：${range}`);
}

function compare(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/** 纯判定：给定声明与真实值，返回背离清单。 */
function divergences({ runningNode, nodeVersionPin, engines, declaredRanges, lockedVersions, installedVersions }) {
  const problems = [];
  for (const [where, range] of Object.entries(engines)) {
    if (!satisfies(range, runningNode)) {
      problems.push(`正在跑的 Node ${runningNode} 不满足 ${where} 的 engines.node ${range}`);
    }
  }
  if (!satisfies(engines.root, `${nodeVersionPin}.0.0`)) {
    problems.push(`.node-version 钉的 ${nodeVersionPin} 不满足根 engines.node ${engines.root}`);
  }
  for (const dependency of TOOL_DEPENDENCIES) {
    const installed = installedVersions[dependency];
    const range = declaredRanges[dependency];
    const locked = lockedVersions[dependency];
    if (!installed) {
      problems.push(`${dependency} 未安装——node_modules 与声明不一致，跑 npm ci`);
      continue;
    }
    if (!satisfies(range, installed)) {
      problems.push(`${dependency} 实际装的是 ${installed}，不满足声明范围 ${range}（跑 npm ci）`);
    }
    if (locked && installed !== locked) {
      problems.push(`${dependency} 实际装的是 ${installed}，与 lockfile 的 ${locked} 不一致（跑 npm ci）`);
    }
  }
  const typesMajor = installedVersions["@types/node"] && parseVersion(installedVersions["@types/node"])[0];
  if (typesMajor !== undefined && typesMajor !== Number(nodeVersionPin)) {
    problems.push(
      `@types/node 实际装的是 ${installedVersions["@types/node"]}（主版本 ${typesMajor}），`
      + `与 .node-version 钉的 ${nodeVersionPin} 不一致——类型面会按另一个 Node 版本校验`,
    );
  }
  return problems;
}

/** 从真实仓库与真实安装态取值。 */
function realInputs() {
  const rootPackage = readJson("package.json");
  const serverPackage = readJson("apps/server/package.json");
  const lock = readJson("package-lock.json");
  const installedVersions = {};
  for (const dependency of TOOL_DEPENDENCIES) {
    const manifest = join(REPO_ROOT, "node_modules", dependency, "package.json");
    installedVersions[dependency] = existsSync(manifest)
      ? JSON.parse(readFileSync(manifest, "utf8")).version
      : undefined;
  }
  const declaredRanges = {};
  const lockedVersions = {};
  for (const dependency of TOOL_DEPENDENCIES) {
    declaredRanges[dependency] = rootPackage.devDependencies?.[dependency]
      ?? rootPackage.dependencies?.[dependency];
    assert.ok(declaredRanges[dependency], `根 package.json 未声明 ${dependency}`);
    lockedVersions[dependency] = lock.packages?.[`node_modules/${dependency}`]?.version;
  }
  return {
    runningNode: process.versions.node,
    nodeVersionPin: readFileSync(join(REPO_ROOT, ".node-version"), "utf8").trim().split(".")[0],
    engines: { root: rootPackage.engines?.node, "apps/server": serverPackage.engines?.node },
    declaredRanges,
    lockedVersions,
    installedVersions,
  };
}

test("工具链声明与真实运行时/安装态一致", () => {
  const inputs = realInputs();
  assert.deepEqual(
    divergences(inputs),
    [],
    "声明与真实运行时/安装态背离——注意这类问题 verify-toolchain 看不见（它只比对声明之间）：\n"
    + `  正在跑的 Node：${inputs.runningNode}\n`
    + `  .node-version：${inputs.nodeVersionPin}\n`
    + `  实际安装：${JSON.stringify(inputs.installedVersions)}\n`
    + `  lockfile：${JSON.stringify(inputs.lockedVersions)}`,
  );
});

test("判定本身有判别力：构造的每种背离都必须被精确命中", () => {
  const base = realInputs();
  const at = (patch) => divergences({ ...base, ...patch });

  assert.deepEqual(at({}), [], "基线必须无背离，否则下面的构造用例失去意义");

  assert.match(
    at({ runningNode: "18.0.0" }).join("\n"),
    /正在跑的 Node 18\.0\.0 不满足 root 的 engines\.node/u,
    "运行时低于 engines.node 必须被命中",
  );
  assert.match(
    at({ installedVersions: { ...base.installedVersions, "@types/node": "26.1.1" } }).join("\n"),
    /@types\/node 实际装的是 26\.1\.1，不满足声明范围/u,
    "装了超出声明范围的版本必须被命中（本仓真实发生过：root 装成 26.1.1）",
  );
  assert.match(
    at({ installedVersions: { ...base.installedVersions, tsx: "4.0.0" } }).join("\n"),
    /tsx 实际装的是 4\.0\.0，与 lockfile 的 .+ 不一致/u,
    "装的版本与 lockfile 不一致必须被命中",
  );
  assert.match(
    at({ installedVersions: { ...base.installedVersions, typescript: undefined } }).join("\n"),
    /typescript 未安装/u,
    "依赖缺失必须被命中",
  );
  assert.match(
    at({ nodeVersionPin: "18" }).join("\n"),
    /@types\/node .*与 \.node-version 钉的 18 不一致/u,
    "types 主版本与 .node-version 脱钩必须被命中",
  );
});

test("semver 判定遇到没见过的范围形态必须抛错而不是静默放行", () => {
  assert.throws(() => satisfies("~1.2.3", "1.2.5"), /矩阵不认识的版本范围形态/u);
  assert.throws(() => satisfies(">=22 <25", "23.0.0"), /矩阵不认识的版本范围形态/u);
  // 正向：仓内实际出现的两种形态判定正确
  assert.equal(satisfies(">=22", "25.9.0"), true);
  assert.equal(satisfies(">=22", "21.0.0"), false);
  assert.equal(satisfies("^22.13.14", "22.20.1"), true);
  assert.equal(satisfies("^22.13.14", "26.1.1"), false);
  assert.equal(satisfies("^22.13.14", "22.13.13"), false);
});
