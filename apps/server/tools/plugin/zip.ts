/**
 * 最小 zip 读写（⛔ 零依赖：新增 npm 依赖属显式框架侵入，Non-intrusive §12.3）。
 *
 * 只支持插件包需要的子集：方法 0（store）与 8（deflate）、无 zip64、无加密、无多卷。
 * 写出是**确定性**的（固定 DOS 时间、按路径排序、固定标志位）——同一输入字节级同一输出，
 * 与仓内生成器的稳定排序口径一致。读取按 fail-closed：任何越界（zip-slip）、绝对路径、反斜杠、
 * 符号链接条目、重名/大小写重名、坏 CRC、尺寸不符、zip64 标记一律拒绝，⛔ 不做「尽量解」。
 */
import zlib from "node:zlib";

export interface ZipEntry {
  readonly path: string;
  readonly data: Buffer;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_EOCD_LOCATOR_SIG = 0x07064b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const FLAG_UTF8 = 0x0800;
/** 1980-01-01 00:00:00 的 DOS 时间/日期（确定性时间戳）。 */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;
/** 单文件与整包上限（zip 炸弹护栏；插件包本就是源码 + 少量资源）。 */
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
export const MAX_ENTRIES = 20_000;

function crc32(data: Buffer): number {
  return zlib.crc32(data) >>> 0;
}

function assertEntryPath(raw: string, seen: Set<string>): void {
  if (raw.length === 0) throw new Error("[plugin-zip] 条目路径为空");
  if (raw.includes("\\")) throw new Error(`[plugin-zip] 条目路径含反斜杠：${raw}`);
  if (raw.startsWith("/") || /^[A-Za-z]:/u.test(raw)) throw new Error(`[plugin-zip] 条目路径不是相对路径：${raw}`);
  for (const segment of raw.split("/")) {
    if (segment === "" || segment === "." || segment === "..") throw new Error(`[plugin-zip] 条目路径含非法段：${raw}`);
  }
  const folded = raw.toLowerCase();
  if (seen.has(folded)) throw new Error(`[plugin-zip] 条目重名（含大小写归一化）：${raw}`);
  seen.add(folded);
}

/** 确定性写出：按路径排序，deflate（小文件也 deflate，保持单一形态），固定时间戳。 */
export function writeZip(entries: readonly ZipEntry[]): Buffer {
  const seen = new Set<string>();
  const sorted = [...entries].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  for (const entry of sorted) assertEntryPath(entry.path, seen);
  if (sorted.length > MAX_ENTRIES) throw new Error(`[plugin-zip] 条目数超过上限 ${MAX_ENTRIES}`);

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of sorted) {
    if (entry.data.length > MAX_ENTRY_BYTES) throw new Error(`[plugin-zip] 条目超过单文件上限：${entry.path}`);
    const name = Buffer.from(entry.path, "utf8");
    const compressed = zlib.deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(METHOD_DEFLATE, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(METHOD_DEFLATE, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, compressed);
    centrals.push(central);
    offset += local.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

function findEocd(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 22 - 0xffff);
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) === EOCD_SIG) return index;
  }
  throw new Error("[plugin-zip] 不是 zip（找不到 end-of-central-directory）");
}

/** 读取全部文件条目（目录条目跳过）；每条都过路径闸、方法闸、尺寸闸与 CRC 校验。 */
export function readZip(buffer: Buffer): readonly ZipEntry[] {
  if (buffer.length < 22) throw new Error("[plugin-zip] 文件过短");
  const eocd = findEocd(buffer);
  if (eocd >= 20 && buffer.readUInt32LE(eocd - 20) === ZIP64_EOCD_LOCATOR_SIG) {
    throw new Error("[plugin-zip] 不支持 zip64");
  }
  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  if (diskNumber !== 0 || centralDisk !== 0) throw new Error("[plugin-zip] 不支持多卷");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("[plugin-zip] 不支持 zip64");
  }
  if (centralOffset + centralSize > eocd) throw new Error("[plugin-zip] central directory 越界");
  if (entryCount > MAX_ENTRIES) throw new Error(`[plugin-zip] 条目数超过上限 ${MAX_ENTRIES}`);

  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || buffer.readUInt32LE(cursor) !== CENTRAL_SIG) throw new Error("[plugin-zip] central directory 损坏");
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    cursor += 46 + nameLength + extraLength + commentLength;

    if ((flags & 0x0001) !== 0) throw new Error(`[plugin-zip] 不支持加密条目：${name}`);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error("[plugin-zip] 不支持 zip64");
    const unixMode = (externalAttributes >>> 16) & 0xf000;
    if (unixMode === 0xa000) throw new Error(`[plugin-zip] 拒绝符号链接条目：${name}`);
    if (name.endsWith("/")) {
      if (uncompressedSize !== 0) throw new Error(`[plugin-zip] 目录条目携带数据：${name}`);
      continue;
    }
    assertEntryPath(name, seen);
    if (method !== METHOD_STORE && method !== METHOD_DEFLATE) throw new Error(`[plugin-zip] 不支持的压缩方法 ${method}：${name}`);
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`[plugin-zip] 条目超过单文件上限：${name}`);
    total += uncompressedSize;
    if (total > MAX_TOTAL_BYTES) throw new Error("[plugin-zip] 包解压总量超过上限");

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error(`[plugin-zip] local header 损坏：${name}`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error(`[plugin-zip] 条目数据越界：${name}`);
    const raw = buffer.subarray(dataStart, dataEnd);
    const data = method === METHOD_STORE
      ? Buffer.from(raw)
      : zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
    if (data.length !== uncompressedSize) throw new Error(`[plugin-zip] 尺寸不符：${name}`);
    if (crc32(data) !== crc) throw new Error(`[plugin-zip] CRC 不符：${name}`);
    entries.push({ path: name, data });
  }
  return entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}
