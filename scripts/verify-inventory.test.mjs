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
    relayer.docs = ["plan-v5.md", "docs/SERVER.md"];
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
    assertRejected(root, /routeOfTruth\.corePlan 必须指向 plan-v5\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects removal of the current plan truth declaration", () => {
  const root = createFixture();
  try {
    const plan = join(root, "plan-v5.md");
    // 全量替换：门禁只要求文中存在「唯一真相」，留下任何一处都不算移除声明。
    const text = readFileSync(plan, "utf8").replaceAll("唯一真相", "执行清单");
    writeFileSync(plan, text);
    assertRejected(root, /plan-v5\.md 未声明当前计划唯一真相/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects removal of the current plan from README", () => {
  const root = createFixture();
  try {
    const readme = join(root, "README.md");
    const text = readFileSync(readme, "utf8").replace("- [当前开发收口计划](plan-v5.md)\n", "");
    writeFileSync(readme, text);
    assertRejected(root, /README\.md 未登记 plan-v5\.md 当前计划入口/);
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

test("inventory verifier rejects a registered doc that points at an archive as current truth", () => {
  // 这是真相指针迁移的实际教训：plan-v2→v3 那轮漏了几处、plan-v3→v4 这轮漏了 19 处，
  // 两次 verify:inventory 都是绿的，读者被指去一份文首写着「不得推导当前状态」的归档。
  // ⚠ 归档清单取自 inventory 自己的 referenceDocs，所以迁移时新归档一进清单就自动开始被守
  // （plan-v4→v5 迁移首次复用了这个设计，下方循环覆盖新旧两个归档）。
  for (const archive of ["plan-v3.md", "plan-v4.md"]) {
    const root = createFixture();
    try {
      const doc = join(root, "docs/OVERVIEW.md");
      writeFileSync(doc, `${readFileSync(doc, "utf8")}\n\n完成状态以 [${archive}](../${archive}) 为准。\n`);
      assertRejected(root, new RegExp(`docs/OVERVIEW\\.md:\\d+ 把历史归档 ${archive.replace(".", "\\.")} 说成当前真相`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("inventory verifier scans unregistered docs too (未登记目录也要扫)", () => {
  // 这条闸原本只扫 inventory 登记的文档，于是 docs/snakeoff/ 在 plan-v3→v4 与 plan-v4→v5
  // **两次迁移里各漏了一次**——同样的文件、同样的原因，第一次还专门写进计划说「人工改的」。
  // ⚠ 夹具原本用 docs/snakeoff/README.md，该目录已于 2026-09-06 随文档归并删除；
  // 换成 docs/undergroundIdle/README.md。⛔ 替身必须同样是**未登记**文档：登记文档会额外触发
  // checkMarkdownLinks，下一条用例正依赖「链接指向不存在的文件也应 exit 0」。
  const root = createFixture();
  try {
    const doc = join(root, "docs/undergroundIdle/README.md");
    writeFileSync(doc, `${readFileSync(doc, "utf8")}\n\n- [当前实施状态与开放问题](../../plan-v4.md)\n`);
    assertRejected(root, /docs\/undergroundIdle\/README\.md:\d+ 把历史归档 plan-v4\.md 说成当前真相/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier 不因文件名子串误红（live-plan.md 不是 plan.md）", () => {
  // ⛔ 用 includes("plan.md") 匹配会把 `10-image-to-fairygui-live-plan.md` 判成引用了归档
  // plan.md——仓内真实存在这样一行，扩大扫描面时它是唯一的假阳。
  const root = createFixture();
  try {
    const doc = join(root, "docs/undergroundIdle/README.md");
    writeFileSync(
      doc,
      `${readFileSync(doc, "utf8")}\n\n生产流程以 [活文档](10-image-to-fairygui-live-plan.md) 为准。\n`,
    );
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier still allows citing an archive when its identity is stated", () => {
  // ⛔ 闸不能宽到把一切归档链接都拒掉：文档经常需要正当地引用归档。判据是「有没有写明身份」。
  const root = createFixture();
  try {
    const doc = join(root, "docs/OVERVIEW.md");
    writeFileSync(
      doc,
      `${readFileSync(doc, "utf8")}\n\n完成状态以 [plan-v5.md](../plan-v5.md) 为准` +
      `（保留边界的原始记录在历史归档 [plan-v4.md](../plan-v4.md)）。\n`,
    );
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier keeps the previous plan registered as a checked archive", () => {
  // 真相指针迁到 plan-v5 后，plan-v4 与 plan/plan-v2/plan-v3 同列历史归档。⛔ 缺登记会让
  // 一份仍被大量文档引用的计划变成没有归属的孤儿，链接检查也不再覆盖它。
  for (const archive of ["plan-v3.md", "plan-v4.md"]) {
    const root = createFixture();
    try {
      const inventory = readInventory(root);
      inventory.referenceDocs = inventory.referenceDocs.filter((doc) => doc !== archive);
      writeInventory(root, inventory);
      assertRejected(root, new RegExp(`referenceDocs 必须登记历史 ${archive.replace(".", "\\.")}`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("inventory verifier rejects listing the current plan as a historical reference", () => {
  // 当前计划同时出现在 referenceDocs 里，等于同一份文档既是真相又是归档——上一轮
  // plan-v2 → plan-v3 迁移后正是这种半迁移状态最难被发现。
  const root = createFixture();
  try {
    const inventory = readInventory(root);
    inventory.referenceDocs = [...inventory.referenceDocs, inventory.routeOfTruth.corePlan];
    writeInventory(root, inventory);
    assertRejected(root, /referenceDocs 不得同时登记当前计划/);
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

test("inventory verifier requires EXTRAS to register the Godogen plan", () => {
  const root = createFixture();
  try {
    const extra = join(root, "docs", "EXTRAS.md");
    // EXTRAS 里该链接可出现多次（§3 与 §5.2 各一处）：全部去掉才是「未登记」，⛔ 只替换第一处会让验证器仍然通过。
    const text = readFileSync(extra, "utf8").replaceAll(
      "[`todo-godogen.md`](../todo-godogen.md)",
      "`todo-godogen.md`",
    );
    writeFileSync(extra, text);
    assertRejected(root, /docs\/EXTRAS\.md 未登记 todo-godogen\.md 对照计划入口/);
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
        "   - `apps/shared/src/gameplays/`、`apps/server/src/rooms/schema/GameRoomState.ts` 与\n"
        + "     `apps/server/src/rooms/schema/generated/`、`apps/client/src/gameplay/catalog.generated.ts`、\n"
        + "     `apps/server/src/rooms/modes/catalog.generated.ts` 来自\n"
        + "     `apps/shared/schema/gameplays/<id>/`（manifest.json + state.json）与各玩法手写的\n"
        + "     `apps/shared/src/gameplays/<id>/wire.ts`，用\n"
        + "     `npm --workspace @game/server run codegen:gameplays` 刷新。⚠ `gameplays/` 下的\n"
        + "     `defineGameplayWire.ts` 与 `<id>/wire.ts` 是手写真源（不是生成物），其余\n"
        + "     （catalog.generated.ts / index.ts / generated/）禁手改；服务端 `modes/catalog.ts` 是生成物的稳定\n"
        + "     façade（登记全集按 manifest.wireExposed 发现 `modes/<id>/index.ts`），⛔ 不再逐玩法手写。\n",
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
    const before = readFileSync(readme, "utf8");
    const devRow = "| `npm run dev` | 一条命令启动完整开发环境：本地栈（stack）→ 建库（db:bootstrap）→ 连通性自检（smoke:framework）→ watch 模式服务端 |\n";
    assert.ok(before.includes(devRow), "fixture 前提：README 的 dev 行文本必须与真仓一致");
    const text = before.replace(devRow, `| \`npm run fixture:stale\` | fixture stale command |\n${devRow}`);
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
        "> - [plan-v5.md](plan-v5.md)：当前开放问题、实施状态与验收证据的唯一真相\n",
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
    const file = join(root, "docs", "EXTRAS.md");
    const before = readFileSync(file, "utf8");
    const after = before.replace("（`npm --workspace @game/server run loadtest`）", "");
    assert.notEqual(after, before, "fixture must actually remove the loadtest command literal");
    writeFileSync(file, after);
    assertRejected(
      root,
      /workspaceCommandScope\[\d+\]\.documentedIn 未写出命令原文：docs\/EXTRAS\.md 缺少 workspace:@game\/server#loadtest/,
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
      "npm --workspace @game/server run smoke:framework",
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

test("inventory verifier rejects an entry that only appears as a redirect target", () => {
  const root = createFixture();
  try {
    // `tsx smoke.ts >& <entry>` 真正执行的是 smoke.ts，入口只是重定向写出的文件名。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx tools/smoke.ts >& src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier still accepts an entry followed by a log redirect", () => {
  const root = createFixture();
  try {
    // 反向锁：`tsx <entry> > log` 入口在重定向前，真实执行，不得误判。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx src/core/economy/relayer.ts > /tmp/gsk-relayer.log";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an entry behind a noclobber redirection", () => {
  const root = createFixture();
  try {
    // `>|` 是 noclobber 覆盖重定向算子，不是管道；入口只是被写的文件名。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx tools/smoke.ts >| src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an entry behind an fd-allocating redirection", () => {
  const root = createFixture();
  try {
    // `{fd}>` 不以数字开头，逐形态枚举挡不住；改为「含 <> 的 token 一律是边界」。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx tools/smoke.ts {fd}> src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier still accepts a launcher piped into another command", () => {
  const root = createFixture();
  try {
    // 反向锁：真实管道不得被 `>|` 守卫误伤。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx src/core/economy/relayer.ts | tee relayer.log";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier accepts a shell launcher with clustered short options", () => {
  const root = createFixture();
  try {
    // 真实 bash 对 `-ex` / `-eu` 照常执行脚本；按 node CLI 语义前缀匹配会把它判成未启动。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "bash -ex src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a shell launcher whose option cluster contains -c", () => {
  const root = createFixture();
  try {
    // 含 `c` 的簇把随后的 token 当命令字符串，入口不会被当脚本执行。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "bash -ce src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a shell launch that reads stdin instead of the entry", () => {
  const root = createFixture();
  try {
    // `bash -s` 读 stdin，入口只退化为位置参数，不会被执行（真实 bash 实测 exit 0 静默假绿）。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "bash -s src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a shell option that eats the entry as its value", () => {
  const root = createFixture();
  try {
    // `bash -o` 把随后 token 吃成选项名：`bash -o <entry>` 的入口不会被执行。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "bash -o src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier still accepts an idiomatic shell option cluster with a value", () => {
  const root = createFixture();
  try {
    // 反向锁：`bash -euo pipefail <entry>` 的 pipefail 是 -o 的取值，入口照常执行，不得误伤。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "bash -euo pipefail src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an entry after the &| garbage sequence", () => {
  const root = createFixture();
  try {
    // `>&|` 在真实 bash 是语法错误（syntax error near '|'），入口不会执行；
    // `&` 守卫只看前一字符是 >/<，拦不住它，| 被当管道切段后入口升格为段首。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx tools/smoke.ts >&| src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects an entry after a spaced > | sequence", () => {
  const root = createFixture();
  try {
    // `> |` 带空格同样是语法错误；守卫读原始字符时中间隔着空格，切段后入口升格为段首。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "tsx tools/smoke.ts > | src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a mid-cluster shell option that eats the entry", () => {
  const root = createFixture();
  try {
    // `-o` 无论在簇的哪个位置都吃掉下一个 token 当选项值：真实 bash 对 `-oe`/`-eo`/`-xo`
    // 一律报 `invalid option name <entry>`，入口从未执行。只判「簇以 o 结尾」会漏掉这族。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "bash -oe src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// 以下五条反例覆盖白名单化前真实 bash 实测 rc=0 的静默假绿族（入口均未执行）。
for (const [name, script] of [
  ["shell -n (noexec)", "bash -n src/core/economy/relayer.ts"],
  ["shell +s cluster (stdin)", "bash +s src/core/economy/relayer.ts"],
  ["shell -D (dump implies noexec)", "bash -D src/core/economy/relayer.ts"],
  ["shell --dump-strings", "bash --dump-strings src/core/economy/relayer.ts"],
  ["shell -t (exit after one command)", "bash -t src/core/economy/relayer.ts"],
]) {
  test(`inventory verifier rejects a non-executing ${name}`, () => {
    const root = createFixture();
    try {
      const packageFile = join(root, "apps", "server", "package.json");
      const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
      pkg.scripts.relayer = script;
      writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
      assertRejected(
        root,
        /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// 正例反向锁：白名单必须放行这些真实 bash 实测会执行入口的形态。
for (const [name, script] of [
  ["long-option whitelist (--norc)", "bash --norc src/core/economy/relayer.ts"],
  ["-- terminator", "bash -- src/core/economy/relayer.ts"],
  ["interactive flag in cluster", "bash -i src/core/economy/relayer.ts"],
]) {
  test(`inventory verifier still accepts ${name}`, () => {
    const root = createFixture();
    try {
      const packageFile = join(root, "apps", "server", "package.json");
      const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
      pkg.scripts.relayer = script;
      writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
      const result = runVerifier(root);
      assert.equal(result.status, 0, outputOf(result));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("inventory verifier rejects a positional operand before the shell entry", () => {
  const root = createFixture();
  try {
    // `bash tools/dev-stack.sh <entry>`：真实 bash 执行的是 dev-stack.sh，入口只是它的 argv。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "bash tools/dev-stack.sh src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inventory verifier rejects a bare dash as the node entry position (stdin script)", () => {
  const root = createFixture();
  try {
    // `node - <entry>`：node 从 stdin 读脚本（实测入口不执行）；bash 的 `-` 是选项终止符，
    // 语义不同族，不能共用判定。
    const packageFile = join(root, "apps", "server", "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.scripts.relayer = "node - src/core/economy/relayer.ts";
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
    assertRejected(
      root,
      /能力 outbox-relayer\.launch 未实际启动 defaultEntry：apps\/server\/src\/core\/economy\/relayer\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 阶段 7：plugin capability fragment 合并（Non-intrusive §5.7） ────────────

/** 在 fixture 根写一个最小 extra plugin（仅 capability fragment；无 View/路由/菜单）。 */
function writeFragmentPlugin(root, manifestOverrides = {}, fragmentOverrides = {}) {
  const dir = join(root, "apps", "plugins", "fixtureExtra");
  mkdirSync(dir, { recursive: true });
  const fragment = {
    id: "fixture-extra-cap",
    category: "extra",
    defaultEntry: "apps/server/src/core/economy/outbox.ts",
    sourceOfTruth: "apps/server/src/core/economy",
    wireBoundary: "apps/server/src/core/economy/outbox.ts",
    verification: [{ kind: "root", script: "verify:core" }],
    docs: ["docs/EXTRAS.md"],
    ...fragmentOverrides,
  };
  const manifest = {
    schemaVersion: 2,
    id: "fixtureExtra",
    category: "extra",
    docs: ["docs/EXTRAS.md"],
    capabilities: [fragment],
    viewDirs: [],
    views: [],
    owners: [],
    routes: [],
    menu: [],
    ...manifestOverrides,
  };
  writeFileSync(join(dir, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

test("plugin fragment：合法 extra fragment 绿，且不修改中央 inventory.json（阶段 7 退出条件）", () => {
  const root = createFixture();
  try {
    const centralBefore = readFileSync(join(root, "docs", "inventory.json"), "utf8");
    writeFragmentPlugin(root);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
    assert.equal(
      readFileSync(join(root, "docs", "inventory.json"), "utf8"),
      centralBefore,
      "普通 extra plugin 经 fragment 通道登记，⛔ 不得要求（也不得发生）中央 inventory 改写",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin fragment：声明 core 必须拒绝（core 身份不经 fragment 通道）", () => {
  const root = createFixture();
  try {
    writeFragmentPlugin(root, {}, { category: "core", docs: ["docs/SERVER.md"] });
    assertRejected(root, /capabilities\[0\] 只能声明 extra/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin fragment：extra fragment 缺 docs/EXTRAS.md 必须拒绝（沿用双向断言）", () => {
  const root = createFixture();
  try {
    writeFragmentPlugin(root, {}, { docs: ["docs/SERVER.md"] });
    assertRejected(root, /额外能力 fixture-extra-cap 必须引用 docs\/EXTRAS\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin fragment：plugin.json 出现中央 inventory 专属键（routeOfTruth 等）必须拒绝", () => {
  const root = createFixture();
  try {
    writeFragmentPlugin(root, { routeOfTruth: { corePlan: "plan-v4.md" } });
    assertRejected(root, /不得声明中央 inventory 专属键.*routeOfTruth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin fragment：fragment 未知键未通过真实 JSON Schema 校验（additionalProperties:false）", () => {
  const root = createFixture();
  try {
    writeFragmentPlugin(root, {}, { bogus: true });
    assertRejected(root, /未通过 plugin-schema-v2 校验.*unknown key\(s\): bogus/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin fragment：verification 登记存在但不发现 fragment 的命令 → 假绿拒绝（须覆盖 verify:inventory）", () => {
  const root = createFixture();
  try {
    writeFragmentPlugin(root, {}, { verification: [{ kind: "root", script: "verify:ecs" }] });
    assertRejected(root, /plugin fragment 能力 fixture-extra-cap 的 verification 未包含能实际发现 fragment 的聚合命令/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin fragment：与中央能力重复 id / defaultEntry 不存在，均并入既有 fail-closed 检查", () => {
  const root = createFixture();
  try {
    writeFragmentPlugin(root, {}, { id: "outbox-relayer" });
    assertRejected(root, /能力 id 重复：outbox-relayer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const root2 = createFixture();
  try {
    writeFragmentPlugin(root2, {}, { defaultEntry: "apps/server/src/core/economy/ghost.ts" });
    assertRejected(root2, /能力 fixture-extra-cap 路径不存在：apps\/server\/src\/core\/economy\/ghost\.ts/);
  } finally {
    rmSync(root2, { recursive: true, force: true });
  }
});

// ── K0：kit 发现根 apps/kits/<id>/kit.json 的 capability fragment（docs/KIT.md §7；同一解释器 + kit-schema-v1） ──

/** 在 fixture 根写一个最小 kit（仅 capability fragment；无 View/路由/菜单/SQL）。 */
function writeFragmentKit(root, manifestOverrides = {}, fragmentOverrides = {}) {
  const dir = join(root, "apps", "kits", "fixtureKit");
  mkdirSync(dir, { recursive: true });
  const fragment = {
    id: "fixture-kit-cap",
    category: "extra",
    defaultEntry: "apps/server/src/core/economy/outbox.ts",
    sourceOfTruth: "apps/server/src/core/economy",
    wireBoundary: "apps/server/src/core/economy/outbox.ts",
    verification: [{ kind: "root", script: "verify:core" }],
    docs: ["docs/EXTRAS.md"],
    ...fragmentOverrides,
  };
  const manifest = {
    schemaVersion: 1,
    id: "fixtureKit",
    version: "1.0.0",
    api: { board: { version: 1, minSupported: 1 } },
    category: "extra",
    docs: ["docs/EXTRAS.md"],
    capabilities: [fragment],
    ...manifestOverrides,
  };
  writeFileSync(join(dir, "kit.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

test("kit fragment：合法 extra fragment 绿（apps/kits/ 缺席也绿），且不修改中央 inventory.json", () => {
  const root = createFixture();
  try {
    rmSync(join(root, "apps", "kits"), { recursive: true, force: true });
    const absent = runVerifier(root);
    assert.equal(absent.status, 0, outputOf(absent));
    const centralBefore = readFileSync(join(root, "docs", "inventory.json"), "utf8");
    writeFragmentKit(root);
    const result = runVerifier(root);
    assert.equal(result.status, 0, outputOf(result));
    assert.equal(readFileSync(join(root, "docs", "inventory.json"), "utf8"), centralBefore,
      "kit 经 fragment 通道登记，⛔ 不得要求（也不得发生）中央 inventory 改写");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("kit fragment：kit.json 未知键未通过 kit-schema-v1 校验（additionalProperties:false）；requires 对 kit 也是未知键", () => {
  const root = createFixture();
  try {
    writeFragmentKit(root, { bogus: true });
    assertRejected(root, /apps\/kits\/fixtureKit\/kit\.json 未通过 kit-schema-v1 校验.*unknown key\(s\): bogus/);
    writeFragmentKit(root, { requires: { kits: {} } });
    assertRejected(root, /未通过 kit-schema-v1 校验.*unknown key\(s\): requires/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("kit fragment：声明 core / 中央专属键 与插件同规则拒绝", () => {
  const root = createFixture();
  try {
    writeFragmentKit(root, {}, { category: "core", docs: ["docs/SERVER.md"] });
    assertRejected(root, /apps\/kits\/fixtureKit\/kit\.json capabilities\[0\] 只能声明 extra/);
    writeFragmentKit(root, { routeOfTruth: { corePlan: "plan-v4.md" } });
    assertRejected(root, /apps\/kits\/fixtureKit\/kit\.json 不得声明中央 inventory 专属键.*routeOfTruth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("kit fragment：apps/kits/ 下的子目录缺 kit.json 即拒绝（有根则每个子目录都是 kit）", () => {
  const root = createFixture();
  try {
    mkdirSync(join(root, "apps", "kits", "ghost"), { recursive: true });
    assertRejected(root, /apps\/kits\/ghost\/kit\.json 缺失：每个kit目录必须有 kit\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("kit fragment：apps/kits 存在但不是目录即拒绝（可选根 ⛔ 不得 fail-open）", () => {
  const root = createFixture();
  try {
    rmSync(join(root, "apps", "kits"), { recursive: true, force: true });
    writeFileSync(join(root, "apps", "kits"), "not a directory\n");
    assertRejected(root, /apps\/kits 不是目录：kit目录是 capability fragment 的发现面/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin fragment：plugins/ 目录缺失即 fail closed（发现面不可静默为空）", () => {
  const root = createFixture();
  try {
    rmSync(join(root, "apps", "plugins"), { recursive: true, force: true });
    assertRejected(root, /apps\/plugins\/ 目录不存在/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
