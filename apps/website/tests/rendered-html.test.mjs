import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
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
}

test("server-renders the gameStarterKit landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>gameStarterKit — 游戏开发期基础框架<\/title>/i);
  assert.match(html, /把第一天的工程纪律/);
  assert.match(html, /MONOREPO ARCHITECTURE/);
  assert.match(html, /REPLACEABLE DEMO/);
  assert.match(html, /id="panel-client"/);
  assert.match(html, /id="panel-shared"/);
  assert.match(html, /id="panel-server"/);
  assert.match(html, /id="panel-platform"/);
  assert.match(html, /Cocos Creator/);
  assert.match(html, /Colyseus/);
  assert.match(html, /SOURCE AVAILABLE/);
  assert.match(html, /服务端规则可追溯/);
  assert.match(html, /CORE SCOPE/);
  assert.match(html, /Unity 仍是研究占位/);
  assert.match(html, /MIT LICENSE/);
  assert.match(html, /THIRD_PARTY_NOTICES\.md/);
  assert.match(html, /不构成部署、商业化/);
  assert.doesNotMatch(html, /OPEN SOURCE|ALL GREEN/i);
  assert.doesNotMatch(html, /<dt>63<\/dt>/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps Web Standard Kit accessibility and theme foundations", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /wsk-skip-link/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /ArrowLeft/);
  assert.match(page, /history\.replaceState/);
  assert.match(page, /wsk-scroll-instant/);
  assert.match(layout, /gono-theme/);
  assert.match(layout, /prefers-color-scheme/);
  assert.match(css, /@layer wsk/);
  assert.match(css, /scroll-margin-top:\s*88px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("exports a standalone package without the Vinext RSC navigator", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "gono-static-test-"));
  const exporter = fileURLToPath(
    new URL("../scripts/export-static.mjs", import.meta.url),
  );
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));

  await execFileAsync(process.execPath, [exporter, outputDir], {
    cwd: projectRoot,
  });

  const [html, staticScript] = await Promise.all([
    readFile(join(outputDir, "index.html"), "utf8"),
    readFile(join(outputDir, "static-site.js"), "utf8"),
  ]);

  assert.doesNotMatch(html, /__VINEXT|\/\.rsc|rel="modulepreload"/);
  assert.doesNotMatch(html, /assets\/(?:index|page|framework)-[^"]+\.js/);
  assert.match(html, /src="\/static-site\.js"/);
  assert.match(staticScript, /stopImmediatePropagation/);
  assert.match(staticScript, /history\.replaceState/);
});
