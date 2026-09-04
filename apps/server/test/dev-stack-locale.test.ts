/**
 * dev-stack.sh 的 locale 稳定性回归钉。
 *
 * 缺口来源（真实故障）：归属校验把 `ps -o lstart=` 的输出逐字写进 .owner 再逐字比对，而该
 * 输出**随 locale 变化**——C 下是 `Sat Sep  5 00:11:27 2026`，zh_CN.UTF-8 下是
 * `六  9月/ 5 00:11:27 2026`。于是「英文 shell 启动、中文 shell 检查」时 start 报
 * 「已被占用，但不是本栈实例」、stop 报「身份不匹配」，双向死锁只能手工 kill 进程。
 *
 * ⚠ 该故障在英文 shell 下**完全隐形**，无法靠日常使用发现，故用源文本钉守住：
 * 脚本里每一处解析 ps 输出的调用都必须钉死 LC_ALL=C。
 *
 * 变异锚点：删掉任一处的 `LC_ALL=C ` 前缀 ⇒ 本用例转红。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "../tools/dev-stack.sh");

test("dev-stack.sh：解析 ps 输出的调用必须钉死 LC_ALL=C（跨 locale 的归属校验）", () => {
  const source = readFileSync(SCRIPT, "utf8");
  const lines = source.split(/\r?\n/u);
  const psLines = lines
    .map((line, index) => ({ line: line.trim(), no: index + 1 }))
    // ⛔ 注释行不算：本文件与脚本注释里都会出现 `ps -o lstart=` 的字面示例。
    .filter((entry) => !entry.line.startsWith("#") && /(^|[^A-Za-z_])ps\s+-/u.test(entry.line));

  assert.ok(psLines.length >= 2, `脚本里应至少有两处 ps 调用，实际 ${psLines.length} 处——扫描被架空`);
  const unpinned = psLines.filter((entry) => !entry.line.includes("LC_ALL=C ps"));
  assert.deepEqual(
    unpinned.map((entry) => `${entry.no}: ${entry.line}`),
    [],
    "以下 ps 调用未钉 LC_ALL=C：其输出格式随 locale 变化，会让归属校验在不同语言的 shell 之间互相判为「外部实例」",
  );
});
