/**
 * dev 身份提供者的纯单测（无 Redis/MySQL）：AUTH_PROVIDER 配置闸（子进程模式，
 * 对齐 config-guard.test.ts）与 devUidOf 的稳定性/区分性。
 * Redis 往返（issueDevSession/verify/register/hasCharacter）与真 HTTP/WS 全链在
 * test/int/dev-auth.test.ts。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { devUidOf } from "../src/platform/devAuthProvider";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadConfigWith(
  vars: Record<string, string | undefined>,
): { status: number | null; stderr: string; stdout: string } {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) { delete env[k]; } else { env[k] = v; }
  }
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", "await import('./src/core/infra/config.ts')"],
    { cwd: SERVER_ROOT, env, encoding: "utf8", timeout: 30_000 },
  );
  return { status: r.status, stderr: r.stderr, stdout: r.stdout };
}

test("AUTH_PROVIDER=dev + NODE_ENV=production：加载期即拒（铁律 12 生产闸）", () => {
  const r = loadConfigWith({ AUTH_PROVIDER: "dev", NODE_ENV: "production" });
  assert.notEqual(r.status, 0, "生产 + dev provider 必须拒绝启动");
  assert.match(r.stderr, /AUTH_PROVIDER=dev 是仅限非生产环境的显式例外/);
});

test("AUTH_PROVIDER 非法值：加载期即拒", () => {
  for (const bad of ["test", "local", "1", "DEVAUTH"]) {
    const r = loadConfigWith({ AUTH_PROVIDER: bad });
    assert.notEqual(r.status, 0, `「${bad}」应拒绝启动`);
    assert.match(r.stderr, /AUTH_PROVIDER 非法/);
  }
});

test("AUTH_PROVIDER 合法值与缺省：非生产缺省 dev、生产缺省 webplatform", () => {
  const devDefault = loadConfigWith({ AUTH_PROVIDER: undefined, NODE_ENV: "development" });
  assert.equal(devDefault.status, 0, `非生产缺省应放行：${devDefault.stderr.slice(0, 200)}`);
  // 生产加载还要过既有的 WEBPLATFORM_SERVICE_SECRET 必填闸（与本用例无关，补上）
  const prodEnv = { NODE_ENV: "production", WEBPLATFORM_SERVICE_SECRET: "test-service-secret" };
  const prodDefault = loadConfigWith({ AUTH_PROVIDER: undefined, ...prodEnv });
  assert.equal(prodDefault.status, 0, `生产缺省 webplatform 应放行：${prodDefault.stderr.slice(0, 200)}`);
  const explicit = loadConfigWith({ AUTH_PROVIDER: "webplatform", ...prodEnv });
  assert.equal(explicit.status, 0);
  const explicitDev = loadConfigWith({ AUTH_PROVIDER: "dev", NODE_ENV: "development" });
  assert.equal(explicitDev.status, 0);
});

test("devUidOf：同一 devKey 稳定同账号、不同 key 不同账号、形状稳定", () => {
  const a1 = devUidOf("tester-a");
  const a2 = devUidOf("tester-a");
  const b = devUidOf("tester-b");
  assert.equal(a1, a2, "同一 devKey 必须稳定派生同一 uid");
  assert.notEqual(a1, b, "不同 devKey 必须是不同账号");
  assert.match(a1, /^dev-[0-9a-f]{16}$/, "uid 形状 = dev-<16 hex>（稳定、可读、不进 token）");
});
