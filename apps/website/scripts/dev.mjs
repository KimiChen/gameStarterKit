import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};
const requestedPort = Number(process.env.PORT || 3000);

function serveFile(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = resolve(join(root, relative));
  const publicFile = resolve(join(root, "public", relative));
  const isInsideRoot = file.startsWith(root + "/") || file === root;
  const isInsidePublic = publicFile.startsWith(join(root, "public") + "/") || publicFile === join(root, "public");
  if (!isInsideRoot || !isInsidePublic) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  access(file)
    .catch(() => access(publicFile).then(() => publicFile))
    .then((resolvedFile) => {
      const servedFile = typeof resolvedFile === "string" ? resolvedFile : file;
      response.writeHead(200, {
        "Content-Type": mime[extname(servedFile)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(servedFile).pipe(response);
    })
    .catch(() => {
      response.writeHead(404);
      response.end("Not found");
    });
}

function listen(port) {
  const server = createServer(serveFile);
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      server.close(() => listen(port + 1));
      return;
    }
    throw error;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log("website preview: http://127.0.0.1:" + port);
  });
}

listen(Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : 3000);
