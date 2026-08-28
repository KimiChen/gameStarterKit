#!/usr/bin/env node
/**
 * FairyGUI 资源闭包与生成物新鲜度检查。
 *
 * `--write` 在确认 FairyGUI 已导出后重建 scripts/fgui.manifest.json；
 * `--check` 是只读闸，检查：
 *   1. art 包/XML/资源集合与记录的字节哈希一致；
 *   2. 每个包有 package.xml 声明的导出组件和对应 Cocos .bin；
 *   3. XML 中的跨包 pkg/ui:// 引用都能解析到已知包；
 *   4. Cocos resources/ui 下的 bin、atlas/image/skel 等导出物集合和哈希一致；
 *   5. 注册 View 的 AUTO 区块仍与 manifest 中的生成区哈希一致。
 *
 * FairyGUI 的二进制发布格式不是可逆的，故 manifest 不尝试“从 XML 推导 bin”；
 * 它把导出动作本身钉成可审计的输入/输出闭包。设计源变化后必须重新导出并显式 --write。
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART = path.join(ROOT, "apps/art/fairygui/assets");
const UI = path.join(ROOT, "apps/Cocos/assets/resources/ui");
const VIEW = path.join(ROOT, "apps/client/src/view");
const MANIFEST = path.join(ROOT, "scripts/fgui.manifest.json");
const VERSION = 1;

const posix = (value) => value.split(path.sep).join("/");
const rel = (base, file) => posix(path.relative(ROOT, file));

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

function exportPaths() {
  return listFiles(UI).filter((file) => !file.endsWith(".meta"));
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function records(base, paths) {
  return paths.map((file) => ({ path: rel(base, path.join(base, file)), sha256: sha256(path.join(base, file)) }));
}

function attrs(source) {
  const out = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = re.exec(source)) !== null) out[match[1]] = match[2] ?? match[3] ?? "";
  return out;
}

function withoutXmlComments(xml) {
  // Package XML is small and intentionally parsed without a DOM dependency.
  // Remove comments first so an example snippet in a designer comment cannot
  // become a false resource/package declaration.
  return xml.replace(/<!--[\s\S]*?-->/g, "");
}

function packageDescription(xml) {
  const match = /<packageDescription\b([^>]*)>/i.exec(withoutXmlComments(xml));
  if (!match) throw new Error("package.xml 缺少 packageDescription");
  const id = attrs(match[1]).id;
  if (!id) throw new Error("package.xml 缺少 packageDescription.id");
  return id;
}

function componentDeclarations(xml) {
  const out = [];
  const body = /<resources\b[^>]*>([\s\S]*?)<\/resources>/i.exec(withoutXmlComments(xml))?.[1] ?? "";
  for (const match of body.matchAll(/<component\b([^>]*)\/?>(?:<\/component>)?/gi)) {
    const a = attrs(match[1]);
    if (a.name) out.push({ name: a.name, exported: a.exported === "true" });
  }
  return out;
}

/** package.xml 中所有可由 ui:// URL 指向的资源（不仅是组件）。 */
function resourceDeclarations(xml) {
  const out = [];
  const body = /<resources\b[^>]*>([\s\S]*?)<\/resources>/i.exec(withoutXmlComments(xml))?.[1] ?? "";
  // FairyGUI has added resource kinds over time (movieclip/sound/video,
  // dragonBones, ...).  Treat every named resource entry as addressable while
  // excluding `folder`, which is an editor grouping rather than a ui:// item.
  // This keeps the closure check forward-compatible without silently changing
  // the existing manifest for editor-only folders.
  for (const match of body.matchAll(/<([A-Za-z_][\w:.-]*)\b([^>]*)>/g)) {
    const kind = match[1].toLowerCase();
    if (kind === "folder" || kind === "resources") continue;
    const a = attrs(match[2]);
    if (!a.id || !a.name) continue;
    out.push({
      kind,
      id: a.id,
      name: a.name,
      exported: a.exported === "true",
    });
  }
  return out;
}

