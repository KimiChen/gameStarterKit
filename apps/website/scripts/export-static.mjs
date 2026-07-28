import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(process.argv[2] ?? "");

if (!process.argv[2]) {
  throw new Error("用法：node scripts/export-static.mjs <空输出目录>");
}

await mkdir(outputDir, { recursive: true });
if ((await readdir(outputDir)).length > 0) {
  throw new Error(`输出目录必须为空：${outputDir}`);
}

const workerUrl = new URL(
  `../dist/server/index.js?static-export=${Date.now()}`,
  import.meta.url,
);
const worker = (await import(workerUrl)).default;
const response = await worker.fetch(
  new Request("http://localhost/", {
    headers: { accept: "text/html" },
  }),
  {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  },
  {
    waitUntil() {},
    passThroughOnException() {},
  },
);

if (!response.ok) {
  throw new Error(`静态页面渲染失败：HTTP ${response.status}`);
}

let html = await response.text();
const stylesheetHref = html.match(
  /<link rel="stylesheet" href="(\/assets\/[^"]+\.css)"/,
)?.[1];

if (!stylesheetHref) {
  throw new Error("构建页面中没有找到样式表");
}

// 保留首屏主题脚本；移除 Vinext RSC 参数、导航器、流数据和所有 JS 预加载。
html = html
  .replace(/<link rel="modulepreload"[^>]*>/g, "")
  .replace(/<script>self\.__VINEXT[\s\S]*?<\/script>/g, "")
  .replace(/<script id="_R_">[\s\S]*?<\/script>/g, "")
  .replaceAll("http://localhost:3000/og.png", "/og.png")
  .replaceAll("http://localhost/og.png", "/og.png")
  .replace(
    "</body>",
    '<script src="/static-site.js" defer></script></body>',
  );

if (html.includes("__VINEXT") || html.includes("/.rsc")) {
  throw new Error("静态页面仍包含 Vinext RSC 运行时代码");
}

await mkdir(join(outputDir, "assets"));
await writeFile(join(outputDir, "index.html"), html);
await copyFile(
  join(projectRoot, "dist/client", stylesheetHref),
  join(outputDir, stylesheetHref),
);
await copyFile(
  join(projectRoot, "public/og.png"),
  join(outputDir, "og.png"),
);
await copyFile(
  join(projectRoot, "deploy/static-site.js"),
  join(outputDir, "static-site.js"),
);
await copyFile(
  join(projectRoot, "DEPLOY.md"),
  join(outputDir, "DEPLOY.md"),
);

await Promise.all([
  access(join(outputDir, "index.html")),
  access(join(outputDir, stylesheetHref)),
  access(join(outputDir, "static-site.js")),
  access(join(outputDir, "og.png")),
]);

console.log(outputDir);
