import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { adaptationJson, commonJson, componentXml, packageXml, projectXml, publishJson } from "./xml.mjs";
import { publishPackage } from "./publish-dom.mjs";
import { buildProjectIR } from "./ir.mjs";
import { loadImageCatalog } from "./resources.mjs";
import { extractFairyguiDom } from "./vendor.mjs";

export async function exportFgui({
    snapshot, out, root, screen, catalog, hostPlan, images,
} = {}) {
    if (!out) throw new Error("Missing --out.");
    const output = resolve(root, out);
    if (output === resolve(root, "apps/art/fairygui") || output.startsWith(`${resolve(root, "apps/art/fairygui")}/`)) {
        throw new Error("Refusing to write apps/art/fairygui; this exporter only writes --out.");
    }
    const imageCatalog = images ?? await loadImageCatalog(root);
    const plan = hostPlan ?? loadDefaultHostPlan(root, screen ?? snapshot.screen);
    const ir = buildProjectIR(snapshot, { screen, catalog, hostPlan: plan, images: imageCatalog });
    await mkdir(output, { recursive: true });
    await writeEditorProject(output, ir);
    await writePreview(output, ir, root);
    await writeFile(join(output, "mapping.json"), `${JSON.stringify(ir.mapping, null, 2)}\n`);
    await writeFile(join(output, "report.json"), `${JSON.stringify(ir.report, null, 2)}\n`);
    return { out: output, ir };
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
    await writeFile(join(preview, "index.html"), previewHtml(ir));
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

function previewHtml(ir) {
    const page = ir.packages[1];
    const common = ir.packages[0];
    const component = page.components.find((item) => item.exported) ?? page.components.at(-1);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <title>UniFlex FairyGUI preview (candidate) — ${escapeHtml(component.name)}</title>
  <style>
    html, body { margin: 0; background: #222; color: #eee; font: 14px/1.4 sans-serif; }
    #stage-host { width: ${ir.canvas.width}px; height: ${ir.canvas.height}px; transform-origin: top left; }
    #meta { padding: 8px 12px; }
  </style>
</head>
<body>
  <div id="meta">候选 FairyGUI 工程 DOM 预览（官方 fairygui-dom）。不是旧 Cocos 发布物。</div>
  <div id="stage-host"></div>
  <script src="./fairygui.js"></script>
  <script type="module">
    const fgui = window.fgui;
    if (!fgui) throw new Error("fairygui-dom failed to load");
    await fgui.UIPackage.loadPackage("./${common.name}");
    await fgui.UIPackage.loadPackage("./${page.name}");
    const view = fgui.UIPackage.createObject("${page.name}", "${component.name}");
    if (!view) throw new Error("createObject failed");
    fgui.GRoot.inst.addChild(view);
    window.__FGUI_PREVIEW__ = { view, packageName: "${page.name}", componentName: "${component.name}" };
    document.documentElement.dataset.fguiReady = "true";
  </script>
</body>
</html>
`;
}

function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
