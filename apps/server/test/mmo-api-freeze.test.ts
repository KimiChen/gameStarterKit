/**
 * mmo kit api 面冻结（MK4-B3；docs/KIT.md §4「minSupported ≤ 声明 ≤ version」/ §7 审核线「api 每个面 version / minSupported 的变化方向（导出符号 diff）」；
 * docs/MMO-PLAN.md MK4-B3「api 面 version / minSupported 冻结」）：
 *  ① kit.json `api` 九面的 version / minSupported 与本文件的冻结表 FROZEN_API 逐面相等（v1 冻结数字；改动 = 有意的 kit 升级，两处一起改）；
 *  ② 每面三端 `apps/{shared,server,client}/src/kits/mmo/api/<face>/index.ts` 的导出符号集（TS AST：kind + 名字，⛔ 裸正则）与
 *     `apps/kits/mmo/api-freeze.json` 逐端相等——新增导出 ⇒ bump 该面 `version`；删 / 改名 / 改 kind ⇒ 抬 `minSupported`（反向闸点名依赖插件，
 *     docs/KIT.md §4）；然后 `MMO_API_FREEZE_WRITE=1` 重钉 JSON（⛔ 无隐式重钉：不带环境变量只比对）；
 *  ③ 面目录集合 = kit.json 声明集合（不许有未声明的 api 目录，也不许声明了没有 shared 门面的面）；1 ≤ minSupported ≤ version。
 * 重钉：`cd apps/server && MMO_API_FREEZE_WRITE=1 node --import tsx --test test/mmo-api-freeze.test.ts`。
 * 变异验证：改 kit.json 某面 version 不改本表 → ① 红；给 shared inventory 加一个 export 不重钉 → ② 红并点名 `+ const X`；
 * 把 freeze 文件里某面 minSupported 改掉 → ① 红。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const KIT_JSON = path.join(REPO, "apps/kits/mmo/kit.json");
const FREEZE_JSON = path.join(REPO, "apps/kits/mmo/api-freeze.json");
const ENDS = ["shared", "server", "client"] as const;
type End = (typeof ENDS)[number];

/** v1 冻结表（MK4-B3，2026-09-20）：面 → [version, minSupported]。 */
export const FROZEN_API: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
    characters: [1, 1], world: [3, 1], movement: [1, 1], content: [3, 2], social: [1, 1], combat: [1, 1], ai: [1, 1], inventory: [3, 1], orchestration: [1, 1],
});

export interface FaceSurface {
    readonly version: number;
    readonly minSupported: number;
    /** 端 → 导出符号（排序去重）；null = 该端没有这个面的门面。 */
    readonly exports: Readonly<Record<End, readonly string[] | null>>;
}
export interface ApiFreeze { readonly schemaVersion: 1; readonly kit: "mmo"; readonly faces: Readonly<Record<string, FaceSurface>> }

function bindingNames(name: ts.BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];
    const out: string[] = [];
    for (const element of name.elements) {
        if (ts.isBindingElement(element)) out.push(...bindingNames(element.name));
    }
    return out;
}

function modifierKinds(node: ts.Node): Set<ts.SyntaxKind> {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return new Set((modifiers ?? []).map((modifier) => modifier.kind));
}

function hasExport(node: ts.Node): boolean {
    return modifierKinds(node).has(ts.SyntaxKind.ExportKeyword);
}

