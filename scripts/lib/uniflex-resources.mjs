export function createImageResourceEntry(resource, packageName) {
    return {
        id: resource.id,
        kind: "image",
        file: `ui/${packageName}/${resource.file}`,
        ...(resource.width === undefined ? {} : { width: resource.width }),
        ...(resource.height === undefined ? {} : { height: resource.height }),
        ...(resource.nineSlice === undefined ? {} : { nineSlice: resource.nineSlice }),
        sha256: resource.sha256,
    };
}

/** Creator defaults bare PNGs to Texture; the runtime loads /spriteFrame sub-assets. */
export function cocosSpriteFrameMeta(existing, uuid, nineSlice = [0, 0, 0, 0]) {
    const meta = existing ?? {
        ver: "1.0.27", importer: "image", imported: false,
        uuid, files: [], subMetas: {},
    };
    if (meta.importer !== "image" || typeof meta.uuid !== "string" || !meta.uuid)
        throw new Error("Invalid Cocos image metadata");
    const frame = meta.subMetas?.f9941 ?? {
        importer: "sprite-frame", uuid: `${meta.uuid}@f9941`,
        id: "f9941", name: "spriteFrame", ver: "1.0.12",
        imported: false, files: [], subMetas: {},
    };
    const [borderLeft, borderTop, borderRight, borderBottom] = nineSlice;
    return {
        ...meta,
        subMetas: {
            ...meta.subMetas,
            f9941: { ...frame, userData: {
                ...frame.userData, borderLeft, borderTop, borderRight, borderBottom,
            } },
        },
        userData: {
            ...meta.userData,
            type: "sprite-frame",
            // Creator keeps the image redirect on Texture even when it emits SpriteFrame.
            redirect: meta.userData?.redirect ?? `${meta.uuid}@6c48a`,
        },
    };
}
