/**
 * bitECS 12 文件字节锁校验（铁律 1）——scripts/bitecs.sha256 为基线（shasum -c 兼容格式）。
 * node 实现替代 `cd … && shasum -c`：Windows 无 shasum，跨平台一致；
 * CRLF 检出会破坏哈希——.gitattributes 已对机检域钉 eol=lf。
 * 用法: npm run verify:ecs
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = path.join(ROOT, "apps/client/src/lib/bitecs");
const LOCK = path.join(ROOT, "scripts/bitecs.sha256");

let failed = 0;
const lockText = fs.readFileSync(LOCK, "utf8");
const lines = lockText.trim() === "" ? [] : lockText.trim().split("\n");
const lockedPaths = new Set();
const actualPaths = new Set();
function collectTs(dir, prefix = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) collectTs(path.join(dir, entry.name), rel);
        else if (entry.isFile() && entry.name.endsWith(".ts")) actualPaths.add(rel);
    }
}
collectTs(BASE);
for (const line of lines) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
    if (!m) { console.error(`✘ 锁行格式非法: ${line}`); failed++; continue; }
    const rel = m[2].replaceAll("\\", "/");
    if (path.posix.isAbsolute(rel) || rel.split("/").includes("..") || !rel.endsWith(".ts")) {
        console.error(`✘ 锁路径非法: ${rel}`); failed++; continue;
    }
    if (lockedPaths.has(rel)) { console.error(`✘ 锁路径重复: ${rel}`); failed++; continue; }
    lockedPaths.add(rel);
    let actual = "";
    try {
        actual = createHash("sha256").update(fs.readFileSync(path.join(BASE, rel))).digest("hex");
    } catch {
        console.error(`✘ ${rel}: 文件缺失`); failed++; continue;
    }
    if (actual === m[1]) {
        console.log(`${rel}: OK`);
    } else {
        console.error(`✘ ${rel}: 哈希不符（字节锁被改动——铁律 1 禁改，还原它）`); failed++;
    }
}
for (const rel of [...lockedPaths].sort()) {
    if (!actualPaths.has(rel)) { console.error(`✘ 锁定文件不在实际 ECS 集合中: ${rel}`); failed++; }
}
for (const rel of [...actualPaths].sort()) {
    if (!lockedPaths.has(rel)) { console.error(`✘ ECS TypeScript 文件未登记到锁: ${rel}`); failed++; }
}
if (lockedPaths.size !== actualPaths.size) {
    console.error(`✘ ECS 锁集合与实际集合数量不一致（锁 ${lockedPaths.size} / 实际 ${actualPaths.size}）`);
    failed++;
}
if (failed > 0) { process.exitCode = 1; }
