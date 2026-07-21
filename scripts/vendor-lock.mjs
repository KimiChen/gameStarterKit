/**
 * 重钉 vendored 运行时产物的内容锁（scripts/vendor.sha256，shasum -c 兼容格式）。
 *
 * 覆盖面（谁没有别的内容守门，谁进锁）：
 *  - fairygui-cc/runtime/{fairygui.mjs,fairygui.d.ts} —— 在 assets/src 之外，verify:sync
 *    不覆盖，且文件不内嵌版本串——本锁是唯一内容守门
 *  - apps/client/src/lib/colyseus/colyseus.js —— Cocos 侧副本由 verify:sync 保证与此一致，
 *    锁一份即可（内嵌版本串另有 vendorLock.test 查，本锁防「同版本号内容被改」）
 * （bitECS 另有 scripts/bitecs.sha256 字节锁，不在此列。）
 *
 * 何时跑：
 *  - fetch:fgui / fetch:colyseus 升级后自动调用（脚本尾部）
 *  - 给 fairygui 运行时打社区补丁后**手动跑一次**：node scripts/vendor-lock.mjs
 * 校验方：apps/client/test/vendorLock.test.ts（随 test:fgui / CI）。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCK_FILE = path.join(ROOT, "scripts", "vendor.sha256");
export const LOCKED_FILES = [
    "apps/Cocos/extensions/fairygui-cc/runtime/fairygui.mjs",
    "apps/Cocos/extensions/fairygui-cc/runtime/fairygui.d.ts",
    "apps/client/src/lib/colyseus/colyseus.js",
];

const lines = LOCKED_FILES.map((rel) => {
    const hash = createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex");
    return `${hash}  ${rel}`;
});
fs.writeFileSync(LOCK_FILE, lines.join("\n") + "\n");
console.log(`✅ vendor 内容锁已重钉：${path.relative(ROOT, LOCK_FILE)}（${LOCKED_FILES.length} 个产物）`);
