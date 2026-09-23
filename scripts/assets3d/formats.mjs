/** Source formats only. No Creator Library, GPU estimates or runtime importers. */
import { inflateSync } from 'node:zlib';

export function requireAsset(condition, label, message) {
  if (!condition) throw new Error(`[assets3d] ${label}: ${message}`);
}
export function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`[assets3d] ${label}: invalid JSON`); }
}
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = value => Number.isSafeInteger(value) && value >= 0;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export function inspectPng(bytes, label) {
  const check = (condition, message) => requireAsset(condition, label, message);
  check(bytes.subarray(0, 8).equals(PNG), 'expected actual PNG bytes');
  let offset = 8, width, height, channels, interlace, ended = false, srgb = false, gamma;
  let imageEnded = false;
  const idat = [];
  while (offset < bytes.length) {
    check(offset + 12 <= bytes.length && !ended, 'truncated PNG or trailing bytes');
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    check(end <= bytes.length, 'PNG chunk outside file');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    check(crc32(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4), `PNG ${type} CRC mismatch`);
    const data = bytes.subarray(offset + 8, end - 4);
    if (offset === 8) check(type === 'IHDR', 'PNG first chunk must be IHDR');
    if (type === 'IHDR') {
      check(width === undefined && length === 13, 'invalid PNG IHDR');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      check(width > 0 && height > 0 && width <= 2048 && height <= 2048, 'PNG dimensions exceed 2048 or are zero');
      check(data[8] === 8 && [2, 6].includes(data[9]), 'PNG requires 8-bit RGB/RGBA');
      check(data[10] === 0 && data[11] === 0 && [0, 1].includes(data[12]), 'unsupported PNG coding');
      channels = data[9] === 2 ? 3 : 4; interlace = data[12];
    } else if (type === 'IDAT') {
      check(!imageEnded, 'PNG IDAT chunks must be consecutive'); idat.push(data);
    } else {
      if (idat.length) imageEnded = true;
      if (type === 'IEND') { check(length === 0 && idat.length > 0, 'invalid PNG IEND'); ended = true; }
      else if (type === 'sRGB') { check(length === 1 && data[0] <= 3, 'invalid PNG sRGB'); srgb = true; }
      else if (type === 'gAMA') { check(length === 4, 'invalid PNG gAMA'); gamma = data.readUInt32BE(0); }
      else check(type === 'PLTE' || type[0] === type[0].toLowerCase(), `unknown PNG critical chunk ${type}`);
    }
    offset = end;
  }
  check(ended, 'PNG missing IEND');
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows = passes.map(([x, y, dx, dy]) => [Math.max(0, Math.ceil((width - x) / dx)), Math.max(0, Math.ceil((height - y) / dy))]);
  const expected = rows.reduce((sum, [w, h]) => sum + (w ? h * (1 + w * channels) : 0), 0);
  let pixels;
  try { pixels = inflateSync(Buffer.concat(idat), { maxOutputLength: expected }); }
  catch { check(false, 'invalid PNG compressed pixels'); }
  check(pixels.length === expected, 'PNG pixel length mismatch');
  offset = 0;
  for (const [w, h] of rows) if (w) for (let row = 0; row < h; row++) {
    check(pixels[offset] <= 4, 'invalid PNG filter'); offset += 1 + w * channels;
  }
  return { width, height, srgb, gamma };
}

