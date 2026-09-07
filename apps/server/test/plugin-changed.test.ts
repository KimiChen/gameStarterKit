/**
 * `plugin -- changed`（tools/plugin/changed.ts）的**收窄判据**：它决定内循环能不能只跑变更包的测试。
 *
 * ⚠ 这里守的是**反向**判据：只有当整次改动都落在包的所有权推导集（+ 生成物/镜像）内才收窄；
 * 只要有一条宿主路径就必须退回 `verify:all`。⛔ 判反了不会红——只会在宿主改动时静默少跑一批
 * 本该抓到回归的包测试（F13 正是这样被 `snake-run-rewards.test.ts` 抓到的），所以每一条都要有用例。
 *
 * `planChanged` 只吃「改动路径清单」这一个输入，所以这些用例直接对真仓根喂合成路径，
 * ⛔ 不建夹具、不跑 git。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { FAST_STEPS, MACHINERY_TESTS, planChanged } from "../tools/plugin/changed";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const plan = (changed: readonly string[]) => planChanged(REPOSITORY_ROOT, changed);

test("纯包改动收窄，且只带上该包自己的测试", () => {
  const result = plan(["apps/plugins/snake/README.md", "apps/client/src/plugins/snake/index.ts"]);
  assert.equal(result.fast, true, result.reason);
  assert.deepEqual([...result.packages], ["snake"]);
  assert.deepEqual([...result.foreign], []);
  assert.ok(result.tests.includes("test/snake-rules.test.ts"), "缺 snake 自有服务端测试");
  assert.ok(result.tests.includes("../client/test/snake-gameplay.test.ts"), "缺 snake 自有客户端测试");
  assert.ok(!result.tests.some((file) => file.includes("redeem")), "⛔ 不该带上别的包的测试");
});

test("包机制测试恒在（任何 plugin.json 改动都碰得到它们）", () => {
  const result = plan(["apps/plugins/tally/plugin.json"]);
  assert.equal(result.fast, true, result.reason);
  for (const file of ["test/plugin-codegen.test.ts", "test/plugin-lock.test.ts", "test/gameplay-codegen.test.ts", "test/kit-api.test.ts"]) {
    assert.ok(result.tests.includes(file), `机制测试缺 ${file}`);
  }
});

test("宿主改动一律退回全量——包测试直接 import 宿主，改宿主能把它们打红", () => {
  for (const hostPath of [
    "apps/server/src/rooms/GameRoom.ts",
    "apps/server/src/rooms/GameMode.ts",
    "apps/client/src/Main.ts",
    "apps/shared/src/protocol/envelope.ts",
    "apps/server/tools/plugin/ownership.ts",
    "scripts/verify-inventory.mjs",
    "package.json",
  ]) {
    const result = plan([hostPath]);
    assert.equal(result.fast, false, `${hostPath} 不该收窄：${result.reason}`);
    assert.deepEqual([...result.foreign], [hostPath]);
  }
});

test("包改动 + 一条宿主改动 = 全量（⛔ 不允许「大部分是包」就收窄）", () => {
  const result = plan(["apps/plugins/snake/README.md", "apps/server/src/rooms/GameRoom.ts"]);
  assert.equal(result.fast, false, result.reason);
  assert.deepEqual([...result.foreign], ["apps/server/src/rooms/GameRoom.ts"]);
});

test("宿主自有登记 builtin 推导不出所有权集 → 按宿主算，并且报出来而不是静默", () => {
  const result = plan(["apps/plugins/builtin/plugin.json"]);
  assert.equal(result.fast, false, result.reason);
  assert.deepEqual([...result.foreign], ["apps/plugins/builtin/plugin.json"]);
  assert.ok(result.undeducible.some((entry) => entry.id === "builtin"), "builtin 应登记在 undeducible 里");
});

test("生成物与镜像跟着包的真源走，不算宿主改动", () => {
  const result = plan([
    "apps/plugins/snake/plugin.json",
    "apps/shared/src/protocol/lobbyRpc/registry.generated.ts",
    "apps/client/src/generated/plugins.ts",
    "docs/plugins.generated.md",
    "apps/client/src/shared/index.ts",
    "apps/Cocos/assets/src/plugins/snake/index.ts",
  ]);
  assert.equal(result.fast, true, result.reason);
  assert.deepEqual([...result.packages], ["snake"]);
  assert.deepEqual([...result.foreign], []);
  assert.equal(result.derived.length, 4, "四条生成物/镜像应归入 derived（Cocos 镜像属 snake 自己的推导集）");
});

test("只有生成物在动、没有任何包的真源 → 全量（有人手改了生成物）", () => {
  const result = plan(["apps/shared/src/protocol/lobbyRpc/registry.generated.ts", "docs/plugins.generated.md"]);
  assert.equal(result.fast, false, result.reason);
  assert.deepEqual([...result.foreign], []);
  assert.equal(result.derived.length, 2);
});

test("锁变了 = 刚做过 install/reinstall，是身份变更 → 全量", () => {
  const result = plan(["apps/plugins/snake/plugin.json", "scripts/packages/snake.lock"]);
  assert.equal(result.fast, false, result.reason);
  assert.deepEqual([...result.foreign], ["scripts/packages/snake.lock"]);
});

test("工作树干净 → 全量（没有可收窄的改动面）", () => {
  const result = plan([]);
  assert.equal(result.fast, false, result.reason);
});

test("两个包同时改 → 收窄，两个包的测试都带上", () => {
  const result = plan(["apps/plugins/snake/README.md", "apps/plugins/redeem/README.md"]);
  assert.equal(result.fast, true, result.reason);
  assert.deepEqual([...result.packages], ["redeem", "snake"]);
  assert.ok(result.tests.includes("test/snake-rules.test.ts"));
  assert.ok(result.tests.includes("test/redeem-claim.test.ts"));
});

test("kit 与建在它上面的插件同样按包收窄", () => {
  const result = plan(["apps/kits/arena/kit.json"]);
  assert.equal(result.fast, true, result.reason);
  assert.deepEqual([...result.packages], ["arena"]);
  assert.ok(result.tests.includes("test/arena-board.test.ts"), "缺 arena 自有测试");
  assert.ok(result.tests.includes("test/arenaDuel-game-mode.test.ts"), "kit 的 mode 测试也归 kit（testPrefixRules 按 mode 展开）");
});

test("快路径的每个 npm 脚本名都真实存在（⛔ 打错名字会在收窄时才炸）", () => {
  const rootScripts = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, "package.json"), "utf8")).scripts as Record<string, string>;
  const serverScripts = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, "apps/server/package.json"), "utf8")).scripts as Record<string, string>;
  for (const [label, args] of FAST_STEPS) {
    const workspace = args[0] === "--workspace";
    const name = args[workspace ? 3 : 1];
    const table = workspace ? serverScripts : rootScripts;
    assert.ok(Object.hasOwn(table, name), `${label}：${workspace ? "@game/server" : "根"} package.json 没有脚本 ${name}`);
  }
  assert.ok(Object.hasOwn(rootScripts, "test:changed"), "根 package.json 缺 test:changed 别名");
});

test("机制测试清单里的文件都存在（⛔ 改名后清单会静默少跑）", () => {
  for (const file of MACHINERY_TESTS) {
    assert.ok(fs.existsSync(path.join(REPOSITORY_ROOT, file)), `机制测试清单指向不存在的文件：${file}`);
  }
});
