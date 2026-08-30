#!/usr/bin/env node
/**
 * Verify the repository's Node declarations and root verification graph.
 *
 * This checker deliberately has no package dependencies so it can diagnose a
 * fresh checkout before TypeScript or workspace packages are available.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MINIMUM_SUPPORTED_NODE_MAJOR = 22;
// 下列声明表是验证图的唯一真源并对外导出：toolchainContract.test.ts 与
// toolchain-runtime-matrix.test.mjs 一律 import 使用，不得再保留本地复制件（复制件曾漂移，
// 见 toolchainContract 的承重钉用例）。声明全部位于文件前部，先于任何使用点求值，无 TDZ 风险。
export const ROOT_TOOL_DEPENDENCIES = ["@types/node", "tsx", "typescript"];
export const TYPECHECK_COMMANDS = [
  "npm run verify:webplatform-contract",
  "npm --workspace @game/shared run typecheck",
  "npm --workspace @game/server run typecheck",
  "npm run typecheck:client",
  "npm run typecheck:client:legacy",
  "npm run verify:sync",
];
export const VERIFY_SYNC_COMMANDS = [
  "node scripts/sync-shared.mjs --check",
  "node scripts/sync-client.mjs --check",
];
export const VERIFY_CORE_COMMANDS = [
  "node scripts/verify-toolchain.mjs",
  "npm run verify:project",
  "npm run typecheck",
  "npm run verify:ecs",
  "npm run verify:vendor",
  "npm run verify:fgui",
  "npm run test:fgui",
  "npm run verify:inventory",
  "npm run test:inventory",
  "npm run test:launcher-matrix",
  "npm run test:npm-reference-matrix",
  "npm run test:aggregate-chain-matrix",
  "npm run test:sync-mirror-matrix",
  "npm run test:toolchain-runtime-matrix",
  "npm run verify:perf",
  "npm run test:client",
];
export const VERIFY_ALL_COMMANDS = [
  "npm run verify:core",
  "npm --workspace @game/server run test",
];
export const CLIENT_TEST_COMMAND =
  "cd apps/server && node --import tsx --test ../client/test/*.test.ts ../../scripts/vendor-lock.test.mjs";
export const FGUI_TEST_COMMAND =
  "cd apps/server && node --import tsx --test ../../scripts/fgui-manifest.test.mjs ../../tools/fgui-codegen/fgui-codegen.test.ts ../client/test/fguiContract.test.ts ../client/test/viewRegistry.test.ts";
export const INVENTORY_TEST_COMMAND = "node --test scripts/verify-inventory.test.mjs";
export const LAUNCHER_MATRIX_COMMAND = "node --test scripts/launcher-matrix.test.mjs";
export const NPM_REFERENCE_MATRIX_COMMAND = "node --test scripts/npm-reference-matrix.test.mjs";
export const AGGREGATE_CHAIN_MATRIX_COMMAND = "node --test scripts/aggregate-chain-matrix.test.mjs";
export const SYNC_MIRROR_MATRIX_COMMAND = "node --test scripts/sync-mirror-matrix.test.mjs";
export const TOOLCHAIN_RUNTIME_MATRIX_COMMAND = "node --test scripts/toolchain-runtime-matrix.test.mjs";

// 两张映射表同样是唯一真源并导出：toolchainContract 若本地重建 key 集合，新增链会静默无钉。
export const CHAIN_SCRIPTS = {
  typecheck: TYPECHECK_COMMANDS,
  "verify:sync": VERIFY_SYNC_COMMANDS,
  "verify:core": VERIFY_CORE_COMMANDS,
  "verify:all": VERIFY_ALL_COMMANDS,
};
export const EXACT_SCRIPTS = {
  "test:client": CLIENT_TEST_COMMAND,
  "test:fgui": FGUI_TEST_COMMAND,
  "test:inventory": INVENTORY_TEST_COMMAND,
  "test:launcher-matrix": LAUNCHER_MATRIX_COMMAND,
  "test:npm-reference-matrix": NPM_REFERENCE_MATRIX_COMMAND,
  "test:aggregate-chain-matrix": AGGREGATE_CHAIN_MATRIX_COMMAND,
  "test:sync-mirror-matrix": SYNC_MIRROR_MATRIX_COMMAND,
  "test:toolchain-runtime-matrix": TOOLCHAIN_RUNTIME_MATRIX_COMMAND,
};

/**
 * 被闸命令集合：四条聚合链脚本名 + 精确钉住的脚本名 + 链成员引用的根脚本名。
 * npm 对 `npm run X` 会先跑 `preX`、后跑 `postX`（若存在）——这些钩子不在 `&&` 链文本里，
 * 链条门禁只看文本、聚合矩阵只跑链本身，两边都看不见，等于给验证图留暗道。失败关闭：
 * 根 package.json 不得为任何被闸命令定义 pre-/post- 前缀变体。
 */
