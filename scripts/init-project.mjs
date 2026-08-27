#!/usr/bin/env node
/**
 * Idempotently initialize a gameStarterKit checkout with project-specific
 * identity values.
 *
 * The metadata file is the identity source.  apps/shared/src/project.ts is a
 * generated projection so Cocos/client code can consume the values without
 * reading the filesystem at runtime.
 *
 * Usage:
 *   npm run init:project -- --project-id arena --name arena-kit \
 *     --display-name "Arena Kit" --scope @example --brand ballMove
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROJECT_METADATA_SCHEMA_VERSION,
  PROJECT_ID_PATTERN,
  PACKAGE_NAME_PATTERN,
  assertPackageNames,
  isPlainObject,
  normalizeScope,
  packageNames,
  projectSourceContent,
  validateName,
  validateProjectId,
  validateText,
} from "./lib/project-metadata.mjs";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDENTITY_FIELDS = ["projectId", "name", "displayName", "scope", "brand"];

const DEFAULT_GENERATED = {
  shared: {
    source: "apps/shared/src",
    mirrors: ["apps/client/src/shared", "apps/Cocos/assets/src/shared"],
  },
  client: {
    source: "apps/client/src",
    mirrors: ["apps/Cocos/assets/src"],
  },
};

const DEFAULT_THIRD_PARTY = [
  {
    id: "bitecs",
    package: "bitECS",
    version: "0.4.0",
    license: "MPL-2.0",
    source: "https://github.com/NateTheGreatt/bitECS",
    paths: ["apps/client/src/lib/bitecs", "apps/Cocos/assets/src/lib/bitecs"],
    notice: "THIRD_PARTY_NOTICES.md",
  },
  {
    id: "colyseus-sdk",
    package: "@colyseus/sdk",
    version: "0.17.43",
    license: "MIT",
    source: "https://github.com/colyseus/colyseus",
    paths: ["apps/client/src/lib/colyseus/colyseus.js", "apps/Cocos/assets/src/lib/colyseus/colyseus.js"],
    notice: "THIRD_PARTY_NOTICES.md",
  },
  {
    id: "fairygui-cc",
    package: "fairygui-cc",
    version: "1.2.2",
    license: "MIT",
    source: "https://github.com/fairygui/FairyGUI-cocoscreator",
    paths: ["apps/Cocos/extensions/fairygui-cc/runtime/fairygui.mjs", "apps/Cocos/extensions/fairygui-cc/runtime/fairygui.d.ts"],
    notice: "THIRD_PARTY_NOTICES.md",
  },
];

function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  const knownValues = new Set(["project-id", "name", "display-name", "scope", "brand", "root"]);
  const knownFlags = new Set(["dry-run", "force", "skip-verify", "help"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`未知参数：${arg}`);
    const body = arg.slice(2);
    const equals = body.indexOf("=");
    const key = equals >= 0 ? body.slice(0, equals) : body;
    const inline = equals >= 0 ? body.slice(equals + 1) : undefined;
    if (knownFlags.has(key)) {
      if (inline !== undefined) throw new Error(`--${key} 不接受值`);
      flags.add(key);
      continue;
    }
    if (!knownValues.has(key)) throw new Error(`未知参数：--${key}`);
    const value = inline !== undefined ? inline : argv[++i];
    if (value === undefined || value === "" && key !== "scope") throw new Error(`--${key} 需要非空参数`);
    if (Object.prototype.hasOwnProperty.call(values, key)) throw new Error(`参数重复：--${key}`);
    values[key] = value;
  }
  if (flags.has("help")) {
    console.log([
      "用法：npm run init:project -- [选项]",
      "  --project-id <id>       Redis/MySQL 命名空间（^[a-z][a-z0-9_]{0,31}$）",
      "  --name <name>           npm 项目名片段",
      "  --display-name <text>   面向用户的项目名",
      "  --scope <scope|none>    npm scope（可省略 @；none 表示不使用 scope）",
      "  --brand <text>          Demo 品牌/玩法名",
      "  --root <directory>      要初始化的项目根（默认当前仓库）",
      "  --dry-run               只显示变更，不写文件、不运行同步",
      "  --force                 覆盖已有 metadata 身份冲突",
      "  --skip-verify           同步后不运行 verify:core",
    ].join("\n"));
    return { help: true };
  }
  const root = values.root ? path.resolve(process.cwd(), values.root) : SCRIPT_ROOT;
  return { values, flags, root };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonOrNull(file) {
  try { return readJson(file); } catch { return null; }
}

/**
 * Refuse to read or write through a symlink below an explicitly selected
 * checkout.  The initializer rewrites a fairly broad set of source files;
 * following a user-created link here could otherwise modify a path outside
 * --root (or make a partial migration impossible to reason about).
 */
