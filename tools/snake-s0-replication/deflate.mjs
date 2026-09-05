/**
 * 确定性 zlib/deflate 编码器（RFC 1950/1951，固定 Huffman 块 + LZ77）。
 *
 * 为什么不用 `zlib.deflateSync`：它的输出字节取决于 Node 自带 zlib 的实现版本——同一份像素在
 * Node 22 与 Node 26 上得到不同的 IDAT 字节流，S1 evidence 的「逐字节新鲜度」门禁因此在换 Node 后
 * 全部假红（2026-09-05，34 张像素完全相同的 PNG 全部 different）。本模块只依赖 ES 标准库，
 * 输出由算法定义：同一输入在任何 Node 版本上字节相同。
 *
 * 取舍：只用固定 Huffman 码（BTYPE=01），不做动态 Huffman，压缩率略逊于 zlib level 9，但对
 * 大面积透明/纯色的精灵图差距很小；解码走任何标准 inflate（含 `zlib.inflateSync`）。
 * ⛔ 改动本文件的匹配策略（链长、lazy 规则、窗口）都会改变输出字节，等于改了所有被钉证据的
 *   PNG——必须同时 `--write` 重钉并在提交信息里说明。
 */

const WINDOW_SIZE = 32768;
const WINDOW_MASK = WINDOW_SIZE - 1;
const HASH_BITS = 15;
const HASH_SIZE = 1 << HASH_BITS;
const HASH_MASK = HASH_SIZE - 1;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
const MAX_CHAIN = 128;
const NICE_LENGTH = 128;

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

/** 长度 3..258 → 长度码下标（0..28）；查表避免每个匹配都线性扫描。 */
const LENGTH_CODE_OF = (() => {
  const table = new Uint8Array(MAX_MATCH + 1);
  for (let code = 0; code < LENGTH_BASE.length; code += 1) {
    const upper = code + 1 < LENGTH_BASE.length ? LENGTH_BASE[code + 1] : MAX_MATCH + 1;
    for (let length = LENGTH_BASE[code]; length < upper; length += 1) table[length] = code;
  }
  table[MAX_MATCH] = 28;
  return table;
})();

function distanceCode(distance) {
  // 30 个距离码；二分不值得，线性 30 次比较对每个匹配开销可忽略。
  let code = 0;
  while (code + 1 < DIST_BASE.length && DIST_BASE[code + 1] <= distance) code += 1;
  return code;
}

function reverseBits(value, length) {
  let result = 0;
  for (let index = 0; index < length; index += 1) {
    result = (result << 1) | (value & 1);
    value >>>= 1;
  }
  return result;
}

