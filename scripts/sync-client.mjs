/**
 * 客户端代码同步脚本（apps/client/src → apps/Cocos/assets/src）
 *
 * 把纯 TS 工程 apps/client/src/** 逐字节复制到 Cocos 工程壳 apps/Cocos/assets/src/**，
 * 让 Cocos 编译器以普通项目脚本的方式编译游戏代码（与 sync-shared 同一套思路：
 * 微信小游戏构建 100% 兼容，无需处理 node_modules 解析 / import map / 符号链接）。
 *
 * 特性（语义与 sync-shared.mjs 一致）：
 *  - 内容相同的文件跳过写入，避免触发 Cocos 编辑器无意义的重新导入
 *  - 清理目标目录中已不存在于源目录的孤儿文件（连同其 .meta）
 *  - 保留 Cocos 生成的 .meta 文件（uuid 稳定，引用不丢失）
 *  - 源目录缺失时 fail-fast，拒绝执行（防止把 DEST 判孤儿清空）
 *  - --watch 监听 apps/client/src 持续同步；单轮清理量异常大时熔断（防切分支中间态误删成批 .meta）
 *  - --check 只读校验（npm run verify:sync）：镜像漂移/孤儿 = 红；入库文件缺入库 .meta = 红
 *
 * 用法：
 *  node scripts/sync-client.mjs           # 同步一次
 *  node scripts/sync-client.mjs --watch   # 持续监听
 *  node scripts/sync-client.mjs --check   # 只读校验，漂移即 exit 1（CI / typecheck 链用）
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/client/src");
const DEST = path.join(ROOT, "apps/Cocos/assets/src");

const BANNER_FILE = "README.md";
const BANNER = `# ⚠ 本目录由脚本生成，禁止手改

内容由 \`apps/client/src\` 通过 \`npm run sync:client\` 同步而来。
要修改游戏代码，请改 \`apps/client/src\` 后重新同步。
（\`.meta\` 文件由 Cocos 编辑器生成，属正常现象，随本目录一起提交。）
`;

/** watch 熔断阈值：单轮孤儿清理 ≥20 个或 ≥30% 视为异常（切分支/大规模 mv 的中间态） */
const BREAKER_MIN = 20;
const BREAKER_RATIO = 0.3;

// ── devEnv.ts 生成：把根 .env.development 的 PORT 派生成客户端常量 ──
// 客户端运行时（Creator/微信）读不了文件系统，端口跟随只能发生在同步期。
// 真源 = 根 .env.development（与服务端 config.ts 同源），生成进 SRC 再随常规同步进 Cocos；
// --check 校验生成物与真源一致（改了 PORT 忘跑 sync 即红）。
const ROOT_ENV = path.join(ROOT, ".env.development");
const DEVENV_REL = path.join("core", "devEnv.ts");

function devEnvContent() {
    let port = 2568;
    try {
        for (const line of fs.readFileSync(ROOT_ENV, "utf8").split("\n")) {
            const m = /^\s*PORT\s*=\s*(\d+)\s*$/.exec(line);
            if (m && !line.trimStart().startsWith("#")) { port = Number(m[1]); }
        }
    } catch { /* 无根 env 文件 = 默认 2568（与服务端 config.ts 一致） */ }
    return `/**
 * ⚠ 生成物勿手改 —— 真源：根 .env.development 的 PORT（缺省 2568，与服务端 config.ts 同源）。
 * \`npm run sync:client\` / dev:client 保存时重生成；verify:sync（--check）校验新鲜度。
 * 场景里 Main 组件 serverUrl **留空即用本值**；填写可覆盖（远程/真机调试）。
 */
export const DEV_SERVER_PORT = ${port};
export const DEV_SERVER_URL = \`http://localhost:\${DEV_SERVER_PORT}\`;
`;
}

/** 把 devEnv.ts 落进 SRC（内容相同跳写）；返回是否发生写入 */
function generateDevEnv() {
    const target = path.join(SRC, DEVENV_REL);
    const content = devEnvContent();
    if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === content) { return false; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return true;
}

/** 统一 POSIX 分隔符（git ls-files 与报错信息均以 / 记路径） */
const posix = (rel) => rel.split(path.sep).join("/");

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

