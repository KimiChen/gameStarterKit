import { jsonHash, type ResourceCatalog } from "../kits/uniflex/api/provider/index";

/** Imported page fonts must not become the fallback font of unrelated pages. */
export function pageResourceCatalog(catalog: ResourceCatalog, ids: readonly string[]): ResourceCatalog {
    const declared = new Set(ids);
    const resources = catalog.resources.filter((entry) => entry.kind !== "font"
        || entry.id === "fonts/regular" || declared.has(entry.id));
    return { version: 1, hash: jsonHash(resources), resources };
}
