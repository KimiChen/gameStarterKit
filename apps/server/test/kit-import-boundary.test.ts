/**
 * kit 导入边界（docs/KIT.md §4 / §6 / §9 K1；docs/MMO.md MF0；docs/MMO-PLAN.md MF0-B2）——服务端 + shared 侧三道规则与 `.conn` 禁令。
 *
 * ① kit 服务端代码 `apps/server/src/kits/<id>/**`（K0 形态，保留）：每个 import / export-from 说明符
 *    - 相对路径只能落在本 kit 目录内，或恰好是框架门面 `core/infra/kitApi`（⛔ core/infra 其他模块、core/economy、core/uow、rooms/、websocket/ …
 *      ——它们不是 kit-api，走了就等于绕过表闸 / 账本 / 效果通道）；
 *    - 裸说明符只允许 `@game/shared` 及其子路径（零依赖 shared）；⛔ ioredis / mysql2 / colyseus / node:* 等运行时依赖（type-only 也算）。
 * ② K1 · 插件与 kit 的其余服务端代码按**解析后的仓相对路径**判：
 *    - 插件（`apps/server/src/core/<id>/**`、`apps/server/src/websocket/<域>/**`、`apps/server/src/core/<域>/**`、玩法模式 `rooms/modes/<modeId>/**`）
 *      落进 kit 命名空间只许 `apps/server/src/kits/<kit>/api/**` 与 `@game/shared/kits/<kit>/api/**`，且 kit ∈ plugin.json.requires.kits；
 *    - kit 自己的域端点 / 模式代码可用本 kit 任何模块；⛔ 别的 kit（v0 无 kit-on-kit）。
 * ③ K1 · shared 侧（`apps/shared/src/**`，生成物除外）：`apps/shared/src/kits/<a>/**` ⛔ 落进别的 kit；域描述符 `protocol/lobbyRpc/domains/<d>.ts`
 *    与其非生成校验器 `protocol/lobbyRpc/checks/<d>.ts` **同属主**、按域归属判（插件的域只许声明 kit 的 `api/**`，kit 的域只许本 kit）；
 *    玩法 wire `gameplays/<modeId>/**` 按模式归属判；其余框架 shared 文件
 *    ⛔ 依赖任何 kit 目录（框架只放行 `kits/catalog*` 生成目录）。
 * ④ K1 · `.conn` 禁令：kit / 插件服务端代码 ⛔ 触碰 KitTx.conn（`tx.conn`、`tx["conn"]`、解构 `{ conn }`），用 TypeScript AST 扫，⛔ 裸正则
 *    （注释与字符串字面量不算命中）。
 * 框架自己的 kits/catalog*.ts 不在扫描集内；宿主自有插件（plugin.json 无 version）与框架目录不在 K1 扫描面。
 * 客户端侧同一道闸：apps/client/test/kitImportBoundary.test.ts。
 *
 * 变异验证（改哪一行 → 哪条用例转红）：删 scanConnAccess 的 PropertyAccess 分支 → 夹具「tx.conn」转红；删 judgeServerImport 的
 * `/api/` 判断 → 夹具「kit 内部模块」转红；删 judgeSharedImport 的 kit-on-kit 分支 → 夹具「shared kit-on-kit」转红；
 * 删 judgeKitImport 的 kitRoot 判断 → 既有自测「越出 kit 目录」转红。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const SERVER_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const REPO_ROOT = path.resolve(SERVER_SRC, "../../..");
const KITS_DIR = path.join(SERVER_SRC, "kits");
const KIT_API = path.join(SERVER_SRC, "core/infra/kitApi");

const SERVER_KITS_NS = "apps/server/src/kits/";
const SHARED_SRC = "apps/shared/src/";
const SHARED_KITS_NS = "apps/shared/src/kits/";
const SHARED_BARE = "@game/shared/";
const SHARED_DOMAINS_DIR = "apps/shared/src/protocol/lobbyRpc/domains/";
/**
 * 域的**非生成**校验器目录（`checks/<域>.ts`，BF2）：与域 descriptor **同属主**——schema 生成的 descriptor
 * 只渲染 `check` 钩子的调用，校验逻辑本体住在这里（`../checks/<域>`、`../economy`、kit 的 api 面）。
 * ⛔ 不把 `checks/` 当框架文件：那会让 arena / slg 这类「用本 kit api 面校验自己域」的既有形态集体变红。
 */
const SHARED_DOMAIN_CHECKS_DIR = "apps/shared/src/protocol/lobbyRpc/checks/";
const SHARED_GAMEPLAYS_DIR = "apps/shared/src/gameplays/";

