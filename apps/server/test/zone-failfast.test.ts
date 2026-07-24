/**
 * M13 硬化步 fail-fast 守门（子进程验证：GROUP_ZONES 是加载期 config 常量，注入什么测什么）：
 * per-zone 键构造（keys.ts P()）的严格性**门控在 GROUP_ZONES 非空**（真开多区才严格）——
 * - GROUP_ZONES 非空 + 未建 zoneCtx → throw（抓漏包裹的危险路径，防 per-zone 写静默落基础前缀，§3.5 B3）；
 * - GROUP_ZONES 非空 + zoneCtx.run 内 → 正常带 s{sId}_ 前缀；
 * - GROUP_ZONES 空（单形态/大混服）+ 未建 zoneCtx → 回退基础前缀，⛔ 不 throw（测试/现网零影响）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT = "const { kUser, zoneCtx } = await import('./src/core/infra/keys.ts');";

function runWith(groupZones: string | undefined, script: string): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env };
  if (groupZones === undefined) { delete env.GROUP_ZONES; } else { env.GROUP_ZONES = groupZones; }
  const r = spawnSync(process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", `${IMPORT}\n${script}`],
    { cwd: SERVER_ROOT, env, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("硬化 fail-fast：GROUP_ZONES 非空 + 未建 zoneCtx → per-zone 键构造 throw", () => {
  const r = runWith("1,2", "kUser('u');");
  assert.notEqual(r.status, 0, "应 throw（退出非 0）");
  assert.match(r.stderr, /zoneCtx 未建立且 GROUP_ZONES 非空/, `应报硬化错误，实际：${r.stderr.slice(0, 300)}`);
});

test("硬化 fail-fast：GROUP_ZONES 非空 + zoneCtx.run 内 → 正常带区前缀", () => {
  const r = runWith("1,2", "console.log(zoneCtx.run({ sId: 1 }, () => kUser('u')));");
  assert.equal(r.status, 0, `应通过，stderr：${r.stderr.slice(0, 300)}`);
  assert.match(r.stdout, /_s1_user:\{u\}/, `应带 s1_ 前缀，实际：${r.stdout.slice(0, 200)}`);
});

test("硬化 fail-fast：GROUP_ZONES 空（单形态）+ 未建 zoneCtx → 回退基础前缀不 throw", () => {
  const r = runWith("", "console.log(kUser('u'));");
  assert.equal(r.status, 0, `单形态应回退不 throw，stderr：${r.stderr.slice(0, 300)}`);
  assert.match(r.stdout, /_user:\{u\}/, `应基础前缀（无 s{sId}_），实际：${r.stdout.slice(0, 200)}`);
  assert.doesNotMatch(r.stdout, /_s\d+_user:/, "单形态不应带区前缀");
});
