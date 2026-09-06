/**
 * ViewBase —— ViewMgr 页面的**唯一**生命周期实现（机械件，docs/CLIENT.md §4）。
 *
 * 从 FguiView 原样搬出：打开世代（beginLifecycle）、实例级 onCreate 单次闸（runCreate）、
 * 每次打开的 onOpen（runOpen）、幂等关闭（closeLifecycle/startClose）与 dispose 模板。
 * 搬出的原因只有一个：`kind:"cocos"` 页面（被 plugin routes 引用的纯 Cocos 节点页）
 * 必须与 FGUI 页面共用**同一套**生命周期——ViewMgr 的事务序、取消桥接与回滚逐段一致，
 * ⛔ 不允许按渲染栈各写一套。
 *
 * 分工：本文件只管「世代与 hook」，⛔ 不 import cc / fairygui；
 * 「挂载/摘下/置顶/销毁根」由各渲染栈子类实现（FguiView = GComponent，CocosView = Node）。
 *
 * ⚠ 顺带在这里登记「当前打开的页面」到 core/errorContext：出错弹框要报「在哪个页面出的事」，
 * 而这里是两套渲染栈**唯一**的公共开关点。⛔ 不为此再往 ViewMgr（受保护）里加钩子。
 */
import { setErrorContext } from "../core/errorContext";

/** 当前处于打开世代的页面名（按打开先后）；只作诊断用，⛔ 不参与任何业务判定。 */
const openViews: string[] = [];

function publishOpenViews(): void {
  setErrorContext("view.open", openViews.length > 0 ? openViews.join(" > ") : null);
}

function markOpened(view: object): void {
  const name = view.constructor.name || "View";
  const at = openViews.indexOf(name);
  if (at >= 0) openViews.splice(at, 1);
  openViews.push(name);
  publishOpenViews();
}

function markClosed(view: object): void {
  const at = openViews.indexOf(view.constructor.name || "View");
  if (at >= 0) openViews.splice(at, 1);
  publishOpenViews();
}

/**
 * 一次页面打开的生命周期上下文。
 *
 * `signal` 供 HTTP/RPC 等依赖取消；`generation` 用于在依赖不支持 AbortSignal 时做迟到结果隔离。
 * `isActive()` 比单看 signal 更严格：同一个 View permanent 重开时，旧上下文会立即失效。
 */
export interface ViewLifecycleContext {
  readonly generation: number;
  readonly signal: AbortSignal;
  isActive(): boolean;
}

type LifecycleState = {
  readonly generation: number;
  readonly controller: AbortController;
  readonly context: ViewLifecycleContext;
  active: boolean;
  closePromise: Promise<void> | null;
};

export abstract class ViewBase {
  private lifecycle: LifecycleState | null = null;
  private created = false;
  private createFlight: Promise<void> | null = null;
  private disposed = false;

  /** 页面实例创建后只调用一次；子类可在这里初始化与页面实例同寿命的资源。 */
  protected onCreate(_context: ViewLifecycleContext): void | Promise<void> {}

  /** 每次挂载/打开调用一次；抛错会由 ViewMgr 统一回滚。 */
  protected onOpen(_context: ViewLifecycleContext): void | Promise<void> {}

  /** 每次关闭调用一次；返回的 Promise 由 ViewMgr 观察，不能阻塞输入租约回收。
   *
   * 页面现有公开 API 也使用 `onClose` 作为按钮回调，因此生命周期实现采用这个不冲突的
   * 内部 hook；若子类没有同名实例属性，仍会兼容调用其自定义 `onClose(context)` 方法。
   */
  protected onCloseLifecycle(_context: ViewLifecycleContext): void | Promise<void> {}

  /** 构造一个新的打开世代。仅 ViewMgr 应调用。 */
  beginLifecycle(generation: number): ViewLifecycleContext {
    if (this.disposed) throw new Error("[View] 已销毁的 View 不能重新打开");
    const previous = this.lifecycle;
    if (previous?.active) {
      // Replacing an active generation is a close as well as an abort.  Keep
      // the hook tied to the old state so a permanent view cannot skip cleanup
      // when it is reopened from an asynchronous transition.
      this.startClose(previous);
    }
    const controller = new AbortController();
    let state!: LifecycleState;
    const context: ViewLifecycleContext = {
      generation,
      signal: controller.signal,
      isActive: () => this.lifecycle === state && state.active && !controller.signal.aborted && !this.disposed,
    };
    state = { generation, controller, context, active: true, closePromise: null };
    this.lifecycle = state;
    markOpened(this);
    return context;
  }

  /** 运行 onCreate；永久页面重挂时不会重复执行。 */
  async runCreate(context: ViewLifecycleContext): Promise<void> {
    if (this.created) {
      this.assertCurrent(context);
      return;
    }
    this.assertCurrent(context);
    // The create hook belongs to the view instance, not to one open
    // generation.  Defer invocation by one microtask before publishing the
    // promise so even a synchronously re-entrant runCreate() shares it.  If
    // the first generation is closed while the hook awaits, a successful hook
    // still marks the instance created; only the stale caller's final
    // assertCurrent() fails, and a permanent remount will not run the hook a
    // second time.
    let attempt = this.createFlight;
    if (!attempt) {
      attempt = Promise.resolve()
        .then(() => this.onCreate(context))
        .then(() => { this.created = true; });
      this.createFlight = attempt;
      // The caller observes the attempt; this defensive handler prevents a
      // superseded generation from creating an unhandled rejection.
      attempt.catch(() => undefined);
    }
    try {
      await attempt;
    } catch (error) {
      // A failed hook can be retried on a later open.  Keep a successful
      // flight forever, even if its original context was superseded.
      if (this.createFlight === attempt && !this.created) this.createFlight = null;
      throw error;
    }
    this.assertCurrent(context);
  }