function packageInfos() {
  if (!fs.existsSync(ART)) throw new Error(`FGUI 源目录不存在: ${rel(ROOT, ART)}`);
  const dirs = fs.readdirSync(ART, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const infos = [];
  for (const name of dirs) {
    const dir = path.join(ART, name);
    const packagePath = path.join(dir, "package.xml");
    if (!fs.existsSync(packagePath)) continue;
    const packageXml = fs.readFileSync(packagePath, "utf8");
    const sourcePaths = listFiles(dir);
    const declarations = componentDeclarations(packageXml);
    const resources = resourceDeclarations(packageXml);
    const availableExports = exportPaths();
    const binName = `${name}.bin`;
    if (!availableExports.includes(binName)) {
      throw new Error(`${name}: 缺少导出 ${rel(ROOT, path.join(UI, binName))}`);
    }
    const outputs = new Set([binName]);
    // Atlas names are package-prefixed in Cocos; standalone resources (Spine,
    // fonts and NPOT images) retain their source basename.
    for (const output of availableExports) {
      const base = path.basename(output);
      if (base === `${name}.bin` || base.startsWith(`${name}_`)) outputs.add(output);
    }
    for (const resource of resources) {
      const resourceName = resource.name;
      if (!resourceName) continue;
      for (const output of availableExports) {
        if (path.basename(output) === resourceName) outputs.add(output);
      }
    }
    const info = {
      name,
      id: packageDescription(packageXml),
      source: records(dir, sourcePaths),
      components: declarations.sort((a, b) => a.name.localeCompare(b.name)),
      resources,
      outputs: [...outputs].sort().map((file) => {
        const full = path.join(UI, file);
        if (!fs.existsSync(full)) throw new Error(`${name}: 缺少导出 ${rel(ROOT, full)}`);
        return { path: rel(UI, full), sha256: sha256(full) };
      }),
    };
    infos.push(info);
  }
  if (infos.length === 0) throw new Error("FGUI 源目录没有带 package.xml 的包");
  return infos;
}

function normalizeResourceName(name) {
  return name.replace(/^\/+/, "").replaceAll("\\", "/");
}

function resourceAliases(resource) {
  const name = normalizeResourceName(resource.name);
  const extensionless = name.replace(/\.[^/.]+$/, "");
  const base = path.posix.basename(name);
  const baseExtensionless = base.replace(/\.[^/.]+$/, "");
  return new Set([resource.id, name, extensionless, base, baseExtensionless]);
}

function extractUiUrls(source) {
  const urls = [];
  // Stop at XML/entity delimiters so a URL in customData="...&quot;}}" is
  // captured as `ui://Pkg/item`, not with the surrounding JSON suffix.
  for (const match of source.matchAll(/ui:\/\/([^\s"'<>|&]+)/g)) {
    const value = match[1].replace(/[),.;\]}]+$/g, "");
    if (value) urls.push(value);
  }
  return urls;
}

function packageMaps(infos, errors) {
  const byId = new Map();
  const byName = new Map();
  for (const info of infos) {
    if (byId.has(info.id)) errors.push(`package id 重复 ${info.id}（${byId.get(info.id).name} 与 ${info.name}）`);
    else byId.set(info.id, info);
    if (byName.has(info.name)) errors.push(`package 名称重复 ${info.name}`);
    else byName.set(info.name, info);
    const resourceIds = new Set();
    const resourceNames = new Set();
    for (const resource of info.resources ?? []) {
      if (resourceIds.has(resource.id)) errors.push(`${info.name}: resource id 重复 ${resource.id}`);
      resourceIds.add(resource.id);
      if (resourceNames.has(resource.name)) errors.push(`${info.name}: resource name 重复 ${resource.name}`);
      resourceNames.add(resource.name);
    }
  }
  return { byId, byName };
}

function packageForKey(key, maps) {
  return maps.byName.get(key) ?? maps.byId.get(key);
}

function resourceExists(info, key) {
  return (info.resources ?? []).some((resource) => resourceAliases(resource).has(key));
}

function validateUiUrl(raw, maps) {
  const slash = raw.indexOf("/");
  if (slash >= 0) {
    const packageKey = raw.slice(0, slash);
    const resourceKey = normalizeResourceName(raw.slice(slash + 1));
    const info = packageForKey(packageKey, maps);
    if (!info) return `未知 ui:// 包 ${packageKey}`;
    if (!resourceKey) return `ui://${raw} 缺少资源 ID/名称`;
    if (!resourceExists(info, resourceKey)) return `ui://${raw} 未知资源 ${resourceKey}`;
    return undefined;
  }

  // Binary URLs concatenate package id and resource id. IDs are currently
  // eight characters, but resolve by the longest known prefix so this check
  // remains correct if FairyGUI changes the id alphabet/length.
  const candidates = [...maps.byId.keys()]
    .filter((id) => raw.startsWith(id))
    .sort((a, b) => b.length - a.length);
  const info = candidates.length ? maps.byId.get(candidates[0]) : undefined;
  if (!info) {
    if (maps.byName.has(raw)) return `ui://${raw} 缺少资源 ID/名称`;
    return `未知 ui:// 包/资源 ${raw}`;
  }
  const resourceKey = raw.slice(candidates[0].length);
  if (!resourceKey) return `ui://${raw} 缺少资源 ID`;
  if (!resourceExists(info, resourceKey)) return `ui://${raw} 未知资源 ID ${resourceKey}`;
  return undefined;
}

function parseUiReferences(infos) {
  const errors = [];
  const maps = packageMaps(infos, errors);
  for (const info of infos) {
    for (const entry of info.source.filter((item) => item.path.endsWith(".xml") && !item.path.endsWith("/package.xml"))) {
      const file = path.join(ROOT, entry.path);
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bpkg\s*=\s*["']([^"']+)["']/g)) {
        if (!packageForKey(match[1], maps)) errors.push(`${entry.path}: 未知 pkg 引用 ${match[1]}`);
      }
      for (const raw of extractUiUrls(source)) {
        const error = validateUiUrl(raw, maps);
        if (error) errors.push(`${entry.path}: ${error}`);
      }
    }
  }
  return errors;
}

