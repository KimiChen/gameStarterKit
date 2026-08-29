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
    relayer.docs = ["plan-v2.md", "docs/SERVER.md"];
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
    assertRejected(root, /routeOfTruth\.corePlan 必须指向 plan-v2\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects removal of the current plan truth declaration", () => {
  const root = createFixture();
  try {
    const plan = join(root, "plan-v2.md");
    const text = readFileSync(plan, "utf8").replace("的唯一真相", "的执行清单");
    writeFileSync(plan, text);
    assertRejected(root, /plan-v2\.md 未声明当前计划唯一真相/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects removal of the current plan from README", () => {
  const root = createFixture();
  try {
    const readme = join(root, "README.md");
    const text = readFileSync(readme, "utf8").replace("- [当前开发收口计划](plan-v2.md)\n", "");
    writeFileSync(readme, text);
    assertRejected(root, /README\.md 未登记 plan-v2\.md 当前计划入口/);
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

test("inventory verifier rejects synchronized removal of the current plan entry", () => {
  const root = createFixture();
  try {
    for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
      const file = join(root, filename);
      const text = readFileSync(file, "utf8").replace(
        "> - [plan-v2.md](plan-v2.md)：当前开放问题、实施状态与验收证据的唯一真相\n",
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
