/**
 * 重钉协议指纹（scripts/protocol.fingerprint）：sha256(apps/shared/src/protocol 全部文件) +
 * 当前 PROTOCOL_VERSION。协议是双端契约的真源，**任何改动必须显式过本闸**：
 * 改了协议不重钉 → protocolFingerprint.test 红（CI 硬闸）；重钉产生的 diff 让协议变更
 * 在 review 里无法静默混过；配套提示强制思考「要不要 bump PROTOCOL_VERSION」。
 *
 * 何时跑：改 apps/shared/src/protocol/** 后（通常连同 PROTOCOL_VERSION bump）：
 *   node scripts/protocol-fingerprint.mjs
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROTO_DIR = path.join(ROOT, "apps/shared/src/protocol");
export const FINGERPRINT_FILE = path.join(ROOT, "scripts", "protocol.fingerprint");

/**
 * 从 rooms.ts 源文读取协议版本。
 *
 * 使用 TypeScript 的语法树而不是文本正则：注释、字符串和模板中的旧示例不
 * 会伪造声明，命名空间/函数体内的同名变量也不会被当成顶层导出。这里刻意
 * 只接受唯一且精确的 `export const PROTOCOL_VERSION = <integer>;` 形态；放宽
 * 形态会让版本闸在重构时静默读到另一种语义。
 */
export function parseProtocolVersion(src) {
    if (typeof src !== "string") {
        throw new TypeError("shared/protocol/rooms.ts 源文必须是字符串");
    }
    const sourceFile = ts.createSourceFile(
        "rooms.ts",
        src,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    if (sourceFile.parseDiagnostics.length > 0) {
        throw new Error("shared/protocol/rooms.ts 语法无效，无法读取 PROTOCOL_VERSION");
    }

    const candidates = [];
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const modifiers = statement.modifiers ?? [];
        const isExactExport = modifiers.length === 1 && modifiers[0].kind === ts.SyntaxKind.ExportKeyword;
        if (!isExactExport || statement.declarationList.flags !== ts.NodeFlags.Const) continue;
        for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.name.text === "PROTOCOL_VERSION") {
                candidates.push({ statement, declaration });
            }
        }
    }
    if (candidates.length !== 1) {
        throw new Error(`shared/protocol/rooms.ts 必须有且仅有一个 PROTOCOL_VERSION 导出声明（找到 ${candidates.length} 个）`);
    }

    const { statement, declaration } = candidates[0];
    // A declaration list with another binding, a type annotation, or an
    // omitted semicolon is intentionally outside the locked source shape.
    const hasSemicolon = statement.getLastToken()?.kind === ts.SyntaxKind.SemicolonToken;
    const initializer = declaration.initializer;
    if (statement.declarationList.declarations.length !== 1
        || declaration.type !== undefined
        || !hasSemicolon
        || !initializer
        || !ts.isNumericLiteral(initializer)
        || !/^\d+$/.test(initializer.text)) {
        throw new Error("PROTOCOL_VERSION 导出声明必须精确为 `export const PROTOCOL_VERSION = <integer>;`");
    }

    const version = Number(initializer.text);
    if (!Number.isSafeInteger(version) || version < 1) {
        throw new Error(`PROTOCOL_VERSION 非法：${initializer.text}`);
    }
    return version;
}

export function readProtocolVersion() {
    const src = fs.readFileSync(path.join(PROTO_DIR, "rooms.ts"), "utf8");
    return parseProtocolVersion(src);
}

/** 计算协议目录指纹（路径排序 + 逐文件 path+content 入 hash，跨平台稳定）。 */
export function computeFingerprint() {
    const files = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); }
            else { files.push(full); }
        }
    })(PROTO_DIR);
    files.sort();
    const h = createHash("sha256");
    for (const f of files) {
        h.update(path.relative(PROTO_DIR, f).split(path.sep).join("/"));
        h.update("\0");
        h.update(fs.readFileSync(f));
        h.update("\0");
    }
    return h.digest("hex");
}

const isMain = process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
if (isMain) {
    const v = readProtocolVersion();
    const fp = computeFingerprint();
    fs.writeFileSync(FINGERPRINT_FILE, `v${v} ${fp}\n`);
    console.log(`✅ 协议指纹已重钉：PROTOCOL_VERSION=${v} ${fp.slice(0, 16)}…`);
    console.log(`   ⚠ 若本次协议变更影响线上兼容（字段增删/语义变化），确认已 bump PROTOCOL_VERSION。`);
}
