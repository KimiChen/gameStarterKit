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

test("dev-stack.sh：归属校验以 started_epoch 为主判据，旧 locale 格式的 .owner 只在其余身份项全过后自愈", () => {
  // 缺口来源（真实故障，2026-09-05）：栈是 9 月 2 日中文 shell 起的，.owner 里 started_at 是
  // `三  9月/ 2 17:56:33 2026`；01fda6b 起脚本用 LC_ALL=C 读 lstart，逐字比对永远不等 ⇒ start/stop 双向拒绝，
  // `npm run dev` 必败于 stack 步。修法：写入/比对 epoch，旧文件在其余身份项全过后升级。
  const source = readFileSync(SCRIPT, "utf8");
  const code = source.split(/\r?\n/u).filter((line) => !line.trim().startsWith("#")).join("\n");
  assert.match(code, /printf 'started_epoch=%s\\n' "\$\(started_epoch_of "\$started"\)"/u, "write_owner 必须写 started_epoch");
  assert.match(code, /owner_value "\$file" started_epoch/u, "归属校验必须读 started_epoch");
  // 两个 owned 判定都必须经 owner_started_matches，且它在其余身份项之后调用（旧格式自愈的前提）。
  for (const fn of ["redis_owned", "mysql_owned"]) {
    const body = code.slice(code.indexOf(`${fn}() {`), code.indexOf("\n}", code.indexOf(`${fn}() {`)));
    assert.match(body, /owner_started_matches "\$file" "\$pid" \|\| return 1/u, `${fn} 必须经 owner_started_matches`);
    const runtimeCheck = fn === "redis_owned" ? "redis_runtime_matches" : "mysql_runtime_matches";
    assert.ok(body.indexOf(runtimeCheck) < body.indexOf("owner_started_matches"), `${fn}：启动时间判定必须放在运行时自证之后`);
    assert.doesNotMatch(body, /\[ "\$started" = /u, `${fn} 不得再逐字比对 lstart 字符串`);
  }
  // 解析 lstart 的 date 调用同样必须钉 LC_ALL=C。
  const dateLines = code.split("\n").filter((line) => /(^|[^A-Za-z_])date\s+-/u.test(line));
  assert.ok(dateLines.length >= 2, "started_epoch_of 应有 macOS/GNU 两条 date 解析");
  assert.deepEqual(dateLines.filter((line) => !line.includes("LC_ALL=C date")), [], "date 解析未钉 LC_ALL=C");
  // 带 started_epoch 却不等的文件 ⛔ 不得自愈（pid 复用/外部实例）；只有没有 started_epoch 的旧文件才走 heal。
  const matcher = code.slice(code.indexOf("owner_started_matches() {"), code.indexOf("\n}", code.indexOf("owner_started_matches() {")));
  assert.match(matcher, /if \[ -n "\$recorded_epoch" \]; then[\s\S]*return \$\?/u, "有 started_epoch 时只按 epoch 判定，不走自愈");
  assert.match(matcher, /heal_owner_started "\$file" "\$pid" "\$actual"/u);
});
