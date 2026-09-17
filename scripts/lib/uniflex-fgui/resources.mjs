import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

/** Load every apps/client/resources/ui/<pkg>/manifest.json and index image assets by id. */
export async function loadImageCatalog(root) {
    const uiRoot = join(root, "apps/client/resources/ui");
    const entries = await readdir(uiRoot, { withFileTypes: true }).catch(() => []);
    const byId = new Map();
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = join(uiRoot, entry.name);
        const manifestPath = join(dir, "manifest.json");
        let manifest;
        try {
            manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        } catch {
            continue;
        }
        if (!Array.isArray(manifest?.assets)) continue;
        for (const asset of manifest.assets) {
            if (asset?.kind !== "image" || typeof asset.id !== "string") continue;
            if (byId.has(asset.id)) continue;
            byId.set(asset.id, {
                id: asset.id,
                file: asset.file,
                width: asset.width,
                height: asset.height,
                nineSlice: asset.nineSlice,
                sha256: asset.sha256,
                sourcePath: join(dir, asset.file),
                packageDir: dir,
                packageName: entry.name,
            });
        }
    }
    return byId;
}

export function imageBasename(asset) {
    const file = String(asset.file ?? asset.sourcePath ?? "image.png");
    return basename(file);
}

export function imageStem(asset) {
    const base = imageBasename(asset);
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(0, dot) : base;
}
