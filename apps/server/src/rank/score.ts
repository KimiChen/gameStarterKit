/**
 * 排行分数编码（[03 · 排行榜](../../../../docs/server/03-gateway-data-layer.md#排行榜)，09·K1）。
 *
 * 同分「先达到者靠前」：把赛季内已过秒数编进 score 小数位——elapsed 越小 → frac 越大 →
 * `ZREVRANGE` 排越前。分母 = **赛季长度** `SEASON_LEN_S`（09·K1，⛔ 不是绝对 epoch：
 * 早期写法分母 ~2.6e9 会把 frac 压在 0.0999~0.1，tie-break 分辨率归零）。
 *
 * 03 公式里的 SEASON_BASE 指「**本赛季**起点」。赛季轮换后（seasonRotation）当季起点 =
 * 全局 `SEASON_BASE + n × SEASON_LEN_S`，故这里先推导 tsSec 所属赛季窗口再算 elapsed——
 * 每个窗口内与 03 公式逐字一致（clamp 到 [0, len]），跨季后 frac 不塌成 0。
 *
 * ⚠ 精度实测（double 52 位尾数，30 天赛季）：frac 每秒增量 = 1/(10×SEASON_LEN_S) ≈ 3.86e-8。
 *   秒级 tie-break 可分辨的 intScore 安全上界 ≈ **2^28 ≈ 2.7e8**；03 声称的「~1e12 内保秒级」
 *   达不到（1e12 处 ULP ≈ 1.22e-4，分辨粒度退化到 ~53 分钟）。1e12 处 decode 还原整数分仍精确。
 *   边界数字见 test/rank-score.test.ts。
 *
 * ⚠ 写路径的 encode 在 rankUpsert Lua 内**重算**（时间取 `redis.call('TIME')` 秒，单一权威时钟，
 *   09·R7 精神）；本文件的 TS 实现是同一公式的参考实现，供单测与只读侧 decode 使用，
 *   两边算法必须逐行对齐（见 rankScripts.ts）。
 */
import { SEASON_BASE, SEASON_LEN_S } from "../infra/config";

/** tsSec 所属赛季序号（0 起）。早于全局 SEASON_BASE 一律归 0。 */
export function seasonIndexAt(tsSec: number): number {
  return Math.max(0, Math.floor((tsSec - SEASON_BASE) / SEASON_LEN_S));
}

/** 赛季 id（key 内嵌用，形如 `s0` / `s7`）。轮换 = 写新 key，⛔ 不搬数据（03）。 */
export const seasonIdAt = (tsSec: number): string => `s${seasonIndexAt(tsSec)}`;

/** 第 n 季起点 epoch 秒（= 03 公式里的「本赛季 SEASON_BASE」）。 */
export const seasonStartSec = (index: number): number => SEASON_BASE + index * SEASON_LEN_S;

/**
 * 编码：intScore + 赛季内 tie-break 小数（frac ∈ [0, 0.1]，用满 0~0.1）。
 * elapsed clamp 到 [0, SEASON_LEN_S]：早于季首按 0（frac 最大），理论上不会晚于季尾
 * （窗口推导保证 elapsed < len），clamp 仅作防御。
 */
export function encodeScore(intScore: number, tsSec: number): number {
  const base = seasonStartSec(seasonIndexAt(tsSec));
  const elapsed = Math.min(Math.max(tsSec - base, 0), SEASON_LEN_S);
  const frac = (1 - elapsed / SEASON_LEN_S) / 10;
  return intScore + frac;
}

/** 解码：去掉 tie-break 小数还原整数分。 */
export const decodeScore = (score: number): number => Math.floor(score);
