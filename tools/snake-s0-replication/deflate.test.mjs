/**
 * 确定性 deflate 的契约：任何标准 inflate 能解回原文、同输入字节相同、与 Node 版本无关的固定
 * 输出（用一小段输入钉住字节，换 zlib 版本也不许变）、zlib 头/Adler-32 正确。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import zlib from "node:zlib";
import { adler32, deflateDeterministic, deflateRawDeterministic } from "./deflate.mjs";

function pseudoRandom(length, seed) {
  const out = Buffer.alloc(length);
  let state = seed >>> 0;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[index] = state >>> 24;
  }
  return out;
}

const CASES = [
  ["empty", Buffer.alloc(0)],
  ["single byte", Buffer.from([0xff])],
  ["all zero 300k（长匹配、跨 258 上限）", Buffer.alloc(300_000)],
  ["short repeats", Buffer.from("abcabcabcabcabcabcabcabcabcabc")],
  ["text with lazy-match opportunities", Buffer.from("hello hello hello hell hello world hello hello ".repeat(400))],
  ["random 200k（不可压缩，含 144..255 的 9 位码）", pseudoRandom(200_000, 7)],
  ["ramp 70k（窗口回绕后仍匹配）", Buffer.from(Array.from({ length: 70_000 }, (_, index) => index & 0xff))],
  ["match at max distance 32768", Buffer.concat([pseudoRandom(512, 1), Buffer.alloc(32768 - 512), pseudoRandom(512, 1)])],
  ["match just beyond window must not be referenced", Buffer.concat([pseudoRandom(512, 2), Buffer.alloc(32769 - 512).fill(1), pseudoRandom(512, 2)])],
];

test("deflate：zlib 与 raw 两种封装都能被标准 inflate 解回原文", () => {
  for (const [name, input] of CASES) {
    assert.ok(zlib.inflateSync(deflateDeterministic(input)).equals(input), name);
    assert.ok(zlib.inflateRawSync(deflateRawDeterministic(input)).equals(input), `${name} (raw)`);
  }
});

test("deflate：同输入字节相同，且字节由算法钉死（与 Node/zlib 版本无关）", () => {
  for (const [name, input] of CASES) {
    assert.ok(deflateDeterministic(input).equals(deflateDeterministic(input)), name);
  }
  // 钉住一小段输入的完整输出：任何改动匹配策略/码表都会改变它，必须连同证据一起重钉。
  const pinned = deflateDeterministic(Buffer.from("snake snake snake!"));
  assert.equal(pinned.toString("hex"), "78012bce4bcc4e5540221501412c0698");
});

test("deflate：zlib 头合法、Adler-32 与 RFC 1950 参考值一致", () => {
  const out = deflateDeterministic(Buffer.from("Wikipedia"));
  assert.equal(out[0], 0x78);
  assert.equal(((out[0] << 8) | out[1]) % 31, 0, "FCHECK 必须使 CMF·256+FLG 被 31 整除");
  assert.equal(adler32(Buffer.from("Wikipedia")), 0x11e60398);
  assert.equal(out.readUInt32BE(out.length - 4), 0x11e60398);
  assert.throws(() => deflateRawDeterministic("not bytes"), /Uint8Array/u);
});
