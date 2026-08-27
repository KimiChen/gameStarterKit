/**
 * 页面生命周期管理（机械件，docs/CLIENT.md §4）：ViewMgr.open/close 按 viewRegistry 元数据接管
 * ensurePackages / 动态加载 / 分层挂载 / 单例 / 常驻 / 交互输入。业务层 ⛔ 不手工
 * mountFullScreen / ensurePackages / setInputEnabled，⛔ 不直调 view.dispose()——
 * 关闭一律走 handle.close() 或 ViewMgr.close(name)（交互计数/输入恢复挂在关闭路径上，
 * 直调 dispose 会永久泄漏输入捕获）。
 *
 * 分层：GRoot 下按 VIEW_LAYERS 顺序懒建 base/popup/top 三个全屏容器（顺序即 z 序，
 * 尺寸 relation 跟随 GRoot）；GRoot 随场景重载销毁时容器/缓存整体重建。
 * 交互输入：任一 interactive 页在开 → 启用 FGUI 输入（同时挡住背后游戏触摸——
 * fairygui 单 InputProcessor 的现实，见 FguiView.ensureRoot 注释），全部关闭 → 恢复。
 * 在途去重：onlyOne/permanent 页面加载期间的重复 open（双击竞态）合流到同一 Promise。
 */
import { GComponent, GRoot, RelationType } from "db://fairygui-cc/fairygui.mjs";
import { FguiView, type ViewLifecycleContext } from "./FguiView";
import { VIEW_LAYERS, type ViewLayer } from "./layers";
import type { ViewMeta } from "./defineView";
import { VIEW_REGISTRY } from "./viewRegistry";

/** open 的返回句柄：关闭唯一入口（幂等）。 */
export interface ViewHandle {
  readonly view: FguiView;
  /** 本次打开的取消信号与世代；可传给 Area/Notice/Guild 等异步 Logic。 */
  readonly signal: AbortSignal;
  readonly generation: number;
  close(): void;
  /** 在打开事务内运行 setup/render；失败会自动关闭并回滚页面。 */
  run<T>(action: (view: FguiView, context: ViewLifecycleContext) => T | Promise<T>): Promise<T>;
}

interface Entry {
  view: FguiView;
  mounted: boolean;
  meta: ViewMeta;
  handle: ViewHandle;
  /** The mount lease owns both the parent attachment and interactive count. */
  releaseMount: (() => void) | null;
}

/** 在途 open 记录：双击竞态合流 + 在途期间 close 的取消标记（mount 前拦截，防幽灵页面）。 */
interface PendingOpen {
  name: string;
  promise: Promise<ViewHandle>;
  cancelled: boolean;
  readonly controller: AbortController;
  readonly generation: number;
  readonly rootGeneration: number;
  readonly cacheable: boolean;
}

const layerRoots = new Map<ViewLayer, GComponent>();
const cache = new Map<string, Entry>();                 // onlyOne/permanent 单例缓存
const pending = new Map<string, PendingOpen>();          // onlyOne/permanent 在途去重
const pendingAll = new Set<PendingOpen>();               // 所有在途加载（含多实例页，可取消）
let interactiveCount = 0;
let rootGeneration = 0;
let nextGeneration = 0;

/** 打开在途期间被关闭或场景重载时的可判别错误。 */
export class ViewOpenCancelledError extends Error {
  readonly code = "VIEW_OPEN_CANCELLED" as const;
  constructor(name: string) {
    super(`[ViewMgr] 页面打开已取消: ${name}`);
    this.name = "ViewOpenCancelledError";
  }
}

type ViewSetup = (view: FguiView, context: ViewLifecycleContext) => unknown | Promise<unknown>;