export function inspectHdr(bytes, label) {
  const check = (condition, message) => requireAsset(condition, label, message);
  const header = /^(?:#\?RADIANCE|#\?RGBE)\r?\n[\s\S]*?\r?\n\r?\n-Y (\d+) \+X (\d+)\r?\n/u.exec(bytes.subarray(0, 8192).toString('latin1'));
  check(header && /(?:^|\n)FORMAT=32-bit_rle_rgbe\r?\n/u.test(header[0]), 'expected Radiance RGBE HDR header');
  const height = Number(header[1]), width = Number(header[2]);
  check(width > 0 && height > 0 && width <= 2048 && height <= 2048, 'HDR dimensions exceed 2048 or are zero');
  let offset = header[0].length;
  for (let row = 0; row < height; row++) {
    check(offset + 4 <= bytes.length, 'truncated HDR scanline');
    if (width >= 8 && bytes[offset] === 2 && bytes[offset + 1] === 2 && !(bytes[offset + 2] & 128)) {
      check(bytes.readUInt16BE(offset + 2) === width, 'HDR scanline width mismatch'); offset += 4;
      for (let channel = 0; channel < 4; channel++) {
        let x = 0;
        while (x < width) {
          check(offset < bytes.length, 'truncated HDR RLE'); const count = bytes[offset++];
          check(count !== 0, 'invalid HDR RLE count');
          x += count > 128 ? count - 128 : count; offset += count > 128 ? 1 : count;
          check(x <= width && offset <= bytes.length, 'HDR RLE outside scanline');
        }
      }
    } else {
      // Old RGBE uses [1,1,1,count] repeat markers, with successive counts shifted by 8.
      let x = 0, shift = 0;
      while (x < width) {
        check(offset + 4 <= bytes.length, 'truncated HDR pixels');
        if (bytes[offset] === 1 && bytes[offset + 1] === 1 && bytes[offset + 2] === 1) {
          check(x > 0 && shift < 32, 'invalid old HDR RLE'); x += bytes[offset + 3] * 2 ** shift; shift += 8;
        } else { x++; shift = 0; }
        offset += 4; check(x <= width, 'HDR pixels outside scanline');
      }
    }
  }
  check(offset === bytes.length, 'HDR trailing bytes');
  return { width, height };
}

export function inspectGlb(bytes, label) {
  const check = (condition, message) => requireAsset(condition, label, message);
  check(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'glTF', 'expected GLB magic');
  check(bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, 'GLB version/declared length mismatch');
  const chunks = []; let offset = 12;
  while (offset < bytes.length) {
    check(offset % 4 === 0 && offset + 8 <= bytes.length, 'truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    check(length % 4 === 0 && offset + 8 + length <= bytes.length, 'GLB chunk length/boundary');
    chunks.push({ type, bytes: bytes.subarray(offset + 8, offset + 8 + length) }); offset += 8 + length;
  }
  check(chunks.length >= 1 && chunks.length <= 2 && chunks[0].type === 0x4e4f534a && (!chunks[1] || chunks[1].type === 0x004e4942), 'GLB must contain JSON then optional BIN');
  const gltf = parseJson(chunks[0].bytes, label);
  check(isObject(gltf) && gltf.asset?.version === '2.0', 'GLB requires glTF 2.0 JSON');
  for (const field of ['buffers', 'bufferViews', 'accessors', 'images', 'textures', 'materials', 'meshes', 'skins', 'nodes', 'scenes', 'animations']) {
    check(gltf[field] === undefined || Array.isArray(gltf[field]), `glTF ${field} must be an array`);
    for (const item of gltf[field] ?? []) check(isObject(item), `invalid glTF ${field} entry`);
  }
  const bin = chunks[1]?.bytes ?? Buffer.alloc(0), buffers = gltf.buffers ?? [];
  check(buffers.length <= 1 && buffers.every(buffer => !Object.hasOwn(buffer, 'uri')), 'GLB external buffers are forbidden');
  check(buffers.length === (bin.length ? 1 : 0), 'GLB buffer/BIN mismatch');
  if (buffers.length) check(uint(buffers[0].byteLength) && buffers[0].byteLength <= bin.length && bin.length - buffers[0].byteLength <= 3, 'GLB BIN byteLength mismatch');
  const views = gltf.bufferViews ?? [], accessors = gltf.accessors ?? [];
  for (const view of views) {
    check(view.buffer === 0 && uint(view.byteLength) && uint(view.byteOffset ?? 0) && (view.byteOffset ?? 0) + view.byteLength <= (buffers[0]?.byteLength ?? 0), 'GLB bufferView out of bounds');
    if (view.byteStride !== undefined) check(uint(view.byteStride) && view.byteStride >= 4 && view.byteStride <= 252 && view.byteStride % 4 === 0, 'GLB invalid byteStride');
  }
  const components = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const counts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  for (const a of accessors) {
    const size = components[a.componentType], count = counts[a.type];
    check(size && count && uint(a.count) && a.count > 0 && uint(a.byteOffset ?? 0), 'GLB invalid accessor');
    // Matrix columns are four-byte aligned, including MAT2/MAT3 with byte/short components.
    const columns = a.type.startsWith('MAT') ? Number(a.type.slice(3)) : 1;
    const packed = columns > 1 ? columns * Math.ceil(columns * size / 4) * 4 : size * count;
    if (a.bufferView !== undefined) {
      const view = uint(a.bufferView) && views[a.bufferView];
      check(view && (view.byteStride ?? packed) >= packed && (a.byteOffset ?? 0) + (a.count - 1) * (view.byteStride ?? packed) + packed <= view.byteLength, 'GLB accessor out of bounds');
    } else check(a.sparse, 'GLB accessor needs bufferView or sparse data');
    if (a.sparse) {
      const s = a.sparse;
      check(uint(s.count) && s.count > 0 && s.count <= a.count && [5121, 5123, 5125].includes(s.indices?.componentType), 'GLB invalid sparse accessor');
      for (const [ref, stride] of [[s.indices, components[s.indices.componentType]], [s.values, packed]]) {
        const view = ref && uint(ref.bufferView) && views[ref.bufferView];
        check(view && uint(ref.byteOffset ?? 0) && (ref.byteOffset ?? 0) + s.count * stride <= view.byteLength, 'GLB sparse accessor out of bounds');
      }
    }
  }
  for (const image of gltf.images ?? []) check(!Object.hasOwn(image, 'bufferView') && typeof image.uri === 'string' && image.uri.length > 0 && !/^data:/iu.test(image.uri), 'GLB embedded images are forbidden; external PNG required');
  const meshKinds = [], meshes = gltf.meshes ?? [];
  let triangles = 0, maxVertices = 0;
  for (const mesh of meshes) {
    check(Array.isArray(mesh.primitives) && mesh.primitives.length > 0, 'GLB mesh missing primitives');
    for (const primitive of mesh.primitives) {
      check(isObject(primitive.attributes) && (primitive.mode ?? 4) === 4, 'GLB requires triangles and attributes');
      const attr = primitive.attributes;
      for (const index of Object.values(attr)) check(uint(index) && accessors[index], 'GLB attribute accessor missing');
      const pos = accessors[attr.POSITION];
      check(pos?.type === 'VEC3' && pos.componentType === 5126 && attr.NORMAL !== undefined && attr.TANGENT !== undefined, 'GLB POSITION/NORMAL/TANGENT required');
      maxVertices = Math.max(maxVertices, pos.count);
      check(pos.count <= 65000, 'GLB mesh exceeds 65k vertices');
      const hasJoints = Object.hasOwn(attr, 'JOINTS_0'), hasWeights = Object.hasOwn(attr, 'WEIGHTS_0');
      check(hasJoints === hasWeights, 'GLB JOINTS/WEIGHTS must be paired');
      meshKinds.push(hasJoints);
      if (hasJoints) {
        check((gltf.skins?.length ?? 0) > 0 && accessors[attr.JOINTS_0].type === 'VEC4' && accessors[attr.WEIGHTS_0].type === 'VEC4', 'GLB skin/JOINTS/WEIGHTS mismatch');
      } else check(attr.TEXCOORD_1 !== undefined, 'GLB static mesh requires UV2');
      const indices = primitive.indices === undefined ? null : accessors[primitive.indices];
      if (primitive.indices !== undefined) check(uint(primitive.indices) && indices?.type === 'SCALAR' && [5121, 5123].includes(indices.componentType), 'GLB requires 16-bit or smaller indices');
      check((indices?.count ?? pos.count) % 3 === 0, 'GLB incomplete triangles');
      triangles += (indices?.count ?? pos.count) / 3;
      if (primitive.material !== undefined) check(uint(primitive.material) && gltf.materials?.[primitive.material], 'GLB missing material');
    }
  }
  for (const skin of gltf.skins ?? []) {
    check(Array.isArray(skin.joints) && skin.joints.length > 0 && skin.joints.every(index => uint(index) && gltf.nodes?.[index]), 'GLB invalid skin joints');
    if (skin.inverseBindMatrices !== undefined) check(accessors[skin.inverseBindMatrices]?.type === 'MAT4' && accessors[skin.inverseBindMatrices].count === skin.joints.length, 'GLB invalid inverse bind matrices');
  }
  for (const node of gltf.nodes ?? []) {
    if (node.mesh !== undefined) check(uint(node.mesh) && meshes[node.mesh], 'GLB missing mesh');
    if (node.skin !== undefined) check(uint(node.skin) && gltf.skins?.[node.skin] && meshes[node.mesh]?.primitives.every(p => p.attributes.JOINTS_0 !== undefined), 'GLB skinned node has no skin attributes');
  }
  const skinned = (gltf.skins?.length ?? 0) > 0 || meshKinds.includes(true);
  check(!skinned || meshKinds.includes(true), 'GLB skin without JOINTS/WEIGHTS');
  return { gltf, triangles, maxVertices, skinned, mixed: skinned && meshKinds.includes(false), binBytes: buffers[0]?.byteLength ?? 0 };
}
