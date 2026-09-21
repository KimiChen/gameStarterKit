/** 仅 dev:split 预载：外层 watcher 强杀监督器时，角色进程自行释放，生产入口不装配。 */
let stopping = false;
function parentDisconnected() {
    if (stopping) return;
    stopping = true;
    // Colyseus 已装配时走其停服回调；未装配时默认 SIGTERM 直接退出。
    // 断连后不再依赖父进程的计时器，清理卡住也不能留下常驻孤儿。
    setTimeout(() => process.exit(1), 15_000).unref();
    process.kill(process.pid, "SIGTERM");
}

process.once("disconnect", parentDisconnected);
// disconnect listener 默认会 ref IPC；不得因此把启动失败或已释放的角色进程留活。
process.channel?.unref();
if (!process.connected) parentDisconnected();