/** 计算一轮同步的差异：待写入（缺失/内容漂移）与待清理（孤儿）文件清单，不落盘 */
function diffOnce() {
    // 源目录缺失时 ⛔ 必须 fail-fast 而不是照常执行：collectFiles 对缺失目录返回 []，
    // 继续走会把 DEST 全部文件（含 .meta）判孤儿清空——事后恢复同步时 Cocos 重生成 .meta，
    // uuid 全变、场景/prefab 对脚本的引用全断（误删/改名 src、切分支瞬间、
    // watch 运行中 SRC 被 mv 都可能触发）
    if (!fs.existsSync(SRC)) {
        throw new Error(`[sync-client] 源目录不存在: ${SRC}——拒绝执行（继续会清空 ${DEST} 的全部生成物与 .meta）`);
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
    const destFiles = collectFiles(DEST);
    for (const rel of destFiles) {
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
    generateDevEnv(); // 先生成再 diff，devEnv 随本轮常规同步进 Cocos
    const { srcFiles, srcHasReadme, toWrite, toRemove } = diffOnce();

    // watch 熔断：切分支/大规模 mv 的中间态会让 SRC 逐文件消失，若此刻防抖触发，
    // 会删掉成批 DEST 文件连同 .meta（checkout 完成后只回填 .ts，.meta 已丢，
    // Creator 开着就会当场重铸 uuid）。与 SRC 缺失 fail-fast 同一防御哲学。
    // 阈值按「涉及的源文件数」算（toRemove 是 DEST 条目，.ts 与 .meta 成对 ≈ 2×，
    // 直接用会让灵敏度翻倍偏离注释语义）。
    const removedLogical = new Set(
        toRemove.map((rel) => (rel.endsWith(".meta") ? rel.slice(0, -".meta".length) : rel))
    ).size;
    if (fromWatch && removedLogical >= BREAKER_MIN && removedLogical >= Math.ceil(srcFiles.length * BREAKER_RATIO)) {
        throw new Error(
            `[sync-client] 本轮要清理 ${removedLogical} 个源文件对应条目（源仅 ${srcFiles.length} 个），疑似分支切换中间态——已熔断，待状态稳定后手动执行 npm run sync:client`
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
    console.log(`[sync-client ${time}] 同步完成：${srcFiles.length} 个文件（写入 ${toWrite.length}，清理 ${toRemove.length + removedDirs}）`);
}

/**
 * --check：只读校验（npm run verify:sync 的 client 段），任一问题即退出码 1：
 *  1. 镜像漂移——忘跑 sync:client / 手改 apps/Cocos/assets/src（下次同步会被静默覆盖的那种）；
 *     含生成的 banner README 被手改/删除（syncOnce 会静默改写回去的那种漂移）。
 *  2. 入库 .meta 缺失——git 里有 assets/src 下的文件但没有配套 .meta：
 *     多台机器各自打开 Creator 会铸出不同 uuid，场景/prefab 引用断裂。
 *     只查 git 已跟踪（含暂存）的文件，不打扰「新文件还没开过 Creator」的本地迭代。
 */
function checkOnce() {
    const { srcHasReadme, toWrite, toRemove } = diffOnce();
    const problems = [];
    const devEnvPath = path.join(SRC, DEVENV_REL);
    if (!fs.existsSync(devEnvPath) || fs.readFileSync(devEnvPath, "utf8") !== devEnvContent()) {
        problems.push(`漂移：${posix(DEVENV_REL)}（根 .env.development 的 PORT 已变或生成物缺失，跑 npm run sync:client）`);
    }
    for (const rel of toWrite) problems.push(`漂移：${posix(rel)}（源与镜像不一致，跑 npm run sync:client）`);
    for (const rel of toRemove) problems.push(`孤儿：${posix(rel)}（源已删除但镜像残留，跑 npm run sync:client）`);
    if (!srcHasReadme) {
        const bannerPath = path.join(DEST, BANNER_FILE);
        if (!fs.existsSync(bannerPath) || fs.readFileSync(bannerPath, "utf8") !== BANNER) {
            problems.push(`漂移：${BANNER_FILE}（生成的警示 README 被改/删，跑 npm run sync:client）`);
        }
    }

    const destRel = path.relative(ROOT, DEST);
    const tracked = execFileSync("git", ["ls-files", "-z", "--", destRel], { cwd: ROOT })
        .toString("utf8").split("\0").filter(Boolean)
        .map((p) => path.relative(destRel, p).split(path.sep).join("/"));
    const trackedSet = new Set(tracked);
    const trackedDirs = new Set();
    for (const rel of tracked) {
        for (let d = path.posix.dirname(rel); d !== "."; d = path.posix.dirname(d)) trackedDirs.add(d);
    }
    for (const rel of tracked) {
        if (rel.endsWith(".meta")) continue;
        if (!trackedSet.has(rel + ".meta")) problems.push(`缺 .meta：${rel}（开一次 Creator 生成后连同提交，防多机各铸 uuid）`);
    }
    for (const dir of trackedDirs) {
        if (!trackedSet.has(dir + ".meta")) problems.push(`缺目录 .meta：${dir}/（开一次 Creator 生成后连同提交）`);
    }

    if (problems.length > 0) {
        console.error(`[sync-client --check] ✘ ${problems.length} 处问题：`);
        for (const p of problems) console.error(`  - ${p}`);
        process.exitCode = 1; // 不用 process.exit：POSIX 管道下 stdout/stderr 异步，exit 会截断明细
        return;
    }
    console.log(`[sync-client --check] ✔ 镜像一致，入库 .meta 齐全`);
}

const CHECK_MODE = process.argv.includes("--check");
if (CHECK_MODE) {
    checkOnce();
} else {
    syncOnce();
}

if (!CHECK_MODE && process.argv.includes("--watch")) {
    console.log(`[sync-client] 监听中：${path.relative(ROOT, SRC)} → ${path.relative(ROOT, DEST)}`);
    let timer = null;
    const schedule = () => {
        // 300ms 防抖，编辑器连续保存只触发一次
        clearTimeout(timer);
        timer = setTimeout(() => {
            try {
                syncOnce(true);
            } catch (err) {
                console.error("[sync-client] 同步失败：", err.message);
            }
        }, 300);
    };
    fs.watch(SRC, { recursive: true }, schedule);
    // 根 .env.development 也在监听内：改 PORT 保存即重生成 devEnv.ts 并同步进 Cocos
    if (fs.existsSync(ROOT_ENV)) { fs.watch(ROOT_ENV, schedule); }
}
