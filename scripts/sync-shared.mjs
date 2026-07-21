/**
 * 共享代码同步脚本
 *
 * 把 apps/shared/src/** 逐字节复制到 apps/client/src/shared/**（纯 TS 工程内），
 * 再由 sync-client 随整份客户端代码灌入 apps/Cocos/assets/src/**，
 * 让 Cocos 编译器以普通项目脚本的方式编译共享代码（微信小游戏构建 100% 兼容，
 * 无需处理 node_modules 解析 / import map / 符号链接的兼容性问题）。
 *
 * 特性：
 *  - 内容相同的文件跳过写入
 *  - 清理目标目录中已不存在于源目录的孤儿文件
 *  - 源目录缺失时 fail-fast，拒绝执行（防止把 DEST 判孤儿清空）
 *  - --watch 监听 shared/src 持续同步；单轮清理量异常大时熔断（防切分支中间态）
 *  - --check 只读校验（npm run verify:sync）：镜像漂移/孤儿即 exit 1
 *
 * 用法：
 *  node scripts/sync-shared.mjs           # 同步一次
 *  node scripts/sync-shared.mjs --watch   # 持续监听
 *  node scripts/sync-shared.mjs --check   # 只读校验，漂移即 exit 1（CI / typecheck 链用）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/shared/src");
const DEST = path.join(ROOT, "apps/client/src/shared");

const BANNER_FILE = "README.md";
const BANNER = `# ⚠ 本目录由脚本生成，禁止手改

内容由 \`apps/shared/src\` 通过 \`npm run sync:shared\` 同步而来。
要修改共享代码，请改 \`apps/shared/src\` 后重新同步。
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

/** watch 熔断阈值：单轮孤儿清理 ≥20 个或 ≥30% 视为异常（切分支/大规模 mv 的中间态） */
const BREAKER_MIN = 20;
const BREAKER_RATIO = 0.3;

/** 计算一轮同步的差异：待写入（缺失/内容漂移）与待清理（孤儿）文件清单，不落盘 */
function diffOnce() {
    // 源目录缺失时 ⛔ 必须 fail-fast 而不是照常执行：collectFiles 对缺失目录返回 []，
    // 继续走会把 DEST 全部文件判孤儿清空（误删/改名 src、切分支瞬间、
    // watch 运行中 SRC 被 mv 都可能触发）
    if (!fs.existsSync(SRC)) {
        throw new Error(`[sync-shared] 源目录不存在: ${SRC}——拒绝执行（继续会清空 ${DEST} 的全部生成物与 .meta）`);
    }
    const srcFiles = collectFiles(SRC);
    // 源目录自带 README.md 时以源文件为准，不再生成警示 banner（避免覆盖与写入抖动）
    const srcHasReadme = srcFiles.includes(BANNER_FILE);

    // 1. 待写入：新增/变更文件（逐字节比较，相同则跳过）
    const toWrite = [];
    for (const rel of srcFiles) {
        const to = path.join(DEST, rel);
        const content = fs.readFileSync(path.join(SRC, rel));
        if (fs.existsSync(to) && fs.readFileSync(to).equals(content)) continue;
        toWrite.push(rel);
    }

    // 2. 待清理：孤儿文件（目标目录中源目录已删除的文件，连同其 .meta）
    const srcSet = new Set(srcFiles);
    const toRemove = [];
    for (const rel of collectFiles(DEST)) {
        if (!srcHasReadme && (rel === BANNER_FILE || rel === BANNER_FILE + ".meta")) continue;
        const isMeta = rel.endsWith(".meta");
        const logical = isMeta ? rel.slice(0, -".meta".length) : rel;
        // 目录 .meta（logical 对应源目录中的文件夹）也要保留
        if (isMeta && fs.existsSync(path.join(SRC, logical)) && fs.statSync(path.join(SRC, logical)).isDirectory()) continue;
        if (srcSet.has(logical)) continue;
        toRemove.push(rel);
    }

    return { srcFiles, srcHasReadme, toWrite, toRemove };
}

function syncOnce(fromWatch = false) {
    const { srcFiles, srcHasReadme, toWrite, toRemove } = diffOnce();

    // watch 熔断：切分支中间态会让 SRC 逐文件消失，若此刻防抖触发会误删成批 DEST 文件。
    // 与 SRC 缺失 fail-fast 同一防御哲学（语义与 sync-client.mjs 一致）。
    if (fromWatch && toRemove.length >= BREAKER_MIN && toRemove.length >= Math.ceil(srcFiles.length * BREAKER_RATIO)) {
        throw new Error(
            `[sync-shared] 本轮要清理 ${toRemove.length} 个文件（源仅 ${srcFiles.length} 个），疑似分支切换中间态——已熔断，待状态稳定后手动执行 npm run sync:shared`
        );
    }

    for (const rel of toWrite) {
        const to = path.join(DEST, rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, fs.readFileSync(path.join(SRC, rel)));
    }
    for (const rel of toRemove) {
        fs.rmSync(path.join(DEST, rel));
    }

    // 3. 清理孤儿空目录（自底向上；对应的目录 .meta 已在上一步删除）
    let removedDirs = 0;
    for (const rel of collectDirs(DEST)) {
        if (fs.existsSync(path.join(SRC, rel))) continue;
        const full = path.join(DEST, rel);
        if (fs.readdirSync(full).length === 0) {
            fs.rmdirSync(full);
            removedDirs++;
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
    console.log(`[sync-shared ${time}] 同步完成：${srcFiles.length} 个文件（写入 ${toWrite.length}，清理 ${toRemove.length + removedDirs}）`);
}

/** --check：只读校验（npm run verify:sync 的 shared 段），镜像漂移/孤儿/banner 被改即退出码 1 */
function checkOnce() {
    const { srcHasReadme, toWrite, toRemove } = diffOnce();
    const problems = [];
    for (const rel of toWrite) problems.push(`漂移：${rel}（源与镜像不一致，跑 npm run sync:shared）`);
    for (const rel of toRemove) problems.push(`孤儿：${rel}（源已删除但镜像残留，跑 npm run sync:shared）`);
    if (!srcHasReadme) {
        const bannerPath = path.join(DEST, BANNER_FILE);
        if (!fs.existsSync(bannerPath) || fs.readFileSync(bannerPath, "utf8") !== BANNER) {
            problems.push(`漂移：${BANNER_FILE}（生成的警示 README 被改/删，跑 npm run sync:shared）`);
        }
    }
    if (problems.length > 0) {
        console.error(`[sync-shared --check] ✘ ${problems.length} 处问题：`);
        for (const p of problems) console.error(`  - ${p}`);
        process.exitCode = 1; // 不用 process.exit：POSIX 管道下 stdout/stderr 异步，exit 会截断明细
        return;
    }
    console.log(`[sync-shared --check] ✔ 镜像一致`);
}

const CHECK_MODE = process.argv.includes("--check");
if (CHECK_MODE) {
    checkOnce();
} else {
    syncOnce();
}

if (!CHECK_MODE && process.argv.includes("--watch")) {
    console.log(`[sync-shared] 监听中：${path.relative(ROOT, SRC)} → ${path.relative(ROOT, DEST)}`);
    let timer = null;
    fs.watch(SRC, { recursive: true }, () => {
        // 300ms 防抖，编辑器连续保存只触发一次
        clearTimeout(timer);
        timer = setTimeout(() => {
            try {
                syncOnce(true);
            } catch (err) {
                console.error("[sync-shared] 同步失败：", err.message);
            }
        }, 300);
    });
}
