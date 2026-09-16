import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startUniflexWebPreview } from "./lib/uniflex-web-preview.mjs";
import {
    applyName, artFontDir, artJsonPath, artPageDir, artPsdPath, fileSha256,
    findArtPage, hashUniflexSources, inspectArtPage, loadArtCatalog, pathExists,
    readArtJson, sharedArtFontDir,
} from "./lib/uniflex-art.mjs";
import { runCli } from "./uniflex-ui-cli.mjs";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const help = `Usage:
  npm run ui:art-export -- --screen backpack
  npm run ui:art-export -- --all [--force]
  npm run ui:art-import -- --screen backpack
  npm run ui:art-import -- --changed
  npm run ui:art-sync [--force]
  npm run ui:art-check

Exports UniFlex originals to apps/art/uniflex/<Page>/screen.psd.
Imports overlay to applyTarget (catalog default: restored). Never writes originals
unless applyTarget is original. Chrome, uv, and build:uniflex-ui are required.
`;

function takeFlag(args, name, { boolean = false } = {}) {
    const flag = `--${name}`;
    const index = args.indexOf(flag);
    if (index < 0) return { args, value: boolean ? false : undefined };
    if (boolean) return { args: [...args.slice(0, index), ...args.slice(index + 1)], value: true };
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing --${name} value.`);
    return { args: [...args.slice(0, index), ...args.slice(index + 2)], value };
}

function nowIso() {
    return new Date().toISOString();
}

async function writeArtJson(rootDir, page, catalog, patch) {
    const previous = await readArtJson(rootDir, page) || {};
    const next = {
        screen: page.screen,
        componentName: page.componentName,
        restoredName: page.restoredName,
        source: page.source,
        canvas: page.canvas,
        applyTarget: page.applyTarget || catalog.applyTarget,
        ...previous,
        ...patch,
    };
    await mkdir(artPageDir(rootDir, page), { recursive: true });
    await writeFile(artJsonPath(rootDir, page), `${JSON.stringify(next, null, 2)}\n`);
    return next;
}

async function selectPages(catalog, { screen, all, changed }, rootDir) {
    if (screen && (all || changed)) throw new Error("Use either --screen or --all/--changed.");
    if (screen) {
        const page = findArtPage(catalog, screen);
        if (!page) {
            const known = catalog.pages.map((entry) => entry.screen).join(", ");
            throw new Error(`Unknown art screen: ${screen}. Known: ${known}`);
        }
        return [page];
    }
    if (changed) {
        const selected = [];
        for (const page of catalog.pages) {
            const state = await inspectArtPage(rootDir, page);
            if (state.action === "import") selected.push(page);
        }
        return selected;
    }
    return catalog.pages;
}

async function withPreview(env, fn) {
    if (env.UNIFLEX_PREVIEW_URL) return fn(env);
    const preview = await startUniflexWebPreview({ root, port: 0 });
    try {
        return await fn({ ...env, UNIFLEX_PREVIEW_URL: preview.url });
    } finally {
        await preview.dispose();
    }
}

async function exportPage(page, catalog, { env, force = false }) {
    const state = await inspectArtPage(root, page);
    if (state.action === "conflict" && !force)
        throw new Error(`${page.componentName}: UniFlex and PSD both changed; pass --force to overwrite the PSD.`);
    if (state.action === "import" && !force)
        throw new Error(`${page.componentName}: PSD has designer edits; pass --force to overwrite, or import first.`);
    if (state.action === "ok" && !force) {
        console.log(`skip export ${page.componentName}: already fresh`);
        return state;
    }
    const cache = resolve(root, ".cache/psd/art-export", page.componentName);
    await rm(cache, { recursive: true, force: true });
    await runCli(["export-psd", "--screen", page.screen, "--out", cache], { root, env });
    const report = JSON.parse(await readFile(join(cache, "validation.json"), "utf8"));
    if (!report?.psd) throw new Error(`Export did not report a PSD for ${page.componentName}.`);
    const dest = artPageDir(root, page);
    await mkdir(dest, { recursive: true });
    await cp(join(cache, report.psd), artPsdPath(root, page));
    const fonts = join(cache, "fonts");
    if (await pathExists(fonts)) {
        const shared = sharedArtFontDir(root);
        if (!await pathExists(shared)) await cp(fonts, shared, { recursive: true });
        await rm(artFontDir(root, page), { recursive: true, force: true });
    }
    const psdSha = await fileSha256(artPsdPath(root, page));
    const uniflexSha = await hashUniflexSources(root, page.source);
    await writeArtJson(root, page, catalog, {
        export: { uniflexSha256: uniflexSha, psdSha256: psdSha, at: nowIso() },
    });
    console.log(`exported ${page.componentName} → ${ART_REL(page)}`);
    return inspectArtPage(root, page);
}

function ART_REL(page) {
    return `apps/art/uniflex/${page.componentName}/screen.psd`;
}

async function importPage(page, catalog, { env }) {
    const psd = artPsdPath(root, page);
    if (!await pathExists(psd))
        throw new Error(`${page.componentName}: missing ${ART_REL(page)}; export first.`);
    const name = applyName(page, catalog.applyTarget);
    const fontDir = await pathExists(artFontDir(root, page))
        ? artFontDir(root, page) : sharedArtFontDir(root);
    const cache = resolve(root, ".cache/psd/art-import", page.componentName);
    await rm(cache, { recursive: true, force: true });
    const args = ["import-psd", "--file", psd, "--name", name, "--out", cache, "--update"];
    if (await pathExists(fontDir)) args.push("--font-dir", fontDir);
    await runCli(args, { root, env });
    const psdSha = await fileSha256(psd);
    await writeArtJson(root, page, catalog, {
        import: { psdSha256: psdSha, at: nowIso(), target: page.applyTarget || catalog.applyTarget },
    });
    console.log(`imported ${ART_REL(page)} → ${name}`);
    return inspectArtPage(root, page);
}

async function checkPages(catalog) {
    const problems = [];
    for (const page of catalog.pages) {
        if (!await pathExists(resolve(root, page.source)))
            problems.push(`${page.screen}: missing source ${page.source}`);
        const restored = resolve(root, "apps/client/src/ui-uniflex/pages",
            page.restoredName, `${page.restoredName}.tsx`);
        if ((page.applyTarget || catalog.applyTarget) === "restored" && !await pathExists(restored))
            problems.push(`${page.screen}: missing restored page ${page.restoredName}`);
        const state = await inspectArtPage(root, page);
        if (state.action === "export")
            problems.push(`${page.screen}: needs export (missing or stale PSD)`);
        else if (state.action === "import")
            problems.push(`${page.screen}: PSD changed; run ui:art-import`);
        else if (state.action === "conflict")
            problems.push(`${page.screen}: UniFlex and PSD both changed`);
    }
    if (problems.length) {
        const error = new Error(`ui:art-check failed:\n- ${problems.join("\n- ")}`);
        error.status = 1;
        throw error;
    }
    console.log(`ui:art-check passed: ${catalog.pages.length} pages`);
}

async function syncPages(catalog, { env, force }) {
    const report = [];
    for (const page of catalog.pages) {
        const state = await inspectArtPage(root, page);
        if (state.action === "ok") {
            report.push({ screen: page.screen, action: "ok" });
            continue;
        }
        if (state.action === "conflict" && !force)
            throw new Error(`${page.componentName}: UniFlex and PSD both changed; pass --force to overwrite the PSD.`);
        if (state.action === "export" || (state.action === "conflict" && force)) {
            await exportPage(page, catalog, { env, force: true });
            await importPage(page, catalog, { env });
            report.push({ screen: page.screen, action: "export+import" });
            continue;
        }
        await importPage(page, catalog, { env });
        report.push({ screen: page.screen, action: "import" });
    }
    console.log(JSON.stringify({ kind: "uniflex-art-sync", report }, null, 2));
}

export async function runArtCli(argv, { env = process.env } = {}) {
    const [command, ...rest] = argv;
    if (!command || ["--help", "-h"].includes(command)) {
        console.log(help);
        return;
    }
    const catalog = await loadArtCatalog(root);
    let args = rest;
    let screen, all, changed, force;
    ({ args, value: screen } = takeFlag(args, "screen"));
    ({ args, value: all } = takeFlag(args, "all", { boolean: true }));
    ({ args, value: changed } = takeFlag(args, "changed", { boolean: true }));
    ({ args, value: force } = takeFlag(args, "force", { boolean: true }));
    if (args.length) throw new Error(`Unexpected arguments: ${args.join(" ")}`);

    if (command === "check") {
        await checkPages(catalog);
        return;
    }
    if (command === "export") {
        const pages = await selectPages(catalog, { screen, all: all || !screen && !changed, changed }, root);
        await withPreview(env, async (previewEnv) => {
            for (const page of pages) await exportPage(page, catalog, { env: previewEnv, force });
        });
        return;
    }
    if (command === "import") {
        const pages = await selectPages(catalog, { screen, all, changed: changed || !screen && !all }, root);
        if (!pages.length) {
            console.log("no changed art PSDs to import");
            return;
        }
        for (const page of pages) await importPage(page, catalog, { env });
        return;
    }
    if (command === "sync") {
        await withPreview(env, (previewEnv) => syncPages(catalog, { env: previewEnv, force }));
        return;
    }
    throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runArtCli(process.argv.slice(2)).catch((error) => {
        console.error(`ERROR: ${error.message}`);
        process.exitCode = Number.isInteger(error.status) && error.status > 0 ? error.status : 1;
    });
}
