import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { BUNDLES, classifyPath, deriveOwnership, type PackageClass, type PluginIdentity } from "../tools/plugin/ownership";
import { assertAssetReferences, collectAssetReferences, createAssetIndex, CREATOR_BUILTINS, normalizeAssetUuid, readAssetFiles } from "../tools/plugin/assetReferences";
import { packPlugin } from "../tools/plugin/pack";
import { readPackage, validatePackage } from "../tools/plugin/package";
import { installPlugin, reinstallFromTree, isSharedNamespace, ownershipConflicts } from "../tools/plugin/install";
import { uninstallPlugin } from "../tools/plugin/uninstall";
import { checkInstalledPlugins } from "../tools/plugin/check";
import { planChanged } from "../tools/plugin/changed";
import { readInstalledLock, sha256 } from "../tools/plugin/lock";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const uuid = (key: string): string => { const h = sha256(key); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const bytes = (value: unknown): Buffer => Buffer.from(JSON.stringify(value));
function identity(cls: PackageClass, id = "foo"): PluginIdentity {
  return { class: cls, id, kinds: ["client"], constantName: null, modes: [], domains: [], fguiPackages: [], clientDirs: [] };
}
function write(root: string, relative: string, value: Buffer): void {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true }); fs.writeFileSync(path.join(root, relative), value);
}
function withRoots(run: (author: string, target: string, out: string) => void): void {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-bundles-"));
  try { for (const dir of ["author", "target", "out"]) fs.mkdirSync(path.join(base, dir)); run(...["author", "target", "out"].map(dir => path.join(base, dir)) as [string, string, string]); }
  finally { fs.rmSync(base, { recursive: true, force: true }); }
}
function fixture(cls: PackageClass = "plugin", id = "foo"): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const root = `${BUNDLES}/${cls}-${id}`;
  const detail = `${root}-detail`;
  const namespace = cls === "kit" ? "kits" : "plugins";
  const entry = `apps/client/src/${namespace}/${id}/index.ts`;
  const manifest = cls === "kit"
    ? { schemaVersion: 1, id, version: "1.0.0", api: { content: { version: 1, minSupported: 1 } }, modes: [], domains: [], sql: { files: [], tables: [] }, entry }
    : { schemaVersion: 2, id, version: "1.0.0", entry };
  files.set(`apps/${namespace}/${id}/${cls}.json`, bytes(manifest));
  files.set(entry, Buffer.from("export {};\n"));
  const meta = (target: string, importer: string, subMetas = {}, userData = {}): void => {
    files.set(target + ".meta", bytes({ uuid: uuid(target), importer, subMetas, userData }));
  };
  const mirror = entry.replace("apps/client/src/", "apps/Cocos/assets/src/");
  files.set(mirror, files.get(entry) as Buffer); meta(mirror, "typescript");
  meta(path.posix.dirname(mirror), "directory");
  for (const dir of [root, detail]) {
    meta(dir, "directory", {}, { isBundle: true, bundleName: path.posix.basename(dir), bundleConfigID: "package3d" });
    meta(dir + "/3d", "directory");
  }
  const texture = detail + "/3d/T_Test_BC.png";
  const model = root + "/3d/model.glb";
  const material = detail + "/3d/M_Test.mtl";
  const prefab = root + "/3d/P_Test.prefab";
  files.set(texture, Buffer.from("test image"));
  meta(texture, "image", { "6c48a": { id: "6c48a", uuid: uuid(texture) + "@6c48a", importer: "texture", userData: { isUuid: true, imageUuidOrDatabaseUri: uuid(texture) } } });
  files.set(model, Buffer.from("test model"));
  meta(model, "gltf", { abcde: { id: "abcde", uuid: uuid(model) + "@abcde", importer: "gltf-mesh", subMetas: {} } }, { assetFinder: { meshes: [uuid(model) + "@abcde"] } });
  files.set(material, bytes({ __type__: "cc.Material", _effectAsset: { __uuid__: CREATOR_BUILTINS.assets[0].uuid }, _props: [{ mainTexture: { __uuid__: uuid(texture) + "@6c48a" } }] })); meta(material, "material");
  files.set(prefab, bytes([{ __type__: "cc.Prefab", data: { __id__: 1 } }, { __type__: "cc.Node", mesh: { __uuid__: uuid(model) + "@abcde" }, material: { __uuid__: uuid(material) } }])); meta(prefab, "prefab");
  for (const [ext, importer] of [["anim", "animation-clip"], ["animgraph", "animation-graph"], ["animask", "animation-mask"]]) {
    const file = root + `/3d/test.${ext}`;
    files.set(file, bytes({ asset: { __uuid__: ext === "animgraph" ? uuid(root + "/3d/test.anim") : uuid(material) } })); meta(file, importer);
  }
  const data = `apps/Cocos/assets/resources/${namespace}/${id}/3d/data/info.json`;
  files.set(data, bytes({ version: 1 })); meta(data, "json");
  for (let dir = path.posix.dirname(data); dir.endsWith(id) || dir.includes(`/${id}/`); dir = path.posix.dirname(dir)) meta(dir, "directory");
  return files;
}
function save(root: string, files: ReadonlyMap<string, Buffer>): void { for (const [file, value] of files) write(root, file, value); }

