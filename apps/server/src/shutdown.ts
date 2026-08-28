/**
 * Colyseus 进程停服回调的唯一装配点。
 *
 * `Server` 只有一个 `onBeforeShutdown` 和一个 `onShutdown` 槽位；把注册
 * 逻辑放在无副作用的小模块里，入口可以继续负责启动顺序，而测试能够在
 * 不监听端口、不创建外部连接的情况下实际触发两个回调。
 */

export interface ShutdownHost {
  onBeforeShutdown(callback: () => void | Promise<unknown>): void;
  onShutdown(callback: () => void | Promise<unknown>): void;
}

export interface ShutdownAggregatorDependencies {
  /** Close admission synchronously before any asynchronous cleanup begins. */
  beginShutdown: () => void;
  /** Cancel pending room-adjacent work before rooms are disposed. */
  clearCharacterReadyFlights: () => void;
  /** Stop producers while Colyseus is still draining rooms. */
  stopBackgroundProducers: () => Promise<void>;
  /** Finish detached-task/resource cleanup after room disposal. */
  finishShutdown: () => Promise<void>;
}

export interface ShutdownStop {
  readonly name: string;
  readonly stop: () => void | Promise<void>;
}

/** Build an idempotent, best-effort producer drain in declared order. */
export function createOrderedProducerStopper(
  stops: readonly ShutdownStop[],
  reportError: (name: string, error: unknown) => void = (name, error) => {
    console.error(`[lifecycle] 停止 ${name} 失败，继续释放其余资源`, error);
  },
): () => Promise<void> {
  let draining: Promise<void> | null = null;
  return () => {
    if (draining) return draining;
    draining = (async () => {
      for (const { name, stop } of stops) {
        try {
          await stop();
        } catch (error) {
          reportError(name, error);
        }
      }
    })();
    return draining;
  };
}

export interface ShutdownCleanup {
  readonly name: string;
  readonly work: () => void | Promise<void>;
}

/** Run post-room cleanup in order while preserving best-effort semantics. */
export async function runShutdownCleanup(
  stopBackgroundProducers: () => Promise<void>,
  cleanups: readonly ShutdownCleanup[],
  reportError: (name: string, error: unknown) => void = (name, error) => {
    console.error(`[lifecycle] ${name} 清理失败，继续后续清理`, error);
  },
): Promise<void> {
  await stopBackgroundProducers();
  for (const { name, work } of cleanups) {
    try {
      await work();
    } catch (error) {
      reportError(name, error);
    }
  }
}

const installedHosts = new WeakSet<object>();

/**
 * Register the sole pair of process shutdown callbacks.
 *
 * Keeping this function deliberately small makes the ordering contract
 * explicit: the before-shutdown callback flips admission synchronously, then
 * waits for producers; the later callback owns the remaining cleanup pass.
 */
export function installShutdownAggregator(
  host: ShutdownHost,
  deps: ShutdownAggregatorDependencies,
): void {
  if (installedHosts.has(host)) {
    throw new Error("shutdown aggregator 已在该 Server 上注册");
  }
  installedHosts.add(host);
  host.onBeforeShutdown(() => {
    deps.beginShutdown();
    deps.clearCharacterReadyFlights();
    return deps.stopBackgroundProducers();
  });
  host.onShutdown(() => deps.finishShutdown());
}
