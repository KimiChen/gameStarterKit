/** 地图包与编译进客户端的配置必须同版，验证通过前不请求任何图层。 */
import { MAPO_S1_MANIFEST } from "../../../shared/kits/mapOriginal/content/manifest.data";
import type { MapoManifest, MapoAssetRecord } from "../../../shared/kits/mapOriginal/content/map-manifest.types";

export const MAPO_BUNDLE = MAPO_S1_MANIFEST.bundle;
export const MAPO_MANIFEST_ASSET = "2d/manifest";
export { MAPO_S1_MANIFEST };

export class MapoVersionError extends Error {
    readonly code = "MAPO_VERSION_MISMATCH";
    constructor(readonly path: string) {
        super(`[mapOriginal] MAPO_VERSION_MISMATCH ${MAPO_BUNDLE}:${path}`);
        this.name = "MapoVersionError";
    }
}

/** 顺序无关、键集合严格；不用 JSON.stringify 比较对象的插入顺序。 */
function same(actual: unknown, expected: unknown, path: string): void {
    if (actual === expected) return;
    if (actual === null || expected === null || typeof actual !== "object" || typeof expected !== "object"
        || Array.isArray(actual) !== Array.isArray(expected)) throw new MapoVersionError(path);
    const a = actual as Record<string, unknown>, e = expected as Record<string, unknown>;
    if (Object.keys(a).length !== Object.keys(e).length) throw new MapoVersionError(path);
    for (const key of Object.keys(e)) {
        if (!Object.prototype.hasOwnProperty.call(a, key)) throw new MapoVersionError(`${path}.${key}`);
        same(a[key], e[key], `${path}.${key}`);
    }
}

export function mapoValidateManifest(value: unknown, expected: MapoManifest = MAPO_S1_MANIFEST): void {
    same(value, expected, MAPO_MANIFEST_ASSET);
}

export function mapoAssetRecord(logical: string): MapoAssetRecord {
    const record = MAPO_S1_MANIFEST.assets[logical];
    if (!record) throw new MapoVersionError(`unknown asset ${logical}`);
    return record;
}
export function mapoAssetPath(logical: string): string { return mapoAssetRecord(logical).path; }

// CRC32 仅作二进制混版/损坏检测；发布身份是完整 SHA-256，不将 CRC 当安全校验。
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let n = i;
    for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
    crcTable[i] = n >>> 0;
}
export function mapoValidateBuffer(logical: string, bytes: ArrayBuffer | Uint8Array): void {
    const record = mapoAssetRecord(logical), view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (record.type !== "buffer" || view.byteLength !== record.sourceBytes) throw new MapoVersionError(record.path);
    let crc = 0xffffffff;
    for (let i = 0; i < view.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ view[i]!) & 255]!;
    if (((crc ^ 0xffffffff) >>> 0) !== record.crc32) throw new MapoVersionError(record.path);
}

/** 图像使用内容寻址路径及 Creator 构建版本；尺寸验证也适用于 PNG / ASTC / ETC。 */
export function mapoValidateTexture(logical: string, width: number, height: number): void {
    const record = mapoAssetRecord(logical);
    if (record.type !== "texture" || record.size?.[0] !== width || record.size[1] !== height) throw new MapoVersionError(record.path);
}
