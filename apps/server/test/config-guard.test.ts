/**
 * PROJECT_ID 校验守门：^[a-z][a-z0-9_]{0,31}$，非法值必须在 config.ts 模块加载期 throw
 * （= 服务端/db-bootstrap/任何入口 import 即启动失败）。
 * 它会进 Redis 键名与 MySQL 库名（game_<PROJECT_ID>），放宽 = 两套命名空间的注入面。
 * 用子进程验证：显式 env 优先于根 .env.development，注入什么测什么。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadConfigWith(projectId: string | undefined): { status: number | null; stderr: string } {
  const env = { ...process.env };
  if (projectId === undefined) { delete env.PROJECT_ID; } else { env.PROJECT_ID = projectId; }
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", "await import('./src/core/infra/config.ts')"],
    { cwd: SERVER_ROOT, env, encoding: "utf8", timeout: 30_000 },
  );
  return { status: r.status, stderr: r.stderr };
}

test("PROJECT_ID 非法值：config 加载期即 throw（服务端拒绝启动）", () => {
  for (const bad of ["Gono", "1abc", "a-b", "gono!", "含中文", "_x", "a".repeat(33)]) {
    const r = loadConfigWith(bad);
    assert.notEqual(r.status, 0, `「${bad}」应拒绝启动`);
    assert.match(r.stderr, /PROJECT_ID 非法/, `「${bad}」应报 PROJECT_ID 非法，实际 stderr：${r.stderr.slice(0, 200)}`);
  }
});

test("PROJECT_ID 合法值与缺省值：正常加载", () => {
  for (const ok of ["gono", "a", "game2_dev", "x".repeat(32)]) {
    const r = loadConfigWith(ok);
    assert.equal(r.status, 0, `「${ok}」应通过，stderr：${r.stderr.slice(0, 200)}`);
  }
  // 未设置（且根 .env.development 提供 gono 或走缺省）也应通过
  assert.equal(loadConfigWith(undefined).status, 0);
});
