/**
 * 升级 Cocos Creator 的 fairygui-cc 扩展运行时（fairygui.mjs + fairygui.d.ts）。
 *
 * 运行时**已入库**（连同扩展外壳 package.json/browser.js），新机 clone 即可用——本脚本只在
 * **升级版本**时跑：拉 npm 包、验完整性、覆盖运行时、重钉内容锁，然后把 diff 提交入库。
 * node 实现（原 bash 版依赖 bash/openssl，Windows 跑不了；与 fetch-colyseus.mjs 同构）。
 *
 * ⚠ 官方对 3.8 淡维护：生产建议在此基础上打社区 3.8 补丁（mask/输入偏移/GLoader/位图字体，
 *   见 docs/CLIENT.md §4 与 Cocos 论坛 topic 153699）——补丁直接改入库的运行时文件并提交，
 *   git 追踪补丁演进（⚠ 打过补丁后勿再裸跑本脚本，会用干净的上游版覆盖补丁）。
 *   补丁后跑 `node scripts/vendor-lock.mjs` 重钉内容锁（否则 vendorLock.test 红）。
 * 用法: npm run fetch:fgui
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FGUI_VERSION = "1.2.2";
/** 该版本 tarball 的 registry 完整性哈希（npm view fairygui-cc@1.2.2 dist.integrity）；
 *  升版本时同步更新——内容钉死，registry/镜像源被篡改或分叉时 fail-fast */
const FGUI_INTEGRITY = "sha512-hDxK6xtr8AcTerhJUUe7Hg6i8DiFhvcF/+lOKONRFTlRaPxXtvydzllwchse5ZHqc20oTtNU6aEQ2HG4YZM4Yg==";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = path.join(ROOT, "apps/Cocos/extensions/fairygui-cc/runtime");

console.log(`▶ 从 npm 下载 fairygui-cc@${FGUI_VERSION}…`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fgui-"));
try {
    execFileSync("npm", ["pack", `fairygui-cc@${FGUI_VERSION}`, "--silent"], { cwd: tmp, stdio: "pipe" });
    const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
    if (!tgz) { throw new Error("npm pack 未产出 tgz"); }

    const [algo, expected] = FGUI_INTEGRITY.split("-");
    const actual = crypto.createHash(algo).update(fs.readFileSync(path.join(tmp, tgz))).digest("base64");
    if (actual !== expected) {
        throw new Error(`tarball ${algo} 不符：期望 ${expected}，实得 ${actual}——registry/镜像源内容与钉死版本不一致，拒绝落盘`);
    }

    execFileSync("tar", ["xzf", tgz], { cwd: tmp, stdio: "pipe" });
    fs.mkdirSync(RUNTIME, { recursive: true });
    for (const f of ["fairygui.mjs", "fairygui.d.ts"]) {
        fs.copyFileSync(path.join(tmp, "package", "dist", f), path.join(RUNTIME, f));
        console.log(`  写入：${path.relative(ROOT, path.join(RUNTIME, f))}`);
    }
    // 升级后重钉内容锁（vendorLock.test 校验）
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "vendor-lock.mjs")], { stdio: "inherit" });
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`✅ fairygui-cc 运行时 ${FGUI_VERSION} 就绪（代码里用 import * as fgui from "db://fairygui-cc/fairygui.mjs"）`);
console.log(`   ⚠ 3.8 需打社区补丁（docs/CLIENT.md §4）；并在 Creator 扩展管理器里启用 fairygui-cc。`);
