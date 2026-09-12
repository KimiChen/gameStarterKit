/**
 * 进程级资源生命周期注册表。
 *
 * 默认入口中的 timer、stream consumer、worker 和外部 client 都必须有一个
 * 可等待且幂等的释放句柄。注册表按注册逆序释放（后启动的依赖先停），
 * 即使某个资源释放失败也会继续释放其余资源，并在最后汇总错误。
 */
export type Dispose = () => void | Promise<void>;

/** Raised synchronously by admission hooks once the process enters shutdown. */
export class AdmissionClosedError extends Error {
  readonly code = "ADMISSION_CLOSED" as const;
  constructor() {
    super("服务正在停服，不再接受新请求");
    this.name = "AdmissionClosedError";
  }
}

let admissionOpen = true;
let admissionGeneration = 0;

/** Flip the process gate before the first asynchronous shutdown operation. */
export function beginShutdown(): number {
  admissionOpen = false;
  return ++admissionGeneration;
}

export function isShuttingDown(): boolean { return !admissionOpen; }
export function isAdmissionOpen(): boolean { return admissionOpen; }

/** Admission hooks should call this before starting any new room/task work. */
export function assertAdmissionOpen(): void {
  if (!admissionOpen) { throw new AdmissionClosedError(); }
}

/** Test/embedded-process hook; production never reopens a stopped process. */
export function resetAdmission(): number {
  admissionOpen = true;
  return ++admissionGeneration;
}

export function admissionGenerationOf(): number { return admissionGeneration; }

interface Entry {
  readonly name: string;
  readonly dispose: Dispose;
}

interface DisposalState {
  readonly late: Entry[];
  readonly errors: unknown[];
  finished: boolean;
}

export class LifecycleRegistry {
  private readonly entries: Entry[] = [];
  private disposing: Promise<void> | null = null;
  private disposalState: DisposalState | null = null;
  private closed = false;

  /**
   * 注册一个资源。相同名称只保留第一次注册，避免重复 start 产生重复 cleanup。
   * 返回的函数可在资源被独立停止时注销该条目。
   */
  register(name: string, dispose: Dispose): () => void {
    const state = this.disposalState;
    const duplicate = this.entries.some((entry) => entry.name === name)
      || state?.late.some((entry) => entry.name === name) === true;
    if (duplicate) {
      return () => {};
    }
    const entry: Entry = { name, dispose };
    if (this.closed && !state) {
      // A macrotask (or an accidentally late room callback) can run after the
      // main disposal promise has settled. Dispose it immediately instead of
      // silently retaining a live resource in a terminal registry.
      void this.disposeLateEntry(entry);
      return () => {};
    }
    if (state) {
      // Shutdown may race a lazily-created component (for example, a Lobby
      // room starting its mail consumer). Queue it into the current pass so a
      // resource cannot be silently left alive after `disposeAll()` resolves.
      // The finished guard is a defensive fallback for the tiny window around
      // the runner's final state transition.
      if (state.finished) {
        void this.disposeLateEntry(entry);
        return () => {};
      }
      state.late.push(entry);
      return () => {
        const index = state.late.indexOf(entry);
        if (index >= 0) state.late.splice(index, 1);
      };
    }
    this.entries.push(entry);
    return () => {
      const index = this.entries.indexOf(entry);
      if (index >= 0) { this.entries.splice(index, 1); }
    };
  }

  /** 当前已登记资源数（测试与启动诊断使用）。 */
  get size(): number { return this.entries.length; }

  get isClosed(): boolean { return this.closed; }

  /** Explicitly reopen a registry for an embedded/test process restart. */
  reset(): void {
    if (this.disposing) { throw new Error("LifecycleRegistry 正在释放，不能重置"); }
    if (this.entries.length > 0) { throw new Error("LifecycleRegistry 仍有资源，不能重置"); }
    this.closed = false;
  }

  /** 幂等、可等待的全量释放。 */
  disposeAll(): Promise<void> {
    if (this.disposing) { return this.disposing; }
    if (this.closed) { return Promise.resolve(); }
    const state: DisposalState = { late: [], errors: [], finished: false };
    this.disposalState = state;
    // `runDisposal` owns both the error result and the state transition.  Do
    // not put cleanup in a detached `finally`: a registration can happen while
    // that callback is waiting to run, and must still be observed by the same
    // promise returned from this method.
    const disposing = this.runDisposal(state);
    this.disposing = disposing;
    return disposing;
  }