  /** 运行本次打开 hook。 */
  async runOpen(context: ViewLifecycleContext): Promise<void> {
    this.assertCurrent(context);
    await this.onOpen(context);
    this.assertCurrent(context);
  }

  /**
   * 使本次打开世代失效并运行 onClose。调用幂等；返回 Promise 便于测试/宿主等待，
   * 但关闭路径本身不依赖它完成（输入租约须立即释放）。
   */
  closeLifecycle(): Promise<void> {
    const state = this.lifecycle;
    if (!state) return Promise.resolve();
    return this.startClose(state);
  }

  private startClose(state: LifecycleState): Promise<void> {
    if (state.closePromise) return state.closePromise;

    // Publish the close promise before aborting or invoking user code. Both
    // operations can synchronously re-enter closeLifecycle (for example an
    // AbortSignal listener may call back into the view, or a cleanup hook may
    // defensively call dispose()). Without this placeholder every re-entry
    // would invoke onClose again and can recurse indefinitely.
    let resolveClose!: () => void;
    let rejectClose!: (reason?: unknown) => void;
    const closePromise = new Promise<void>((resolve, reject) => {
      resolveClose = resolve;
      rejectClose = reject;
    });
    state.closePromise = closePromise;
    // Callers are allowed to use synchronous handle.close(); keep a rejection
    // observer attached even when no caller awaits the returned Promise.
    closePromise.catch((e) => console.error("[View] onClose 回调异常", e));

    state.active = false;
    markClosed(this);
    let abortError: unknown = null;
    try { state.controller.abort(); } catch (e) {
      // AbortController implementations normally report listener failures
      // asynchronously, but a host/polyfill may throw synchronously. Continue
      // cleanup and surface the error through the close Promise.
      abortError = e;
    }
    let result: void | Promise<void>;
    try { result = this.invokeCloseHook(state.context); }
    catch (e) {
      rejectClose(e);
      return closePromise;
    }

    // A hook returning closeLifecycle() would otherwise create a promise that
    // waits on itself. Treat that self-reference as an already-completed close;
    // the hook has synchronously run and all future calls are idempotent.
    if (result === closePromise) {
      if (abortError) rejectClose(abortError);
      else resolveClose();
      return closePromise;
    }

    Promise.resolve(result).then(
      () => {
        if (abortError) rejectClose(abortError);
        else resolveClose();
      },
      (error) => rejectClose(error),
    );
    return closePromise;
  }

  /** 当前打开世代（仅供装配层传递给 Logic）。 */
  get lifecycleContext(): ViewLifecycleContext | null {
    return this.lifecycle?.context ?? null;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  private assertCurrent(context: ViewLifecycleContext): void {
    if (this.lifecycle?.context !== context || !context.isActive()) {
      throw new Error("[View] 页面打开世代已失效");
    }
  }

  private invokeCloseHook(context: ViewLifecycleContext): void | Promise<void> {
    // 兼容测试/业务子类直接实现 protected onClose(context)，同时避开页面按钮字段 onClose。
    const own = Object.prototype.hasOwnProperty.call(this, "onClose");
    if (!own) {
      const candidate = (this as unknown as { onClose?: unknown }).onClose;
      if (typeof candidate === "function") {
        return (candidate as (ctx: ViewLifecycleContext) => void | Promise<void>).call(this, context);
      }
    }
    return this.onCloseLifecycle(context);
  }

  /** 事件系统不会 await handler；统一观察同步异常和 Promise rejection。 */
  protected observeAsync(action: () => unknown, label = "event"): void {
    try {
      const result = action();
      if (result && typeof (result as { then?: unknown }).then === "function") {
        Promise.resolve(result).catch((e) => console.error(`[View] ${label} handler rejection`, e));
      }
    } catch (e) {
      console.error(`[View] ${label} handler exception`, e);
    }
  }

  /** ViewMgr 挂载租约回滚用：从父容器摘下但**不销毁**（permanent 页面 close 用）。 */
  abstract unmount(): void;

  /** 在当前父容器内置顶（onlyOne 页面重复 open 时复用置顶）。 */
  abstract bringToFront(): void;

  /**
   * 销毁：先关闭当前世代（幂等），再由子类释放自己的渲染根。
   * 组件树/节点树的释放保持同步，不等待异步 onClose hook。
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // closeLifecycle owns abort/hook idempotence; disposal of the render root
    // remains synchronous and does not wait for an async hook.
    if (this.lifecycle) this.startClose(this.lifecycle);
    this.disposeRoot();
  }

  /** 子类释放自己的渲染根（FGUI 组件树 / Cocos 节点树）；异常自行吞掉并记录。 */
  protected abstract disposeRoot(): void;
}