function ensureLayers(): void {
  // GRoot 可能随场景重载销毁：容器失效则整体重建（缓存视图同批死亡，计数一并归零）
  const stale = layerRoots.size > 0
    && (layerRoots.size !== VIEW_LAYERS.length
      || [...layerRoots.values()].some((root) => root.node && root.node.isValid === false));
  if (stale) {
    rootGeneration++;
    for (const rec of pendingAll) {
      rec.cancelled = true;
      rec.controller.abort();
    }
    pending.clear();
    for (const entry of cache.values()) {
      entry.mounted = false;
      const release = entry.releaseMount;
      entry.releaseMount = null;
      release?.();
      try { entry.view.dispose(); } catch (e) { console.error("[ViewMgr] 场景重载 dispose 异常", e); }
    }
    for (const root of layerRoots.values()) {
      try { root.removeFromParent(); root.dispose(); } catch (e) {
        console.error("[ViewMgr] 旧层容器释放异常", e);
      }
    }
    layerRoots.clear();
    cache.clear();
    interactiveCount = 0;
    FguiView.setInputEnabled(false);
  }
  if (layerRoots.size === VIEW_LAYERS.length) { return; }
  FguiView.ensureRoot();
  const built: GComponent[] = [];
  try {
    for (const l of VIEW_LAYERS) {
      const c = new GComponent();
      // Track the component before any attach/size/relation call: each of those can
      // throw in a partially initialized Creator scene and must be cleaned up below.
      built.push(c);
      c.node.name = `layer_${l}`;
      GRoot.inst.addChild(c);
      c.setSize(GRoot.inst.width, GRoot.inst.height);
      c.addRelation(GRoot.inst, RelationType.Size);
      layerRoots.set(l, c);
    }
  } catch (e) {
    for (const c of built) {
      try { c.removeFromParent(); c.dispose(); } catch (disposeError) {
        console.error("[ViewMgr] 层容器回滚异常", disposeError);
      }
    }
    layerRoots.clear();
    throw e;
  }
}

/** 挂载并返回可回滚的 lease；任何中途异常都会摘下组件且归还 interactive 租约。 */
function mount(view: FguiView, meta: ViewMeta): () => void {
  ensureLayers();
  FguiView.healRoot(); // 尺寸/置顶自愈：老路径 mountFullScreen 每次挂载都做，这里保持等价
  // A non-cacheable handle may outlive a scene/root reload.  Its release must
  // never decrement the interactive lease belonging to the replacement root.
  const leaseRootGeneration = rootGeneration;
  const parent = layerRoots.get(meta.layer);
  if (!parent) { throw new Error(`[ViewMgr] 未知层级: ${meta.layer}`); }
  let mounted = false;
  let leased = false;
  try {
    if (meta.fullscreen) { view.mountFullScreenTo(parent); } else { view.mountTo(parent); }
    mounted = true;
    if (meta.interactive) {
      interactiveCount++;
      leased = true;
      FguiView.setInputEnabled(true);
    }
    return () => {
      if (leased) {
        leased = false;
        if (leaseRootGeneration === rootGeneration) closeEffects(meta);
      }
      if (mounted) {
        mounted = false;
        try { view.unmount(); } catch (e) { console.error("[ViewMgr] mount lease 回滚异常", e); }
      }
    };
  } catch (e) {
    if (leased) closeEffects(meta);
    try { view.unmount(); } catch (unmountError) {
      console.error("[ViewMgr] mount 失败后的摘除异常", unmountError);
    }
    throw e;
  }
}

function closeEffects(meta: ViewMeta): void {
  if (meta.interactive) {
    interactiveCount = Math.max(0, interactiveCount - 1);
    if (interactiveCount === 0) { FguiView.setInputEnabled(false); }
  }
}

function makeHandle(
  name: string,
  view: FguiView,
  meta: ViewMeta,
  context: ViewLifecycleContext,
  cacheable: boolean,
  releaseMount: (() => void) | null,
): { handle: ViewHandle; setContext(next: ViewLifecycleContext): void } {
  const state = { context, closed: false, releaseMount };
  const handle: ViewHandle = {
    view,
    get signal() { return state.context.signal; },
    get generation() { return state.context.generation; },
    close(): void {
      // permanent 实例可再次打开，句柄本身保持可复用；其它句柄关闭后永久失效。
      if (state.closed && !meta.permanent) return;
      if (cacheable) {
        const entry = cache.get(name);
        // A permanent view gets a fresh handle for every remount.  An old
        // caller may still invoke close() after a newer generation is active;
        // it must not close that newer generation by name.
        if (entry?.handle !== handle) { state.closed = true; return; }
        close(name);
        state.closed = true;
      } else {
        state.closed = true;
        const release = state.releaseMount;
        state.releaseMount = null;
        release?.();
        void view.closeLifecycle().catch((e) => console.error("[ViewMgr] onClose 回调异常", e));
        view.dispose();
      }
    },
    async run<T>(action: (v: FguiView, c: ViewLifecycleContext) => T | Promise<T>): Promise<T> {
      // 捕获启动时的 context：permanent 页面重开会刷新 state.context，旧 setup 不能
      // 在 await 之后误认新世代为自己的，也不能把新世代一并关闭。
      const context = state.context;
      if (state.closed || !context.isActive()) {
        throw new ViewOpenCancelledError(name);
      }
      try {
        const result = await action(view, context);
        if (state.context !== context || !context.isActive()) throw new ViewOpenCancelledError(name);
        return result;
      } catch (e) {
        // setup/render 与 onOpen 使用同一回滚入口；调用方仍收到原始错误。
        if (state.context === context && !state.closed) handle.close();
        throw e;
      }
    },
  };
  return {
    handle,
    setContext(next: ViewLifecycleContext): void {
      state.context = next;
      state.closed = false;
    },
  };
}

