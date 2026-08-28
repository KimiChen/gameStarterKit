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

function loadConfigWith(
  vars: Record<string, string | undefined>,
  source = "await import('./src/core/infra/config.ts')",
): { status: number | null; stderr: string; stdout: string } {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) { delete env[k]; } else { env[k] = v; }
  }
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", source],
    { cwd: SERVER_ROOT, env, encoding: "utf8", timeout: 30_000 },
  );
  return { status: r.status, stderr: r.stderr, stdout: r.stdout };
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

test("CHARACTER_READY_TIMEOUT_MS：环境配置必须是 1..120000 的安全整数", () => {
  for (const bad of ["0", "-1", "1.5", "NaN", "Infinity", "120001", "9007199254740992"]) {
    const r = loadConfigWith({ CHARACTER_READY_TIMEOUT_MS: bad });
    assert.notEqual(r.status, 0, `CHARACTER_READY_TIMEOUT_MS=${bad} 应拒绝启动`);
    assert.match(r.stderr, /CHARACTER_READY_TIMEOUT_MS 非法/, `stderr：${r.stderr.slice(0, 240)}`);
  }
  for (const good of ["1", "120000"]) {
    const r = loadConfigWith({ CHARACTER_READY_TIMEOUT_MS: good });
    assert.equal(r.status, 0, `CHARACTER_READY_TIMEOUT_MS=${good} 应通过，stderr：${r.stderr.slice(0, 240)}`);
  }
});