function assertNoSymlinkComponents(root, absolute) {
  const rootAbsolute = path.resolve(root);
  const relative = path.relative(rootAbsolute, path.resolve(absolute));
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`路径越出项目根：${absolute}`);
  }
  let cursor = rootAbsolute;
  for (const component of relative.split(path.sep)) {
    if (!component) continue;
    cursor = path.join(cursor, component);
    let stat;
    try { stat = fs.lstatSync(cursor); }
    catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`拒绝通过符号链接访问项目路径：${path.relative(rootAbsolute, cursor)}`);
    }
  }
}

function pendingChange(file, changes) {
  return changes.find((change) => change.file === file);
}

function writeTextIfChanged(file, content, changes, label = path.relative(SCRIPT_ROOT, file)) {
  const pending = pendingChange(file, changes);
  const old = pending
    ? pending.old
    : fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (pending) {
    if (old === content) {
      changes.splice(changes.indexOf(pending), 1);
      return true;
    }
    pending.content = content;
    pending.label = label;
    return true;
  }
  if (old === content) return false;
  changes.push({ file, label, old, content });
  return true;
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJsonIfChanged(file, value, changes, label) {
  return writeTextIfChanged(file, serializeJson(value), changes, label);
}

function firstEnvValue(text, key) {
  if (typeof text !== "string") return undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[1] !== key) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value;
  }
  return undefined;
}

function replaceFirstEnvValue(text, key, value) {
  const lines = text.split(/(\r?\n)/);
  let found = false;
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    if (line.trimStart().startsWith("#")) continue;
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match || match[1] !== key) continue;
    const eol = lines[i + 1] ?? "";
    lines[i] = `${line.slice(0, match[0].length)}${value}`;
    // Preserve the existing line's indentation and key spelling while
    // dropping stale inline values/comments (env files are deliberately kept
    // to simple KEY=VALUE syntax by the repository contract).
    if (eol === "") return lines.join("");
    found = true;
    break;
  }
  if (found) return lines.join("");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const suffix = text.length === 0 || text.endsWith("\n") || text.endsWith("\r") ? "" : eol;
  return `${text}${suffix}PROJECT_ID=${value}${eol}`;
}

function packageScope(name) {
  if (typeof name !== "string") return undefined;
  const match = /^(@[^/]+)\//.exec(name);
  return match ? match[1] : null;
}

function packageNameSegment(name) {
  if (typeof name !== "string") return undefined;
  return name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name;
}

