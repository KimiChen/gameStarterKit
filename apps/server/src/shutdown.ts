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
  host.onBeforeShutdown(() => {
    deps.beginShutdown();
    deps.clearCharacterReadyFlights();
    return deps.stopBackgroundProducers();
  });
  host.onShutdown(() => deps.finishShutdown());
}