/** 递归收集 .ts；`*.generated.ts` 由 writer 拥有（MF9 的 kits/<id>/contributions.generated.ts 会静态 import 插件模块），⛔ 不进扫描面。 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".generated.ts")) out.push(full);
  }
  return out;
}

/** 目录不存在 → 空；给的是文件 → 只它自己。 */
function walkIfExists(target: string): string[] {
  if (!fs.existsSync(target)) return [];
  if (fs.statSync(target).isFile()) return target.endsWith(".ts") ? [target] : [];
  return walk(target);
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** import / export … from "x"、import "x"、动态 import("x") 的说明符。 */
export function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gu)) out.push(m[1]);
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/gu)) out.push(m[1]);
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu)) out.push(m[1]);
  return out;
}

/** 规则 ①（K0）纯函数判定，导出给单测自测。返回 null = 放行，否则是拒绝理由。 */
export function judgeKitImport(file: string, specifier: string): string | null {
  const kitId = path.relative(KITS_DIR, file).split(path.sep)[0];
  const kitRoot = path.join(KITS_DIR, kitId);
  if (specifier.startsWith(".")) {
    const target = path.resolve(path.dirname(file), specifier);
    if (target === KIT_API) return null;
    if (target === kitRoot || target.startsWith(kitRoot + path.sep)) return null;
    return `相对导入越出 kit 目录且不是 kit-api 门面：${specifier}`;
  }
  if (specifier === "@game/shared" || specifier.startsWith("@game/shared/")) return null;
  return `裸说明符只允许 @game/shared*：${specifier}`;
}

// ── K1：包登记与归属 ─────────────────────────────────────────────────────────

export interface ServerPackage {
  readonly cls: "plugin" | "kit";
  readonly id: string;
  /** 插件声明依赖的 kit id（plugin.json.requires.kits 的键）；kit 恒空（v0 无 kit-on-kit）。 */
  readonly requiresKits: readonly string[];
  readonly domains: readonly string[];
  readonly modeIds: readonly string[];
}

export interface BoundaryViolation {
  readonly file: string;
  readonly specifier: string;
  readonly reason: string;
}