function generatedViewHash(source) {
  const chunks = [];
  const lines = source.split("\n");
  const lineOffsets = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }
  let cursor = -1;
  for (const kind of ["IMPORT", "REQUIRED", "FIELD", "BIND"]) {
    const beginMarker = `// #region AUTO ${kind} DONT CHANGE`;
    const endMarker = `// #endregion AUTO ${kind}`;
    const begins = lines.flatMap((line, index) => line.trim() === beginMarker ? [index] : []);
    const ends = lines.flatMap((line, index) => line.trim() === endMarker ? [index] : []);
    if (begins.length !== 1 || ends.length !== 1) return null;
    const begin = begins[0];
    const end = ends[0];
    if (begin <= cursor || end < 0 || end <= begin) return null;
    const beginOffset = lineOffsets[begin] + lines[begin].indexOf(beginMarker);
    const endOffset = lineOffsets[end] + lines[end].indexOf(endMarker) + endMarker.length;
    chunks.push(source.slice(beginOffset, endOffset));
    cursor = end;
  }
  return createHash("sha256").update(chunks.join("\n")).digest("hex");
}

function viewRecords() {
  const paths = listFiles(VIEW).filter((file) => /^[A-Z].*View\.ts$/.test(file) && file !== "FguiView.ts");
  return paths.map((file) => {
    const full = path.join(VIEW, file);
    const source = fs.readFileSync(full, "utf8");
    const origin = /来源:\s*ui:\/\/([^/]+)\/([^\s]+)/.exec(source);
    const generatedHash = generatedViewHash(source);
    if (!origin || !generatedHash) throw new Error(`${rel(ROOT, full)} 缺少完整 AUTO 区块或来源标记`);
    return { path: rel(ROOT, full), pkg: origin[1], comp: origin[2], generatedHash };
  });
}

function exportRecords() {
  if (!fs.existsSync(UI)) throw new Error(`Cocos UI 导出目录不存在: ${rel(ROOT, UI)}`);
  // .meta 属于 Creator 管理的旁车文件；二进制/图集本体必须全部被钉住。
  const paths = listFiles(UI).filter((file) => !file.endsWith(".meta"));
  return records(UI, paths);
}

