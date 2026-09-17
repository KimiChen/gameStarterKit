import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { loadScreenCatalog } from "../uniflex-screens.mjs";
import { loadMergedScreens, resolvePreviewGroups } from "./catalog.mjs";
import { renderPreviewHtml } from "./preview-html.mjs";

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".xml": "application/octet-stream",
    ".png": "image/png",
    ".json": "application/json",
    ".ttf": "font/ttf",
};

export async function servePreview({
    out, root, port = 0, host = "127.0.0.1", merge = [], catalog = false,
} = {}) {
    const groups = resolvePreviewGroups({ root, out, merge, catalog });
    if (!groups.length) {
        throw new Error("Missing FairyGUI preview; run ui:export-fgui or pass --catalog.");
    }
    const screenCatalog = await loadScreenCatalog(root);
    const screens = loadMergedScreens(groups, screenCatalog);
    const multi = groups.length > 1;
    const byName = new Map(groups.map((group) => [group.name, group]));
    const assets = groups[0].previewDir;
    const html = renderPreviewHtml({
        screens,
        font: groups.some((group) => existsSync(join(group.previewDir, "regular.ttf"))),
    });

    const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", `http://${host}`);
        const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        if (relative === "index.html") {
            response.writeHead(200, { "content-type": TYPES[".html"] });
            response.end(html);
            return;
        }
        const file = resolvePreviewFile(relative, { multi, assets, byName });
        if (!file || !existsSync(file) || statSync(file).isDirectory()) {
            response.writeHead(404);
            response.end("not found");
            return;
        }
        response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
        createReadStream(file).pipe(response);
    });
    await new Promise((resolvePromise) => server.listen(port, host, resolvePromise));
    const address = server.address();
    const actualPort = typeof address === "object" ? address.port : port;
    return {
        host,
        port: actualPort,
        url: `http://${host}:${actualPort}/`,
        screens,
        groups,
        close: () => new Promise((resolvePromise, reject) => {
            server.close((error) => (error ? reject(error) : resolvePromise()));
        }),
    };
}

export function resolvePreviewFile(relative, { multi, assets, byName }) {
    if (!relative || relative.includes("\0") || relative.split("/").includes("..")) return null;
    if (!multi) {
        const file = resolve(assets, relative);
        return file.startsWith(assets) ? file : null;
    }
    const slash = relative.indexOf("/");
    if (slash <= 0) {
        const file = resolve(assets, relative);
        return file.startsWith(assets) ? file : null;
    }
    const group = byName.get(relative.slice(0, slash));
    if (!group) return null;
    const file = resolve(group.previewDir, relative.slice(slash + 1));
    return file.startsWith(group.previewDir) ? file : null;
}
