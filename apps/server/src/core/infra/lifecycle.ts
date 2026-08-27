/**
 * 进程级资源生命周期注册表。
 *
 * 默认入口中的 timer、stream consumer、worker 和外部 client 都必须有一个
 * 可等待且幂等的释放句柄。注册表按注册逆序释放（后启动的依赖先停），
 * 即使某个资源释放失败也会继续释放其余资源，并在最后汇总错误。
 */
export type Dispose = () => void | Promise<void>;

interface Entry {
  readonly name: string;
  readonly dispose: Dispose;
}

export class LifecycleRegistry {
  private readonly entries: Entry[] = [];
  private disposing: Promise<void> | null = null;

  /**
   * 注册一个资源。相同名称只保留第一次注册，避免重复 start 产生重复 cleanup。
   * 返回的函数可在资源被独立停止时注销该条目。
   */
  register(name: string, dispose: Dispose): () => void {
    if (this.entries.some((entry) => entry.name === name)) {
      return () => {};
    }
    const entry: Entry = { name, dispose };
    this.entries.push(entry);
    return () => {
      const index = this.entries.indexOf(entry);
      if (index >= 0) { this.entries.splice(index, 1); }
    };
  }

  /** 当前已登记资源数（测试与启动诊断使用）。 */
  get size(): number { return this.entries.length; }

  /** 幂等、可等待的全量释放。 */
  disposeAll(): Promise<void> {
    if (this.disposing) { return this.disposing; }
    this.disposing = this.disposeEntries().finally(() => { this.disposing = null; });
    return this.disposing;
  }

  private async disposeEntries(): Promise<void> {
    const errors: unknown[] = [];
    while (this.entries.length > 0) {
      const entry = this.entries.pop()!;
      try {
        await entry.dispose();
      } catch (error) {
        errors.push(new Error(`释放资源失败：${entry.name}`, { cause: error }));
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "一个或多个进程资源释放失败");
    }
  }
}

/** 默认进程入口使用的 singleton；测试可直接实例化 LifecycleRegistry 隔离状态。 */
export const defaultLifecycle = new LifecycleRegistry();
