import { access, cp, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] || "");

if (!process.argv[2]) {
  throw new Error("用法：npm run build && npm run export:static -- <空输出目录>");
}

await mkdir(output, { recursive: true });
if ((await readdir(output)).length > 0) {
  throw new Error("输出目录必须为空：" + output);
}

await cp(join(root, "dist", "client"), output, { recursive: true });
await access(join(output, "index.html"));
await access(join(output, "style.css"));
await access(join(output, "script.js"));
await access(join(output, "og.png"));
await access(join(output, "favicon.ico"));
console.log(output);
