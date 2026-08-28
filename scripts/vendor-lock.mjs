#!/usr/bin/env node
/**
 * Vendored runtime content lock (scripts/vendor.sha256, shasum -c compatible).
 *
 * The lock deliberately covers runtime bytes rather than package metadata:
 *  - fairygui-cc/runtime/{fairygui.mjs,fairygui.d.ts}; these live outside the
 *    client mirror and have no embedded version string;
 *  - apps/client/src/lib/colyseus/colyseus.js; the Cocos copy is covered by
 *    verify:sync while this lock protects both copies from same-version edits.
 *
 * `node scripts/vendor-lock.mjs` regenerates the lock after an explicitly
 * reviewed vendor update. `node scripts/vendor-lock.mjs --check` is read-only
 * and verifies the lock, the expected paths, and the actual runtime artifact
 * set. Imports are side-effect free so tests can use the check helpers.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCK_FILE = path.join(ROOT, "scripts", "vendor.sha256");

/**
 * One source of truth for the runtime bytes that are allowed in the content
 * lock. Keep metadata (`.meta`), READMEs and hand-written type declarations
 * outside this list; they have their own importer/mirror contracts.
 */
export const LOCKED_FILES = Object.freeze([
    "apps/Cocos/extensions/fairygui-cc/runtime/fairygui.mjs",
    "apps/Cocos/extensions/fairygui-cc/runtime/fairygui.d.ts",
    "apps/client/src/lib/colyseus/colyseus.js",
]);

const ARTIFACT_RULES = Object.freeze([
    {
        directory: "apps/Cocos/extensions/fairygui-cc/runtime",
        excludedNames: Object.freeze(["README.md"]),
    },
    {
        directory: "apps/client/src/lib/colyseus",
        // The JS UMD is vendored runtime bytes. README and the deliberately
        // hand-written declaration have their own documentation/type checks.
        excludedNames: Object.freeze(["README.md", "colyseus.d.ts"]),
    },
]);

const LOCK_LINE = /^([0-9a-f]{64})  (.+)$/;

function toPosix(value) {
    return value.split(path.sep).join("/");
}

function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolvedRepoFile(root, relative) {
    if (typeof relative !== "string" || relative.length === 0 || path.isAbsolute(relative)) return null;
    const candidate = path.resolve(root, relative);
    if (!isInside(root, candidate)) return null;
    try {
        const stat = fs.lstatSync(candidate);
        if (!stat.isFile()) return null;
        // A vendored lock must not hash bytes through a symlink that points
        // outside this checkout.
        const realRoot = fs.realpathSync(root);
        const realFile = fs.realpathSync(candidate);
        if (!isInside(realRoot, realFile)) return null;
        return candidate;
    } catch {
        return null;
    }
}

/**
 * Return runtime artifact paths physically present under the known roots.
 * Scan the complete directory tree instead of enumerating only expected file
 * names: an added runtime file (or a symlink) must force a deliberate lock
 * review. Cocos `.meta` files and explicitly documented non-runtime files are
 * excluded because they have separate importer/mirror contracts.
 */
export function discoverVendorFiles(root = ROOT) {
    const discovered = [];
    for (const rule of ARTIFACT_RULES) {
        const directory = path.join(root, rule.directory);
        const excluded = new Set(rule.excludedNames);
        const walk = (current) => {
            let entries;
            try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
            for (const entry of entries) {
                if (entry.name.endsWith(".meta") || excluded.has(entry.name) || entry.name === ".DS_Store") continue;
                const full = path.join(current, entry.name);
                if (entry.isDirectory()) { walk(full); continue; }
                // Include symlinks in the physical set. resolvedRepoFile will
                // reject links that do not resolve to an in-repository file.
                if (!entry.isFile() && !entry.isSymbolicLink()) continue;
                discovered.push(toPosix(path.relative(root, full)));
            }
        };
        walk(directory);
    }
    return discovered.sort();
}

