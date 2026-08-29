/**
 * Verify the capability inventory against the checked-out repository.
 * The inventory is intentionally data-only; this script makes paths, commands,
 * documentation and the default entry points executable review invariants.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `--root` is intentionally a read-only fixture seam.  It lets the inventory
 * contract be tested against a copied checkout without mutating the real
 * repository (and keeps the verifier independent of the caller's cwd).
 */
function parseRoot(argv) {
  let root = SCRIPT_ROOT;
  let seenRoot = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      if (seenRoot) throw new Error("参数重复：--root");
      if (index + 1 >= argv.length) throw new Error("--root 需要目录参数");
      root = argv[++index];
      if (!root) throw new Error("--root 需要非空目录参数");
      seenRoot = true;
    } else if (arg.startsWith("--root=")) {
      if (seenRoot) throw new Error("参数重复：--root");
      root = arg.slice("--root=".length);
      if (!root) throw new Error("--root 需要目录参数");
      seenRoot = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("用法：node scripts/verify-inventory.mjs [--root <目录>]");
      return null;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return path.resolve(process.cwd(), root);
}

const parsedRoot = parseRoot(process.argv.slice(2));
if (parsedRoot === null) process.exit(0);
// Normalize macOS `/var` aliases (and other mount aliases) once so relative
// link checks compare paths in the same namespace as `realpathSync`.
const ROOT = fs.realpathSync(parsedRoot);
const INVENTORY_FILE = path.join(ROOT, "docs", "inventory.json");
const ROOT_REAL = ROOT;
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const inventory = readJson(INVENTORY_FILE);
const rootPackage = readJson(path.join(ROOT, "package.json"));
const errors = [];

const repoPath = (rel) => {
  if (typeof rel !== "string" || rel.trim() === "" || path.isAbsolute(rel)) return null;
  const resolved = path.resolve(ROOT, rel);
  const relative = path.relative(ROOT, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) return null;
  // Inventory is a review boundary, so a symlink must not smuggle a path
  // outside the checkout past the lexical check above.
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    const realRelative = path.relative(ROOT_REAL, real);
    if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`)) return null;
    return real;
  }
  return resolved;
};
const exists = (rel) => {
  const resolved = repoPath(rel);
  return resolved !== null && fs.existsSync(resolved);
};
const fail = (message) => errors.push(message);
const requireString = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} 必须是非空字符串`);
};

function workspaceLocation(item) {
  return typeof item === "string" ? item : item?.location;
}

