import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => readFile(join(root, name), "utf8");

test("renders the wheel.do-style project card map", async () => {
  const html = await read("index.html");
  assert.match(html, /gameStarterKit — 游戏开发期基础框架/);
  assert.match(html, /wsk-project-grid/);
  assert.match(html, /wsk-card-featured/);
  assert.match(html, /wsk-card-tall/);
  assert.match(html, /wsk-card-banner/);
  assert.match(html, /wsk-card-wide/);
  assert.match(html, /ballMove \+ 技能结算/);
  assert.match(html, /MONOREPO ARCHITECTURE/);
  assert.match(html, /SOURCE AVAILABLE/);
  assert.match(html, /CORE SCOPE/);
  assert.match(html, /不构成部署、商业化/);
});

test("uses the Web Standard Kit foundations without the former app tree", async () => {
  const [css, script, packageJson] = await Promise.all([
    read("style.css"),
    read("script.js"),
    read("package.json"),
  ]);
  assert.match(css, /@layer wsk/);
  assert.match(css, /data-theme="dark"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(script, /data-copy-command/);
  assert.match(script, /history\.replaceState/);
  assert.doesNotMatch(packageJson, /next|react|vinext/i);
});

test("builds the static client and Worker entry", async () => {
  await access(join(root, "dist", "server", "index.js"));
  await access(join(root, "dist", "client", "index.html"));
  await access(join(root, "dist", "client", "style.css"));
  await access(join(root, "dist", "client", "script.js"));
  await access(join(root, "dist", ".openai", "hosting.json"));
});