function sha256(root, relative) {
    const file = resolvedRepoFile(root, relative);
    if (!file) return null;
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Parse a lock file without accepting duplicate, absolute or outside paths. */
export function parseVendorLock(text, root = ROOT) {
    const errors = [];
    const entries = [];
    const seen = new Set();
    if (typeof text !== "string") return { entries, errors: ["vendor.sha256 不是文本"] };
    const lines = text.split(/\r?\n/);
    // A trailing newline is canonical; empty lines elsewhere are not useful
    // and usually indicate a hand-edited lock.
    for (const [index, line] of lines.entries()) {
        if (line === "" && index === lines.length - 1) continue;
        const match = LOCK_LINE.exec(line);
        if (!match) {
            errors.push(`vendor.sha256 第 ${index + 1} 行格式非法`);
            continue;
        }
        const digest = match[1];
        const relative = match[2];
        const normalized = toPosix(relative);
        if (normalized !== relative || path.isAbsolute(relative) || !resolvedRepoFile(root, relative)) {
            errors.push(`vendor.sha256 第 ${index + 1} 行路径非法：${relative}`);
            continue;
        }
        if (seen.has(relative)) {
            errors.push(`vendor.sha256 存在重复路径：${relative}`);
            continue;
        }
        seen.add(relative);
        entries.push({ path: relative, digest });
    }
    return { entries, errors };
}

function setDifference(actual, expected) {
    const expectedSet = new Set(expected);
    return actual.filter((item) => !expectedSet.has(item));
}

/**
 * Verify all lock invariants without writing anything.
 * `root` is injectable for focused tests and keeps this function independent
 * of the process cwd.
 */
export function checkVendorLock(root = ROOT, lockFile = path.join(root, "scripts", "vendor.sha256")) {
    const errors = [];
    let text;
    try {
        text = fs.readFileSync(lockFile, "utf8");
    } catch (error) {
        errors.push(`vendor.sha256 不存在或不可读：${error instanceof Error ? error.message : String(error)}`);
        return { ok: false, errors, entries: [], actual: discoverVendorFiles(root) };
    }

    const parsed = parseVendorLock(text, root);
    errors.push(...parsed.errors);
    const expected = [...LOCKED_FILES];
    const actual = discoverVendorFiles(root);
    const lockPaths = parsed.entries.map((entry) => entry.path);

    for (const file of expected) {
        if (!resolvedRepoFile(root, file)) errors.push(`应锁文件不存在或不是仓库内普通文件：${file}`);
    }
    for (const file of setDifference(actual, expected)) {
        errors.push(`发现未登记的 vendored runtime 文件：${file}（先更新 LOCKED_FILES 与锁）`);
    }
    for (const file of setDifference(expected, actual)) {
        errors.push(`实际 vendored runtime 文件集合缺少：${file}`);
    }
    for (const file of setDifference(lockPaths, expected)) {
        errors.push(`vendor.sha256 含未预期路径：${file}`);
    }
    for (const file of setDifference(expected, lockPaths)) {
        errors.push(`vendor.sha256 缺少应锁路径：${file}`);
    }

    for (const entry of parsed.entries) {
        if (!expected.includes(entry.path)) continue;
        const actualDigest = sha256(root, entry.path);
        if (actualDigest === null) continue;
        if (actualDigest !== entry.digest) {
            errors.push(`${entry.path} 内容与锁不符（实际 ${actualDigest}，锁中 ${entry.digest}）`);
        }
    }
    return { ok: errors.length === 0, errors, entries: parsed.entries, actual };
}

/** Generate the canonical lock after validating the physical artifact set. */
export function writeVendorLock(root = ROOT, lockFile = path.join(root, "scripts", "vendor.sha256")) {
    const actual = discoverVendorFiles(root);
    const expected = [...LOCKED_FILES].sort();
    const missing = setDifference(expected, actual);
    const extra = setDifference(actual, expected);
    if (missing.length || extra.length) {
        throw new Error([
            missing.length ? `缺少应锁文件：${missing.join(", ")}` : "",
            extra.length ? `存在未登记文件：${extra.join(", ")}` : "",
        ].filter(Boolean).join("；"));
    }
    const lines = LOCKED_FILES.map((relative) => {
        const digest = sha256(root, relative);
        if (!digest) throw new Error(`无法读取应锁文件：${relative}`);
        return `${digest}  ${relative}`;
    });
    fs.writeFileSync(lockFile, lines.join("\n") + "\n");
    return { files: [...LOCKED_FILES], lockFile };
}

function parseArgs(argv) {
    if (argv.length === 0) return { check: false };
    if (argv.length === 1 && argv[0] === "--check") return { check: true };
    throw new Error("用法：node scripts/vendor-lock.mjs [--check]");
}

function invokedDirectly() {
    if (!process.argv[1]) return false;
    try {
        return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
    }
}

if (invokedDirectly()) {
    try {
        const { check } = parseArgs(process.argv.slice(2));
        if (check) {
            const result = checkVendorLock();
            if (!result.ok) {
                for (const error of result.errors) console.error(`✘ ${error}`);
                process.exitCode = 1;
            } else {
                console.log(`✔ vendor 内容锁校验通过（${result.entries.length} 个产物）`);
            }
        } else {
            const result = writeVendorLock();
            console.log(`✅ vendor 内容锁已重钉：${path.relative(ROOT, result.lockFile)}（${result.files.length} 个产物）`);
        }
    } catch (error) {
        console.error(`✘ vendor-lock：${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}