function inferCurrent(root) {
  const metadataFile = path.join(root, "project.metadata.json");
  let metadata = null;
  let metadataError = null;
  if (fs.existsSync(metadataFile)) {
    try { metadata = readJson(metadataFile); }
    catch (error) { metadataError = error instanceof Error ? error.message : String(error); }
  }
  const rootPackage = readJsonOrNull(path.join(root, "package.json")) ?? {};
  const sharedPackage = readJsonOrNull(path.join(root, "apps/shared/package.json")) ?? {};
  let projectId = "gono";
  try {
    projectId = firstEnvValue(fs.readFileSync(path.join(root, ".env.development"), "utf8"), "PROJECT_ID") || projectId;
  } catch { /* use starter default */ }
  // `null` is a meaningful result here: it means the existing package is
  // intentionally unscoped.  Nullish coalescing would treat it like a missing
  // value and silently turn an unscoped starter into `@game/*` on a no-arg run.
  const sharedScope = packageScope(sharedPackage.name);
  const rootScope = packageScope(rootPackage.name);
  const scope = sharedScope !== undefined
    ? sharedScope
    : rootScope !== undefined
      ? rootScope
      : "@game";
  const name = packageNameSegment(rootPackage.name) || path.basename(root);
  return {
    metadata,
    metadataError,
    projectId,
    name,
    displayName: metadata?.displayName ?? name,
    scope,
    brand: metadata?.brand ?? "ballMove",
  };
}

function validateOptions(values, current) {
  // Once a metadata file exists it is the identity source.  Package.json and
  // .env are only fallbacks for bootstrapping a checkout that has no metadata;
  // this distinction lets `--force` repair a drifted package/env projection
  // back to the recorded identity instead of silently adopting the drift.
  const recorded = isPlainObject(current.metadata) ? current.metadata : null;
  const recordedValue = (key, fallback) => (
    recorded && Object.prototype.hasOwnProperty.call(recorded, key) ? recorded[key] : fallback
  );
  const candidate = {
    projectId: values["project-id"] === undefined
      ? validateProjectId(recordedValue("projectId", current.projectId))
      : validateProjectId(values["project-id"]),
    name: values.name === undefined
      ? validateName(recordedValue("name", current.name))
      : validateName(values.name),
    displayName: values["display-name"] === undefined
      ? validateText(recordedValue("displayName", current.displayName), "display-name")
      : validateText(values["display-name"], "display-name"),
    scope: values.scope === undefined
      ? normalizeScope(recordedValue("scope", current.scope))
      : normalizeScope(values.scope),
    brand: values.brand === undefined ? current.brand : validateText(values.brand, "brand"),
  };
  if (values.brand === undefined) candidate.brand = validateText(recordedValue("brand", current.brand), "brand");
  if (candidate.projectId === undefined || !PROJECT_ID_PATTERN.test(candidate.projectId)) {
    candidate.projectId = validateProjectId(candidate.projectId);
  }
  if (candidate.name === undefined || !PACKAGE_NAME_PATTERN.test(candidate.name)) {
    candidate.name = validateName(candidate.name);
  }
  if (candidate.scope !== null && candidate.scope !== undefined) candidate.scope = normalizeScope(candidate.scope);
  return candidate;
}

function metadataFor(candidate, current) {
  const existing = current.metadata;
  // Generated roots are part of this Starter's fixed contract.  A hand-edited
  // or stale shape must not be carried into the next projection, otherwise a
  // forced identity repair writes metadata that verify:project can never
  // accept.
  const generated = isPlainObject(existing?.generated)
    && existing.generated.shared?.source === DEFAULT_GENERATED.shared.source
    && JSON.stringify(existing.generated.shared?.mirrors) === JSON.stringify(DEFAULT_GENERATED.shared.mirrors)
    && existing.generated.client?.source === DEFAULT_GENERATED.client.source
    && JSON.stringify(existing.generated.client?.mirrors) === JSON.stringify(DEFAULT_GENERATED.client.mirrors)
    ? existing.generated
    : DEFAULT_GENERATED;
  const thirdParty = Array.isArray(existing?.thirdParty) ? existing.thirdParty : DEFAULT_THIRD_PARTY;
  const metadata = {
    schemaVersion: PROJECT_METADATA_SCHEMA_VERSION,
    projectId: candidate.projectId,
    name: candidate.name,
    displayName: candidate.displayName,
    scope: candidate.scope ?? null,
    brand: candidate.brand,
    license: "MIT",
    packages: packageNames(candidate),
    generated,
    thirdParty,
  };
  assertPackageNames(metadata);
  return metadata;
}

