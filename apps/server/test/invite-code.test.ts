/**
 * 邀请码纯函数守门（无 Redis/MySQL；Non-intrusive §6.6/§6.7 第 1 条）。
 *
 * 缺口来源：复核发现 GameRoom 层单测全部注入 codeFactory 假件、int 用例只走真 Redis 全链，
 * 「码必须恒为六位数字」这一生产属性没有任何纯单测钉住——删掉 padStart 的变异
 * 在 verify:all（含 434 服务端单测）下全绿存活。本文件即该变异的定向用例。
 *
 * 变异锚点：`newInviteCode` 去掉 `.padStart(6, "0")` ⇒ 「六位形状」用例必红
 * （采样 400 次，变异后单次逃逸概率 0.9，400 次全逃逸 ≈ 10^-18，实际确定性红）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { newInviteCode } from "../src/core/rooms/invite/InviteCodeReservation";

const SAMPLES = 400;

test("邀请码：恒为六位数字（000001 是合法码，padStart 不可删）", () => {
  let sawShort = false; // 观测用：未变异时也应覆盖到 <100000 的抽样（期望 ~40% 至少一次）
  for (let i = 0; i < SAMPLES; i++) {
    const code = newInviteCode();
    assert.equal(code.length, 6, `码长度必须为 6，得到 ${JSON.stringify(code)}`);
    assert.match(code, /^\d{6}$/, `码必须纯数字，得到 ${JSON.stringify(code)}`);
    const n = Number(code);
    assert.ok(n >= 0 && n < 1_000_000, `码数值越界: ${code}`);
    if (n < 100_000) sawShort = true;
  }
  //  sanity：采样确实覆盖到了需要补零的区间，否则上面的断言对 padStart 变异无判别力。
  assert.ok(sawShort, `${SAMPLES} 次采样未覆盖 <100000 区间（概率 ~10^-18），采样逻辑失效`);
});
