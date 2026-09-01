/**
 * 协议指纹锁（scripts/protocol.fingerprint）：sha256(apps/shared/src/protocol 全部文件字节) +
 * 两个协议身份整数（Non-intrusive §4.8 拆分：GAME_ROOM_PROTOCOL_VERSION / LOBBY_PROTOCOL_VERSION）。
 * 协议是双端契约的真源，**任何改动必须显式过本闸**：改了协议不重钉 → protocolFingerprint.test
 * 红（CI 硬闸）；重钉产生的 diff 让协议变更在 review 里无法静默混过。
 *
 * 锁文件单行格式：`g<GAME_ROOM_PROTOCOL_VERSION> l<LOBBY_PROTOCOL_VERSION> <sha256hex>`。
 * 指纹只做字节审计锁，⛔ 不参与运行时 join 判定（join 兼容只看两个人工整数各自的闸）。
 *
 * 用法（--check / --write 互斥，⛔ 无隐式重钉；不带参数打印用法并退出 1）：
 *   node scripts/protocol-fingerprint.mjs --check   # 只读比对版本与哈希（CI 用），漂移点名退出 1
 *   node scripts/protocol-fingerprint.mjs --write   # 重算哈希 + 从源读版本写锁（⛔ 不自动 bump 任一版本）
 *   （--root <dir> 为测试 fixture seam，指向包含 apps/shared/src/protocol 的仓库根）
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FINGERPRINT_FILE = path.join(DEFAULT_ROOT, "scripts", "protocol.fingerprint");

function protoDir(root) {
    return path.join(root, "apps/shared/src/protocol");
}

function fingerprintFile(root) {
    return path.join(root, "scripts", "protocol.fingerprint");
}

/** 单个身份常量的 AST 锁：与拆分前 parseProtocolVersion 同刚性。 */
function extractVersionConstant(sourceFile, name) {
    const candidates = [];
    const topLevelDeclarations = [];
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
                topLevelDeclarations.push({ statement, declaration });
            }
        }
        const modifiers = statement.modifiers ?? [];
        const isExactExport = modifiers.length === 1 && modifiers[0].kind === ts.SyntaxKind.ExportKeyword;
        if (!isExactExport || statement.declarationList.flags !== ts.NodeFlags.Const) continue;
        for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
                candidates.push({ statement, declaration });
            }
        }
    }
    if (candidates.length !== 1 || topLevelDeclarations.length !== 1) {
        throw new Error(`shared/protocol/rooms.ts 必须有且仅有一个顶层 ${name} 导出声明（找到 ${candidates.length} 个导出、${topLevelDeclarations.length} 个顶层声明）`);
    }

    const { statement, declaration } = candidates[0];
    // A declaration list with another binding, a type annotation, or an
    // omitted semicolon is intentionally outside the locked source shape.
    const hasSemicolon = statement.getLastToken()?.kind === ts.SyntaxKind.SemicolonToken;
    const initializer = declaration.initializer;
    // TypeScript normalizes NumericLiteral#text (for example `0x3`, `3_000`
    // and `3.0` all become a decimal string). Read the original source slice so
    // the lock really enforces a plain decimal integer literal.
    const literalText = initializer?.getText(sourceFile);
    if (statement.declarationList.declarations.length !== 1
        || declaration.type !== undefined
        || !hasSemicolon
        || !initializer
        || !ts.isNumericLiteral(initializer)
        || !literalText
        || !/^\d+$/.test(literalText)) {
        throw new Error(`${name} 导出声明必须精确为 \`export const ${name} = <integer>;\``);
    }

    const version = Number(literalText);
    if (!Number.isSafeInteger(version) || version < 1) {
        throw new Error(`${name} 非法：${literalText}`);
    }
    return version;
}

/**
 * 从 rooms.ts 源文读取两个协议身份整数（§4.8 拆分后的形态）。
 *
 * 使用 TypeScript 的语法树而不是文本正则：注释、字符串和模板中的旧示例不会伪造声明，
 * 命名空间/函数体内的同名变量也不会被当成顶层导出。每个常量都只接受唯一且精确的
 * `export const <NAME> = <integer>;` 形态；放宽形态会让版本闸在重构时静默读到另一种语义。
 * 旧名 `PROTOCOL_VERSION` 若仍以顶层声明存在 → throw 指引（身份已拆分，读者必须全部切换）。
 */
export function parseProtocolVersions(src) {
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
        throw new Error("shared/protocol/rooms.ts 语法无效，无法读取协议身份常量声明");
    }

    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.name.text === "PROTOCOL_VERSION") {
                throw new Error("检测到旧名 PROTOCOL_VERSION 顶层声明：协议身份已拆分为 "
                    + "GAME_ROOM_PROTOCOL_VERSION 与 LOBBY_PROTOCOL_VERSION（§4.8），旧名必须移除，"
                    + "全部读者同批切换到对应的新常量");
            }
        }
    }

    return {
        gameRoom: extractVersionConstant(sourceFile, "GAME_ROOM_PROTOCOL_VERSION"),
        lobby: extractVersionConstant(sourceFile, "LOBBY_PROTOCOL_VERSION"),
    };
}

export function readProtocolVersions(root = DEFAULT_ROOT) {
    const src = fs.readFileSync(path.join(protoDir(root), "rooms.ts"), "utf8");
    return parseProtocolVersions(src);
}

