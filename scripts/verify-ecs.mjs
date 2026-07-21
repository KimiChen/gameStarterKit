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
const lines = fs.readFileSync(LOCK, "utf8").trim().split("\n");
for (const line of lines) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
    if (!m) { console.error(`✘ 锁行格式非法: ${line}`); failed++; continue; }
    const rel = m[2];
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
if (failed > 0) { process.exitCode = 1; }
