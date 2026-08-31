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

test("CHARACTER_REGISTRATION_RECHECK_MS：环境配置必须是 1..2592000000 毫秒的安全整数（最长 30 天）", () => {
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

test("ARCHIVE_ZONES 必须是显式、无重复的合法区清单", () => {
  for (const bad of ["1,1", "1,,2", "-1", "1.5", "x", "65536"]) {
    const r = loadConfigWith({ ARCHIVE_ZONES: bad });
    assert.notEqual(r.status, 0, `ARCHIVE_ZONES=${bad} 应拒绝启动`);
    assert.match(r.stderr, /ARCHIVE_ZONES 非法/);
  }
  for (const good of ["0", "1", "0,1,65535", "1, 2, 3"]) {
    const r = loadConfigWith({ ARCHIVE_ZONES: good });
    assert.equal(r.status, 0, `ARCHIVE_ZONES=${good} 应通过：${r.stderr.slice(0, 240)}`);
  }
});

test("FREEZE_ENABLED=1 要求非空 ARCHIVE_ZONES，旧 unsafe 开关不能绕过", () => {
  for (const zones of [undefined, ""]) {
    const r = loadConfigWith({
      FREEZE_ENABLED: "1",
      ARCHIVE_ZONES: zones,
      FREEZE_UNSAFE_S0_ONLY: "1",
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ARCHIVE_ZONES 必须显式配置/);
  }
  const enabled = loadConfigWith({ FREEZE_ENABLED: "1", ARCHIVE_ZONES: "0,2" });
  assert.equal(enabled.status, 0, enabled.stderr.slice(0, 300));
});

test("FREEZE_ENABLED=0（或未设）允许空 worker 区清单", () => {
  for (const freeze of ["0", undefined] as const) {
    const r = loadConfigWith({ FREEZE_ENABLED: freeze, ARCHIVE_ZONES: "" });
    assert.equal(r.status, 0, `FREEZE_ENABLED=${String(freeze)} 应通过：${r.stderr.slice(0, 300)}`);
  }
});

test("archive 容量、水位与 sweep budget 配置严格拒绝零值和畸形值", () => {
  const fields = [
    "ARCHIVE_MAX_SNAPSHOT_BYTES",
    "ARCHIVE_MAX_ROWS_PER_ZONE",
    "ARCHIVE_MAX_BYTES_PER_ZONE",
    "FREEZE_SWEEP_BUDGET",
  ];
  for (const field of fields) {
    for (const bad of ["0", "-1", "1.5", "NaN", "9007199254740992"]) {
      const r = loadConfigWith({ [field]: bad });
      assert.notEqual(r.status, 0, `${field}=${bad} 应拒绝启动`);
      assert.match(r.stderr, new RegExp(field));
    }
  }
  for (const bad of ["0", "1.1", "-0.1", "NaN", "0.6junk"]) {
    const r = loadConfigWith({ FREEZE_REDIS_HIGH_WATERMARK: bad });
    assert.notEqual(r.status, 0, `FREEZE_REDIS_HIGH_WATERMARK=${bad} 应拒绝启动`);
    assert.match(r.stderr, /FREEZE_REDIS_HIGH_WATERMARK/);
  }
  const inverted = loadConfigWith({
    ARCHIVE_MAX_SNAPSHOT_BYTES: "101",
    ARCHIVE_MAX_BYTES_PER_ZONE: "100",
  });
  assert.notEqual(inverted.status, 0);
  assert.match(inverted.stderr, /ARCHIVE_MAX_BYTES_PER_ZONE 不得小于/);
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

/**
 * 幂等 v2 配对旋钮（§6.12，阶段 4）：两条都是加载期 fail-fast——
 * IDEM_RESULT_MAX_BYTES=0 会把全部幂等结果打成 done-oversize 墓碑（每个幂等写都回
 * OPERATION_RESULT_EXPIRED）；IDEM_MAX_PENDING_PER_UID=0 会拒绝一切幂等写（恒 BUSY）。
 * 两者都是「看起来只是保守一点」实则全量拒绝服务的静默配置事故。
 */
test("IDEM_RESULT_MAX_BYTES：0 与畸形值加载期拒绝，正整数放行", () => {
  for (const bad of ["0", "-1", "1.5", "abc", "9007199254740992"]) {
    const r = loadConfigWith({ IDEM_RESULT_MAX_BYTES: bad });
    assert.notEqual(r.status, 0, `IDEM_RESULT_MAX_BYTES=${bad} 应拒绝启动`);
    assert.match(r.stderr, /IDEM_RESULT_MAX_BYTES 非法/, `stderr：${r.stderr.slice(0, 240)}`);
  }
  for (const good of ["1", "32768", "1048576"]) {
    const r = loadConfigWith({ IDEM_RESULT_MAX_BYTES: good });
    assert.equal(r.status, 0, `IDEM_RESULT_MAX_BYTES=${good} 应通过，stderr：${r.stderr.slice(0, 240)}`);
  }
});

test("IDEM_MAX_PENDING_PER_UID：0 与畸形值加载期拒绝，≥1 放行", () => {
  for (const bad of ["0", "-1", "1.5", "abc"]) {
    const r = loadConfigWith({ IDEM_MAX_PENDING_PER_UID: bad });
    assert.notEqual(r.status, 0, `IDEM_MAX_PENDING_PER_UID=${bad} 应拒绝启动`);
    assert.match(r.stderr, /IDEM_MAX_PENDING_PER_UID 非法/, `stderr：${r.stderr.slice(0, 240)}`);
  }
  for (const good of ["1", "8", "64"]) {
    const r = loadConfigWith({ IDEM_MAX_PENDING_PER_UID: good });
    assert.equal(r.status, 0, `IDEM_MAX_PENDING_PER_UID=${good} 应通过，stderr：${r.stderr.slice(0, 240)}`);
  }
});

/**
 * GRACE 与 RECHECK 是一对：宽限必须**严格大于**复核窗口，否则它是静默的空操作。
 *
 * 推导见 config.ts 的注释。这里钉的是**加载期拒绝启动**，⛔ 不能只写文档——
 * 实测过 recheck=7d/grace=7d 这组「看起来很合理」的配置：WebPlatform 一挂，所有 marker 过窗的
 * 回访玩家照旧被拒，日志里连一条「走有界宽限放行」的 warn 都不会出现，运维会以为宽限已生效。
 * 本仓另外两组配对旋钮（CONNECT/REQUEST 超时、REPAIR_BACKOFF BASE/MAX）都有同款加载期交叉校验。
 */
test("CHARACTER_REGISTRATION_GRACE_MS 不大于 RECHECK 时必须拒绝启动", () => {
    const day = 86_400_000;
    for (const [grace, recheck, label] of [
        [String(7 * day), String(7 * day), "相等（文档建议值撞上默认复核窗时最容易踩）"],
        [String(day), String(7 * day), "宽限小于复核窗"],
        [String(30 * day), String(30 * day), "两端都设成上限"],
    ] as const) {
        const r = loadConfigWith({
            CHARACTER_REGISTRATION_GRACE_MS: grace,
            CHARACTER_REGISTRATION_RECHECK_MS: recheck,
        });
        assert.notEqual(r.status, 0, `${label} 应拒绝启动`);
        assert.match(
            r.stderr,
            /CHARACTER_REGISTRATION_GRACE_MS 必须大于 CHARACTER_REGISTRATION_RECHECK_MS/,
            `${label} 应报配对非法，实际 stderr：${r.stderr.slice(0, 300)}`,
        );
    }
});

test("GRACE 严格大于 RECHECK、以及关闭宽限（0）都必须正常加载", () => {
    const day = 86_400_000;
    // ⛔ 这一组必须放行，否则上面的 notEqual 可能只是因为 config 根本起不来
    const ok = loadConfigWith({
        CHARACTER_REGISTRATION_GRACE_MS: String(7 * day),
        CHARACTER_REGISTRATION_RECHECK_MS: String(day),
    });
    assert.equal(ok.status, 0, `严格大于应通过，stderr：${ok.stderr.slice(0, 300)}`);
    // grace=0 是「关闭宽限」，与 recheck 的大小无关，不得被配对校验误伤
    const disabled = loadConfigWith({
        CHARACTER_REGISTRATION_GRACE_MS: "0",
        CHARACTER_REGISTRATION_RECHECK_MS: String(30 * day),
    });
    assert.equal(disabled.status, 0, `关闭宽限应通过，stderr：${disabled.stderr.slice(0, 300)}`);
});

test("COMPUTE_RESPAWN_DELAY_MS 边界：非正整数与越界必须拒绝启动，1 与上限必须放行", () => {
    for (const [value, label] of [
        ["0", "零"],
        ["-1", "负值"],
        ["1.5", "小数"],
        ["abc", "非数字"],
        ["600001", "超上限"],
        ["9007199254740992", "超安全整数"],
    ] as const) {
        const r = loadConfigWith({ COMPUTE_RESPAWN_DELAY_MS: value });
        assert.notEqual(r.status, 0, `${label} 应拒绝启动`);
        assert.match(r.stderr, /COMPUTE_RESPAWN_DELAY_MS 非法/, `${label} 应报非法，实际 stderr：${r.stderr.slice(0, 200)}`);
    }
    for (const value of ["1", "600000", "2000"]) {
        const r = loadConfigWith({ COMPUTE_RESPAWN_DELAY_MS: value });
        assert.equal(r.status, 0, `「${value}」应正常加载，实际 stderr：${r.stderr.slice(0, 200)}`);
    }
});