function collectIdentityConflicts(root, current, candidate, values) {
  const conflicts = [];
  if (!current.metadata) return conflicts;
  for (const [option, field] of [["project-id", "projectId"], ["name", "name"], ["display-name", "displayName"], ["scope", "scope"], ["brand", "brand"]]) {
    if (values[option] !== undefined && current.metadata[field] !== candidate[field]) {
      conflicts.push(`${field} 已是 ${JSON.stringify(current.metadata[field])}，不能改为 ${JSON.stringify(candidate[field])}`);
    }
  }
  // A hand-edited package/env/identity projection is a drift conflict too.
  let expectedPackages;
  try { expectedPackages = packageNames(current.metadata); }
  catch { return conflicts; }
  const packageFiles = [
    ["package.json", "root"],
    ["apps/shared/package.json", "shared"],
    ["apps/server/package.json", "server"],
    ["apps/website/package.json", "website"],
    ["apps/Cocos/package.json", "client"],
  ];
  for (const [relative, key] of packageFiles) {
    const pkg = readJsonOrNull(path.join(root, relative));
    if (pkg && pkg.name !== expectedPackages[key]) conflicts.push(`${relative}.name 已漂移（应为 ${expectedPackages[key]}，实际为 ${pkg.name ?? "<missing>"}）`);
  }
  try {
    const env = firstEnvValue(fs.readFileSync(path.join(root, ".env.development"), "utf8"), "PROJECT_ID");
    if (env !== current.metadata.projectId) conflicts.push(`.env.development PROJECT_ID 已漂移（应为 ${current.metadata.projectId}，实际为 ${env ?? "<missing>"}）`);
  } catch { conflicts.push(".env.development 缺失或不可读"); }
  return conflicts;
}

function renameObjectStrings(value, replacements) {
  if (Array.isArray(value)) return value.map((item) => renameObjectStrings(item, replacements));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const nextKey = replacements.get(key) ?? key;
      out[nextKey] = renameObjectStrings(item, replacements);
    }
    return out;
  }
  if (typeof value === "string") return replacements.get(value) ?? value;
  return value;
}

/**
 * Rename package references in an npm lockfile without treating a short root
 * name (for example `game`) as an arbitrary substring.  Lockfiles use package
 * names as exact dependency keys and `node_modules/<name>` as exact package
 * graph keys; other strings such as `@game/server` must remain untouched when
 * only the root package is being renamed.
 */
function renameLockPackageRefs(value, replacements) {
  if (Array.isArray(value)) return value.map((item) => renameLockPackageRefs(item, replacements));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const nextKey = replaceLockPackageRef(key, replacements);
      out[nextKey] = renameLockPackageRefs(item, replacements);
    }
    return out;
  }
  return replaceLockPackageRef(value, replacements);
}

function replaceLockPackageRef(value, replacements) {
  if (typeof value !== "string") return value;
  const exact = replacements.get(value);
  if (exact !== undefined) return exact;
  const prefix = "node_modules/";
  if (!value.startsWith(prefix)) return value;
  const rest = value.slice(prefix.length);
  for (const [from, to] of replacements) {
    const oldPrefix = `${from}/`;
    if (rest.startsWith(oldPrefix)) return `${prefix}${to}${rest.slice(from.length)}`;
  }
  return value;
}

/**
 * Rename package references in a manifest without rewriting unrelated strings.
 * In particular, an unscoped package named `shared` must not turn
 * `apps/shared`, `sync:shared`, or arbitrary prose into `apps/@scope/shared`.
 * Dependency maps are keyed by exact package names; workspace command flags
 * are the only script strings that carry package identity.
 */