  private async runDisposal(state: DisposalState): Promise<void> {
    try {
      // Defer the first drain by one microtask. This closes the empty-registry
      // race where `disposeAll()` is called and a lazy component registers before
      // the disposal pass gets its first turn on the event loop.
      await Promise.resolve();
      while (true) {
        // Treat late registrations as the newest entries in the same LIFO
        // sequence.  A disposer may create a dependent resource; that resource
        // must be released before older entries are unwound.
        while (this.entries.length > 0 || state.late.length > 0) {
          const entry = state.late.pop() ?? this.entries.pop()!;
          await this.disposeEntry(entry, state);
        }
        // A disposer can enqueue another resource from a microtask scheduled
        // after its own promise resolves. Give that callback a turn before
        // declaring the pass complete.
        await Promise.resolve();
        if (this.entries.length === 0 && state.late.length === 0) break;
      }
      // Mark the terminal boundary synchronously before returning or throwing.
      // A microtask can register between the final empty check and `finally()`;
      // `register()` will then dispose that entry through its observed fallback
      // instead of leaving it stranded in `state.late`.
      state.finished = true;
      if (state.errors.length > 0) {
        throw new AggregateError(state.errors, "一个或多个进程资源释放失败");
      }
    } finally {
      state.finished = true;
      if (this.disposalState === state) this.disposalState = null;
      this.disposing = null;
      this.closed = true;
    }
  }

  private async disposeEntry(entry: Entry, state: DisposalState): Promise<void> {
    try {
      await entry.dispose();
    } catch (error) {
      state.errors.push(new Error(`释放资源失败：${entry.name}`, { cause: error }));
    }
  }

  /** Defensive fallback for a registration after the pass's final drain. */
  private async disposeLateEntry(entry: Entry): Promise<void> {
    try {
      await entry.dispose();
    } catch (error) {
      console.error(`[lifecycle] 关闭期间迟到资源释放失败：${entry.name}`, error);
    }
  }
}

/** 默认进程入口使用的 singleton；测试可直接实例化 LifecycleRegistry 隔离状态。 */
export const defaultLifecycle = new LifecycleRegistry();

/**
 * Detached application tasks (for example evidence emission or an online
 * index warm-up) are tracked separately from resource disposers. Their
 * rejection is observed immediately and shutdown can await every admitted
 * task before closing Redis/MySQL.
 */
export class TaskTracker {
  private readonly tasks = new Map<Promise<unknown>, string>();
  /** A sealed tracker never admits work after its drain has completed. */
  private sealed = false;
  private draining: Promise<void> | null = null;
  /**
   * Kept separately from `draining` so the tiny `run.finally()` hand-off cannot
   * admit a task after the drain loop has reached its completion boundary.
   */
  private drainState: { finishing: boolean } | null = null;

  track<T>(name: string, promise: Promise<T>): Promise<T> {
    const observed = Promise.resolve(promise);

    const state = this.drainState;
    // A task registered while a drain is still in flight belongs to that
    // shutdown pass, even when the pass has already sealed admission.  Once
    // the pass reaches its synchronous finishing boundary (or has settled),
    // retaining it would make the caller think shutdown was complete while a
    // new detached operation is still alive. Observe such a late promise for
    // diagnostics, but do not retain it.
    if ((this.sealed && state === null) || state?.finishing === true) {
      this.observe(name, observed);
      return observed;
    }

    this.tasks.set(observed, name);
    this.observe(name, observed);
    return observed;
  }

  get size(): number { return this.tasks.size; }

  /** Close admission for a shutdown pass. Existing/in-flight tasks remain drainable. */
  close(): void { this.sealed = true; }

  /** Explicit embedded/test-process reset after all prior tasks have settled. */
  reset(): void {
    if (this.draining || this.drainState) { throw new Error("TaskTracker 正在 drain，不能重置"); }
    if (this.tasks.size > 0) { throw new Error("TaskTracker 仍有在途任务，不能重置"); }
    this.sealed = false;
  }

  async drain(): Promise<void> {
    if (this.draining) { return this.draining; }
    const state = { finishing: false };
    this.drainState = state;
    const run = (async () => {
      while (true) {
        const batch = [...this.tasks.keys()];
        if (batch.length > 0) {
          await Promise.allSettled(batch);
        }
        // A completion handler (or a disposer) may enqueue a dependent task in
        // its microtask. Give that callback a turn before declaring quiescence.
        await Promise.resolve();
        if (this.tasks.size === 0) { break; }
      }
      // From this synchronous point onward `track()` observes late work but
      // cannot add it to a pass that has already proven quiescent. Keeping the
      // state until `finally()` runs closes the promise hand-off race.
      state.finishing = true;
    })();
    let draining!: Promise<void>;
    draining = run.finally(() => {
      state.finishing = true;
      if (this.drainState === state) { this.drainState = null; }
      if (this.draining === draining) { this.draining = null; }
    });
    this.draining = draining;
    return draining;
  }

  private observe<T>(name: string, observed: Promise<T>): void {
    void observed.then(
      () => { this.tasks.delete(observed); },
      (error) => {
        this.tasks.delete(observed);
        try { console.error(`[lifecycle] 异步任务失败：${name}`, error); } catch { /* logging is best-effort */ }
      },
    );
  }
}

export const defaultTasks = new TaskTracker();
export function trackTask<T>(name: string, promise: Promise<T>): Promise<T> {
  return defaultTasks.track(name, promise);
}
/** Production shutdown entry: seal first so no post-drain task can resurrect a handle. */
export function drainTasks(): Promise<void> {
  defaultTasks.close();
  return defaultTasks.drain();
}
