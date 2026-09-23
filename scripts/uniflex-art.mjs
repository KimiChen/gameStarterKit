import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startUniflexWebPreview } from "./lib/uniflex-web-preview.mjs";
import {
    applyName, artComponentDir, artComponentJsonPath, artComponentPsdPath,
    artFontDir, artJsonPath, artPageDir, artPsdPath, componentPublishAction, fileSha256,
    findArtPage, hashUniflexFile, hashUniflexSources, inspectArtComponent,
    inspectArtPage, listArtComponents, loadArtCatalog, pathExists,
    readArtJson, readComponentArtJson, sharedArtFontDir,
} from "./lib/uniflex-art.mjs";
import { runCli } from "./uniflex-ui-cli.mjs";
import { restoredSourceFromPage } from "./lib/uniflex-page-modules.mjs";
import { auditArtLinks, bindArtLinkIdentities, psdHasPageScopedIdentity } from "./lib/uniflex-link-identity.mjs";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const help = `Usage:
  npm run ui:art-export -- --screen backpack
  npm run ui:art-export -- --all [--force]
  npm run ui:art-export -- --rebuild
  npm run ui:art-import -- --screen backpack
  npm run ui:art-import -- --component BackpackItemCard
  npm run ui:art-import -- --changed
  npm run ui:art-sync [--force]
  npm run ui:art-check

Exports UniFlex originals to apps/art/uniflex/<Page>/<Page>.psd and restorable
defineComponent instances to apps/art/uniflex/components/<Key>/<Key>.psd.
Page PSDs link those files as smart objects. --rebuild re-exports every catalog
page and refreshes component PSDs whose UniFlex source changed, once, from the
first page that contains them. Designer-edited component PSDs stay. Imports overlay to applyTarget
(catalog default: restored) via ui-uniflex/restored/ shared copies. Never writes
originals unless applyTarget is original. Chrome, uv, and build:uniflex-ui are required.
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
        ...previous,
        screen: page.screen,
        componentName: page.componentName,
        restoredName: page.restoredName,
        source: page.source,
        canvas: page.canvas,
        applyTarget: page.applyTarget || catalog.applyTarget,
        ...patch,
    };
    await mkdir(artPageDir(rootDir, page), { recursive: true });
    await writeFile(artJsonPath(rootDir, page), `${JSON.stringify(next, null, 2)}\n`);
    return next;
}

async function writeComponentArtJson(rootDir, item, patch) {
    const previous = await readComponentArtJson(rootDir, item.key) || {};
    const next = {
        ...previous,
        key: item.key,
        source: item.source || previous.source,
        ...patch,
    };
    await mkdir(artComponentDir(rootDir, item.key), { recursive: true });
    await writeFile(artComponentJsonPath(rootDir, item.key), `${JSON.stringify(next, null, 2)}\n`);
    return next;
}

async function linkedManifestForPage(rootDir, page, cache) {
    // The manifest is an export-time plan consumed from the cache only. The
    // committed copy next to the page PSD was dropped: import/check read the
    // key list from the page art.json `linkedComponents` instead.
    if (!cache) return null;
    const fromCache = join(cache, "linked-components.json");
    if (await pathExists(fromCache)) return JSON.parse(await readFile(fromCache, "utf8"));
    return null;
}

async function linkedKeysForPage(rootDir, page, cache) {
    const art = await readArtJson(rootDir, page);
    if (Array.isArray(art?.linkedComponents) && art.linkedComponents.length)
        return art.linkedComponents;
    const manifest = await linkedManifestForPage(rootDir, page, cache);
    return (manifest?.components || []).map((item) => item.key);
}

async function publishLinkedComponents(cache, page, { force = false } = {}) {
    const manifest = await linkedManifestForPage(root, page, cache);
    if (!manifest?.components?.length) return [];
    const keys = [];
    for (const item of manifest.components) {
        const src = join(cache, item.psd);
        if (!await pathExists(src)) continue;
        const dest = artComponentPsdPath(root, item.key);
        const previous = await readComponentArtJson(root, item.key);
        const destSha = await fileSha256(dest);
        const exportedPsd = previous?.export?.psdSha256;
        const uniflexSha = item.source ? await hashUniflexFile(root, item.source) : null;
        const pageScoped = destSha ? psdHasPageScopedIdentity(await readFile(dest)) : false;
        const cacheDir = dirname(src);
        let propNames = [];
        try {
            propNames = (await readdir(cacheDir)).filter((name) => name.endsWith(".psd")
                && name !== `${item.key}.psd`
                && /^[A-Za-z][A-Za-z0-9_]*\.psd$/u.test(name));
        } catch (error) {
            if (error?.code !== "ENOENT") throw error;
        }
        const missingProps = [];
        for (const name of propNames) {
            if (!await pathExists(join(artComponentDir(root, item.key), name))) missingProps.push(name);
        }
        let action = componentPublishAction({
            destSha,
            exportedPsd,
            recordedUniflex: previous?.export?.uniflexSha256,
            uniflexSha,
            force,
            pageScoped,
        });
        // The first export that splits a component also writes its prop PSDs.
        // Later pages still keep the shared file.
        if (action === "keep-shared" && missingProps.length) {
            console.log(`replace ${item.key}: overridable properties now have their own PSDs; re-export every page that links it`);
            action = "replace";
        }
        if (action === "keep-shared") {
            const cacheSha = await fileSha256(src);
            if (cacheSha && destSha && cacheSha !== destSha) {
                console.log(`replace ${item.key}: shared structure changed`);
                action = "replace";
            }
        }
        if (action === "keep-designer") {
            console.log(`keep ${item.key}: designer-edited component PSD`);
            keys.push(item.key);
            continue;
        }
        // A later page must not replace the canonical file. Source changes
        // replace it once; the updated hash makes the following pages keep it.
        if (action === "keep-shared") {
            console.log(`keep ${item.key}: shared component already exported`);
            keys.push(item.key);
            continue;
        }
        await mkdir(artComponentDir(root, item.key), { recursive: true });
        await cp(src, dest);
        for (const name of propNames)
            await cp(join(cacheDir, name), join(artComponentDir(root, item.key), name));
        const psdSha = await fileSha256(dest);
        await writeComponentArtJson(root, item, {
            export: { uniflexSha256: uniflexSha, psdSha256: psdSha, at: nowIso() },
        });
        keys.push(item.key);
    }
    return keys;
}

async function selectPages(catalog, { screen, all, changed, mode }, rootDir) {
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
        const wanted = mode === "export" ? "export" : "import";
        for (const page of catalog.pages) {
            const state = await inspectArtPage(rootDir, page);
            if (state.action === wanted) selected.push(page);
        }
        return selected;
    }
    if (all && mode === "export") {
        const selected = [];
        for (const page of catalog.pages) {
            const state = await inspectArtPage(rootDir, page);
            if (state.action === "export") selected.push(page);
        }
        return selected;
    }
    if (all && mode === "import") {
        const selected = [];
        for (const page of catalog.pages) {
            if (await pathExists(artPsdPath(rootDir, page))) selected.push(page);
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

async function exportPage(page, catalog, { env, force = false, rebuild = false }) {
    const state = await inspectArtPage(root, page);
    if (state.action === "conflict" && !force)
        throw new Error(`${page.componentName}: UniFlex and PSD both changed; pass --force to overwrite the PSD.`);
    if (state.action === "import" && !force)
        throw new Error(`${page.componentName}: PSD has designer edits; pass --force to overwrite, or import first.`);
    if (state.action === "ok" && !force && !rebuild) {
        console.log(`skip export ${page.componentName}: already fresh`);
        return state;
    }
    const cache = resolve(root, ".cache/psd/art-export", page.componentName);
    await rm(cache, { recursive: true, force: true });
    const exportEnv = {
        ...env,
        UNIFLEX_ART_COMPONENTS: join(root, "apps/art/uniflex/components"),
        ...(force ? { UNIFLEX_ART_COMPONENT_BASE: "canonical" } : {}),
    };
    await runCli(["export-psd", "--screen", page.screen, "--out", cache], { root, env: exportEnv });
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
    const linkedComponents = await publishLinkedComponents(cache, page, { force });
    if (!rebuild) await bindArtLinkIdentities(root);
    const psdSha = await fileSha256(artPsdPath(root, page));
    const uniflexSha = await hashUniflexSources(root, page.source);
    await writeArtJson(root, page, catalog, {
        export: { uniflexSha256: uniflexSha, psdSha256: psdSha, at: nowIso() },
        linkedComponents,
    });
    console.log(`exported ${page.componentName} → ${ART_REL(page)}`
        + (linkedComponents.length ? ` + ${linkedComponents.length} components` : ""));
    return inspectArtPage(root, page);
}

function ART_REL(page) {
    return `apps/art/uniflex/${page.componentName}/${page.componentName}.psd`;
}

async function importComponent(key, { env }) {
    const psd = artComponentPsdPath(root, key);
    if (!await pathExists(psd))
        throw new Error(`${key}: missing apps/art/uniflex/components/${key}/${key}.psd`);
    const fontDir = sharedArtFontDir(root);
    const cache = resolve(root, ".cache/psd/art-import", "components", key);
    await rm(cache, { recursive: true, force: true });
    const args = ["import-psd", "--file", psd, "--name", key, "--out", cache, "--update"];
    if (await pathExists(fontDir)) args.push("--font-dir", fontDir);
    await runCli(args, { root, env });
    const psdSha = await fileSha256(psd);
    const previous = await readComponentArtJson(root, key) || { key };
    await writeComponentArtJson(root, previous, {
        import: { psdSha256: psdSha, at: nowIso(), target: "restored" },
    });
    console.log(`imported apps/art/uniflex/components/${key}/${key}.psd → restored/${key}`);
    return inspectArtComponent(root, key);
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
    const keys = await linkedKeysForPage(root, page);
    for (const key of keys) {
        if (await pathExists(artComponentPsdPath(root, key)))
            await importComponent(key, { env });
    }
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
        const restoredRel = restoredSourceFromPage(page);
        const restored = restoredRel
            ? resolve(root, restoredRel)
            : resolve(root, "apps/client/src/ui-uniflex/modules",
                page.restoredName, `${page.restoredName}.tsx`);
        const art = await readArtJson(root, page);
        if ((page.applyTarget || catalog.applyTarget) === "restored"
            && art?.import && !await pathExists(restored))
            problems.push(`${page.screen}: missing restored page ${page.restoredName}`);
        const state = await inspectArtPage(root, page);
        if (state.action === "export")
            problems.push(`${page.screen}: needs export (missing or stale PSD)`);
        else if (state.action === "import")
            problems.push(`${page.screen}: PSD changed; run ui:art-import`);
        else if (state.action === "conflict")
            problems.push(`${page.screen}: UniFlex and PSD both changed`);
        for (const key of await linkedKeysForPage(root, page)) {
            if (!await pathExists(artComponentPsdPath(root, key)))
                problems.push(`${page.screen}: missing component PSD ${key}`);
        }
    }
    for (const key of await listArtComponents(root)) {
        const state = await inspectArtComponent(root, key);
        if (state.action === "import")
            problems.push(`component ${key}: PSD changed; run ui:art-import --component ${key}`);
        else if (state.action === "conflict")
            problems.push(`component ${key}: UniFlex and PSD both changed`);
    }
    problems.push(...await auditArtLinks(root));
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
    let screen, component, all, changed, force, rebuild;
    ({ args, value: screen } = takeFlag(args, "screen"));
    ({ args, value: component } = takeFlag(args, "component"));
    ({ args, value: all } = takeFlag(args, "all", { boolean: true }));
    ({ args, value: changed } = takeFlag(args, "changed", { boolean: true }));
    ({ args, value: force } = takeFlag(args, "force", { boolean: true }));
    ({ args, value: rebuild } = takeFlag(args, "rebuild", { boolean: true }));
    if (args.length) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
    if (component && (screen || all || rebuild))
        throw new Error("Use either --component or --screen/--all/--rebuild.");
    if (rebuild && (screen || changed || force))
        throw new Error("--rebuild exports the whole catalog and cannot combine with --screen, --changed, or --force.");

    if (command === "check") {
        await checkPages(catalog);
        return;
    }
    if (command === "export") {
        const pages = rebuild
            ? [...catalog.pages].sort((left, right) =>
                Number(left.screen === "component-gallery") - Number(right.screen === "component-gallery"))
            : await selectPages(catalog, {
            screen, all: all || !screen && !changed && !rebuild, changed, mode: "export",
        }, root);
        const failures = [];
        await withPreview(env, async (previewEnv) => {
            for (const page of pages) {
                try {
                    await exportPage(page, catalog, { env: previewEnv, force, rebuild });
                } catch (error) {
                    if (!rebuild) throw error;
                    const message = error instanceof Error ? error.message : String(error);
                    failures.push(`${page.componentName}: ${message}`);
                    console.error(`FAIL ${page.componentName}: ${message}`);
                }
            }
        });
        if (rebuild) await bindArtLinkIdentities(root);
        if (failures.length)
            throw new Error(`ui:art-export --rebuild failed:\n- ${failures.join("\n- ")}`);
        return;
    }
    if (command === "import") {
        if (component) {
            await importComponent(component, { env });
            return;
        }
        const pages = await selectPages(catalog, {
            screen, all, changed: changed || !screen && !all && !component, mode: "import",
        }, root);
        let importedComponents = 0;
        if (changed || (!screen && !all)) {
            for (const key of await listArtComponents(root)) {
                const state = await inspectArtComponent(root, key);
                if (state.action !== "import") continue;
                await importComponent(key, { env });
                importedComponents += 1;
            }
        }
        if (!pages.length) {
            if (!importedComponents) console.log("no changed art PSDs to import");
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