for (const cls of ["plugin", "kit"] as const) {
  test(`${cls} bundle ownership has exact id/map/meta boundaries`, () => {
    const rules = deriveOwnership(identity(cls));
    for (const name of [`${cls}-foo`, `${cls}-foo-main`, `${cls}-foo-map2`]) {
      for (const suffix of [".meta", "/3d/P_Test.prefab", "/3d.meta"]) {
        assert.equal(classifyPath(`${BUNDLES}/${name}${suffix}`, rules, []).allowed, true);
        assert.equal(isSharedNamespace(`${BUNDLES}/${name}${suffix}`, "foo", cls, []), false);
      }
    }
    for (const name of [`${cls}-foobar`, `${cls}-foobar-map`, `${cls}-foo-`, `${cls}-foo-Map`, `${cls}-foo-a-b`, `${cls}-foo-1`, `${cls}-foo-map.meta.fake`, `${cls === "kit" ? "plugin" : "kit"}-foo`]) {
      assert.equal(classifyPath(`${BUNDLES}/${name}/3d/file`, rules, []).allowed, false, name);
      assert.equal(classifyPath(`${BUNDLES}/${name}.meta`, rules, []).allowed, false, name);
    }
    assert.equal(classifyPath(`${BUNDLES}.meta`, rules, []).allowed, false);
  });
  test(`${cls} pack → clean install → index → upgrade → uninstall preserves neighbour`, () => withRoots((author, target, out) => {
    save(author, fixture(cls)); save(author, fixture(cls, "foobar"));
    for (const id of ["foo", "foobar"]) {
      packPlugin({ root: author, id, outFile: path.join(out, id + ".zip") });
      installPlugin({ root: target, source: path.join(out, id + ".zip"), git: false, postinstall: false });
    }
    fs.rmSync(author, { recursive: true }); // No author files and never a Library directory.
    const fooLock = readInstalledLock(target, "foo")!;
    assert.ok(fooLock.entries.some(entry => entry.path === `${BUNDLES}/${cls}-foo.meta`));
    assert.ok(fooLock.entries.every(entry => !entry.path.includes(`${cls}-foobar`)));
    const files = readAssetFiles(target, fooLock.entries.map(entry => entry.path));
    assert.ok(assertAssetReferences(files).references >= 8);
    assert.equal(createAssetIndex(files).has(uuid(`${BUNDLES}/${cls}-foo/3d/model.glb`) + "@abcde"), true);
    assert.equal(checkInstalledPlugins(target).ok, true);
    assert.deepEqual(planChanged(target, [`${BUNDLES}/${cls}-foo-detail.meta`]).packages, ["foo"]);
    assert.deepEqual(planChanged(target, [`${BUNDLES}/${cls}-foobar/3d/P_Test.prefab`]).packages, ["foobar"]);
    assert.equal(planChanged(target, [`${BUNDLES}/${cls}-foo-/3d/unknown`]).fast, false);
    uninstallPlugin({ root: target, id: "foobar", git: false, postinstall: false });
    assert.equal(checkInstalledPlugins(target).ok, true);
    assert.doesNotThrow(() => assertAssetReferences(readAssetFiles(target, fooLock.entries.map(entry => entry.path))));
    const next = fixture(cls);
    const manifestPath = `apps/${cls === "kit" ? "kits" : "plugins"}/foo/${cls}.json`;
    const manifest = JSON.parse(next.get(manifestPath)!.toString()); manifest.version = "1.0.1"; next.set(manifestPath, bytes(manifest));
    const oldAnimask = `${BUNDLES}/${cls}-foo/3d/test.animask`; next.delete(oldAnimask); next.delete(oldAnimask + ".meta");
    fs.mkdirSync(author); save(author, next); packPlugin({ root: author, id: "foo", outFile: path.join(out, "next.zip") });
    installPlugin({ root: target, source: path.join(out, "next.zip"), git: false, postinstall: false });
    assert.equal(fs.existsSync(path.join(target, oldAnimask)), false);
    uninstallPlugin({ root: target, id: "foo", git: false, postinstall: false });
    assert.equal(fs.existsSync(path.join(target, `${BUNDLES}/${cls}-foo.meta`)), false);
    assert.equal(checkInstalledPlugins(target).ok, true);
  }));
}

