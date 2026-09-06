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
import { INSTALLED_LOCK_DIR, kitApiViolations } from "../tools/plugin/lock";

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

test("kitApiViolations：api 面名撞 Object.prototype 成员时不得读到继承属性而 fail-open", () => {
  // 面名模式 ^[a-z][A-Za-z0-9]{0,63}$ 把 toString / constructor / valueOf … 全放了进来。裸索引
  // `api[surface]` 会读到 Object.prototype 上继承来的函数（truthy）：「面不存在」闸不触发，
  // 而 spec.minSupported / spec.version 是 undefined ⇒ `v < undefined` 与 `v > undefined` 都是 false，
  // 版本区间闸也不触发。install / check 的 kit 依赖闸就此一起失效。
  const provided = { board: { version: 2, minSupported: 1 } };
  for (const surface of ["toString", "constructor", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString"]) {
    const problems = kitApiViolations({ [surface]: 99 }, provided);
    assert.equal(problems.length, 1, `api 面 ${surface} 必须报一条问题`);
    assert.match(problems[0], new RegExp(`api 面 "${surface}" 不存在`, "u"));
  }
  // 反方向：真实存在的面照常按版本区间判，不因加闸误伤
  assert.deepEqual(kitApiViolations({ board: 1 }, provided), []);
  assert.deepEqual(kitApiViolations({ board: 2 }, provided), []);
  assert.equal(kitApiViolations({ board: 3 }, provided).length, 1);
  assert.equal(kitApiViolations({ ranking: 1 }, provided).length, 1);
});
