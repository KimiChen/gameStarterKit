/**
 * per-uid 两层锁（[03 · withUser](../../../../docs/server/03-gateway-data-layer.md#withuser每请求工作单元)）：
 *
 * 1. `localMutex` —— 进程内同 uid 请求在 event loop 上排队（await 队列，⛔ 不轮询，09·L5）
 * 2. `acquireLease` —— 跨实例 Redis 锁 + fence（`INCR fence:{uid}` + `SET NX PX`）
 *
 * fence 语义（09·L2，⛔ 三个 fence 概念禁止混用）：
 * - `fence:{uid}` 计数器**永不过期、永不重置**，只需单调不需连续——抢锁失败消耗号是安全的。
 * - 锁中途过期不需要看门狗：fence 会在业务写处拦僵尸（casHset / MySQL last_fence，09·L3）。
 *   **仅 freeze/thaw 的非 fence 守卫破坏性操作**开看门狗（09·L6），走 `renewMs` 可选参数。
 */
import { LOCK_RETRY_MAX, LOCK_TTL_MS } from "../infra/config";
import { kFence, kLock } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { CAS_DEL, CAS_RENEW, evalshaWithReload } from "../infra/redisScripts";
import { BusyError } from "./errors";

export interface Lease {
  readonly fence: number;
  release(): Promise<void>;
}

// ── 进程内 per-uid async 队列 ──────────────────────────────────
// 尾部 promise 永不 reject（错误在各自的返回 promise 上抛），队列空则回收 Map 条目。
const localTail = new Map<string, Promise<void>>();

/** 进程内 per-uid 串行队列。await 排队，⛔ 禁止 sleep() 轮询（09·L5）。 */
export function localMutex<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  const prev = localTail.get(uid) ?? Promise.resolve();
  const result = prev.then(fn);
  const settled = result.then(() => undefined, () => undefined);
  localTail.set(uid, settled);
  void settled.then(() => {
    if (localTail.get(uid) === settled) { localTail.delete(uid); }
  });
  return result;
}

// ── 跨实例 Redis 锁 + fence ───────────────────────────────────

/** 单次抢锁。抢不到抛 BusyError（有界重试在 withUserLock，⛔ 无限递归）。 */
export async function acquireLease(uid: string): Promise<Lease> {
  const redis = clientFor(uid);
  const fence = await redis.incr(kFence(uid)); // 永驻计数器发号；失败消耗号是安全的（只需单调）
  const ok = await redis.set(kLock(uid), String(fence), "PX", LOCK_TTL_MS, "NX");
  if (!ok) { throw new BusyError(); }
  return {
    fence,
    // Lua CAS：值（=fence）匹配才 DEL，绝不释放别人的锁
    release: async () => { await evalshaWithReload(redis, CAS_DEL, [kLock(uid)], [String(fence)]); },
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 有界重试抢锁：LOCK_RETRY_MAX 次短退避后仍 Busy 则上抛（客户端拿 BUSY 自动重试）。 */
async function acquireLeaseBounded(uid: string): Promise<Lease> {
  for (let i = 0; ; i++) {
    try {
      return await acquireLease(uid);
    } catch (e) {
      if (!(e instanceof BusyError) || i >= LOCK_RETRY_MAX) { throw e; }
      await sleep(50 * 2 ** i + Math.random() * 50); // 50/100/200ms 抖动，远小于 LOCK_TTL
    }
  }
}

export interface WithUserLockOpts {
  /**
   * 看门狗续租周期（09·L6）。⛔ 默认关——casHset/货币路径锁过期是安全的（fence 拦僵尸写）。
   * 仅 freeze/thaw 等**非 fence 守卫的破坏性慢操作**传 LOCK_RENEW_MS 启用。
   */
  renewMs?: number;
}

/**
 * 低层原语：localMutex + acquireLease。玩法写 / freeze / thaw / 清理任务全部走它——
 * 同一把 `lock:{uid}`（09·L1，⛔ 禁止第二把 per-uid 锁）。
 */
export async function withUserLock<T>(
  uid: string,
  fn: (fence: number) => Promise<T>,
  opts?: WithUserLockOpts,
): Promise<T> {
  return localMutex(uid, async () => {
    const lease = await acquireLeaseBounded(uid);
    const redis = clientFor(uid);
    let watchdog: NodeJS.Timeout | undefined;
    if (opts?.renewMs) {
      watchdog = setInterval(() => {
        // CAS 续租：锁已易主则返回 0，停表——破坏性 Lua 自身还会复检归属（09·L4），这里只是减少误报
        evalshaWithReload(redis, CAS_RENEW, [kLock(uid)], [String(lease.fence), String(LOCK_TTL_MS)])
          .then((r) => { if (r !== 1 && watchdog) { clearInterval(watchdog); } })
          .catch(() => { /* 续租失败不致命：Lua 复检兜底 */ });
      }, opts.renewMs);
      watchdog.unref?.();
    }
    try {
      return await fn(lease.fence);
    } finally {
      if (watchdog) { clearInterval(watchdog); }
      await lease.release();
    }
  });
}
