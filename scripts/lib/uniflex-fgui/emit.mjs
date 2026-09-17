import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { adaptationJson, commonJson, componentXml, packageXml, projectXml, publishJson } from "./xml.mjs";
import { publishPackage } from "./publish-dom.mjs";
import { buildProjectIR } from "./ir.mjs";
import { loadImageCatalog } from "./resources.mjs";
import { extractFairyguiDom } from "./vendor.mjs";
import { PREVIEW_FONT_CANDIDATES, PREVIEW_FONT_FAMILY } from "./constants.mjs";

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
    const font = previewFontPath(root);
    if (font) await copyBinary(font, join(preview, "regular.ttf"));
    await writeFile(join(preview, "index.html"), previewHtml(ir, { font: Boolean(font) }));
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

function previewHtml(ir, { font } = {}) {
    const page = ir.packages[1];
    const common = ir.packages[0];
    const component = page.components.find((item) => item.exported) ?? page.components.at(-1);
    const width = ir.canvas.width;
    const height = ir.canvas.height;
    const face = PREVIEW_FONT_FAMILY;
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>UniFlex FairyGUI preview (candidate) — ${escapeHtml(component.name)}</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #101318; }
    #ui { position: absolute; left: 50%; top: 50%; width: ${width}px; height: ${height}px; transform-origin: center; overflow: hidden; }
    .fgui-text { padding: 0 !important; paint-order: stroke fill; }
    ${font ? `@font-face { font-family: ${face}; src: url("./regular.ttf") format("truetype"); font-weight: 400; font-style: normal; }` : ""}
  </style>
</head>
<body>
  <main id="ui"></main>
  <script src="./fairygui.js"></script>
  <script type="module">
    const fgui = window.fgui;
    if (!fgui) throw new Error("fairygui-dom failed to load");
    const canvas = { width: ${width}, height: ${height} };
    const host = document.getElementById("ui");
    let groot;
    const resize = () => {
      const scale = Math.min(innerWidth / canvas.width, innerHeight / canvas.height);
      host.style.transform = \`translate(-50%, -50%) scale(\${scale})\`;
      groot?.setSize(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    ${font ? `fgui.UIConfig.defaultFont = "${face}";
    await document.fonts.load("40px ${face}");
    await document.fonts.ready;` : ""}
    await fgui.UIPackage.loadPackage("./${common.name}");
    await fgui.UIPackage.loadPackage("./${page.name}");
    const view = fgui.UIPackage.createObject("${page.name}", "${component.name}");
    if (!view) throw new Error("createObject failed");
    view.setSize(canvas.width, canvas.height);
    groot = fgui.GRoot.inst;
    groot.addChild(view);
    host.appendChild(groot.element);
    groot.setSize(canvas.width, canvas.height);
    const relayout = (obj) => {
      obj?.element?.applyText?.();
      if (obj?.numChildren) for (let i = 0; i < obj.numChildren; i++) relayout(obj.getChildAt(i));
    };
    relayout(view);
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
