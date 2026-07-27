import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "node_modules/@gono/webplatform-contract/src");
const targetDir = join(root, "apps/shared/src/generated/webplatform");
const check = process.argv.includes("--check");
const sourceFiles = ["index.ts", "paths.generated.ts", "types.generated.ts"];

function normalizeSource(name, source) {
  const banner = "// Generated from @gono/webplatform-contract. Do not edit.\n";
  const withoutExistingBanner = source
    .replace(/^\/\* eslint-disable \*\/\n/, "")
    .replace(/^\/\/ Generated from openapi\/openapi\.yaml\. Do not edit\.\n/, "");
  // The published package is Node ESM and uses explicit .js specifiers. The
  // mirrored source is compiled by Cocos/TypeScript with Bundler resolution.
  const publicOnly = name === "index.ts"
    // Runtime JSON schemas belong to the Node service package. The game shared
    // mirror intentionally consumes only paths and types, so Cocos never pulls
    // the server's validation objects into its bundle.
    ? withoutExistingBanner.replace(
        /^export \{ WebPlatformSchemas \} from "\.\/schemas\.generated\.js";\n/m,
        "",
      )
    : withoutExistingBanner;
  return banner + publicOnly.replace(/from "(\.\/[^"]+)\.js"/g, 'from "$1"');
}

async function expectedFiles() {
  const outputs = new Map();
  for (const name of sourceFiles) {
    const source = await readFile(join(sourceDir, name), "utf8");
    outputs.set(name, normalizeSource(name, source));
  }
  const hash = createHash("sha256");
  for (const [name, source] of [...outputs].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name);
    hash.update("\0");
    hash.update(source);
    hash.update("\0");
  }
  const pkg = JSON.parse(await readFile(join(root, "node_modules/@gono/webplatform-contract/package.json"), "utf8"));
  outputs.set("manifest.generated.ts",
    "// Generated from @gono/webplatform-contract. Do not edit.\n"
    + `export const WEBPLATFORM_CONTRACT_PACKAGE_VERSION = ${JSON.stringify(pkg.version)};\n`
    + `export const WEBPLATFORM_CONTRACT_SOURCE_SHA256 = ${JSON.stringify(hash.digest("hex"))};\n`);
  return outputs;
}

const expected = await expectedFiles();
if (check) {
  const actualNames = new Set(await readdir(targetDir).catch(() => []));
  const expectedNames = new Set(expected.keys());
  const extra = [...actualNames].filter((name) => !expectedNames.has(name));
  if (extra.length > 0) {
    throw new Error(`WebPlatform 契约生成目录存在孤儿文件: ${extra.join(", ")}`);
  }
  for (const [name, content] of expected) {
    const actual = await readFile(join(targetDir, name), "utf8").catch(() => "");
    if (actual !== content) {
      throw new Error(`WebPlatform 契约镜像漂移: ${name}`);
    }
  }
  console.log("[sync-webplatform-contract --check] ✔ 契约镜像一致");
} else {
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  for (const [name, content] of expected) {
    await writeFile(join(targetDir, name), content, "utf8");
  }
  console.log("[sync-webplatform-contract] ✔ 契约镜像已更新");
}
