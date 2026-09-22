/** SC1-B7 real Creator fixture driver. No Library/temp/author assets are copied to the clean host. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { packPlugin } from "../../apps/server/tools/plugin/pack";
import { installPlugin } from "../../apps/server/tools/plugin/install";
import { uninstallPlugin } from "../../apps/server/tools/plugin/uninstall";
import { checkInstalledPlugins } from "../../apps/server/tools/plugin/check";
import { readInstalledLock, sha256 } from "../../apps/server/tools/plugin/lock";
import { assertAssetReferences, readAssetFiles, CREATOR_BUILTINS } from "../../apps/server/tools/plugin/assetReferences";
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [command, output] = process.argv.slice(2);
if (!output || !["prepare", "install", "uninstall-neighbour", "check", "job"].includes(command)) throw new Error("Usage: node --import tsx tools/art3d/bundle-fixture.ts prepare|install|uninstall-neighbour|check|job <output-directory> [job-target id operations...]");
const base = path.resolve(output);
const author = path.join(base, "author");
const target = path.join(base, "clean");
const write = (file: string, data: string | Buffer): void => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const json = (file: string, value: unknown): void => write(file, JSON.stringify(value, null, 2) + "\n");
function scaffold(root: string, name: string): void {
  const project = path.join(root, "apps/Cocos");
  fs.mkdirSync(path.join(project, "assets"), { recursive: true });
  json(path.join(project, "package.json"), { name: "sc1-b7-" + name, uuid: randomUUID(), creator: { version: "3.8.8" } });
  fs.cpSync(path.join(repository, "apps/Cocos/settings"), path.join(project, "settings"), { recursive: true, filter: file => !file.endsWith("lightmap.json") });
  const probe = path.join(project, "extensions/bundle-probe");
  fs.cpSync(path.join(repository, "tools/art3d/bundle-probe"), probe, { recursive: true });
  const probeOut = path.join(base, name + "-probe"); fs.mkdirSync(probeOut, { recursive: true });
  json(path.join(probe, "local-config.json"), { project, output: probeOut });
}
if (command === "prepare") {
  if (fs.existsSync(author)) throw new Error("Author project already exists; use a new output directory");
  scaffold(author, "author");
  for (const id of ["bundleFixture", "bundleFixtureExtra"]) {
    json(path.join(author, `apps/kits/${id}/kit.json`), { schemaVersion: 1, id, version: "1.0.0", api: { content: { version: 1, minSupported: 1 } }, modes: [], domains: [], sql: { files: [], tables: [] }, entry: `apps/client/src/kits/${id}/index.ts` });
    for (const prefix of ["apps/client/src", "apps/Cocos/assets/src"]) write(path.join(author, `${prefix}/kits/${id}/index.ts`), "export {};\n");
  }
  const bundles = path.join(author, "apps/Cocos/assets/bundles");
  for (const name of ["kit-bundleFixture", "kit-bundleFixture-detail", "kit-bundleFixtureExtra"]) fs.mkdirSync(path.join(bundles, name, "3d"), { recursive: true });
  json(path.join(bundles, "kit-bundleFixtureExtra/3d/data.json"), {});
  const greybox = path.join(repository, "apps/Cocos/assets/resources/stage3d");
  fs.copyFileSync(path.join(greybox, "T_Greybox_Checker_BC.png"), path.join(bundles, "kit-bundleFixture-detail/3d/T_Greybox_Checker_BC.png"));
  const source = fs.readFileSync(path.join(greybox, "greybox-cube.glb"));
  const oldLength = source.readUInt32LE(12);
  const gltf = JSON.parse(source.subarray(20, 20 + oldLength).toString());
  gltf.images[0].uri = "../../kit-bundleFixture-detail/3d/T_Greybox_Checker_BC.png";
  const encoded = Buffer.from(JSON.stringify(gltf));
  const chunk = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 32)]);
  const tail = source.subarray(20 + oldLength), header = Buffer.from(source.subarray(0, 20));
  header.writeUInt32LE(header.length + chunk.length + tail.length, 8); header.writeUInt32LE(chunk.length, 12);
  write(path.join(bundles, "kit-bundleFixture/3d/greybox-cube.glb"), Buffer.concat([header, chunk, tail]));
  console.log(`Open ${path.join(author, "apps/Cocos")} through Dashboard, then run job author <id> configure-bundles create-chain create-graph inspect-chain bundle-settings.`);
} else if (command === "job") {
  const [name, id, ...operations] = process.argv.slice(4);
  if (!["author", "clean"].includes(name) || !/^[a-zA-Z0-9_-]+$/u.test(id || "") || !operations.length) throw new Error("job needs author|clean, a unique id and bounded operations");
  const directory = path.join(base, name + "-probe");
  const ready = JSON.parse(fs.readFileSync(path.join(directory, "ready.json"), "utf8"));
  if (["job.json", `running-${id}.json`, `result-${id}.json`, `error-${id}.json`].some(file => fs.existsSync(path.join(directory, file)))) throw new Error("Pending or previously used job id");
  json(path.join(directory, "job.tmp"), { id, project: ready.project, steps: operations.map(op => ({ op })) });
  fs.renameSync(path.join(directory, "job.tmp"), path.join(directory, "job.json"));
} else if (command === "install") {
  if (fs.existsSync(target)) throw new Error("Clean target already exists; do not reuse its Library");
  const packed = ["bundleFixture", "bundleFixtureExtra"].map(id => packPlugin({ root: author, id, outFile: path.join(base, id + ".zip") }));
  scaffold(target, "clean");
  for (const name of ["scene.scene", "scene.scene.meta"]) fs.copyFileSync(path.join(author, "apps/Cocos/assets", name), path.join(target, "apps/Cocos/assets", name));
  const installed = packed.map(pkg => installPlugin({ root: target, source: pkg.output, git: false, postinstall: false }));
  json(path.join(base, "clean-install.json"), { noLibrary: !fs.existsSync(path.join(target, "apps/Cocos/library")), noNodeModules: !fs.existsSync(path.join(target, "node_modules")), packed, installed, check: checkInstalledPlugins(target) });
  console.log(`Close the author editor and move ${author} aside before opening ${path.join(target, "apps/Cocos")} in Dashboard.`);
} else {
  const uninstall = command === "uninstall-neighbour" ? uninstallPlugin({ root: target, id: "bundleFixtureExtra", git: false, postinstall: false }) : undefined;
  const lock = readInstalledLock(target, "bundleFixture"); if (!lock) throw new Error("Fixture not installed");
  const result = { uninstall, check: checkInstalledPlugins(target), closure: assertAssetReferences(readAssetFiles(target, lock.entries.map(entry => entry.path))), files: lock.entries.map(entry => ({ path: entry.path, sha256: sha256(fs.readFileSync(path.join(target, entry.path))) })), engineVersion: CREATOR_BUILTINS.version };
  if (!result.check.ok) throw new Error(JSON.stringify(result.check));
  json(path.join(base, command + ".json"), result);
  console.log(JSON.stringify(result.closure));
}