/** 计算协议目录指纹（路径排序 + 逐文件 path+content 入 hash，跨平台稳定）。 */
export function computeFingerprint(root = DEFAULT_ROOT) {
    const base = protoDir(root);
    const files = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); }
            else { files.push(full); }
        }
    })(base);
    files.sort();
    const h = createHash("sha256");
    for (const f of files) {
        h.update(path.relative(base, f).split(path.sep).join("/"));
        h.update("\0");
        h.update(fs.readFileSync(f));
        h.update("\0");
    }
    return h.digest("hex");
}

/** 解析锁文件单行 `g<GAME> l<LOBBY> <sha256hex>`；形态不符即 throw（fail closed）。 */
export function parseFingerprintLock(text) {
    if (typeof text !== "string") throw new TypeError("protocol.fingerprint 内容必须是字符串");
    const match = /^g(\d+) l(\d+) ([0-9a-f]{64})$/.exec(text.trim());
    if (!match) {
        throw new Error(`protocol.fingerprint 格式非法（应为单行 \`g<GAME> l<LOBBY> <sha256hex>\`）：${text.trim()}`);
    }
    const gameRoom = Number(match[1]);
    const lobby = Number(match[2]);
    if (!Number.isSafeInteger(gameRoom) || gameRoom < 1 || !Number.isSafeInteger(lobby) || lobby < 1) {
        throw new Error(`protocol.fingerprint 版本整数非法：${text.trim()}`);
    }
    return { gameRoom, lobby, hash: match[3] };
}

const USAGE = [
    "用法：node scripts/protocol-fingerprint.mjs (--check | --write) [--root <dir>]",
    "  --check  只读比对锁文件与当前协议目录（版本 + 字节哈希），漂移点名并退出 1",
    "  --write  重算哈希并从 rooms.ts 读取两个协议身份写锁（⛔ 不自动 bump 任一版本）",
    "  ⛔ --check/--write 互斥且必选一个：本脚本没有隐式重钉形态",
].join("\n");

export function runCli(argv) {
    let mode = null;
    let root = DEFAULT_ROOT;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--check" || arg === "--write") {
            if (mode !== null) {
                console.error(`✘ --check 与 --write 互斥且不可重复（已见 --${mode}）`);
                return 1;
            }
            mode = arg.slice(2);
        } else if (arg === "--root") {
            const value = argv[++index];
            if (!value) { console.error("✘ --root 需要目录参数"); return 1; }
            root = path.resolve(value);
        } else if (arg.startsWith("--root=")) {
            const value = arg.slice("--root=".length);
            if (!value) { console.error("✘ --root 需要目录参数"); return 1; }
            root = path.resolve(value);
        } else {
            console.error(`✘ 未知参数：${arg}\n${USAGE}`);
            return 1;
        }
    }
    if (mode === null) {
        console.error(USAGE);
        return 1;
    }

    const versions = readProtocolVersions(root);
    const hash = computeFingerprint(root);
    const lockPath = fingerprintFile(root);

    if (mode === "check") {
        let lockText;
        try {
            lockText = fs.readFileSync(lockPath, "utf8");
        } catch {
            console.error(`✘ 锁文件缺失：${lockPath}（协议变更未显式接受；接受后用 --write 重钉）`);
            return 1;
        }
        let lock;
        try {
            lock = parseFingerprintLock(lockText);
        } catch (error) {
            console.error(`✘ ${error instanceof Error ? error.message : error}`);
            return 1;
        }
        const drifts = [];
        if (lock.gameRoom !== versions.gameRoom) {
            drifts.push(`GAME_ROOM_PROTOCOL_VERSION：锁 ${lock.gameRoom} ≠ 源 ${versions.gameRoom}`);
        }
        if (lock.lobby !== versions.lobby) {
            drifts.push(`LOBBY_PROTOCOL_VERSION：锁 ${lock.lobby} ≠ 源 ${versions.lobby}`);
        }
        if (lock.hash !== hash) {
            drifts.push(`协议目录字节哈希：锁 ${lock.hash.slice(0, 16)}… ≠ 当前 ${hash.slice(0, 16)}…`);
        }
        if (drifts.length > 0) {
            for (const drift of drifts) console.error(`✘ 协议指纹漂移：${drift}`);
            console.error("  确认变更（必要时人工 bump 对应协议整数）后运行 node scripts/protocol-fingerprint.mjs --write 重钉并连锁文件一起提交");
            return 1;
        }
        console.log(`✅ 协议指纹一致：g${versions.gameRoom} l${versions.lobby} ${hash.slice(0, 16)}…`);
        return 0;
    }

    fs.writeFileSync(lockPath, `g${versions.gameRoom} l${versions.lobby} ${hash}\n`);
    console.log(`✅ 协议指纹已重钉：g${versions.gameRoom} l${versions.lobby} ${hash.slice(0, 16)}…`);
    console.log("   ⚠ --write 只接受当前字节，不自动 bump 版本。若本次协议变更影响线上兼容");
    console.log("   （字段增删/语义变化），确认已人工 bump 对应的 GAME_ROOM/LOBBY 协议整数。");
    return 0;
}

// `node -` uses a synthetic argv[1] (`-`) that is not a filesystem path.  A
// failed realpath lookup must not make importing this helper fail in probes or
// tests; it simply means the module was imported rather than run directly.
const isMain = (() => {
    const entry = process.argv[1];
    if (!entry) return false;
    try {
        return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(entry);
    }
    catch {
        return false;
    }
})();
if (isMain) {
    try {
        process.exitCode = runCli(process.argv.slice(2));
    } catch (error) {
        console.error(`✘ ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
    }
}
