/**
 * config.ts 加载期校验守门（用子进程验证：显式 env 优先于根 .env.development，注入什么测什么）：
 * - PROJECT_ID：^[a-z][a-z0-9_]{0,31}$——进 Redis 键名与 MySQL 库名，放宽 = 命名空间注入面
 * - PORT：纯整数 1–65535——⛔ parseInt 容错会与 devEnv 生成器的纯数字规则出不同结果
 *   （「2599junk」服务端截成 2599、客户端回退 2568 = 静默脑裂），两侧同规则、非法即失败
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadConfigWith(vars: Record<string, string | undefined>): { status: number | null; stderr: string } {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) { delete env[k]; } else { env[k] = v; }
  }
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", "await import('./src/core/infra/config.ts')"],
    { cwd: SERVER_ROOT, env, encoding: "utf8", timeout: 30_000 },
  );
  return { status: r.status, stderr: r.stderr };
}

test("PROJECT_ID 非法值：config 加载期即 throw（服务端拒绝启动）", () => {
  for (const bad of ["Gono", "1abc", "a-b", "gono!", "含中文", "_x", "a".repeat(33)]) {
    const r = loadConfigWith({ PROJECT_ID: bad });
    assert.notEqual(r.status, 0, `「${bad}」应拒绝启动`);
    assert.match(r.stderr, /PROJECT_ID 非法/, `「${bad}」应报 PROJECT_ID 非法，实际 stderr：${r.stderr.slice(0, 200)}`);
  }
});

test("PROJECT_ID 合法值与缺省值：正常加载", () => {
  for (const ok of ["gono", "a", "game2_dev", "x".repeat(32)]) {
    const r = loadConfigWith({ PROJECT_ID: ok });
    assert.equal(r.status, 0, `「${ok}」应通过，stderr：${r.stderr.slice(0, 200)}`);
  }
  // 未设置（且根 .env.development 提供 gono 或走缺省）也应通过
  assert.equal(loadConfigWith({ PROJECT_ID: undefined }).status, 0);
});

test("PORT 非法值：config 加载期即 throw（parseInt 截断类值必须拒绝，防双端脑裂）", () => {
  for (const bad of ["2599junk", "abc", "0", "-1", "65536", "25.99", ""]) {
    if (bad === "") { continue; } // 空串 = env() 视为未设置走默认，单独在下一用例覆盖
    const r = loadConfigWith({ PORT: bad });
    assert.notEqual(r.status, 0, `「${bad}」应拒绝启动`);
    assert.match(r.stderr, /PORT 非法/, `「${bad}」应报 PORT 非法，实际 stderr：${r.stderr.slice(0, 200)}`);
  }
});

test("PORT 合法值与缺省值：正常加载", () => {
  for (const ok of ["2568", "1", "65535", "2599"]) {
    const r = loadConfigWith({ PORT: ok });
    assert.equal(r.status, 0, `「${ok}」应通过，stderr：${r.stderr.slice(0, 200)}`);
  }
  assert.equal(loadConfigWith({ PORT: undefined }).status, 0, "未设置走默认 2568");
  assert.equal(loadConfigWith({ PORT: "" }).status, 0, "空串 = 未设置走默认");
});

// GROUP_ZONES：本进程/组承载的区服 sId 集合（进服硬闸单源，docs/DUAL_MODE.md §5.1 M11）。
// 空=承载全部；非法（非「逗号分隔的非负整数」）加载期即 throw。
test("GROUP_ZONES 非法值：config 加载期即 throw（防区归属闸配错）", () => {
  for (const bad of ["1,2,x", "a", "-1", "1,,2,z", "1.5", "70000", "1;2"]) {
    const r = loadConfigWith({ GROUP_ZONES: bad });
    assert.notEqual(r.status, 0, `「${bad}」应拒绝启动`);
    assert.match(r.stderr, /GROUP_ZONES 非法/, `「${bad}」应报 GROUP_ZONES 非法，实际 stderr：${r.stderr.slice(0, 200)}`);
  }
});

test("GROUP_ZONES 合法值与缺省值：正常加载", () => {
  for (const ok of ["1,2,3", "0", "1", "1, 2, 3", "1,2,3,", "10,11,12,13,14,15,16,17,18,19"]) {
    const r = loadConfigWith({ GROUP_ZONES: ok });
    assert.equal(r.status, 0, `「${ok}」应通过，stderr：${r.stderr.slice(0, 200)}`);
  }
  assert.equal(loadConfigWith({ GROUP_ZONES: undefined }).status, 0, "未设置 = 承载全部");
  assert.equal(loadConfigWith({ GROUP_ZONES: "" }).status, 0, "空串 = 承载全部");
});

test("ACCOUNT_MODE 非法值：config 加载期即 throw（⛔ 不静默回退 in-process = split 下打错库）", () => {
  for (const bad of ["httpp", "HTTP", "remote", "inprocess", "1"]) {
    const r = loadConfigWith({ ACCOUNT_MODE: bad });
    assert.notEqual(r.status, 0, `ACCOUNT_MODE=${bad} 应拒绝启动`);
    assert.match(r.stderr, /ACCOUNT_MODE 非法/);
  }
});

test("ACCOUNT_MODE 合法值与缺省值：正常加载", () => {
  for (const good of ["in-process", "http"]) {
    assert.equal(loadConfigWith({ ACCOUNT_MODE: good }).status, 0, `ACCOUNT_MODE=${good} 应正常加载`);
  }
  assert.equal(loadConfigWith({ ACCOUNT_MODE: undefined }).status, 0, "缺省（不设）应正常加载");
});
