/**
 * 受保护手写路径的字节锁（scripts/protected-paths.lock）。
 *
 * `scripts/protected-paths.json` 说的是「普通 feature / gameplay 动线里**不应**再改哪些文件」，
 * 但它只是一张**名单**：谁真的改了名单上的文件，全仓没有任何东西会红。名单的执行力此前
 * 100% 依赖「提交里要显式声明改了哪条、为什么」这条人工纪律——而人工纪律漏过一次就等于没有。
 * 这把锁给名单配一条机器执行力：受保护文件的字节一变，`--check` 必红并点名被改的路径，
 * 重钉产生的 diff 让「动了受保护文件」在 review 里无法静默混过。
 *
 * 锁的范围 = `featureFlow.paths` ∪ `gameplayFlow.paths` 里的**手写**文件（glob 条目展开到
 * 目录下每个文件）。⛔ 刻意不锁 `generatedWriterOwned`：那些是生成物/镜像/锁，各自已有
 * writer 闸与新鲜度检查（codegen、sync、vendor-lock…），再压一层字节锁只会让每次正常
 * 重生成都要多钉一次，锁很快会被当成噪音而习惯性 `--write`。
 *
 * 锁文件格式：`#` 开头为注释行，其余每行 `<仓库相对路径> <sha256>`，按路径排序。
 * 哈希就是文件内容的 sha256（不掺路径），所以任何人都能用 `shasum -a 256 <file>` 自行复核。
 *
 * ⚠ 这把锁挡的是**静默**，不是恶意：`--write` 谁都能跑。它保证的是「改了受保护文件」这件事
 * 必然以 `protected-paths.lock` 的 diff 形式出现在提交里；至于那次改动该不该发生，仍由 review
 * 判断——锁只负责让 review 有机会看见。
 *
 * 用法（--check / --write 互斥，⛔ 无隐式重钉；不带参数打印用法并退出 1）：
 *   node scripts/protected-paths-lock.mjs --check   # 只读比对（npm run verify:protected-paths），漂移逐条点名退出 1
 *   node scripts/protected-paths-lock.mjs --write   # 按当前字节重钉锁
 *   （--root <dir> 为测试 fixture seam，指向包含 scripts/protected-paths.json 的仓库根）
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCK_RELATIVE = "scripts/protected-paths.lock";
const RULES_RELATIVE = "scripts/protected-paths.json";

const HEADER = [
    "# scripts/protected-paths.lock —— 受保护手写路径的字节锁。Do not edit by hand.",
    "# writer: node scripts/protected-paths-lock.mjs --write ；checker: --check（npm run verify:protected-paths）",
    "# 每行 `<路径> <sha256>`（内容哈希，可用 shasum -a 256 复核）；范围见 scripts/protected-paths.json。",
];

const posix = (rel) => rel.split(path.sep).join("/");

function lockFile(root) {
    return path.join(root, LOCK_RELATIVE);
}

/** 递归收集目录下所有普通文件（仓库相对 POSIX 路径）。 */
function walkFiles(root, dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(root, full));
        else if (entry.isFile()) out.push(posix(path.relative(root, full)));
    }
    return out;
}

/**
 * 锁的覆盖面：两组手写保护路径展开后的文件清单（排序、去重前先查重）。
 *
 * glob 条目在**每次运行时重新展开**而不是记死在锁里：这样往 `app/**` 里新增一个宿主件
 * 会以「锁中没有这条路径」的形式转红——新增受保护文件同样必须显式过闸，而不是白得一个
 * 不受锁约束的新宿主件。
 */
export function collectLockedFiles(root = DEFAULT_ROOT) {
    const rulesPath = path.join(root, RULES_RELATIVE);
    let rules;
    try {
        rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
    } catch (error) {
        throw new Error(`${RULES_RELATIVE} 不可读或不是合法 JSON：${error instanceof Error ? error.message : error}`);
    }
    const declared = [...(rules?.featureFlow?.paths ?? []), ...(rules?.gameplayFlow?.paths ?? [])];
    if (declared.length === 0) {
        throw new Error(`${RULES_RELATIVE} 的 featureFlow.paths / gameplayFlow.paths 为空——锁失去覆盖面（失败关闭）`);
    }

    const owner = new Map(); // 文件 → 把它纳入锁的那条保护路径
    for (const entry of declared) {
        if (typeof entry !== "string" || entry.length === 0) {
            throw new Error(`${RULES_RELATIVE} 存在非字符串保护路径：${JSON.stringify(entry)}`);
        }
        const isGlob = entry.endsWith("/**");
        const target = path.join(root, isGlob ? entry.slice(0, -"/**".length) : entry);
        let stat;
        try { stat = fs.statSync(target); } catch { stat = null; }
        if (!stat) throw new Error(`保护路径不存在：${entry}（改名/删除后必须同批更新 ${RULES_RELATIVE}）`);
        if (isGlob !== stat.isDirectory()) {
            throw new Error(`保护路径形态不符：${entry} ${isGlob ? "应为目录" : "应为文件"}`);
        }
        for (const file of isGlob ? walkFiles(root, target) : [posix(path.relative(root, target))]) {
            const previous = owner.get(file);
            if (previous !== undefined) {
                throw new Error(`保护路径重叠：${file} 同时被 ${previous} 与 ${entry} 覆盖`);
            }
            owner.set(file, entry);
        }
    }
    return [...owner.keys()].sort();
}

