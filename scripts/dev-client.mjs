/**
 * 客户端开发模式：并行常驻两个同步 watcher，把「改一行代码到 Creator 看到效果」降为零命令。
 *
 *   apps/shared/src ──(sync-shared --watch)──► apps/client/src/shared
 *   apps/client/src ──(sync-client --watch)──► apps/Cocos/assets/src
 *
 * sync-shared 的 DEST 在 sync-client 的 SRC 内，双 watcher 就位后天然级联：
 * 改 shared 会先落进 client 树、再被 client watcher 灌进 Cocos 壳。
 * 启动时先**同步跑一次** sync-shared 再起 watcher——否则 shared 落后时（如刚 git pull），
 * 其初始写入可能落在 client watcher「初始扫描已过、fs.watch 未注册」的窗口里被漏掉。
 *
 * 用法: npm run dev:client（Ctrl-C 一并退出两个 watcher；再按一次强杀）
 */
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WATCHERS = ["scripts/sync-shared.mjs", "scripts/sync-client.mjs"];

// 消除启动窗口竞态：shared 先一次性同步到位，client watcher 的初始全量扫描必然看到最新态
execFileSync(process.execPath, [path.join(ROOT, "scripts/sync-shared.mjs")], { cwd: ROOT, stdio: "inherit" });

const children = WATCHERS.map((script) =>
    spawn(process.execPath, [path.join(ROOT, script), "--watch"], { cwd: ROOT, stdio: "inherit" })
);

let shuttingDown = false;
function shutdown(code = 0) {
    if (shuttingDown) {
        // 第二次信号：SIGTERM 没送走子进程（卡死/被吞）时强杀退出，不让终端失去 Ctrl-C
        for (const child of children) child.kill("SIGKILL");
        process.exit(code);
    }
    shuttingDown = true;
    for (const child of children) child.kill("SIGTERM");
    process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
// 任一 watcher 退出（异常或正常都不该发生——watcher 永驻）则一并停止另一个，避免半瘫状态
for (const child of children) {
    child.on("exit", (code) => {
        if (shuttingDown) return;
        console.error(`[dev-client] watcher 意外退出（code=${code}），一并停止另一个`);
        shutdown(code || 1);
    });
}
