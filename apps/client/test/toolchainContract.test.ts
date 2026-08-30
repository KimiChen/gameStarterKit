/**
 * Node declaration and root verification-graph regression checks.
 *
 * 链条声明表（TYPECHECK/VERIFY_SYNC/VERIFY_CORE/VERIFY_ALL）与精确脚本命令文本的唯一真源是
 * scripts/verify-toolchain.mjs 的导出常量，本文件一律 import，不留本地复制件——复制件曾
 * 实际漂移（缺 5 条矩阵命令），让「逐条删除必红」用例对 verify:core 段失去判别力（反例红，
 * 但红在缺的 5 条上，而不是红在被删的那条上）。唯一例外是 `CHAIN_LOAD_BEARING` 与
 * `EXACT_LOAD_BEARING` 两组承重钉：它们是刻意保留、靠双向 `deepEqual` 守门的第二份副本
 * （见其注释），不得改成 import。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ROOT_TOOL_DEPENDENCIES,
  VERIFY_CORE_COMMANDS,
  CHAIN_SCRIPTS,
  EXACT_SCRIPTS,
} from "../../../scripts/verify-toolchain.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const VERIFY_SCRIPT = join(ROOT, "scripts/verify-toolchain.mjs");
/**
 * 夹具只需给出每个工具依赖的版本号取值；「闸哪些工具」沿用导入的 ROOT_TOOL_DEPENDENCIES。
 * verify-toolchain 新增第 4 个工具时这里取到 undefined，夹具随之缺声明、基线断言立刻红——
 * 失败关闭，提醒同步补版本号。
 */
const TOOL_VERSIONS: Record<string, string> = {
  "@types/node": "^22.13.14",
  tsx: "^4.21.0",
  typescript: "^5.9.3",
};
const TOOL_DEPENDENCIES = Object.fromEntries(
  ROOT_TOOL_DEPENDENCIES.map((dependency) => [dependency, TOOL_VERSIONS[dependency]]),
);

type JsonRecord = Record<string, any>;

function writeJson(root: string, relative: string, value: JsonRecord): void {
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "toolchain-contract-"));
  const rootPackage = {
    scripts: {
      ...Object.fromEntries(Object.entries(CHAIN_SCRIPTS).map(([name, commands]) => [name, commands.join(" && ")])),
      ...EXACT_SCRIPTS,
    },
    engines: { node: ">=22" },
    devDependencies: TOOL_DEPENDENCIES,
  };
  const serverPackage = {
    engines: { node: ">=22" },
    devDependencies: TOOL_DEPENDENCIES,
  };
  writeFileSync(join(root, ".node-version"), "22\n");
  writeJson(root, "package.json", rootPackage);
  writeJson(root, "apps/server/package.json", serverPackage);
  mkdirSync(join(root, "apps/client/test"), { recursive: true });
  writeFileSync(join(root, "apps/client/test/toolchainContract.test.ts"), "// fixture\n");
  writeJson(root, "package-lock.json", {
    packages: {
      "": {
        engines: rootPackage.engines,
        devDependencies: rootPackage.devDependencies,
      },
      "apps/server": {
        engines: serverPackage.engines,
        devDependencies: serverPackage.devDependencies,
      },
      "node_modules/@types/node": { version: "22.20.1" },
      "node_modules/tsx": { version: "4.23.0" },
      "node_modules/typescript": { version: "5.9.3" },
    },
  });
  return root;
}