function replaceManifestPackageRefs(pkg, replacements) {
  const out = structuredClone(pkg);
  const dependencySections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "overrides",
    "resolutions",
  ];
  const renameMap = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const renamed = {};
    for (const [key, item] of Object.entries(value)) {
      const nextKey = replacements.get(key) ?? key;
      renamed[nextKey] = item && typeof item === "object" && !Array.isArray(item)
        ? renameMap(item)
        : replacements.get(item) ?? item;
    }
    return renamed;
  };
  for (const section of dependencySections) {
    if (out[section] && typeof out[section] === "object" && !Array.isArray(out[section])) {
      out[section] = renameMap(out[section]);
    }
  }
  if (out.scripts && typeof out.scripts === "object" && !Array.isArray(out.scripts)) {
    for (const [name, command] of Object.entries(out.scripts)) {
      if (typeof command !== "string") continue;
      let next = command;
      for (const [from, to] of replacements) {
        // npm/yarn/pnpm workspace selectors are exact package tokens.
        next = next.replace(new RegExp(`(--workspace(?:=|\\s+))${escapeRegExp(from)}(?=$|\\s)`, "g"), `$1${to}`);
      }
      out.scripts[name] = next;
    }
  }
  return out;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\[\]\\]/g, "\\$&");
}

function replaceTextInTree(root, oldNames, newNames, changes) {
  const replacements = oldNames
    .map((oldName, index) => [oldName, newNames[index]])
    // Bare names such as `shared` are ambiguous in prose, paths and script
    // identifiers.  Manifest dependency maps are handled structurally above;
    // only scoped package tokens are safe to rewrite in free-form text.
    .filter(([oldName, newName]) => oldName?.startsWith("@") && oldName && newName && oldName !== newName);
  if (replacements.length === 0) return;
  // Tooling itself is deliberately excluded: rewriting this initializer (or
  // a sync/verify script) while it is running would make the migration
  // self-modifying and could change the semantics of the next invocation.
  const roots = ["README.md", "AGENTS.md", "CLAUDE.md", "docs", "apps/server", "apps/shared", "apps/client/src", "apps/client/test", "apps/website"];
  const skip = ["apps/client/src/shared", "apps/Cocos", "node_modules", ".git", "apps/client/temp"];
  const files = [];
  const visit = (absolute) => {
    if (!fs.existsSync(absolute)) return;
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    // `node_modules` also occurs below workspace roots (for example
    // apps/website/node_modules); skip by path segment so npm's .bin symlinks
    // are never traversed and dependency trees are not rewritten.
    const segments = relative.split("/");
    if (segments.includes("node_modules") || skip.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`拒绝遍历项目内符号链接：${relative}`);
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute)) visit(path.join(absolute, entry));
      return;
    }
    if (!/\.(?:ts|tsx|js|mjs|json|md|yaml|yml|sh)$/.test(relative)) return;
    if (relative === "package.json" || relative.endsWith("/package.json")) return;
    files.push(absolute);
  };
  for (const relative of roots) visit(path.join(root, relative));
  for (const file of files) {
    let text;
    const pending = pendingChange(file, changes);
    try { text = pending ? pending.content : fs.readFileSync(file, "utf8"); } catch { continue; }
    let next = text;
    for (const [from, to] of replacements) {
      const token = new RegExp(`(^|[^A-Za-z0-9._-])${escapeRegExp(from)}(?=$|[^A-Za-z0-9._-])`, "g");
      next = next.replace(token, `$1${to}`);
    }
    if (next !== text) writeTextIfChanged(file, next, changes, path.relative(root, file));
  }
}

