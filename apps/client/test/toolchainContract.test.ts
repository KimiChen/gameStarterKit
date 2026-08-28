/** Node declaration and root verification-graph regression checks. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const VERIFY_SCRIPT = join(ROOT, "scripts/verify-toolchain.mjs");
const TYPECHECK_COMMANDS = [
  "npm run verify:webplatform-contract",
  "npm --workspace @game/shared run typecheck",
  "npm --workspace @game/server run typecheck",
  "npm run typecheck:client",
  "npm run typecheck:client:legacy",
  "npm run verify:sync",
];
const VERIFY_SYNC_COMMANDS = [
  "node scripts/sync-shared.mjs --check",
  "node scripts/sync-client.mjs --check",
];
const VERIFY_CORE_COMMANDS = [
  "node scripts/verify-toolchain.mjs",
  "npm run verify:project",
  "npm run typecheck",
  "npm run verify:ecs",
  "npm run verify:vendor",
  "npm run verify:fgui",
  "npm run test:fgui",
  "npm run verify:inventory",
  "npm run test:inventory",
  "npm run verify:perf",
  "npm run test:client",
];
const VERIFY_ALL_COMMANDS = [
  "npm run verify:core",
  "npm --workspace @game/server run test",
];
const TOOL_DEPENDENCIES = {
  "@types/node": "^22.13.14",
  tsx: "^4.21.0",
  typescript: "^5.9.3",
};

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
      typecheck: TYPECHECK_COMMANDS.join(" && "),
      "verify:sync": VERIFY_SYNC_COMMANDS.join(" && "),
      "test:client": "cd apps/server && node --import tsx --test ../client/test/*.test.ts ../../scripts/vendor-lock.test.mjs",
      "test:fgui": "cd apps/server && node --import tsx --test ../../scripts/fgui-manifest.test.mjs ../../tools/fgui-codegen/fgui-codegen.test.ts ../client/test/fguiContract.test.ts ../client/test/viewRegistry.test.ts",
      "test:inventory": "node --test scripts/verify-inventory.test.mjs",
      "verify:core": VERIFY_CORE_COMMANDS.join(" && "),
      "verify:all": VERIFY_ALL_COMMANDS.join(" && "),
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

function runVerifier(root: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [VERIFY_SCRIPT, "--root", root], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
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
  const graphCases = [
    ...TYPECHECK_COMMANDS.map((command) => ({ script: "typecheck", command })),
    ...VERIFY_SYNC_COMMANDS.map((command) => ({ script: "verify:sync", command })),
    ...VERIFY_CORE_COMMANDS.map((command) => ({ script: "verify:core", command })),
    ...VERIFY_ALL_COMMANDS.map((command) => ({ script: "verify:all", command })),
  ];

  for (const graphCase of graphCases) {
    const root = createFixture();
    try {
      editJson(root, "package.json", (pkg) => {
        pkg.scripts[graphCase.script] = pkg.scripts[graphCase.script]
          .split("&&")
          .map((part: string) => part.trim())
          .filter((part: string) => part !== graphCase.command)
          .join(" && ");
      });
      const result = runVerifier(root);
      assert.notEqual(result.status, 0, `${graphCase.script} without ${graphCase.command} unexpectedly passed`);
      assert.match(result.output, new RegExp(`${graphCase.script.replace(":", "\\:")} 缺少聚合命令`), result.output);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("toolchain contract rejects weakened negative-test entrypoints and duplicate inherited gates", () => {
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
