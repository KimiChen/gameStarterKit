/** Creator 3.8.8 source-asset closure. Shared by pack/install/check and SC1-B5.
 * Never reads Library, imports or the author's other packages to repair a package.
 * Scanning every serialized object and every indexed source makes cyclic asset graphs safe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { BUNDLES, parsePackageBundleName } from "./ownership";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SERIALIZED = new Set([".prefab", ".mtl", ".anim", ".animgraph", ".animask", ".scene"]);
const ASSETS = "apps/Cocos/assets/";
export interface AssetLocation {
  readonly path: string;
  readonly metaPath: string;
  readonly importer: string;
}
export interface AssetReference {
  readonly source: string;
  readonly field: string;
  readonly uuid?: string;
  readonly databasePath?: string;
}
export interface ReferencePolicy {
  /** Required when validating multiple owners together. Null is an unregistered host asset. */
  readonly ownerOf?: (relative: string) => string | null;
  /** Framework-owned, exact cross-namespace exceptions. Never supplied by a package manifest. */
  readonly allowedExternal?: readonly { uuid: string; path: string; metaSha256: string }[];
}
interface Builtin {
  readonly uuid: string;
  readonly path: string;
  readonly metaPath: string;
  readonly sha256: string;
  readonly metaSha256: string;
}
export const CREATOR_BUILTINS: { version: string; assets: readonly Builtin[] } = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("./creator-builtins-3.8.8.json", import.meta.url)), "utf8"),
);
const builtinUuids = new Set(CREATOR_BUILTINS.assets.map((asset) => asset.uuid));
function fail(message: string): never { throw new Error(`[plugin assets] ${message}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function json(bytes: Buffer, label: string): unknown {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { return fail(`${label} 不是合法 Creator JSON`); }
}

/** Engine decode-uuid.ts: preserve the leading two hex digits, decode ten base64 pairs, keep @id. */
export function normalizeAssetUuid(raw: string): string {
  const parts = raw.split("@");
  // HDR cube faces have two suffixes: image@cube@face (actual 3.8.8 subMetas).
  if (parts.slice(1).some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))) fail(`非法子资产 UUID：${raw}`);
  let base = parts[0];
  if (/^[0-9a-f]{2}[A-Za-z0-9+/]{20}$/u.test(base)) {
    let hex = base.slice(0, 2);
    for (let i = 2; i < 22; i += 2) {
      const value = (BASE64.indexOf(base[i]) << 6) | BASE64.indexOf(base[i + 1]);
      hex += value.toString(16).padStart(3, "0");
    }
    base = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  if (!UUID.test(base)) fail(`非法资产 UUID：${raw}`);
  return [base, ...parts.slice(1)].join("@");
}

/** Index actual top-level and subMeta UUIDs, not inferred possible subasset ids. */
export function createAssetIndex(files: ReadonlyMap<string, Buffer>, options: { requireSources?: boolean } = {}): ReadonlyMap<string, AssetLocation> {
  const index = new Map<string, AssetLocation>();
  for (const [metaPath, bytes] of files) {
    if (!metaPath.startsWith(ASSETS) || !metaPath.endsWith(".meta")) continue;
    const source = metaPath.slice(0, -5);
    const parsed = json(bytes, metaPath);
    if (!object(parsed) || typeof parsed.uuid !== "string" || !UUID.test(parsed.uuid)) fail(`${metaPath} 缺少合法顶层 UUID`);
    const rootUuid = parsed.uuid;
    const visit = (meta: Record<string, unknown>, label: string, subId?: string, parentUuid = rootUuid): void => {
      if (typeof meta.uuid !== "string" || typeof meta.importer !== "string") fail(`${label} 缺少 uuid/importer`);
      const uuid = normalizeAssetUuid(meta.uuid);
      if (subId !== undefined && (uuid !== `${parentUuid}@${subId}` || meta.id !== subId)) fail(`${label} 子资产 id/UUID 与父资产不一致`);
      if (index.has(uuid)) fail(`UUID 撞车：${uuid}（${index.get(uuid)?.metaPath} 与 ${label}）`);
      if (builtinUuids.has(uuid)) fail(`${label} 冒用引擎内置 UUID ${uuid}`);
      if (options.requireSources !== false && !files.has(source) && meta.importer !== "directory") fail(`${metaPath} 缺少实际资产文件 ${source}`);
      index.set(uuid, { path: source, metaPath, importer: meta.importer });
      if (meta.subMetas === undefined) return;
      if (!object(meta.subMetas)) fail(`${label}.subMetas 非对象`);
      for (const [id, sub] of Object.entries(meta.subMetas)) {
        if (!object(sub)) fail(`${label}.subMetas.${id} 非对象`);
        visit(sub, `${label}.subMetas.${id}`, id, uuid);
      }
    };
    visit(parsed, metaPath);
  }
  return index;
}

function databasePath(raw: string, label: string): string {
  if (!raw.startsWith("db://assets/")) fail(`${label} 未登记数据库资源：${raw}`);
  const rest = raw.slice("db://assets/".length);
  if (rest.split("/").some((part) => !part || part === "." || part === "..") || /[\\%?#\u0000-\u001f]/u.test(rest)) fail(`${label} 非法数据库路径：${raw}`);
  return ASSETS + rest;
}

/** __id__ is an internal object index. Only __uuid__ and Creator meta dependency fields are assets. */
export function collectAssetReferences(files: ReadonlyMap<string, Buffer>): readonly AssetReference[] {
  const refs: AssetReference[] = [];
  for (const [source, bytes] of files) {
    if (!source.startsWith(ASSETS)) continue;
    const isMeta = source.endsWith(".meta");
    if (!isMeta && !SERIALIZED.has(path.posix.extname(source).toLowerCase())) continue;
    const add = (value: unknown, field: string, uri = false): void => {
      if (typeof value !== "string" || value === "") fail(`${source}:${field} 缺少资产引用`);
      if (uri || value.startsWith("db://")) refs.push({ source, field, databasePath: databasePath(value, `${source}:${field}`) });
      else refs.push({ source, field, uuid: normalizeAssetUuid(value) });
    };
    const visit = (value: unknown, field: string): void => {
      if (Array.isArray(value)) { value.forEach((item, i) => visit(item, `${field}[${i}]`)); return; }
      if (!object(value)) return;
      for (const [key, child] of Object.entries(value)) {
        const label = `${field}.${key}`;
        if (key === "__uuid__") { add(child, label); continue; }
        if (isMeta && key === "imageUuidOrDatabaseUri" && child !== "") { add(child, label, value.isUuid === false); continue; }
        if (isMeta && typeof child === "string" && key !== "uuid") {
          // assetFinder/material remaps/textureUuid use plain strings in 3.8.8 metadata.
          if (child.startsWith("db://")) { add(child, label, true); continue; }
          if (/^(?:[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{2}[A-Za-z0-9+/]{20})(?:@.*)?$/u.test(child)) { add(child, label); continue; }
        }
        if (isMeta && key === "assetFinder" && object(child)) {
          for (const [kind, items] of Object.entries(child)) {
            if (!Array.isArray(items)) fail(`${source}:${label}.${kind} 非数组`);
            items.forEach((item, i) => add(item, `${label}.${kind}[${i}]`));
          }
          continue;
        }
        visit(child, label);
      }
    };
    visit(json(bytes, source), "$");
  }
  return refs;
}

export function assertAssetReferences(files: ReadonlyMap<string, Buffer>, policy: ReferencePolicy = {}): { assets: number; references: number } {
  const index = createAssetIndex(files);
  const byPath = new Map([...index.values()].map((asset) => [asset.path, asset]));
  const refs = collectAssetReferences(files);
  for (const ref of refs) {
    if (ref.uuid && builtinUuids.has(ref.uuid)) continue;
    const target = ref.uuid ? index.get(ref.uuid) : byPath.get(ref.databasePath as string);
    if (!target || target.importer === "directory") fail(`${ref.source}:${ref.field} 悬空 UUID/数据库引用或缺子资产：${ref.uuid ?? ref.databasePath}（依赖必须随包；不借用宿主/其它包）`);
    if (!policy.ownerOf) continue;
    const sourceOwner = policy.ownerOf(ref.source);
    const targetOwner = policy.ownerOf(target.path);
    if (sourceOwner !== null && sourceOwner === targetOwner) continue;
    const exception = policy.allowedExternal?.find((entry) => entry.uuid === ref.uuid && entry.path === target.path);
    if (exception && createHash("sha256").update(files.get(target.metaPath) as Buffer).digest("hex") === exception.metaSha256) continue;
    fail(`${ref.source}:${ref.field} 跨包或未登记宿主引用 ${target.path}（${sourceOwner} → ${targetOwner}；requires.kits 不授权内部资产）`);
  }
  return { assets: index.size, references: refs.length };
}

/** Bundle metadata is part of the package contract; it cannot rename itself into another owner. */
export function assertBundleLayout(files: ReadonlyMap<string, Buffer>, existingRootNames: readonly string[] = []): void {
  const roots = new Set<string>();
  for (const relative of files.keys()) {
    if (!relative.startsWith(`${BUNDLES}/`)) continue;
    const name = relative.slice(BUNDLES.length + 1).split("/")[0].replace(/\.meta$/u, "");
    if (!parsePackageBundleName(name)) fail(`非法 bundle 根名：${name}`);
    roots.add(`${BUNDLES}/${name}`);
  }
  const names = new Set<string>();
  for (const root of roots) {
    const bytes = files.get(`${root}.meta`);
    if (!bytes) fail(`缺少 bundle 根 .meta：${root}`);
    const meta = json(bytes, `${root}.meta`);
    const data = object(meta) && object(meta.userData) ? meta.userData : {};
    const name = path.posix.basename(root);
    if (!object(meta) || meta.importer !== "directory" || data.isBundle !== true) fail(`${root}.meta 必须为 directory / isBundle:true`);
    if (data.bundleName !== undefined && data.bundleName !== "" && data.bundleName !== name) fail(`${root}.meta bundleName 必须等于目录名 ${name}`);
    if (data.bundleConfigID !== "package3d") fail(`${root}.meta 必须使用宿主 bundleConfigID:package3d`);
    if (data.isRemote === true) fail(`${root}.meta 开发期必须本地，发布远程由宿主 builder.json 覆写`);
    if (names.has(name.toLowerCase())) fail(`bundle 名称大小写冲突：${name}`);
    names.add(name.toLowerCase());
    const alias = existingRootNames.find((existing) => existing !== name && existing.toLowerCase() === name.toLowerCase());
    if (alias) fail(`bundle 名称与宿主现有根大小写冲突：${name} / ${alias}`);
  }
  for (const [relative, bytes] of files) {
    if (!relative.startsWith(ASSETS) || !relative.endsWith(".meta")) continue;
    const parsed = json(bytes, relative);
    if (object(parsed) && object(parsed.userData) && parsed.userData.isBundle === true && !roots.has(relative.slice(0, -5))) fail(`不允许嵌套或 resources 内 bundle：${relative}`);
  }
}

/** Read selected source files only. Binary payloads are existence markers, not loaded copies. */
export function readAssetFiles(root: string, relatives: Iterable<string>): ReadonlyMap<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const relative of relatives) {
    if (!relative.startsWith(ASSETS)) continue;
    const full = path.join(root, relative);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    files.set(relative, relative.endsWith(".meta") || SERIALIZED.has(path.posix.extname(relative).toLowerCase()) ? fs.readFileSync(full) : Buffer.alloc(0));
  }
  return files;
}

/** Host collision index includes subassets. Symlink cycles are rejected instead of silently skipped. */
export function readHostAssetFiles(root: string, skip: ReadonlySet<string>): ReadonlyMap<string, Buffer> {
  const relatives: string[] = [];
  const base = path.join(root, ASSETS);
  const seen = new Set<string>();
  const walk = (dir: string): void => {
    const real = fs.realpathSync(dir);
    if (seen.has(real)) fail(`资源目录重复或符号链接成环：${dir}`);
    seen.add(real);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (!skip.has(relative)) relatives.push(relative);
    }
  };
  if (fs.existsSync(base)) walk(base);
  return readAssetFiles(root, relatives);
}