test("CHARACTER_REGISTRATION_RECHECK_MS：环境配置必须是 1..30 天的安全整数", () => {
  const max = String(30 * 86_400_000);
  for (const bad of ["0", "-1", "1.5", "NaN", "Infinity", String(30 * 86_400_000 + 1), "9007199254740992"]) {
    const r = loadConfigWith({ CHARACTER_REGISTRATION_RECHECK_MS: bad });
    assert.notEqual(r.status, 0, `CHARACTER_REGISTRATION_RECHECK_MS=${bad} 应拒绝启动`);
    assert.match(r.stderr, /CHARACTER_REGISTRATION_RECHECK_MS 非法/, `stderr：${r.stderr.slice(0, 240)}`);
  }
  for (const good of ["1", max]) {
    const r = loadConfigWith({ CHARACTER_REGISTRATION_RECHECK_MS: good });
    assert.equal(r.status, 0, `CHARACTER_REGISTRATION_RECHECK_MS=${good} 应通过，stderr：${r.stderr.slice(0, 240)}`);
  }
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

test("WEBPLATFORM_INTERNAL_URL 只接受无凭据、无路径参数的 http(s) origin", () => {
  for (const bad of [
    "not-a-url",
    "ftp://127.0.0.1:2571",
    "http://user:pass@127.0.0.1:2571",
    "http://127.0.0.1:2571/internal",
    "http://127.0.0.1:2571?x=1",
    "http://127.0.0.1:2571#frag",
  ]) {
    const r = loadConfigWith({ WEBPLATFORM_INTERNAL_URL: bad });
    assert.notEqual(r.status, 0, `WEBPLATFORM_INTERNAL_URL=${bad} 应拒绝启动`);
    assert.match(r.stderr, /WEBPLATFORM_INTERNAL_URL/);
  }
  for (const good of ["http://127.0.0.1:2571", "https://wp.example.test", "http://localhost:2571/"]) {
    const r = loadConfigWith({ WEBPLATFORM_INTERNAL_URL: good });
    assert.equal(r.status, 0, `WEBPLATFORM_INTERNAL_URL=${good} 应通过，stderr：${r.stderr.slice(0, 200)}`);
  }
});

test("WEBPLATFORM_SERVICE_ID 非法值加载期拒绝", () => {
  for (const bad of ["含中文", "has space", "x".repeat(65), "/"]) {
    const r = loadConfigWith({ WEBPLATFORM_SERVICE_ID: bad });
    assert.notEqual(r.status, 0, `WEBPLATFORM_SERVICE_ID=${bad} 应拒绝启动`);
    assert.match(r.stderr, /WEBPLATFORM_SERVICE_ID 非法/);
  }
});

/**
 * FREEZE_ENABLED 加载期闸（archive 步补齐前唯一安全值是 0）。
 *
 * ⚠ **本组用例是对上一版用例的纠正，⛔ 别改回去**：上一版把判据当成「多区才危险」，于是
 * ①「FREEZE_ENABLED=1 + GROUP_ZONES 非空 → 拒绝」，②「FREEZE_ENABLED=1 + GROUP_ZONES 空 → 合法」。
 * 两条都反了，而且第二条**把唯一会坏数据的组合钉成了绿契约**——比原来的散文更坏，因为有人会信它。
 * 实测依据见 config.ts 该项注释：空 GROUP_ZONES 才是 freeze 唯一跑得起来、也唯一会把在 s≥1
 * 玩过的活人当幽灵项 ZREM 掉的配置；非空那侧 worker 运行期本来就崩（keys.ts zoneCtx fail-fast）。
 */
test("FREEZE_ENABLED=1：加载期即 throw —— ⛔ 空 GROUP_ZONES 也不例外（那侧才会坏数据）", () => {
  for (const zones of [undefined, "", "0", "1", "1,2", "0,3"]) {
    const r = loadConfigWith({ FREEZE_ENABLED: "1", GROUP_ZONES: zones });
    assert.notEqual(r.status, 0, `GROUP_ZONES=「${String(zones)}」+ freeze 必须拒绝启动`);
    assert.match(r.stderr, /archive 步未补齐/, `stderr：${r.stderr.slice(0, 300)}`);
  }
});

test("FREEZE_ENABLED=0（或未设）：任何 GROUP_ZONES 都正常加载", () => {
  for (const [freeze, zones] of [["0", ""], ["0", "1,2"], [undefined, "0"], [undefined, ""]] as const) {
    const r = loadConfigWith({ FREEZE_ENABLED: freeze, GROUP_ZONES: zones });
    assert.equal(r.status, 0, `FREEZE_ENABLED=${String(freeze)} GROUP_ZONES=${String(zones)} 应通过，stderr：${r.stderr.slice(0, 300)}`);
  }
});

test("逃生口 FREEZE_UNSAFE_S0_ONLY=1：显式放行（⛔ 仅限目录不下发 s≥1 的部署）", () => {
  const r = loadConfigWith({ FREEZE_ENABLED: "1", FREEZE_UNSAFE_S0_ONLY: "1", GROUP_ZONES: "" });
  assert.equal(r.status, 0, `显式逃生口应放行，stderr：${r.stderr.slice(0, 300)}`);
});

/**
 * PAY_ENABLED 生产 fail-fast（评审：缺省关只是"软开关"）。
 *
 * `/pay/wx-notify` 后面接的是真发币（purchases.ts：paid CAS → currency_ledger 正向 delta），
 * 而当前它只有**共享密钥占位**（⛔ 非 APIv3 平台证书验签）。故生产显式开启 = 配置事故。
 * 范式与同文件 FREEZE_ENABLED 用例一致。
 */
test("PAY_ENABLED=1 + NODE_ENV=production：加载期即 throw（⛔ 支付链闭环前不许生产开启）", () => {
  const r = loadConfigWith({
    PAY_ENABLED: "1",
    NODE_ENV: "production",
    WEBPLATFORM_SERVICE_SECRET: "test-service-secret",
  });
  assert.notEqual(r.status, 0, "生产 + PAY_ENABLED=1 应拒绝启动");
  assert.match(r.stderr, /PAY_ENABLED=1 在生产环境被显式开启/, `stderr：${r.stderr.slice(0, 300)}`);
});

test("PAY_ENABLED=1 在非生产：正常加载（联调/灰度留口）", () => {
  for (const nodeEnv of [undefined, "development", "test"]) {
    const r = loadConfigWith({ PAY_ENABLED: "1", NODE_ENV: nodeEnv });
    assert.equal(r.status, 0, `NODE_ENV=${String(nodeEnv)} 应通过，stderr：${r.stderr.slice(0, 300)}`);
  }
});

test("幂等 pending 租约窗口必须覆盖 handler timeout", () => {
  const r = loadConfigWith({},
    "const c = await import('./src/core/infra/config.ts'); if (!(c.IDEM_PENDING_MS > c.HANDLER_TIMEOUT_MS)) throw new Error('window invariant');",
  );
  assert.equal(r.status, 0, `配置窗口不满足不等式：${r.stderr.slice(0, 300)}`);
});