function currentManifest() {
  const exportFiles = exportRecords();
  const packages = packageInfos();
  const errors = parseUiReferences(packages);
  if (errors.length) throw new Error(`FGUI 跨包引用非法:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  const packageNames = new Set(packages.map((p) => p.name));
  for (const view of viewRecords()) {
    if (!packageNames.has(view.pkg)) throw new Error(`${view.path}: View 引用未知包 ${view.pkg}`);
    const packageInfo = packages.find((p) => p.name === view.pkg);
    if (!packageInfo.components.some((c) => c.name === `${view.comp}.xml` && c.exported)) {
      throw new Error(`${view.path}: ${view.pkg}/${view.comp}.xml 未在 package.xml exported=true`);
    }
  }
  // `packageInfo.outputs` 目前已按资源名/包前缀推导；缺 bin 时在构建 manifest
  // 阶段直接失败，不允许把一个不完整的导出状态钉成“新鲜”。
  for (const pkg of packages) {
    const expectedBin = path.join(UI, `${pkg.name}.bin`);
    if (!fs.existsSync(expectedBin)) throw new Error(`${pkg.name}: 缺少导出 ${rel(ROOT, expectedBin)}`);
  }
  return {
    version: VERSION,
    sourceRoot: rel(ROOT, ART),
    exportRoot: rel(ROOT, UI),
    packages,
    exports: exportFiles,
    views: viewRecords(),
  };
}

function compareRecords(label, expected, actual, problems) {
  if (!Array.isArray(expected) || !Array.isArray(actual)) {
    problems.push(`${label}: 记录不是数组`);
    return;
  }
  const toMap = (records, side) => {
    const map = new Map();
    for (const [index, item] of records.entries()) {
      if (!item || typeof item !== "object" || typeof item.path !== "string"
        || item.path.trim() === "" || typeof item.sha256 !== "string"
        || !/^[0-9a-f]{64}$/i.test(item.sha256)) {
        problems.push(`${label}: ${side}[${index}] 记录结构非法`);
        continue;
      }
      if (map.has(item.path)) problems.push(`${label}: ${side} 重复记录 ${item.path}`);
      else map.set(item.path, item.sha256);
    }
    return map;
  };
  const expectedMap = toMap(expected, "manifest");
  const actualMap = toMap(actual, "当前");
  for (const [file, hash] of expectedMap) {
    if (!actualMap.has(file)) problems.push(`${label}: 缺失 ${file}`);
    else if (actualMap.get(file) !== hash) problems.push(`${label}: 哈希不符 ${file}`);
  }
  for (const file of actualMap.keys()) if (!expectedMap.has(file)) problems.push(`${label}: 多余 ${file}`);
}

/**
 * Validate the part of a manifest that can be checked without touching the
 * current workspace.  Keeping this as a pure assertion makes malformed
 * manifests testable without replacing the checked-in FGUI assets.
 */
function assertManifestShape(manifest, version = VERSION) {
  if (!manifest || manifest.version !== version || !Array.isArray(manifest.packages)
    || !Array.isArray(manifest.exports) || !Array.isArray(manifest.views)) {
    throw new Error(`manifest 版本/结构非法（期望 version=${version}）`);
  }
  const packageNames = new Set();
  const packageIds = new Set();
  for (const [index, pkg] of manifest.packages.entries()) {
    if (!pkg || typeof pkg.name !== "string" || typeof pkg.id !== "string"
      || !Array.isArray(pkg.source) || !Array.isArray(pkg.components)
      || !Array.isArray(pkg.resources) || !Array.isArray(pkg.outputs)) {
      throw new Error(`manifest packages[${index}] 结构非法`);
    }
    if (packageNames.has(pkg.name)) throw new Error(`manifest package 名称重复：${pkg.name}`);
    if (packageIds.has(pkg.id)) throw new Error(`manifest package id 重复：${pkg.id}`);
    packageNames.add(pkg.name);
    packageIds.add(pkg.id);
  }
  return manifest;
}

/** Return manifest source records that escape their declared package root. */
function sourcePathProblems(packageName, sourceRoot, sourceRecords) {
  const problems = [];
  if (!Array.isArray(sourceRecords)) return problems;
  const packageRoot = path.posix.normalize(path.posix.join(
    String(sourceRoot).replaceAll("\\", "/"),
    String(packageName).replaceAll("\\", "/"),
  ));
  for (const item of sourceRecords) {
    if (!item || typeof item.path !== "string") continue;
    const candidate = item.path.replaceAll("\\", "/");
    const relative = path.posix.relative(packageRoot, candidate);
    if (relative === "" || relative === ".." || relative.startsWith("../") || path.posix.isAbsolute(relative)) {
      problems.push(`${packageName} source: 路径越界 ${item.path}`);
    }
  }
  return problems;
}

/** Return errors for generated files claimed by more than one package. */
function outputOwnershipProblems(packages) {
  const problems = [];
  const owners = new Map();
  for (const pkg of packages ?? []) {
    if (!pkg || typeof pkg.name !== "string" || !Array.isArray(pkg.outputs)) continue;
    for (const output of pkg.outputs) {
      if (!output || typeof output.path !== "string") continue;
      const previous = owners.get(output.path);
      if (previous && previous !== pkg.name) {
        problems.push(`Cocos export: ${output.path} 同时归属 ${previous}/${pkg.name}`);
      } else if (!previous) {
        owners.set(output.path, pkg.name);
      }
    }
  }
  return problems;
}

function checkManifest() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`manifest 不存在: ${rel(ROOT, MANIFEST)}（先运行 --write）`);
  let expected;
  try { expected = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); }
  catch (error) { throw new Error(`manifest JSON 无法解析: ${error.message}`); }
  assertManifestShape(expected);
  const actual = currentManifest();
  const problems = [];
  if (expected.sourceRoot !== actual.sourceRoot || expected.exportRoot !== actual.exportRoot) {
    problems.push("manifest root 与当前工程不一致");
  }
  compareRecords("Cocos export", expected.exports, actual.exports, problems);
  const expectedPackages = new Map(expected.packages.map((p) => [p.name, p]));
  const actualPackages = new Map(actual.packages.map((p) => [p.name, p]));
  for (const [name, pkg] of expectedPackages) {
    const got = actualPackages.get(name);
    if (!got) { problems.push(`package 缺失 ${name}`); continue; }
    if (pkg.id !== got.id) problems.push(`${name}: package id 变化`);
    compareRecords(`${name} source`, pkg.source, got.source, problems);
    if (JSON.stringify(pkg.components) !== JSON.stringify(got.components)) problems.push(`${name}: package.xml 组件/导出声明变化`);
    if (JSON.stringify(pkg.resources) !== JSON.stringify(got.resources)) problems.push(`${name}: package.xml 资源声明变化`);
    compareRecords(`${name} export`, pkg.outputs, got.outputs, problems);

    problems.push(...sourcePathProblems(name, expected.sourceRoot, pkg.source));
  }
  for (const name of actualPackages.keys()) if (!expectedPackages.has(name)) problems.push(`package 多余 ${name}`);

  // A generated asset must have one owner.  Ambiguous ownership would let one
  // package's export drift while another package's record keeps the check green.
  problems.push(...outputOwnershipProblems(actual.packages));
  const expectedViews = new Map(expected.views.map((v) => [v.path, v]));
  const actualViews = new Map(actual.views.map((v) => [v.path, v]));
  for (const [file, view] of expectedViews) {
    const got = actualViews.get(file);
    if (!got) { problems.push(`View 缺失 ${file}`); continue; }
    if (view.pkg !== got.pkg || view.comp !== got.comp || view.generatedHash !== got.generatedHash) {
      problems.push(`View AUTO 生成区过期 ${file}（重跑 codegen 并执行 --write）`);
    }
  }
  for (const file of actualViews.keys()) if (!expectedViews.has(file)) problems.push(`View 多余 ${file}`);
  if (problems.length) {
    console.error(`✘ FGUI manifest ${problems.length} 处不一致：`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("✔ FGUI manifest、源资源闭包和导出物一致");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--write")) {
    const manifest = currentManifest();
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`✔ 已写入 ${rel(ROOT, MANIFEST)}（${manifest.packages.length} 个包，${manifest.exports.length} 个导出文件）`);
  } else {
    checkManifest();
  }
}

export {
  assertManifestShape,
  componentDeclarations,
  compareRecords,
  currentManifest,
  outputOwnershipProblems,
  packageDescription,
  resourceDeclarations,
  sourcePathProblems,
  validateUiUrl,
};