function rollbackEntry(name: string, entry: Entry): void {
  if (cache.get(name) !== entry) return;
  if (entry.mounted) {
    entry.mounted = false;
  }
  const release = entry.releaseMount;
  entry.releaseMount = null;
  release?.();
  void entry.view.closeLifecycle().catch((e) => console.error("[ViewMgr] rollback onClose 异常", e));
  if (entry.meta.permanent) {
    // releaseMount already detaches the root; permanent instances remain
    // cached for the next generation.
  } else {
    entry.view.dispose();
    cache.delete(name);
  }
}

function ensurePendingActive(rec: PendingOpen): void {
  if (rec.cancelled || rec.controller.signal.aborted || rec.rootGeneration !== rootGeneration) {
    throw new ViewOpenCancelledError(rec.name);
  }
}

async function open(name: string, setup?: ViewSetup): Promise<ViewHandle> {
  const meta = VIEW_REGISTRY[name];
  if (!meta) { throw new Error(`[ViewMgr] 未注册页面: ${name}（view/viewRegistry.ts 加一条）`); }

  ensureLayers(); // 先做失效检测：场景重载后 cache 里是死视图，不能走复用分支
  const entry = cache.get(name);
  if (entry) {
    if (entry.mounted) {
      entry.view.bringToFront();
      if (setup) await entry.handle.run(setup);
      return entry.handle;
    }
    const context = entry.view.beginLifecycle(++nextGeneration);
    try {
      const releaseMount = mount(entry.view, meta); // permanent 重挂秒开
      entry.releaseMount = releaseMount;
      entry.mounted = true;
      // Every remount receives a fresh handle.  Reusing the original object
      // would let a stale caller close or run setup against this generation.
      const made = makeHandle(name, entry.view, meta, context, true, releaseMount);
      entry.handle = made.handle;
      handleContexts.set(made.handle, made.setContext);
      await entry.view.runOpen(context);
      ensureContextActive(context, name);
      if (setup) await made.handle.run(setup);
      return made.handle;
    } catch (e) {
      // The same permanent Entry can be reopened while an async onOpen/setup is pending;
      // do not roll back the newer lifecycle that replaced this context.
      const ownsLifecycle = entry.view.lifecycleContext === context;
      if (ownsLifecycle) rollbackEntry(name, entry);
      if (!ownsLifecycle || !context.isActive()) throw new ViewOpenCancelledError(name);
      throw e;
    }
  }

  const cacheable = meta.onlyOne || meta.permanent;
  if (cacheable) {
    const inflight = pending.get(name);
    if (inflight && !inflight.cancelled) {
      return inflight.promise;    // 双击竞态：加载期间的重复 open 合流
    }
  }

  const rec: PendingOpen = {
    name,
    promise: null as unknown as Promise<ViewHandle>,
    cancelled: false,
    controller: new AbortController(),
    generation: ++nextGeneration,
    rootGeneration,
    cacheable,
  };
  pendingAll.add(rec);
  const p = (async (): Promise<ViewHandle> => {
    let view: FguiView | null = null;
    let lease: (() => void) | null = null;
    let entry: Entry | null = null;
    let context: ViewLifecycleContext | null = null;
    let cancelLifecycle: (() => void) | null = null;
    try {
      if (meta.sharedPkgs && meta.sharedPkgs.length > 0) {
        // Pass the pending open's signal through the package boundary. FairyGUI
        // cannot abort its underlying request, but this releases this waiter
        // immediately when close() or a root/scene generation change occurs.
        ensurePendingActive(rec);
        await FguiView.ensurePackages([...meta.sharedPkgs], { signal: rec.controller.signal });
      }
      ensurePendingActive(rec);
      // load 闭包 = 铁律 10 的动态 import 边界，也是将来分包的加载点；构造器真实类型在此收敛
      const ctor = (await meta.load()) as new (root: GComponent) => FguiView;
      ensurePendingActive(rec);
      view = await FguiView.create(
        ctor,
        `ui/${meta.contract.pkg}`,
        meta.contract.pkg,
        meta.contract.comp,
        { signal: rec.controller.signal },
      );
      ensurePendingActive(rec);
      context = view.beginLifecycle(rec.generation);
      // close(name)/root 重载可能发生在 setup 或 onOpen 等后续 await 期间；把 pending
      // cancellation 直接桥接到 View context，让迟到逻辑立刻看到 aborted。
      cancelLifecycle = () => {
        void view!.closeLifecycle().catch((e) => console.error("[ViewMgr] 取消打开 onClose 异常", e));
      };
      rec.controller.signal.addEventListener("abort", cancelLifecycle, { once: true });
      await view.runCreate(context);
      ensurePendingActive(rec);
      lease = mount(view, meta);
      const made = makeHandle(name, view, meta, context, cacheable, lease);
      handleContexts.set(made.handle, made.setContext);
      if (cacheable) {
        entry = { view, mounted: true, meta, handle: made.handle, releaseMount: lease };
        cache.set(name, entry);
        // The cache entry now owns the mount lease.  A failed/superseded open
        // will release it through rollbackEntry exactly once.
        lease = null;
      }
      await view.runOpen(context);
      ensureContextActive(context, name);
      ensurePendingActive(rec);
      if (setup) await made.handle.run(setup);
      ensurePendingActive(rec);
      return made.handle;
    } catch (e) {
      // permanent 实例可能在本次 await 期间被 close 后重开；只有仍属于本次
      // context 的实例才允许回滚，避免迟到的旧 open 拆掉新世代页面。
      const ownsLifecycle = !context || view?.lifecycleContext === context;
      if (entry && ownsLifecycle) rollbackEntry(name, entry);
      else if (view && !view.isDisposed && ownsLifecycle) {
        lease?.();
        void view.closeLifecycle().catch((closeError) => console.error("[ViewMgr] open 失败 onClose 异常", closeError));
        view.dispose();
      }
      if (rec.cancelled || rec.controller.signal.aborted || rec.rootGeneration !== rootGeneration) {
        throw new ViewOpenCancelledError(name);
      }
      throw e;
    } finally {
      if (cancelLifecycle) {
        rec.controller.signal.removeEventListener("abort", cancelLifecycle);
        cancelLifecycle = null;
      }
      pendingAll.delete(rec);
      if (pending.get(name) === rec) pending.delete(name);
    }
  })();
  rec.promise = p;
  if (cacheable) { pending.set(name, rec); }
  return p;
}

