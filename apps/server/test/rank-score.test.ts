/**
 * M7 · encodeScore/decodeScore 边界单测（纯函数，不需要 Redis）。
 *
 * 覆盖 10·M7 DoD 列的边界：赛季首/尾、同分先后（早到 frac 大）、精度边界、decode 还原整数分。
 * ⚠ 精度结论（数值实测,见 score.ts 头注）:30 天赛季下秒级 tie-break 的 intScore 安全上界
 *   ≈ 2^28 ≈ 2.7e8;03 文档声称的「~1e12 内保秒级」在 IEEE double 下达不到——
 *   1e12 处 ULP ≈ 1.22e-4,每秒 frac 增量仅 3.86e-8,分辨粒度退化到 ~53 分钟。
 *   本测试如实固化两个档位的行为,分歧上报待拍板（09·K1 的 1e12 上界指 decode 精确,仍成立）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SEASON_BASE, SEASON_LEN_S } from "../src/core/infra/config";
import { decodeScore, encodeScore, seasonIdAt, seasonIndexAt, seasonStartSec } from "../src/core/rank/score";

const FRAC_MAX = 0.1; // elapsed=0 时 frac = (1-0)/10

test("赛季首：frac 用满 0.1；早于 SEASON_BASE 一律 clamp 到季首", () => {
  assert.equal(encodeScore(100, SEASON_BASE), 100 + FRAC_MAX);
  assert.equal(encodeScore(100, SEASON_BASE - 999), 100 + FRAC_MAX); // clamp 到 [0, len] 下界
  assert.equal(encodeScore(0, SEASON_BASE), FRAC_MAX);               // 零分也带 tie-break 小数
});

test("赛季尾：frac 趋近 0 但不为 0；跨过季尾即下一季季首（frac 回到 0.1）", () => {
  const lastSec = SEASON_BASE + SEASON_LEN_S - 1;
  const fracTail = encodeScore(100, lastSec) - 100;
  assert.ok(fracTail > 0, "季尾最后一秒 frac 仍 > 0");
  assert.ok(fracTail < 1e-6, `季尾 frac 应趋近 0，实际 ${fracTail}`);
  // 窗口推导：季尾整点已属下一季，frac 复位——跨季后 tie-break 分辨率不塌（区别于固定 base 的死 clamp）
  assert.equal(encodeScore(100, SEASON_BASE + SEASON_LEN_S), 100 + FRAC_MAX);
});

test("同分先后：早到 frac 大，ZREVRANGE 语义下排前（秒级严格可分辨）", () => {
  const t0 = SEASON_BASE + 12_345;
  for (const s of [0, 1, 999, 1_000_000, 2.5e8]) {
    const early = encodeScore(s, t0);
    const late = encodeScore(s, t0 + 1); // 仅差 1 秒
    assert.ok(early > late, `intScore=${s} 秒级 tie-break 必须严格可分辨`);
    assert.equal(decodeScore(early), s);
    assert.equal(decodeScore(late), s);
  }
  // 不同 intScore 的顺序不被 frac 颠倒：frac ∈ [0, 0.1] 恒小于 1 分
  assert.ok(encodeScore(101, SEASON_BASE + SEASON_LEN_S - 1) > encodeScore(100, SEASON_BASE));
});

test("1e12 档：decode 精确还原；秒级 tie-break 退化（03 的 1e12 声称达不到，安全上界 ~2^28）", () => {
  const t0 = SEASON_BASE + 1000;
  const big = 1e12;
  // decode 还原整数分在 1e12 依旧精确（09·K1 的 1e12 上界对 decode 成立）
  assert.equal(decodeScore(encodeScore(big, t0)), big);
  assert.equal(decodeScore(encodeScore(big, SEASON_BASE + SEASON_LEN_S - 1)), big);

  // 顺序永不倒挂（至多塌成同分，不会晚到反而排前）
  for (const dt of [1, 60, 600, 3600]) {
    assert.ok(encodeScore(big, t0) >= encodeScore(big, t0 + dt), `Δt=${dt}s 不得倒挂`);
  }
  // 实测极限：1e12 处 ULP≈1.22e-4 >> 每秒 frac 增量 3.86e-8 → 相邻 1 秒不可分辨（这是 double 的物理极限）
  assert.equal(encodeScore(big, t0), encodeScore(big, t0 + 1), "1e12 秒级已不可分辨（如可分辨说明公式变了，重审）");
  // 2 小时（≈2.3 ULP）必可分辨——1e12 档的实际分辨粒度
  assert.ok(encodeScore(big, t0) > encodeScore(big, t0 + 7200), "1e12 档 2h 必须可分辨");
  // 安全上界内（2.5e8 < 2^28）秒级仍严格可分辨（已在上一用例覆盖，这里就近对照）
  assert.ok(encodeScore(2.5e8, t0) > encodeScore(2.5e8, t0 + 1));
});

test("decode 还原整数分：与 frac 无关、对边界值成立", () => {
  for (const s of [0, 1, 7, 100, 12_345_678, 1e12]) {
    for (const t of [SEASON_BASE, SEASON_BASE + 1, SEASON_BASE + SEASON_LEN_S - 1]) {
      assert.equal(decodeScore(encodeScore(s, t)), s);
    }
  }
});

test("赛季推导：seasonIndexAt / seasonIdAt / seasonStartSec 边界", () => {
  assert.equal(seasonIndexAt(SEASON_BASE), 0);
  assert.equal(seasonIndexAt(SEASON_BASE + SEASON_LEN_S - 1), 0);
  assert.equal(seasonIndexAt(SEASON_BASE + SEASON_LEN_S), 1);       // 季尾整点属下一季
  assert.equal(seasonIndexAt(SEASON_BASE - 1), 0);                  // 早于全局起点归 s0
  assert.equal(seasonIdAt(SEASON_BASE + 2 * SEASON_LEN_S + 5), "s2");
  assert.equal(seasonStartSec(3), SEASON_BASE + 3 * SEASON_LEN_S);
});
