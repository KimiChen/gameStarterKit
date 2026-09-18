import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function loadScreenCatalog(root) {
    const catalog = JSON.parse(await readFile(resolve(root, "apps/web-ui-preview/screens.json"), "utf8"));
    if (!Array.isArray(catalog?.screens) || !Array.isArray(catalog?.components)) {
        throw new Error("Invalid UniFlex preview screen catalog.");
    }
    return catalog;
}

export function findScreen(catalog, id) {
    if (!id) return catalog.screens.find((screen) => screen.default) ?? null;
    const key = String(id).trim().toLowerCase();
    if (!key) return null;
    return catalog.screens.find((screen) =>
        screen.id === key || screen.aliases.some((alias) => String(alias).toLowerCase() === key)) ?? null;
}

export function screenFromUrl(catalog, url) {
    try {
        const parsed = new URL(url);
        const id = parsed.searchParams.get("screen") || parsed.searchParams.get("ui");
        return id ? findScreen(catalog, id) : null;
    } catch {
        return null;
    }
}

export function knownScreenIds(catalog) {
    return catalog.screens.map((screen) => screen.id).join(", ");
}

export function takeOption(args, name, { boolean = false } = {}) {
    const flag = `--${name}`;
    const index = args.indexOf(flag);
    if (index < 0) return { args, value: undefined };
    if (boolean) {
        return { args: [...args.slice(0, index), ...args.slice(index + 1)], value: true };
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing --${name} value.`);
    return { args: [...args.slice(0, index), ...args.slice(index + 2)], value };
}

export function hasFlag(args, name) {
    return args.includes(`--${name}`);
}

export function flagValue(args, name) {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
}

export function flagValues(args, name) {
    const flag = `--${name}`;
    const values = [];
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] !== flag) continue;
        const value = args[i + 1];
        if (!value || value.startsWith("--")) throw new Error(`Missing --${name} value.`);
        values.push(value);
        i += 1;
    }
    return values;
}

export function parseScreenList(value, catalog) {
    const ids = String(value).split(",").map((id) => id.trim()).filter(Boolean);
    if (!ids.length) throw new Error("Missing --screens value.");
    return ids.map((id) => {
        const screen = findScreen(catalog, id);
        if (!screen) throw new Error(`Unknown UniFlex preview screen: ${id}. Known: ${knownScreenIds(catalog)}`);
        return screen;
    });
}

export function resolvePreviewUrl(base, screen, { exportMode = true } = {}) {
    const url = new URL(base);
    if (screen) url.searchParams.set("screen", screen.id);
    if (exportMode && !url.searchParams.has("psd")) url.searchParams.set("psd", "1");
    return url.href;
}

export function injectUniflexExportArgs(args, { url, screen } = {}) {
    let forwarded = [...args];
    if (url) forwarded = [...takeOption(forwarded, "url").args, "--url", url];
    if (flagValue(forwarded, "adapter") === "dom") return forwarded;
    if (!hasFlag(forwarded, "adapter")) forwarded.push("--adapter", "uniflex");
    if (!hasFlag(forwarded, "selector")) forwarded.push("--selector", "#ui");
    if (!hasFlag(forwarded, "ready-selector")) {
        forwarded.push("--ready-selector", "html[data-uniflex-ready='true']");
    }
    if (screen) {
        if (!hasFlag(forwarded, "width")) forwarded.push("--width", String(screen.canvas.width));
        if (!hasFlag(forwarded, "height")) forwarded.push("--height", String(screen.canvas.height));
    }
    return forwarded;
}
