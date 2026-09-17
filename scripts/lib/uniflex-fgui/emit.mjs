import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { adaptationJson, commonJson, componentXml, packageXml, projectXml, publishJson } from "./xml.mjs";
import { publishPackage } from "./publish-dom.mjs";
import { buildCatalogIR } from "./ir.mjs";
import { loadImageCatalog } from "./resources.mjs";
import { extractFairyguiDom } from "./vendor.mjs";
import { PREVIEW_FONT_CANDIDATES } from "./constants.mjs";
import { renderPreviewHtml, screensFromIr } from "./preview-html.mjs";

export async function exportFgui({
    snapshot, snapshots, out, root, screen, catalog, hostPlan, images,
} = {}) {
    if (!out) throw new Error("Missing --out.");
    const output = resolve(root, out);
    if (output === resolve(root, "apps/art/fairygui") || output.startsWith(`${resolve(root, "apps/art/fairygui")}/`)) {
        throw new Error("Refusing to write apps/art/fairygui; this exporter only writes --out.");
    }
    const pages = normalizePages({ snapshot, snapshots, screen, hostPlan, root });
    const imageCatalog = images ?? await loadImageCatalog(root);
    const ir = buildCatalogIR(pages, { catalog, images: imageCatalog });
    await mkdir(output, { recursive: true });
    await writeEditorProject(output, ir);
    await writePreview(output, ir, root);
    await writeFile(join(output, "mapping.json"), `${JSON.stringify(ir.mapping, null, 2)}\n`);
    await writeFile(join(output, "report.json"), `${JSON.stringify(ir.report, null, 2)}\n`);
    return { out: output, ir };
}

function normalizePages({ snapshot, snapshots, screen, hostPlan, root }) {
    const list = snapshots ?? (snapshot ? [{ snapshot, screen, hostPlan }] : []);
    if (!list.length) throw new Error("Missing snapshot.");
    return list.map((page) => {
        const snap = page.snapshot;
        if (!snap) throw new Error("Missing snapshot.");
        const resolvedScreen = page.screen ?? screen ?? snap.screen;
        return {
            snapshot: snap,
            screen: resolvedScreen,
            hostPlan: page.hostPlan ?? hostPlan ?? loadDefaultHostPlan(root, resolvedScreen ?? snap.screen),
        };
    });
}

async function writeEditorProject(output, ir) {
    await writeFile(join(output, "UniFlexExport.fairy"), projectXml(ir.project));
    await mkdir(join(output, "settings"), { recursive: true });
    await writeFile(join(output, "settings/Adaptation.json"), adaptationJson(ir.canvas));
    await writeFile(join(output, "settings/Common.json"), commonJson());
    await writeFile(join(output, "settings/Publish.json"), publishJson());
    for (const pkg of ir.packages) {
        const dir = join(output, "assets", pkg.name);
        await mkdir(join(dir, "images"), { recursive: true });
        await writeFile(join(dir, "package.xml"), packageXml(pkg));
        for (const image of pkg.images) {
            await copyBinary(image.sourcePath, join(dir, "images", image.fileName));
        }
        for (const component of pkg.components) {
            await writeFile(join(dir, `${component.name}.xml`), componentXml(component, pkg, ir.packages));
        }
    }
}

async function writePreview(output, ir, root) {
    const preview = join(output, "preview");
    await mkdir(preview, { recursive: true });
    for (const pkg of ir.packages) {
        const dir = join(preview, pkg.name);
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "package.xml"), publishPackage(pkg, ir.packages));
        for (const image of pkg.images) {
            await copyBinary(image.sourcePath, join(dir, image.fileName));
        }
    }
    const runtime = await extractFairyguiDom(root);
    try {
        await copyBinary(runtime.umd, join(preview, "fairygui.js"));
    } finally {
        runtime.cleanup();
    }
    const font = previewFontPath(root);
    if (font) await copyBinary(font, join(preview, "regular.ttf"));
    await writeFile(join(preview, "index.html"), renderPreviewHtml({
        screens: screensFromIr(ir),
        font: Boolean(font),
    }));
}

function loadDefaultHostPlan(root, screen) {
    const name = screen?.componentName;
    if (!name) return null;
    const path = join(root, "apps/client/.cache/uniflex/aot/data", `${name}.plan.json`);
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch {
        return null;
    }
}

async function copyBinary(from, to) {
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, await readFile(from));
}

function previewFontPath(root) {
    return PREVIEW_FONT_CANDIDATES.map((relative) => join(root, relative)).find((file) => existsSync(file));
}