/** 一个门面文件的导出符号集：`<kind> <name>`（const / let / var / function / class / interface / type / enum / namespace / export / export-type / reexport / reexport-type / export-all / default）。 */
export function collectExports(file: string, source: string = fs.readFileSync(file, "utf8")): string[] {
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const names = new Set<string>();
    for (const statement of sourceFile.statements) {
        if (ts.isExportAssignment(statement)) { names.add("default"); continue; }
        if (ts.isExportDeclaration(statement)) {
            const spec = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
            if (!statement.exportClause) { names.add(`export-all ${spec ?? "?"}`); continue; }
            if (ts.isNamespaceExport(statement.exportClause)) { names.add(`export-all ${spec ?? "?"} as ${statement.exportClause.name.text}`); continue; }
            for (const element of statement.exportClause.elements) {
                const typeOnly = statement.isTypeOnly || element.isTypeOnly;
                const kind = spec === null ? (typeOnly ? "export-type" : "export") : (typeOnly ? "reexport-type" : "reexport");
                names.add(spec === null ? `${kind} ${element.name.text}` : `${kind} ${element.name.text} from ${spec}`);
            }
            continue;
        }
        if (!hasExport(statement)) continue;
        if (ts.isVariableStatement(statement)) {
            const flags = statement.declarationList.flags;
            const kind = (flags & ts.NodeFlags.Const) !== 0 ? "const" : (flags & ts.NodeFlags.Let) !== 0 ? "let" : "var";
            for (const declaration of statement.declarationList.declarations) for (const name of bindingNames(declaration.name)) names.add(`${kind} ${name}`);
            continue;
        }
        const isDefault = modifierKinds(statement).has(ts.SyntaxKind.DefaultKeyword);
        const named = (kind: string, name: ts.Identifier | undefined): void => { names.add(isDefault ? "default" : `${kind} ${name?.text ?? "?"}`); };
        if (ts.isFunctionDeclaration(statement)) named("function", statement.name);
        else if (ts.isClassDeclaration(statement)) named("class", statement.name);
        else if (ts.isInterfaceDeclaration(statement)) named("interface", statement.name);
        else if (ts.isTypeAliasDeclaration(statement)) named("type", statement.name);
        else if (ts.isEnumDeclaration(statement)) named("enum", statement.name);
        else if (ts.isModuleDeclaration(statement)) names.add(`namespace ${statement.name.text}`);
        else names.add(`${ts.SyntaxKind[statement.kind]} ?`);
    }
    return [...names].sort();
}

const faceIndex = (end: End, face: string): string => path.join(REPO, `apps/${end}/src/kits/mmo/api/${face}/index.ts`);
const faceDirs = (end: End): string[] => {
    const dir = path.join(REPO, `apps/${end}/src/kits/mmo/api`);
    return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : [];
};

function readKitApi(): Record<string, { version: number; minSupported: number }> {
    const manifest = JSON.parse(fs.readFileSync(KIT_JSON, "utf8")) as { api?: Record<string, { version: number; minSupported: number }> };
    return manifest.api ?? {};
}

/** 现状快照（从 kit.json + 三端门面文件收集）。 */
export function collectMmoApiSurface(): ApiFreeze {
    const api = readKitApi();
    const faces: Record<string, FaceSurface> = {};
    for (const face of Object.keys(api).sort()) {
        const exports = {} as Record<End, readonly string[] | null>;
        for (const end of ENDS) {
            const file = faceIndex(end, face);
            exports[end] = fs.existsSync(file) ? collectExports(file) : null;
        }
        faces[face] = { version: api[face]!.version, minSupported: api[face]!.minSupported, exports };
    }
    return { schemaVersion: 1, kit: "mmo", faces };
}

function diffLines(frozen: readonly string[] | null, current: readonly string[] | null): string[] {
    const a = new Set(frozen ?? []);
    const b = new Set(current ?? []);
    const out: string[] = [];
    if (frozen === null && current !== null) out.push("  + （新门面文件）");
    if (frozen !== null && current === null) out.push("  - （门面文件被删）");
    for (const name of b) if (!a.has(name)) out.push(`  + ${name}`);
    for (const name of a) if (!b.has(name)) out.push(`  - ${name}`);
    return out;
}

