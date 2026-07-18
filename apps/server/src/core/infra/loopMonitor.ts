/**
 * 事件循环延迟 + MySQL 池排队监控——单线程模型的「心电图」（docs/SERVER.md 2026-07）。
 *
 * 定位分工：本模块发现「全局有卡顿/有排队」，[rpc-budget]（websocket/rpc.ts）定位到具体路由。
 * 入口 index.ts 启动；测试不启动（interval 已 unref，不影响进程退出）。
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { EVENT_LOOP_ALERT_MS, MYSQL_QUEUE_ALERT } from "./config";
import { getPoolIfCreated } from "./mysql";

let started = false;

export function startInfraMonitors(intervalMs = 10_000): void {
  if (started) { return; }
  started = true;

  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();

  let enqueued = 0;
  let poolHooked = false;

  setInterval(() => {
    // 告警看 max 不看 p99：一次全循环冻结只贡献 ~1 个直方图样本，10s 窗口 ~500 样本下
    // p99 对「稀发但严重」的卡顿（如 300ms 冻结每分钟几次）完全失明——实测 3×300ms
    // 冻结 p99 仍 ~21ms 而 max=317ms。单线程模型里一次 100ms+ 冻结就值得知道。
    const maxMs = h.max / 1e6;
    const p99 = h.percentile(99) / 1e6;
    if (maxMs > EVENT_LOOP_ALERT_MS) {
      console.warn(`[loop-monitor] 事件循环最长冻结 ${maxMs.toFixed(1)}ms（阈值 ${EVENT_LOOP_ALERT_MS}ms，`
        + `p99=${p99.toFixed(1)}ms）——结合 [rpc-budget] 告警定位路由；卸载判据见 CLAUDE.md 铁律 11`);
    }
    h.reset();

    // MySQL 池排队（IO 型卡顿的共享瓶颈）：enqueue = 请求拿不到空闲连接进入等待队列。
    // 池是惰性创建的，首次观测到已建池时才挂钩子（⛔ 不能因为监控把池拉起来）
    if (!poolHooked) {
      const pool = getPoolIfCreated();
      if (pool) {
        poolHooked = true;
        (pool.pool as unknown as NodeJS.EventEmitter).on("enqueue", () => { enqueued++; });
      }
    } else {
      if (enqueued > MYSQL_QUEUE_ALERT) {
        console.warn(`[loop-monitor] MySQL 池排队 ${enqueued} 次/${intervalMs / 1000}s`
          + `（阈值 ${MYSQL_QUEUE_ALERT}）——慢查询堆积或池容量不足`);
      }
      enqueued = 0;
    }
  }, intervalMs).unref();
}
