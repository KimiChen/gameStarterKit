/**
 * 编排模块边界（docs/MMO.md §8.1「确定性」；MK4-B1）：扫描收录的编排模块——import 集 ⊆ { kit shared `api/**` 门面、自身目录 } 且源码无禁用标识符
 * （Math.random / Date / setTimeout / setInterval / setImmediate / process / require / fetch）；顶层不得有副作用调用（只允许 import / export / defineOrchestration）。
 * 收录来源：MK4-B2 起 `apps/server/src/kits/mmo/contributions.generated.ts` 的贡献点 `orchestration`；本批扫描夹具 `test/fixtures/orchestrationFixture.ts`
 * + 自证反例（临时文件注入 Math.random / 越界 import ⇒ 红）。TypeScript AST 扫，⛔ 裸正则（注释 / 字符串不算命中）。
 * 变异验证：scanOrchestrationModule 删 PropertyAccess 的 Math.random 分支 → 「反例 Math.random」红。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const FORBIDDEN_IDENTIFIERS = new Set(["setTimeout", "setInterval", "setImmediate", "process", "require", "fetch", "Date"]);
const ALLOWED_BARE_PREFIX = "@game/shared/kits/mmo/api/";

export interface BoundaryFinding { readonly file: string; readonly line: number; readonly what: string }

/** 扫一个编排模块源文件：越界 import / 禁用标识符 / 顶层副作用。 */
export function scanOrchestrationModule(file: string, source = fs.readFileSync(file, "utf8")): BoundaryFinding[] {
    const findings: BoundaryFinding[] = [];
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const lineOf = (node: ts.Node): number => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const dir = path.dirname(file);
    const checkSpecifier = (node: ts.Node, specifier: string): void => {
        if (specifier.startsWith(".")) {
            const resolved = path.resolve(dir, specifier);
            if (!resolved.startsWith(dir + path.sep) && resolved !== dir) findings.push({ file, line: lineOf(node), what: `相对 import 越出自身目录：${specifier}` });
        } else if (!specifier.startsWith(ALLOWED_BARE_PREFIX)) {
            findings.push({ file, line: lineOf(node), what: `裸 import 只许 ${ALLOWED_BARE_PREFIX}**：${specifier}` });
        }
    };
    for (const statement of sourceFile.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) { checkSpecifier(statement, statement.moduleSpecifier.text); continue; }
        if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) { checkSpecifier(statement, statement.moduleSpecifier.text); continue; }
        if (ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) continue;
        findings.push({ file, line: lineOf(statement), what: `顶层不得有副作用语句：${ts.SyntaxKind[statement.kind]}` });
    }
    const visit = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math" && node.name.text === "random") findings.push({ file, line: lineOf(node), what: "Math.random" });
        if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) && !ts.isTypeReferenceNode(node.parent) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) {
            findings.push({ file, line: lineOf(node), what: `禁用标识符 ${node.text}` });
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return findings;
}

/** 收录的编排模块文件：贡献点渲染的 contributions.generated（存在时）+ 夹具。 */
export function orchestrationModuleFiles(): string[] {
    const files = [path.join(HERE, "fixtures/orchestrationFixture.ts")];
    const generated = path.join(REPO, "apps/server/src/kits/mmo/contributions.generated.ts");
    if (fs.existsSync(generated)) {
        const source = fs.readFileSync(generated, "utf8");
        for (const match of source.matchAll(/import \{ [^}]+ \} from "([^"]+)";/gu)) {
            const specifier = match[1]!;
            if (specifier.startsWith(".")) files.push(path.resolve(path.dirname(generated), `${specifier}.ts`));
        }
    }
    return files;
}

test("收录的编排模块（夹具 + 贡献点）：import 集 ⊆ kit shared api 门面 + 自身目录，无禁用标识符，顶层无副作用", () => {
    for (const file of orchestrationModuleFiles()) {
        assert.ok(fs.existsSync(file), file);
        assert.deepEqual(scanOrchestrationModule(file), [], path.relative(REPO, file));
    }
});

test("反例自证：Math.random / Date / setTimeout / 越界 import / 顶层副作用各自点名", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-boundary-"));
    try {
        const file = path.join(dir, "bad.ts");
        fs.writeFileSync(file, [
            'import { defineOrchestration } from "@game/shared/kits/mmo/api/orchestration/index";',
            'import { withKitTx } from "../../src/core/infra/kitApi";',
            'import { x } from "node:fs";',
            "console.log(withKitTx, x);",
            "export const m = defineOrchestration({ orchestrationVersion: 1, packId: \"p\", subscribes: [\"tick\"], handle: () => { const r = Math.random(); const t = Date.now(); setTimeout(() => r, t); return []; } } as never);",
            "// Math.random() in a comment and \"Date\" in a string must not count",
        ].join("\n"));
        const whats = scanOrchestrationModule(file).map((finding) => finding.what);
        assert.deepEqual(whats, [
            "相对 import 越出自身目录：../../src/core/infra/kitApi", "裸 import 只许 @game/shared/kits/mmo/api/**：node:fs", "顶层不得有副作用语句：ExpressionStatement",
            "Math.random", "禁用标识符 Date", "禁用标识符 setTimeout",
        ]);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
