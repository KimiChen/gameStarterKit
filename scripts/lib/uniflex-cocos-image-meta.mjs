import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";

const TEXTURE_ID = "6c48a";
const SPRITE_ID = "f9941";

/** PNG IHDR width/height. */
export function pngSize(bytes) {
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50)
        throw new Error("Not a PNG");
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        hasAlpha: bytes[25] === 4 || bytes[25] === 6,
    };
}

export async function existingImageUuid(metaPath) {
    try {
        const parsed = JSON.parse(await readFile(metaPath, "utf8"));
        if (typeof parsed.uuid === "string" && /^[0-9a-f-]{36}$/iu.test(parsed.uuid))
            return parsed.uuid;
    } catch {
        // missing or unreadable meta: mint a new uuid
    }
    return randomUUID();
}

export function createSpriteFrameImageMeta({
    uuid,
    displayName,
    width,
    height,
    nineSlice = [0, 0, 0, 0],
    hasAlpha = true,
}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
        throw new Error(`Invalid image size for ${displayName}: ${width}x${height}`);
    const [borderLeft, borderTop, borderRight, borderBottom] = nineSlice;
    const halfW = width / 2;
    const halfH = height / 2;
    return {
        ver: "1.0.27",
        importer: "image",
        imported: true,
        uuid,
        files: [".json", ".png"],
        subMetas: {
            [TEXTURE_ID]: {
                ver: "1.0.22",
                importer: "texture",
                uuid: `${uuid}@${TEXTURE_ID}`,
                imported: true,
                files: [".json"],
                subMetas: {},
                userData: {
                    wrapModeS: "clamp-to-edge",
                    wrapModeT: "clamp-to-edge",
                    minfilter: "linear",
                    magfilter: "linear",
                    mipfilter: "none",
                    premultiplyAlpha: false,
                    anisotropy: 0,
                    isUuid: true,
                    imageUuidOrDatabaseUri: uuid,
                    visible: false,
                },
                displayName,
                id: TEXTURE_ID,
                name: "texture",
            },
            [SPRITE_ID]: {
                ver: "1.0.12",
                importer: "sprite-frame",
                uuid: `${uuid}@${SPRITE_ID}`,
                imported: true,
                files: [".json"],
                subMetas: {},
                userData: {
                    wrapModeS: "clamp-to-edge",
                    wrapModeT: "clamp-to-edge",
                    minfilter: "linear",
                    magfilter: "linear",
                    premultiplyAlpha: false,
                    generateMipmap: false,
                    anisotropy: 1,
                    trimType: "custom",
                    trimThreshold: 1,
                    rotated: false,
                    offsetX: 0,
                    offsetY: 0,
                    trimX: 0,
                    trimY: 0,
                    width,
                    height,
                    rawWidth: width,
                    rawHeight: height,
                    borderTop,
                    borderBottom,
                    borderLeft,
                    borderRight,
                    isUuid: true,
                    imageUuidOrDatabaseUri: `${uuid}@${TEXTURE_ID}`,
                    atlasUuid: "",
                    mipfilter: "none",
                    packable: true,
                    vertices: {
                        rawPosition: [-halfW, -halfH, 0, halfW, -halfH, 0, -halfW, halfH, 0, halfW, halfH, 0],
                        indexes: [0, 1, 2, 2, 1, 3],
                        uv: [0, height, width, height, 0, 0, width, 0],
                        nuv: [0, 0, 1, 0, 0, 1, 1, 1],
                        minPos: [-halfW, -halfH, 0],
                        maxPos: [halfW, halfH, 0],
                    },
                    pixelsToUnit: 100,
                    pivotX: 0.5,
                    pivotY: 0.5,
                    meshType: 0,
                },
                displayName,
                id: SPRITE_ID,
                name: "spriteFrame",
            },
        },
        userData: {
            type: "sprite-frame",
            redirect: `${uuid}@${TEXTURE_ID}`,
            hasAlpha,
            fixAlphaTransparencyArtifacts: false,
        },
    };
}

export function assertSpriteFrameImageMeta(meta, { width, height, nineSlice = [0, 0, 0, 0] } = {}) {
    if (meta?.userData?.type !== "sprite-frame")
        throw new Error("Cocos UniFlex PNG meta must use type sprite-frame");
    const frame = meta.subMetas?.[SPRITE_ID];
    if (!frame || frame.name !== "spriteFrame")
        throw new Error("Cocos UniFlex PNG meta must expose spriteFrame sub-asset");
    const [borderLeft, borderTop, borderRight, borderBottom] = nineSlice;
    const data = frame.userData ?? {};
    if (width !== undefined && data.width !== width)
        throw new Error(`spriteFrame width ${data.width} != ${width}`);
    if (height !== undefined && data.height !== height)
        throw new Error(`spriteFrame height ${data.height} != ${height}`);
    if (data.borderLeft !== borderLeft || data.borderTop !== borderTop
        || data.borderRight !== borderRight || data.borderBottom !== borderBottom)
        throw new Error("spriteFrame nine-slice borders do not match catalog");
}

export function displayNameFromPng(pngPath) {
    return basename(pngPath).replace(/\.png$/u, "");
}
