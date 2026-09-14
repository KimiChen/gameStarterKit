export function createImageResourceEntry(resource, packageName) {
    const file = resource.file ?? resource.path;
    return {
        id: resource.id,
        kind: "image",
        file: `imported/${packageName}/${file}`,
        ...(resource.width === undefined ? {} : { width: resource.width }),
        ...(resource.height === undefined ? {} : { height: resource.height }),
        ...(resource.nineSlice === undefined ? {} : { nineSlice: resource.nineSlice }),
        sha256: resource.sha256,
    };
}

export function normalizeImportedImageResource(resource) {
    return {
        ...resource,
        path: resource.path ?? resource.file,
    };
}