test("UUID normalization uses engine 22-character encoding and preserves subasset suffix", () => {
  assert.equal(normalizeAssetUuid("fcmR3XADNLgJ1ByKhqcC5Z@abcde"), "fc991dd7-0033-4b80-9d41-c8a86a702e59@abcde");
  assert.equal(normalizeAssetUuid("fcmR3XADNLgJ1ByKhqcC5Z@b47c0@74afd"), "fc991dd7-0033-4b80-9d41-c8a86a702e59@b47c0@74afd");
  for (const invalid of ["missing", "fcmR3XADNLgJ1ByKhqcC5?", uuid("x") + "@", uuid("x") + "@abc@@def"]) assert.throws(() => normalizeAssetUuid(invalid), /非法/u);
  assert.equal(CREATOR_BUILTINS.version, "3.8.8");
  for (const asset of CREATOR_BUILTINS.assets) assert.match(asset.sha256, /^[0-9a-f]{64}$/u);
});

test("closure accepts cycles, internal __id__, database paths and explicit owner policy", () => {
  const files = fixture();
  const a = `${BUNDLES}/plugin-foo/3d/P_Test.prefab`, b = `${BUNDLES}/plugin-foo-detail/3d/M_Test.mtl`;
  files.set(a, bytes({ internal: { __id__: 912 }, next: { __uuid__: uuid(b) } }));
  files.set(b, bytes({ next: { __uuid__: uuid(a) } }));
  assert.doesNotThrow(() => assertAssetReferences(files, { ownerOf: () => "plugin:foo" }));
  assert.throws(() => assertAssetReferences(files, { ownerOf: file => file.includes("-detail/") ? "kit:other" : "plugin:foo" }), /跨包/u);
  const model = `${BUNDLES}/plugin-foo/3d/model.glb.meta`;
  const meta = JSON.parse(files.get(model)!.toString()); meta.userData.imageMetas = [{ uri: "db://assets/bundles/plugin-foo-detail/3d/T_Test_BC.png" }]; files.set(model, bytes(meta));
  assert.ok(collectAssetReferences(files).some(ref => ref.databasePath));
  assert.doesNotThrow(() => assertAssetReferences(files));
});

