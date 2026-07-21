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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROTO_DIR = path.join(ROOT, "apps/shared/src/protocol");
export const FINGERPRINT_FILE = path.join(ROOT, "scripts", "protocol.fingerprint");

/** 读当前 PROTOCOL_VERSION（真源 shared/protocol/rooms.ts）。 */
export function readProtocolVersion() {
    const src = fs.readFileSync(path.join(PROTO_DIR, "rooms.ts"), "utf8");
    const m = /PROTOCOL_VERSION\s*=\s*(\d+)/.exec(src);
    if (!m) { throw new Error("shared/protocol/rooms.ts 里找不到 PROTOCOL_VERSION"); }
    return Number(m[1]);
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
