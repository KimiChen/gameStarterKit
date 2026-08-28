import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const client = join(dist, "client");
const server = join(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });

for (const file of ["index.html", "style.css", "script.js"]) {
  await cp(join(root, file), join(client, file));
}
await cp(join(root, "public", "og.png"), join(client, "og.png"));

await writeFile(
  join(client, "_headers"),
  "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n",
);

const workerSource = [
  "export default {",
  "  async fetch(request, env) {",
  '    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {',
  "      return env.ASSETS.fetch(request);",
  "    }",
  '    return new Response("Not found", { status: 404 });',
  "  },",
  "};",
  "",
].join("\n");
await writeFile(join(server, "index.js"), workerSource);

await writeFile(
  join(dist, "wrangler.json"),
  JSON.stringify(
    {
      name: "gono-game-starter-kit",
      main: "./server/index.js",
      compatibility_date: "2026-08-28",
      compatibility_flags: ["nodejs_compat"],
      assets: {
        directory: "./client",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
      },
    },
    null,
    2,
  ) + "\n",
);

await mkdir(join(dist, ".openai"), { recursive: true });
await cp(join(root, ".openai", "hosting.json"), join(dist, ".openai", "hosting.json"));
console.log("built static site:", dist);