function runVerifierFile(script: string, root: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [script, "--root", root], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

function runVerifier(root: string): { status: number | null; output: string } {
  return runVerifierFile(VERIFY_SCRIPT, root);
}

/** 把打了补丁的 verify-toolchain 副本写进夹具，用于演「声明表被改」方向的反例。 */
function writePatchedVerifier(root: string, patch: (source: string) => string): string {
  const source = readFileSync(VERIFY_SCRIPT, "utf8");
  const semantic = patch(source);
  assert.notEqual(semantic, source, "补丁必须真实改动 verify-toolchain.mjs 源文本，否则该用例在空转");
  // 副本落在 os 临时目录里；macOS 的 tmpdir 是符号链接，isMain 守卫（argv[1] 与
  // import.meta.url 的字符串比较）此时不成立、main 不会自动跑——副本必须把守卫调用
  // 改成无条件调用，否则进程静默 exit 0，反例假红。
  const patched = semantic.replace("if (isMain) main();", "main();");
  assert.notEqual(patched, semantic, "isMain 守卫替换失败——verify-toolchain.mjs 的驱动段结构变了？");
  const file = join(root, "verify-toolchain.patched.mjs");
  writeFileSync(file, patched);
  return file;
}

/**
 * 夹具前提：未变异的夹具必须全绿。历史上夹具用本地复制件搭、比声明表缺 5 条命令，
 * 导致每个反例都红在「缺 5 条」上——断言全过却毫无判别力。每个反例套件开头先钉一次基线。
 */
function assertFixtureGreen(): void {
  const root = createFixture();
  try {
    const result = runVerifier(root);
    assert.equal(
      result.status,
      0,
      `夹具前提失效：未变异夹具必须全绿，否则本套件全部反例都在空转：\n${result.output}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * 四条链的承重命令钉。声明表与 package.json 链若被「合谋式同删」，verifier 与
 * 「逐条删除」用例都消费同一张导入表、会一起继续全绿——这组独立的成员资格断言是第三锚点。
 *
 * ⚠ 这份清单是**刻意保留的第二份副本**，靠下方的双向 `deepEqual` 防漂移，**禁止改成 import**。
 * `5648579` 清掉的那份旧复制件之所以能静默漂移掉 5 条矩阵命令，正是因为它只被用来搭夹具、
 * 从未被断言与真源相等——单源化解决的是「无人比对的副本」，不是「所有副本」。
 * 每条链都必须**逐条覆盖**对应声明表：只钉一部分等于给没钉的那些留合谋暗道
 * （曾只钉 verify:core 的 6/16，`npm run verify:ecs` 这条铁律 1 的唯一守门命令就在没钉的一半里）。
 *
 * 四条链都要钉，不能只钉 verify:core：`docs/inventory.json` 的交叉锚定（第四锚点）只对
 * `verify:core` 生效——`typecheck` / `verify:sync` 的 `verification.requires` 为空、
 * `verify:all` 根本未登记，「未实际覆盖」检查对空列表不产生任何断言。那三条链在补上本钉之前
 * 是**零兜底**的。
 */
const CHAIN_LOAD_BEARING: Record<string, string[]> = {
  "typecheck": [
    "npm run verify:webplatform-contract",
    "npm --workspace @game/shared run typecheck",
    "npm --workspace @game/server run typecheck",
    "npm run typecheck:client",
    "npm run typecheck:client:legacy",
    "npm run verify:sync",
  ],
  "verify:sync": [
    "node scripts/sync-shared.mjs --check",
    "node scripts/sync-client.mjs --check",
  ],
  "verify:core": [
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
  ],
  "verify:all": [
    "npm run verify:core",
    "npm --workspace @game/server run test",
  ],
};

/**
 * 八条精确脚本文本的承重钉。与 CHAIN_LOAD_BEARING 同型：刻意保留的第二份副本、禁止改成
 * import——「双侧同改」（常量与 package.json 同步改写，例如收窄 `test:client` 的测试 glob）
 * 此前实测全绿，无人拦截。精确文本里含测试文件 glob 与路径，是覆盖面的最后防线。
 */
const EXACT_LOAD_BEARING: Record<string, string> = {
  "test:client":
    "cd apps/server && node --import tsx --test ../client/test/*.test.ts ../../scripts/vendor-lock.test.mjs",
  "test:fgui":
    "cd apps/server && node --import tsx --test ../../scripts/fgui-manifest.test.mjs ../../tools/fgui-codegen/fgui-codegen.test.ts ../client/test/fguiContract.test.ts ../client/test/viewRegistry.test.ts",
  "test:inventory": "node --test scripts/verify-inventory.test.mjs",
  "test:launcher-matrix": "node --test scripts/launcher-matrix.test.mjs",
  "test:npm-reference-matrix": "node --test scripts/npm-reference-matrix.test.mjs",
  "test:aggregate-chain-matrix": "node --test scripts/aggregate-chain-matrix.test.mjs",
  "test:sync-mirror-matrix": "node --test scripts/sync-mirror-matrix.test.mjs",
  "test:toolchain-runtime-matrix": "node --test scripts/toolchain-runtime-matrix.test.mjs",
};

function missingLoadBearing(chain: string, table: string[]): string[] {
  return CHAIN_LOAD_BEARING[chain].filter((command) => !table.includes(command));
}

type InventoryCommand = { kind?: string; script?: string; workspace?: string; requires?: InventoryCommand[] };

/** docs/inventory.json 中登记在指定聚合链节点下的直接 requires（只读；该文件由 inventory 门禁维护）。 */
function inventoryChainRequires(chainScript: string): InventoryCommand[] {
  const inventory = JSON.parse(readFileSync(join(ROOT, "docs/inventory.json"), "utf8")) as JsonRecord;
  const found: InventoryCommand[] = [];
  const visit = (node: InventoryCommand): void => {
    if (node.kind === "root" && node.script === chainScript) found.push(...(node.requires ?? []));
    for (const requirement of node.requires ?? []) visit(requirement);
  };
  for (const capability of (inventory.capabilities ?? []) as Array<{ verification?: InventoryCommand[] }>) {
    for (const command of capability.verification ?? []) visit(command);
  }
  return found;
}

function chainCommandText(command: InventoryCommand): string {
  return command.kind === "root"
    ? `npm run ${command.script}`
    : `npm --workspace ${command.workspace} run ${command.script}`;
}

function removeChainCommand(root: string, script: string, command: string): void {
  editJson(root, "package.json", (pkg) => {
    pkg.scripts[script] = (pkg.scripts[script] as string)
      .split("&&")
      .map((part: string) => part.trim())
      .filter((part: string) => part !== command)
      .join(" && ");
  });
}

function editJson(root: string, relative: string, edit: (value: JsonRecord) => void): void {
  const file = join(root, relative);
  const value = JSON.parse(readFileSync(file, "utf8")) as JsonRecord;
  edit(value);
  writeJson(root, relative, value);
}

test("toolchain contract accepts the checked-in Node and verification declarations", () => {
  const result = runVerifier(ROOT);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Node 22\.x 声明、锁文件与验证聚合一致/);
});

test("toolchain contract rejects Node declaration and lock projection drift", () => {
  assertFixtureGreen();
  const cases: Array<{
    name: string;
    mutate(root: string): void;
    expected: RegExp;
  }> = [
    {
      name: "missing .node-version",
      mutate: (root) => rmSync(join(root, ".node-version")),
      expected: /\.node-version 必须是普通文件/,
    },
    {
      name: "missing toolchain contract suite",
      mutate: (root) => rmSync(join(root, "apps/client/test/toolchainContract.test.ts")),
      expected: /apps\/client\/test\/toolchainContract\.test\.ts 必须是普通文件/,
    },
    {
      name: "missing root engine declaration",
      mutate: (root) => editJson(root, "package.json", (pkg) => { delete pkg.engines.node; }),
      expected: /package\.json engines\.node 必须以 >=<版本> 声明最低 Node 版本/,
    },
    {
      name: "server engine drift",
      mutate: (root) => editJson(root, "apps/server/package.json", (pkg) => { pkg.engines.node = ">=23"; }),
      expected: /apps\/server\/package\.json engines\.node 必须与根 package\.json 完全一致/,
    },
    {
      name: "types major drift",
      mutate: (root) => editJson(root, "package.json", (pkg) => { pkg.devDependencies["@types/node"] = "^23.0.0"; }),
      expected: /@types\/node 主版本 23 与 \.node-version 22 不一致/,
    },
    ...Object.keys(TOOL_DEPENDENCIES).flatMap((dependency) => [
      {
        name: `missing root ${dependency}`,
        mutate: (root: string) => editJson(root, "package.json", (pkg) => { delete pkg.devDependencies[dependency]; }),
        expected: new RegExp(`根 package\\.json 必须显式声明 devDependencies\\.${dependency.replace("@", "\\@")}`),
      },
      {
        name: `server ${dependency} drift`,
        mutate: (root: string) => editJson(root, "apps/server/package.json", (pkg) => {
          pkg.devDependencies[dependency] = "^99.0.0";
        }),
        expected: new RegExp(`apps/server 与根 package\\.json 的 ${dependency.replace("@", "\\@")} 版本范围必须完全一致`),
      },
      {
        name: `missing root lock projection for ${dependency}`,
        mutate: (root: string) => editJson(root, "package-lock.json", (lock) => {
          delete lock.packages[""].devDependencies[dependency];
        }),
        expected: new RegExp(`package-lock\\.json 根 ${dependency.replace("@", "\\@")} 投影与 package\\.json 不一致`),
      },
      {
        name: `missing server lock projection for ${dependency}`,
        mutate: (root: string) => editJson(root, "package-lock.json", (lock) => {
          delete lock.packages["apps/server"].devDependencies[dependency];
        }),
        expected: new RegExp(`package-lock\\.json apps/server ${dependency.replace("@", "\\@")} 投影与 apps/server/package\\.json 不一致`),
      },
      {
        name: `missing resolved lock entry for ${dependency}`,
        mutate: (root: string) => editJson(root, "package-lock.json", (lock) => {
          delete lock.packages[`node_modules/${dependency}`];
        }),
        expected: new RegExp(`package-lock\\.json 缺少 node_modules/${dependency.replace("@", "\\@")} 解析结果`),
      },
    ]),
    {
      name: "stale lock engine",
      mutate: (root) => editJson(root, "package-lock.json", (lock) => { lock.packages[""].engines.node = ">=20"; }),
      expected: /package-lock\.json 根 engines\.node 与 package\.json 不一致/,
    },
    {
      name: "missing server lock engine",
      mutate: (root) => editJson(root, "package-lock.json", (lock) => {
        delete lock.packages["apps/server"].engines.node;
      }),
      expected: /package-lock\.json apps\/server engines\.node 与 apps\/server\/package\.json 不一致/,
    },
    {
      name: "resolved tool version outside declared range",
      mutate: (root) => editJson(root, "package-lock.json", (lock) => {
        lock.packages["node_modules/typescript"].version = "6.0.0";
      }),
      expected: /typescript@6\.0\.0 不满足根声明 \^5\.9\.3/,
    },
  ];

  for (const fixtureCase of cases) {
    const root = createFixture();
    try {
      fixtureCase.mutate(root);
      const result = runVerifier(root);
      assert.notEqual(result.status, 0, `${fixtureCase.name} unexpectedly passed`);
      assert.match(result.output, fixtureCase.expected, `${fixtureCase.name}: ${result.output}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("toolchain contract rejects removal of every command in the verification graph", () => {
  assertFixtureGreen();
  const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const graphCases = Object.entries(CHAIN_SCRIPTS).flatMap(([script, commands]) =>
    commands.map((command) => ({ script, command })),
  );

  for (const graphCase of graphCases) {
    const root = createFixture();
    try {
      removeChainCommand(root, graphCase.script, graphCase.command);
      const result = runVerifier(root);
      assert.notEqual(result.status, 0, `${graphCase.script} without ${graphCase.command} unexpectedly passed`);
      assert.match(
        result.output,
        new RegExp(`${graphCase.script.replace(":", "\\:")} 缺少聚合命令 \`${escapeRegExp(graphCase.command)}\``),
        `失败必须点名被删的那条命令，而不是被别的缺口兜底：\n${result.output}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("toolchain contract rejects weakened negative-test entrypoints and duplicate inherited gates", () => {
  assertFixtureGreen();
  const cases: Array<{ name: string; edit(scripts: JsonRecord): void; expected: RegExp }> = [
    {
      name: "client suite no longer covers every client contract test",
      edit: (scripts) => { scripts["test:client"] = "node --test selected.test.ts"; },
      expected: /scripts\.test:client 必须精确为/,
    },
    {
      name: "manifest negative suite omitted from FGUI tests",
      edit: (scripts) => { scripts["test:fgui"] = "node --test fgui-codegen.test.ts"; },
      expected: /scripts\.test:fgui 必须精确为/,
    },
    {
      name: "inventory negative suite omitted",
      edit: (scripts) => { scripts["test:inventory"] = "node scripts/verify-inventory.mjs"; },
      expected: /scripts\.test:inventory 必须精确为/,
    },
    {
      name: "client test duplicated in all",
      edit: (scripts) => { scripts["verify:all"] += " && npm run test:client"; },
      expected: /scripts\.verify:all 包含未登记聚合命令 `npm run test:client`/,
    },
  ];

  for (const fixtureCase of cases) {
    const root = createFixture();
    try {
      editJson(root, "package.json", (pkg) => fixtureCase.edit(pkg.scripts));
      const result = runVerifier(root);
      assert.notEqual(result.status, 0, `${fixtureCase.name} unexpectedly passed`);
      assert.match(result.output, fixtureCase.expected, `${fixtureCase.name}: ${result.output}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("toolchain contract rejects declaration-table shrinkage in the opposite direction", () => {
  // 反方向的判别力：声明表（verify-toolchain.mjs 内）删一条、package.json 链不动，
  // requireCommandChain 必须以「包含未登记聚合命令」报红。用打补丁的 verifier 副本演这一刀，
  // 真源文件不动。
  const victim = "npm run test:client";
  const root = createFixture();
  try {
    const patched = writePatchedVerifier(root, (source) =>
      source.replace(`\n  ${JSON.stringify(victim)},`, ""));
    const result = runVerifierFile(patched, root);
    assert.notEqual(result.status, 0, "声明表删一条而链不动必须红");
    assert.match(result.output, /verify:core 包含未登记聚合命令 `npm run test:client`/, result.output);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("toolchain contract pins load-bearing chain members against silent removal", () => {
  // 钉表与声明表的链 key 集合也必须双向相等：新增链不打钉、或钉表多钉不存在的链，都立即红。
  assert.deepEqual(
    Object.keys(CHAIN_SCRIPTS).sort(),
    Object.keys(CHAIN_LOAD_BEARING).sort(),
    "新增链必须同步打钉（钉表与声明表的链集合双向相等）",
  );
  for (const [chain, declared] of Object.entries(CHAIN_SCRIPTS)) {
    assert.deepEqual(
      [...declared].sort(),
      [...CHAIN_LOAD_BEARING[chain]].sort(),
      `${chain} 声明表与承重钉不一致——声明表与 package.json 链同删（或单方新增）时本断言必须红`,
    );
  }
  // 第四锚点交叉锚定：docs/inventory.json 登记由 verify:core 覆盖的命令必须仍在声明表里。
  // 三方同删（声明表 + 链 + 上方承重钉）之后，是 verify-inventory 的「未实际覆盖」兜底。
  const dangling = inventoryChainRequires("verify:core")
    .map(chainCommandText)
    .filter((command) => !VERIFY_CORE_COMMANDS.includes(command));
  assert.deepEqual(
    dangling,
    [],
    "docs/inventory.json 登记由 verify:core 覆盖、但已不在声明表中的命令",
  );
});

test("toolchain contract fails closed on workspace lifecycle hooks of gated commands", () => {
  // 链里有三条 workspace 命令（shared/server 的 typecheck、server 的 test）。给 workspace
  // 加钩子再按命令表要求登记——一串看起来完全正当的操作——曾让两道门禁双双放行，而真实 npm
  // 确实会跑那个钩子。夹具默认没有 workspaces 字段（workspace 检查随之 no-op），这里显式补上。
  for (const [location, name, hook] of [
    ["apps/server", "@game/server", "pretest"],
    ["apps/shared", "@game/shared", "posttypecheck"],
  ]) {
    const root = createFixture();
    try {
      editJson(root, "package.json", (pkg) => { pkg.workspaces = ["apps/server", "apps/shared"]; });
      writeJson(root, `${location}/package.json`, {
        name,
        engines: { node: ">=22" },
        scripts: { [hook]: "node -e \"process.exit(0)\"" },
      });
      const result = runVerifier(root);
      assert.notEqual(result.status, 0, `${location} 的 ${hook} 未被拒绝`);
      assert.match(
        result.output,
        new RegExp(`${location}/package\\.json scripts\\.${hook} 是被闸命令`),
        `${location} 的 ${hook} 必须被 workspace 生命周期钩子检查点名：\n${result.output}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("toolchain contract leaves non-gated workspace scripts alone", () => {
  // 反向锁：workspace 里非被闸命令的钩子（smoke 不在任何链里）不得误伤。
  const root = createFixture();
  try {
    editJson(root, "package.json", (pkg) => { pkg.workspaces = ["apps/server"]; });
    writeJson(root, "apps/server/package.json", {
      name: "@game/server",
      engines: { node: ">=22" },
      devDependencies: TOOL_DEPENDENCIES,
      scripts: { presmoke: "node -e \"process.exit(0)\"" },
    });
    const result = runVerifier(root);
    assert.equal(result.status, 0, `非被闸 workspace 钩子被误伤：\n${result.output}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("toolchain contract pins exact script bodies against collusive rewrite", () => {
  // 精确脚本文本（含测试 glob 与路径）是覆盖面的最后防线：常量与 package.json 双侧同改
  // 此前实测全绿。双向 deepEqual（Record 结构比较不依赖 key 顺序，双方多/少/改都红）。
  assert.deepEqual(
    EXACT_SCRIPTS,
    EXACT_LOAD_BEARING,
    "EXACT_SCRIPTS 与承重钉不一致——精确脚本文本双侧同改（或单方改）时本断言必须红",
  );
  // ⚠ 这条 key 集合断言对**值为 undefined**零判别力（key 照样在）；真正拦住值被清空的是
  // 上面那条值比较断言——不得为了「简化」把它删掉只留 key 比较。
  assert.deepEqual(
    Object.keys(EXACT_SCRIPTS).sort(),
    Object.keys(EXACT_LOAD_BEARING).sort(),
    "新增精确脚本必须同步打钉（key 集合双向相等）",
  );
});

test("toolchain contract catches collusive deletion from both declaration table and chain", () => {
  const victim = "npm run test:client";
  const root = createFixture();
  try {
    // 合谋现场：打补丁的 verifier 删掉声明表条目，夹具链删掉同一条命令。
    const patched = writePatchedVerifier(root, (source) =>
      source.replace(`\n  ${JSON.stringify(victim)},`, ""));
    removeChainCommand(root, "verify:core", victim);
    const blind = runVerifierFile(patched, root);
    assert.equal(
      blind.status,
      0,
      `前提：声明表与链同删后 verifier 自身依旧全绿（它只比对双方文本）——这正是承重钉存在的理由：\n${blind.output}`,
    );
    // 兜底一：承重钉立即命中被删命令（上一条用例随之变红）。
    assert.ok(
      missingLoadBearing("verify:core", VERIFY_CORE_COMMANDS.filter((command) => command !== victim)).includes(victim),
      "合谋删掉承重命令必须被承重钉清单命中",
    );
    // 兜底二：inventory 登记不随声明表漂移，verify-inventory 会报「未实际覆盖声明的验证命令」。
    assert.ok(
      inventoryChainRequires("verify:core").some((command) => command.kind === "root" && command.script === "test:client"),
      "前提：test:client 必须仍登记在 docs/inventory.json 的 verify:core requires 里",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("toolchain contract fails closed on npm pre/post lifecycle hooks of gated commands", () => {
  // npm 对 `npm run X` 会隐式先跑 preX、后跑 postX；钩子不在 && 链文本里，链条门禁与
  // 聚合矩阵都看不见。仓内今天没有任何钩子，加上即拒。
  // 用例从声明表**全量派生**，不再硬编码 3 个样例：那 3 个恰好全落在 CHAIN/EXACT 的 key 上，
  // 永远碰不到「链成员引用的根脚本名」那一段派生逻辑——删掉那段实测全绿。
  const gatedFromChains = [...new Set(
    Object.values(CHAIN_SCRIPTS).flat()
      .map((command) => /^npm run ([A-Za-z0-9:_-]+)$/u.exec(command)?.[1])
      .filter((name): name is string => name !== undefined),
  )];
  const cases = [
    ...Object.keys(CHAIN_SCRIPTS).map((name) => `pre${name}`),
    ...Object.keys(EXACT_SCRIPTS).map((name) => `post${name}`),
    ...gatedFromChains.map((name) => `pre${name}`),
  ];
  for (const hook of cases) {
    const root = createFixture();
    try {
      editJson(root, "package.json", (pkg) => { pkg.scripts[hook] = "node -e \"process.exit(0)\""; });
      const result = runVerifier(root);
      assert.notEqual(result.status, 0, `${hook} unexpectedly passed`);
      assert.match(
        result.output,
        new RegExp(`scripts\\.${hook.replace(":", "\\:")} 是被闸命令`),
        `${hook} 必须被生命周期钩子检查点名：\n${result.output}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