function normalizeRepoPath(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownSection(text, heading, doc) {
  const headingPattern = new RegExp(`^##[ \\t]+${escapeRegex(heading)}[ \\t]*\\r?$`, "gmu");
  const matches = [...text.matchAll(headingPattern)];
  if (matches.length !== 1) {
    fail(`${doc} 必须且只能包含一个“## ${heading}”章节`);
    return null;
  }

  const start = matches[0].index + matches[0][0].length;
  const remaining = text.slice(start);
  const nextHeading = remaining.match(/^#{1,2}[ \t]+/mu);
  return remaining.slice(0, nextHeading?.index ?? remaining.length);
}

function rootScriptFromCommand(command) {
  const match = command.trim().match(/^npm[ \t]+run(?:[ \t]+--silent)?[ \t]+([A-Za-z0-9:_-]+)(?:[ \t]|$)/u);
  return match?.[1] ?? null;
}

function assistantCommandScripts(text, doc) {
  const section = markdownSection(text, "常用本地命令", doc);
  if (section === null) return new Set();
  const blocks = [...section.matchAll(/^```(?:bash|sh|shell)[ \t]*\r?$([\s\S]*?)^```[ \t]*\r?$/gmu)];
  if (blocks.length !== 1) {
    fail(`${doc} 的“常用本地命令”必须且只能包含一个 shell fenced block`);
    return new Set();
  }

  const scripts = new Set();
  for (const line of blocks[0][1].split(/\r?\n/u)) {
    const script = rootScriptFromCommand(line);
    if (script) scripts.add(script);
  }
  return scripts;
}

function firstMarkdownTableCell(line) {
  const match = line.match(/^[ \t]*\|([^|]*)\|/u);
  return match?.[1]?.trim() ?? null;
}

function readmeCommandScripts(text) {
  const section = markdownSection(text, "常用开发命令", "README.md");
  if (section === null) return new Set();
  const lines = section.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => firstMarkdownTableCell(line) === "命令");
  const separator = headerIndex >= 0 ? firstMarkdownTableCell(lines[headerIndex + 1] ?? "") : null;
  if (headerIndex < 0 || !/^:?-{3,}:?$/u.test(separator ?? "")) {
    fail("README.md 的“常用开发命令”必须包含以“命令”为首列的 Markdown 表格");
    return new Set();
  }

  const scripts = new Set();
  for (const line of lines.slice(headerIndex + 2)) {
    const commandCell = firstMarkdownTableCell(line);
    if (commandCell === null) break;
    for (const codeSpan of commandCell.matchAll(/`([^`\r\n]+)`/gu)) {
      const script = rootScriptFromCommand(codeSpan[1]);
      if (script) scripts.add(script);
    }
  }
  return scripts;
}

function workspaceCommandFromText(command) {
  // npm accepts `--workspace <name>` and `-w <name>`; the trailing guard keeps
  // `run stack` from also matching `run stack:stop`.
  const match = command.match(
    /npm[ \t]+(?:--workspace|-w)[ \t]+(\S+)[ \t]+run[ \t]+([A-Za-z0-9:_-]+)(?![A-Za-z0-9:_-])/u,
  );
  return match ? { kind: "workspace", workspace: match[1], script: match[2] } : null;
}

function assistantWorkspaceCommands(text, doc) {
  const section = markdownSection(text, "常用本地命令", doc);
  if (section === null) return new Set();
  const blocks = [...section.matchAll(/^```(?:bash|sh|shell)[ \t]*\r?$([\s\S]*?)^```[ \t]*\r?$/gmu)];
  if (blocks.length !== 1) return new Set();
  const keys = new Set();
  for (const line of blocks[0][1].split(/\r?\n/u)) {
    const command = workspaceCommandFromText(line);
    if (command) keys.add(commandKey(command));
  }
  return keys;
}

function enumerateWorkspaceCommands() {
  const commands = [];
  for (const item of rootPackage.workspaces ?? []) {
    const location = workspaceLocation(item);
    if (!location) continue;
    const packageFile = path.join(ROOT, location, "package.json");
    const workspace = packageName(packageFile);
    if (typeof workspace !== "string") continue;
    for (const script of Object.keys(packageScripts(packageFile)).sort()) {
      commands.push({ kind: "workspace", workspace, script });
    }
  }
  return commands;
}

/**
 * The root command table only owns `package.json.scripts`, so every workspace
 * script used to be invisible to the completeness gate.  Each one must now be
 * either listed in the assistant command block or registered here with a
 * machine-checked justification: a root script that provably invokes it, or a
 * document that literally spells the command out.
 */
function checkWorkspaceCommandScope(documented) {
  const scope = inventory.workspaceCommandScope;
  if (!Array.isArray(scope)) {
    fail("inventory.workspaceCommandScope 必须是数组");
    return;
  }
  const registered = new Map();
  for (const [index, entry] of scope.entries()) {
    const owner = `workspaceCommandScope[${index}]`;
    if (!entry || typeof entry !== "object") { fail(`${owner} 必须是 object`); continue; }
    requireString(entry.reason, `${owner}.reason`);
    const command = entry.command;
    if (command?.kind !== "workspace") { fail(`${owner}.command.kind 必须为 workspace`); continue; }
    checkCommand(command, owner);
    const key = commandKey(command);
    if (!key) continue;
    if (registered.has(key)) fail(`${owner} 重复登记：${key}`);
    registered.set(key, entry);
    if (documented.has(key)) {
      fail(`${owner} 已在助手命令表登记，不得再列为作用域外：${key}`);
    }
    const hasSuperseded = entry.supersededBy !== undefined;
    const hasDocumented = entry.documentedIn !== undefined;
    if (hasSuperseded === hasDocumented) {
      fail(`${owner} 必须且只能声明 supersededBy 或 documentedIn 之一`);
      continue;
    }
    if (hasSuperseded) {
      // 锚点必须自己已被文档登记，否则这条登记是橡皮图章：`commandCovers` 在
      // command key 相同时直接短路返回 true，一个脚本可以拿自己当锚点自证；两个
      // 互相调用、谁都没进命令表的脚本也能互证。root 锚点的文档保证来自
      // `checkRootCommandTable`，workspace 锚点则必须自己就在助手命令表里。
      const anchorKey = commandKey(entry.supersededBy);
      if (entry.supersededBy?.kind !== "root" && !(anchorKey && documented.has(anchorKey))) {
        fail(`${owner}.supersededBy 必须锚定到根命令或助手命令表已登记的 workspace 命令：${anchorKey ?? "无效命令"}`);
        continue;
      }
      checkCommand(entry.supersededBy, `${owner}.supersededBy`);
      if (commandExists(entry.supersededBy) && !commandCovers(entry.supersededBy, command)) {
        fail(`${owner}.supersededBy 并未实际调用 ${key}：${commandKey(entry.supersededBy)}`);
      }
      continue;
    }
    requireString(entry.documentedIn, `${owner}.documentedIn`);
    if (typeof entry.documentedIn !== "string") continue;
    if (!exists(entry.documentedIn)) {
      fail(`${owner}.documentedIn 文档不存在：${entry.documentedIn}`);
      continue;
    }
    const docText = fs.readFileSync(repoPath(entry.documentedIn), "utf8");
    const literal = new RegExp(
      `npm[ \\t]+--workspace[ \\t]+${escapeRegex(command.workspace)}[ \\t]+run[ \\t]+${escapeRegex(command.script)}(?![A-Za-z0-9:_-])`,
      "u",
    );
    if (!literal.test(docText)) {
      fail(`${owner}.documentedIn 未写出命令原文：${entry.documentedIn} 缺少 ${key}`);
    }
  }

  const missing = enumerateWorkspaceCommands()
    .map((command) => commandKey(command))
    .filter((key) => key && !documented.has(key) && !registered.has(key));
  if (missing.length > 0) {
    fail(`workspace 脚本既未登记进助手命令表也未登记作用域：${missing.join(", ")}`);
  }
  const stale = [...registered.keys()].filter((key) => {
    const command = registered.get(key).command;
    return !commandExists(command);
  });
  if (stale.length > 0) fail(`workspaceCommandScope 登记了不存在的 workspace 命令：${stale.join(", ")}`);
}

// Any workspace command spelled out in a root document must resolve to a real
// script, otherwise a rename leaves copy-pasteable but broken instructions.
function checkWorkspaceCommandLiterals(doc, text) {
  const seen = new Set();
  const literalRe = /npm[ \t]+(?:--workspace|-w)[ \t]+(\S+)[ \t]+run[ \t]+([A-Za-z0-9:_-]+)(?![A-Za-z0-9:_-])/gu;
  for (const match of text.matchAll(literalRe)) {
    const command = { kind: "workspace", workspace: match[1], script: match[2] };
    const key = commandKey(command);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!commandExists(command)) fail(`${doc} 引用了不存在的 workspace 命令：${key}`);
  }
}

function checkRootCommandTable(doc, scripts) {
  const declared = Object.keys(rootPackage.scripts ?? {}).sort();
  const missing = declared.filter((script) => !scripts.has(script));
  const stale = [...scripts].filter(
    (script) => !Object.prototype.hasOwnProperty.call(rootPackage.scripts ?? {}, script),
  ).sort();
  if (missing.length > 0) fail(`${doc} 的常用命令登记缺少根命令：${missing.join(", ")}`);
  if (stale.length > 0) fail(`${doc} 的常用命令登记包含不存在的根命令：${stale.join(", ")}`);
}

const TS_MODULE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];

function resolveLocalModule(importer, specifier) {
  if (typeof specifier !== "string" || (!specifier.startsWith("./") && !specifier.startsWith("../"))) {
    return null;
  }
  const importerPath = repoPath(importer);
  if (!importerPath) return null;
  const base = path.resolve(path.dirname(importerPath), specifier);
  const candidates = [base];
  if (!TS_MODULE_EXTENSIONS.includes(path.extname(base))) {
    for (const extension of TS_MODULE_EXTENSIONS) candidates.push(`${base}${extension}`);
    for (const extension of TS_MODULE_EXTENSIONS) candidates.push(path.join(base, `index${extension}`));
  }
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const relative = path.relative(ROOT, fs.realpathSync(candidate));
    if (relative === ".." || relative.startsWith(`..${path.sep}`)) return null;
    return normalizeRepoPath(relative);
  }
  return null;
}

function discoverLocalImports(entry) {
  const file = repoPath(entry);
  if (!file || !fs.existsSync(file)) return [];
  let source;
  try { source = fs.readFileSync(file, "utf8"); } catch { return []; }
  const imports = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s*)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const resolved = resolveLocalModule(entry, match[1]);
    if (resolved) imports.push(resolved);
  }
  return imports;
}

/** Resolve package `main` files into repository-relative active entry points. */
function discoverWorkspaceEntries() {
  const entries = [];
  for (const item of rootPackage.workspaces ?? []) {
    const location = workspaceLocation(item);
    if (typeof location !== "string" || location.trim() === "") continue;
    const packageFile = path.join(ROOT, location, "package.json");
    let pkg;
    try { pkg = readJson(packageFile); } catch { continue; }
    if (typeof pkg.main !== "string" || pkg.main.trim() === "") continue;
    entries.push(normalizeRepoPath(path.posix.join(normalizeRepoPath(location), pkg.main)));
  }
  return entries;
}

/**
 * A workspace main file can delegate registration to an imported composition
 * module. Keep those roots visible: package.main alone would miss the Colyseus
 * room/router assembly in app.config.ts.
 */
function discoverWorkspaceCompositionEntries(workspaceEntries) {
  const entries = [];
  for (const workspaceEntry of workspaceEntries) {
    for (const imported of discoverLocalImports(workspaceEntry)) {
      const importedPath = repoPath(imported);
      if (!importedPath) continue;
      let source = "";
      try { source = fs.readFileSync(importedPath, "utf8"); } catch { continue; }
      if (/(?:^|\/)app\.config\.[cm]?[jt]sx?$/.test(imported) || /\bdefineServer\s*\(/.test(source)) {
        entries.push(imported);
      }
    }
  }
  return entries;
}

const UUID_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Creator keeps five UUID hex digits and packs the remaining nibbles in base64. */
function compressCreatorUuid(uuid) {
  if (typeof uuid !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    return null;
  }
  const hex = uuid.replaceAll("-", "").toLowerCase();
  let compressed = hex.slice(0, 5);
  for (let index = 5; index < hex.length; index += 3) {
    const value = Number.parseInt(hex.slice(index, index + 3), 16);
    compressed += UUID_BASE64[value >> 6] + UUID_BASE64[value & 0x3f];
  }
  return compressed;
}

function canonicalSceneScriptEntry(metaFile, sourceRoot) {
  const cocosEntry = normalizeRepoPath(path.relative(ROOT, metaFile.slice(0, -".meta".length)));
  const suffix = path.relative(sourceRoot, metaFile.slice(0, -".meta".length));
  const clientEntry = path.join(ROOT, "apps", "client", "src", suffix);
  return fs.existsSync(clientEntry)
    ? normalizeRepoPath(path.relative(ROOT, clientEntry))
    : cocosEntry;
}

/**
 * Cocos stores script references as UUIDs in scene files. Resolve those UUIDs
 * back to source `.ts` paths so a newly mounted default component cannot be
 * omitted from the inventory silently.
 */
function discoverSceneScriptEntries(scene) {
  if (typeof scene !== "string") return [];
  const scenePath = repoPath(scene);
  if (!scenePath || !fs.existsSync(scenePath)) return [];
  let sceneText;
  try { sceneText = fs.readFileSync(scenePath, "utf8"); } catch { return []; }
  const serializedTypes = new Set(
    [...sceneText.matchAll(/"__type__"\s*:\s*"([^"]+)"/g)].map((match) => match[1]),
  );
  const sourceRoot = path.join(ROOT, "apps", "Cocos", "assets", "src");
  const result = [];
  const walk = (directory) => {
    let children;
    try { children = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const child of children) {
      const full = path.join(directory, child.name);
      if (child.isDirectory()) { walk(full); continue; }
      if (!child.isFile() || !child.name.endsWith(".ts.meta")) continue;
      let meta;
      try { meta = readJson(full); } catch { continue; }
      const compressed = compressCreatorUuid(meta.uuid);
      if (typeof meta.uuid !== "string"
        || (!serializedTypes.has(meta.uuid) && (!compressed || !serializedTypes.has(compressed)))) continue;
      result.push(canonicalSceneScriptEntry(full, sourceRoot));
    }
  };
  walk(sourceRoot);
  return result;
}

function discoverDefaultEntries() {
  const workspaceEntries = discoverWorkspaceEntries();
  const discovered = new Set(workspaceEntries);
  for (const entry of discoverWorkspaceCompositionEntries(workspaceEntries)) discovered.add(entry);
  const scene = inventory?.defaultScene ?? "apps/Cocos/assets/scene.scene";
  if (typeof scene === "string" && exists(scene)) {
    discovered.add(normalizeRepoPath(scene));
    for (const entry of discoverSceneScriptEntries(scene)) discovered.add(entry);
  }
  return discovered;
}

if (!inventory || typeof inventory !== "object") fail("inventory 必须是 JSON object");
if (inventory?.version !== 1) fail(`inventory.version 必须为 1（实际 ${String(inventory?.version)}）`);
const capabilities = Array.isArray(inventory?.capabilities) ? inventory.capabilities : [];
const defaultModules = Array.isArray(inventory?.defaultModules) ? inventory.defaultModules : [];
if (capabilities.length === 0) fail("capabilities 不能为空数组");
if (defaultModules.length === 0) fail("defaultModules 不能为空数组");
if (typeof inventory?.defaultScene !== "string" || inventory.defaultScene.trim() === "") {
  fail("defaultScene 必须是非空路径");
} else if (!exists(inventory.defaultScene)) {
  fail(`defaultScene 不存在：${inventory.defaultScene}`);
}

const ids = new Set();
const allEntries = new Set();
const capabilityEntries = new Map();
for (const [index, capability] of capabilities.entries()) {
  if (!capability || typeof capability !== "object") { fail(`capabilities[${index}] 必须是 object`); continue; }
  for (const key of ["id", "category", "defaultEntry", "sourceOfTruth", "wireBoundary"]) requireString(capability[key], `capabilities[${index}].${key}`);
  if (ids.has(capability.id)) fail(`能力 id 重复：${capability.id}`);
  ids.add(capability.id);
  if (typeof capability.defaultEntry === "string") {
    const previous = capabilityEntries.get(capability.defaultEntry);
    if (previous) fail(`能力 defaultEntry 重复：${capability.defaultEntry}（${previous} 与 ${capability.id}）`);
    else capabilityEntries.set(capability.defaultEntry, capability.id);
  }
  if (capability.category !== "core" && capability.category !== "extra") fail(`能力 ${capability.id} category 必须为 core/extra`);
  for (const key of ["defaultEntry", "sourceOfTruth", "wireBoundary"]) {
    if (!exists(capability[key])) fail(`能力 ${capability.id} 路径不存在：${capability[key]}`);
  }
  if (typeof capability.defaultEntry === "string") allEntries.add(capability.defaultEntry);
  if (!Array.isArray(capability.docs) || capability.docs.length === 0) fail(`能力 ${capability.id} 缺少 authoritative docs`);
  for (const doc of capability.docs ?? []) {
    if (!exists(doc)) fail(`能力 ${capability.id} 文档不存在：${doc}`);
    else checkMarkdownLinks(doc);
  }
  if (!Array.isArray(capability.verification) || capability.verification.length === 0) fail(`能力 ${capability.id} 缺少 verification 命令`);
  for (const command of capability.verification ?? []) checkCommand(command, `能力 ${capability.id}`);
  const hasExtraTruth = (capability.docs ?? []).some((doc) => doc === "docs/EXTRAFEATURES.md");
  if (capability.category === "extra" && !hasExtraTruth) {
    fail(`额外能力 ${capability.id} 必须引用 docs/EXTRAFEATURES.md 作为权威边界`);
  }
  if (capability.category === "core" && hasExtraTruth) {
    fail(`核心能力 ${capability.id} 不得把 docs/EXTRAFEATURES.md 登记为权威能力文档`);
  }
  if (capability.launch !== undefined) {
    if (capability.category !== "extra") {
      fail(`能力 ${capability.id} 的独立 launch 只能登记为 extra`);
    }
    checkCommand(capability.launch, `能力 ${capability.id}.launch`);
    if (typeof capability.defaultEntry === "string"
      && commandExists(capability.launch)
      && !commandInvokesEntry(capability.launch, capability.defaultEntry)) {
      fail(`能力 ${capability.id}.launch 未实际启动 defaultEntry：${capability.defaultEntry}`);
    }
  }
}

const registeredDefaults = new Set();
const defaultDocs = new Set();
for (const [index, module] of defaultModules.entries()) {
  if (!module || typeof module !== "object") { fail(`defaultModules[${index}] 必须是 object`); continue; }
  requireString(module.entry, `defaultModules[${index}].entry`);
  if (!exists(module.entry)) fail(`默认入口不存在：${module.entry}`);
  if (registeredDefaults.has(module.entry)) fail(`默认入口重复：${module.entry}`);
  registeredDefaults.add(module.entry);
  if (!Array.isArray(module.capabilities) || module.capabilities.length === 0) {
    fail(`默认入口 ${module.entry} 缺少 capabilities 映射`);
  } else {
    const seenCapabilities = new Set();
    for (const capabilityId of module.capabilities) {
      if (typeof capabilityId !== "string" || !ids.has(capabilityId)) {
        fail(`默认入口 ${module.entry} 引用了未知能力：${String(capabilityId)}`);
      }
      if (seenCapabilities.has(capabilityId)) fail(`默认入口 ${module.entry} 能力重复：${capabilityId}`);
      seenCapabilities.add(capabilityId);
    }
  }
  if (!Array.isArray(module.docs) || module.docs.length === 0) fail(`默认入口 ${module.entry} 缺少文档`);
  for (const doc of module.docs ?? []) {
    if (defaultDocs.has(`${module.entry}\u0000${doc}`)) fail(`默认入口文档重复：${module.entry} → ${doc}`);
    defaultDocs.add(`${module.entry}\u0000${doc}`);
    if (!exists(doc)) fail(`默认入口 ${module.entry} 文档不存在：${doc}`);
    else checkMarkdownLinks(doc);
  }
}

// Derive active roots from package metadata and the default Cocos scene.  A
// fixed allow-list here would silently go stale when a workspace entry point
// or a scene-mounted script changes.
const discoveredDefaults = discoverDefaultEntries();
for (const entry of discoveredDefaults) {
  if (!registeredDefaults.has(entry)) fail(`默认活跃入口未登记：${entry}`);
}
for (const entry of registeredDefaults) {
  if (!discoveredDefaults.has(entry)) fail(`清单登记了非默认活跃入口：${entry}`);
}
for (const entry of allEntries) if (!registeredDefaults.has(entry) && entry.startsWith("apps/")) {
  // A capability's defaultEntry can be a component rather than a process root;
  // require it to be represented by a capability, while process roots above are mandatory.
  if (!exists(entry)) fail(`能力默认入口不存在：${entry}`);
}

const corePlan = inventory?.routeOfTruth?.corePlan;
const extra = inventory?.routeOfTruth?.extraCapabilities;
if (corePlan !== "plan-v3.md") fail("routeOfTruth.corePlan 必须指向 plan-v3.md");
if (!exists(corePlan) || !exists(extra)) fail("routeOfTruth 必须指向存在的核心计划与 EXTRAFEATURES.md");
else {
  const planText = fs.readFileSync(repoPath(corePlan), "utf8");
  const extraText = fs.readFileSync(repoPath(extra), "utf8");
  const readmeText = fs.readFileSync(repoPath("README.md"), "utf8");
  checkMarkdownLinks(corePlan);
  checkMarkdownLinks(extra);
  if (!/唯一真相/.test(planText)) fail("plan-v3.md 未声明当前计划唯一真相");
  if (!readmeText.includes("[当前开发收口计划](plan-v3.md)")) fail("README.md 未登记 plan-v3.md 当前计划入口");
  if (!readmeText.includes("](todo-godogen.md)")) fail("README.md 未登记 todo-godogen.md 对照计划入口");
  if (!/额外功能/.test(extraText)) fail("docs/EXTRAFEATURES.md 未声明额外能力真相");
  if (!extraText.includes("](../todo-godogen.md)")) {
    fail("docs/EXTRAFEATURES.md 未登记 todo-godogen.md 对照计划入口");
  }
  if (/^##\s+路线图/m.test(extraText)) fail("EXTRAFEATURES.md 不得维护第二套路线图");
}

if (!Array.isArray(inventory.referenceDocs)) {
  fail("referenceDocs 必须是数组");
} else {
  if (!inventory.referenceDocs.includes("plan.md")) fail("referenceDocs 必须登记历史 plan.md");
  if (!inventory.referenceDocs.includes("plan-v2.md")) fail("referenceDocs 必须登记历史 plan-v2.md");
  if (!inventory.referenceDocs.includes("todo-godogen.md")) {
    fail("referenceDocs 必须登记 Godogen 对照计划 todo-godogen.md");
  }
  const seenReferenceDocs = new Set();
  for (const doc of inventory.referenceDocs) {
    if (typeof doc !== "string" || doc.trim() === "") {
      fail("referenceDocs 只能包含非空路径");
      continue;
    }
    if (seenReferenceDocs.has(doc)) fail(`referenceDocs 重复：${doc}`);
    seenReferenceDocs.add(doc);
    if (!exists(doc)) fail(`referenceDocs 文档不存在：${doc}`);
    else checkMarkdownLinks(doc);
  }
}

// Keep the two assistant entry documents semantically identical while allowing
// harmless wrapping/trailing-space differences. Required clauses also prevent
// a synchronized edit from deleting the repository's critical invariants.
const agents = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
const claude = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const normalizeInstructionText = (text) => text.replace(/\s+/gu, " ").trim();
if (normalizeInstructionText(agents) !== normalizeInstructionText(claude)) {
  fail("AGENTS.md/CLAUDE.md 除空白外必须保持一致");
}
checkRootCommandTable("AGENTS.md", assistantCommandScripts(agents, "AGENTS.md"));
checkRootCommandTable("CLAUDE.md", assistantCommandScripts(claude, "CLAUDE.md"));
checkRootCommandTable("README.md", readmeCommandScripts(readme));
checkWorkspaceCommandScope(
  new Set([
    ...assistantWorkspaceCommands(agents, "AGENTS.md"),
    ...assistantWorkspaceCommands(claude, "CLAUDE.md"),
  ]),
);
for (const [doc, text] of [["AGENTS.md", agents], ["CLAUDE.md", claude], ["README.md", readme]]) {
  checkWorkspaceCommandLiterals(doc, text);
}
const assistantRequirements = [
  ["bitECS 锁定目录", "`apps/client/src/lib/bitecs/` 的 12 个 TypeScript 文件禁改"],
  ["生成镜像禁手改", "生成镜像禁手改"],
  // 铁律 2 的生成物清单必须完整：只校验标题在场会让新增生成物静默漏登记。
  ["state 生成物登记", "`apps/shared/src/protocol/state.ts` 与 `apps/server/src/rooms/schema/GameRoomState.ts`"],
  ["state 重生成命令", "npm --workspace @game/server run codegen:state"],
  ["HTTP manifest 生成物登记", "`apps/server/src/http/manifest.generated.ts`"],
  ["HTTP manifest 重生成命令", "npm --workspace @game/server run codegen:http"],
  ["项目元数据生成物登记", "`apps/shared/src/project.ts` 来自 `project.metadata.json`，用 `npm run init:project` 刷新"],
  ["shared 零依赖", "shared 零依赖"],
  ["相对导入无扩展名", "相对导入不带扩展名"],
  ["View/Logic 分离", "客户端 View/Logic 分离"],
  ["FairyGUI 动态导入", "FairyGUI 只走动态 import"],
  ["外部身份 HTTP 边界", "外部身份服务只走 HTTP 契约边界"],
  ["inventory 正向校验", "npm run verify:inventory"],
  ["inventory 反例测试", "npm run test:inventory"],
  ["Godogen 对照计划", "[todo-godogen.md](todo-godogen.md)"],
  ["当前计划唯一真相", "[plan-v3.md](plan-v3.md)"],
];
for (const [label, requirement] of assistantRequirements) {
  if (!agents.includes(requirement) || !claude.includes(requirement)) {
    fail(`AGENTS.md/CLAUDE.md 缺少共同关键指令：${label}`);
  }
}
checkMarkdownLinks("AGENTS.md");
checkMarkdownLinks("CLAUDE.md");

function packageScripts(packageFile) {
  try { return readJson(packageFile).scripts ?? {}; } catch { return {}; }
}

function packageName(packageFile) {
  try { return readJson(packageFile).name; } catch { return undefined; }
}

function commandKey(command) {
  if (command?.kind === "root") return `root:${command.script}`;
  if (command?.kind === "workspace") return `workspace:${command.workspace}#${command.script}`;
  return null;
}

function resolveWorkspace(command) {
  return (rootPackage.workspaces ?? []).find((item) => {
    const packagePath = workspaceLocation(item);
    return packagePath && packageName(path.join(ROOT, packagePath, "package.json")) === command.workspace;
  });
}

function commandScript(command) {
  if (command?.kind === "root") return rootPackage.scripts?.[command.script];
  if (command?.kind === "workspace") {
    const workspace = resolveWorkspace(command);
    if (!workspace) return undefined;
    const packagePath = workspaceLocation(workspace);
    return packageScripts(path.join(ROOT, packagePath, "package.json"))[command.script];
  }
  return undefined;
}

function commandBase(command) {
  if (command?.kind === "root") return ROOT;
  if (command?.kind === "workspace") {
    const workspace = resolveWorkspace(command);
    const location = workspaceLocation(workspace);
    return location ? path.join(ROOT, location) : null;
  }
  return null;
}

/**
 * 覆盖判定过去直接对整段 script 文本做正则匹配，于是 `echo npm run x`、`# npm run x`
 * 这类**写出了命令原文但不会执行**的文本也算数，`supersededBy`、`verification.requires`
 * 与 `launch.defaultEntry` 三处登记性断言因此都是橡皮图章。这里先按 shell 操作符切段，
 * 只有 segment 的首个 token 才被当作实际执行的命令。
 *
 * 边界（失败关闭，不猜）：`FOO=1 npm …`、`npx`、子 shell `( … )` 等形态今天仓内不存在，
 * 会被判为「未覆盖」而不是放行，逼调用方显式决策。短路操作符右侧（`false && npm …`）与
 * `exit` 之后的死代码不做可达性判定——shell 可达性静态不可判定。
 */
function executableSegments(script) {
  return script.split(/&&|\|\||[;|\n]/u).map((segment) => segment.trim()).filter(Boolean);
}

function segmentLeadsWith(segment, binaries) {
  const first = segment.split(/\s+/u)[0];
  return first !== undefined && binaries.includes(first);
}

function commandInvokesEntry(command, entry) {
  const script = commandScript(command);
  const base = commandBase(command);
  const target = repoPath(entry);
  if (typeof script !== "string" || !base || !target) return false;
  const relativeTarget = normalizeRepoPath(path.relative(base, target));
  const escaped = escapeRegex(relativeTarget);
  const mention = new RegExp(`(?:^|[\\s;&|])(?:\\./)?${escaped}(?=$|[\\s;&|])`);
  return executableSegments(script).some((segment) => {
    if (!mention.test(segment)) return false;
    // 新增启动器必须显式加入这张表（内联而非模块级 const：驱动段先于此处初始化执行）。
    return segmentLeadsWith(segment, ["node", "npm", "npx", "tsx", "sh", "bash"])
      || segmentLeadsWith(segment, [relativeTarget, `./${relativeTarget}`]);
  });
}

function commandReferences(command) {
  const script = commandScript(command);
  if (typeof script !== "string") return [];
  const references = [];
  // npm accepts both `--workspace <name>` and `-w <name>`; support the forms
  // used by this repository and ignore arbitrary shell commands.
  const workspaceRe = /npm\s+(?:--workspace|-w)\s+([^\s]+)\s+run\s+([A-Za-z0-9:_-]+)/g;
  const rootRe = /npm\s+run\s+([A-Za-z0-9:_-]+)/g;
  for (const segment of executableSegments(script)) {
    if (!segmentLeadsWith(segment, ["npm"])) continue;
    for (const match of segment.matchAll(workspaceRe)) {
      references.push({ kind: "workspace", workspace: match[1], script: match[2] });
    }
    for (const match of segment.matchAll(rootRe)) {
      references.push({ kind: "root", script: match[1] });
    }
  }
  return references;
}

function commandExists(command) {
  if (!command || typeof command !== "object") return false;
  if (command.kind === "root") return typeof command.script === "string" && !!rootPackage.scripts?.[command.script];
  if (command.kind === "workspace") {
    if (typeof command.workspace !== "string" || typeof command.script !== "string") return false;
    const workspace = resolveWorkspace(command);
    if (!workspace) return false;
    const packagePath = workspaceLocation(workspace);
    return !!packageScripts(path.join(ROOT, packagePath, "package.json"))[command.script];
  }
  return false;
}

function commandCovers(command, target, seen = new Set()) {
  const targetKey = commandKey(target);
  const currentKey = commandKey(command);
  if (!targetKey || !currentKey || !commandExists(command) || !commandExists(target)) return false;
  if (currentKey === targetKey) return true;
  if (seen.has(currentKey)) return false;
  seen.add(currentKey);
  return commandReferences(command).some((reference) => commandCovers(reference, target, seen));
}

function checkCommand(command, owner, stack = new Set()) {
  if (!command || typeof command !== "object") { fail(`${owner} verification 项必须是 object`); return; }
  if (command.kind === "root") {
    requireString(command.script, `${owner}.root.script`);
    if (!rootPackage.scripts?.[command.script]) fail(`${owner} 根命令不存在：${command.script}`);
  } else if (command.kind === "workspace") {
    requireString(command.workspace, `${owner}.workspace`);
    requireString(command.script, `${owner}.workspace.script`);
    const workspace = resolveWorkspace(command);
    if (!workspace) fail(`${owner} workspace 不存在：${command.workspace}`);
    else {
      const packagePath = workspaceLocation(workspace);
      if (!packageScripts(path.join(ROOT, packagePath, "package.json"))[command.script]) {
        fail(`${owner} workspace 命令不存在：${command.workspace}#${command.script}`);
      }
    }
  } else {
    fail(`${owner} verification.kind 必须为 root/workspace`);
    return;
  }

  if (command.requires === undefined) return;
  if (!Array.isArray(command.requires)) {
    fail(`${owner}.requires 必须是命令数组`);
    return;
  }
  const currentKey = commandKey(command);
  if (currentKey && stack.has(currentKey)) return;
  const nextStack = new Set(stack);
  if (currentKey) nextStack.add(currentKey);
  for (const [index, requirement] of command.requires.entries()) {
    const label = `${owner}.requires[${index}]`;
    checkCommand(requirement, label, nextStack);
    if (commandExists(requirement) && !commandCovers(command, requirement)) {
      fail(`${owner} 未实际覆盖声明的验证命令：${commandKey(requirement)}`);
    }
  }
}

function checkMarkdownLinks(doc) {
  if (!exists(doc)) return;
  const docPath = repoPath(doc);
  if (!docPath) return;
  const text = fs.readFileSync(docPath, "utf8");
  const anchors = markdownAnchors(text);
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const raw = match[1].trim();
    if (!raw) continue;
    const hash = raw.indexOf("#");
    const query = raw.indexOf("?");
    const splitAt = hash >= 0 && query >= 0 ? Math.min(hash, query) : Math.max(hash, query);
    const target = (splitAt >= 0 ? raw.slice(0, splitAt) : raw).trim();
    const fragment = hash >= 0 ? raw.slice(hash + 1).split("?", 1)[0] : "";
    if (target.startsWith("http:") || target.startsWith("https:") || target.startsWith("mailto:") || target.startsWith("//")) continue;
    if (!target && fragment) {
      if (!anchors.has(normalizeAnchor(fragment))) fail(`文档 ${doc} 的锚点不存在：#${fragment}`);
      continue;
    }
    if (!target) continue;
    const resolved = path.resolve(path.dirname(docPath), target);
    const relative = path.relative(ROOT, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || !fs.existsSync(resolved)) {
      fail(`文档 ${doc} 的链接不存在：${target}`);
      continue;
    }
    // A lexical in-tree link can still resolve through a symlink to bytes
    // outside the checkout. Treat that as an invalid link instead of allowing
    // an external document to satisfy the inventory contract.
    let realResolved;
    try { realResolved = fs.realpathSync(resolved); } catch {
      fail(`文档 ${doc} 的链接不可解析：${target}`);
      continue;
    }
    const realRelative = path.relative(ROOT_REAL, realResolved);
    if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`)) {
      fail(`文档 ${doc} 的链接越出项目根：${target}`);
      continue;
    }
    if (fragment && path.extname(resolved).toLowerCase() === ".md") {
      const targetText = fs.readFileSync(realResolved, "utf8");
      if (!markdownAnchors(targetText).has(normalizeAnchor(fragment))) {
        fail(`文档 ${doc} 的锚点不存在：${target}#${fragment}`);
      }
    }
  }
}