class BitWriter {
  constructor(initialCapacity) {
    this.buffer = Buffer.alloc(Math.max(64, initialCapacity));
    this.position = 0;
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  ensure(bytes) {
    if (this.position + bytes <= this.buffer.length) return;
    const grown = Buffer.alloc(Math.max(this.buffer.length * 2, this.position + bytes));
    this.buffer.copy(grown, 0, 0, this.position);
    this.buffer = grown;
  }

  /** 按 deflate 规则 LSB-first 写 `count`（≤16）个比特。 */
  writeBits(value, count) {
    this.bitBuffer |= value << this.bitCount;
    this.bitCount += count;
    while (this.bitCount >= 8) {
      this.ensure(1);
      this.buffer[this.position++] = this.bitBuffer & 0xff;
      this.bitBuffer >>>= 8;
      this.bitCount -= 8;
    }
  }

  /** Huffman 码按 MSB-first 打包：先位反转再当普通比特写。 */
  writeCode(code, length) {
    this.writeBits(reverseBits(code, length), length);
  }

  finish() {
    if (this.bitCount > 0) {
      this.ensure(1);
      this.buffer[this.position++] = this.bitBuffer & 0xff;
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
    return this.buffer.subarray(0, this.position);
  }
}

/** 固定 Huffman 的 literal/length 码（RFC 1951 §3.2.6）。 */
function writeLiteralOrLength(writer, symbol) {
  if (symbol <= 143) writer.writeCode(0x30 + symbol, 8);
  else if (symbol <= 255) writer.writeCode(0x190 + (symbol - 144), 9);
  else if (symbol <= 279) writer.writeCode(symbol - 256, 7);
  else writer.writeCode(0xc0 + (symbol - 280), 8);
}

function writeMatch(writer, length, distance) {
  const lengthCode = LENGTH_CODE_OF[length];
  writeLiteralOrLength(writer, 257 + lengthCode);
  if (LENGTH_EXTRA[lengthCode] > 0) writer.writeBits(length - LENGTH_BASE[lengthCode], LENGTH_EXTRA[lengthCode]);
  const code = distanceCode(distance);
  writer.writeCode(code, 5);
  if (DIST_EXTRA[code] > 0) writer.writeBits(distance - DIST_BASE[code], DIST_EXTRA[code]);
}

function hashAt(input, index) {
  return ((input[index] << 10) ^ (input[index + 1] << 5) ^ input[index + 2]) & HASH_MASK;
}

/**
 * 原始 deflate 流（不带 zlib 头尾）。单个 BFINAL=1 的固定 Huffman 块；LZ77 用哈希链 + 单步 lazy
 * 匹配，所有参数为常量，⛔ 无随机、无时间、无环境依赖。
 */
export function deflateRawDeterministic(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError("deflateRawDeterministic expects a Uint8Array");
  const length = input.length;
  const writer = new BitWriter(Math.ceil(length / 2) + 16);
  writer.writeBits(1, 1); // BFINAL
  writer.writeBits(1, 2); // BTYPE=01 固定 Huffman

  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(WINDOW_SIZE).fill(-1);

  const insert = (index) => {
    if (index + MIN_MATCH > length) return;
    const hash = hashAt(input, index);
    prev[index & WINDOW_MASK] = head[hash];
    head[hash] = index;
  };

  const longestMatch = (index) => {
    if (index + MIN_MATCH > length) return { length: 0, distance: 0 };
    const limit = Math.min(MAX_MATCH, length - index);
    let bestLength = MIN_MATCH - 1;
    let bestDistance = 0;
    let candidate = head[hashAt(input, index)];
    let chain = MAX_CHAIN;
    const minimumIndex = index - WINDOW_SIZE;
    while (candidate >= 0 && candidate > minimumIndex && chain-- > 0) {
      if (input[candidate + bestLength] === input[index + bestLength] && input[candidate] === input[index]) {
        let matched = 0;
        while (matched < limit && input[candidate + matched] === input[index + matched]) matched += 1;
        if (matched > bestLength) {
          bestLength = matched;
          bestDistance = index - candidate;
          if (matched >= NICE_LENGTH) break;
        }
      }
      const next = prev[candidate & WINDOW_MASK];
      if (next >= candidate) break; // 环链保护（窗口回绕后残留的旧槽位）
      candidate = next;
    }
    return bestLength >= MIN_MATCH ? { length: bestLength, distance: bestDistance } : { length: 0, distance: 0 };
  };

  let index = 0;
  let pending = longestMatch(0);
  while (index < length) {
    let match = pending;
    if (match.length >= MIN_MATCH) {
      // 单步 lazy：下一位置若有更长匹配，则当前只发一个字面量。
      insert(index);
      const nextMatch = longestMatch(index + 1);
      if (nextMatch.length > match.length) {
        writeLiteralOrLength(writer, input[index]);
        index += 1;
        pending = nextMatch;
        continue;
      }
      writeMatch(writer, match.length, match.distance);
      for (let offset = 1; offset < match.length; offset += 1) insert(index + offset);
      index += match.length;
    } else {
      writeLiteralOrLength(writer, input[index]);
      insert(index);
      index += 1;
    }
    pending = index < length ? longestMatch(index) : { length: 0, distance: 0 };
  }
  writeLiteralOrLength(writer, 256); // end of block
  return writer.finish();
}

export function adler32(input) {
  let a = 1;
  let b = 0;
  for (let index = 0; index < input.length; index += 1) {
    a += input[index];
    if (a >= 65521) a -= 65521;
    b += a;
    if (b >= 65521) b -= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib 封装（RFC 1950）：CMF=0x78、FLG=0x01（无字典，校验位使 (CMF·256+FLG) % 31 == 0）+ Adler-32。 */
export function deflateDeterministic(input) {
  const body = deflateRawDeterministic(input);
  const result = Buffer.alloc(2 + body.length + 4);
  result[0] = 0x78;
  result[1] = 0x01;
  body.copy(result, 2);
  result.writeUInt32BE(adler32(input), 2 + body.length);
  return result;
}
