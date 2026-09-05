/**
 * 确定性 deflate 的契约：任何标准 inflate 能解回原文、同输入字节相同、与 Node 版本无关的固定
 * 输出（用一小段输入钉住字节，换 zlib 版本也不许变）、zlib 头/Adler-32 正确。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { adler32, deflateDeterministic, deflateRawDeterministic } from "./deflate.mjs";
import { encodePng, image } from "./png.mjs";

function pseudoRandom(length, seed) {
  const out = Buffer.alloc(length);
  let state = seed >>> 0;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[index] = state >>> 24;
  }
  return out;
}

/**
 * 每条用例除往返外还钉住输出的 (字节数, sha256 前 16 位)：匹配策略（链长/lazy/窗口/nice）任一改动都会
 * 改变其中若干条——这就是「改编码器必须重钉证据」的机检形态（单条短输入的十六进制钉不住这些）。
 */
const CASES = [
  ["empty", Buffer.alloc(0), 8, "09d469dfeeaf4c43"],
  ["single byte", Buffer.from([0xff]), 9, "f1137a4fc67f98c1"],
  ["all zero 300k（长匹配、跨 258 上限）", Buffer.alloc(300_000), 1899, "991761bc015f716c"],
  ["short repeats", Buffer.from("abcabcabcabcabcabcabcabcabcabc"), 12, "f8fce53273cffeea"],
  ["text with lazy-match opportunities", Buffer.from("hello hello hello hell hello world hello hello ".repeat(400)), 181, "1d378a3b51ed334f"],
  ["random 200k（不可压缩，含 144..255 的 9 位码）", pseudoRandom(200_000, 7), 210832, "b8833d3bff0bbc91"],
  ["ramp 70k（窗口回绕后仍匹配）", Buffer.from(Array.from({ length: 70_000 }, (_, index) => index & 0xff)), 922, "33e4b19a32257cd0"],
  // 有效窗口 32767：距离 32767 的 512 字节块被整块匹配（输出小），距离 32768 的同一块有意不引用（退化为字面量，输出大）。
  ["copy at distance 32767（窗口内，整块匹配）", Buffer.concat([pseudoRandom(512, 1), Buffer.alloc(32767 - 512), pseudoRandom(512, 1)]), 764, "f77370dafca9d652"],
  ["copy at distance 32768（合法但有意不发，见 deflate.mjs 抬头）", Buffer.concat([pseudoRandom(512, 1), Buffer.alloc(32768 - 512), pseudoRandom(512, 1)]), 1300, "121c02241d81a93b"],
  ["copy beyond window（32769，不可引用）", Buffer.concat([pseudoRandom(512, 2), Buffer.alloc(32769 - 512).fill(1), pseudoRandom(512, 2)]), 1299, "74312f497347135b"],
];

test("deflate：zlib 与 raw 两种封装都能被标准 inflate 解回原文", () => {
  for (const [name, input] of CASES) {
    assert.ok(zlib.inflateSync(deflateDeterministic(input)).equals(input), name);
    assert.ok(zlib.inflateRawSync(deflateRawDeterministic(input)).equals(input), `${name} (raw)`);
  }
});

test("deflate：同输入字节相同，且字节由算法钉死（与 Node/zlib 版本无关）", () => {
  for (const [name, input, expectedLength, expectedDigest] of CASES) {
    const out = deflateDeterministic(input);
    assert.ok(out.equals(deflateDeterministic(input)), name);
    assert.equal(out.length, expectedLength, `${name}: 输出字节数变了——匹配策略被改动，必须重钉全部证据 PNG`);
    assert.equal(createHash("sha256").update(out).digest("hex").slice(0, 16), expectedDigest, `${name}: 输出 sha256 变了——匹配策略被改动，必须重钉全部证据 PNG`);
  }
  const far = CASES.find(([name]) => name.startsWith("copy at distance 32767"));
  const beyond = CASES.find(([name]) => name.startsWith("copy at distance 32768"));
  assert.ok(far[2] < beyond[2] / 1.5, "32767 必须被整块匹配，32768 必须退化为字面量（窗口边界的结构性断言）");
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

test("encodePng：拒绝 0 尺寸（PNG 规范要求 IHDR 宽高非零；本模块 decodePng 也解不了）", () => {
  assert.throws(() => encodePng(image(0, 0)), /Invalid PNG dimensions/u);
  assert.throws(() => encodePng({ width: 2, height: 0, data: new Uint8Array(0) }), /Invalid PNG dimensions/u);
  assert.equal(encodePng(image(1, 1)).length > 8, true);
});