export interface ConnAccess {
  readonly file: string;
  readonly line: number;
  readonly form: "property" | "element" | "binding";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readJson(file: string): Record<string, unknown> | null {
  if (!fs.existsSync(file)) return null;
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  return isRecord(parsed) ? parsed : null;
}

/** 从 apps/plugins/<id>/plugin.json 与 apps/kits/<id>/kit.json 读包身份；宿主自有插件（无 version）不进扫描面。 */
export function loadServerPackages(root: string): ServerPackage[] {
  const packages: ServerPackage[] = [];
  const pluginsDir = path.join(root, "apps/plugins");
  for (const dir of fs.existsSync(pluginsDir) ? fs.readdirSync(pluginsDir).sort() : []) {
    const manifest = readJson(path.join(pluginsDir, dir, "plugin.json"));
    if (!manifest || typeof manifest.id !== "string" || typeof manifest.version !== "string") continue;
    const requires = isRecord(manifest.requires) && isRecord(manifest.requires.kits) ? Object.keys(manifest.requires.kits).sort() : [];
    const gameplay = readJson(path.join(pluginsDir, dir, "gameplay/manifest.json"));
    const modeIds = gameplay && typeof gameplay.id === "string" ? [gameplay.id] : [];
    packages.push({ cls: "plugin", id: manifest.id, requiresKits: requires, domains: stringArray(manifest.domains), modeIds });
  }
  const kitsDir = path.join(root, "apps/kits");
  for (const dir of fs.existsSync(kitsDir) ? fs.readdirSync(kitsDir).sort() : []) {
    const manifest = readJson(path.join(kitsDir, dir, "kit.json"));
    if (!manifest || typeof manifest.id !== "string") continue;
    const modeIds: string[] = [];
    for (const mode of Array.isArray(manifest.modes) ? manifest.modes : []) {
      if (isRecord(mode) && typeof mode.id === "string") modeIds.push(mode.id);
    }
    packages.push({ cls: "kit", id: manifest.id, requiresKits: [], domains: stringArray(manifest.domains), modeIds });
  }
  return packages;
}

/** 包拥有的服务端目录（与 tools/plugin/ownership.ts 推导集同口径的子集，仓相对 posix）。 */
export function serverDirsOf(pkg: ServerPackage): string[] {
  const dirs: string[] = [];
  if (pkg.cls === "plugin") {
    dirs.push(`apps/server/src/core/${pkg.id}`);
    for (const domain of pkg.domains) {
      dirs.push(`apps/server/src/websocket/${domain}`);
      if (domain !== pkg.id) dirs.push(`apps/server/src/core/${domain}`);
    }
  } else {
    dirs.push(`${SERVER_KITS_NS}${pkg.id}`);
    for (const domain of pkg.domains) dirs.push(`apps/server/src/websocket/${domain}`);
  }
  for (const modeId of pkg.modeIds) dirs.push(`apps/server/src/rooms/modes/${modeId}`);
  return [...new Set(dirs)];
}

/** 说明符 → 仓相对 posix 目标：相对路径按文件位置解析；`@game/shared/x` 映射到 `apps/shared/src/x`；其余裸说明符不在 K1 范围。 */
export function resolveTarget(root: string, file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return toPosix(path.relative(root, path.resolve(path.dirname(file), specifier)));
  if (specifier.startsWith(SHARED_BARE)) return `${SHARED_SRC}${specifier.slice(SHARED_BARE.length)}`;
  return null;
}

function kitOf(target: string, ns: string, kitIds: ReadonlySet<string>): string | null {
  if (!target.startsWith(ns)) return null;
  const segment = target.slice(ns.length).split("/")[0] ?? "";
  return kitIds.has(segment) ? segment : null; // kits/catalog*.ts 等框架文件不是 kit 目录
}

/** 规则 ②：owner 的服务端文件 import 了解析后为 target 的模块。null = 放行。 */
export function judgeServerImport(owner: ServerPackage, kitIds: ReadonlySet<string>, target: string): string | null {
  for (const ns of [SERVER_KITS_NS, SHARED_KITS_NS]) {
    const kitId = kitOf(target, ns, kitIds);
    if (kitId === null) continue;
    if (owner.cls === "kit") {
      return kitId === owner.id ? null : `kit "${owner.id}" 不得 import 别的 kit "${kitId}"（v0 无 kit-on-kit）：${target}`;
    }
    if (!owner.requiresKits.includes(kitId)) {
      return `插件 "${owner.id}" import 了未在 plugin.json.requires.kits 声明的 kit "${kitId}"：${target}`;
    }
    if (!target.startsWith(`${ns}${kitId}/api/`)) {
      return `插件 "${owner.id}" 只能 import kit "${kitId}" 的 api 面（${ns}${kitId}/api/**），⛔ kit 内部模块：${target}`;
    }
    return null;
  }
  return null;
}

/** shared 侧文件的归属：kit 目录 → 该 kit；域描述符 → 声明该域的包；玩法 wire → 拥有该 mode 的包；其余 = 框架（null）。 */
export function sharedOwnerOf(packages: readonly ServerPackage[], kitIds: ReadonlySet<string>, file: string): ServerPackage | null {
  const kitId = kitOf(file, SHARED_KITS_NS, kitIds);
  if (kitId !== null) return packages.find((pkg) => pkg.cls === "kit" && pkg.id === kitId) ?? null;
  for (const dir of [SHARED_DOMAINS_DIR, SHARED_DOMAIN_CHECKS_DIR]) {
    if (!file.startsWith(dir)) continue;
    const domain = file.slice(dir.length).replace(/\.ts$/u, "");
    return packages.find((pkg) => pkg.domains.includes(domain)) ?? null;
  }
  if (file.startsWith(SHARED_GAMEPLAYS_DIR)) {
    const modeId = file.slice(SHARED_GAMEPLAYS_DIR.length).split("/")[0] ?? "";
    return packages.find((pkg) => pkg.modeIds.includes(modeId)) ?? null;
  }
  return null;
}

/** 规则 ③：shared 侧文件 file import 了解析后为 target 的模块。null = 放行。 */
export function judgeSharedImport(packages: readonly ServerPackage[], kitIds: ReadonlySet<string>, file: string, target: string): string | null {
  const kitId = kitOf(target, SHARED_KITS_NS, kitIds);
  if (kitId === null) return null;
  const owner = sharedOwnerOf(packages, kitIds, file);
  if (owner === null) return `框架 shared 文件不得依赖 kit "${kitId}"（框架只经 kits/catalog* 生成目录认识 kit）：${target}`;
  if (owner.cls === "kit") {
    return kitId === owner.id ? null : `kit "${owner.id}" 的 shared 代码不得 import 别的 kit "${kitId}"（v0 无 kit-on-kit）：${target}`;
  }
  if (!owner.requiresKits.includes(kitId)) {
    return `插件 "${owner.id}" 的 shared 代码 import 了未在 plugin.json.requires.kits 声明的 kit "${kitId}"：${target}`;
  }
  if (!target.startsWith(`${SHARED_KITS_NS}${kitId}/api/`)) {
    return `插件 "${owner.id}" 的 shared 代码只能 import kit "${kitId}" 的 api 面（${SHARED_KITS_NS}${kitId}/api/**）：${target}`;
  }
  return null;
}

export interface ServerBoundaryScan {
  readonly files: readonly string[];
  readonly violations: readonly BoundaryViolation[];
}

/** 规则 ②扫描：文件按最长匹配的包目录归属，逐条 import 过 judgeServerImport。 */
export function scanServerKitBoundary(root: string, packages: readonly ServerPackage[] = loadServerPackages(root)): ServerBoundaryScan {
  const kitIds = new Set(packages.filter((pkg) => pkg.cls === "kit").map((pkg) => pkg.id));
  const ownerOf = new Map<string, { owner: ServerPackage; depth: number }>();
  for (const owner of packages) {
    for (const dir of serverDirsOf(owner)) {
      for (const file of walkIfExists(path.join(root, dir))) {
        const current = ownerOf.get(file);
        if (!current || current.depth < dir.length) ownerOf.set(file, { owner, depth: dir.length });
      }
    }
  }
  const files = [...ownerOf.keys()].sort();
  const violations: BoundaryViolation[] = [];
  for (const file of files) {
    const owner = (ownerOf.get(file) as { owner: ServerPackage }).owner;
    for (const specifier of importSpecifiers(fs.readFileSync(file, "utf8"))) {
      const target = resolveTarget(root, file, specifier);
      if (target === null) continue;
      const reason = judgeServerImport(owner, kitIds, target);
      if (reason !== null) violations.push({ file: toPosix(path.relative(root, file)), specifier, reason });
    }
  }
  return { files: files.map((file) => toPosix(path.relative(root, file))), violations };
}

function isGeneratedShared(relative: string): boolean {
  return relative.startsWith("apps/shared/src/generated/") || relative.startsWith("apps/shared/src/gameplays/generated/") || relative.endsWith(".generated.ts");
}

/** 规则 ③扫描：apps/shared/src 全目录（生成物除外）。 */
export function scanSharedKitBoundary(root: string, packages: readonly ServerPackage[] = loadServerPackages(root)): ServerBoundaryScan {
  const kitIds = new Set(packages.filter((pkg) => pkg.cls === "kit").map((pkg) => pkg.id));
  const files: string[] = [];
  const violations: BoundaryViolation[] = [];
  for (const file of walkIfExists(path.join(root, SHARED_SRC)).sort()) {
    const relative = toPosix(path.relative(root, file));
    if (isGeneratedShared(relative)) continue;
    files.push(relative);
    for (const specifier of importSpecifiers(fs.readFileSync(file, "utf8"))) {
      const target = resolveTarget(root, file, specifier);
      if (target === null) continue;
      const reason = judgeSharedImport(packages, kitIds, relative, target);
      if (reason !== null) violations.push({ file: relative, specifier, reason });
    }
  }
  return { files, violations };
}

/** 规则 ④：TypeScript AST 找 `x.conn` / `x["conn"]` / `{ conn }` / `{ conn: y }`；注释与普通字符串不算。 */
export function scanConnAccess(root: string, relativeFiles: readonly string[]): ConnAccess[] {
  const findings: ConnAccess[] = [];
  for (const relative of relativeFiles) {
    const file = path.join(root, relative);
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const report = (node: ts.Node, form: ConnAccess["form"]): void => {
      findings.push({ file: relative, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, form });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && node.name.text === "conn") report(node, "property");
      else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "conn") report(node, "element");
      else if (ts.isBindingElement(node)) {
        const key = node.propertyName ?? node.name;
        if ((ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === "conn") report(node, "binding");
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return findings;
}

// ── 规则 ①（既有用例，零改动）──────────────────────────────────────────────

test("kit 导入边界：apps/server/src/kits/<id>/** 只 import 本 kit 目录、core/infra/kitApi 与 @game/shared*", () => {
  const kitDirs = fs.existsSync(KITS_DIR)
    ? fs.readdirSync(KITS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  assert.ok(kitDirs.includes("arena"), "样本 kit 在树上（否则本测试空转）");
  const violations: string[] = [];
  let scanned = 0;
  for (const kitId of kitDirs) {
    for (const file of walk(path.join(KITS_DIR, kitId))) {
      scanned += 1;
      const source = fs.readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        const verdict = judgeKitImport(file, specifier);
        if (verdict !== null) violations.push(`${path.relative(SERVER_SRC, file)}: ${verdict}`);
      }
    }
  }
  assert.ok(scanned >= 4, `扫描到的 kit 源文件过少（${scanned}）`);
  assert.deepEqual(violations, []);
});

test("kit 导入边界自测：门面 / 自身放行，core/infra 其他模块、core/economy、ioredis、mysql2、type-only 越界都拒", () => {
  const host = path.join(KITS_DIR, "arena/host.ts");
  const surface = path.join(KITS_DIR, "arena/api/board/index.ts");
  assert.equal(judgeKitImport(host, "../../core/infra/kitApi"), null);
  assert.equal(judgeKitImport(surface, "../../../../core/infra/kitApi"), null);
  assert.equal(judgeKitImport(surface, "../../boardRepo"), null);
  assert.equal(judgeKitImport(host, "./boardRepo"), null);
  assert.equal(judgeKitImport(host, "@game/shared"), null);
  assert.equal(judgeKitImport(host, "@game/shared/kits/arena/api/board/index"), null);
  for (const bad of ["../../core/infra/keys", "../../core/infra/redisRoute", "../../core/economy/currency", "../../core/uow", "../../rooms/core/x", "../slg/api/board/index", "../catalog.generated"]) {
    assert.match(judgeKitImport(host, bad) ?? "", /越出 kit 目录/u, bad);
  }
  for (const bad of ["ioredis", "mysql2/promise", "colyseus", "node:fs", "@colyseus/core", "@game/server/x"]) {
    assert.match(judgeKitImport(host, bad) ?? "", /裸说明符/u, bad);
  }
  assert.deepEqual(importSpecifiers('import type { Redis } from "ioredis";\nimport { a } from "./x";\nexport { b } from "../y";\nimport "side";\nconst m = import("../z");'),
    ["ioredis", "./x", "../y", "side", "../z"]);
});

// ── 规则 ②③④（K1）────────────────────────────────────────────────────────────

test("K1 服务端：插件 / kit 的域端点与模式代码零越界（arenaShop → arena 只经 api 面；arena 域端点用本 kit host）", () => {
  const packages = loadServerPackages(REPO_ROOT);
  const arenaShop = packages.find((pkg) => pkg.id === "arenaShop");
  assert.ok(arenaShop && arenaShop.requiresKits.includes("arena"), "样本插件 arenaShop 声明 requires.kits.arena（否则本测试空转）");
  assert.ok(!packages.some((pkg) => pkg.id === "builtin"), "宿主自有 builtin 不进扫描面");
  const scan = scanServerKitBoundary(REPO_ROOT, packages);
  assert.ok(scan.files.some((file) => file.startsWith("apps/server/src/core/arenaShop/")), "插件服务端目录在扫描面");
  assert.ok(scan.files.some((file) => file.startsWith("apps/server/src/websocket/arena/")), "kit 域端点在扫描面");
  assert.ok(scan.files.some((file) => file.startsWith("apps/server/src/rooms/modes/snake/")), "插件玩法模式在扫描面");
  assert.ok(scan.files.length >= 12, `扫描到的服务端包文件过少（${scan.files.length}）`);
  assert.deepEqual(scan.violations, []);
});

test("K1 shared：kit 目录 / 域描述符与 checks / 玩法 wire / 框架文件对 kit 目录的引用零越界", () => {
  const scan = scanSharedKitBoundary(REPO_ROOT);
  assert.ok(scan.files.length >= 30, `shared 文件过少（${scan.files.length}）`);
  assert.ok(scan.files.includes("apps/shared/src/protocol/lobbyRpc/domains/arenaShop.ts"), "样本插件域在扫描面");
  assert.ok(scan.files.includes("apps/shared/src/protocol/lobbyRpc/checks/arena.ts"), "域的非生成校验器在扫描面");
  assert.deepEqual(scan.violations, []);
});

test("K1 `.conn` 禁令：kit / 插件服务端代码零触碰 KitTx.conn", () => {
  const scan = scanServerKitBoundary(REPO_ROOT);
  assert.ok(scan.files.length >= 12);
  assert.deepEqual(scanConnAccess(REPO_ROOT, scan.files), []);
});

test("K1 判定自测：api 面 / 本 kit / 框架放行；内部模块、未声明 kit、kit-on-kit、框架依赖 kit 都拒；`@game/shared/…` 映射到 apps/shared/src", () => {
  const kits = new Set(["arena", "slg"]);
  const shop: ServerPackage = { cls: "plugin", id: "arenaShop", requiresKits: ["arena"], domains: ["arenaShop"], modeIds: [] };
  const arena: ServerPackage = { cls: "kit", id: "arena", requiresKits: [], domains: ["arena"], modeIds: ["arenaCapture"] };
  const user: ServerPackage[] = [shop, arena];
  assert.equal(judgeServerImport(shop, kits, "apps/server/src/kits/arena/api/board/index"), null);
  assert.equal(judgeServerImport(shop, kits, "apps/shared/src/kits/arena/api/board/index"), null);
  assert.equal(judgeServerImport(shop, kits, "apps/server/src/core/infra/keys"), null, "框架不在本闸范围");
  assert.equal(judgeServerImport(shop, kits, "apps/shared/src/kits/catalog.generated"), null, "kits/ 下的框架文件不是 kit 目录");
  assert.match(judgeServerImport(shop, kits, "apps/server/src/kits/arena/host") ?? "", /kit 内部模块/u);
  assert.match(judgeServerImport(shop, kits, "apps/shared/src/kits/arena/internal") ?? "", /kit 内部模块/u);
  assert.match(judgeServerImport(shop, kits, "apps/server/src/kits/slg/api/worldmap/index") ?? "", /未在 plugin.json.requires.kits 声明/u);
  assert.equal(judgeServerImport(arena, kits, "apps/server/src/kits/arena/host"), null);
  assert.match(judgeServerImport(arena, kits, "apps/server/src/kits/slg/host") ?? "", /kit-on-kit/u);
  assert.equal(resolveTarget("/r", "/r/apps/server/src/core/x/a.ts", "@game/shared/kits/arena/api/board/index"), "apps/shared/src/kits/arena/api/board/index");
  assert.equal(resolveTarget("/r", "/r/apps/server/src/core/x/a.ts", "../../kits/arena/host"), "apps/server/src/kits/arena/host");
  assert.equal(resolveTarget("/r", "/r/apps/server/src/core/x/a.ts", "ioredis"), null);
  // shared 侧
  assert.equal(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/domains/arenaShop.ts", "apps/shared/src/kits/arena/api/board/index"), null);
  assert.match(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/domains/arenaShop.ts", "apps/shared/src/kits/arena/service") ?? "", /api 面/u);
  assert.match(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/domains/arenaShop.ts", "apps/shared/src/kits/slg/api/x/index") ?? "", /未在 plugin.json.requires.kits 声明/u);
  assert.equal(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/domains/arena.ts", "apps/shared/src/kits/arena/anything"), null, "kit 自己的域用本 kit 任何模块");
  assert.match(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/domains/arena.ts", "apps/shared/src/kits/slg/api/x/index") ?? "", /kit-on-kit/u);
  assert.match(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/domains/user.ts", "apps/shared/src/kits/arena/api/board/index") ?? "", /框架 shared 文件不得依赖 kit/u);
  // `checks/<域>.ts` 与域 descriptor 同属主（BF2）：插件的域只许 api 面，kit 自己的域放行，非域文件仍拒。
  assert.equal(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/checks/arenaShop.ts", "apps/shared/src/kits/arena/api/board/index"), null);
  assert.match(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/checks/arenaShop.ts", "apps/shared/src/kits/arena/service") ?? "", /api 面/u);
  assert.equal(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/checks/arena.ts", "apps/shared/src/kits/arena/api/board/index"), null, "kit 自己的域用本 kit 任何模块");
  assert.match(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/checks/user.ts", "apps/shared/src/kits/arena/api/board/index") ?? "", /框架 shared 文件不得依赖 kit/u);
  assert.match(judgeSharedImport(user, kits, "apps/shared/src/kits/arena/api/board/index.ts", "apps/shared/src/kits/slg/x") ?? "", /kit-on-kit/u);
  assert.equal(judgeSharedImport(user, kits, "apps/shared/src/kits/arena/api/board/index.ts", "apps/shared/src/protocol/http"), null);
  assert.equal(judgeSharedImport(user, kits, "apps/shared/src/gameplays/arenaCapture/wire.ts", "apps/shared/src/kits/arena/api/board/index"), null, "kit 模式的 wire 归 kit");
  assert.equal(judgeSharedImport(user, kits, "apps/shared/src/protocol/lobbyRpc/economy.ts", "apps/shared/src/kits/catalog.generated"), null, "框架只经 catalog 认识 kit");
});

test("K1 夹具反例：临时检出里越界的服务端 / shared 文件与 `.conn` 触碰被逐条点名（扫描器 + 判定端到端）", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-boundary-k1-"));
  try {
    const write = (relative: string, text: string): void => {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    };
    write("apps/kits/kfix/kit.json", JSON.stringify({ schemaVersion: 1, id: "kfix", domains: ["kfix"], modes: [{ id: "kfixDuel", constantName: "KfixDuel" }] }));
    write("apps/kits/other/kit.json", JSON.stringify({ schemaVersion: 1, id: "other", domains: ["other"] }));
    write("apps/plugins/badplug/plugin.json", JSON.stringify({ schemaVersion: 2, id: "badplug", version: "1.0.0", domains: ["badplug"], requires: { kits: { kfix: { board: 1 } } } }));
    write("apps/plugins/hostish/plugin.json", JSON.stringify({ schemaVersion: 2, id: "hostish", domains: ["hostish"] }));
    // 插件服务端：内部模块 / 未声明 kit / shared 内部模块各一处越界；api 面与框架放行
    write("apps/server/src/core/badplug/a.ts", [
      'import { s } from "../../kits/kfix/service";',
      'import { o } from "../../kits/other/api/x/index";',
      'import type { I } from "@game/shared/kits/kfix/internal";',
      'import { api } from "@game/shared/kits/kfix/api/board/index";',
      'import { board } from "../../kits/kfix/api/board/index";',
      'import { kRl } from "../infra/keys";',
      "export const a = [s, o, api, board, kRl] as unknown as I;",
    ].join("\n"));
    // 插件域端点：合法导入 + 触碰 tx.conn
    write("apps/server/src/websocket/badplug/do.ts", [
      'import { board } from "../../kits/kfix/api/board/index";',
      "export async function run(tx: { conn: { execute(sql: string): Promise<void> } }): Promise<void> { await tx.conn.execute(String(board)); }",
    ].join("\n"));
    // kit 自己的域端点：本 kit host 放行、别的 kit 拒；解构 { conn }
    write("apps/server/src/websocket/kfix/board.ts", [
      'import { h } from "../../kits/kfix/host";',
      'import { g } from "../../kits/other/host";',
      "export function f(tx: { conn: unknown }): unknown { const { conn } = tx; return [h, g, conn]; }",
    ].join("\n"));
    // kit 模式：别的 kit 拒；tx["conn"]；注释与字符串里的 conn 不算
    write("apps/server/src/rooms/modes/kfixDuel/index.ts", [
      'import { x } from "../../../kits/other/api/x/index";',
      "// tx.conn 在注释里不算命中",
      'export function g(tx: Record<string, unknown>): unknown { const label = "conn"; return [x, tx["conn"], label]; }',
    ].join("\n"));
    // kit 目录（规则 ① 由既有用例覆盖；K1 只看 kit-on-kit）
    write("apps/server/src/kits/kfix/host.ts", 'import { z } from "../other/host";\nexport const host = z;\n');
    // MF9 生成物：kits/<id>/contributions.generated.ts 由 codegen:plugins 拥有，静态 import 插件模块——⛔ 不进扫描面
    write("apps/server/src/kits/kfix/contributions.generated.ts", 'import { a } from "../../core/badplug/a";\nexport const KIT_CONTRIBUTIONS = { hook: [a] } as const;\n');
    // 宿主自有插件目录不进扫描面
    write("apps/server/src/core/hostish/x.ts", 'import { s } from "../../kits/kfix/service";\nexport const hx = s;\n');
    // shared 侧
    write("apps/shared/src/protocol/lobbyRpc/domains/badplug.ts", [
      'import { s } from "../../../kits/kfix/service";',
      'import { b } from "../../../kits/kfix/api/board/index";',
      'import { o } from "../../../kits/other/api/x/index";',
      "export const d = [s, b, o];",
    ].join("\n"));
    write("apps/shared/src/protocol/lobbyRpc/domains/kfix.ts", 'import { a } from "../../../kits/kfix/anything";\nimport { o } from "../../../kits/other/api/x/index";\nexport const k = [a, o];\n');
    write("apps/shared/src/protocol/lobbyRpc/domains/user.ts", 'import { b } from "../../../kits/kfix/api/board/index";\nexport const u = b;\n');
    write("apps/shared/src/kits/kfix/api/board/index.ts", 'import { q } from "../../../other/x";\nimport { h } from "../../../../protocol/http";\nexport const board = [q, h];\n');
    write("apps/shared/src/protocol/foo.ts", 'import { b } from "../kits/kfix/api/board/index";\nimport { c } from "../kits/catalog.generated";\nexport const foo = [b, c];\n');
    write("apps/shared/src/gameplays/kfixDuel/wire.ts", 'import { b } from "../../kits/kfix/internal";\nexport const wire = b;\n');
    write("apps/shared/src/gameplays/generated/state/kfixDuel.ts", 'import { b } from "../../../kits/other/internal";\nexport const gen = b;\n');

    const packages = loadServerPackages(root);
    assert.deepEqual(packages.map((pkg) => `${pkg.cls}:${pkg.id}`), ["plugin:badplug", "kit:kfix", "kit:other"], "无 version 的 hostish 是宿主自有包，不进扫描面");
    const strip = (violation: BoundaryViolation): string => `${violation.file} :: ${violation.reason.replace(/：.*$/u, "")}`;

    const server = scanServerKitBoundary(root, packages);
    assert.ok(!server.files.some((file) => file.endsWith(".generated.ts")), "生成物不进服务端扫描面（MF9 contributions.generated.ts）");
    assert.deepEqual(server.files, [
      "apps/server/src/core/badplug/a.ts",
      "apps/server/src/kits/kfix/host.ts",
      "apps/server/src/rooms/modes/kfixDuel/index.ts",
      "apps/server/src/websocket/badplug/do.ts",
      "apps/server/src/websocket/kfix/board.ts",
    ]);
    assert.deepEqual(server.violations.map(strip), [
      'apps/server/src/core/badplug/a.ts :: 插件 "badplug" 只能 import kit "kfix" 的 api 面（apps/server/src/kits/kfix/api/**），⛔ kit 内部模块',
      'apps/server/src/core/badplug/a.ts :: 插件 "badplug" import 了未在 plugin.json.requires.kits 声明的 kit "other"',
      'apps/server/src/core/badplug/a.ts :: 插件 "badplug" 只能 import kit "kfix" 的 api 面（apps/shared/src/kits/kfix/api/**），⛔ kit 内部模块',
      'apps/server/src/kits/kfix/host.ts :: kit "kfix" 不得 import 别的 kit "other"（v0 无 kit-on-kit）',
      'apps/server/src/rooms/modes/kfixDuel/index.ts :: kit "kfix" 不得 import 别的 kit "other"（v0 无 kit-on-kit）',
      'apps/server/src/websocket/kfix/board.ts :: kit "kfix" 不得 import 别的 kit "other"（v0 无 kit-on-kit）',
    ]);

    const shared = scanSharedKitBoundary(root, packages);
    assert.ok(!shared.files.includes("apps/shared/src/gameplays/generated/state/kfixDuel.ts"), "生成物不进 shared 扫描面");
    assert.ok(!shared.violations.some((violation) => violation.file.endsWith("kfixDuel/wire.ts")), "kit 模式的 wire import 本 kit 内部模块是合法的");
    assert.deepEqual(shared.violations.map(strip), [
      'apps/shared/src/kits/kfix/api/board/index.ts :: kit "kfix" 的 shared 代码不得 import 别的 kit "other"（v0 无 kit-on-kit）',
      'apps/shared/src/protocol/foo.ts :: 框架 shared 文件不得依赖 kit "kfix"（框架只经 kits/catalog* 生成目录认识 kit）',
      'apps/shared/src/protocol/lobbyRpc/domains/badplug.ts :: 插件 "badplug" 的 shared 代码只能 import kit "kfix" 的 api 面（apps/shared/src/kits/kfix/api/**）',
      'apps/shared/src/protocol/lobbyRpc/domains/badplug.ts :: 插件 "badplug" 的 shared 代码 import 了未在 plugin.json.requires.kits 声明的 kit "other"',
      'apps/shared/src/protocol/lobbyRpc/domains/kfix.ts :: kit "kfix" 的 shared 代码不得 import 别的 kit "other"（v0 无 kit-on-kit）',
      'apps/shared/src/protocol/lobbyRpc/domains/user.ts :: 框架 shared 文件不得依赖 kit "kfix"（框架只经 kits/catalog* 生成目录认识 kit）',
    ]);

    const conn = scanConnAccess(root, server.files);
    assert.deepEqual(conn.map((hit) => `${hit.file}:${hit.line} ${hit.form}`), [
      "apps/server/src/rooms/modes/kfixDuel/index.ts:3 element",
      "apps/server/src/websocket/badplug/do.ts:2 property",
      "apps/server/src/websocket/kfix/board.ts:3 binding",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
