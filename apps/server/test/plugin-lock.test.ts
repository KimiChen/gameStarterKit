/**
 * 已安装插件锁的 freshness（docs/PLUGIN.md §5/§7：scripts/packages/<id>.lock 是「已安装插件」的唯一登记面）：
 * 随 `npm --workspace @game/server run test` 进 verify:all——锁登记的文件被本地改动 / 删除、plugins/<id>/plugin.json
 * 缺失或与锁不一致、锁内路径漂出所有权推导集，任一都红。没有插件时为空通过（⛔ 不是假绿：check 会枚举
 * scripts/packages/*.lock，目录不存在即无插件）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkInstalledPlugins } from "../tools/plugin/check";
import { INSTALLED_LOCK_DIR } from "../tools/plugin/lock";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("checked-in installed-plugin locks are consistent with the working tree", () => {
  const report = checkInstalledPlugins(REPOSITORY_ROOT);
  const problems = report.plugins.flatMap((plugin) => plugin.problems.map((problem) => `${plugin.id}: ${problem}`));
  assert.deepEqual(problems, [], "已安装插件锁与工作树不一致");
});

test("scripts/packages/ 只承载 *.lock（writer = plugin -- install）与 README", () => {
  const dir = path.join(REPOSITORY_ROOT, INSTALLED_LOCK_DIR);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    assert.ok(name.endsWith(".lock") || name === "README.md", `scripts/packages/ 出现陌生文件：${name}`);
  }
});
