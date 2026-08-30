import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERIFY_SCRIPT = join(REPO_ROOT, "scripts", "verify-inventory.mjs");

/**
 * Copy Git-visible checkout files into a disposable checkout. Include
 * non-ignored untracked files because a new verifier/test must be testable
 * before its first commit; ignored local state and credentials stay excluded.
 */
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "verify-inventory-"));
  const checkoutFiles = new Set(execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: REPO_ROOT,
      encoding: "buffer",
    },
  ).toString().split("\0").filter(Boolean));
  for (const file of checkoutFiles) {
    if (file === "apps/website" || file.startsWith("apps/website/")) continue;
    if (file === ".env" || file.startsWith(".env.")) continue;
    const source = join(REPO_ROOT, file);
    // A tracked deletion is still present in the index until commit; it is not
    // part of the checkout that the verifier must evaluate.
    if (!existsSync(source)) continue;
    const destination = join(root, file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
  return root;
}

function readInventory(root) {
  return JSON.parse(readFileSync(join(root, "docs", "inventory.json"), "utf8"));
}

function writeInventory(root, inventory) {
  writeFileSync(join(root, "docs", "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
}

function runVerifier(root) {
  return spawnSync(process.execPath, [VERIFY_SCRIPT, "--root", root], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function assertRejected(root, expected) {
  const result = runVerifier(root);
  assert.notEqual(result.status, 0, outputOf(result));
  assert.match(outputOf(result), expected, outputOf(result));
}

test("inventory verifier accepts an isolated checkout fixture", () => {
  const root = createFixture();
  try {
    assert.ok(
      existsSync(join(root, "scripts", "verify-inventory.test.mjs")),
      "fixture must include a non-ignored verifier test before its first commit",
    );
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
    assert.match(outputOf(result), /inventory \d+ 项能力/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an unregistered default workspace entry", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.defaultModules = inventory.defaultModules.filter(
      (module) => module.entry !== "apps/shared/src/index.ts",
    );
    writeInventory(root, inventory);
    assertRejected(root, /默认活跃入口未登记：apps\/shared\/src\/index\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier discovers app.config as a workspace composition root", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.defaultModules = inventory.defaultModules.filter(
      (module) => module.entry !== "apps/server/src/app.config.ts",
    );
    writeInventory(root, inventory);
    assertRejected(root, /默认活跃入口未登记：apps\/server\/src\/app\.config\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier discovers Main from the scene's compressed Creator UUID", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.defaultModules = inventory.defaultModules.filter(
      (module) => module.entry !== "apps/client/src/Main.ts",
    );
    writeInventory(root, inventory);
    assertRejected(root, /默认活跃入口未登记：apps\/client\/src\/Main\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a standalone relayer classified as core", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    const relayer = inventory.capabilities.find((capability) => capability.id === "outbox-relayer");
    relayer.category = "core";
    relayer.docs = ["plan-v3.md", "docs/SERVER.md"];
    writeInventory(root, inventory);
    assertRejected(root, /能力 outbox-relayer 的独立 launch 只能登记为 extra/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a launch command that does not start its declared entry", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.capabilities.find((capability) => capability.id === "outbox-relayer")
      .launch.script = "freeze-worker";
    writeInventory(root, inventory);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a vanished verification command", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.capabilities.find((capability) => capability.id === "shared-contract")
      .verification[0].script = "missing:inventory-command";
    writeInventory(root, inventory);
    assertRejected(root, /能力 shared-contract 根命令不存在：missing:inventory-command/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects the historical plan as route of truth", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.routeOfTruth.corePlan = "plan.md";
    writeInventory(root, inventory);
    assertRejected(root, /routeOfTruth\.corePlan 必须指向 plan-v3\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects removal of the current plan truth declaration", () => {
  const root = createFixture();
  try {
    const plan = join(root, "plan-v3.md");
    // 全量替换：门禁只要求文中存在「唯一真相」，留下任何一处都不算移除声明。
    const text = readFileSync(plan, "utf8").replaceAll("唯一真相", "执行清单");
    writeFileSync(plan, text);
    assertRejected(root, /plan-v3\.md 未声明当前计划唯一真相/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects removal of the current plan from README", () => {
  const root = createFixture();
  try {
    const readme = join(root, "README.md");
    const text = readFileSync(readme, "utf8").replace("- [当前开发收口计划](plan-v3.md)\n", "");
    writeFileSync(readme, text);
    assertRejected(root, /README\.md 未登记 plan-v3\.md 当前计划入口/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects removal of the Godogen plan from README", () => {
  const root = createFixture();
  try {
    const readme = join(root, "README.md");
    const text = readFileSync(readme, "utf8").replace(
      "- [Godogen 对照吸收计划（未实现的额外能力）](todo-godogen.md)\n",
      "",
    );
    writeFileSync(readme, text);
    assertRejected(root, /README\.md 未登记 todo-godogen\.md 对照计划入口/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier keeps the historical plan registered as a checked reference", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.referenceDocs = [];
    writeInventory(root, inventory);
    assertRejected(root, /referenceDocs 必须登记历史 plan\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier keeps the Godogen plan registered as a checked reference", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.referenceDocs = inventory.referenceDocs.filter((doc) => doc !== "todo-godogen.md");
    writeInventory(root, inventory);
    assertRejected(root, /referenceDocs 必须登记 Godogen 对照计划 todo-godogen\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier requires EXTRAFEATURES to register the Godogen plan", () => {
  const root = createFixture();
  try {
    const extra = join(root, "docs", "EXTRAFEATURES.md");
    const text = readFileSync(extra, "utf8").replace(
      "[`todo-godogen.md`](../todo-godogen.md)",
      "`todo-godogen.md`",
    );
    writeFileSync(extra, text);
    assertRejected(root, /docs\/EXTRAFEATURES\.md 未登记 todo-godogen\.md 对照计划入口/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier checks stable local anchors in the Godogen plan", () => {
  const root = createFixture();
  try {
    const godogen = join(root, "todo-godogen.md");
    const text = readFileSync(godogen, "utf8").replace(
      "docs/CLIENT.md#8-本地检查",
      "docs/CLIENT.md#不存在的本地检查",
    );
    writeFileSync(godogen, text);
    assertRejected(
      root,
      /文档 todo-godogen\.md 的锚点不存在：docs\/CLIENT\.md#不存在的本地检查/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a broken registered Markdown link", () => {
  const root = createFixture();
  try {
    const overview = join(root, "docs", "OVERVIEW.md");
    writeFileSync(overview, `${readFileSync(overview, "utf8")}\n[broken inventory link](missing-inventory-doc.md)\n`);
    assertRejected(root, /文档 docs\/OVERVIEW\.md 的链接不存在：missing-inventory-doc\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a Markdown link that escapes through a symlink", () => {
  const root = createFixture();
  const outside = mkdtempSync(join(tmpdir(), "verify-inventory-outside-"));
  try {
    const externalDoc = join(outside, "external.md");
    writeFileSync(externalDoc, "# External document\n");
    symlinkSync(externalDoc, join(root, "docs", "linked-inventory-doc.md"));
    const overview = join(root, "docs", "OVERVIEW.md");
    writeFileSync(overview, `${readFileSync(overview, "utf8")}\n[escaped inventory link](linked-inventory-doc.md)\n`);
    assertRejected(root, /文档 docs\/OVERVIEW\.md 的链接越出项目根：linked-inventory-doc\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("inventory verifier rejects AGENTS/CLAUDE semantic drift even when key markers remain", () => {
  const root = createFixture();
  try {
    const claude = join(root, "CLAUDE.md");
    const text = readFileSync(claude, "utf8").replace(
      "客户端只使用 `@colyseus/sdk`，不得 import 服务端",
      "客户端只使用 `@colyseus/sdk`，可以 import 服务端",
    );
    writeFileSync(claude, text);
    assertRejected(root, /AGENTS\.md\/CLAUDE\.md 除空白外必须保持一致/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects synchronized removal of a required assistant instruction", () => {
  const root = createFixture();
  try {
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace("npm run test:inventory\n", "");
      writeFileSync(file, text);
    }
    assertRejected(root, /AGENTS\.md\/CLAUDE\.md 缺少共同关键指令：inventory 反例测试/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects synchronized removal of the state codegen registration", () => {
  const root = createFixture();
  try {
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace(
        "   - `apps/shared/src/protocol/state.ts` 与 `apps/server/src/rooms/schema/GameRoomState.ts` 来自\n"
        + "     `apps/shared/schema/game-room-state.json`，用 `npm --workspace @game/server run codegen:state` 刷新。\n",
        "",
      );
      writeFileSync(file, text);
    }
    assertRejected(root, /AGENTS\.md\/CLAUDE\.md 缺少共同关键指令：state 生成物登记/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects synchronized removal of the HTTP manifest registration", () => {
  const root = createFixture();
  try {
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace(
        "   - `apps/server/src/http/manifest.generated.ts` 来自 `apps/server/src/http/<domain>/<method>.ts`，\n"
        + "     用 `npm --workspace @game/server run codegen:http` 刷新。\n",
        "",
      );
      writeFileSync(file, text);
    }
    assertRejected(root, /AGENTS\.md\/CLAUDE\.md 缺少共同关键指令：HTTP manifest 生成物登记/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects synchronized removal of the project metadata registration", () => {
  const root = createFixture();
  try {
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace(
        "   - `apps/shared/src/project.ts` 来自 `project.metadata.json`，用 `npm run init:project` 刷新。\n",
        "",
      );
      writeFileSync(file, text);
    }
    assertRejected(root, /AGENTS\.md\/CLAUDE\.md 缺少共同关键指令：项目元数据生成物登记/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects synchronized removal of the Godogen assistant entry", () => {
  const root = createFixture();
  try {
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace(
        "> - [todo-godogen.md](todo-godogen.md)：未实现的外部项目对照吸收计划，不构成核心能力承诺\n",
        "",
      );
      writeFileSync(file, text);
    }
    assertRejected(root, /AGENTS\.md\/CLAUDE\.md 缺少共同关键指令：Godogen 对照计划/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a root command removed from both assistant command blocks", () => {
  const root = createFixture();
  try {
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace("npm run test:faults:int\n", "");
      writeFileSync(file, text);
    }
    const result = runVerifier(root);
    const output = outputOf(result);
    assert.notEqual(result.status, 0, output);
    for (const doc of ["AGENTS.md", "CLAUDE.md"]) {
      assert.ok(
        output.includes(`${doc} 的常用命令登记缺少根命令：test:faults:int`),
        output,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a newly added undocumented root command", () => {
  const root = createFixture();
  try {
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["fixture:undocumented"] = "node fixture-undocumented.mjs";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

    const result = runVerifier(root);
    const output = outputOf(result);
    assert.notEqual(result.status, 0, output);
    for (const doc of ["AGENTS.md", "CLAUDE.md", "README.md"]) {
      assert.ok(
        output.includes(`${doc} 的常用命令登记缺少根命令：fixture:undocumented`),
        output,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a stale root command in the README command table", () => {
  const root = createFixture();
  try {
    const readme = join(root, "README.md");
    const text = readFileSync(readme, "utf8").replace(
      "| `npm run dev` | 启动服务端开发进程 |\n",
      "| `npm run fixture:stale` | fixture stale command |\n| `npm run dev` | 启动服务端开发进程 |\n",
    );
    writeFileSync(readme, text);
    assertRejected(root, /README\.md 的常用命令登记包含不存在的根命令：fixture:stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects synchronized removal of the current plan entry", () => {
  const root = createFixture();
  try {
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace(
        "> - [plan-v3.md](plan-v3.md)：当前开放问题、实施状态与验收证据的唯一真相\n",
        "",
      );
      writeFileSync(file, text);
    }
    assertRejected(root, /AGENTS\.md\/CLAUDE\.md 缺少共同关键指令：当前计划唯一真相/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects duplicate or empty --root arguments", () => {
  const duplicate = spawnSync(process.execPath, [VERIFY_SCRIPT, "--root", REPO_ROOT, "--root", REPO_ROOT], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(duplicate.status, 0);
  assert.match(outputOf(duplicate), /参数重复：--root/);

  const empty = spawnSync(process.execPath, [VERIFY_SCRIPT, "--root", ""], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(empty.status, 0);
  assert.match(outputOf(empty), /--root 需要非空目录参数/);
});

test("inventory verifier rejects a newly added unregistered workspace script", () => {
  const root = createFixture();
  try {
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["fixture:worker"] = "tsx tools/fixture-worker.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /workspace 脚本既未登记进助手命令表也未登记作用域：workspace:@game\/server#fixture:worker/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a workspace scope entry whose root command stops invoking it", () => {
  const root = createFixture();
  try {
    // `start:server` is the registered justification for @game/server#start; once
    // it no longer calls that script the registration is a rubber stamp.
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["start:server"] = "node apps/server/dist/index.js";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\]\.supersededBy 并未实际调用 workspace:@game\/server#start/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a workspace scope entry whose document drops the command", () => {
  const root = createFixture();
  try {
    const file = join(root, "docs", "EXTRAFEATURES.md");
    const before = readFileSync(file, "utf8");
    const after = before.replace("（`npm --workspace @game/server run loadtest`）", "");
    assert.notEqual(after, before, "fixture must actually remove the loadtest command literal");
    writeFileSync(file, after);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\]\.documentedIn 未写出命令原文：docs\/EXTRAFEATURES\.md 缺少 workspace:@game\/server#loadtest/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a workspace scope entry that is already in the command table", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.workspaceCommandScope.push({
      command: { kind: "workspace", workspace: "@game/server", script: "test" },
      documentedIn: "docs/SERVER.md",
      reason: "fixture duplicate registration",
    });
    writeInventory(root, inventory);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\] 已在助手命令表登记，不得再列为作用域外：workspace:@game\/server#test/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a root document citing a missing workspace command", () => {
  const root = createFixture();
  try {
    const file = join(root, "README.md");
    const before = readFileSync(file, "utf8");
    const after = before.replace(
      "npm --workspace @game/server run db:bootstrap",
      "npm --workspace @game/server run db:migrate",
    );
    assert.notEqual(after, before, "fixture must actually rewrite a workspace command literal");
    writeFileSync(file, after);
    assertRejected(root, /README\.md 引用了不存在的 workspace 命令：workspace:@game\/server#db:migrate/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a workspace scope entry that supersedes itself", () => {
  const root = createFixture();
  try {
    // commandCovers 在 key 相同时短路返回 true，所以自指锚点不会被覆盖判定拦住。
    const inventory = readInventory(root);
    const entry = inventory.workspaceCommandScope.find((item) => item.command.script === "relayer");
    assert.ok(entry, "fixture must contain the relayer scope entry");
    delete entry.documentedIn;
    entry.supersededBy = { kind: "workspace", workspace: "@game/server", script: "relayer" };
    writeInventory(root, inventory);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\]\.supersededBy 必须锚定到根命令或助手命令表已登记的 workspace 命令：workspace:@game\/server#relayer/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects two workspace scope entries that supersede each other", () => {
  const root = createFixture();
  try {
    // 互相调用、谁都没进命令表的两个脚本也能互证——比自指更一般的形态，
    // 只禁自指的实现挡不住它。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["fx:a"] = "npm --workspace @game/server run fx:b";
    pkg.scripts["fx:b"] = "npm --workspace @game/server run fx:a";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

    const inventory = readInventory(root);
    for (const [script, anchor] of [["fx:a", "fx:b"], ["fx:b", "fx:a"]]) {
      inventory.workspaceCommandScope.push({
        command: { kind: "workspace", workspace: "@game/server", script },
        supersededBy: { kind: "workspace", workspace: "@game/server", script: anchor },
        reason: "fixture mutual supersede",
      });
    }
    writeInventory(root, inventory);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\]\.supersededBy 必须锚定到根命令或助手命令表已登记的 workspace 命令：workspace:@game\/server#fx:(a|b)/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier accepts a workspace anchor that is itself in the command table", () => {
  const root = createFixture();
  try {
    // 反向锁：闸不得被收紧成「只认 root」。`smoke` 已在助手命令表里，其文档保证与
    // root 锚点等价，因此以它为锚点是正当登记，必须放行。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["fx:c"] = "node tools/fixture-c.mjs";
    pkg.scripts.smoke = `${pkg.scripts.smoke} && npm --workspace @game/server run fx:c`;
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

    const inventory = readInventory(root);
    inventory.workspaceCommandScope.push({
      command: { kind: "workspace", workspace: "@game/server", script: "fx:c" },
      supersededBy: { kind: "workspace", workspace: "@game/server", script: "smoke" },
      reason: "fixture legitimate workspace anchor",
    });
    writeInventory(root, inventory);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an echoed workspace command as coverage", () => {
  const root = createFixture();
  try {
    // 写出了命令原文但不会执行：整段的首个 token 是 echo，不是 npm。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["start:server"] = "echo npm --workspace @game/server run start";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\]\.supersededBy 并未实际调用 workspace:@game\/server#start/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a commented-out workspace command as coverage", () => {
  const root = createFixture();
  try {
    // 与 echo 分开写：否则后人只给 echo 加一条特判就会以为修好了。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["start:server"] = "# npm --workspace @game/server run start";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\]\.supersededBy 并未实际调用 workspace:@game\/server#start/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an echoed root command in a verification chain", () => {
  const root = createFixture();
  try {
    // 守既有消费点 verification.requires，而不只是新加的 supersededBy。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    const before = pkg.scripts["verify:core"];
    pkg.scripts["verify:core"] = before.replace(
      "npm run verify:vendor",
      "echo npm run verify:vendor",
    );
    assert.notEqual(pkg.scripts["verify:core"], before, "fixture must rewrite the verify:vendor link");
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(root, /未实际覆盖声明的验证命令：root:verify:vendor/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an echoed launch entry", () => {
  const root = createFixture();
  try {
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "echo tsx src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a prototype-chain property posing as a root script", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.capabilities[0].verification.push({ kind: "root", script: "toString" });
    writeInventory(root, inventory);
    assertRejected(root, /根命令不存在：toString/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a prototype-chain property posing as a workspace script", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.capabilities[0].verification.push({
      kind: "workspace",
      workspace: "@game/server",
      script: "constructor",
    });
    writeInventory(root, inventory);
    assertRejected(root, /workspace 命令不存在：@game\/server#constructor/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a prototype-chain workspace scope registration", () => {
  const root = createFixture();
  try {
    // 第三个消费面：stale 检查也走同一张表，否则 phantom 登记永远没有回归保护。
    const inventory = readInventory(root);
    inventory.workspaceCommandScope.push({
      command: { kind: "workspace", workspace: "@game/server", script: "toString" },
      documentedIn: "docs/SERVER.md",
      reason: "fixture phantom script",
    });
    writeInventory(root, inventory);
    assertRejected(root, /workspaceCommandScope 登记了不存在的 workspace 命令：workspace:@game\/server#toString/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a non-string script value", () => {
  const root = createFixture();
  try {
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["fixture:object"] = { nested: "not a command" };
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const inventory = readInventory(root);
    inventory.capabilities[0].verification.push({ kind: "root", script: "fixture:object" });
    writeInventory(root, inventory);
    assertRejected(root, /根命令不存在：fixture:object/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a self-referencing verification requirement", () => {
  const root = createFixture();
  try {
    // commandCovers 在 key 相同时短路返回 true，自引用能自证覆盖。
    const inventory = readInventory(root);
    inventory.capabilities[0].verification.push({
      kind: "root",
      script: "verify:core",
      requires: [{ kind: "root", script: "verify:core" }],
    });
    writeInventory(root, inventory);
    assertRejected(root, /requires 不得自引用或成环：root:verify:core/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects mutually requiring verification commands", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.capabilities[0].verification.push({
      kind: "root",
      script: "verify:core",
      requires: [{
        kind: "root",
        script: "verify:all",
        requires: [{ kind: "root", script: "verify:core" }],
      }],
    });
    writeInventory(root, inventory);
    assertRejected(root, /requires 不得自引用或成环：root:verify:core/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier does not let a self-wrapped requirement whitewash a broken chain", () => {
  const root = createFixture();
  try {
    // 环闸若排在 requires===undefined 早退之后，把一条真实失败多包一层自身 key
    // 就能让整棵子树的断言被静默跳过。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["verify:core"] = pkg.scripts["verify:core"].replace(
      "npm run verify:vendor",
      "echo npm run verify:vendor",
    );
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const inventory = readInventory(root);
    inventory.capabilities[0].verification.push({
      kind: "root",
      script: "verify:core",
      requires: [{
        kind: "root",
        script: "verify:core",
        requires: [{ kind: "root", script: "verify:vendor" }],
      }],
    });
    writeInventory(root, inventory);
    assertRejected(root, /requires 不得自引用或成环：root:verify:core/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a commented-out workspace command in the assistant block", () => {
  const root = createFixture();
  try {
    // 真实绕过形态：新增脚本只靠命令块里「顺带提一嘴」的注释行充当登记。
    // 注意不能写成 `# npm …`（带空格），那样首 token 是 `#`；这里刻意用紧贴形式，
    // 证明守的是行首锚点而不是某个 `#` 特判。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["fixture:worker"] = "tsx tools/fixture-worker.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace(
        "npm --workspace @game/server run test\n",
        "npm --workspace @game/server run test\n#已废弃：npm --workspace @game/server run fixture:worker\n",
      );
      writeFileSync(file, text);
    }
    assertRejected(
      root,
      /workspace 脚本既未登记进助手命令表也未登记作用域：workspace:@game\/server#fixture:worker/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an echoed workspace command in the assistant block", () => {
  const root = createFixture();
  try {
    // 与注释形态分开写，防止后人只给 `#` 加特判就以为修好了。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["fixture:worker"] = "tsx tools/fixture-worker.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace(
        "npm --workspace @game/server run test\n",
        "npm --workspace @game/server run test\necho \"npm --workspace @game/server run fixture:worker\"\n",
      );
      writeFileSync(file, text);
    }
    assertRejected(
      root,
      /workspace 脚本既未登记进助手命令表也未登记作用域：workspace:@game\/server#fixture:worker/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects documentedIn outside README and docs", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    const entry = inventory.workspaceCommandScope.find((item) => item.command.script === "loadtest");
    assert.ok(entry, "fixture must contain the loadtest scope entry");
    entry.documentedIn = "apps/server/package.json";
    writeInventory(root, inventory);
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.description = "npm --workspace @game/server run loadtest";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /documentedIn 必须是 README\.md 或 docs\/ 下的 \.md 文档：apps\/server\/package\.json/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects documentedIn pointing at an archived plan", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    const entry = inventory.workspaceCommandScope.find((item) => item.command.script === "loadtest");
    entry.documentedIn = "plan-v2.md";
    writeInventory(root, inventory);
    const plan = join(root, "plan-v2.md");
    writeFileSync(plan, `${readFileSync(plan, "utf8")}\n\`npm --workspace @game/server run loadtest\`\n`);
    assertRejected(root, /documentedIn 必须是 README\.md 或 docs\/ 下的 \.md 文档：plan-v2\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects documentedIn pointing at a directory instead of crashing", () => {
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    const entry = inventory.workspaceCommandScope.find((item) => item.command.script === "loadtest");
    entry.documentedIn = "docs/fixture.md";
    writeInventory(root, inventory);
    mkdirSync(join(root, "docs", "fixture.md"), { recursive: true });
    const result = runVerifier(root);
    assert.notEqual(result.status, 0, outputOf(result));
    assert.doesNotMatch(outputOf(result), /EISDIR/, outputOf(result));
    assert.match(outputOf(result), /documentedIn 文档不存在：docs\/fixture\.md/, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an npx-launched entry", () => {
  const root = createFixture();
  try {
    // 用 npx tsx 而非 npx echo：被启动物是真解释器，红绿只可能由 npx 这一个 token
    // 决定，杜绝后人「给 echo 再加个特判」的误修。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "npx tsx src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a quoted pseudo-call as coverage", () => {
  const root = createFixture();
  try {
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["start:server"] = 'echo "ignored; npm --workspace @game/server run start"';
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\]\.supersededBy 并未实际调用 workspace:@game\/server#start/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an entry mentioned only in a trailing comment", () => {
  const root = createFixture();
  try {
    // 启动器白名单只看首 token，所以「白名单启动器 + 注释里提一嘴入口路径」是最直白的
    // 盖绿章形态；只有把引号外的 `#` 截断掉，那个路径 token 才会消失。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "bash tools/dev-stack.sh # src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a command-substitution launch as coverage", () => {
  const root = createFixture();
  try {
    // 命令替换引入静态不可知的命令，整段必须失败关闭。这里刻意让段首仍是白名单启动器，
    // 否则会被「首 token 不是启动器」提前挡掉，测不到命令替换这一条规则。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "node $(echo --check) src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a heredoc pseudo-call as coverage", () => {
  const root = createFixture();
  try {
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["start:server"] = "cat <<EOF\nnpm --workspace @game/server run start\nEOF";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\]\.supersededBy 并未实际调用 workspace:@game\/server#start/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an argument-position pseudo-call as coverage", () => {
  const root = createFixture();
  try {
    // 引用必须是这一段的命令头；参数位里的 npm run x 不是被执行的命令。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    const before = pkg.scripts["verify:core"];
    pkg.scripts["verify:core"] = before.replace(
      "npm run verify:vendor",
      "npm run verify:fgui -- npm run verify:vendor",
    );
    assert.notEqual(pkg.scripts["verify:core"], before, "fixture must rewrite the verify:vendor link");
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(root, /未实际覆盖声明的验证命令：root:verify:vendor/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a non-executing launcher flag as launch", () => {
  const root = createFixture();
  try {
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "node --check src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier still accepts launchers with value-taking flags", () => {
  const root = createFixture();
  try {
    // 反向锁：不得把「第一个非 flag token 才是入口」当规则，那会把 node -r reg <entry>
    // 这类合法启动误判成未启动。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "node --enable-source-maps -r tsx/cjs src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a suffix-workspace npm run posing as a root command", () => {
  const root = createFixture();
  try {
    // `npm run X --workspace Y` 执行的是 workspace 脚本，不是 root:X。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    const before = pkg.scripts["verify:core"];
    pkg.scripts["verify:core"] = before.replace(
      "npm run verify:vendor",
      "npm run verify:vendor --workspace @game/shared",
    );
    assert.notEqual(pkg.scripts["verify:core"], before, "fixture must rewrite the verify:vendor call");
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(root, /未实际覆盖声明的验证命令：root:verify:vendor/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an inline suffix-workspace npm run", () => {
  const root = createFixture();
  try {
    // `-w=Y` / `--prefix Z` 等写法同样改变被执行的脚本；逐个特判挡不住，只能失败关闭。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    const before = pkg.scripts["verify:core"];
    pkg.scripts["verify:core"] = before.replace(
      "npm run verify:vendor",
      "npm run verify:vendor --prefix apps/shared",
    );
    assert.notEqual(pkg.scripts["verify:core"], before, "fixture must rewrite the verify:vendor call");
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(root, /未实际覆盖声明的验证命令：root:verify:vendor/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier still accepts a prefix-workspace npm run", () => {
  const root = createFixture();
  try {
    // 反向锁：前缀式 `npm --workspace Y run X` 是仓内实际写法，不得被收紧误伤。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts["start:server"] = "npm --silent --workspace @game/server run start";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a backgrounded pseudo-launch", () => {
  const root = createFixture();
  try {
    // 单个 & 也是命令分隔符：真正被启动的是 smoke.ts，入口只出现在 echo 的参数位。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx smoke.ts & echo src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier still accepts a launcher with shell redirection", () => {
  const root = createFixture();
  try {
    // 反向锁：`2>&1` 里的 & 属于重定向，不得被当成命令分隔符。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx src/core/economy/relayer.ts > relayer.log 2>&1";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier still accepts a heredoc mentioned only inside a comment", () => {
  const root = createFixture();
  try {
    // 反向锁：heredoc 判定必须在引号外、注释外生效，否则注释里写一句 << 就误伤整条脚本。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx src/core/economy/relayer.ts # 见 heredoc << EOF 说明";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a blacklisted flag after a value-taking flag", () => {
  const root = createFixture();
  try {
    // 扫描必须覆盖入口之前的全部 token：遇到第一个非 `-` token 就停会漏判。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "node --import tsx --check src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects documentedIn escaping through a parent segment", () => {
  const root = createFixture();
  try {
    // docs/../plan-v2.md 归一化后是 plan-v2.md，不在允许的文档面内。
    const inventory = readInventory(root);
    const entry = inventory.workspaceCommandScope.find((item) => item.command.script === "loadtest");
    entry.documentedIn = "docs/../plan-v2.md";
    writeInventory(root, inventory);
    const plan = join(root, "plan-v2.md");
    writeFileSync(plan, `${readFileSync(plan, "utf8")}\nnpm --workspace @game/server run loadtest\n`);
    assertRejected(root, /documentedIn 必须是 README\.md 或 docs\/ 下的 \.md 文档/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a CR-glued npm run script name", () => {
  const root = createFixture();
  try {
    // `\r` 不是 shell IFS 分词符：真实 npm 收到的是带 CR 的脚本名（Missing script），
    // 静态分词若把它当空白就会给从未执行的 root:verify:vendor 盖绿章。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    const before = pkg.scripts["verify:core"];
    pkg.scripts["verify:core"] = before.replace("npm run verify:vendor", "npm run verify:vendor\r");
    assert.notEqual(pkg.scripts["verify:core"], before, "fixture must rewrite the verify:vendor call");
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(root, /未实际覆盖声明的验证命令：root:verify:vendor/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects NBSP-glued npm run tokens", () => {
  const root = createFixture();
  try {
    // NBSP 同理：`npm run verify:vendor` 在真实 shell 里是一个整词（command not found）。
    const packageFile = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    const before = pkg.scripts["verify:core"];
    pkg.scripts["verify:core"] = before.replace(
      "npm run verify:vendor",
      "npm run verify:vendor",
    );
    assert.notEqual(pkg.scripts["verify:core"], before, "fixture must rewrite the verify:vendor call");
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(root, /未实际覆盖声明的验证命令：root:verify:vendor/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a glued long non-executing flag before the entry", () => {
  const root = createFixture();
  try {
    // `--eval=1` 与 `--eval 1` 同义：node 执行内联表达式后退出，入口不会运行。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "node --eval=1 src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a glued short non-executing flag before the entry", () => {
  const root = createFixture();
  try {
    // `-e1` 是 `-e 1` 的粘连短 flag 形式，同样不执行入口。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "node -e1 src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier still accepts a value-taking flag before the entry", () => {
  const root = createFixture();
  try {
    // 反向锁：`--import tsx` 是仓内真实写法（带取值的合法 flag），不得被粘连判定误伤。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "node --import tsx src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