for (const mutation of ["missing-uuid", "compressed-uuid", "missing-submeta", "cross-package", "host", "builtin-subasset", "submeta-collision", "submeta-parent", "db-escape"] as const) {
  test(`pack/install reject ${mutation} before output; host cannot repair closure`, () => withRoots((author, target, out) => {
    const files = fixture();
    const model = `${BUNDLES}/plugin-foo/3d/model.glb`, prefab = `${BUNDLES}/plugin-foo/3d/P_Test.prefab`;
    if (mutation === "missing-submeta") { const meta = JSON.parse(files.get(model + ".meta")!.toString()); meta.subMetas = {}; files.set(model + ".meta", bytes(meta)); }
    else if (mutation === "submeta-collision" || mutation === "submeta-parent") {
      const meta = JSON.parse(files.get(model + ".meta")!.toString());
      if (mutation === "submeta-parent") meta.subMetas.abcde.uuid = uuid("another") + "@abcde";
      else meta.subMetas.other = { ...meta.subMetas.abcde };
      files.set(model + ".meta", bytes(meta));
    } else if (mutation === "db-escape") { const meta = JSON.parse(files.get(model + ".meta")!.toString()); meta.userData.uri = "db://assets/../other.png"; files.set(model + ".meta", bytes(meta)); }
    else {
      const reference = mutation === "compressed-uuid" ? "fcmR3XADNLgJ1ByKhqcC5Z@abcde" : mutation === "builtin-subasset" ? CREATOR_BUILTINS.assets[0].uuid + "@missing" : uuid(mutation);
      files.set(prefab, bytes({ asset: { __uuid__: reference } }));
      // Even a host resource with precisely this UUID must not repair the package.
      const host = "apps/Cocos/assets/resources/host.mtl"; write(target, host, bytes({})); write(target, host + ".meta", bytes({ uuid: uuid(mutation), importer: "material" }));
    }
    save(author, files);
    assert.throws(() => packPlugin({ root: author, id: "foo", outFile: path.join(out, "bad.zip") }), /悬空|子资产|非法|撞车/u);
    assert.equal(fs.existsSync(path.join(out, "bad.zip")), false);
    // Start from a valid package object, then mutate it as an independently supplied archive would.
    fs.rmSync(author, { recursive: true }); fs.mkdirSync(author); save(author, fixture());
    packPlugin({ root: author, id: "foo", outFile: path.join(out, "good.zip") });
    const pkg = readPackage(path.join(out, "good.zip"));
    assert.throws(() => validatePackage({ ...pkg, files }, target), /悬空|子资产|非法|撞车/u);
    assert.equal(fs.existsSync(path.join(target, "apps/plugins/foo")), false);
  }));
}

test("bundle root config, collisions, foreign paths and nested bundles fail closed", () => withRoots((author, target, out) => {
  for (const patch of [{ isBundle: false }, { bundleName: "plugin-foobar" }, { bundleConfigID: "default" }, { isRemote: true }]) {
    const files = fixture(); const file = `${BUNDLES}/plugin-foo.meta`; const meta = JSON.parse(files.get(file)!.toString()); Object.assign(meta.userData, patch); files.set(file, bytes(meta));
    save(author, files); assert.throws(() => packPlugin({ root: author, id: "foo", outFile: path.join(out, "bad.zip") }), /bundle|本地/u);
  }
  save(author, fixture()); packPlugin({ root: author, id: "foo", outFile: path.join(out, "good.zip") });
  const pkg = readPackage(path.join(out, "good.zip"));
  for (const relative of [`${BUNDLES}/plugin-foobar.meta`, `${BUNDLES}/plugin-foobar/3d/stolen.mtl`]) {
    assert.throws(() => validatePackage({ ...pkg, files: new Map([...pkg.files, [relative, bytes({})]]) }, target), /所有权/u);
  }
  const files = new Map(pkg.files), nested = `${BUNDLES}/plugin-foo/3d.meta`;
  const meta = JSON.parse(files.get(nested)!.toString()); meta.userData.isBundle = true; files.set(nested, bytes(meta));
  assert.throws(() => validatePackage({ ...pkg, files }, target), /嵌套/u);
  write(target, `${BUNDLES}/plugin-foobar.meta`, bytes({}));
  assert.deepEqual(ownershipConflicts(target, deriveOwnership(identity("plugin")), new Set()), []);
  write(target, `${BUNDLES}/plugin-foo-map.meta`, bytes({}));
  assert.deepEqual(ownershipConflicts(target, deriveOwnership(identity("plugin")), new Set()), [`${BUNDLES}/plugin-foo-map.meta`]);
}));

test("check catches reference drift even after a dishonest lock rewrite; from-tree uses the same gate", () => withRoots((author, target, out) => {
  save(author, fixture()); packPlugin({ root: author, id: "foo", outFile: path.join(out, "good.zip") });
  installPlugin({ root: target, source: path.join(out, "good.zip"), git: false, postinstall: false });
  write(target, `${BUNDLES}/plugin-foo/3d/P_Test.prefab`, bytes({ asset: { __uuid__: uuid("missing") } }));
  assert.ok(checkInstalledPlugins(target).plugins[0].problems.some(problem => problem.includes("悬空")));
  assert.throws(() => reinstallFromTree({ root: target, id: "foo", git: false, postinstall: false }), /悬空/u);
}));