test("① kit.json api 九面的 version / minSupported = 冻结表；1 ≤ minSupported ≤ version；面集合相等", () => {
    const api = readKitApi();
    assert.deepEqual(Object.keys(api).sort(), Object.keys(FROZEN_API).sort(), "面集合与冻结表一致（新增面 = kit 升级，两处一起改）");
    for (const [face, [version, minSupported]] of Object.entries(FROZEN_API)) {
        assert.deepEqual(api[face], { version, minSupported }, `面 ${face} 的 version / minSupported 被冻结为 ${version} / ${minSupported}（改动请同时改本表并说明升级方向）`);
        assert.ok(Number.isInteger(minSupported) && minSupported >= 1 && minSupported <= version, `面 ${face}：1 ≤ minSupported ≤ version`);
    }
});

test("③ api 目录集合 = 声明集合：三端没有未声明的面目录；每个声明的面都有 shared 门面 index.ts", () => {
    const declared = Object.keys(FROZEN_API).sort();
    for (const end of ENDS) {
        const undeclared = faceDirs(end).filter((face) => !declared.includes(face));
        assert.deepEqual(undeclared, [], `apps/${end}/src/kits/mmo/api 有未在 kit.json.api 声明的面目录`);
    }
    for (const face of declared) assert.ok(fs.existsSync(faceIndex("shared", face)), `面 ${face} 缺 shared 门面 apps/shared/src/kits/mmo/api/${face}/index.ts`);
});

test("② 三端导出符号集 = api-freeze.json（MMO_API_FREEZE_WRITE=1 重钉；新增 ⇒ bump version，删改 ⇒ 抬 minSupported）", () => {
    const current = collectMmoApiSurface();
    if (process.env.MMO_API_FREEZE_WRITE === "1") {
        fs.writeFileSync(FREEZE_JSON, `${JSON.stringify(current, null, 2)}\n`);
    }
    assert.ok(fs.existsSync(FREEZE_JSON), `缺 ${path.relative(REPO, FREEZE_JSON)}：先 MMO_API_FREEZE_WRITE=1 生成`);
    const frozen = JSON.parse(fs.readFileSync(FREEZE_JSON, "utf8")) as ApiFreeze;
    assert.deepEqual([frozen.schemaVersion, frozen.kit], [1, "mmo"]);
    assert.deepEqual(Object.keys(frozen.faces).sort(), Object.keys(current.faces).sort(), "冻结文件的面集合与 kit.json 一致");
    const problems: string[] = [];
    for (const [face, surface] of Object.entries(current.faces)) {
        const before = frozen.faces[face]!;
        if (before.version !== surface.version || before.minSupported !== surface.minSupported) {
            problems.push(`面 ${face}：冻结 ${before.version} / ${before.minSupported} ≠ kit.json ${surface.version} / ${surface.minSupported}`);
        }
        for (const end of ENDS) {
            const diff = diffLines(before.exports[end], surface.exports[end]);
            if (diff.length > 0) problems.push(`面 ${face} · ${end} 导出变了：\n${diff.join("\n")}`);
        }
    }
    assert.deepEqual(problems, [], "api 面导出与冻结不符：新增导出 ⇒ bump 该面 version；删 / 改名 / 改 kind ⇒ 抬 minSupported；再 MMO_API_FREEZE_WRITE=1 重钉 api-freeze.json");
});

test("collectExports：各种导出形态归一为 `<kind> <name>`（AST，注释 / 字符串不算）", () => {
    const source = `
// export const inComment = 1;
const s = "export function inString() {}";
export const A = 1, B = 2;
export let L = 3;
export function f() {}
export async function g() {}
export class K {}
export interface I {}
export type T = number;
export enum E { X }
export const { d1, d2: d3 } = { d1: 1, d2: 2 };
const local = 1;
export { local, local as alias };
export type { I as IT };
export { r1, type r2 } from "./other";
export * from "./all";
export * as ns from "./ns";
export default s;
`;
    assert.deepEqual(collectExports("/virtual/face.ts", source), [
        "class K", "const A", "const B", "const d1", "const d3", "default", "enum E", "export alias", "export local", "export-all ./all", "export-all ./ns as ns",
        "export-type IT", "function f", "function g", "interface I", "let L", "reexport r1 from ./other", "reexport-type r2 from ./other", "type T",
    ]);
});
