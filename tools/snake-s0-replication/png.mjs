/**
 * 最小 PNG 编解码（RGBA8、非隔行）。
 * 编码侧的 IDAT 用仓内确定性 deflate（./deflate.mjs）：⛔ 不用 `zlib.deflateSync`——其字节随 Node 自带
 * zlib 版本变化，会让「逐字节新鲜度」门禁在换 Node 后对像素完全相同的 PNG 假红。解码侧仍用 zlib
 * inflate（解码结果由格式定义，与实现无关）。
 */
import zlib from "node:zlib";
import { deflateDeterministic } from "./deflate.mjs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return result;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Not a PNG file");
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let palette = null;
  let transparency = null;
  const compressed = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([Buffer.from(type), data])) !== expectedCrc) throw new Error(`PNG CRC mismatch in ${type}`);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") transparency = Buffer.from(data);
    else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0) {
    throw new Error(`Unsupported PNG: ${width}x${height}, depth=${bitDepth}, interlace=${interlace}`);
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported PNG color type ${colorType}`);
  if (colorType === 3 && !palette) throw new Error("Indexed PNG has no palette");
  const inflated = zlib.inflateSync(Buffer.concat(compressed));
  const rowBytes = width * channels;
  const raw = Buffer.alloc(rowBytes * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset++];
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = inflated[inputOffset++];
      const left = x >= channels ? raw[rowOffset + x - channels] : 0;
      const above = y > 0 ? raw[rowOffset + x - rowBytes] : 0;
      const upperLeft = y > 0 && x >= channels ? raw[rowOffset + x - rowBytes - channels] : 0;
      let value;
      if (filter === 0) value = encoded;
      else if (filter === 1) value = encoded + left;
      else if (filter === 2) value = encoded + above;
      else if (filter === 3) value = encoded + Math.floor((left + above) / 2);
      else if (filter === 4) value = encoded + paeth(left, above, upperLeft);
      else throw new Error(`Unsupported PNG filter ${filter}`);
      raw[rowOffset + x] = value & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    if (colorType === 6) rgba.set(raw.subarray(source, source + 4), target);
    else if (colorType === 2) {
      rgba[target] = raw[source]; rgba[target + 1] = raw[source + 1]; rgba[target + 2] = raw[source + 2]; rgba[target + 3] = 255;
    } else if (colorType === 3) {
      const index = raw[source];
      rgba[target] = palette[index * 3]; rgba[target + 1] = palette[index * 3 + 1]; rgba[target + 2] = palette[index * 3 + 2];
      rgba[target + 3] = transparency?.[index] ?? 255;
    } else if (colorType === 0) {
      rgba[target] = raw[source]; rgba[target + 1] = raw[source]; rgba[target + 2] = raw[source]; rgba[target + 3] = 255;
    } else {
      rgba[target] = raw[source]; rgba[target + 1] = raw[source]; rgba[target + 2] = raw[source]; rgba[target + 3] = raw[source + 1];
    }
  }
  return { width, height, data: rgba };
}

export function encodePng(image) {
  const { width, height, data } = image;
  if (!(data instanceof Uint8Array) || data.length !== width * height * 4) throw new Error("Invalid RGBA image");
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateDeterministic(raw)),
    chunk("IEND"),
  ]);
}

export function image(width, height, color = [0, 0, 0, 0]) {
  const result = { width, height, data: new Uint8Array(width * height * 4) };
  fill(result, color);
  return result;
}

export function fill(target, color) {
  for (let index = 0; index < target.data.length; index += 4) target.data.set(color, index);
}

export function crop(source, rect) {
  const [left, top, width, height] = rect.map(Math.round);
  const result = image(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = ((top + y) * source.width + left + x) * 4;
      result.data.set(source.data.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4);
    }
  }
  return result;
}

export function blendPixel(target, x, y, color) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const offset = (y * target.width + x) * 4;
  const alpha = (color[3] ?? 255) / 255;
  const inverse = 1 - alpha;
  target.data[offset] = Math.round(color[0] * alpha + target.data[offset] * inverse);
  target.data[offset + 1] = Math.round(color[1] * alpha + target.data[offset + 1] * inverse);
  target.data[offset + 2] = Math.round(color[2] * alpha + target.data[offset + 2] * inverse);
  target.data[offset + 3] = Math.round(255 * alpha + target.data[offset + 3] * inverse);
}

export function fillRect(target, x, y, width, height, color) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(target.width, Math.ceil(x + width));
  const bottom = Math.min(target.height, Math.ceil(y + height));
  for (let py = top; py < bottom; py += 1) for (let px = left; px < right; px += 1) blendPixel(target, px, py, color);
}

export function circle(target, centerX, centerY, radius, color, { outline = false, lineWidth = 1 } = {}) {
  const left = Math.floor(centerX - radius - lineWidth);
  const right = Math.ceil(centerX + radius + lineWidth);
  const top = Math.floor(centerY - radius - lineWidth);
  const bottom = Math.ceil(centerY + radius + lineWidth);
  const outer2 = radius * radius;
  const inner2 = Math.max(0, radius - lineWidth) ** 2;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const distance2 = (x - centerX) ** 2 + (y - centerY) ** 2;
      if (distance2 <= outer2 && (!outline || distance2 >= inner2)) blendPixel(target, x, y, color);
    }
  }
}

export function line(target, x0, y0, x1, y1, color, lineWidth = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    circle(target, x0 + dx * ratio, y0 + dy * ratio, lineWidth / 2, color);
  }
}

export function rectOutline(target, x, y, width, height, color, lineWidth = 1) {
  line(target, x, y, x + width, y, color, lineWidth);
  line(target, x + width, y, x + width, y + height, color, lineWidth);
  line(target, x + width, y + height, x, y + height, color, lineWidth);
  line(target, x, y + height, x, y, color, lineWidth);
}

export function drawSprite(target, sprite, centerX, centerY, width, height, rotation = 0) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const halfWidth = Math.abs(width * cos) / 2 + Math.abs(height * sin) / 2;
  const halfHeight = Math.abs(width * sin) / 2 + Math.abs(height * cos) / 2;
  for (let y = Math.floor(centerY - halfHeight); y <= Math.ceil(centerY + halfHeight); y += 1) {
    for (let x = Math.floor(centerX - halfWidth); x <= Math.ceil(centerX + halfWidth); x += 1) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      const localX = cos * dx + sin * dy;
      const localY = -sin * dx + cos * dy;
      const sourceX = Math.floor((localX / width + 0.5) * sprite.width);
      const sourceY = Math.floor((localY / height + 0.5) * sprite.height);
      if (sourceX < 0 || sourceY < 0 || sourceX >= sprite.width || sourceY >= sprite.height) continue;
      const offset = (sourceY * sprite.width + sourceX) * 4;
      blendPixel(target, x, y, sprite.data.subarray(offset, offset + 4));
    }
  }
}

const FONT = {
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
  "-": ["00000","00000","00000","11111","00000","00000","00000"],
  "+": ["00000","00100","00100","11111","00100","00100","00000"],
  ":": ["00000","00100","00100","00000","00100","00100","00000"],
  "/": ["00001","00010","00100","00100","01000","10000","00000"],
  "(":["00010","00100","01000","01000","01000","00100","00010"],
  ")":["01000","00100","00010","00010","00010","00100","01000"],
  "0":["01110","10001","10011","10101","11001","10001","01110"],
  "1":["00100","01100","00100","00100","00100","00100","01110"],
  "2":["01110","10001","00001","00010","00100","01000","11111"],
  "3":["11110","00001","00001","01110","00001","00001","11110"],
  "4":["00010","00110","01010","10010","11111","00010","00010"],
  "5":["11111","10000","10000","11110","00001","00001","11110"],
  "6":["01110","10000","10000","11110","10001","10001","01110"],
  "7":["11111","00001","00010","00100","01000","01000","01000"],
  "8":["01110","10001","10001","01110","10001","10001","01110"],
  "9":["01110","10001","10001","01111","00001","00001","01110"],
  A:["01110","10001","10001","11111","10001","10001","10001"], B:["11110","10001","10001","11110","10001","10001","11110"],
  C:["01111","10000","10000","10000","10000","10000","01111"], D:["11110","10001","10001","10001","10001","10001","11110"],
  E:["11111","10000","10000","11110","10000","10000","11111"], F:["11111","10000","10000","11110","10000","10000","10000"],
  G:["01111","10000","10000","10111","10001","10001","01111"], H:["10001","10001","10001","11111","10001","10001","10001"],
  I:["01110","00100","00100","00100","00100","00100","01110"], J:["00001","00001","00001","00001","10001","10001","01110"],
  K:["10001","10010","10100","11000","10100","10010","10001"], L:["10000","10000","10000","10000","10000","10000","11111"],
  M:["10001","11011","10101","10101","10001","10001","10001"], N:["10001","11001","10101","10011","10001","10001","10001"],
  O:["01110","10001","10001","10001","10001","10001","01110"], P:["11110","10001","10001","11110","10000","10000","10000"],
  Q:["01110","10001","10001","10001","10101","10010","01101"], R:["11110","10001","10001","11110","10100","10010","10001"],
  S:["01111","10000","10000","01110","00001","00001","11110"], T:["11111","00100","00100","00100","00100","00100","00100"],
  U:["10001","10001","10001","10001","10001","10001","01110"], V:["10001","10001","10001","10001","10001","01010","00100"],
  W:["10001","10001","10001","10101","10101","10101","01010"], X:["10001","10001","01010","00100","01010","10001","10001"],
  Y:["10001","10001","01010","00100","00100","00100","00100"], Z:["11111","00001","00010","00100","01000","10000","11111"],
};

export function text(target, value, x, y, color, scale = 2) {
  let cursor = x;
  for (const character of value.toUpperCase()) {
    const glyph = FONT[character] ?? FONT[" "];
    for (let row = 0; row < 7; row += 1) for (let column = 0; column < 5; column += 1) {
      if (glyph[row][column] === "1") fillRect(target, cursor + column * scale, y + row * scale, scale, scale, color);
    }
    cursor += 6 * scale;
  }
}
