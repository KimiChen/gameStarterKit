/**
 * 升级 @colyseus/sdk 的自包含 UMD 构建（dist/colyseus.js，~440KB，暴露全局 Colyseus）。
 *
 * 产物**已入库**（连同 Cocos 侧 .meta），新机 clone 即可用——本脚本只在**升级版本**时跑
 * （与 fetch-fgui 同一约定）：拉 npm 包、验完整性、写两处产物，然后把 diff 提交入库。
 * 类型用手写精简版 colyseus.d.ts（已入库，升级时人工对照官方 d.ts 核一遍）。
 *
 * 产物落两处（内容相同）：
 *  - apps/client/src/lib/colyseus/colyseus.js   —— sync:client 的同步源
 *  - apps/Cocos/assets/src/lib/colyseus/colyseus.js —— sync 镜像（verify:sync 校验一致）
 * 并保证 Cocos 侧 .meta 带「导入为插件 + 全平台加载」标记（替代旧文档的手工勾选步骤；
 * 已有 meta 保留其 uuid，引用不断）。
 *
 * 版本钉死（铁律 7：与服务端 colyseus 包 major.minor 一致，当前 0.17.x；⛔ 不飘 latest）。
 * 用法: npm run fetch:colyseus
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SDK_VERSION = "0.17.43";
/** 该版本 tarball 的 registry 完整性哈希（npm view @colyseus/sdk@0.17.43 dist.integrity）；
 *  升 SDK_VERSION 时同步更新——内容钉死，registry/镜像源被篡改或分叉时 fail-fast */
const SDK_INTEGRITY = "sha512-aXefQuh7esEZbtd11TzKMqoLmUjKIfWVDr7ytPR7atV2QgnVyOHof3WIX7B8MDfr9ShyFFVEy2BseCGIfzzvBA==";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = path.join("lib", "colyseus", "colyseus.js");
const DESTS = [
    path.join(ROOT, "apps/client/src", REL),
    path.join(ROOT, "apps/Cocos/assets/src", REL),
];
const META = path.join(ROOT, "apps/Cocos/assets/src", REL + ".meta");
/** 首次入库时编辑器生成的 uuid；meta 缺失重建时沿用，保持稳定 */
const CANONICAL_UUID = "c8f5b0b4-e598-481d-a1d2-19098c6e1ed7";

console.log(`▶ 从 npm 下载 @colyseus/sdk@${SDK_VERSION}…`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "colyseus-"));
try {
    execFileSync("npm", ["pack", `@colyseus/sdk@${SDK_VERSION}`, "--silent"], { cwd: tmp, stdio: "pipe" });
    const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
    // 内容校验：对照钉死的 registry integrity（sha512-<base64>），防镜像源分叉/篡改
    const [algo, expected] = SDK_INTEGRITY.split("-");
    const actual = crypto.createHash(algo).update(fs.readFileSync(path.join(tmp, tgz))).digest("base64");
    if (actual !== expected) {
        throw new Error(`tarball ${algo} 不符：期望 ${expected}，实得 ${actual}——registry/镜像源内容与钉死版本不一致，拒绝落盘`);
    }
    execFileSync("tar", ["xzf", tgz], { cwd: tmp, stdio: "pipe" });
    const src = path.join(tmp, "package", "dist", "colyseus.js");
    if (!fs.existsSync(src)) throw new Error(`npm 包内未找到 dist/colyseus.js（包结构变了？）`);
    const content = fs.readFileSync(src);

    for (const dest of DESTS) {
        if (fs.existsSync(dest) && fs.readFileSync(dest).equals(content)) {
            console.log(`  跳过（内容一致）：${path.relative(ROOT, dest)}`);
            continue;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content);
        console.log(`  写入：${path.relative(ROOT, dest)}`);
    }

    // .meta：保证插件标记在；已有 meta 保留 uuid（插件脚本的引用按文件加载，uuid 稳定即可）
    let uuid = CANONICAL_UUID;
    if (fs.existsSync(META)) {
        try {
            const old = JSON.parse(fs.readFileSync(META, "utf8"));
            if (typeof old.uuid === "string") uuid = old.uuid;
        } catch { /* 坏 meta 直接重建 */ }
    }
    const meta = {
        ver: "4.0.24",
        importer: "javascript",
        imported: true,
        uuid,
        files: [".js"],
        subMetas: {},
        userData: {
            loadPluginInEditor: true,
            loadPluginInWeb: true,
            loadPluginInNative: true,
            loadPluginInMiniGame: true,
            isPlugin: true,
        },
    };
    const metaText = JSON.stringify(meta, null, 2) + "\n";
    if (!fs.existsSync(META) || fs.readFileSync(META, "utf8") !== metaText) {
        fs.writeFileSync(META, metaText);
        console.log(`  写入：${path.relative(ROOT, META)}（插件标记 + uuid 保留）`);
    }
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

// 升级后重钉内容锁（vendorLock.test 校验）
execFileSync(process.execPath, [path.join(ROOT, "scripts", "vendor-lock.mjs")], { stdio: "inherit" });

console.log(`✅ colyseus.js ${SDK_VERSION} 就绪（全局 Colyseus，类型见同目录 colyseus.d.ts）`);
