import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [html, css, script, packageJson] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "style.css"), "utf8"),
  readFile(resolve(root, "script.js"), "utf8"),
  readFile(resolve(root, "package.json"), "utf8"),
]);

const errors = [];
if (!html.includes('rel="stylesheet"') || !html.includes('src="script.js"')) {
  errors.push("index.html 必须引用 style.css 与 script.js");
}
if (!css.includes("@layer wsk") || !css.includes("prefers-reduced-motion")) {
  errors.push("style.css 缺少 Web Standard Kit 的基础层或动效降级");
}
if (!script.includes("localStorage") || !script.includes("history.replaceState")) {
  errors.push("script.js 缺少主题持久化或锚点导航");
}
if (/\b(next|react|vinext)\b/i.test(packageJson)) {
  errors.push("package.json 不能残留旧 React/Next/Vinext 架构");
}
if (html.includes("__VINEXT") || html.includes("react-loading-skeleton")) {
  errors.push("静态站源码不能残留旧运行时");
}
if (errors.length) throw new Error(errors.join("\n"));
console.log("lint: ok");
