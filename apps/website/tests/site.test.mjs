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

test("keeps setup, client, and server as three equal small cards", async () => {
  const [html, css] = await Promise.all([read("index.html"), read("style.css")]);
  assert.match(html, /<span class="wsk-project-count">9 张卡片<\/span>/);
  assert.equal((html.match(/<article class="wsk-project-card/g) || []).length, 9);
  assert.equal((html.match(/class="wsk-project-card wsk-card-small/g) || []).length, 3);
  assert.match(html, /wsk-card-icon" aria-hidden="true">06<\/span>/);
  assert.match(html, /wsk-card-icon" aria-hidden="true">07<\/span>/);
  assert.match(html, /wsk-card-icon" aria-hidden="true">08<\/span>/);
  assert.doesNotMatch(html, /平台边界/);
  assert.doesNotMatch(html, /wsk-card-icon" aria-hidden="true">09<\/span>/);
  assert.match(css, /\.wsk-card-small\s*\{\s*grid-column: span 4;\s*min-height: 13\.5rem;/);
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
  await access(join(root, "dist", "client", "favicon.ico"));
  await access(join(root, "dist", "client", "og.png"));
  await access(join(root, "dist", ".openai", "hosting.json"));
});

test("provides a scoped rsync deployment script", async () => {
  const script = await read("deploy.sh");
  assert.match(script, /rsync/);
  assert.match(script, /root@129\.211\.70\.96:\/www\/wwwroot\/gono\.games\//);
  assert.match(script, /id_rsa_nopassword/);
  assert.match(script, /index\.html/);
  assert.match(script, /style\.css/);
  assert.match(script, /script\.js/);
  assert.match(script, /favicon\.ico/);
  assert.match(script, /StrictHostKeyChecking=accept-new/);
  assert.doesNotMatch(script, /--delete/);
});

test("registers the favicon in the document head", async () => {
  const html = await read("index.html");
  assert.match(html, /<link rel="icon" href="favicon\.ico"[^>]*type="image\/x-icon"/);
});

test("shows the ICP filing link after the footer label", async () => {
  const html = await read("index.html");
  assert.match(html, /闽ICP备20003902号-8/);
  assert.match(html, /href="https:\/\/beian\.miit\.gov\.cn\/"/);
  assert.match(html, /class="wsk-icp-link"[^>]*target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