/** 当前字节状态：路径 → sha256（Map 保持排序后的插入顺序）。 */
export function computeLockEntries(root = DEFAULT_ROOT) {
    const entries = new Map();
    for (const file of collectLockedFiles(root)) {
        entries.set(file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"));
    }
    return entries;
}

/** 解析锁文本；形态不符即 throw（fail closed，⛔ 不做「尽力而为」的宽松解析）。 */
export function parseLock(text) {
    if (typeof text !== "string") throw new TypeError("protected-paths.lock 内容必须是字符串");
    const entries = new Map();
    let lineNumber = 0;
    for (const raw of text.split("\n")) {
        lineNumber += 1;
        const line = raw.trim();
        if (line.length === 0 || line.startsWith("#")) continue;
        const match = /^(\S+) ([0-9a-f]{64})$/u.exec(line);
        if (!match) {
            throw new Error(`protected-paths.lock 第 ${lineNumber} 行格式非法（应为 \`<路径> <sha256>\`）：${line}`);
        }
        if (entries.has(match[1])) {
            throw new Error(`protected-paths.lock 第 ${lineNumber} 行路径重复：${match[1]}`);
        }
        entries.set(match[1], match[2]);
    }
    if (entries.size === 0) {
        throw new Error("protected-paths.lock 没有任何锁定条目——锁被掏空（失败关闭）");
    }
    return entries;
}

export function renderLock(entries) {
    return `${[...HEADER, ...[...entries].map(([file, hash]) => `${file} ${hash}`)].join("\n")}\n`;
}

/** 锁 vs 当前字节的逐条差异（新增 / 删除 / 内容漂移），点名到路径。 */
export function diffLock(locked, current) {
    const drifts = [];
    for (const [file, hash] of current) {
        if (!locked.has(file)) { drifts.push(`新增受保护文件（锁中无）：${file}`); continue; }
        if (locked.get(file) !== hash) drifts.push(`内容已改：${file}`);
    }
    for (const file of locked.keys()) {
        if (!current.has(file)) drifts.push(`受保护文件已消失（锁中有）：${file}`);
    }
    return drifts.sort();
}

const USAGE = [
    "用法：node scripts/protected-paths-lock.mjs (--check | --write) [--root <dir>]",
    "  --check  只读比对锁与受保护文件当前字节，漂移逐条点名并退出 1",
    "  --write  按当前字节重钉锁（⛔ 不判断该改动是否正当，只负责让它在 diff 里显形）",
    "  ⛔ --check/--write 互斥且必选一个：本脚本没有隐式重钉形态",
].join("\n");

export function runCli(argv) {
    let mode = null;
    let root = DEFAULT_ROOT;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--check" || arg === "--write") {
            if (mode !== null) {
                console.error(`✘ --check 与 --write 互斥且不可重复（已见 --${mode}）`);
                return 1;
            }
            mode = arg.slice(2);
        } else if (arg === "--root") {
            const value = argv[++index];
            if (!value) { console.error("✘ --root 需要目录参数"); return 1; }
            root = path.resolve(value);
        } else if (arg.startsWith("--root=")) {
            const value = arg.slice("--root=".length);
            if (!value) { console.error("✘ --root 需要目录参数"); return 1; }
            root = path.resolve(value);
        } else {
            console.error(`✘ 未知参数：${arg}\n${USAGE}`);
            return 1;
        }
    }
    if (mode === null) {
        console.error(USAGE);
        return 1;
    }

    const current = computeLockEntries(root);
    const lockPath = lockFile(root);

    if (mode === "check") {
        let lockText;
        try {
            lockText = fs.readFileSync(lockPath, "utf8");
        } catch {
            console.error(`✘ 锁文件缺失：${lockPath}（受保护文件的改动未显式接受；接受后用 --write 重钉）`);
            return 1;
        }
        let locked;
        try {
            locked = parseLock(lockText);
        } catch (error) {
            console.error(`✘ ${error instanceof Error ? error.message : error}`);
            return 1;
        }
        const drifts = diffLock(locked, current);
        if (drifts.length > 0) {
            console.error(`✘ 受保护路径漂移 ${drifts.length} 处：`);
            for (const drift of drifts) console.error(`  - ${drift}`);
            console.error("  这些文件属「普通 feature / gameplay 动线禁改」集合（scripts/protected-paths.json）。");
            console.error("  若本次确属显式框架侵入（Non-intrusive §12.3）：在提交信息里声明改了哪条、为什么，");
            console.error("  再运行 node scripts/protected-paths-lock.mjs --write 重钉并连锁文件一起提交。");
            return 1;
        }
        console.log(`✅ 受保护路径一致：${locked.size} 个手写文件字节未变`);
        return 0;
    }

    fs.writeFileSync(lockPath, renderLock(current));
    console.log(`✅ 受保护路径锁已重钉：${current.size} 个手写文件`);
    console.log("   ⚠ --write 只接受当前字节，不判断改动是否正当。若这次动了受保护文件，");
    console.log("   请在提交信息里显式声明改了哪条、为什么（scripts/protected-paths.json 的治理约定）。");
    return 0;
}

// 与 protocol-fingerprint.mjs 同形：`node -` 的合成 argv[1] 不是文件路径，realpath 失败
// 只说明本模块是被 import 而不是被直接执行，不得让探针/测试的 import 失败。
const isMain = (() => {
    const entry = process.argv[1];
    if (!entry) return false;
    try {
        return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(entry);
    } catch {
        return false;
    }
})();
if (isMain) {
    try {
        process.exitCode = runCli(process.argv.slice(2));
    } catch (error) {
        console.error(`✘ ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
    }
}