/** GitHub-style heading slug, including the CJK headings used in this repo. */
function normalizeAnchor(value) {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* retain malformed fragment for a useful error */ }
  return decoded
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    // Keep letters/numbers (including CJK), spaces, hyphens and underscores;
    // GitHub drops punctuation such as `、`, `—`, and `§` from heading slugs.
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s_-]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function markdownAnchors(text) {
  const anchors = new Set();
  const counts = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = normalizeAnchor(match[1]);
    if (!base) continue;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  // Explicit HTML anchors are common in generated/reference docs.
  for (const match of text.matchAll(/<(?:a|[^>]+)\s+(?:id|name)=["']([^"']+)["'][^>]*>/gi)) {
    anchors.add(normalizeAnchor(match[1]));
  }
  return anchors;
}

/**
 * npm records an integrity digest for local tarballs too, but npm install is
 * not the only way this checkout is consumed. Recompute every file:*.tgz
 * entry so a replaced vendored contract cannot pass inventory verification.
 */
function verifyLocalTarballIntegrity() {
  const lockFile = path.join(ROOT, "package-lock.json");
  if (!fs.existsSync(lockFile)) { fail("package-lock.json 不存在，无法校验本地 tarball integrity"); return; }
  let lock;
  try { lock = readJson(lockFile); } catch { fail("package-lock.json 不是有效 JSON"); return; }
  const packages = lock?.packages;
  if (!packages || typeof packages !== "object") { fail("package-lock.json 缺少 packages 映射"); return; }
  let checked = 0;
  for (const [key, entry] of Object.entries(packages)) {
    if (!entry || typeof entry !== "object" || typeof entry.resolved !== "string" || !entry.resolved.startsWith("file:")) continue;
    const reference = entry.resolved.slice("file:".length);
    if (!reference.toLowerCase().endsWith(".tgz")) continue;
    const marker = "/node_modules/";
    const markerIndex = key.indexOf(marker);
    const packageBase = markerIndex >= 0 ? path.join(ROOT, key.slice(0, markerIndex)) : ROOT;
    const tarball = path.resolve(packageBase, reference);
    const relative = path.relative(ROOT, tarball);
    if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
      fail(`package-lock 本地 tarball 路径越界：${key} → ${entry.resolved}`);
      continue;
    }
    if (!fs.existsSync(tarball)) { fail(`package-lock 本地 tarball 不存在：${entry.resolved}`); continue; }
    const integrity = typeof entry.integrity === "string" ? entry.integrity.trim() : "";
    const candidates = integrity.split(/\s+/).filter(Boolean).map((token) => {
      const separator = token.indexOf("-");
      return separator > 0 ? { algorithm: token.slice(0, separator), digest: token.slice(separator + 1) } : null;
    }).filter(Boolean);
    if (candidates.length === 0) { fail(`package-lock 本地 tarball 缺少 integrity：${key}`); continue; }
    let matched = false;
    for (const candidate of candidates) {
      try {
        const actual = createHash(candidate.algorithm).update(fs.readFileSync(tarball)).digest("base64");
        if (actual === candidate.digest) { matched = true; break; }
      } catch {
        // Unsupported SRI algorithms are ignored; another declared digest may match.
      }
    }
    if (!matched) fail(`package-lock 本地 tarball integrity 不符：${entry.resolved}`);
    checked++;
  }
  if (checked === 0) fail("package-lock 未登记任何本地 .tgz 依赖");
}

verifyLocalTarballIntegrity();

if (errors.length > 0) {
  for (const error of errors) console.error(`✘ ${error}`);
  process.exitCode = 1;
} else {
  console.log(`✔ inventory ${capabilities.length} 项能力、${defaultModules.length} 个默认入口校验通过`);
}