const GATED_SCRIPT_NAMES = new Set([
  ...Object.keys(CHAIN_SCRIPTS),
  ...Object.keys(EXACT_SCRIPTS),
  ...Object.values(CHAIN_SCRIPTS)
    .flat()
    .map((command) => /^npm run ([A-Za-z0-9:_-]+)$/u.exec(command)?.[1])
    .filter((name) => name !== undefined),
]);

function requireNoLifecycleHooks(scripts, errors) {
  for (const name of Object.keys(scripts ?? {})) {
    const base = name.startsWith("pre") ? name.slice(3)
      : name.startsWith("post") ? name.slice(4) : null;
    if (base !== null && GATED_SCRIPT_NAMES.has(base)) {
      errors.push(
        `package.json scripts.${name} 是被闸命令 ${base} 的 npm 生命周期钩子：`
        + `它随 \`npm run ${base}\` 隐式执行，链条文本门禁与聚合矩阵均不可见，必须移除或改名`,
      );
    }
  }
}

function parseArgs(argv) {
  let root;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      if (root !== undefined) throw new Error("参数重复：--root");
      if (index + 1 >= argv.length || argv[index + 1] === "") throw new Error("--root 需要目录参数");
      root = argv[++index];
    } else if (arg.startsWith("--root=")) {
      if (root !== undefined) throw new Error("参数重复：--root");
      root = arg.slice("--root=".length);
      if (!root) throw new Error("--root 需要目录参数");
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("用法：node scripts/verify-toolchain.mjs [--root <目录>] [--json]");
      return { help: true };
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return { root: root ? path.resolve(process.cwd(), root) : ROOT, json };
}

