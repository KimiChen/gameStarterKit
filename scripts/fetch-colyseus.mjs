/**
 * 拉取 @colyseus/sdk 的自包含 UMD 构建（dist/colyseus.js，~440KB，暴露全局 Colyseus）。
 *
 * 与 fetch-fgui 同一约定：产物体积大、可再生，故 .gitignore 忽略（每台机跑一次
 * `npm run fetch:colyseus`）；类型用手写精简版 colyseus.d.ts（已入库）。
 *
 * 产物落两处（内容相同）：
 *  - apps/client/src/lib/colyseus/colyseus.js   —— sync:client 的同步源
 *  - apps/Cocos/assets/src/lib/colyseus/colyseus.js —— 让工程未跑 sync 也能直接开
 * 并保证 Cocos 侧 .meta 带「导入为插件 + 全平台加载」标记（替代旧文档的手工勾选步骤；
 * 已有 meta 保留其 uuid，引用不断）。
 *
 * 版本钉死（铁律 7：与服务端 colyseus 包 major.minor 一致，当前 0.17.x；⛔ 不飘 latest）。
 * 用法: npm run fetch:colyseus
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SDK_VERSION = "0.17.43";
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

console.log(`✅ colyseus.js ${SDK_VERSION} 就绪（全局 Colyseus，类型见同目录 colyseus.d.ts）`);
