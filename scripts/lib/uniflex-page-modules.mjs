import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";

const RULES = [
    [/^Alliance/, "alliance"],
    [/^Hero/, "hero"],
    [/^Shop/, "shop"],
    [/^Backpack/, "backpack"],
    [/^Mail/, "mail"],
    [/^Character/, "character"],
    [/^Settings/, "settings"],
    [/^(Prompt|Confirm|SmallPopup)/, "popup"],
    [/PreviewHome/, "preview"],
];

export function moduleForPageName(name) {
    for (const [pattern, module] of RULES) {
        if (pattern.test(name)) return module;
    }
    return null;
}

export function nestedPageRel(name) {
    const module = moduleForPageName(name);
    return module ? `${module}/${name}` : name;
}

export function restoredSourceFromPage(page) {
    const source = String(page.source || "").replaceAll("\\", "/");
    const slash = source.lastIndexOf("/");
    if (slash < 0 || !page.restoredName) return null;
    const moduleDir = dirname(source);
    return `${dirname(moduleDir)}/${page.restoredName}/${page.restoredName}.tsx`;
}

export async function loadPreviewScreens(projectRoot) {
    try {
        const catalog = JSON.parse(await readFile(
            join(projectRoot, "apps/web-ui-preview/screens.json"), "utf8"));
        if (!Array.isArray(catalog?.screens)) return null;
        return catalog;
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

export function authoringDirFromCatalog(catalog, name) {
    const screen = catalog?.screens?.find((entry) => entry.componentName === name);
    if (!screen?.source) return null;
    return dirname(String(screen.source).replaceAll("\\", "/"));
}
