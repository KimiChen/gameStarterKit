/**
 * 共享代码同步脚本
 *
 * 把 apps/shared/src/** 逐字节复制到 apps/client/assets/src/shared/**，
 * 让 Cocos 编译器以普通项目脚本的方式编译共享代码（微信小游戏构建 100% 兼容，
 * 无需处理 node_modules 解析 / import map / 符号链接的兼容性问题）。
 *
 * 特性：
 *  - 内容相同的文件跳过写入，避免触发 Cocos 编辑器无意义的重新导入
 *  - 清理目标目录中已不存在于源目录的孤儿文件（连同其 .meta）
 *  - 保留 Cocos 生成的 .meta 文件（uuid 稳定，引用不丢失）
 *  - --watch 监听 shared/src 持续同步
 *
 * 用法：
 *  node scripts/sync-shared.mjs           # 同步一次
 *  node scripts/sync-shared.mjs --watch   # 持续监听
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/shared/src");
const DEST = path.join(ROOT, "apps/client/assets/src/shared");

const BANNER_FILE = "README.md";
const BANNER = `# ⚠ 本目录由脚本生成，禁止手改

内容由 \`apps/shared/src\` 通过 \`npm run sync:shared\` 同步而来。
要修改共享代码，请改 \`apps/shared/src\` 后重新同步。
（\`.meta\` 文件由 Cocos 编辑器生成，属正常现象，随本目录一起提交。）
`;

/** 递归收集目录下所有文件的相对路径 */
function collectFiles(dir, base = dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectFiles(full, base));
        else out.push(path.relative(base, full));
    }
    return out;
}

/** 递归收集目录下所有子目录的相对路径（深层在前，便于自底向上清理） */
function collectDirs(dir, base = dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const full = path.join(dir, entry.name);
        out.push(...collectDirs(full, base));
        out.push(path.relative(base, full));
    }
    return out;
}

function syncOnce() {
    // 源目录缺失时 ⛔ 必须 fail-fast 而不是照常执行：collectFiles 对缺失目录返回 []，
    // 继续走会把 DEST 全部文件（含 .meta）判孤儿清空——事后恢复同步时 Cocos 重生成 .meta，
    // uuid 全变、场景/prefab 对 shared 脚本的引用全断（误删/改名 src、切分支瞬间、
    // watch 运行中 SRC 被 mv 都可能触发）
    if (!fs.existsSync(SRC)) {
        throw new Error(`[sync-shared] 源目录不存在: ${SRC}——拒绝执行（继续会清空 ${DEST} 的全部生成物与 .meta）`);
    }
    const srcFiles = collectFiles(SRC);
    // 源目录自带 README.md 时以源文件为准，不再生成警示 banner（避免覆盖与写入抖动）
    const srcHasReadme = srcFiles.includes(BANNER_FILE);
    let copied = 0;
    let removed = 0;

    // 1. 复制新增/变更文件（逐字节比较，相同则跳过）
    for (const rel of srcFiles) {
        const from = path.join(SRC, rel);
        const to = path.join(DEST, rel);
        const content = fs.readFileSync(from);
        if (fs.existsSync(to) && fs.readFileSync(to).equals(content)) continue;
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, content);
        copied++;
    }

    // 2. 清理孤儿文件（目标目录中源目录已删除的文件，连同其 .meta）
    const srcSet = new Set(srcFiles);
    for (const rel of collectFiles(DEST)) {
        if (!srcHasReadme && (rel === BANNER_FILE || rel === BANNER_FILE + ".meta")) continue;
        const isMeta = rel.endsWith(".meta");
        const logical = isMeta ? rel.slice(0, -".meta".length) : rel;
        // 目录 .meta（logical 对应源目录中的文件夹）也要保留
        if (isMeta && fs.existsSync(path.join(SRC, logical)) && fs.statSync(path.join(SRC, logical)).isDirectory()) continue;
        if (srcSet.has(logical)) continue;
        fs.rmSync(path.join(DEST, rel));
        removed++;
    }

    // 3. 清理孤儿空目录（自底向上；对应的目录 .meta 已在上一步删除）
    for (const rel of collectDirs(DEST)) {
        if (fs.existsSync(path.join(SRC, rel))) continue;
        const full = path.join(DEST, rel);
        if (fs.readdirSync(full).length === 0) {
            fs.rmdirSync(full);
            removed++;
        }
    }

    // 4. 顶层 README 警示（仅当源目录没有自己的 README.md）
    if (!srcHasReadme) {
        const bannerPath = path.join(DEST, BANNER_FILE);
        if (!fs.existsSync(bannerPath) || fs.readFileSync(bannerPath, "utf8") !== BANNER) {
            fs.mkdirSync(DEST, { recursive: true });
            fs.writeFileSync(bannerPath, BANNER);
        }
    }

    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    console.log(`[sync-shared ${time}] 同步完成：${srcFiles.length} 个文件（写入 ${copied}，清理 ${removed}）`);
}

syncOnce();

if (process.argv.includes("--watch")) {
    console.log(`[sync-shared] 监听中：${path.relative(ROOT, SRC)} → ${path.relative(ROOT, DEST)}`);
    let timer = null;
    fs.watch(SRC, { recursive: true }, () => {
        // 300ms 防抖，编辑器连续保存只触发一次
        clearTimeout(timer);
        timer = setTimeout(() => {
            try {
                syncOnce();
            } catch (err) {
                console.error("[sync-shared] 同步失败：", err.message);
            }
        }, 300);
    });
}
