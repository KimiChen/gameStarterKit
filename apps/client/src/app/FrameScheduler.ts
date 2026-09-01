/**
 * FrameScheduler（Non-intrusive §7.2/§7.8 阶段 5b）：route-scoped ticker 注入。
 *
 * feature Logic ⛔ 不再修改 Main / 不见引擎帧循环——它经 ports.ticker 注册回调，
 * 并绑定 route handle 的 signal：close/session change 使 signal abort → 自动解绑。
 * 驱动源是 AppRuntime.tick(dt)（Main.update 转发）。
 *
 * 宿主 hide（§7.3）：只暂停本地 ticker、禁止新意图；⛔ 不把已发送写判失败、不清
 * PendingOperationJournal——暂停由 AppRuntime 订阅 host 通道接线 setPaused。
 * Logic 侧只见 monotonic clock port（ports.clock），不直接读引擎时间。
 */

interface TickerEntry {
    readonly callback: (dt: number) => void;
    readonly detach: () => void;
}

export class FrameScheduler {
    private readonly entries = new Set<TickerEntry>();
    private paused = false;

    /**
     * 注册一个逐帧回调；signal abort 时自动解绑。返回显式解绑器（幂等）。
     */
    add(callback: (dt: number) => void, signal?: AbortSignal): () => void {
        let removeAbortListener: (() => void) | null = null;
        const entry: TickerEntry = {
            callback,
            detach: () => {
                removeAbortListener?.();
                removeAbortListener = null;
            },
        };
        const remove = (): void => {
            entry.detach();
            this.entries.delete(entry);
        };
        if (signal) {
            if (signal.aborted) return () => {};
            signal.addEventListener("abort", remove, { once: true });
            removeAbortListener = () => signal.removeEventListener("abort", remove);
        }
        this.entries.add(entry);
        return remove;
    }

    /** 逐帧驱动（AppRuntime.tick 转发）；回调异常逐个观察，不中断其余回调。 */
    tick(dt: number): void {
        if (this.paused) return;
        for (const entry of [...this.entries]) {
            try {
                entry.callback(dt);
            } catch (error) {
                console.error("[FrameScheduler] ticker 回调异常", error);
            }
        }
    }

    /** 宿主 hide/show 接线：hide 暂停、show 恢复（只影响本地 ticker）。 */
    setPaused(paused: boolean): void {
        this.paused = paused;
    }

    get isPaused(): boolean {
        return this.paused;
    }

    get size(): number {
        return this.entries.size;
    }

    /** app dispose：全部解绑（订阅计数归零的强制释放点）。 */
    clear(): void {
        for (const entry of [...this.entries]) {
            entry.detach();
        }
        this.entries.clear();
    }
}
