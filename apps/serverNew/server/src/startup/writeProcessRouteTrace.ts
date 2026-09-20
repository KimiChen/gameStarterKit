/**
 * 跨进程请求的调试痕迹，只在 `ALLOY_PROCESS_ROUTE_TRACE=1` 时打印。
 *
 * 存在的理由：多进程下「谁把请求发给了谁」从**外部完全看不见**——原生端点只属于监听进程，
 * 目标 worker 又不写 wire 消息，所以 `lobby-push` / `lobby-kick` 这类转发只能靠「行为看起来对」
 * 推断。推断不能作为跨进程可用性的证据，因此把路由决策与转发出口都打成一行结构化日志：
 * 真实多进程自检脚本据此断言「请求确实离开了源进程、落到了目标进程」。
 *
 * 痕迹在**发请求之前**打印：转发超时或目标进程已退出时，也要留下「谁试图发给谁」。
 */
export function writeProcessRouteTrace(data: Record<string, string | number | null>) {
    if (process.env.ALLOY_PROCESS_ROUTE_TRACE !== '1') return
    console.log(`[alloy-process-route] ${JSON.stringify(data)}`)
}