function readRegularText(root, relative, errors) {
  const file = path.join(root, relative);
  let stat;
  try { stat = fs.lstatSync(file); } catch { stat = null; }
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
    errors.push(`${relative} 必须是普通文件（不得是符号链接）`);
    return null;
  }
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    errors.push(`${relative} 无法读取：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function readJson(root, relative, errors) {
  const source = readRegularText(root, relative, errors);
  if (source === null) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`${relative} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function nodeVersionMajor(source, errors) {
  if (source === null) return null;
  const value = source.trim();
  const match = /^(\d+)(?:\.(\d+)(?:\.(\d+))?)?$/.exec(value);
  if (!match) {
    errors.push(".node-version 必须是 Node 数字版本（例如 22 或 22.14.0）");
    return null;
  }
  const major = Number(match[1]);
  if (!Number.isSafeInteger(major) || major < MINIMUM_SUPPORTED_NODE_MAJOR) {
    errors.push(`.node-version 主版本不得低于 ${MINIMUM_SUPPORTED_NODE_MAJOR}`);
    return null;
  }
  return major;
}

function engineMinimumMajor(range) {
  if (typeof range !== "string") return null;
  const match = /^>=\s*(\d+)(?:\.\d+){0,2}(?:\s|$)/.exec(range.trim());
  return match ? Number(match[1]) : null;
}

function dependencyMajor(range) {
  if (typeof range !== "string") return null;
  const match = /^(?:[~^]|>=)?\s*(\d+)(?:\.\d+){0,2}(?:\s|$)/.exec(range.trim());
  return match ? Number(match[1]) : null;
}

function parseVersion(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(value.trim());
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function versionSatisfies(range, version) {
  if (typeof range !== "string") return false;
  const match = /^(\^|~|>=)?\s*(\d+)\.(\d+)\.(\d+)$/.exec(range.trim());
  const actual = parseVersion(version);
  if (!match || !actual) return false;
  const operator = match[1] ?? "=";
  const requested = match.slice(2).map(Number);
  if (compareVersions(actual, requested) < 0) return false;
  if (operator === ">=") return true;
  if (operator === "~") return actual[0] === requested[0] && actual[1] === requested[1];
  if (operator === "^") {
    if (requested[0] > 0) return actual[0] === requested[0];
    if (requested[1] > 0) return actual[0] === 0 && actual[1] === requested[1];
    return actual[0] === 0 && actual[1] === 0 && actual[2] === requested[2];
  }
  return compareVersions(actual, requested) === 0;
}

function splitCommandChain(script) {
  if (typeof script !== "string") return null;
  return script.split("&&").map((part) => part.trim()).filter(Boolean);
}

function requireCommandChain(scriptName, script, expected, errors) {
  const actual = splitCommandChain(script);
  if (actual === null) {
    errors.push(`package.json scripts.${scriptName} 必须存在`);
    return;
  }

  for (const command of expected) {
    const count = actual.filter((candidate) => candidate === command).length;
    if (count === 0) {
      errors.push(`package.json scripts.${scriptName} 缺少聚合命令 \`${command}\``);
    } else if (count > 1) {
      errors.push(`package.json scripts.${scriptName} 重复聚合命令 \`${command}\``);
    }
  }
  for (const command of new Set(actual)) {
    if (!expected.includes(command)) {
      errors.push(`package.json scripts.${scriptName} 包含未登记聚合命令 \`${command}\``);
    }
  }
  if (actual.length === expected.length && actual.some((command, index) => command !== expected[index])) {
    errors.push(`package.json scripts.${scriptName} 聚合命令顺序必须为：${expected.join(" -> ")}`);
  }
}

function requireExactScript(scriptName, script, expected, errors) {
  if (script !== expected) {
    errors.push(`package.json scripts.${scriptName} 必须精确为 \`${expected}\``);
  }
}

export function verifyToolchain(root = ROOT) {
  const errors = [];
  let rootStat;
  try { rootStat = fs.lstatSync(root); } catch { rootStat = null; }
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    return { ok: false, errors: ["项目根必须是普通目录（不得是符号链接）"] };
  }

  const pinnedMajor = nodeVersionMajor(readRegularText(root, ".node-version", errors), errors);
  const rootPackage = readJson(root, "package.json", errors);
  const serverPackage = readJson(root, "apps/server/package.json", errors);
  const lock = readJson(root, "package-lock.json", errors);
  readRegularText(root, "apps/client/test/toolchainContract.test.ts", errors);

  const rootEngine = rootPackage?.engines?.node;
  const serverEngine = serverPackage?.engines?.node;
  const rootEngineMajor = engineMinimumMajor(rootEngine);
  if (rootEngineMajor === null) {
    errors.push("package.json engines.node 必须以 >=<版本> 声明最低 Node 版本");
  } else if (pinnedMajor !== null && rootEngineMajor !== pinnedMajor) {
    errors.push(`package.json engines.node 最低主版本 ${rootEngineMajor} 与 .node-version ${pinnedMajor} 不一致`);
  }
  if (serverEngine !== rootEngine) {
    errors.push("apps/server/package.json engines.node 必须与根 package.json 完全一致");
  }

  const rootTools = rootPackage?.devDependencies;
  const serverTools = serverPackage?.devDependencies;
  const rootNodeTypes = rootTools?.["@types/node"];
  const nodeTypesMajor = dependencyMajor(rootNodeTypes);
  if (nodeTypesMajor === null) {
    errors.push("根 package.json 必须声明可识别的 @types/node 版本范围");
  } else if (pinnedMajor !== null && nodeTypesMajor !== pinnedMajor) {
    errors.push(`@types/node 主版本 ${nodeTypesMajor} 与 .node-version ${pinnedMajor} 不一致`);
  }

  const rootLock = lock?.packages?.[""];
  const serverLock = lock?.packages?.["apps/server"];
  if (!rootLock || !serverLock) {
    errors.push("package-lock.json 缺少根或 apps/server package 投影");
  } else {
    if (rootLock.engines?.node !== rootEngine) {
      errors.push("package-lock.json 根 engines.node 与 package.json 不一致");
    }
    if (serverLock.engines?.node !== serverEngine) {
      errors.push("package-lock.json apps/server engines.node 与 apps/server/package.json 不一致");
    }
  }

  for (const dependency of ROOT_TOOL_DEPENDENCIES) {
    const rootRange = rootTools?.[dependency];
    const serverRange = serverTools?.[dependency];
    if (typeof rootRange !== "string") {
      errors.push(`根 package.json 必须显式声明 devDependencies.${dependency}`);
      continue;
    }
    if (serverRange !== rootRange) {
      errors.push(`apps/server 与根 package.json 的 ${dependency} 版本范围必须完全一致`);
    }
    if (rootLock && rootLock.devDependencies?.[dependency] !== rootRange) {
      errors.push(`package-lock.json 根 ${dependency} 投影与 package.json 不一致`);
    }
    if (serverLock && serverLock.devDependencies?.[dependency] !== serverRange) {
      errors.push(`package-lock.json apps/server ${dependency} 投影与 apps/server/package.json 不一致`);
    }

    const resolved = lock?.packages?.[`node_modules/${dependency}`]?.version;
    if (typeof resolved !== "string") {
      errors.push(`package-lock.json 缺少 node_modules/${dependency} 解析结果`);
    } else if (!versionSatisfies(rootRange, resolved)) {
      errors.push(`package-lock.json 的 ${dependency}@${resolved} 不满足根声明 ${rootRange}`);
    }
  }

  const scripts = rootPackage?.scripts;
  for (const [scriptName, expected] of Object.entries(CHAIN_SCRIPTS)) {
    requireCommandChain(scriptName, scripts?.[scriptName], expected, errors);
  }
  for (const [scriptName, expected] of Object.entries(EXACT_SCRIPTS)) {
    requireExactScript(scriptName, scripts?.[scriptName], expected, errors);
  }
  requireNoLifecycleHooks(scripts, errors);

  return { ok: errors.length === 0, errors, nodeMajor: pinnedMajor ?? undefined };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) return;
    const result = verifyToolchain(args.root);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      if (!args.json) {
        console.error(`[verify-toolchain] ✘ ${result.errors.length} 处问题：`);
        for (const error of result.errors) console.error(`  - ${error}`);
      }
      process.exitCode = 1;
      return;
    }
    if (!args.json) console.log(`[verify-toolchain] ✔ Node ${result.nodeMajor}.x 声明、锁文件与验证聚合一致`);
  } catch (error) {
    console.error(`[verify-toolchain] ✘ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
