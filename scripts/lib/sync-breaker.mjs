/**
 * 镜像同步的「大规模清理」熔断判据 —— sync-shared.mjs 与 sync-client.mjs 共用。
 *
 * 为什么抽出来：这段判据错过两次，而两次都是**判据本身**错、不是接线错：
 *  ① 原先只在 --watch 分支生效，手动执行可无阻拦清空镜像；
 *  ② 修完①后写成 `removed >= MIN && removed >= ratio`，与注释「≥MIN **或** ≥ratio」相反 ⇒
 *     小目录里删掉 39% 仍够不到固定数量，熔断不触发，镜像连同入库的 .meta 一起被删（uuid 重铸）。
 * 抽成独立模块后有 `apps/client/test/syncBreaker.test.ts` 的表驱动回归钉住，⛔ 不再靠人眼。
 *
 * 语义（与两个脚本的注释一致）：单轮孤儿清理 **≥BREAKER_MIN 个** 或 **≥BREAKER_RATIO 比例**
 * 即视为异常（切分支中间态 / 大规模 mv / 源目录被误删），熔断并要求显式放行。
 * ⚠ 取「或」不取「且」：误触发的代价是敲一次放行命令，漏触发的代价是丢 .meta ⇒ 全工程 uuid 重铸。
 */

/** 单轮孤儿清理达到 20 个即视为异常（大目录的绝对量闸）。 */
export const BREAKER_MIN = 20;
/** 或达到源文件数的 30% 即视为异常（小目录的比例闸）。 */
export const BREAKER_RATIO = 0.3;

/**
 * 是否应当熔断。
 * @param {{removed:number, srcCount:number}} a removed=本轮待清理数，srcCount=当前源文件数
 * @returns {boolean}
 */
export function breakerTripped({ removed, srcCount }) {
    if (removed <= 0) { return false; }
    return removed >= BREAKER_MIN || removed >= Math.ceil(srcCount * BREAKER_RATIO);
}

/**
 * 逃生口。⚠ **必须同时认 env**：`npm run sync:shared` 是**串起两个脚本**的复合命令
 * （`node sync-shared.mjs && node sync-client.mjs`），npm 把 `-- --force` 追加到整串的**末尾**，
 * 于是 `--force` 只到得了 sync-client ⇒ 放行不了 sync-shared 的熔断（曾经的死路提示）。
 * `SYNC_FORCE=1` 是环境变量，对链条里每个脚本都生效。
 */
export function forceRequested(argv = process.argv) {
    return argv.includes("--force") || process.env.SYNC_FORCE === "1";
}

/** 熔断文案（两脚本共用，保证给出的放行方式是**真能用**的那个）。 */
export function breakerMessage(tag, removed, srcCount) {
    return `[${tag}] 本轮要清理 ${removed} 个文件（源仅 ${srcCount} 个），疑似分支切换中间态——已熔断。\n`
        + `  确认无误后用环境变量放行：SYNC_FORCE=1 npm run ${tag === "sync-shared" ? "sync:shared" : "sync:client"}\n`
        + `  （⛔ 别用「-- --force」：npm 会把它追加到复合命令末尾，只到得了链条里最后一个脚本）\n`
        + `  ⚠ 放行会连同入库的 .meta 一起删，Creator 重开将重铸 uuid。`;
}