function buildChanges(root, current, candidate, metadata, changes) {
  // Read the on-disk package names before changing them.  Metadata may have
  // been committed ahead of a partially completed migration; using it as the
  // old lockfile key would leave stale root/workspace links behind when
  // --force repairs that drift.
  const inferredNames = packageNames(current);
  const oldPackageNames = { ...inferredNames, ...(current.metadata?.packages ?? {}) };
  const packagePathByKey = {
    root: "package.json",
    shared: "apps/shared/package.json",
    server: "apps/server/package.json",
    website: "apps/website/package.json",
    client: "apps/Cocos/package.json",
  };
  for (const [key, relative] of Object.entries(packagePathByKey)) {
    assertNoSymlinkComponents(root, path.join(root, relative));
    const pkg = readJsonOrNull(path.join(root, relative));
    if (pkg?.name && typeof pkg.name === "string") oldPackageNames[key] = pkg.name;
  }
  const nextPackageNames = metadata.packages;
  const packageFiles = [
    ["package.json", "root"],
    ["apps/shared/package.json", "shared"],
    ["apps/server/package.json", "server"],
    ["apps/website/package.json", "website"],
    ["apps/Cocos/package.json", "client"],
  ];
  const packageReplacements = new Map();
  // Root/client names are package identity values, not workspace import
  // tokens.  Replacing them inside arbitrary script strings would turn the
  // `game` part of `@game/server` into `@@scope/name/server`; only workspace
  // package names need substring replacement in package JSON.
  for (const key of ["shared", "server", "website"]) {
    if (oldPackageNames[key] !== nextPackageNames[key]) packageReplacements.set(oldPackageNames[key], nextPackageNames[key]);
  }
  for (const [relative, key] of packageFiles) {
    const file = path.join(root, relative);
    assertNoSymlinkComponents(root, file);
    if (!fs.existsSync(file)) continue;
    const pkg = replaceManifestPackageRefs(readJson(file), packageReplacements);
    pkg.name = nextPackageNames[key];
    if (key === "server") {
      for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const deps = pkg[section];
        if (!deps || typeof deps !== "object") continue;
        if (oldPackageNames.shared !== nextPackageNames.shared && Object.prototype.hasOwnProperty.call(deps, oldPackageNames.shared)) {
          const version = deps[oldPackageNames.shared];
          delete deps[oldPackageNames.shared];
          deps[nextPackageNames.shared] = version;
        }
      }
    }
    writeJsonIfChanged(file, pkg, changes, relative);
  }

  const lockRelative = "package-lock.json";
  const lockFile = path.join(root, lockRelative);
  if (fs.existsSync(lockFile)) {
    assertNoSymlinkComponents(root, lockFile);
    const lock = readJson(lockFile);
    const replacements = new Map();
    for (const key of Object.keys(oldPackageNames)) {
      if (oldPackageNames[key] !== nextPackageNames[key]) replacements.set(oldPackageNames[key], nextPackageNames[key]);
      replacements.set(`node_modules/${oldPackageNames[key]}`, `node_modules/${nextPackageNames[key]}`);
    }
    const nextLock = renameLockPackageRefs(lock, replacements);
    writeJsonIfChanged(lockFile, nextLock, changes, lockRelative);
  }
  const websiteLockRelative = "apps/website/package-lock.json";
  const websiteLock = path.join(root, websiteLockRelative);
  if (fs.existsSync(websiteLock)) {
    assertNoSymlinkComponents(root, websiteLock);
    const lock = readJson(websiteLock);
    const replacements = new Map([[oldPackageNames.website, nextPackageNames.website]]);
    writeJsonIfChanged(websiteLock, renameLockPackageRefs(lock, replacements), changes, websiteLockRelative);
  }

  const oldNames = [oldPackageNames.shared, oldPackageNames.server, oldPackageNames.website];
  const newNames = [nextPackageNames.shared, nextPackageNames.server, nextPackageNames.website];
  replaceTextInTree(root, oldNames, newNames, changes);

  const envFile = path.join(root, ".env.development");
  assertNoSymlinkComponents(root, envFile);
  const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  writeTextIfChanged(envFile, replaceFirstEnvValue(envText, "PROJECT_ID", candidate.projectId), changes, ".env.development");

  const identityRelative = "apps/shared/src/project.ts";
  const identityFile = path.join(root, identityRelative);
  assertNoSymlinkComponents(root, identityFile);
  writeTextIfChanged(identityFile, projectSourceContent(metadata), changes, identityRelative);

  const sharedIndex = path.join(root, "apps/shared/src/index.ts");
  assertNoSymlinkComponents(root, sharedIndex);
  if (fs.existsSync(sharedIndex)) {
    const pending = pendingChange(sharedIndex, changes);
    const source = pending ? pending.content : fs.readFileSync(sharedIndex, "utf8");
    if (!/export\s+\*\s+from\s+["']\.\/project["']\s*;/.test(source)) {
      writeTextIfChanged(sharedIndex, `${source.trimEnd()}\nexport * from "./project";\n`, changes, "apps/shared/src/index.ts");
    }
  }

  writeJsonIfChanged(path.join(root, "project.metadata.json"), metadata, changes, "project.metadata.json");
}

