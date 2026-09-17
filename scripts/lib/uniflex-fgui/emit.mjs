import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { adaptationJson, commonJson, componentXml, packageXml, projectXml, publishJson } from "./xml.mjs";
import { publishPackage } from "./publish-dom.mjs";
import { buildCatalogIR } from "./ir.mjs";
import { loadImageCatalog } from "./resources.mjs";
import { extractFairyguiDom } from "./vendor.mjs";
import { COMMON_PACKAGE, PREVIEW_FONT_CANDIDATES, PREVIEW_FONT_FAMILY } from "./constants.mjs";

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
    const screens = (ir.screens ?? []).map((entry) => ({
        id: entry.id,
        packageName: entry.packageName,
        componentName: entry.componentName,
        width: entry.canvas.width,
        height: entry.canvas.height,
    }));
    const first = screens[0] ?? {
        id: ir.screen?.id,
        packageName: ir.packages.find((pkg) => pkg.name !== COMMON_PACKAGE)?.name,
        componentName: ir.screen?.componentName,
        width: ir.canvas.width,
        height: ir.canvas.height,
    };
    const face = PREVIEW_FONT_FAMILY;
    const options = screens.map((entry) =>
        `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.componentName)}</option>`).join("");
    const picker = screens.length > 1
        ? `<label id="picker" style="position:fixed;top:8px;left:8px;z-index:10;color:#e8edf2;font:14px/1.4 sans-serif">`
            + `<select id="screen">${options}</select></label>`
        : "";
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>UniFlex FairyGUI preview (candidate)</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #101318; }
    #ui { position: absolute; left: 50%; top: 50%; width: ${first.width}px; height: ${first.height}px; transform-origin: center; overflow: hidden; }
    .fgui-text { padding: 0 !important; paint-order: stroke fill; }
    ${font ? `@font-face { font-family: ${face}; src: url("./regular.ttf") format("truetype"); font-weight: 400; font-style: normal; }` : ""}
  </style>
</head>
<body>
  ${picker}
  <main id="ui"></main>
  <script src="./fairygui.js"></script>
  <script type="module">
    const fgui = window.fgui;
    if (!fgui) throw new Error("fairygui-dom failed to load");
    const screens = ${JSON.stringify(screens)};
    const host = document.getElementById("ui");
    const canvas = { width: ${first.width}, height: ${first.height} };
    const exportMode = new URLSearchParams(location.search).get("psd") === "1";
    let groot;
    let view;
    const resize = () => {
      if (exportMode) {
        host.style.left = "0";
        host.style.top = "0";
        host.style.transform = "none";
        host.style.transformOrigin = "top left";
      } else {
        const scale = Math.min(innerWidth / canvas.width, innerHeight / canvas.height);
        host.style.transform = \`translate(-50%, -50%) scale(\${scale})\`;
      }
      groot?.setSize(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    ${font ? `fgui.UIConfig.defaultFont = "${face}";
    await document.fonts.load("40px ${face}");
    await document.fonts.ready;` : ""}
    await fgui.UIPackage.loadPackage("./${COMMON_PACKAGE}");
    const loaded = new Set();
    const relayout = (obj) => {
      obj?.element?.applyText?.();
      if (obj?.numChildren) for (let i = 0; i < obj.numChildren; i++) relayout(obj.getChildAt(i));
    };
    const show = async (id) => {
      const screen = screens.find((entry) => entry.id === id) ?? screens[0];
      if (!screen) throw new Error("createObject failed");
      if (!loaded.has(screen.packageName)) {
        await fgui.UIPackage.loadPackage("./" + screen.packageName);
        loaded.add(screen.packageName);
      }
      canvas.width = screen.width;
      canvas.height = screen.height;
      host.style.width = screen.width + "px";
      host.style.height = screen.height + "px";
      if (view) {
        view.removeFromParent();
        view.dispose?.();
        view = null;
      }
      view = fgui.UIPackage.createObject(screen.packageName, screen.componentName);
      if (!view) throw new Error("createObject failed");
      view.setSize(screen.width, screen.height);
      groot = fgui.GRoot.inst;
      groot.addChild(view);
      if (groot.element.parentNode !== host) host.appendChild(groot.element);
      groot.setSize(screen.width, screen.height);
      relayout(view);
      resize();
      window.__FGUI_PREVIEW__ = { view, packageName: screen.packageName, componentName: screen.componentName, screens };
      document.documentElement.dataset.fguiReady = "true";
      document.documentElement.dataset.fguiScreen = screen.id;
    };
    const select = document.getElementById("screen");
    const initial = new URLSearchParams(location.search).get("screen") || screens[0]?.id;
    if (select) {
      select.value = initial;
      select.addEventListener("change", () => {
        const id = select.value;
        history.replaceState(null, "", "?screen=" + encodeURIComponent(id));
        show(id);
      });
    }
    await show(initial);
  </script>
</body>
</html>
`;
}

function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
