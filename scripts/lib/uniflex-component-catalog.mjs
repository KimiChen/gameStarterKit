import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";

const UI_ROOT = "apps/client/src/ui-uniflex";

function skipRelative(rel) {
    const parts = rel.split(/[\\/]/);
    if (parts.includes("generated") || parts.includes("restored")) return true;
    return parts.some((part) => part.endsWith("Restored"));
}

async function listTsx(directory) {
    const out = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const full = resolve(directory, entry.name);
        if (entry.isDirectory()) out.push(...await listTsx(full));
        else if (entry.name.endsWith(".tsx")) out.push(full);
    }
    return out;
}

function isDefineComponentCall(expr) {
    return ts.isCallExpression(expr)
        && ts.isIdentifier(expr.expression)
        && expr.expression.text === "defineComponent";
}

function jsxNameValue(attribute) {
    if (!ts.isJsxAttribute(attribute) || attribute.name.getText() !== "name" || !attribute.initializer) {
        return null;
    }
    if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
    if (ts.isJsxExpression(attribute.initializer)
        && attribute.initializer.expression
        && ts.isStringLiteral(attribute.initializer.expression)) {
        return attribute.initializer.expression.text;
    }
    return null;
}

function firstViewName(node) {
    let found = null;
    const visit = (current) => {
        if (found) return;
        const name = jsxNameValue(current);
        if (name) {
            found = name;
            return;
        }
        ts.forEachChild(current, visit);
    };
    visit(node);
    return found;
}

export function parsePsdComponentsFromSource(sourceText, sourcePath) {
    const file = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found = [];
    for (const statement of file.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
        for (const decl of statement.declarationList.declarations) {
            if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
            if (!isDefineComponentCall(decl.initializer)) continue;
            const rootName = firstViewName(decl.initializer);
            if (!rootName) continue;
            found.push({ key: decl.name.text, rootName, source: sourcePath });
        }
    }
    return found;
}

export async function discoverPsdComponents(root) {
    const files = (await listTsx(resolve(root, UI_ROOT))).sort();
    const components = [];
    const keys = new Map();
    const rootNames = new Map();
    for (const file of files) {
        const source = relative(root, file).replaceAll("\\", "/");
        if (skipRelative(source)) continue;
        const text = await readFile(file, "utf8");
        for (const entry of parsePsdComponentsFromSource(text, source)) {
            if (keys.has(entry.key)) {
                throw new Error(
                    `Duplicate PSD component key ${entry.key}: ${keys.get(entry.key)} and ${entry.source}`,
                );
            }
            if (rootNames.has(entry.rootName)) {
                throw new Error(
                    `Duplicate PSD component rootName ${entry.rootName}: ${rootNames.get(entry.rootName)} and ${entry.source}`,
                );
            }
            keys.set(entry.key, entry.source);
            rootNames.set(entry.rootName, entry.source);
            components.push(entry);
        }
    }
    components.sort((left, right) => left.key.localeCompare(right.key)
        || left.source.localeCompare(right.source));
    return {
        schemaVersion: 1,
        kind: "uniflex-psd-components",
        components,
    };
}
