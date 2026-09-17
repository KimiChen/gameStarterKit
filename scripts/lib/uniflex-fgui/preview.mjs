import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".xml": "application/octet-stream",
    ".png": "image/png",
    ".json": "application/json",
};

export async function servePreview({ out, root, port = 0, host = "127.0.0.1" } = {}) {
    const dir = resolve(root, out, "preview");
    const index = join(dir, "index.html");
    if (!existsSync(index)) {
        throw new Error(`Missing ${index}; run ui:export-fgui first.`);
    }
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", `http://${host}`);
        const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const file = resolve(dir, relative);
        if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) {
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
        close: () => new Promise((resolvePromise, reject) => {
            server.close((error) => (error ? reject(error) : resolvePromise()));
        }),
    };
}
