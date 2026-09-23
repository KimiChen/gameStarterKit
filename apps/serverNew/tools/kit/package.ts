import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { readZip, writeZip } from "./zip";
import {
  generate,
  manifests,
  validateManifest,
  kitRoot,
  protocolRoot,
} from "./generate";
import {
  assertNativeHostCapabilities,
  nativeRequirementsPath,
} from "./native-host";
import {
  beginNativeMutation,
  nativeDataPath,
  parseNativeData,
} from "./native-lifecycle";

const hash = (bytes: Buffer) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
export const lockPath = (id: string) => `apps/serverNew/kit-locks/${id}.json`;
function safe(root: string, file: string): string {
  if (
    file.includes("\\") ||
    path.isAbsolute(file) ||
    file.split("/").some((x) => !x || x === "." || x === "..") ||
    file.startsWith("apps/server/")
  )
    throw Error("Forbidden native path: " + file);
  let parent = root;
  for (const part of file.split("/")) {
    parent = path.join(parent, part);
    if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
      throw Error("Symlink path rejected: " + file);
  }
  return path.join(root, file);
}
function owned(m: any, file: string): boolean {
  const dirs = [
    `${kitRoot}/${m.id}`,
    `apps/serverNew/server/src/modules/${m.id}`,
    `apps/serverNew/server/test/modules/${m.id}`,
    `apps/shared/src/kits/${m.id}`,
    `apps/client/src/kits/${m.id}`,
  ];
  return (
    dirs.some((d) => file.startsWith(d + "/")) ||
    m.domains.some((d: string) => file === `${protocolRoot}/domains/${d}.ts`)
  );
}
export function walk(root: string, dir: string): string[] {
  const full = safe(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => {
      const child = dir + "/" + e.name;
      safe(root, child);
      if (e.isSymbolicLink()) throw Error("Symlink rejected");
      return e.isDirectory() ? walk(root, child) : [child];
    });
}
export function legacySnapshot(root: string): string {
  const names = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "apps/server",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  return hash(
    Buffer.from(
      names
        .map(
          (f) =>
            f +
            ":" +
            (fs.existsSync(path.join(root, f))
              ? hash(
                  fs.lstatSync(path.join(root, f)).isSymbolicLink()
                    ? Buffer.from(fs.readlinkSync(path.join(root, f)))
                    : fs.readFileSync(path.join(root, f)),
                )
              : "missing"),
        )
        .join("\n"),
    ),
  );
}
function readManifest(root: string, id: string): any {
  const m = manifests(root).find((m) => m.id === id);
  if (!m) throw Error("Unknown native kit " + id);
  return m;
}
function collect(root: string, m: any): Map<string, Buffer> {
  const all = [
    ...walk(root, `${kitRoot}/${m.id}`),
    ...walk(root, `apps/serverNew/server/src/modules/${m.id}`),
    ...walk(root, `apps/serverNew/server/test/modules/${m.id}`),
    ...walk(root, `apps/shared/src/kits/${m.id}`),
    ...walk(root, `apps/client/src/kits/${m.id}`),
    ...m.domains.map((d: string) => `${protocolRoot}/domains/${d}.ts`),
  ];
  return new Map(all.map((f) => [f, fs.readFileSync(safe(root, f))]));
}
interface Package {
  manifest: any;
  files: Map<string, Buffer>;
  entries: { path: string; sha256: string }[];
}
export function pack(root: string, id: string, out: string): void {
  const manifest = readManifest(root, id);
  const files = collect(root, manifest);
  const entries = [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, b]) => ({ path: p, sha256: hash(b) }));
  const bytes = writeZip([
    {
      path: "native-kit.json",
      data: Buffer.from(JSON.stringify({ format: 1, manifest, entries })),
    },
    ...[...files].map(([p, data]) => ({ path: p, data })),
  ]);
  readPackage(bytes, root);
  const resolved = path.resolve(out);
  let ancestor = resolved;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const real = path.join(
    fs.realpathSync(ancestor),
    path.relative(ancestor, resolved),
  );
  const legacy = path.join(fs.realpathSync(root), "apps/server");
  if (real === legacy || real.startsWith(legacy + path.sep))
    throw Error("Legacy directory is read-only");
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, bytes);
  console.log(
    JSON.stringify({
      id,
      version: manifest.version,
      files: files.size,
      sha256: hash(bytes),
      out: path.resolve(out),
    }),
  );
}
export function readPackage(bytes: Buffer, root: string): Package {
  const archive = new Map(readZip(bytes).map((e) => [e.path, e.data]));
  const meta = archive.get("native-kit.json");
  if (!meta)
    throw Error(
      "Not a native kit package (legacy packages need explicit migration)",
    );
  const envelope = JSON.parse(meta.toString());
  const m = envelope.manifest;
  const entries = envelope.entries;
  if (
    envelope.format !== 1 ||
    !m ||
    !/^[a-z][a-zA-Z0-9]*$/.test(m.id) ||
    m.serverRuntime !== "serverNew" ||
    !/^\d+\.\d+\.\d+$/.test(m.version) ||
    !Array.isArray(m.domains) ||
    !Array.isArray(entries)
  )
    throw Error("Invalid native package manifest");
  validateManifest(m, m.id);
  archive.delete("native-kit.json");
  if (
    entries.length !== archive.size ||
    new Set(entries.map((e: any) => e.path)).size !== entries.length
  )
    throw Error("Package entries mismatch");
  for (const e of entries) {
    safe(root, e.path);
    if (!owned(m, e.path)) throw Error("Package ownership violation " + e.path);
    const b = archive.get(e.path);
    if (!b || hash(b) !== e.sha256)
      throw Error("Package integrity mismatch " + e.path);
  }
  const manifestBytes = archive.get(`${kitRoot}/${m.id}/kit.json`);
  if (
    !manifestBytes ||
    JSON.stringify(JSON.parse(manifestBytes.toString())) !== JSON.stringify(m)
  )
    throw Error("Manifest bytes mismatch");
  for (const f of [
    m.entry,
    ...m.views,
    ...m.domains.map((d: string) => `${protocolRoot}/domains/${d}.ts`),
    nativeRequirementsPath(m.id),
    nativeDataPath(m.id),
  ])
    if (!archive.has(f)) throw Error("Required file missing " + f);
  parseNativeData(m.id, archive.get(nativeDataPath(m.id))!);
  assertNativeHostCapabilities(root, archive.get(nativeRequirementsPath(m.id)));
  return { manifest: m, files: archive, entries };
}
function run(root: string, command: string, args: string[], cwd = root) {
  const r = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, SYNC_FORCE: "1" },
  });
  if (r.error || r.status !== 0)
    throw Error("Native postinstall failed: " + command + " " + args.join(" "));
}
export function postinstall(root: string): void {
  generate(root);
  run(root, process.execPath, ["scripts/sync-shared.mjs"]);
  run(root, process.execPath, ["scripts/sync-client.mjs"]);
  run(root, "pnpm", ["generate"], path.join(root, "apps/serverNew/server"));
}
function version(v: string): number[] {
  return v.split(".").map(Number);
}
export function install(root: string, file: string): void {
  const pkg = readPackage(fs.readFileSync(file), root);
  const { manifest: m, files } = pkg;
  const lp = lockPath(m.id);
  const dest = safe(root, lp);
  const previous = fs.existsSync(dest)
    ? JSON.parse(fs.readFileSync(dest, "utf8"))
    : null;
  if (previous) {
    const a = version(m.version),
      b = version(previous.manifest.version);
    const cmp = a.findIndex((v, i) => v !== b[i]);
    if (cmp >= 0 && a[cmp] < b[cmp]) throw Error("Downgrade refused");
    if (
      cmp === -1 &&
      JSON.stringify(previous.entries) !== JSON.stringify(pkg.entries)
    )
      throw Error("Same version has different bytes; increment kit version");
  }
  for (const [f, b] of files) {
    const p = safe(root, f);
    const prior = previous?.entries.find((e: any) => e.path === f);
    if (
      fs.existsSync(p) &&
      (!prior || hash(fs.readFileSync(p)) !== prior.sha256)
    )
      throw Error("Unowned or modified destination " + f);
  }
  for (const e of previous?.entries ?? []) {
    if (
      fs.existsSync(safe(root, e.path)) &&
      hash(fs.readFileSync(safe(root, e.path))) !== e.sha256
    )
      throw Error("Installed file modified " + e.path);
  }
  const finish = beginNativeMutation(
    root,
    m.id,
    files.get(nativeDataPath(m.id)),
  );
  mutate(
    root,
    new Set([
      ...files.keys(),
      ...(previous?.entries ?? []).map((e: any) => e.path),
      lp,
    ]),
    () => {
      for (const e of previous?.entries ?? [])
        if (!files.has(e.path) && fs.existsSync(safe(root, e.path)))
          fs.unlinkSync(safe(root, e.path));
      for (const [f, b] of files) {
        const p = safe(root, f);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, b);
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(
        dest,
        JSON.stringify(
          { format: 1, manifest: m, entries: pkg.entries },
          null,
          2,
        ) + "\n",
      );
      postinstall(root);
      finish?.();
    },
  );
  console.log(`installed native kit ${m.id}@${m.version}`);
}
export function uninstall(root: string, id: string): void {
  const lp = lockPath(id),
    file = safe(root, lp);
  if (!fs.existsSync(file)) throw Error("No native install lock");
  const lock = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const e of lock.entries)
    if (
      !fs.existsSync(safe(root, e.path)) ||
      hash(fs.readFileSync(safe(root, e.path))) !== e.sha256
    )
      throw Error("Installed file modified " + e.path);
  beginNativeMutation(
    root,
    id,
    fs.readFileSync(safe(root, nativeDataPath(id))),
  );
  mutate(root, new Set([...lock.entries.map((e: any) => e.path), lp]), () => {
    for (const e of lock.entries) fs.unlinkSync(safe(root, e.path));
    fs.unlinkSync(file);
    // Empty manifest directories must disappear before discovery; no foreign files are removed.
    const prune = (dir: string) => {
      const p = safe(root, dir);
      if (!fs.existsSync(p)) return;
      for (const e of fs.readdirSync(p, { withFileTypes: true }))
        if (e.isDirectory()) prune(dir + "/" + e.name);
      if (fs.readdirSync(p).length === 0) fs.rmdirSync(p);
    };
    for (const d of [
      `${kitRoot}/${id}`,
      `apps/serverNew/server/src/modules/${id}`,
      `apps/serverNew/server/test/modules/${id}`,
      `apps/client/src/kits/${id}`,
      `apps/shared/src/kits/${id}`,
    ])
      prune(d);
    postinstall(root);
  });
  console.log(`uninstalled ${id}; data retained and detached`);
}
function mutate(root: string, files: Set<string>, apply: () => void): void {
  // Journal only the native generation/mirror ownership. No legacy server path may enter rollback.
  const dirs = [
    "apps/serverNew/server/generated",
    "apps/shared/src/native",
    "apps/client/src/shared",
    "apps/Cocos/assets/src",
  ];
  for (const dir of dirs) for (const file of walk(root, dir)) files.add(file);
  files.add("apps/client/src/native/generated/kits.ts");
  const createdParents = new Set<string>();
  for (const f of files) {
    let p = path.dirname(safe(root, f));
    while (p !== root && !fs.existsSync(p)) {
      createdParents.add(p);
      p = path.dirname(p);
    }
  }
  const before = new Map(
    [...files].map((f) => [
      f,
      fs.existsSync(safe(root, f)) ? fs.readFileSync(safe(root, f)) : null,
    ]),
  );
  try {
    apply();
  } catch (error) {
    for (const dir of dirs)
      for (const f of walk(root, dir))
        if (!before.has(f)) fs.unlinkSync(safe(root, f));
    for (const [f, b] of before) {
      const p = safe(root, f);
      if (b === null) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } else {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, b);
      }
    }
    for (const p of [...createdParents].sort((a, b) => b.length - a.length))
      if (fs.existsSync(p) && fs.readdirSync(p).length === 0) fs.rmdirSync(p);
    throw error;
  }
}
export function check(root: string, id?: string): void {
  generate(root, true);
  if (id && !manifests(root).some((m) => m.id === id))
    throw Error("Unknown native kit " + id);
  for (const m of manifests(root).filter((m) => !id || m.id === id)) {
    assertNativeHostCapabilities(
      root,
      fs.readFileSync(safe(root, nativeRequirementsPath(m.id))),
    );
    parseNativeData(m.id, fs.readFileSync(safe(root, nativeDataPath(m.id))));
    const lp = safe(root, lockPath(m.id));
    if (fs.existsSync(lp)) {
      const l = JSON.parse(fs.readFileSync(lp, "utf8"));
      for (const e of l.entries)
        if (
          !fs.existsSync(safe(root, e.path)) ||
          hash(fs.readFileSync(safe(root, e.path))) !== e.sha256
        )
          throw Error("Installed kit drift " + e.path);
    }
  }
  console.log("native kit contracts, capabilities and installed files match");
}
