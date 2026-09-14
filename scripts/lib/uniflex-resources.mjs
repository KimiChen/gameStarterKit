export function createImageResourceEntry(resource, packageName) {
    return {
        id: resource.id,
        kind: "image",
        file: `imported/${packageName}/${resource.path}`,
        ...(resource.width === undefined ? {} : { width: resource.width }),
        ...(resource.height === undefined ? {} : { height: resource.height }),
        ...(resource.nineSlice === undefined ? {} : { nineSlice: resource.nineSlice }),
        sha256: resource.sha256,
    };
}