function runCommand(root, command, args) {
  console.log(`▶ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runSyncAndVerify(root, skipVerify) {
  const packageJson = readJsonOrNull(path.join(root, "package.json"));
  if (packageJson?.scripts?.["sync:shared"]) {
    runCommand(root, npmCommand(), ["run", "sync:shared"]);
  } else {
    const sync = path.join(root, "scripts/sync-shared.mjs");
    if (!fs.existsSync(sync)) throw new Error("找不到 sync:shared 或 scripts/sync-shared.mjs，无法刷新生成镜像");
    runCommand(root, process.execPath, [sync]);
    const clientSync = path.join(root, "scripts/sync-client.mjs");
    if (fs.existsSync(clientSync)) runCommand(root, process.execPath, [clientSync]);
  }
  if (skipVerify) return;
  if (!packageJson?.scripts?.["verify:core"]) {
    throw new Error("package.json 未提供 verify:core；若只想写入身份，请显式使用 --skip-verify");
  }
  runCommand(root, npmCommand(), ["run", "verify:core"]);
}

function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) return;
    const { values, flags, root } = parsed;
    let rootStat;
    try { rootStat = fs.lstatSync(root); }
    catch { throw new Error(`项目根目录不存在：${root}`); }
    if (rootStat.isSymbolicLink()) throw new Error(`项目根不能是符号链接：${root}`);
    if (!rootStat.isDirectory()) throw new Error(`项目根目录不存在：${root}`);
    if (!fs.existsSync(path.join(root, "package.json"))) throw new Error(`项目根缺少 package.json：${root}`);
    const current = inferCurrent(root);
    if (current.metadataError && !flags.has("force")) {
      throw new Error(`project.metadata.json 无法解析，默认拒绝覆盖：${current.metadataError}（确认后使用 --force）`);
    }
    const candidate = validateOptions(values, current);
    const conflicts = collectIdentityConflicts(root, current, candidate, values);
    if (conflicts.length > 0 && !flags.has("force")) {
      throw new Error(`检测到已有身份或文件漂移；默认拒绝覆盖（请核对后使用 --force）：\n${conflicts.map((item) => `  - ${item}`).join("\n")}`);
    }
    const metadata = metadataFor(candidate, current);
    const changes = [];
    buildChanges(root, current, candidate, metadata, changes);
    if (flags.has("dry-run")) {
      console.log(`[init:project] dry-run：${changes.length} 个文件将被更新`);
      for (const change of changes) console.log(`  - ${change.label}`);
      console.log(JSON.stringify({ projectId: candidate.projectId, name: candidate.name, displayName: candidate.displayName, scope: candidate.scope, brand: candidate.brand }, null, 2));
      return;
    }
    for (const change of changes) {
      assertNoSymlinkComponents(root, change.file);
      fs.mkdirSync(path.dirname(change.file), { recursive: true });
      fs.writeFileSync(change.file, change.content);
    }
    console.log(`[init:project] 已更新 ${changes.length} 个文件：${candidate.displayName} (${candidate.projectId})`);
    runSyncAndVerify(root, flags.has("skip-verify"));
    console.log("[init:project] ✔ 初始化完成");
  } catch (error) {
    console.error(`[init:project] ✘ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]) {
  const invoked = path.resolve(process.argv[1]);
  if (fs.existsSync(invoked) && fs.realpathSync(invoked) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
}
