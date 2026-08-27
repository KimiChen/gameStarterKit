/**
 * Verify the capability inventory against the checked-out repository.
 * The inventory is intentionally data-only; this script makes paths, commands,
 * documentation and the default entry points executable review invariants.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY_FILE = path.join(ROOT, "docs", "inventory.json");
const ROOT_REAL = fs.realpathSync(ROOT);
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

if (!inventory || typeof inventory !== "object") fail("inventory 必须是 JSON object");
if (inventory?.version !== 1) fail(`inventory.version 必须为 1（实际 ${String(inventory?.version)}）`);
const capabilities = Array.isArray(inventory?.capabilities) ? inventory.capabilities : [];
const defaultModules = Array.isArray(inventory?.defaultModules) ? inventory.defaultModules : [];
if (capabilities.length === 0) fail("capabilities 不能为空数组");
if (defaultModules.length === 0) fail("defaultModules 不能为空数组");

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
  if (capability.category === "extra"
    && !(capability.docs ?? []).some((doc) => doc === "docs/EXTRAFEATURES.md")) {
    fail(`额外能力 ${capability.id} 必须引用 docs/EXTRAFEATURES.md 作为权威边界`);
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
  if (!Array.isArray(module.docs) || module.docs.length === 0) fail(`默认入口 ${module.entry} 缺少文档`);
  for (const doc of module.docs ?? []) {
    if (defaultDocs.has(`${module.entry}\u0000${doc}`)) fail(`默认入口文档重复：${module.entry} → ${doc}`);
    defaultDocs.add(`${module.entry}\u0000${doc}`);
    if (!exists(doc)) fail(`默认入口 ${module.entry} 文档不存在：${doc}`);
    else checkMarkdownLinks(doc);
  }
}

// These are the active roots wired by the default server/client/shared launchers.
for (const entry of ["apps/server/src/index.ts", "apps/client/src/Main.ts", "apps/shared/src/index.ts"]) {
  if (!registeredDefaults.has(entry)) fail(`默认活跃入口未登记：${entry}`);
}
for (const entry of allEntries) if (!registeredDefaults.has(entry) && entry.startsWith("apps/")) {
  // A capability's defaultEntry can be a component rather than a process root;
  // require it to be represented by a capability, while process roots above are mandatory.
  if (!exists(entry)) fail(`能力默认入口不存在：${entry}`);
}

const corePlan = inventory?.routeOfTruth?.corePlan;
const extra = inventory?.routeOfTruth?.extraCapabilities;
if (!exists(corePlan) || !exists(extra)) fail("routeOfTruth 必须指向存在的 plan.md 与 EXTRAFEATURES.md");
else {
  const planText = fs.readFileSync(repoPath(corePlan), "utf8");
  const extraText = fs.readFileSync(repoPath(extra), "utf8");
  checkMarkdownLinks(corePlan);
  checkMarkdownLinks(extra);
  if (!/核心改进优先级/.test(planText)) fail("plan.md 未声明核心改进优先级真相");
  if (!/额外功能/.test(extraText)) fail("docs/EXTRAFEATURES.md 未声明额外能力真相");
  if (/^##\s+路线图/m.test(extraText)) fail("EXTRAFEATURES.md 不得维护第二套路线图");
}

// Keep the two assistant instruction files aligned on the rules that affect code generation and verification.
const agents = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
const claude = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
for (const marker of ["shared 零依赖", "生成镜像", "bitECS", "View/Logic", "FairyGUI", "外部身份服务"]) {
  if (!agents.includes(marker) || !claude.includes(marker)) fail(`AGENTS.md/CLAUDE.md 缺少共同关键指令：${marker}`);
}

function packageScripts(packageFile) {
  try { return readJson(packageFile).scripts ?? {}; } catch { return {}; }
}

function packageName(packageFile) {
  try { return readJson(packageFile).name; } catch { return undefined; }
}

function checkCommand(command, owner) {
  if (!command || typeof command !== "object") { fail(`${owner} verification 项必须是 object`); return; }
  if (command.kind === "root") {
    requireString(command.script, `${owner}.root.script`);
    if (!rootPackage.scripts?.[command.script]) fail(`${owner} 根命令不存在：${command.script}`);
    return;
  }
  if (command.kind === "workspace") {
    requireString(command.workspace, `${owner}.workspace`);
    requireString(command.script, `${owner}.workspace.script`);
    const workspace = (rootPackage.workspaces ?? []).find((item) => {
      const packagePath = typeof item === "string" ? item : item?.location;
      return packagePath && packageName(path.join(ROOT, packagePath, "package.json")) === command.workspace;
    });
    if (!workspace) { fail(`${owner} workspace 不存在：${command.workspace}`); return; }
    const packagePath = typeof workspace === "string" ? workspace : workspace.location;
    if (!packageScripts(path.join(ROOT, packagePath, "package.json"))[command.script]) fail(`${owner} workspace 命令不存在：${command.workspace}#${command.script}`);
    return;
  }
  fail(`${owner} verification.kind 必须为 root/workspace`);
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
    if (fragment && path.extname(resolved).toLowerCase() === ".md") {
      const targetText = fs.readFileSync(resolved, "utf8");
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