test("host builder policy selects remote miniGame and local web/native without package settings writes", () => {
  const builder = JSON.parse(fs.readFileSync(path.join(repository, "apps/Cocos/settings/v2/packages/builder.json"), "utf8"));
  const configs = builder.bundleConfig.custom.package3d.configs;
  for (const platform of ["miniGame", "web", "native"]) assert.deepEqual(configs[platform].preferredOptions, { compressionType: "merge_dep", isRemote: platform === "miniGame" });
});

test("requires.kits does not authorize direct kit material references, even when installed", () => withRoots((author, target, out) => {
  const kitFiles = fixture("kit", "bar"); save(author, kitFiles);
  packPlugin({ root: author, id: "bar", outFile: path.join(out, "bar.zip") });
  installPlugin({ root: target, source: path.join(out, "bar.zip"), git: false, postinstall: false });
  const files = fixture();
  const manifest = "apps/plugins/foo/plugin.json", parsed = JSON.parse(files.get(manifest)!.toString());
  parsed.requires = { kits: { bar: { content: 1 } } }; files.set(manifest, bytes(parsed));
  files.set(`${BUNDLES}/plugin-foo/3d/P_Test.prefab`, bytes({ material: { __uuid__: uuid(`${BUNDLES}/kit-bar-detail/3d/M_Test.mtl`) } }));
  save(author, files);
  assert.throws(() => packPlugin({ root: author, id: "foo", outFile: path.join(out, "foo.zip") }), /悬空/u);
  assert.equal(fs.existsSync(path.join(target, "apps/plugins/foo")), false);
}));

test("compressed references resolve actual same-package subassets and exact external exceptions", () => {
  const files = fixture();
  const image = `${BUNDLES}/plugin-foo-detail/3d/T_Test_BC.png`, material = `${BUNDLES}/plugin-foo-detail/3d/M_Test.mtl`;
  const baseUuid = uuid(image), hex = baseUuid.replaceAll("-", "");
  const compressed = hex.slice(0, 2) + Buffer.from(hex.slice(2), "hex").toString("base64");
  files.set(material, bytes({ texture: { __uuid__: compressed + "@6c48a" } }));
  assert.doesNotThrow(() => assertAssetReferences(files));
  // The extension point cannot authorize a different UUID, path or metadata revision.
  const policy = { ownerOf: (file: string) => file === image || file === image + ".meta" ? "framework:registered" : "plugin:foo", allowedExternal: [{ uuid: baseUuid + "@6c48a", path: image, metaSha256: sha256(files.get(image + ".meta")!) }] };
  assert.doesNotThrow(() => assertAssetReferences(files, policy));
  assert.throws(() => assertAssetReferences(files, { ...policy, allowedExternal: [{ ...policy.allowedExternal[0], metaSha256: "0".repeat(64) }] }), /跨包/u);
});

test("serialized extension case cannot bypass the dependency gate", () => {
  const files = fixture();
  const lower = `${BUNDLES}/plugin-foo-detail/3d/M_Test.mtl`, upper = lower.replace(/mtl$/u, "MTL");
  files.set(upper, bytes({ asset: { __uuid__: uuid("missing") } })); files.set(upper + ".meta", files.get(lower + ".meta")!);
  files.delete(lower); files.delete(lower + ".meta");
  assert.throws(() => assertAssetReferences(files), /悬空/u);
});

test("bundle root names cannot alias another owner by case, including orphan metadata", () => withRoots((author, target, out) => {
  save(author, fixture("plugin", "foobar"));
  packPlugin({ root: author, id: "foobar", outFile: path.join(out, "foobar.zip") });
  const existing = `${BUNDLES}/plugin-fooBar.meta`;
  const original = fixture("plugin", "fooBar").get(existing)!;
  write(target, existing, original);
  assert.throws(() => installPlugin({ root: target, source: path.join(out, "foobar.zip"), git: false, postinstall: false }), /大小写冲突/u);
  assert.deepEqual(fs.readFileSync(path.join(target, existing)), original);
  assert.equal(fs.existsSync(path.join(target, "apps/plugins/foobar/plugin.json")), false);
}));