/** 关闭页面（onlyOne/permanent 按名；多实例页用 open 返回的 handle.close()）。幂等；
 *  在途中的 open 则标记取消（mount 前拦截）。 */
function close(name: string): void {
  const inflight = pending.get(name);
  if (inflight) {
    inflight.cancelled = true;
    inflight.controller.abort();
  }
  for (const rec of pendingAll) {
    if (rec.name === name) {
      rec.cancelled = true;
      rec.controller.abort();
    }
  }
  const entry = cache.get(name);
  if (!entry || !entry.mounted) { return; }
  entry.mounted = false;
  const release = entry.releaseMount;
  entry.releaseMount = null;
  release?.();
  void entry.view.closeLifecycle().catch((e) => console.error("[ViewMgr] onClose 回调异常", e));
  if (entry.meta.permanent) {
    // releaseMount detaches the permanent view without destroying it.
  } else {
    entry.view.dispose();
    cache.delete(name);
  }
}

/** 页面是否处于打开状态（onlyOne/permanent 缓存范围内）。 */
function isOpen(name: string): boolean {
  return cache.get(name)?.mounted === true;
}

function ensureContextActive(context: ViewLifecycleContext, name: string): void {
  if (!context.isActive()) throw new ViewOpenCancelledError(name);
}

/** handle → context 刷新器；仅用于 permanent 页面重挂，避免扩展公开状态对象。 */
const handleContexts = new WeakMap<ViewHandle, (context: ViewLifecycleContext) => void>();

export const ViewMgr = { open, close, isOpen } as const;
