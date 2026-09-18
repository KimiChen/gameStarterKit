import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { loadScreenCatalog } from "./uniflex-screens.mjs";

export const ART_ROOT = "apps/art/uniflex";
export const ART_COMPONENTS = `${ART_ROOT}/components`;
export const CATALOG_FILE = `${ART_ROOT}/catalog.json`;

export function artPageDir(root, page) {
    return resolve(root, ART_ROOT, page.componentName);
}

export function artComponentDir(root, key) {
    return resolve(root, ART_COMPONENTS, key);
}

export function artComponentPsdPath(root, key) {
    return join(artComponentDir(root, key), "component.psd");
}

export function artComponentJsonPath(root, key) {
    return join(artComponentDir(root, key), "art.json");
}

export function artPsdPath(root, page) {
    return join(artPageDir(root, page), "screen.psd");
}

export function artJsonPath(root, page) {
    return join(artPageDir(root, page), "art.json");
}

export function artFontDir(root, page) {
    return join(artPageDir(root, page), "fonts");
}

export function sharedArtFontDir(root) {
    return resolve(root, ART_ROOT, "fonts");
}

export function applyName(page, applyTarget) {
    const target = page.applyTarget || applyTarget || "restored";
    if (target === "original") return page.componentName;
    if (target !== "restored") throw new Error(`Unknown applyTarget: ${target}`);
    return page.restoredName;
}

export function isArtScreen(screen) {
    const id = String(screen?.id || "");
    const name = String(screen?.componentName || "");
    if (!id || !name || !screen.source) return false;
    if (screen.default) return false;
    if (id === "preview-home" || id === "restored-home") return false;
    if (id.endsWith("-restored") || name.endsWith("Restored")) return false;
    if (id === "backpack-edited") return false;
    return true;
}

function pageFromScreen(screen, override = {}) {
    return {
        screen: screen.id,
        componentName: override.componentName || screen.componentName,
        restoredName: override.restoredName || `${screen.componentName}Restored`,
        source: override.source || screen.source,
        canvas: override.canvas || screen.canvas,
        ...(override.applyTarget ? { applyTarget: override.applyTarget } : {}),
    };
}

export async function loadArtCatalog(root, readText = (file) => readFile(file, "utf8")) {
    const catalog = JSON.parse(await readText(resolve(root, CATALOG_FILE)));
    if (catalog?.schemaVersion !== 1)
        throw new Error("Invalid UniFlex art catalog.");
    if (!["restored", "original"].includes(catalog.applyTarget))
        throw new Error("art catalog applyTarget must be restored or original.");
    const preview = await loadScreenCatalog(root);
    const overrides = new Map((catalog.pages || []).map((page) => [page.screen, page]));
    const pages = [];
    const seen = new Set();
    for (const screen of preview.screens) {
        if (!isArtScreen(screen)) continue;
        const page = pageFromScreen(screen, overrides.get(screen.id) || {});
        if (!page.screen || !page.componentName || !page.restoredName || !page.source)
            throw new Error("art catalog page is missing screen/componentName/restoredName/source.");
        if (seen.has(page.screen)) throw new Error(`Duplicate art screen: ${page.screen}`);
        seen.add(page.screen);
        pages.push(page);
    }
    for (const page of catalog.pages || []) {
        if (seen.has(page.screen)) continue;
        if (!page.screen || !page.componentName || !page.restoredName || !page.source)
            throw new Error("art catalog page is missing screen/componentName/restoredName/source.");
        seen.add(page.screen);
        pages.push(page);
    }
    if (!pages.length) throw new Error("Invalid UniFlex art catalog.");
    return { ...catalog, pages };
}

export function findArtPage(catalog, screen) {
    const key = String(screen || "").trim().toLowerCase();
    return catalog.pages.find((page) =>
        page.screen === key || page.componentName.toLowerCase() === key
        || page.restoredName.toLowerCase() === key) ?? null;
}

export async function fileSha256(file) {
    try {
        return createHash("sha256").update(await readFile(file)).digest("hex");
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

export async function hashUniflexFile(root, sourceFile) {
    const file = resolve(root, sourceFile);
    const hash = createHash("sha256");
    hash.update(String(sourceFile).split("\\").join("/"));
    hash.update("\0");
    try {
        hash.update(await readFile(file));
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
    return hash.digest("hex");
}

export async function hashUniflexSources(root, sourceFile) {
    const dir = dirname(resolve(root, sourceFile));
    const files = [];
    const walk = async (current) => {
        let entries;
        try {
            entries = await readdir(current, { withFileTypes: true });
        } catch (error) {
            if (error.code === "ENOENT") return;
            throw error;
        }
        for (const entry of entries) {
            const full = join(current, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (/\.tsx?$/u.test(entry.name)) files.push(full);
        }
    };
    await walk(dir);
    files.sort();
    const hash = createHash("sha256");
    for (const file of files) {
        hash.update(relative(root, file).split("\\").join("/"));
        hash.update("\0");
        hash.update(await readFile(file));
        hash.update("\0");
    }
    return hash.digest("hex");
}

export async function readArtJson(root, page) {
    try {
        return JSON.parse(await readFile(artJsonPath(root, page), "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

export async function readComponentArtJson(root, key) {
    try {
        return JSON.parse(await readFile(artComponentJsonPath(root, key), "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

export async function listArtComponents(root) {
    const directory = resolve(root, ART_COMPONENTS);
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
    const keys = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!await pathExists(artComponentPsdPath(root, entry.name))) continue;
        keys.push(entry.name);
    }
    keys.sort();
    return keys;
}

export async function inspectArtComponent(root, key) {
    const art = await readComponentArtJson(root, key);
    const source = art?.source;
    const [psdSha, uniflexSha] = await Promise.all([
        fileSha256(artComponentPsdPath(root, key)),
        source ? hashUniflexFile(root, source) : Promise.resolve(null),
    ]);
    return {
        key,
        source,
        psdSha,
        uniflexSha,
        art,
        action: classifyArtPage({ psdSha, uniflexSha: uniflexSha || art?.export?.uniflexSha256, art }),
    };
}

export function classifyArtPage({ psdSha, uniflexSha, art }) {
    if (!psdSha) return "export";
    const exportedPsd = art?.export?.psdSha256;
    const exportedUni = art?.export?.uniflexSha256;
    const importedPsd = art?.import?.psdSha256;
    const psdMatchesExport = !!exportedPsd && psdSha === exportedPsd;
    const psdMatchesImport = !!importedPsd && psdSha === importedPsd;
    const uniDirty = !exportedUni || uniflexSha !== exportedUni;
    if (!psdMatchesExport && !psdMatchesImport) return uniDirty ? "conflict" : "import";
    if (!psdMatchesExport && psdMatchesImport) return uniDirty ? "conflict" : "ok";
    if (uniDirty) return "export";
    return "ok";
}

export async function inspectArtPage(root, page) {
    const [psdSha, uniflexSha, art] = await Promise.all([
        fileSha256(artPsdPath(root, page)),
        hashUniflexSources(root, page.source),
        readArtJson(root, page),
    ]);
    return {
        page,
        psdSha,
        uniflexSha,
        art,
        action: classifyArtPage({ psdSha, uniflexSha, art }),
    };
}

export async function pathExists(file) {
    return access(file).then(() => true).catch((error) => {
        if (error.code === "ENOENT") return false;
        throw error;
    });
}
